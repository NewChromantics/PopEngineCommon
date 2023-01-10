//	web api needs to import PopImageWebApi here...
//	this might be where we need generic import names and ignore them natively
import * as Pop from './PopEngine.js'


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
