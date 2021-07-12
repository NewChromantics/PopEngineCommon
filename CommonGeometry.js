const Default = `Common geometry generating functions`;
export default Default;


export function CreateCubeGeometry(Min=-1,Max=1)
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
	
	//	top left near bottom right far
	let tln = [Min,Min,Min,		0,0];
	let trn = [Max,Min,Min,		1,0];
	let brn = [Max,Max,Min,		1,1];
	let bln = [Min,Max,Min,		0,1];
	let tlf = [Min,Min,Max,		0,0];
	let trf = [Max,Min,Max,		1,0];
	let brf = [Max,Max,Max,		1,1];
	let blf = [Min,Max,Max,		0,1];
	
	
	//	near
	AddTriangle( tln, trn, brn );
	AddTriangle( brn, bln, tln );
	//	far
	AddTriangle( trf, tlf, blf );
	AddTriangle( blf, brf, trf );
	
	//	top
	AddTriangle( tln, tlf, trf );
	AddTriangle( trf, trn, tln );
	//	bottom
	AddTriangle( bln, blf, brf );
	AddTriangle( brf, brn, bln );
	
	//	left
	AddTriangle( tlf, tln, bln );
	AddTriangle( bln, blf, tlf );
	//	right
	AddTriangle( trn, trf, brf );
	AddTriangle( brf, brn, trn );
	
	const Attributes = {};
	Attributes.LocalPosition = {};
	Attributes.LocalPosition.Size = 3;
	Attributes.LocalPosition.Data = new Float32Array(PositionData);

	Attributes.LocalUv = {};
	Attributes.LocalUv.Size = 2;
	Attributes.LocalUv.Data = new Float32Array(UvData);
	
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
