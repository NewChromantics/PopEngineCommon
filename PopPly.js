
Pop.ParsePlyFile = function(Filename,OnVertex)
{
	const PlyContents = Pop.LoadFileAsString(Filename);
	Pop.Debug("Parsing " + Filename + "...");
	Pop.Debug(PlyContents.length);
	const PlyLines = PlyContents.split('\n');
	if ( PlyLines[0].trim() != 'ply' )
		throw "Filename first line is not ply, is " + PlyLines[0];
	
	let HeaderFinished = false;
	
	Pop.Debug("Parsing x" + PlyLines.length + " lines...");
	let ProcessLine = function(Line)
	{
		Line = Line.trim();
		
		if ( !HeaderFinished )
		{
			if ( Line == 'end_header' )
				HeaderFinished = true;
			return;
		}
		
		let xyz = Line.split(' ');
		if ( xyz.length != 3 )
		{
			Pop.Debug("ignoring line " + Line, xyz.length);
			return;
		}
		let x = parseFloat(xyz[0]);
		let y = parseFloat(xyz[1]);
		let z = parseFloat(xyz[2]);
		if ( x === NaN || y === NaN || z === NaN )
		{
			Pop.Debug("Nan parsed; ignoring line " + Line, x,y,z);
			return;
		}
		OnVertex( x,y,z);
	}
	PlyLines.forEach(ProcessLine);
}
