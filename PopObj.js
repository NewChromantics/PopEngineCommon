Pop.Obj = {};

Pop.Obj.Parse = function(Contents,OnVertex)
{
	let Obj = {};
	Obj.Prefix_Comment = '#';
	Obj.Prefix_Position = 'v ';
	Obj.Prefix_Normal = 'vn ';
	Obj.Prefix_TexCoord = 'vt ';
	Obj.Prefix_Material = 'mtllib ';
	Obj.Prefix_Object = 'o ';
	Obj.Prefix_Face = 'f ';
	Obj.Prefix_Scale = '# Scale ';

	Pop.Debug("Contents.length",Contents.length);
	const Lines = Contents.split('\n');

	let Scale = 1.0;

	const ParsePositionFloat = function(FloatStr)
	{
		let f = parseFloat( FloatStr );
		f *= Scale;
		return f;
	}
	
	
	const ParseLine = function(Line)
	{
		Line = Line.trim();
		
		//	gr: added a scale key
		if ( Line.startsWith(Obj.Prefix_Scale) )
		{
			Line = Line.replace( Obj.Prefix_Scale,'');
			Scale = parseFloat( Line );
			Pop.Debug("Found scale in obj: ",Scale);
			return;
		}

		if ( !Line.startsWith(Obj.Prefix_Position) )
			return;

		let pxyx = Line.split(' ');
		if ( pxyx.length != 4 )
		{
			Pop.Debug("ignoring line", Line, pxyx.length);
			return;
		}
		let x = ParsePositionFloat( pxyx[1] );
		let y = ParsePositionFloat( pxyx[2] );
		let z = ParsePositionFloat( pxyx[3] );
		OnVertex( x,y,z );
	}
	
	Lines.forEach( ParseLine );
}
