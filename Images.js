//	web api needs to import PopImageWebApi here...
//	this might be where we need generic import names and ignore them natively
import * as Pop from './PopEngine.js'
import {GetChannelsFromPixelFormat,IsFloatFormat} from './PopWebImageApi.js'


const Default = 'Image utility module';
export default Default;

//	gr: should change this to specific noise algos
export function CreateRandomImage(Width,Height,Format='Float4')
{
	let Channels = GetChannelsFromPixelFormat(Format);
	let ArrayType = IsFloatFormat(Format) ? Float32Array : Uint8ClampedArray;
	let ValueScale = IsFloatFormat(Format) ? 1 : 255;
	
	let Pixels = new ArrayType( Width * Height * Channels );
	for ( let i=0;	i<Pixels.length;	i++ )
		Pixels[i] = Math.random() * ValueScale;
	
	let Texture = new Pop.Image(`Pop_CreateRandomImage(${Width},${Height},${Format})`);
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
