
Pop.ParseObjFile = function(Filename,OnVertex)
{
	let Obj = {};
	Obj.Prefix_Comment = '#';
	Obj.Prefix_Position = 'v ';
	Obj.Prefix_Normal = 'vn ';
	Obj.Prefix_TexCoord = 'vt ';
	Obj.Prefix_Material = 'mtllib ';
	Obj.Prefix_Object = 'o ';
	Obj.Prefix_Face = 'f ';

	const Contents = Pop.LoadFileAsString(Filename);
	Pop.Debug("Parsing " + Filename + "...");
	Pop.Debug("Contents.length",Contents.length);
	const Lines = Contents.split('\n');

	let ParseLine = function(Line)
	{
		if ( !Line.startsWith(Obj.Prefix_Position) )
			return;
		
		Line = Line.trim();
		let pxyx = Line.split(' ');
		if ( pxyx.length != 4 )
		{
			Pop.Debug("ignoring line " + Line, pxyx.length);
			return;
		}
		let x = parseFloat(pxyx[1]);
		let y = parseFloat(pxyx[2]);
		let z = parseFloat(pxyx[3]);
		OnVertex( x,y,z );
	}
	
	Lines.forEach( ParseLine );
}
