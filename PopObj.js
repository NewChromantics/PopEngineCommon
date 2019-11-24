Pop.Obj = {};

Pop.Obj.Parse = function(Contents,OnVertex)
{
	let Obj = {};
	Obj.Prefix_Comment = '#';
	Obj.Prefix_Position = 'v ';
	Obj.Prefix_Normal = 'vn ';
	Obj.Prefix_TexCoord = 'vt ';
	Obj.Prefix_Material = 'mtllib ';
	Obj.Prefix_Object = 'o ';
	Obj.Prefix_Face = 'f ';
	Obj.Prefix_SmoothShading = 's ';
	Obj.Prefix_Scale = '# Scale ';

	Pop.Debug("Contents.length",Contents.length);
	const Lines = Contents.split('\n');

	let Scale = 1.0;

	const ParsePositionFloat = function(FloatStr)
	{
		let f = parseFloat( FloatStr );
		f *= Scale;
		return f;
	}
	
	
	const ParseLine = function(Line)
	{
		Line = Line.trim();
		
		//	gr: added a scale key
		if ( Line.startsWith(Obj.Prefix_Scale) )
		{
			Line = Line.replace( Obj.Prefix_Scale,'');
			Scale = parseFloat( Line );
			Pop.Debug("Found scale in obj: ",Scale);
			return;
		}

		if ( !Line.startsWith(Obj.Prefix_Position) )
			return;

		let pxyx = Line.split(' ');
		if ( pxyx.length != 4 )
		{
			Pop.Debug("ignoring line", Line, pxyx.length);
			return;
		}
		let x = ParsePositionFloat( pxyx[1] );
		let y = ParsePositionFloat( pxyx[2] );
		let z = ParsePositionFloat( pxyx[3] );
		OnVertex( x,y,z );
	}
	
	Lines.forEach( ParseLine );
}


//	new Object{} output
//	.Positions
//	.Normals
//	.Uv0
//	.Triangles
Pop.Obj.ParseGeometry = function(Contents,OnGeometry)
{
	Pop.Debug("Contents.length",Contents.length);
	const Lines = Contents.split('\n');
	
	let Scale = 1.0;
	
	const ParsePositionFloat = function(FloatStr)
	{
		let f = parseFloat( FloatStr );
		f *= Scale;
		return f;
	}
	
	
	//	obj lists vertex attributes as it goes, interleaved with objects
	//	but attribs aren't neccessarily 1:1:1
	//	we don't know when a list is finished, so flush a vertex when a face references it
	const Positions = [];	//	array of [x,y,z...]
	const Normals = [];		//	array of [x,y,z...]
	const TexCoords = [];	//	array of [u,v,w...]
	let Triangles = [];	//	array of 3x [v,v,v] Vertexes indexes
	let VertexPositions = [];	//	unrolled positions per vertex
	let VertexNormals = [];	//	unrolled positions per vertex
	let VertexTexCoords = [];	//	unrolled positions per vertex

	let CurrentGeo = null;
	
	function FlushCurrentGeo()
	{
		if ( !CurrentGeo )
			return;
		
		const Geometry = Object.assign( {}, CurrentGeo );
		Geometry.Positions = VertexPositions.length ? VertexPositions : undefined;
		Geometry.Normals = VertexNormals.length ? VertexNormals : undefined;
		Geometry.TexCoords = VertexTexCoords.length ? VertexTexCoords : undefined;
		Geometry.TriangleIndexes = Triangles;
		OnGeometry( Geometry );
		
		
		//	setup for new geo
		Triangles = [];	//	array of 3x [v,v,v] Vertexes indexes
		VertexPositions = [];	//	unrolled positions per vertex
		VertexNormals = [];	//	unrolled positions per vertex
		VertexTexCoords = [];	//	unrolled positions per vertex
		CurrentGeo = null;
	}
	
	function OnComment()
	{
	}
	
	//	returns new vertex index
	function OnVertex(PositionIndex,TexCoordIndex,NormalIndex)
	{
		//	indexes start from 1
		if ( PositionIndex )	PositionIndex--;
		if ( NormalIndex )		NormalIndex--;
		if ( TexCoordIndex )	TexCoordIndex--;
		
		//	gr: spreading here is gonna cause problems later when we have something with non-3 components
		//		should unroll later
		if ( PositionIndex !== undefined )
			VertexPositions.push( ...Positions[PositionIndex] );
		if ( NormalIndex !== undefined )
			VertexNormals.push( ...Normals[NormalIndex] );
		if ( TexCoordIndex !== undefined )
			VertexTexCoords.push( ...TexCoords[TexCoordIndex] );
		
		//	check all the arrays align
		const Lengths =
		[
		 VertexPositions.length,
		 VertexNormals.length,
		 VertexTexCoords.length,
		].filter( l => l>0 );
		
		//	check all same
		if ( !Lengths.every( l => l==Lengths[0] ) )
			throw "Vertex attribute arrays misaligned";
		
		//	return new index
		return Lengths[0]-1;
	}
	
	function OnFace(Face)
	{
		//	Face is [ p/n/t, p/n/t, p/n/t ... ]
		
		//	split the face into triangles
		if ( Face.length < 3 )
			throw "OBJ face has less than 3 points";
		if ( Face.length == 4 )
		{
			//	we don't have to recurse, but for now...
			//	https://stackoverflow.com/a/23724231/355753
			//	order for quad restarts at 0 so it's always triangle fan?
			const t0 = [0,1,2];
			const t1 = [0,2,3];
			OnFace( t0.map( i => Face[i] ) );
			OnFace( t1.map( i => Face[i] ) );
			return;
		}
		if ( Face.length != 3 )
			throw "OBJ face with " + Face.length + " != 3 points";
		
		//	flush each vertex
		const FaceVertexIndexes = [];
		function ParseFaceIndexes(FaceIndexes,FaceIndexIndex)
		{
			const Indexes = FaceIndexes.split('/');
			const VertexIndex = OnVertex( ...Indexes );
			FaceVertexIndexes.push( VertexIndex );
		}
		Face.forEach(ParseFaceIndexes);
		Triangles.push( ...FaceVertexIndexes );
	}
	
	function OnPosition(Values)
	{
		const xyz = Values.map( ParsePositionFloat );
		Positions.push( xyz );
	}
	
	function OnNormal(Values)
	{
		Normals.push( Values );
	}

	function OnTexCoord(Values)
	{
		TexCoords.push( Values );
	}

	function OnScale()
	{
		Scale = parseFloat( Line );
		Pop.Debug("Found scale in obj: ",Scale);
	}
	
	function OnMaterialAsset()
	{
	}
	
	function OnMaterial()
	{
	}

	function OnObject(Names)
	{
		const Name = Names.join(' ');
		
		//	order CAN go
		//	verts
		//	geo
		//	faces
		//	so we flush if there's already one
		FlushCurrentGeo();
		
		//	todo: flush current face list
		CurrentGeo = {};
		CurrentGeo.Name = Name;
	}
	
	function OnGroup(Names)
	{
		OnObject( Names );
	}

	function OnSmoothShading()
	{
	}


	const ParseFuncTable = {};
	ParseFuncTable['# Scale '] = OnScale;
	ParseFuncTable['#'] = OnComment;
	ParseFuncTable['v '] = OnPosition;
	ParseFuncTable['vn '] = OnNormal;
	ParseFuncTable['vt '] = OnTexCoord;
	ParseFuncTable['mtllib '] = OnMaterialAsset;
	ParseFuncTable['usemtl '] = OnMaterial;
	ParseFuncTable['g '] = OnGroup;
	ParseFuncTable['o '] = OnObject;
	ParseFuncTable['f '] = OnFace;
	ParseFuncTable['s '] = OnSmoothShading;

	const ParseLine = function(Line)
	{
		Line = Line.trim();
		if ( !Line.length )
			return;
		
		//	gr: this depends on the table's keys being on populated-order as
		//		we want scale to come before comments
		let ParseFunc = null;
		for ( let Command in ParseFuncTable )
		{
			if ( !Line.startsWith(Command) )
				continue;
			
			//	get func and remove prefix
			ParseFunc = ParseFuncTable[Command];
			Line = Line.replace( Command,'');
			break;
		}

		if ( !ParseFunc )
		{
			Pop.Debug("OBJ skipping unknown prefixed line", Line );
			return;
		}
		
		//	split spaces (&trim)
		const LineParts = Line.split(' ').filter( x => x.length != 0 );
		
		ParseFunc( LineParts );
	}
	
	Lines.forEach( ParseLine );
	
	//	finish off any geo
	FlushCurrentGeo();
}
