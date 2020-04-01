Pop.Svg = {};

//	for pre-xml parser, maybe could just support both in one func
Pop.SvgJson = {};


Pop.SvgJson.Parse = function(Contents,OnVertex)
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



Pop.SvgJson.ParseShapes = function(Contents,OnShape)
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
	
	function StringToFloat2s(String,Modifyx)
	{
		Modifyx = Modifyx || function(x){return x;};
		
		let Floats = String.split(' ');
		Floats = Floats.map( parseFloat );
		if ( Floats.some( isNaN ) )
			throw "String (" + String + ") failed to turn to floats: " + Floats;
		const Float2s = [];
		for ( let i=0;	i<Floats.length;	i+=2 )
		{
			const x = Modifyx( Floats[i+0] );
			const y = Modifyx( Floats[i+1] );
			Float2s.push([x,y]);
		}
		return Float2s;
	}
	
	function StringToFloat2Coords(String)
	{
		const Float2s = StringToFloat2s( String, NormaliseSize );
		return Float2s;
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
		if ( String === undefined )
			return 0;
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
		const Shape = {};
		Shape.Style = Node.Style;

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
		const Shape = {};
		Shape.Style = Node.Style;

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
		//	split commands
		const Commands = Node['-d'];
		Pop.Debug("Todo: parse svg path", JSON.stringify(Node));
	}
	
	function ParsePolygon(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;

		Shape.Polygon = {};
		Shape.Polygon.Points = StringToFloat2Coords(Node['-points']);

		OnShape(Shape);
	}
	
	function ParseLine(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;

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
		Shape.Style = Node.Style;

		Shape.Line = {};
		Shape.Line.Points = StringToFloat2Coords(Node['-points']);

		OnShape( Shape );
	}
	
	function ParseRect(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;

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

function CleanSvg(DomSvg)
{
	//	the DOMParser turns the svg into a proper svg object, so this func cleans it up
	const Svg = {};
	
	Svg.ViewBox = DomSvg.attributes.viewBox.value;
	
	function CreateGroup()
	{
		const Group = {};
		Group.Children = [];
		return Group;
	}
	
	Svg.Root = CreateGroup();

	//
	const CssMap = {};
	const LinearGradientMap = {};
	const RadialGradientMap = {};
	
	function GetStyleFromClass(Class)
	{
		const Selector = `.${Class}`;
		if ( !CssMap.hasOwnProperty(Selector) )
			throw `Failed to get css style for ${Class}`;
		return CssMap[Selector];
	}
	
	function PushGroup(Node,Parent)
	{
		const GroupName = Node.attributes.id;
		Pop.Debug(`Todo process group ${GroupName}`,Node);
	}

	function GetShape(Node)
	{
		const Type = Node.tagName;
		const Attribs = Array.from(Node.attributes);
		const Shape = {};
		
		function AddAttribute(Attrib)
		{
			Shape[Attrib.name] = Attrib.value;
		}
		Attribs.forEach(AddAttribute);
		if ( Node.attributes.class )
			Shape.Style = GetStyleFromClass(Node.attributes.class.value);
		else
			Shape.Style = GetDefaultStyle();
		Shape.Type = Type;
		//const Style = Node.attributes.class;
		//const Points = Node.attributes.points;

		return Shape;
	}
	
	function PushNode(Node,Parent)
	{
		const TagName = Node.tagName;
		
		if ( TagName == 'g' )
		{
			const Group = CreateGroup();
			if ( Node.attributes.id )
				Group.Name = Node.attributes.id.value;
			else
				Group.Name = null;
			Array.from(Node.children).forEach( n => PushNode(n,Group) );
			Parent.Children.push(Group);
		}
		else
		{
			const Shape = GetShape(Node);
			Parent.Children.push(Shape);
		}
	}
	
	function GetDefaultStyle()
	{
		Pop.Debug("GetDefaultStyle");
		//	defaults;
		//	https://www.w3.org/TR/SVG/painting.html#StrokeWidthProperty
		const SvgDefaults = {};
		SvgDefaults['stroke-width'] = 1;
		SvgDefaults['stroke'] = 'none';
		SvgDefaults['fill'] = 'black';
		SvgDefaults['stroke-linecap'] = 'butt';
		return SvgDefaults;
	}
	
	function ParseStyle(CssRule)
	{
		//	can get multiple selectors for one style!
		const SelectorNames = CssRule.selectorText.split(',').map( s => s.trim() );
		const Style = {};
		
		//	CssRule.style has members like 0:'fill' and an element 'fill':'value'
		const Styles = Array.from(CssRule.style);
		for ( let Property of Styles )
		{
			const Value = CssRule.style[Property];
			Style[Property] = Value;
		}
		
		for ( let SelectorName of SelectorNames )
		{
			//	merge style values
			let CurrentStyle = CssMap[SelectorName];
			if ( CurrentStyle === undefined )
				CurrentStyle = GetDefaultStyle();
			
			//	overwrite new values
			Object.assign( CurrentStyle, Style );
			Pop.Debug(`Merged style ${SelectorName};`,CurrentStyle);
			CssMap[SelectorName] = CurrentStyle;
		}
		//Pop.Debug('SelectorNames',SelectorNames,"Style",Style);
	}
	
	function ProcessStyles(Node)
	{
		const CssText = Node.textContent;
		const CssRules = Node.sheet.rules;
		Array.from(CssRules).forEach( ParseStyle );
	}
	
	function ProcessRadialGradient(Node)
	{
		/*
		 <radialGradient id="radial-gradient-5" cx="1156.78" cy="233.61" r="54.68" gradientUnits="userSpaceOnUse">
		 <stop offset="0.43" stop-color="#904c30"/>
		 <stop offset="0.55" stop-color="#a81e27"/>
		 <stop offset="0.7" stop-color="#dd3024"/>
		 <stop offset="0.72" stop-color="#dc4436"/>
		 <stop offset="0.79" stop-color="#da7460"/>
		 <stop offset="0.85" stop-color="#d99a81"/>
		 <stop offset="0.91" stop-color="#d8b699"/>
		 <stop offset="0.96" stop-color="#d7c6a7"/>
		 <stop offset="1" stop-color="#d7ccac"/>
		 </radialGradient>*/
	}
	function ProcessLinearGradient(Node)
	{
		/*
		 <linearGradient id="linear-gradient-4" x1="1246.44" y1="347.86" x2="1544.83" y2="257.4" gradientUnits="userSpaceOnUse">
		 <stop offset="0.02" stop-color="#aa8789"/>
		 <stop offset="0.04" stop-color="#6c445f"/>
		 <stop offset="0.35" stop-color="#603757"/>
		 <stop offset="0.37" stop-color="#ad8b8b"/>
		 <stop offset="0.63" stop-color="#b99793"/>
		 <stop offset="0.66" stop-color="#9a7d86"/>
		 </linearGradient>
		 */
	}
	
	function ProcessDef(Node)
	{
		switch(Node.tagName)
		{
			case 'style':			return ProcessStyles(Node);
			case 'linearGradient':	return ProcessLinearGradient(Node);
			case 'radialGradient':	return ProcessRadialGradient(Node);
			default:				throw `Unhandled svg tag ${Node.tagName}`;
		}
	}
	
	function PushRootChild(Child)
	{
		const TagName = Child.tagName;
		if ( TagName == 'defs' )
			return Array.from(Child.children).forEach(ProcessDef);
		
		return PushNode(Child,Svg.Root);
	}
	Array.from(DomSvg.children).forEach(PushRootChild);
	
	Pop.Debug("CSS selectors", Object.keys(CssMap) );
	
	return Svg;
}

Pop.Svg.ParseShapes = function(Contents,OnShape)
{
	let Svg = Pop.Xml.Parse(Contents);
	//	note: the DOMParser in chrome turns this into a proper svg object, not just a structure
	Svg = CleanSvg(Svg);
	Pop.Debug( JSON.stringify(Svg) );
	
	const Meta = Svg.svg;
	const Bounds = StringToFloats( Svg.ViewBox );
	
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
	
	function StringToFloat2s(String,Modifyx)
	{
		Modifyx = Modifyx || function(x){return x;};
		
		let Floats = String.split(' ');
		Floats = Floats.map( parseFloat );
		if ( Floats.some( isNaN ) )
			throw "String (" + String + ") failed to turn to floats: " + Floats;
		const Float2s = [];
		for ( let i=0;	i<Floats.length;	i+=2 )
		{
			const x = Modifyx( Floats[i+0] );
			const y = Modifyx( Floats[i+1] );
			Float2s.push([x,y]);
		}
		return Float2s;
	}
	
	function StringToFloat2Coords(String)
	{
		const Float2s = StringToFloat2s( String, NormaliseSize );
		return Float2s;
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
		if ( String === undefined )
			return 0;
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
		const Shape = {};
		Shape.Style = Node.Style;
		
		Shape.Matrix = StringToMatrix( Node['matrix'] );
		let x = StringToCoord( Node['cx'] );
		let y = StringToCoord( Node['cy'] );
		let r = StringToSize( Node['r'] );
		
		Shape.Circle = {};
		Shape.Circle.x = x;
		Shape.Circle.y = y;
		Shape.Circle.Radius = r;
		
		OnShape(Shape);
	}
	
	function ParseEllipse(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		
		Shape.Matrix = StringToMatrix( Node['matrix'] );
		let x = StringToCoord( Node['cx'] );
		let y = StringToCoord( Node['cy'] );
		let rx = StringToSize( Node['rx'] );
		let ry = StringToSize( Node['ry'] );
		
		Shape.Ellipse = {};
		Shape.Ellipse.x = x;
		Shape.Ellipse.y = y;
		Shape.Ellipse.RadiusX = rx;
		Shape.Ellipse.RadiusY = ry;
		
		OnShape(Shape);
	}
	
	function ParsePath(Node)
	{
		//	split commands
		const Commands = Node['d'];
		Pop.Debug("Todo: parse svg path", JSON.stringify(Node));
	}
	
	function ParsePolygon(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		
		Shape.Polygon = {};
		Shape.Polygon.Points = StringToFloat2Coords(Node['points']);
		
		OnShape(Shape);
	}
	
	function ParseLine(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		
		let x1 = StringToCoord( Node['x1'] );
		let y1 = StringToCoord( Node['y1'] );
		let x2 = StringToCoord( Node['x2'] );
		let y2 = StringToCoord( Node['y2'] );
		
		Shape.Line = {};
		Shape.Line.Points = [];
		Shape.Line.Points.push( [x1,y1] );
		Shape.Line.Points.push( [x2,y2] );
		
		OnShape( Shape );
	}
	
	function ParsePolyLine(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		
		Shape.Line = {};
		Shape.Line.Points = StringToFloat2Coords(Node['points']);
		
		OnShape( Shape );
	}
	
	function ParseRect(Node)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		
		let x = StringToCoord( Node['x'] );
		let y = StringToCoord( Node['y'] );
		let w = StringToSize( Node['width'] );
		let h = StringToSize( Node['height'] );
		
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
	
	function ParseShape(Node)
	{
		switch ( Node.Type )
		{
			case 'circle':		return ParseCircle(Node);
			case 'ellipse':		return ParseEllipse(Node);
			case 'path':		return ParsePath(Node);
			case 'polygon':		return ParsePolygon(Node);
			case 'rect':		return ParseRect(Node);
			case 'line':		return ParseLine(Node);
			case 'polyline':	return ParsePolyLine(Node);
		}
		throw `Unhandled node type ${Node.Type}`;
	}
	
	function ParseGroup(Node,PathName)
	{
		//	is a shape
		if ( Node.Type )
		{
			ParseShape(Node);
		}
		
		if ( Node.Children )
			Node.Children.forEach( n => ParseGroup(n,PathName) );
	}
	ParseGroup( Svg.Root, '' );
}
