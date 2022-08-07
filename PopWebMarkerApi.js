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

	//	turn to uvs
	//	gr: turn into a new non-os struct?
	for ( let Marker of Markers )
	{
		Marker.Uvs = Marker.cornerPoints.map( PxToUv );
		Marker.Key = Marker.rawValue;
		//console.log(`Found ${Marker.format} ${Marker.rawValue} at ${Uvs}`);
	}
	
	return Markers;
}

