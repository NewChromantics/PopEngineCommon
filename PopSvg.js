Pop.Svg = {};


Pop.Svg.Parse = function(Contents,OnVertex)
{
	const Svg = JSON.parse(Contents);
	
	//	gr: I think there's always one group?
	const Group = Svg.svg.g;
	const Meta = Svg.svg;
	const Bounds = StringToFloats( Meta['-viewBox'] );
	
	//	center bounds so ratio is around height
	{
		const LeftShift = Bounds[2] - Bounds[3];
		Bounds[0] += LeftShift/2;
		Bounds[2] -= LeftShift;
	}
	
	function Range(Min,Max,Value)
	{
		return (Value-Min) / (Max-Min);
	}
	function Lerp(Min,Max,Time)
	{
		return Min + ((Max-Min) * Time);
	}
	
	function StringToFloat(String)
	{
		let Float = parseFloat(String);
		return Float;
	}
	
	function StringToFloats(String)
	{
		let Floats = String.split(' ');
		Floats = Floats.map( parseFloat );
		if ( Floats.some( isNaN ) )
			throw "String (" + String + ") failed to turn to floats: " + Floats;
		return Floats;
	}
	
	function StringToMatrix(String)
	{
		if ( !String )
			return String;
		let Floats = StringToFloats(String);
		let Matrix =
		[
			a,c,e,0,
		 	b,d,f,0,
		 	0,0,1,0,
		 	0,0,0,1
		];
		return Matrix;
	}
	
	function PushVertex(x,y,z,Radius)
	{
		x = Range( Bounds[0], Bounds[0]+Bounds[2], x );
		y = Range( Bounds[1]+Bounds[3], Bounds[1], y );
		
		//	scale to -1..1
		//	should be doing this outside...
		x = Lerp( -1, 1, x );
		y = Lerp( -1, 1, y );

		OnVertex( x, y, z, Radius );
	}

	function ParseCircle(Node)
	{
		let Matrix = StringToMatrix( Node['-matrix'] );
		let x = StringToFloat( Node['-cx'] );
		let y = StringToFloat( Node['-cy'] );
		let z = 0;
		let r = StringToFloat( Node['-r'] );
		//	radius is alpha
		PushVertex( x, y, z, r );
	}
	Group.circle.forEach( ParseCircle );
	
	function ParseEllipse(Node)
	{
		let rx = StringToFloat( Node['-rx'] );
		let ry = StringToFloat( Node['-ry'] );
		//	for now, lets treat them as circles
		//if ( rx == ry )
		{
			Node['-r'] = Node['-rx'];
			ParseCircle( Node );
			return;
		}
		
		Pop.Debug("Todo: parse non uniform ellipse");
	}
	Group.ellipse.forEach( ParseEllipse );
	
	
	function ParsePath(Node)
	{
		Pop.Debug("Todo: parse svg path");
	}
	Group.path.forEach( ParsePath );
	
}
