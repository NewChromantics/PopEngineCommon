Pop.Svg = {};


Pop.Svg.Parse = function(Contents,OnVertex)
{
	const Svg = JSON.parse(Contents);
	
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
	
	function ParsePath(Node)
	{
		Pop.Debug("Todo: parse svg path");
	}
	
	function ParseGroup(Node)
	{
		if ( Node.circle )
			Node.circle.forEach( ParseCircle );
		if ( Node.ellipse )
			Node.ellipse.forEach( ParseEllipse );
		if ( Node.path )
			Node.path.forEach( ParsePath );
		if ( Node.g )
			Node.g.forEach( ParseGroup );
		
		//	todo: other children!
	}
	
	ParseGroup( Svg.svg );
}



Pop.Svg.ParseShapes = function(Contents,OnShape)
{
	const Svg = JSON.parse(Contents);
	
	const Meta = Svg.svg;
	const Bounds = StringToFloats( Meta['-viewBox'] );
	
	function NormaliseSize(Value)
	{
		Pop.Debug("Normalise", Value);
		//	todo: center
		//	scale down to largest width or height
		if ( Bounds[2] > Bounds[3] )
			return Value / Bounds[2];
		else
			return Value / Bounds[3];
	}
	
	//	center bounds so ratio is around height
	if ( false )
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
	
	function StringToCoord(String)
	{
		let x = StringToSize(String);
		//x = Lerp( -1, 1, x );
		return x;
	}
	
	function StringToSize(String)
	{
		let x = StringToFloat(String);
		x = NormaliseSize(x);
		return x;
	}
	
	
	
	function ParseCircle(Node)
	{
		let Shape = {};
		Shape.Matrix = StringToMatrix( Node['-matrix'] );
		let x = StringToCoord( Node['-cx'] );
		let y = StringToCoord( Node['-cy'] );
		let r = StringToSize( Node['-r'] );
		
		Shape.Circle = {};
		Shape.Circle.x = x;
		Shape.Circle.y = y;
		Shape.Circle.Radius = r;
		
		OnShape(Shape);
	}
	
	function ParseEllipse(Node)
	{
		let Shape = {};
		Shape.Matrix = StringToMatrix( Node['-matrix'] );
		let x = StringToCoord( Node['-cx'] );
		let y = StringToCoord( Node['-cy'] );
		let rx = StringToSize( Node['-rx'] );
		let ry = StringToSize( Node['-ry'] );
		
		Shape.Ellipse = {};
		Shape.Ellipse.x = x;
		Shape.Ellipse.y = y;
		Shape.Ellipse.RadiusX = rx;
		Shape.Ellipse.RadiusY = ry;
		
		OnShape(Shape);
	}
	
	function ParsePath(Node)
	{
		Pop.Debug("Todo: parse svg path", JSON.stringify(Node));
	}
	
	function ParsePolygon(Node)
	{
		Pop.Debug("Todo: parse svg polygon", JSON.stringify(Node));
	}
	
	function ParseLine(Node)
	{
		const Shape = {};
		let x1 = StringToCoord( Node['-x1'] );
		let y1 = StringToCoord( Node['-y1'] );
		let x2 = StringToCoord( Node['-x2'] );
		let y2 = StringToCoord( Node['-y2'] );
		
		Shape.Line = {};
		Shape.Line.Points = [];
		Shape.Line.Points.push( [x1,y1] );
		Shape.Line.Points.push( [x2,y2] );
		
		OnShape( Shape );
	}
	
	function ParsePolyLine(Node)
	{
		const Shape = {};
		
		Shape.Line = {};
		Shape.Line.Points = [];

		let Coords = StringToFloats(Node['-points']);
		Coords = Coords.map(NormaliseSize);
		for ( let i=0;	i<Coords.length;	i+=2 )
		{
			const x = Coords[i+0];
			const y = Coords[i+1];
			Shape.Line.Points.push( [x,y] );
		}

		OnShape( Shape );
	}
	
	function ParseRect(Node)
	{
		const Shape = {};
		let x = StringToCoord( Node['-x'] );
		let y = StringToCoord( Node['-y'] );
		let w = StringToSize( Node['-width'] );
		let h = StringToSize( Node['-height'] );
		
		Shape.Rect = {};
		Shape.Rect.x = x;
		Shape.Rect.y = y;
		Shape.Rect.w = w;
		Shape.Rect.h = h;
		
		OnShape( Shape );
	}
	
	
	function NodeAsArray(Node)
	{
		if ( Node === undefined )
			return [];
		if ( !Array.isArray(Node) )
			return [Node];
		return Node;
	}
	
	function ParseGroup(Node,PathName)
	{
		Node.circle = NodeAsArray(Node.circle);
		Node.ellipse = NodeAsArray(Node.ellipse);
		Node.path = NodeAsArray(Node.path);
		Node.polygon = NodeAsArray(Node.polygon);
		Node.rect = NodeAsArray(Node.rect);
		Node.line = NodeAsArray(Node.line);
		Node.polyline = NodeAsArray(Node.polyline);
		Node.g = NodeAsArray(Node.g);
		
		Node.circle.forEach( ParseCircle );
		Node.ellipse.forEach( ParseEllipse );
		Node.path.forEach( ParsePath );
		Node.polygon.forEach( ParsePolygon );
		Node.rect.forEach( ParseRect );
		Node.line.forEach( ParseLine );
		Node.polyline.forEach( ParsePolyLine );
		Node.g.forEach( ParseGroup );
		
		//	todo: other children!
	}
	ParseGroup( Svg.svg, '' );
}
