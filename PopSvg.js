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
	
	function StringToCoordX(String)
	{
		let x = StringToSizeX(String);
		//x = Lerp( -1, 1, x );
		return x;
	}
	
	function StringToCoordY(String)
	{
		let y = StringToSizeY(String);
		//y = Lerp( -1, 1, y );
		return y;
	}
	
	function StringToSizeX(String)
	{
		let x = StringToFloat(String);
		x = Range( Bounds[0], Bounds[0]+Bounds[2], x );
		return x;
	}
	
	function StringToSizeY(String)
	{
		let y = StringToFloat(String);
		y = Range( Bounds[1], Bounds[1]+Bounds[3], y );
		return y;
	}
	
	
	function ParseCircle(Node)
	{
		let Shape = {};
		Shape.Matrix = StringToMatrix( Node['-matrix'] );
		let x = StringToCoordX( Node['-cx'] );
		let y = StringToCoordY( Node['-cy'] );
		let r = StringToSizeX( Node['-r'] );
		
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
		let x = StringToCoordX( Node['-cx'] );
		let y = StringToCoordY( Node['-cy'] );
		let rx = StringToSizeX( Node['-rx'] );
		let ry = StringToSizeY( Node['-ry'] );
		
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
		Pop.Debug("Todo: parse svg line", JSON.stringify(Node));
	}
	
	function ParseRect(Node)
	{
		const Shape = {};
		let x = StringToCoordX( Node['-x'] );
		let y = StringToCoordY( Node['-y'] );
		let w = StringToSizeX( Node['-width'] );
		let h = StringToSizeX( Node['-height'] );
		
		Shape.Rect = {};
		Shape.Rect.x = x;
		Shape.Rect.y = y;
		Shape.Rect.w = w;
		Shape.Rect.h = h;
		
		OnShape( Shape );
	}
	
	function ParsePolyLine(Node)
	{
		Pop.Debug("Todo: parse svg poly line", JSON.stringify(Node));
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
