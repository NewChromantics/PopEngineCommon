
const WebApi_HtmlImageElement = this.hasOwnProperty('HTMLImageElement') ? this['HTMLImageElement'] : null;


function PixelFormatToOpenglFormat(OpenglContext,PixelFormat)
{
	const gl = OpenglContext;
	//	todo: check float support
	//	OES_texture_float extension
	//	or webgl2
	//Pop.Debug( 'OpenglContext.FLOAT', gl.FLOAT );
	
	if ( OpenglContext.FloatTextureSupported )
	{
		if ( false && gl instanceof WebGL2RenderingContext )
		{
			switch ( PixelFormat )
			{
				case 'Float1':		return [ gl.R32F,		gl.FLOAT];
				case 'Float2':		return [ gl.RG32F,		gl.FLOAT];
				case 'Float3':		return [ gl.RGB32F,		gl.FLOAT];
				case 'Float4':		return [ gl.RGBA32F,	gl.FLOAT];
			}
		}
		else
		{
			switch ( PixelFormat )
			{
				case 'Float1':		return [ gl.LUMINANCE,	gl.FLOAT];
				case 'Float2':		return [ gl.LUMINANCE_ALPHA,	gl.FLOAT];
				case 'Float3':		return [ gl.RGB,		gl.FLOAT];
				case 'Float4':		return [ gl.RGBA,		gl.FLOAT];
			}
		}
	}
	
	switch ( PixelFormat )
	{
		case 'Greyscale':	return [ gl.LUMINANCE,	gl.UNSIGNED_BYTE];
		case 'RGBA':		return [ gl.RGBA,		gl.UNSIGNED_BYTE];
		case 'RGB':			return [ gl.RGB,		gl.UNSIGNED_BYTE];
		case 'RGBA32':		return [ gl.RGBA,		gl.UNSIGNED_INT_24_8];
	}
	throw "PixelFormatToOpenglFormat: Unhandled pixel format " + PixelFormat;
}

function IsFloatFormat(Format)
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
		case gl.LUMINANCE:	Channels = 1;	break;
		case gl.LUMINANCE_ALPHA:	Channels = 2;	break;
		case gl.RGB:		Channels = 3;	break;
		case gl.RGBA:		Channels = 4;	break;
		default:			throw "Unhandled Format GetTextureFormatPixelByteSize(" + Format + "," + Type + ")";
	}
	
	switch ( Type )
	{
		case gl.UNSIGNED_BYTE:		return Channels * 1;
		case gl.UNSIGNED_INT_24_8:	return Channels * 4;
		case gl.FLOAT:			return Channels * 4;
		default:				throw "Unhandled Type GetTextureFormatPixelByteSize(" + Format + "," + Type + ")";
	}
}


function GetPixelsFromHtmlImageElement(Img)
{
	//	html5 image
	//if ( Img.constructor == WebApi_HtmlImageElement )
	{
		//	gr: is this really the best way :/
		const Canvas = document.createElement('canvas');
		const Context = Canvas.getContext('2d');
		const Width = Img.width;
		const Height = Img.height;
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
		delete Canvas;
		//Canvas = null;
		return Pixels;
	}
}

async function PngBytesToPixels(PngBytes)
{
	//	re-using browser's loader
	const PngBlob = new Blob( [ PngBytes ], { type: "image/png" } );
	const ImageUrl = URL.createObjectURL( PngBlob );
	const Image = await Pop.LoadFileAsImageAsync(ImageUrl);
	const Pixels = GetPixelsFromHtmlImageElement(Image);
/*
	const Pixels = {};
	Pixels.Width = 1;
	Pixels.Height = 1;
	Pixels.Buffer = new Uint8Array( [0,255,0,255] );
	Pixels.Format = 'RGBA';
 */
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


Pop.Image = function(Filename)
{
	this.Name = (typeof Filename == 'string') ? Filename : "Pop.Image";
	this.Size = [undefined,undefined];
	this.OpenglTexture = null;
	this.OpenglTextureContextVersion = null;
	this.OpenglVersion = undefined;
	this.Pixels = null;
	this.PixelsFormat = null;
	this.PixelsVersion = undefined;
	this.LinearFilter = false;
	
	this.SetLinearFilter = function(Linear)
	{
		this.LinearFilter = Linear;
	}
	
	this.GetWidth = function()
	{
		return this.Size[0];
	}
	
	this.GetHeight = function()
	{
		return this.Size[1];
	}

	this.GetFormat = function()
	{
		return this.PixelsFormat;
	}
	
	this.GetPixelBuffer = function()
	{
		return this.Pixels;
	}
	
	this.GetLatestVersion = function()
	{
		let Version = 0;
		Version = Math.max( Version, this.PixelsVersion || 0 );
		Version = Math.max( Version, this.OpenglVersion || 0 );
		return Version;
	}
	
	this.WritePixels = function(Width,Height,Pixels,Format)
	{
		this.Size = [Width,Height];
		this.Pixels = Pixels;
		this.PixelsFormat = Format;
		this.PixelsVersion = this.GetLatestVersion()+1;
	}
	
	this.Clear = function()
	{
		//	this is getting convuluted, so maybe the API need to change (C++ side too)
		this.DeleteOpenglTexture( this.OpenglOwnerContext );
		
		this.DeletePixels();
	}
	
	this.DeletePixels = function()
	{
		this.PixelsVersion = null;
		this.Pixels = null;
		this.PixelsFormat = null;
	}
	
	this.GetOpenglTexture = function(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		this.UpdateTexturePixels( RenderContext );

		return this.OpenglTexture;
	}
	
	this.DeleteOpenglTexture = function(RenderContext)
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
	
	this.UpdateTexturePixels = function(RenderContext)
	{
		//	texture is from an old context
		if ( this.OpenglTextureContextVersion !== RenderContext.ContextVersion )
		{
			this.DeleteOpenglTexture( RenderContext );
		}
		
		//	up to date
		if ( this.OpenglVersion == this.GetLatestVersion() )
			return;
		
		if ( !this.Pixels )
			throw "Trying to create opengl texture, with no pixels";
		
		//Pop.Debug("Updating opengl texture pixels " + this.Name);
		
		//	update from pixels
		const gl = RenderContext.GetGlContext();
		
		if ( !this.OpenglTexture )
		{
			//	create texture
			this.OpenglTexture = gl.createTexture();
			this.OpenglVersion = undefined;
			this.OpenglTextureContextVersion = RenderContext.ContextVersion;
			this.OpenglOwnerContext = RenderContext;
		}
		const Texture = this.OpenglTexture;
		
		//	set a new texture slot
		const TextureIndex = RenderContext.AllocTexureIndex();
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
		if ( this.Pixels instanceof Float32Array && !RenderContext.FloatTextureSupported )
		{
			Pop.Debug("Float texture not supported, converting to 8bit");
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
		
		
		if ( this.Pixels instanceof Image )
		{
			//Pop.Debug("Image from Image",this.PixelsFormat);
			const SourceFormat = gl.RGBA;
			const SourceType = gl.UNSIGNED_BYTE;
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, SourceFormat, SourceType, this.Pixels );
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * this.Pixels.width * this.Pixels.height;
		}
		else if ( this.Pixels instanceof Uint8Array || this.Pixels instanceof Uint8ClampedArray )
		{
			if ( this.Pixels instanceof Uint8ClampedArray )
				this.Pixels = new Uint8Array(this.Pixels);
			
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
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, this.Pixels );
			
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
		}
		else if ( this.Pixels instanceof Float32Array )
		{
			//Pop.Debug("Image from Float32Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			let SourceFormat = SourceFormatTypes[0];
			const SourceType = gl.FLOAT;//SourceFormatTypes[1];
			InternalFormat = SourceFormat;	//	gr: float3 RGB needs RGB internal
			
			//	webgl2 correction
			if ( gl.RGBA32F !== undefined )
			{
				if ( this.PixelsFormat == 'Float4' )	InternalFormat = gl.RGBA32F;
				if ( this.PixelsFormat == 'Float3' )	InternalFormat = gl.RGB;
				if ( this.PixelsFormat == 'Float2' )	InternalFormat = gl.LUMINANCE_ALPHA;
				if ( this.PixelsFormat == 'Float1' )	InternalFormat = gl.LUMINANCE;
			}
			
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, this.Pixels );

			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
		}
		else if ( this.Pixels instanceof Uint32Array )
		{
			Pop.Debug("Image from Uint32Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			let SourceFormat = SourceFormatTypes[0];
			const SourceType = SourceFormatTypes[1];
			InternalFormat = SourceFormat;
			
			//InternalFormat = gl.DEPTH24_STENCIL8;
			//SourceFormat = gl.DEPTH_STENCIL;
			
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, this.Pixels );
			
			this.OpenglByteSize = GetTextureFormatPixelByteSize(gl,InternalFormat,SourceType) * Width * Height;
		}
		else
		{
			throw "Unhandled Pixel buffer format " + (typeof this.Pixels) + "/" + this.Pixels.prototype.constructor;
		}
		
		RenderContext.OnAllocatedTexture( this );
		
		//const RepeatMode = gl.CLAMP_TO_EDGE;
		const RepeatMode = gl.MIRRORED_REPEAT;
		const FilterMode = this.LinearFilter ? gl.LINEAR : gl.NEAREST;
		
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, RepeatMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, RepeatMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FilterMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FilterMode);
		
		this.OpenglVersion = this.GetLatestVersion();
	}
	
	this.Copy = function(Source)
	{
		//	need to add read-from-opengl to do this
		if ( Source.PixelsVersion != Source.GetLatestVersion() )
			throw "Cannot copy from image where pixels aren't the latest version";

		this.WritePixels( Source.GetWidth(), Source.GetHeight(), Source.Pixels, Source.PixelsFormat );
	}
	
	this.LoadPng = async function(PngBytes)
	{
		//	convert to RGBA buffer
		const Pixels = await PngBytesToPixels(PngBytes);
		this.WritePixels( Pixels.Width, Pixels.Height, Pixels.Buffer, Pixels.Format );
	}
	
	
	//	load file
	if ( typeof Filename == 'string' && Filename.includes('.') )
	{
		let HtmlImage = Pop.GetCachedAsset(Filename);
		
		//	gr: this conversion should be in WritePixels()
		if ( HtmlImage.constructor == WebApi_HtmlImageElement )
		{
			const Pixels = GetPixelsFromHtmlImageElement(HtmlImage);
			this.WritePixels( Pixels.Width, Pixels.Height, Pixels.Buffer, Pixels.Format );
		}
		else
		{
			let PixelFormat = undefined;
			this.WritePixels( HtmlImage.width, HtmlImage.height, Image, PixelFormat );
		}
	}
	else if ( Array.isArray( Filename ) )
	{
		//	initialise size...
		Pop.Debug("Init image with size", Filename);
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
