//	texture stuff

//	gr: should change this to specific noise algos
Pop.CreateRandomImage = function(Width,Height)
{
	let Channels = 4;
	let Format = 'Float4';
	
	let Pixels = new Float32Array( Width * Height * Channels );
	for ( let i=0;	i<Pixels.length;	i++ )
		Pixels[i] = Math.random();
	
	let Texture = new Pop.Image();
	Texture.WritePixels( Width, Height, Pixels, Format );
	return Texture;
}
