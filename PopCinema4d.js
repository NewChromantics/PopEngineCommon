Pop.Cinema4d = {};

//	v8 cannot parse json where there's newlines and tabs in a value
//	which http://www.utilities-online.info/xmltojson spits out
//	the webpage should be using \t and \n
Pop.CleanJson = function(Json)
{
	//	match value with a string
	let regex = new RegExp('"[^\\"]+"[\\s]*:[\\s]*"[\\s0-9a-f]+"','g');
	let Replace = function(Match)
	{
		//Pop.Debug("Match is ",Match);
		//Pop.Debug(...arguments);
		Match = Match.replace( new RegExp('\n','g'), '\\n' );
		Match = Match.replace( new RegExp('\t','g'), '\\t' );
		return Match;
	}
	Json = Json.replace(regex, Replace);
	//Pop.Debug(Contents);
	return Json;
}

Pop.Cinema4d.Parse = function(Contents,OnActor,OnSpline)
{
	if ( Contents.startsWith('<?xml') )
		throw "Convert cinema4d file from xml to json first http://www.utilities-online.info/xmltojson";
	
	Contents = Pop.CleanJson(Contents);
	
	const DocumentTree = JSON.parse( Contents );
	const NodeTree = DocumentTree.c4d_file.v6_basedocument.v6_root_object.v6_rootlist2d;
	
	let Nodes = NodeTree.obj_pluginobject;
	let NodeSplines = [NodeTree.obj_spline];
	
	let ParseFloatPosition = function(Float)
	{
		Float = parseFloat( Float );
		Float /= 10;
		return Float;
	}
	
	let VectorToArray = function(Vector)
	{
		let x = ParseFloatPosition( Vector['-x'] );
		let y = ParseFloatPosition( Vector['-y'] );
		let z = ParseFloatPosition( Vector['-z'] );
		return [x,y,z];
	}
	
	let StringToNodeName = function(String)
	{
		String = String['-v'];
		String = String.replace(' ','_');
		return String;
	}
	
	let ParseNode = function(Node)
	{
		let Actor = {};
		Actor.Name = StringToNodeName( Node.v6_baselist2d.string );
		Actor.Position = VectorToArray( Node.v6_baseobject.vector[0] );
		
		//Pop.Debug(Node,Actor);
		return Actor;
	}
	
	let ParseSpline = function(Node)
	{
		let Actor = {};
		Actor.Name = StringToNodeName(Node.v6_baselist2d.string);
		//Actor.Position = VectorToArray( Node.v6_baseobject.vector[0] );
		
		let PositionVectors = Node.v6_root_tag.v6_rootlist2d.tag_hermite2d.tag_hermite2d.vector;
		
		Actor.PathPositions = PositionVectors.map( VectorToArray );
		
		Pop.Debug('Actor.PathPositions',Actor.PathPositions);
		
		//	maybe this
		//	https://www.shadertoy.com/view/4sS3Wc
		/*
		let HermiteD = function(x,a,b,e,f)
		{
			return b+0.5 * x * (e+b-a+x*(a-b+e+x*3.0*(e*3.0+f+x*5.0/3.0*(-e*3.0-f+x*0.4*(e*3.0+f))))));
		}
		
		let Hermite = function(x,a,b,c,d)
		{
			return HermiteD( x, a, b, (c-b), (a-d) );
		}
		*/
	
		//	debug spline points
		let PositionAsActor = function(Position,Index)
		{
			if ( Index % 4 != 0 )
			{
				//return;
			}
			let Actor = {};
			Actor.Name = 'actor'+Index;
			Actor.Position = Position;
			OnActor( Actor );
		}
		//Actor.PathPositions.forEach( PositionAsActor );
		
		Pop.Debug(Node,Actor);
		return Actor;
	}
	
	let Actors = Nodes.map( ParseNode );
	let Splines = NodeSplines.map( ParseSpline );
	Actors.forEach( OnActor );
	Splines.forEach( OnSpline );
}
