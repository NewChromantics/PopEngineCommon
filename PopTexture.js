import PopImage from './PopWebImageApi.js'
const Default = 'Image utilities';
export default Default;

//	gr: should change this to specific noise algos
export function CreateRandomImage(Width,Height)
{
	let Channels = 4;
	let Format = 'Float4';
	
	let Pixels = new Float32Array( Width * Height * Channels );
	for ( let i=0;	i<Pixels.length;	i++ )
		Pixels[i] = Math.random();
	
	let Texture = new PopImage(`CreateRandomImage()`);
	Texture.WritePixels( Width, Height, Pixels, Format );
	return Texture;
}


export function CreateColourTexture(Colour4)
{
	let NewTexture = new PopImage(`Colour ${Colour4}`);
	if ( Array.isArray(Colour4) )
		Colour4 = new Float32Array(Colour4);
	NewTexture.WritePixels( 1, 1, Colour4, 'Float4' );
	return NewTexture;
}
