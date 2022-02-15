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
	
	let AddTriangle = function(a,b,c,Normal)
	{
		PositionData.push( ...a.slice(0,3) );
		PositionData.push( ...b.slice(0,3) );
		PositionData.push( ...c.slice(0,3) );
		UvData.push( ...a.slice(3,5) );
		UvData.push( ...b.slice(3,5) );
		UvData.push( ...c.slice(3,5) );
		NormalData.push( ...Normal );
		NormalData.push( ...Normal );
		NormalData.push( ...Normal );
	}
	
	//	top left near bottom right far
	let tln = [Min,MinY,Min,		0,0];
	let trn = [Max,MinY,Min,		1,0];
	let brn = [Max,MaxY,Min,		1,1];
	let bln = [Min,MaxY,Min,		0,1];
	let tlf = [Min,MinY,Max,		0,0];
	let trf = [Max,MinY,Max,		1,0];
	let brf = [Max,MaxY,Max,		1,1];
	let blf = [Min,MaxY,Max,		0,1];
	
	
	//	near
	AddTriangle( tln, trn, brn,	[0,0,-1] );
	AddTriangle( brn, bln, tln,	[0,0,-1] );
	//	far
	AddTriangle( trf, tlf, blf,	[0,0,1] );
	AddTriangle( blf, brf, trf,	[0,0,1] );
	
	//	top
	AddTriangle( tln, tlf, trf,	[0,-1,0] );
	AddTriangle( trf, trn, tln,	[0,-1,0] );
	//	bottom
	AddTriangle( bln, blf, brf,	[0,1,0] );
	AddTriangle( brf, brn, bln,	[0,1,0] );
	
	//	left
	AddTriangle( tlf, tln, bln,	[-1,0,0] );
	AddTriangle( bln, blf, tlf,	[-1,0,0] );
	//	right
	AddTriangle( trn, trf, brf,	[1,0,0] );
	AddTriangle( brf, brn, trn,	[1,0,0] );
	
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


export function CreateBlitQuadGeometry()
{
	let l = 0;
	let t = 0;
	let r = 1;
	let b = 1;
	const VertexData = [	l,t,	r,t,	r,b,	r,b, l,b, l,t	];
	
	const TexCoord = {};
	TexCoord.Size = 2;
	TexCoord.Data = VertexData;

	const Geometry = {};
	Geometry.TexCoord = TexCoord;
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
