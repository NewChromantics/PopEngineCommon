Pop.Collada = {};

Pop.Collada.Parse = function(Contents,OnActor,OnSpline)
{
	if ( Contents.startsWith('<?xml') )
		throw "Convert collada file from xml to json first http://www.utilities-online.info/xmltojson";
	
	const ColladaTree = JSON.parse( Contents );
	const GeoLibrary = ColladaTree.COLLADA.library_geometries.geometry;
	const CameraLibrary = ColladaTree.COLLADA.library_cameras;
	const SceneLibrary = [ColladaTree.COLLADA.library_visual_scenes.visual_scene];

	const UnitScalarString = ColladaTree.COLLADA.asset.unit['-meter'];
	const UnitScalar = parseFloat( UnitScalarString );
	if ( isNaN( UnitScalar ) )
		throw "Unit scalar is nan; " + UnitScalarString;
	
	let parseScaledFloat = function(FloatString)
	{
		let Float = parseFloat( FloatString );
		Float *= UnitScalar;
		return Float;
	}
	
	let FindScene = function(Url)
	{
		let MatchUrl = function(Asset)
		{
			const AssetUrl = '#' + Asset['-id'];
			return AssetUrl == Url;
		}
		const FirstMatch = SceneLibrary.find(MatchUrl);
		return FirstMatch;
	}
	
	let FindGeometry = function(Url)
	{
		let MatchUrl = function(Asset)
		{
			const AssetUrl = '#' + Asset['-id'];
			return AssetUrl == Url;
		}
		const FirstMatch = GeoLibrary.find(MatchUrl);
		return FirstMatch;
	}
	
	const MainSceneUrl = ColladaTree.COLLADA.scene.instance_visual_scene["-url"];
	const MainScene = FindScene(MainSceneUrl);
	const MainSceneNodes = MainScene.node;
	
	let ParseVector = function(Property,ParseFloat=undefined)
	{
		ParseFloat = ParseFloat || parseFloat;
		
		//	recurse if array (rotation)
		if ( Array.isArray(Property) )
		{
			let Vectors = [];
			Property.forEach( p => Vectors.push( ParseVector(p,ParseFloat) ) );
			return Vectors;
		}
		
		const VectorString = Property['#text'];
		const FloatsString = VectorString.split(' ');
		let Floats = FloatsString.map( ParseFloat );
		if ( Floats.some( isNaN ) )
			throw "Nan parsed from " + VectorString + "; ";
		
		return Floats;
	}
	
	
	
	let NodeToActor = function(Node)
	{
		const Actor = {};
		//const Id = Node['-id'];
		Actor.Name = Node['-name'];
		Actor.Position = ParseVector( Node['translate'], parseScaledFloat );
		Actor.Scale = ParseVector( Node['scale'] );
		//	todo turn 4 component rotations into a matrix.
		Actor.Rotation = ParseVector( Node['rotate'] );
		
		//	todo: turn into a CreateAsset functor for the asset system
		Actor.Geometry = Node.instance_geometry ? Node.instance_geometry['-url'] : null;
		
		const GeoAsset = FindGeometry( Actor.Geometry );
		if ( !GeoAsset )
		{
			//	null actor
			Pop.Debug("Null geo actor",JSON.stringify(Actor));
		}
		else if ( GeoAsset.mesh.hasOwnProperty('linestrips') )
		{
			OnSpline( Actor );
		}
		else
		{
			OnActor( Actor );
		}
	}
	MainSceneNodes.forEach( NodeToActor );
	
}
