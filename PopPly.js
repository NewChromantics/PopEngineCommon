Pop.Ply = {};

Pop.Ply.Parse = function(PlyContents,OnVertex,OnMeta)
{
	const PlyLines = PlyContents.split('\n');
	if ( PlyLines[0].trim() != 'ply' )
		throw "Filename first line is not ply, is " + PlyLines[0];
	
	let HeaderFinished = false;
	
	if ( OnMeta )
	{
		let Meta = {};
		Meta.VertexCount = PlyLines.length;
		OnMeta( Meta );
	}
	
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
		if ( xyz.length < 3 )
		{
			Pop.Debug("ignoring line " + Line, xyz.length);
			return;
		}
	
		let Floats = xyz.map( parseFloat );
		
		if ( Floats.some( isNaN ) )
		{
			Pop.Debug("Nan parsed; ignoring line " + Line, ...xyz, ...Floats );
			return;
		}
	
		OnVertex( ...Floats );
	}
	PlyLines.forEach(ProcessLine);
}
