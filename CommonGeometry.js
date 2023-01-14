import {JoinTypedArrays} from './PopApi.js'

const Default = `Common geometry generating functions`;
export default Default;


export function CreateCubeGeometry(Min=-1,Max=1,MinY=undefined,MaxY=undefined)
{
	let PositionData = [];
	let UvData = [];
	let NormalData = [];
	
	if ( MinY === undefined )	
		MinY = Min;
	if ( MaxY === undefined )	
		MaxY = Max;
	
	let AddTriangle = function(a,b,c,Normal,Uvs)
	{
		let ReverseWinding = false;
		if ( ReverseWinding )
		{
			PositionData.push( ...c.slice(0,3) );
			PositionData.push( ...b.slice(0,3) );
			PositionData.push( ...a.slice(0,3) );
		}
		else
		{
			PositionData.push( ...a.slice(0,3) );
			PositionData.push( ...b.slice(0,3) );
			PositionData.push( ...c.slice(0,3) );
		}
		UvData.push( ...Uvs[0] );
		UvData.push( ...Uvs[1] );
		UvData.push( ...Uvs[2] );
		NormalData.push( ...Normal );
		NormalData.push( ...Normal );
		NormalData.push( ...Normal );
	}
	
	//	top left near bottom right far
	let tln = [Min,MinY,Min];
	let trn = [Max,MinY,Min];
	let brn = [Max,MaxY,Min];
	let bln = [Min,MaxY,Min];
	let tlf = [Min,MinY,Max];
	let trf = [Max,MinY,Max];
	let brf = [Max,MaxY,Max];
	let blf = [Min,MaxY,Max];
	
	const UvFirstTriangle = [ [0,0], [1,0], [1,1] ];
	const UvSecondTriangle = [ [1,1], [0,1], [0,0] ];
	
	//	near
	AddTriangle( brn, trn, tln,	[0,0,-1], UvFirstTriangle );
	AddTriangle( tln, bln, brn,	[0,0,-1], UvSecondTriangle );

	//	far
	AddTriangle( trf, tlf, blf,	[0,0,1], UvFirstTriangle );
	AddTriangle( blf, brf, trf,	[0,0,1], UvSecondTriangle );
	
	//	top (or bottom depending on camera, it's +y)
	AddTriangle( tln, tlf, trf,	[0,-1,0], UvFirstTriangle );
	AddTriangle( trf, trn, tln,	[0,-1,0], UvSecondTriangle );
	//	bottom
	AddTriangle( brf, blf, bln,	[0,1,0], UvFirstTriangle );
	AddTriangle( bln, brn, brf,	[0,1,0], UvSecondTriangle );
	//	left
	AddTriangle( tlf, tln, bln,	[-1,0,0], UvFirstTriangle );
	AddTriangle( bln, blf, tlf,	[-1,0,0], UvSecondTriangle );
	
	//	right
	AddTriangle( trn, trf, brf,	[1,0,0], UvFirstTriangle );
	AddTriangle( brf, brn, trn,	[1,0,0], UvSecondTriangle );
	
	const Attributes = {};
	Attributes.LocalPosition = {};
	Attributes.LocalPosition.Size = 3;
	Attributes.LocalPosition.Data = new Float32Array(PositionData);

	Attributes.LocalUv = {};
	Attributes.LocalUv.Size = 2;
	Attributes.LocalUv.Data = new Float32Array(UvData);
	
	Attributes.LocalNormal = {};
	Attributes.LocalNormal.Size = 3;
	Attributes.LocalNormal.Data = new Float32Array(NormalData);
	
	return Attributes;
}


export function CreateQuad3Geometry(Min=-1,Max=1)
{
	let PositionData = [];
	let UvData = [];
	
	let AddTriangle = function(a,b,c)
	{
		PositionData.push( ...a.slice(0,3) );
		PositionData.push( ...b.slice(0,3) );
		PositionData.push( ...c.slice(0,3) );
		UvData.push( ...a.slice(3,5) );
		UvData.push( ...b.slice(3,5) );
		UvData.push( ...c.slice(3,5) );
	}
	
	const y = 0;
	
	//	top left near bottom right far
	let tln = [Min,y,Min,		0,0];
	let trn = [Max,y,Min,		1,0];
	let tlf = [Min,y,Max,		0,1];
	let trf = [Max,y,Max,		1,1];
	
	//	top
	AddTriangle( tln, tlf, trf );
	AddTriangle( trf, trn, tln );
	
	const Attributes = {};
	Attributes.LocalPosition = {};
	Attributes.LocalPosition.Size = 3;
	Attributes.LocalPosition.Data = new Float32Array(PositionData);

	Attributes.LocalUv = {};
	Attributes.LocalUv.Size = 2;
	Attributes.LocalUv.Data = new Float32Array(UvData);
	
	return Attributes;
}

export function CreateBlitQuadGeometry(Rect=[0,0,1,1],Attrib='TexCoord')
{
	let l = Rect[0];
	let t = Rect[1];
	let r = Rect[0]+Rect[2];
	let b = Rect[1]+Rect[3];
	const VertexData = [	l,t,	r,t,	r,b,	r,b, l,b, l,t	];

	const TexCoord = {};
	TexCoord.Size = 2;
	TexCoord.Data = VertexData;

	const Geometry = {};
	Geometry[Attrib] = TexCoord;
	return Geometry;
}

export function MergeGeometry(Geometrys)
{
	if ( Geometrys.length <= 1 )
		return Geometrys[0];
		
	//	todo: need to verify matching attribs etc
	const Attribs = Object.keys(Geometrys[0]);
	
	const MergedGeometry = {};
	
	for ( let Attrib of Attribs )
	{
		//	todo: check .Size is same all
		const AttribDatas = Geometrys.map( g => g[Attrib].Data );
		MergedGeometry[Attrib] = {};
		MergedGeometry[Attrib].Data = JoinTypedArrays(AttribDatas);
		MergedGeometry[Attrib].Size = Geometrys[0][Attrib].Size;
	}
	return MergedGeometry;
}
