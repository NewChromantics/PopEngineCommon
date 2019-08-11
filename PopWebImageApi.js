function PixelFormatToOpenglFormat(OpenglContext,PixelFormat)
{
	const gl = OpenglContext;
	//	todo: check float support
	//	OES_texture_float extension
	//	or webgl2
	//Pop.Debug( 'OpenglContext.FLOAT', gl.FLOAT );
	switch ( PixelFormat )
	{
		case 'Greyscale':	return [ gl.LUMINANCE,	gl.UNSIGNED_BYTE];
		case 'RGBA':		return [ gl.RGBA,		gl.UNSIGNED_BYTE];
		//case 'Float1':		return [ gl.R32F,		gl.FLOAT];
		//case 'Float2':		return [ gl.RG32F,		gl.FLOAT];
		//case 'Float3':		return [ gl.RGB32F,		gl.FLOAT];
		//case 'Float4':		return [ gl.RGBA32F,	gl.FLOAT];		case 'Float1':		return [ gl.LUMINANCE,	gl.FLOAT];
		case 'Float1':		return [ gl.LUMINANCE,	gl.FLOAT];
		case 'Float2':		return [ gl.LUMINANCE_ALPHA,	gl.FLOAT];
		case 'Float3':		return [ gl.RGB,		gl.FLOAT];
		case 'Float4':		return [ gl.RGBA,		gl.FLOAT];
	}
	
	throw "PixelFormatToOpenglFormat: Unhandled pixel format " + PixelFormat;
}


Pop.Image = function(Filename)
{
	Pop.Debug("Pop.Image(",...arguments,")");
	
	this.Size = [undefined,undefined];
	this.OpenglTexture = null;
	this.OpenglVersion = undefined;
	this.Pixels = null;
	this.PixelsFormat = null;
	this.PixelsVersion = undefined;
	
	this.GetWidth = function()
	{
		return this.Size[0];
	}
	
	this.GetHeight = function()
	{
		return this.Size[1];
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
	
	this.GetOpenglTexture = function(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		this.UpdateTexturePixels( RenderContext );
		return this.OpenglTexture;
	}
	
	this.UpdateTexturePixels = function(RenderContext)
	{
		//	up to date
		if ( this.OpenglTextureVersion == this.GetLatestVersion() )
			return;
		
		if ( !this.Pixels )
			throw "Trying to create opengl texture, with no pixels";
		
		//	update from pixels
		const gl = RenderContext.GetGlContext();
		
		if ( !this.OpenglTexture )
		{
			//	create texture
			this.OpenglTexture = gl.createTexture();
			this.OpenglTextureVersion = undefined;
		}
		const Texture = this.OpenglTexture;
		
		//	gr: do we need to set texture slot?
		gl.bindTexture(gl.TEXTURE_2D, Texture );
		const MipLevel = 0;
		const Border = 0;
		let InternalFormat = gl.RGBA;
		const Width = this.GetWidth();
		const Height = this.GetHeight();

		if ( this.Pixels instanceof Image )
		{
			//Pop.Debug("Image from Image",this.PixelsFormat);
			const SourceFormat = gl.RGBA;
			const SourceType = gl.UNSIGNED_BYTE;
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, SourceFormat, SourceType, this.Pixels );
		}
		else if ( this.Pixels instanceof Uint8Array )
		{
			//Pop.Debug("Image from Uint8Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			const SourceFormat = SourceFormatTypes[0];
			const SourceType = gl.UNSIGNED_BYTE;//SourceFormatTypes[1];
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, this.Pixels );
		}
		else if ( this.Pixels instanceof Float32Array )
		{
			//Pop.Debug("Image from Float32Array",this.PixelsFormat);
			const SourceFormatTypes = PixelFormatToOpenglFormat( gl, this.PixelsFormat );
			const SourceFormat = SourceFormatTypes[0];
			const SourceType = gl.FLOAT;//SourceFormatTypes[1];
			InternalFormat = SourceFormat;	//	gr: float3 RGB needs RGB internal
			gl.texImage2D( gl.TEXTURE_2D, MipLevel, InternalFormat, Width, Height, Border, SourceFormat, SourceType, this.Pixels );
		}
		else
		{
			throw "Unhandled Pixel buffer format " + (typeof this.Pixels) + "/" + this.Pixels.prototype.constructor;
		}
		
		const RepeatMode = gl.CLAMP_TO_EDGE;
		const FilterMode = gl.LINEAR;
		
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, RepeatMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, RepeatMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FilterMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FilterMode);
		
		this.OpenglTextureVersion = this.GetLatestVersion()+1;
	}
	
	
	//	load file
	if ( typeof Filename == 'string' )
	{
		let HtmlImage = Pop.GetCachedAsset(Filename);
		let PixelFormat = undefined;
		this.WritePixels( HtmlImage.width, HtmlImage.height, Image, PixelFormat );
	}
	else if ( Array.isArray( Filename ) )
	{
		//	initialise size...
		Pop.Debug("Init image with size", Filename);
		const Size = arguments[0];
		const PixelFormat = arguments[1] || 'RGBA';
		const Width = Size[0];
		const Height = Size[1];
		const Pixels = new Uint8Array( Width * Height * 4 );
		this.WritePixels( Width, Height, Pixels, PixelFormat );
	}
}

