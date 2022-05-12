import {Debug,Warning} from './PopWebApiCore.js'
import DirtyBuffer from './DirtyBuffer.js'
import {GetRectsFromIndexes} from './Math.js'
import {CreatePromise} from './PromiseQueue.js'


//	gr: I forget what browser this was for! add comments when we know!
//	ImageBitmap should also be supported
//	https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
const WebApi_HtmlImageElement = window.hasOwnProperty('HTMLImageElement') ? window['HTMLImageElement'] : null;
const WebApi_HtmlCanvasElement = window.hasOwnProperty('HTMLCanvasElement') ? window['HTMLCanvasElement'] : null;
const WebApi_HtmlVideoElement = window.hasOwnProperty('HTMLVideoElement') ? window['HTMLVideoElement'] : null;

//	webcodec output
const WebApi_HtmlVideoFrame = window.hasOwnProperty('VideoFrame') ? window['VideoFrame'] : null;


//	in c++ this is SoyPixelsFormat namespace
export function GetChannelsFromPixelFormat(PixelFormat)
{
	switch(PixelFormat)
	{
		case 'Greyscale':	return 1;
		case 'RGBA':		return 4;
		case 'RGB':			return 3;
		case 'Float1':		return 1;
		case 'Float2':		return 2;
		case 'Float3':		return 3;
		case 'Float4':		return 4;
		case 'ChromaU':		return 1;
		case 'ChromaV':		return 1;
		case 'Depth16mm':	return 2;	//	RG
	}
	throw `unhandled GetChannelsFromPixelFormat(${PixelFormat})`;
}

export function IsFloatFormat(Format)
{
	switch(Format)
	{
		case 'Float1':
		case 'Float2':
		case 'Float3':
		case 'Float4':
			return true;
		default:
			return false;
	}
}

export function GetFormatElementSize(PixelFormat)
{
	switch(PixelFormat)
	{
		//	bytes
		case 'ChromaU':
		case 'ChromaV':
		case 'Greyscale':
		case 'RGBA':
		case 'RGB':
		case 'Depth16mm':	//	two channel x 1byte
			return 1;
			
		case 'Float1':
		case 'Float2':
		case 'Float3':
		case 'Float4':
			return 4;
	}
	throw `unhandled GetFormatElementSize(${PixelFormat})`;
}


function IsHtmlElementPixels(Pixels)
{
	if ( !Pixels )
		return false;
	
	if ( Pixels.constructor == WebApi_HtmlImageElement )
		return true;
		
	if ( Pixels.constructor == WebApi_HtmlCanvasElement )
		return true;
		
	if ( Pixels.constructor == WebApi_HtmlVideoElement )
		return true;
		
	if ( Pixels.constructor == WebApi_HtmlVideoFrame )
		return true;
		
	return false;
}

function PixelFormatToOpenglFormat(OpenglContext,PixelFormat)
{
	const gl = OpenglContext;
	//	todo: check float support
	//	OES_texture_float extension
	//	or webgl2
	//Pop.Debug( 'OpenglContext.FLOAT', gl.FLOAT );
	
	if ( OpenglContext.FloatTextureSupported )
	{
		if ( gl instanceof WebGL2RenderingContext )
		{
			switch ( PixelFormat )
			{
				case 'Float1':		return [ gl.RED,		gl.FLOAT];
				case 'Float2':		return [ gl.RG32F,		gl.FLOAT];
				case 'Float3':		return [ gl.RGB32F,		gl.FLOAT];
				//case 'Float4':		return [ gl.RGBA32F,	gl.FLOAT];
				case 'Float4':		return [ gl.RGBA,	gl.FLOAT];
			}
		}
		else
		{
			switch ( PixelFormat )
			{
				case 'Float1':		return [ gl.RED,	gl.FLOAT];
				case 'Float2':		return [ gl.LUMINANCE_ALPHA,	gl.FLOAT];
				case 'Float3':		return [ gl.RGB,		gl.FLOAT];
				case 'Float4':		return [ gl.RGBA,		gl.FLOAT];
			}
		}
	}
	
	switch ( PixelFormat )
	{
		case 'R16':			return [ gl.LUMINANCE,		gl.UNSIGNED_SHORT];
		case 'Luma':
		case 'ChromaU':
		case 'ChromaV':
		case 'Greyscale':	return [ gl.LUMINANCE,	gl.UNSIGNED_BYTE];
		case 'RGBA':		return [ gl.RGBA,		gl.UNSIGNED_BYTE];
		case 'RGB':			return [ gl.RGB,		gl.UNSIGNED_BYTE];
		case 'RGBA32':		return [ gl.RGBA,		gl.UNSIGNED_INT_24_8];
	}
	throw "PixelFormatToOpenglFormat: Unhandled pixel format " + PixelFormat;
}


function GetTextureFormatPixelByteSize(OpenglContext,Format,Type)
{
	const gl = OpenglContext;
	let Channels = 0;
	
	//	overriding cases (I think)
	switch ( Format )
	{
		case gl.R32F:		return 1 * 4;
		case gl.RG32F:		return 2 * 4;
		case gl.RGB32F:		return 3 * 4;
		case gl.RGBA32F:	return 4 * 4;

		case gl.DEPTH_COMPONENT:	return 1 * 2;
		case gl.DEPTH_COMPONENT16:	return 1 * 2;
		case gl.DEPTH_COMPONENT24:	return 1 * 3;
		case gl.DEPTH_COMPONENT32F:	return 1 * 4;

		case gl.LUMINANCE:	Channels = 1;	break;
		case gl.LUMINANCE_ALPHA:	Channels = 2;	break;
		case gl.RGB:		Channels = 3;	break;
		case gl.RGBA:		Channels = 4;	break;

		default:			throw "Unhandled Format GetTextureFormatPixelByteSize(" + Format + "," + Type + ")";
	}
	
	switch ( Type )
	{
		case gl.UNSIGNED_SHORT:		return Channels * 2;
		case gl.UNSIGNED_BYTE:		return Channels * 1;
		case gl.UNSIGNED_INT:		return Channels * 4;
		case gl.UNSIGNED_INT_24_8:	return Channels * 4;
		case gl.FLOAT:				return Channels * 4;
		default:				throw "Unhandled Type GetTextureFormatPixelByteSize(" + Format + "," + Type + ")";
	}
}


function GetPixelsMetaFromHtmlImageElement(Img)
{
	const Meta = {};
	Meta.Width = Img.videoWidth || Img.width || Img.displayWidth;
	Meta.Height = Img.videoHeight || Img.height || Img.displayHeight;
	Meta.Format = 'RGBA';
	return Meta;
}

function GetPixelsFromHtmlImageElement(Img)
{
	//	html5 image
	//if ( Img.constructor == WebApi_HtmlImageElement )
	{
		//	gr: is this really the best way :/
		const Canvas = document.createElement('canvas');
		const Context = Canvas.getContext('2d');
		const ImgMeta = GetPixelsMetaFromHtmlImageElement(Img);
		const Width = ImgMeta.Width;
		const Height = ImgMeta.Height;
		Canvas.width = Width;
		Canvas.height = Height;
		Context.drawImage( Img, 0, 0 );
		const ImageData = Context.getImageData(0, 0, Width, Height);
		const Buffer = ImageData.data;
		
		const Pixels = {};
		Pixels.Width = Width;
		Pixels.Height = Height;
		Pixels.Buffer = Buffer;
		//	gr: I checked pixels manually, canvas is always RGBA [in chrome]
		Pixels.Format = 'RGBA';
		
		//	destroy canvas (safari suggests its hanging around)
		Canvas.width = 0;
		Canvas.height = 0;
		//delete Canvas;	//	not allowed in strict mode
		//Canvas = null;
		return Pixels;
	}
}

export async function PngBytesToImage(PngBytes)
{
	//	re-using browser's loader
	let ImageUrl;

	//	allow DataUrl strings
	if ( typeof PngBytes == typeof '' )
	{
		//	todo: check data url prefix
		ImageUrl = PngBytes;
	}
	else
	{
		const PngBlob = new Blob( [ PngBytes ], { type: "image/png" } );
		ImageUrl = URL.createObjectURL( PngBlob );
	}
	
	//	gr: this was LoadFileAsImageAsync() but cyclic include
	//const Image = await LoadFileAsImageAsync(ImageUrl);
	function LoadHtmlImageAsync()
	{
		let Promise = CreatePromise();
		const HtmlImage = new Image();
		HtmlImage.onload = function ()
		{
			Promise.Resolve(HtmlImage);
		};
		HtmlImage.addEventListener('load', HtmlImage.onload, false);
		HtmlImage.onerror = function (Error)
		{
			Promise.Reject(Error);
		}
		HtmlImage.crossOrigin = "anonymous";
		//  trigger load
		HtmlImage.src = '';
		HtmlImage.src = ImageUrl;
		return Promise;
	}

	//	the API expects to return an image, so wait for the load,
	//	then make an image. This change will have broken the Pop.Image(Filename)
	//	constructor as it uses the asset cache, which is only set after this
	const HtmlImage = await LoadHtmlImageAsync();
	
	//	add a free() function to release this when done with it
	HtmlImage.Free = function()
	{
		URL.revokeObjectURL(ImageUrl);
	}
	
	const OutputImage = new PopImage(HtmlImage);
	return OutputImage;
}


export async function PngBytesToPixels(PngBytes)
{
	const Image = await PngBytesToImage(PngBytes);
	const Pixels = GetPixelsFromHtmlImageElement(Image.Pixels);
	return Pixels;
}


Math.Abs3 = function(xyz)
{
	const AbsXyz = xyz.map( Math.abs );
	return AbsXyz;
}

//	from shaders
function GetScaledOutput(Position,ScalarMinMax)
{
	//	get the scalar, but remember, we are normalising to -0.5,,,0.5
	//	so it needs to double
	//	and then its still 0...1 so we need to multiply by an arbritry number I guess
	//	or 1/scalar
	const ScalarMin = ScalarMinMax[0];
	const ScalarMax = ScalarMinMax[1];
	const PosAbs = Math.Abs3(Position);
	const Big = Math.max( ScalarMin, Math.max( PosAbs[0], Math.max( PosAbs[1], PosAbs[2] ) ) );
	const Scalar = Math.Range( ScalarMin, ScalarMax, Big );
	
	const x = ((Position[0] / Big) / 2.0) + 0.5;
	const y = ((Position[1] / Big) / 2.0) + 0.5;
	const z = ((Position[2] / Big) / 2.0) + 0.5;
	
	return [x,y,z,Scalar];
}

function Float3ToRgbHomogenous(FloatArray)
{
	const ScalarMinMax = [0,1];
	const Length = FloatArray.length / 3;
	const IntArray = new Uint8Array( Length * 4 );
	for ( let i=0;	i<FloatArray.length;	i+=3 )
	{
		const xyz = FloatArray.slice( i, i+3 );
		let xyzw = GetScaledOutput( xyz, ScalarMinMax );
		xyzw = xyzw.map( Float => Math.clamp( 0, 255, Float * 255 ) );
		const IntIndex = (i/3) * 4;
		IntArray[IntIndex+0] = xyzw[0];
		IntArray[IntIndex+1] = xyzw[1];
		IntArray[IntIndex+2] = xyzw[2];
		IntArray[IntIndex+3] = xyzw[3];
	}
	return IntArray;
}

function Float4ToRgba(FloatArray)
{
	//	flat conversion
	const IntArray = new Uint8Array( FloatArray.length );
	for ( let i=0;	i<IntArray.length;	i++ )
	{
		const Float = FloatArray[i];
		const Int = Math.clamp( 0, 255, Float * 255 );
		IntArray[i] = Int;
	}
	return IntArray;
}

function FloatToInt8Pixels(FloatArray,FloatFormat,Width,Height)
{
	if ( FloatFormat == 'Float3' )
	{
		const Output = {};
		Output.Pixels = Float3ToRgbHomogenous(FloatArray);
		Output.PixelsFormat = 'RGBA';
		return Output;
	}

	if ( FloatFormat == 'Float4' )
	{
		const Output = {};
		Output.Pixels = Float4ToRgba(FloatArray);
		Output.PixelsFormat = 'RGBA';
		return Output;
	}
	
	throw "Unhandled float->8bit format " + FloatFormat;
}


export default class PopImage
{
	constructor(Filename)
	{
		this.Freed = false;
		this.Name = (typeof Filename == 'string') ? Filename : "Pop.Image";
		this.Size = [undefined,undefined];
		this.OpenglTexture = null;
		this.OpenglTextureContextVersion = null;
		this.OpenglVersion = undefined;
		this.Pixels = null;
		this.PixelsFormat = null;
		this.PixelsVersion = undefined;
		this.LinearFilter = false;
		
		//	load file
		if ( typeof Filename == 'string' && Filename.includes('.') )
		{
			const ImageFile = Pop.GetCachedAsset(Filename);
			
			//	gr: this conversion should be in WritePixels()
			if ( ImageFile.constructor == WebApi_HtmlImageElement )
			{
				const Pixels = GetPixelsFromHtmlImageElement(ImageFile);
				this.WritePixels( Pixels.Width, Pixels.Height, Pixels.Buffer, Pixels.Format );
			}
			else if ( IsObjectInstanceOf(ImageFile,Pop.Image) )
			{
				console.warn(`Constructing Pop.Image(${Filename}) from filename results in a copy. Can now just async load the asset straight into a Pop.Image`);
				this.Copy(ImageFile);
			}
			else
			{
				const PixelFormat = undefined;
				this.WritePixels( ImageFile.width, ImageFile.height, Image, PixelFormat );
			}
		}
		else if ( Filename && IsHtmlElementPixels(Filename) )
		{
			const HtmlImage = Filename;
			//	gr: this conversion should be in WritePixels()
			//const Pixels = GetPixelsFromHtmlImageElement(HtmlImage);
			//this.WritePixels(Pixels.Width,Pixels.Height,Pixels.Buffer,Pixels.Format);
			const PixelsMeta = GetPixelsMetaFromHtmlImageElement(HtmlImage);
			const Pixels = HtmlImage;
			this.WritePixels(PixelsMeta.Width,PixelsMeta.Height,Pixels,PixelsMeta.Format);
		}
		else if ( Array.isArray( Filename ) )
		{
			//	initialise size...
			// Pop.Debug("Init image with size", Filename);
			const Size = arguments[0];
			const PixelFormat = arguments[1] || 'RGBA';
			const Width = Size[0];
			const Height = Size[1];
			let PixelData = new Array(Width * Height * 4);
			PixelData.fill(0);
			const Pixels = IsFloatFormat(PixelFormat) ? new Float32Array(PixelData) : new Uint8Array(PixelData);
			this.WritePixels( Width, Height, Pixels, PixelFormat );
		}
		else if ( typeof Filename == 'string' )
		{
			//	just name
		}
		else if ( Filename !== undefined )
		{
			throw "Unhandled Pop.Image constructor; " + [...arguments];
		}
	}
	
	SetLinearFilter(Linear)
	{
		this.LinearFilter = Linear;
	}
	
	get width()		{	return this.GetWidth();	}
	get Width()		{	return this.GetWidth();	}
	get height()	{	return this.GetHeight();	}
	get Height()	{	return this.GetHeight();	}

	GetWidth()
	{
		return this.Size[0];
	}
	
	GetHeight()
	{
		return this.Size[1];
	}

	GetFormat()
	{
		return this.PixelsFormat;
	}
	
	GetChannels()
	{
		return GetChannelsFromPixelFormat(this.PixelsFormat);
	}
	
	SetFormat(NewFormat)
	{
		if ( this.PixelsFormat == NewFormat )
			return;
		throw `Todo: Pixel format conversion from ${this.PixelsFormat} to ${NewFormat}`;
	}
	
	async GetAsHtmlImage(Scale=1)
	{
		const ImageElement = document.createElement('img');
		const ImageLoaded = CreatePromise();
		ImageElement.onload = (x) => ImageLoaded.Resolve();
		ImageElement.onerror = (e) => ImageLoaded.Reject(e);
		ImageElement.src = await this.GetDataUrl(Scale);
		await ImageLoaded;
		return ImageElement;
	}

	async GetAsHtmlImageData()
	{
		const Width = this.GetWidth();
		const Height = this.GetHeight();
		let Pixels = this.GetPixelBuffer();
		
		//	convert to rgba
		const Channels = this.GetChannels();
		if ( Channels != 4 )
		{
			const NewPixels = new Float32Array( Width * Height * 4 );
			for ( let p=0;	p<Pixels.length;	p++ )
			{
				let np = p*4;
				NewPixels[np+0] = Pixels[p];
				NewPixels[np+1] = Pixels[p];
				NewPixels[np+2] = Pixels[p];
				NewPixels[np+3] = 1;
			}
			Pixels = NewPixels;
		}
		
		//	eek slow/bad conversion
		if ( Pixels instanceof Float32Array )
			Pixels = Pixels.map( x => x*255 );
		//	force into rgba
		Pixels = new Uint8ClampedArray(Pixels);
		const Img = new ImageData(Pixels,Width,Height);
		return Img;
	}


	async GetAsHtmlCanvas(Scale=1)
	{
		const Img = await this.GetAsHtmlImageData();
		
		const Canvas = document.createElement('canvas');
		const Context = Canvas.getContext('2d');
		const Width = this.GetWidth();
		const Height = this.GetHeight();
		Canvas.width = Math.floor(Width * Scale);
		Canvas.height = Math.floor(Height * Scale);
	
		if ( Scale == 1 )
		{
			Context.putImageData(Img,0,0);
		}
		else
		{
			//	Context.drawImage(Img,0,0,Canvas.width,Canvas.height);
			const Bitmap = await createImageBitmap(Img);
			Context.drawImage(Bitmap,0,0,Canvas.width,Canvas.height);
		}
		
		//	make a Free() function
		Canvas.Free = function()
		{
			//	destroy canvas (safari suggests its hanging around)
			//	this frees up canvas memory
			Canvas.width = 0;
			Canvas.height = 0;
			//delete Canvas;	//	not allowed in strict mode
		};
		return Canvas;
	}

	async GetDataUrl(Scale=1)
	{
		const Canvas = await this.GetAsHtmlCanvas(Scale);
		const data = Canvas.toDataURL("image/png");
		Canvas.Free();
		return data;
	}

	GetPngData()
	{
		let data = this.GetDataUrl();
		// Remove meta data
		data = data.slice(22)
		data = Uint8Array.from(atob(data), c => c.charCodeAt(0))
		
		return data;
	}
	
	GetPixelBuffer()
	{
		const LatestVersion = this.GetLatestVersion();
		const PixelsVersion = this.PixelsVersion;
		
		if ( LatestVersion != PixelsVersion )
			throw `GetPixelBuffer() with out of date pixel version(${PixelsVersion}) vs latest ${LatestVersion}`;
		
		if (!this.Pixels)
			return this.Pixels;

		//	extract pixels from object
		if ( IsHtmlElementPixels(this.Pixels) )
		{
			const NewPixels = GetPixelsFromHtmlImageElement(this.Pixels);
			//	gr: we should replace this.Pixels here, but pixelversion stays the same (texture shouldn't change)
			//		if this is a problem somewhere, just return the pixel buffer, but note that it's expensive!
			//		the native api keeps an extra member for different pixel types (eg. this.HtmlPixels for image/canvas,
			//		like how we have this.Texture & this.Pixels)
			this.Pixels = NewPixels.Buffer;
			//throw `GetPixelBuffer() is Canvas element, need to read pixels`;
		}
						  
		return this.Pixels;
	}
	
	GetLatestVersion()
	{
		let Version = 0;
		Version = Math.max( Version, this.PixelsVersion || 0 );
		Version = Math.max( Version, this.OpenglVersion || 0 );
		return Version;
	}
	
	//	ResolveHtmlFormatNow will extract rgba so resource can be freed
	WritePixels(Width,Height,Pixels,Format,ResolveHtmlFormatNow=false)
	{
		if ( !Number.isInteger(Width) || !Number.isInteger(Height) )
			throw `Trying to write non-integers for width(${Width})/height(${Height}) of image`;

		if ( IsHtmlElementPixels(Pixels) )
		{
			const Meta = GetPixelsMetaFromHtmlImageElement(Pixels);
			Width = Meta.Width;
			Height = Meta.Height;
			Format = Meta.Format;
			
			if ( ResolveHtmlFormatNow )
			{
				const Data = GetPixelsFromHtmlImageElement(Pixels);
				Pixels = Data.Buffer;
				Width = Data.Width;
				Height = Data.Height;
				Format = Data.Format;
			}
		}
		
		this.Size = [Width,Height];
		
		//	in case old data needs to be freed, delete before re-assigning
		let NewTimestamp = Pixels.timestamp;
		let OldTimestamp = this.Pixels ? this.Pixels.timestamp : null;
		//console.log(`texture ${OldTimestamp}->${NewTimestamp}`);
		//if ( NewTimestamp === OldTimestamp )
		if ( this.Pixels == Pixels )
		{
			//console.warn(`Setting pixels to self?? ${this.Pixels}==${Pixels}?${this.Pixels==Pixels}`);
		}
		else
		{
			this.DeletePixels();
		}
		this.Pixels = Pixels;
		this.PixelsFormat = Format;
		this.PixelsVersion = this.GetLatestVersion()+1;
		
		//	here might be a good place to
		//	make a thread that auto updates if the pixels are a video
	}
	
	Clear()
	{
		//	this is getting convuluted, so maybe the API need to change (C++ side too)
		this.DeleteOpenglTexture( this.OpenglOwnerContext );
		this.DeletePixels();
		
		//	flag for anything that wants to know if a user tried to delete it
		this.Freed = true;
	}
	
	DeletePixels()
	{
		//	auto cleanup any html elements - this may want to be somewhere else
		//	.close is for decoded video frames
		if ( this.Pixels && this.Pixels.Free )
		{
			this.Pixels.ClosedByPopImage = this.Pixels.timestamp;
			this.Pixels.Free();
			this.Pixels = null;
		}
		if ( this.Pixels && this.Pixels.close )
		{
			this.Pixels.ClosedByPopImage = this.Pixels.timestamp;
			this.Pixels.close();
			this.Pixels = null;
		}
		
		this.PixelsVersion = null;
		this.Pixels = null;
		this.PixelsFormat = null;
	}
	
	GetOpenglTexture(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		this.UpdateTexturePixels( RenderContext );

		return this.OpenglTexture;
	}
	
	DeleteOpenglTexture(RenderContext)
	{
		if ( this.OpenglTexture == null )
			return;
		
		if ( !RenderContext )
			RenderContext = this.OpenglOwnerContext;
		
		try
		{
			const gl = RenderContext.GetGlContext();
			//	actually delete
			gl.deleteTexture( this.OpenglTexture );

			this.OpenglVersion = null;
			this.OpenglTexture = null;
			RenderContext.OnDeletedTexture( this );
			this.OpenglOwnerContext = null;
			this.OpenglByteSize = null;
		}
		catch(e)
		{
			Pop.Debug("Error deleteing opengl texture",e);
		}
	}
	
	OnOpenglRenderedTo()
	{
		const LatestVersion = this.GetLatestVersion();
		this.OpenglVersion = LatestVersion+1;
	}
	
	UpdateTexturePixels(RenderContext)
	{
		//	texture is from an old context
		if ( this.OpenglTextureContextVersion !== RenderContext.ContextVersion )
		{
			this.DeleteOpenglTexture( RenderContext );
		}
		
		//	up to date
		if ( this.OpenglVersion == this.GetLatestVersion() )
			return;
		/*
		if ( !this.Pixels )
			throw "Trying to create opengl texture, with no pixels";
		*/
		//Pop.Debug("Updating opengl texture pixels " + this.Name);
		
		//	update from pixels
		const gl = RenderContext.GetGlContext();
		
		//	if true, we cannot do sub-image updates
		let NewTexture = false;
		
		if ( !this.OpenglTexture )
		{
			//	create texture
			this.OpenglTexture = gl.createTexture();
			this.OpenglVersion = undefined;
			this.OpenglTextureContextVersion = RenderContext.ContextVersion;
			this.OpenglOwnerContext = RenderContext;
			NewTexture = true;
		}
		const Texture = this.OpenglTexture;
		
		//	set a new texture slot
		const TextureIndex = RenderContext.AllocTextureIndex(this);
		let GlTextureNames = [ gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3, gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE6, gl.TEXTURE7 ];
		gl.activeTexture( GlTextureNames[TextureIndex] );

		gl.bindTexture(gl.TEXTURE_2D, Texture );
		const MipLevel = 0;
		const Border = 0;
		let InternalFormat = gl.RGBA;
		const Width = this.GetWidth();
		const Height = this.GetHeight();


		//	convert pixels
		//	gr: ideally, we don't mess with original pixels. Refactor this so there's a more low level
		//		"do the write"
		
		//	dont support float, convert
		if ( !this.Pixels )
		{
		}
		else if ( this.Pixels instanceof Float32Array && !RenderContext.FloatTextureSupported )
		{
			Debug("Float texture not supported, converting to 8bit");
			//	for now, convert to 8bit
			const NewPixels = FloatToInt8Pixels( this.Pixels, this.PixelsFormat, Width, Height );
			this.Pixels = NewPixels.Pixels;
			this.PixelsFormat = NewPixels.PixelsFormat;
			
			
			/*
			if ( RenderContext.Int32TextureSupported )
			{
				Pop.Debug("Convert float to uint32");
				const Pixels32 = new Uint32Array( this.Pixels );
				this.Pixels = Pixels32;
				this.PixelsFormat = "RGBA32";
			}
			else
			{
				throw "Float texture not supported, and no backup";
			}
			 */
		}
		
		let PixelData = this.Pixels;
		//	array of [First,Last] element-indexes for sub-image updates
		let Changes = [];
		
		//	sub-image updates with DirtyBuffer
		//	todo: version to sync
		if ( PixelData instanceof DirtyBuffer )
		{
			//	if new texture, we update all pixels.
			if ( !NewTexture )
			{
				Changes = PixelData.PopChanges();
				//	current setup means we need to do WritePixels() with same buffer, when we 
				//	want new pixels, so we (shouldnt) reach here if there are no changes....
				if ( !Changes.length )
					console.warn(`Updating ${this.Name} with dirty buffer, but no changes`);
				//else
				//	console.warn(`Updating ${this.Name} with dirty buffer, x${Changes.length} changes`);
			}
			PixelData = PixelData.Data;
		}
		
		if ( !PixelData )
		{
		}
		else if ( IsHtmlElementPixels(PixelData) )
		{
			//Pop.Debug("Image from Image",this.PixelsFormat);
			const SourceFormat = gl.RGBA;
			const SourceType = gl.UNSIGNED_BYTE;
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, SourceFormat, SourceType, PixelData );
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * PixelData.width * PixelData.height;
			if ( isNaN(this.OpenglByteSize) )
			{
				//Warning(`Nan size: ${this.OpenglByteSize}`);
				this.OpenglByteSize=0;
			}
		}
		else if ( PixelData instanceof Uint8Array || PixelData instanceof Uint8ClampedArray )
		{
			if ( PixelData instanceof Uint8ClampedArray )
				PixelData = new Uint8Array(PixelData);
			
			//Pop.Debug("Image from Uint8Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			let SourceFormat = SourceFormatTypes[0];
			const SourceType = gl.UNSIGNED_BYTE;//SourceFormatTypes[1];
			
			//	correction when in webgl2
			if ( this.PixelsFormat == 'Float4' )	SourceFormat = gl.RGBA;
			if ( this.PixelsFormat == 'Float3' )	SourceFormat = gl.RGB;
			if ( this.PixelsFormat == 'Float2' )	SourceFormat = gl.LUMINANCE_ALPHA;
			if ( this.PixelsFormat == 'Float1' )	SourceFormat = gl.LUMINANCE;

			InternalFormat = SourceFormatTypes[0];
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, PixelData );
			
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
			if ( isNaN(this.OpenglByteSize) )
			{
				Warning(`Nan size: ${this.OpenglByteSize}`);
				this.OpenglByteSize=0;
			}
		}
		else if ( PixelData instanceof Uint16Array )
		{
			Debug("Image from Uint16Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			
			/*	gr: temp bodge for depth
			
			let SourceFormat = SourceFormatTypes[0];
			const SourceType = SourceFormatTypes[1];
			InternalFormat = SourceFormat;
			
			//	gr: may want this on everything but 16 bit x luminance doesnt align to 4 components
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, this.Pixels );
			*/
			//const InternalFormat = gl.DEPTH_COMPONENT24;
			const InternalFormat = gl.DEPTH_COMPONENT;
			const SourceFormat = gl.DEPTH_COMPONENT;
			const SourceType = gl.UNSIGNED_INT;
			const Pixels = null;
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, Pixels );
			
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
			if ( isNaN(this.OpenglByteSize) )
			{
				Warning(`Nan size: ${this.OpenglByteSize}`);
				this.OpenglByteSize=0;
			}
		}
		else if ( PixelData instanceof Float32Array )
		{
			//Debug("Image from Float32Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			let SourceFormat = SourceFormatTypes[0];
			const SourceType = gl.FLOAT;//SourceFormatTypes[1];
			InternalFormat = SourceFormat;	//	gr: float3 RGB needs RGB internal
			
			//	webgl2 correction
			//if ( gl instanceof WebGL2RenderingContext )
			if ( gl.RGBA32F !== undefined )
			{
				if ( this.PixelsFormat == 'Float4' )	InternalFormat = gl.RGBA32F;
				//if ( this.PixelsFormat == 'Float3' )	InternalFormat = gl.RGB;
				if ( this.PixelsFormat == 'Float2' )	InternalFormat = gl.RG32F;
				if ( this.PixelsFormat == 'Float1' )	InternalFormat = gl.R32F;
			}
			
			//	In WebGL 1, this*FORMAT  must be the same as internalformat
			if ( Changes.length )
			{
				//	sub image updates
				for ( let [StartIndex,EndIndex] of Changes )
				{
					//	can only do partial updates via subimage, so we need to turn index ranges into rects
					//	then try and merge
					const Channels = this.GetChannels();
					const Rects = GetRectsFromIndexes(StartIndex,EndIndex,Width,Channels);
					
					//	todo: merge rects with above if possible, but ideally dirtybuffer has already squashed changes
					for ( let Rect of Rects )
					{
						const SubDataValues = PixelData.subarray( Rect.StartIndex, Rect.EndIndex+1 );
						gl.texSubImage2D( gl.TEXTURE_2D, MipLevel, Rect.x, Rect.y, Rect.w, Rect.h, SourceFormat, SourceType, SubDataValues );
					}
				}
			}
			else
			{
				gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, PixelData );
			}

			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
			if ( isNaN(this.OpenglByteSize) )
			{
				Warning(`Nan size: ${this.OpenglByteSize}`);
				this.OpenglByteSize=0;
			}
		}
		else if ( PixelData instanceof Uint32Array )
		{
			//	assume 32bit RGBA
			const SourceFormat = gl.RGBA;
			const SourceType = gl.UNSIGNED_INT;
			const InternalFormat = gl.RGBA32UI;
			
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, PixelData );
			
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
			if ( isNaN(this.OpenglByteSize) )
			{
				Warning(`Nan size: ${this.OpenglByteSize}`);
				this.OpenglByteSize=0;
			}
		}
		else
		{
			const Constructor = this.Pixels.constructor ? this.Pixels.constructor.name : ''; 
			throw `Unhandled Pixel buffer format ${typeof this.Pixels} (${Constructor})`;
		}
		
		RenderContext.OnAllocatedTexture( this );
		
		//	non-power of 2 must be clamp to edge
		const RepeatMode = gl.CLAMP_TO_EDGE;
		//const RepeatMode = gl.MIRRORED_REPEAT;
		//	gr: check support of FloatLinearTextureSupported before allowing linear
		//const FilterMode = this.LinearFilter ? gl.LINEAR : gl.NEAREST;
		const FilterMode = gl.NEAREST;
		
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, RepeatMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, RepeatMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FilterMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FilterMode);
		
		this.OpenglVersion = this.GetLatestVersion();
	}
	
	Copy(Source)
	{
		//	need to add read-from-opengl to do this
		if ( Source.PixelsVersion != Source.GetLatestVersion() )
			throw "Cannot copy from image where pixels aren't the latest version";

		this.WritePixels( Source.GetWidth(), Source.GetHeight(), Source.Pixels, Source.PixelsFormat );
	}
	
	async LoadPng(PngBytes)
	{
		//	convert to RGBA buffer
		const Pixels = await PngBytesToPixels(PngBytes);
		this.WritePixels( Pixels.Width, Pixels.Height, Pixels.Buffer, Pixels.Format );
	}

	//	web api specific
	async GetImageBitmap()
	{
		if ( !this.Pixels )
			throw `Cannot create ImageBitmap from null pixels`;
		
		if ( IsHtmlElementPixels(this.Pixels) )
		{
			const ImageBitmap = await createImageBitmap(this.Pixels);
			return ImageBitmap;
		}
		
		throw `todo: create html ImageBitmap from ${typeof this.Pixels} pixels`;
	}
}
