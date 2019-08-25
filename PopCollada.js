Pop.Collada = {};

Pop.Collada.Parse = function(Contents,OnActor,OnSpline)
{
	if ( Contents.startsWith('<?xml') )
		throw "Convert collada file from xml to json first http://www.utilities-online.info/xmltojson";
	
	const ColladaTree = JSON.parse( Contents );
	const GeoLibrary = ColladaTree.COLLADA.library_geometries.geometry;
	const CameraLibrary = ColladaTree.COLLADA.library_cameras;
	const SceneLibrary = [ColladaTree.COLLADA.library_visual_scenes.visual_scene];
	const AnimationLibrary = ColladaTree.COLLADA.library_animations ? ColladaTree.COLLADA.library_animations.animation.animation : [];
	//Pop.Debug('AnimationLibrary',AnimationLibrary);

	
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
	
	const ParseVector = function(Property,ParseFloat=undefined)
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
	
	const ParseVectorArray = function(Property,VectorSize,ParseFloat)
	{
		VectorSize = VectorSize || 1;
		let Floats = ParseVector( Property, ParseFloat );
		
		//	dont array single values
		if ( VectorSize == 1 )
			return Floats;
		
		let Vectors = [];
		for ( let i=0;	i<Floats.length;	i+=VectorSize )
		{
			Vectors.push( Floats.slice( i, i+VectorSize ) );
		}
		return Vectors;
	}
		
	
	const Actors = {};
	
	let NodeToActor = function(Node)
	{
		const Actor = {};
		const Id = Node['-id'];
		Actor.Name = Node['-name'];
		Actor.Position = ParseVector( Node['translate'], parseScaledFloat );
		Actor.Scale = ParseVector( Node['scale'] );
		//	todo turn 4 component rotations into a matrix.
		Actor.Rotation = ParseVector( Node['rotate'] );
		
		//	todo: turn into a CreateAsset functor for the asset system
		Actor.Geometry = Node.instance_geometry ? Node.instance_geometry['-url'] : null;
		
		Actors[Id] = Actor;
	};
	function GetActor(Id)
	{
		return Actors[Id];
	}
	MainSceneNodes.forEach( NodeToActor );
	
	
	const ParseStringArray = function(Node,VectorSize)
	{
		VectorSize = VectorSize || 1;
		Node = Node['#text'];
		let Strings = Node.split(' ');
		
		//	dont array single values
		if ( VectorSize == 1 )
			return Strings;
		
		let Vectors = [];
		for ( let i=0;	i<Strings.length;	i+=VectorSize )
		{
			Vectors.push( Strings.slice( i, i+VectorSize ) );
		}
		return Vectors;
	}
	
	const AnimationFrames = [];
	
	const ProcessAnimationNode = function(AnimNode)
	{
		const TargetParts = AnimNode.channel['-target'].split('/');
		const AnimProperty = TargetParts[1];
		const AnimActorId = TargetParts[0];
		
		//	make semantic map
		const Semantics = {};
		const ParseSemantic = function(Input)
		{
			const Semantic = Input['-semantic'];
			const Id = Input['-source'];
			Semantics[Id] = Semantic;
		}
		AnimNode.sampler.input.forEach( ParseSemantic );
		
		
		
		if ( !Array.isArray(AnimNode.source) )
			AnimNode.source = [AnimNode.source];
		
		const AnimSource = {};
		const ParseSource = function(Source)
		{
			let Values = [];
			let AccessorParams = Source.technique_common.accessor.param;
			if ( !Array.isArray(AccessorParams) )
				AccessorParams = [AccessorParams];
			
			const Id = Source['-id'];
			const VectorSize = AccessorParams.length;
			
			if ( Source.float_array )
				Values = ParseVectorArray( Source.float_array, VectorSize );
			else if ( Source.Name_array )
				Values = ParseStringArray( Source.Name_array, VectorSize );

			//	gr: don't need to split these
			/*
			//
			let AnimSource = [];
			let ExtractAnimSource = function(Param,Index)
			{
				const SourceName = AnimNodeName + '/' + Param['-name'];
				const SourceValues = [];
				for ( let i=0;	i<Values.length;	i++ )
					SourceValues.push( Values[i][Index] );
				if ( Anim.hasOwnProperty(SourceName) )
					Pop.Debug("Anim already has property",SourceName);
				Anim[SourceName] = SourceValues;
			}
			AccessorParams.forEach( ExtractAnimSource );
			*/
			
			//	build name with accessors
			let Name = Semantics['#'+Id];
			let AccessorNames = [];
			let AppendName = function(Param)
			{
				AccessorNames.push( Param['-name'] );
			}
			AccessorParams.forEach( AppendName );
			AnimSource[Name] = {};
			AnimSource[Name].Values = Values;
			AnimSource[Name].AccessorNames = AccessorNames;
		}
		AnimNode.source.forEach( ParseSource );
		
		const Actor = GetActor(AnimActorId);
		Actor.Anim = Actor.Anim || {};
		Actor.Anim[AnimProperty] = AnimSource;
		//Pop.Debug("Updated actor",Actor.Anim);
	}
	AnimationLibrary.forEach( ProcessAnimationNode );

	
	function ProcessActorPath(Actor)
	{
		if ( !Actor.Anim )
			return;
		
		function GetPositionComponent(PropertyName)
		{
			switch(PropertyName)
			{
				case 'translate.X':	return 0;
				case 'translate.Y':	return 1;
				case 'translate.Z':	return 2;
				default:			return null;
			}
		}
		
		Actor.PathPositions = {};
		function ProcessAnimProperty(PropertyName)
		{
			const Property = Actor.Anim[PropertyName];
			const PosIndex = GetPositionComponent(PropertyName);
			if ( PosIndex === null )
				return;
			function PushKeyframe(Time,Index)
			{
				//	position, so scale
				const Value = Property.OUTPUT.Values[Index] * UnitScalar;
				if ( !Actor.PathPositions.hasOwnProperty(Time) )
					Actor.PathPositions[Time] = [null,null,null];
				Actor.PathPositions[Time][PosIndex] = Value;
			}
			Property.INPUT.Values.forEach( PushKeyframe );
			//Pop.Debug(PropertyName,Property);
		}
		Object.keys(Actor.Anim).forEach( ProcessAnimProperty );
		//Pop.Debug("Process anim on actor",Actor.PathPositions);
	}
	
	const OutputActor = function(ActorId)
	{
		const Actor = Actors[ActorId];
		
		ProcessActorPath(Actor);
		
		if ( Actor.PathPositions )
		{
			OnSpline( Actor );
		}
		else
		{
			OnActor( Actor );
		}
	}
	Object.keys(Actors).forEach( OutputActor );
}
