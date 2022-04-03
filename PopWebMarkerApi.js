const Options = {};
Options.formats = ['qr_code'];
const Detector = new BarcodeDetector(Options);

export async function FindImageMarkers(Image)
{
	function PxToUv(xy)
	{
		let u = xy.x / Image.GetWidth();
		let v = xy.y / Image.GetHeight();
		return [u,v];
	}
	
	const ImageElement = await Image.GetAsHtmlCanvas();
	const Markers = await Detector.detect(ImageElement);
	if ( !Markers.length )
		return [];

	let Features = {};
	
	for ( let Marker of Markers )
	{
		const Uvs = Marker.cornerPoints.map( PxToUv );
		console.log(`Found ${Marker.format} ${Marker.rawValue} at ${Uvs}`);

		const Key = Marker.rawValue;	//	url etc
		
		function UvToFeature(Uv,Index)
		{
			const FeatureKey = `${Key}${Index}`;
			Features[FeatureKey] = Uv;
		}
		Uvs.forEach( UvToFeature );
	}
	
	return Features;
}

