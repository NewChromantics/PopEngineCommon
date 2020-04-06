Pop.Svg = {};


function ParseCss(CssString)
{
	//	requires PopEngineCommon/Css.js/css.js
	const Parser = new cssjs();
	const CssJson = Parser.parseCSS(CssString);
	return CssJson;
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
		//	temp catch, safari doesn't pre-gen classes
		try
		{
			const Selector = `.${Class}`;
			if ( !CssMap.hasOwnProperty(Selector) )
				throw `Failed to get css style for ${Class}`;
			return CssMap[Selector];
		}
		catch(e)
		{
			Pop.Debug(`Exception in GetStyleFromClass; ${e}`);
			return GetDefaultStyle();
		}
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
	
	function ParseChromiumStyle(CssRule)
	{
		//	can get multiple selectors for one style!
		const SelectorNames = CssRule.selectorText.split(',').map( s => s.trim() );
		const Style = {};
		
		//	CssRule.style has members like 0:'fill' and an element 'fill':'value'
		const Styles = Array.from(CssRule.style);
		for ( let Property of Styles )
		{
			const Key = Property;
			const Value = CssRule.style[Key];
			Style[Key] = Value;
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
	
	function ParseCssjsStyle(CssRule)
	{
		const ChromiumRule = {};
		ChromiumRule.selectorText = CssRule.selector;	//	csv names
		ChromiumRule.style = {};
		
		//	reformat to match the chromium style; [N]=key [Key]=Value
		//	"rules":[{"directive":"fill","value":"#e3db7a"}]}
		function PushStyle(Rule,RuleIndex)
		{
			const Key = Rule.directive;
			const Value = Rule.value;
			ChromiumRule.style[RuleIndex] = Key;
			ChromiumRule.style[Key] = Value;
		}
		CssRule.rules.forEach( PushStyle );
		//	make it iterable for Array.from()
		ChromiumRule.style.length = CssRule.rules.length;
		
		ParseChromiumStyle(ChromiumRule);
	}
	
	function ProcessStyles(Node)
	{
		const CssText = Node.textContent;
		//	Node.sheet not on safari, so use 3rd party
		//	3rd party parser
		const CssRules = ParseCss(CssText);
		Pop.Debug('css',JSON.stringify(CssRules));
		CssRules.forEach( ParseCssjsStyle );

		/*
		if ( Node.sheet )
		{
			const CssRules = Node.sheet.rules;
			Array.from(CssRules).forEach( ParseChromiumStyle );
		}
		 */
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


//	https://github.com/MadLittleMods/svg-curve-lib/blob/master/src/js/svg-curve-lib.js#L84
function GetPointOnArc(p0, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, p1, t)
{
	function distance(p0, p1) {
		return Math.sqrt(Math.pow(p1.x-p0.x, 2) + Math.pow(p1.y-p0.y, 2));
	}
	
	function mod(x, m) {
		return (x%m + m)%m;
	}
	
	function toRadians(angle) {
		return angle * (Math.PI / 180);
	}
	
	function angleBetween(v0, v1) {
		var p = v0.x*v1.x + v0.y*v1.y;
		var n = Math.sqrt((Math.pow(v0.x, 2)+Math.pow(v0.y, 2)) * (Math.pow(v1.x, 2)+Math.pow(v1.y, 2)));
		var sign = v0.x*v1.y - v0.y*v1.x < 0 ? -1 : 1;
		var angle = sign*Math.acos(p/n);
		
		//var angle = Math.atan2(v0.y, v0.x) - Math.atan2(v1.y,  v1.x);
		
		return angle;
	}
	
	function clamp(val, min, max) {
		return Math.min(Math.max(val, min), max);
	}
	
	// In accordance to: http://www.w3.org/TR/SVG/implnote.html#ArcOutOfRangeParameters
	rx = Math.abs(rx);
	ry = Math.abs(ry);
	xAxisRotation = mod(xAxisRotation, 360);
	var xAxisRotationRadians = toRadians(xAxisRotation);
	// If the endpoints are identical, then this is equivalent to omitting the elliptical arc segment entirely.
	if(p0.x === p1.x && p0.y === p1.y) {
		return p0;
	}
	
	// If rx = 0 or ry = 0 then this arc is treated as a straight line segment joining the endpoints.
	if(rx === 0 || ry === 0) {
		return this.pointOnLine(p0, p1, t);
	}
	
	
	// Following "Conversion from endpoint to center parameterization"
	// http://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter
	
	// Step #1: Compute transformedPoint
	var dx = (p0.x-p1.x)/2;
	var dy = (p0.y-p1.y)/2;
	var transformedPoint = {
	x: Math.cos(xAxisRotationRadians)*dx + Math.sin(xAxisRotationRadians)*dy,
	y: -Math.sin(xAxisRotationRadians)*dx + Math.cos(xAxisRotationRadians)*dy
	};
	// Ensure radii are large enough
	var radiiCheck = Math.pow(transformedPoint.x, 2)/Math.pow(rx, 2) + Math.pow(transformedPoint.y, 2)/Math.pow(ry, 2);
	if(radiiCheck > 1) {
		rx = Math.sqrt(radiiCheck)*rx;
		ry = Math.sqrt(radiiCheck)*ry;
	}
	
	// Step #2: Compute transformedCenter
	var cSquareNumerator = Math.pow(rx, 2)*Math.pow(ry, 2) - Math.pow(rx, 2)*Math.pow(transformedPoint.y, 2) - Math.pow(ry, 2)*Math.pow(transformedPoint.x, 2);
	var cSquareRootDenom = Math.pow(rx, 2)*Math.pow(transformedPoint.y, 2) + Math.pow(ry, 2)*Math.pow(transformedPoint.x, 2);
	var cRadicand = cSquareNumerator/cSquareRootDenom;
	// Make sure this never drops below zero because of precision
	cRadicand = cRadicand < 0 ? 0 : cRadicand;
	var cCoef = (largeArcFlag !== sweepFlag ? 1 : -1) * Math.sqrt(cRadicand);
	var transformedCenter = {
	x: cCoef*((rx*transformedPoint.y)/ry),
	y: cCoef*(-(ry*transformedPoint.x)/rx)
	};
	
	// Step #3: Compute center
	var center = {
	x: Math.cos(xAxisRotationRadians)*transformedCenter.x - Math.sin(xAxisRotationRadians)*transformedCenter.y + ((p0.x+p1.x)/2),
	y: Math.sin(xAxisRotationRadians)*transformedCenter.x + Math.cos(xAxisRotationRadians)*transformedCenter.y + ((p0.y+p1.y)/2)
	};
	
	
	// Step #4: Compute start/sweep angles
	// Start angle of the elliptical arc prior to the stretch and rotate operations.
	// Difference between the start and end angles
	var startVector = {
	x: (transformedPoint.x-transformedCenter.x)/rx,
	y: (transformedPoint.y-transformedCenter.y)/ry
	};
	var startAngle = angleBetween({
								  x: 1,
								  y: 0
								  }, startVector);
	
	var endVector = {
	x: (-transformedPoint.x-transformedCenter.x)/rx,
	y: (-transformedPoint.y-transformedCenter.y)/ry
	};
	var sweepAngle = angleBetween(startVector, endVector);
	
	if(!sweepFlag && sweepAngle > 0) {
		sweepAngle -= 2*Math.PI;
	}
	else if(sweepFlag && sweepAngle < 0) {
		sweepAngle += 2*Math.PI;
	}
	// We use % instead of `mod(..)` because we want it to be -360deg to 360deg(but actually in radians)
	sweepAngle %= 2*Math.PI;
	
	// From http://www.w3.org/TR/SVG/implnote.html#ArcParameterizationAlternatives
	var angle = startAngle+(sweepAngle*t);
	var ellipseComponentX = rx*Math.cos(angle);
	var ellipseComponentY = ry*Math.sin(angle);
	
	var point = {
	x: Math.cos(xAxisRotationRadians)*ellipseComponentX - Math.sin(xAxisRotationRadians)*ellipseComponentY + center.x,
	y: Math.sin(xAxisRotationRadians)*ellipseComponentX + Math.cos(xAxisRotationRadians)*ellipseComponentY + center.y
	};
	
	// Attach some extra info to use
	point.ellipticalArcStartAngle = startAngle;
	point.ellipticalArcEndAngle = startAngle+sweepAngle;
	point.ellipticalArcAngle = angle;
	
	point.ellipticalArcCenter = center;
	point.resultantRx = rx;
	point.resultantRy = ry;
	return point;
}

function ProcessPathCommands(Commands)
{
	let Shapes = [];
	
	//	walk through
	let CurrentPos = null;
	let InitialPos = null;
	let CurrentLine = [];
	let LastBezierControl1Point = null;

	function NewShape()
	{
		//	flush old shape
		if ( CurrentLine.length )
		{
			const NewShape = {};
			NewShape.Line = {};
			NewShape.Line.Points = CurrentLine.slice();
			Shapes.push(NewShape);
		}
		CurrentLine = [];
		LastBezierControl1Point = null;
	}
	
	function SetInitialPos(x,y)
	{
		InitialPos = [x,y];
		SetPos(x,y);
	}
	
	function SetPos(x,y)
	{
		if ( [x,y].some( isNaN ) )
			throw `Trying to set position as nan; ${x},${y}`;
		CurrentPos = [x,y];
		CurrentLine.push(CurrentPos.slice());
	}
	
	function AddPos(x,y)
	{
		if ( !InitialPos )
			throw "Relative move when InitialPos is null";
		x += InitialPos[0];
		y += InitialPos[1];
		SetPos(x,y);
	}
	
	function ClosePath()
	{
		//	re-add first coord
		const xy = CurrentLine[0];
		SetPos( ...xy );
	}
	
	
	
	function ProcessArc(RadiusX,RadiusY,Rotation,Arc,Sweep,EndX,EndY)
	{
		Pop.Debug('ProcessArc');
		//	for now grab points
		const PointCount = 10;

		const p0 = {};
		p0.x = CurrentPos[0];
		p0.y = CurrentPos[1];
		const p1 = {};
		p1.x = EndX;
		p1.y = EndY;
		for ( let t=0;	t<=1;	t+=1/PointCount)
		{
			//	https://github.com/MadLittleMods/svg-curve-lib/blob/master/src/js/svg-curve-lib.js#L79
			const Point = GetPointOnArc(p0, RadiusX, RadiusY, Rotation, Arc, Sweep, p1, t);
			ProcessLine( Point.x, Point.y );
		}
	}

	function ProcessArcRelative(RadiusX,RadiusY,Rotation,Arc,Sweep,EndX,EndY)
	{
		EndX += CurrentPos[0];
		EndY += CurrentPos[1];
		ProcessArc(RadiusX,RadiusY,Rotation,Arc,Sweep,EndX,EndY);
	}

	
	function ProcessBezier(ControlX0,ControlY0,ControlX1,ControlY1,EndX,EndY)
	{
		//	for now, turn into points
		const Control0 = [ControlX0,ControlY0];
		const Control1 = [ControlX1,ControlY1];
		const Start = CurrentPos.slice();
		const End = [EndX,EndY];
		const PointCount = 10;
		
		for ( let t=0;	t<=1;	t+=1/PointCount)
		{
			//const Pos = Math.GetCatmullPosition(Prev,Start,End,Next,t);
			//const Pos = Math.GetCatmullPosition( Start,Control0,Control1,End,t);
			const Pos = Math.GetBezier4Position( Start,Control0,Control1,End,t);
			ProcessLine( ...Pos );
		}
		
		LastBezierControl1Point = Control1.slice();
	}
	
	function ProcessBezierRelative(ControlX0,ControlY0,ControlX1,ControlY1,EndX,EndY)
	{
		ControlX0 += CurrentPos[0];
		ControlY0 += CurrentPos[1];
		ControlX1 += CurrentPos[0];
		ControlY1 += CurrentPos[1];
		EndX += CurrentPos[0];
		EndY += CurrentPos[1];
		ProcessBezier( ControlX0, ControlY0, ControlX1, ControlY1, EndX, EndY );
	}
	
	function ProcessBezierReflection(ControlX1,ControlY1,EndX,EndY)
	{
		//	Basically a C command that assumes the first bezier
		//	control point is a reflection of the last bezier point
		//	used in the previous S or C command
		
		//	from spec
		//	The first control point is assumed to be the reflection
		//	of the second control point on the previous command relative
		//	to the current point.
		
		//	If there is no previous command or if the previous command was not an
		//	C, c, S or s, assume the first control point is coincident with the
		//	current point.
		
		if ( !LastBezierControl1Point )
		{
			//	todo: is this coincident?
			LastBezierControl1Point = CurrentPos.slice();
		}
		
		let LastControlDeltaX = LastBezierControl1Point[0] - CurrentPos[0];
		let LastControlDeltaY = LastBezierControl1Point[1] - CurrentPos[1];

		let ControlX0 = CurrentPos[0] + -LastControlDeltaX;
		let ControlY0 = CurrentPos[1] + -LastControlDeltaY;
		ProcessBezier( ControlX0, ControlY0, ControlX1, ControlY1, EndX, EndY );
	}
	
	function ProcessBezierReflectionRelative(ControlX1,ControlY1,EndX,EndY)
	{
		ControlX1 += InitialPos[0];
		ControlY1 += InitialPos[1];
		EndX += InitialPos[0];
		EndY += InitialPos[1];
		ProcessBezierReflection( ControlX1, ControlY1, EndX, EndY );
	}
	
	function ProcessQuadratic(ControlX,ControlY,EndX,EndY)
	{
		Pop.Debug("todo: process quadratic");
		ProcessLine( EndX, EndY );
	}
	
	function ProcessQuadraticRelative(ControlX,ControlY,EndX,EndY)
	{
		ControlX += InitialPos[0];
		ControlY += InitialPos[1];
		EndX += InitialPos[0];
		EndY += InitialPos[1];
		ProcessQuadratic( ControlX, ControlY, EndX, EndY );
	}
	
	function ProcessQuadraticReflection(EndX,EndY)
	{
		Pop.Debug("todo: process quadratic reflection");
		ProcessLine( EndX, EndY );
	}
	
	function ProcessQuadraticReflectionRelative(EndX,EndY)
	{
		EndX += InitialPos[0];
		EndY += InitialPos[1];
		ProcessQuadraticReflection( EndX, EndY );
	}
	
	function ProcessLine(x,y)
	{
		if ( x === undefined )	x = CurrentPos[0];
		if ( y === undefined )	y = CurrentPos[1];
		SetPos( x, y );
	}
	
	function ProcessLineRelative(x,y)
	{
		if ( x !== undefined )
			x += InitialPos[0];
		if ( y !== undefined )
			y += InitialPos[1];
		ProcessLine( x, y );
	}
	
	function ProcessHorzLine(x)
	{
		ProcessLine(x,undefined);
	}
	
	function ProcessHorzLineRelative(x)
	{
		ProcessLineRelative(x,undefined);
	}

	function ProcessVertLine(y)
	{
		ProcessLine(undefined,y);
	}
	
	function ProcessVertLineRelative(y)
	{
		ProcessLineRelative(undefined,y);
	}

	
	while ( Commands.length )
	{
		function CmdHasArguments(Cmd)
		{
			return (Cmd != 'Z' && Cmd != 'z');
		}

		const Cmd = Commands.shift();
		//	gr: close path doesn't take params
		const Args = CmdHasArguments(Cmd) ? Commands.shift() : [];
		
		do
		{
			function Call(Function,NumberOfArgs)
			{
				Function( ...Args.splice(0,NumberOfArgs) );
			}
		
			switch(Cmd)
			{
				//	gr: Move shouldn't draw a line?
				case 'M':	NewShape();	Call(SetInitialPos,2);	break;
				case 'm':	NewShape();	Call(AddPos,2);		break;
				case 'L':	Call(ProcessLine,2);			break;
				case 'l':	Call(ProcessLineRelative,2);	break;
				case 'H':	Call(ProcessHorzLine,1);		break;
				case 'h':	Call(ProcessHorzLineRelative,1);	break;
				case 'V':	Call(ProcessVertLine,1);	break;
				case 'v':	Call(ProcessVertLineRelative,1);	break;
				case 'A':	Call(ProcessArc,7);	break;
				case 'a':	Call(ProcessArcRelative,7);	break;
				case 'C':	Call(ProcessBezier,6);	break;
				case 'c':	Call(ProcessBezierRelative,6);	break;
				case 'S':	Call(ProcessBezierReflection,4);	break;
				case 's':	Call(ProcessBezierReflectionRelative,4);	break;
				case 'Z':	ClosePath(); 	break;
				case 'z':	ClosePath();	break;
				case 'Q':	Call(ProcessQuadratic,4);	break;
				case 'q':	Call(ProcessQuadraticRelative,4);	break;
				case 'T':	Call(ProcessQuadraticReflection,2);	break;
				case 't':	Call(ProcessQuadraticReflectionRelative,2);	break;
				default:	throw `Unhandled path command ${Cmd}`;
			}
			if ( Args.length > 0 )
				Pop.Debug(`Multiple iteration of path command ${Cmd}`);
		}
		while(Args.length > 0);
	}
	//	terminate last line
	NewShape();
	
	return Shapes;
}

function ParseSvgPathCommands(Commands)
{
	//	https://css-tricks.com/svg-path-syntax-illustrated-guide/
	
	//	with split(), having (groups) means delim is kept
	const IsCommandPattern = new RegExp('([a-zA-Z]{1})','g');
	//	this regex is careful to split..
	//		12.45-67.89
	//		12.34.56	(12.34 and 0.56)
	///[+-]?([0-9]*[.])?[0-9]+/
	const IsNumber = new RegExp('[+-]?([0-9]*[.])?[0-9]+','g');

	function StringToFloats(String)
	{
		//	find all floats
		const Matches = [...String.matchAll(IsNumber)];
		let Floats = Matches.map( m => m[0] );
		Pop.Debug(`Floats: ${String}`,Matches);
		
		Floats = Floats.map( parseFloat );
		if ( Floats.some( isNaN ) )
			throw "String (" + String + ") failed to turn to floats: " + Floats;
		return Floats;
	}
	
	function ConvertIfNumbers(Command)
	{
		if ( Command.match(IsCommandPattern) )
			return Command;
		
		//	assume is array of floats, convert
		const Floats = StringToFloats(Command);
		return Floats;
	}
	
	//	split into commands & coords
	Pop.Debug(`ParseSvgPathCommands(${Commands})`);
	const Matches = Commands.split(IsCommandPattern);
	const MatchesNotEmpty = Matches.filter( s => s.length );
	const MatchesWithFloats = MatchesNotEmpty.map(ConvertIfNumbers);
	//const Matches = [...Commands.matchAll( Pattern )];
	Pop.Debug(MatchesWithFloats);
	
	const Shapes = ProcessPathCommands(MatchesWithFloats);
	return Shapes;
}

Pop.Svg.ParseShapes = function(Contents,OnShape)
{
	let Svg = Pop.Xml.Parse(Contents);
	//	note: the DOMParser in chrome turns this into a proper svg object, not just a structure
	Svg = CleanSvg(Svg);
	Pop.Debug( JSON.stringify(Svg) );
	
	//	name for each shape is group/group/name
	const PathSeperator = '/';
	
	const Meta = Svg.svg;
	const Bounds = StringToFloats( Svg.ViewBox );
	
	function NormaliseSize(Value)
	{
		if ( Array.isArray(Value) )
		{
			const NormValues = Value.map(NormaliseSize);
			return NormValues;
		}
		
		//Pop.Debug("Normalise", Value);
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
			return String;
		
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
	
	
	function ParseCircle(Node,ChildIndex,Path)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;

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
	
	function ParseEllipse(Node,ChildIndex,Path)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;

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
	
	function ParsePath(Node,ChildIndex,Path)
	{
		Pop.Debug(`ParsePath(${Node.id})`);
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;

		//	get all shapes from the path and output them
		const PathShapes = ParseSvgPathCommands(Node['d']);

		function PushShape(PathShape)
		{
			//	todo: need to normalise control points etc too when outputting renderable shapes
			if ( PathShape.Line )
				PathShape.Line.Points = PathShape.Line.Points.map( NormaliseSize );
			
			const OutputShape = Object.assign({},Shape);
			Object.assign( OutputShape, PathShape );

			//	gr: as we're currently only making lines, force a stroke
			if ( OutputShape.Style.stroke == "none" )
			{
				OutputShape.Style.stroke = OutputShape.Style.fill;
			}
			Pop.Debug(`Path line x${PathShape.Line.Points.length}`,PathShape);
			
			OnShape( OutputShape );
		}
		PathShapes.forEach( PushShape );
	}
	
	function ParsePolygon(Node,ChildIndex,Path)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;

		Shape.Polygon = {};
		Shape.Polygon.Points = StringToFloat2Coords(Node['points']);
		
		OnShape(Shape);
	}
	
	function ParseLine(Node,ChildIndex,Path)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;

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
	
	function ParsePolyLine(Node,ChildIndex,Path)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;

		Shape.Line = {};
		Shape.Line.Points = StringToFloat2Coords(Node['points']);
		
		OnShape( Shape );
	}
	
	function ParseRect(Node,ChildIndex,Path)
	{
		const Shape = {};
		Shape.Style = Node.Style;
		Shape.Name = Node.id;
		Shape.Path = Path + PathSeperator;
		Shape.Path += (Node.id!==undefined) ? Node.id : ChildIndex;
		
		let x = StringToCoord( Node['x'] ) || 0;
		let y = StringToCoord( Node['y'] ) || 0;
		let w = StringToSize( Node['width'] );
		let h = StringToSize( Node['height'] );
		
		Shape.Rect = {};
		Shape.Rect.x = x;
		Shape.Rect.y = y;
		Shape.Rect.w = w;
		Shape.Rect.h = h;
		
		OnShape( Shape );
	}
	
	
	function ParseShape(Node,ChildIndex,Path)
	{
		try
		{
			switch ( Node.Type )
			{
				case 'path':		return ParsePath(Node,ChildIndex,Path);
				case 'circle':		return ParseCircle(Node,ChildIndex,Path);
				case 'ellipse':		return ParseEllipse(Node,ChildIndex,Path);
				case 'polygon':		return ParsePolygon(Node,ChildIndex,Path);
				case 'rect':		return ParseRect(Node,ChildIndex,Path);
				case 'line':		return ParseLine(Node,ChildIndex,Path);
				case 'polyline':	return ParsePolyLine(Node,ChildIndex,Path);
			}
			throw `Unhandled node type ${Node.Type} at ${Path}[${ChildIndex}]`;
		}
		catch(e)
		{
			Pop.Debug(`Failed to parse shape ${Node.Type}; ${e}`);
		}
	}
	
	function ParseNode(Node,NodeIndex,Path)
	{
		//	is a shape
		if ( Node.Type )
		{
			ParseShape(Node,NodeIndex,Path);
		}
		
		//	is a group
		if ( Node.Children )
		{
			let GroupName = Node.Name;
			if ( GroupName === undefined )
			{
				if ( NodeIndex !== null )
				{
					GroupName = `Group${NodeIndex}`;
				}
				else
				{
					//	root!
					GroupName = '';
				}
			}
			
			if ( Path === null || Path.length == 0 )
				Path = '';
			else
				Path += PathSeperator;
			const ChildPath = Path + GroupName;
			function ParseChild(ChildNode,ChildIndex)
			{
				ParseNode( ChildNode, ChildIndex, ChildPath );
			}
			Node.Children.forEach(ParseChild);
		}
	}
	ParseNode( Svg.Root, null, null );
}
