//	web api needs to import PopImageWebApi here...
//	this might be where we need generic import names and ignore them natively
import Pop from './PopEngine.js'


const Default = 'Image utility module';
export default Default;

//	gr: should change this to specific noise algos
export function CreateRandomImage(Width,Height)
{
	let Channels = 4;
	let Format = 'Float4';
	
	let Pixels = new Float32Array( Width * Height * Channels );
	for ( let i=0;	i<Pixels.length;	i++ )
		Pixels[i] = Math.random();
	
	let Texture = new Pop.Image(`Pop_CreateRandomImage`);
	Texture.WritePixels( Width, Height, Pixels, Format );
	return Texture;
}


export function CreateColourTexture(Colour4)
{
	//	avoid misinterpreting our colour name as a filename
	const Name = `Colour ${Colour4}`.split('.').join('_');
	
	let NewTexture = new Pop.Image(Name);
	if ( Array.isArray(Colour4) )
		Colour4 = new Float32Array(Colour4);
	NewTexture.WritePixels( 1, 1, Colour4, 'Float4' );
	return NewTexture;
}

//	in c++ this is SoyPixelsFormat namespace
export function GetChannelsFromPixelFormat(PixelFormat)
{
	switch(PixelFormat)
	{
		case 'Greyscale':	return 1;
		case 'RGBA':		return 4;
		case 'RGB':			return 3;
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
