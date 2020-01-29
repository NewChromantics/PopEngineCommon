//	colour conversion namespace
Pop.Colour = {};

Pop.Colour.RgbfToHex = function(Rgb)
{
	let FloatToHex = function(f)
	{
		let Byte = Math.floor(f * 255.0);
		let a = (Byte & 0xf0) >> 4;
		let b = (Byte & 0x0f) >> 0;
		let ah = a.toString(16);
		let bh = b.toString(16);
		return ah+bh;
	}

	//	to u8 first
	let HexRgb = '#' + FloatToHex(Rgb[0]) + FloatToHex(Rgb[1]) + FloatToHex(Rgb[2]);
	//Pop.Debug(Rgb,HexRgb);
	return HexRgb;
}

Math.DegToRad = function(Degrees)
{
	return Degrees * (Math.PI / 180);
}

Math.RadToDeg = function(Radians)
{
	return Radians * (180 / Math.PI);
}

Math.radians = Math.DegToRad;
Math.degrees = Math.RadToDeg;

Math.SinCos = function(Degrees)
{
	let AngleRad = Math.DegToRad( Degrees );
	let Sin = Math.sin( AngleRad );
	let Cos = Math.cos( AngleRad );
	return [Sin,Cos];
}


Math.clamp = function(min, max,Value)
{
	return Math.min( Math.max(Value, min), max);
}

Math.range = function(Min,Max,Value)
{
	return (Max==Min) ? 0 : (Value-Min) / (Max-Min);
}
Math.Range = Math.range;

Math.rangeClamped = function(Min,Max,Value)
{
	return Math.clamp( 0, 1, Math.range( Min, Max, Value ) );
}
Math.RangeClamped = Math.rangeClamped;

Math.lerp = function(Min,Max,Time)
{
	return Min + (( Max - Min ) * Time);
}
Math.Lerp = Math.lerp;

Math.LerpArray = function(Min,Max,Time)
{
	let Values = Min.slice();
	for ( let i=0;	i<Min.length;	i++ )
		Values[i] = Math.Lerp( Min[i], Max[i], Time );
	return Values;
}

Math.Lerp2 = Math.LerpArray;
Math.Lerp3 = Math.LerpArray;
Math.Lerp4 = Math.LerpArray;



Math.Dot2 = function(a,b)
{
	let Dot = (a[0]*b[0]) + (a[1]*b[1]);
	return Dot;
}

Math.Dot3 = function(a,b)
{
	let Dot = (a[0]*b[0]) + (a[1]*b[1]) + (a[2]*b[2]);
	return Dot;
}

Math.Dot4 = function(a,b)
{
	let Dot = (a[0]*b[0]) + (a[1]*b[1]) + (a[2]*b[2]) + (a[3]*b[3]);
	return Dot;
}


Math.LengthSq2 = function(xy)
{
	if ( !Array.isArray(xy) )
		throw "LengthSq2() expecting 2D xy array";
	
	let dx = xy[0];
	let dy = xy[1];
	let LengthSq = dx*dx + dy*dy;
	return LengthSq;
}


Math.LengthSq3 = function(a,b=[0,0,0])
{
	let dx = a[0] - b[0];
	let dy = a[1] - b[1];
	let dz = a[2] - b[2];
	let LengthSq = dx*dx + dy*dy + dz*dz;
	return LengthSq;
}


Math.Length2 = function(xy)
{
	if ( !Array.isArray(xy) )
		throw "Length2() expecting 2D xy array";
	
	let LengthSq = Math.LengthSq2( xy );
	let Len = Math.sqrt( LengthSq );
	return Len;
}


Math.Length3 = function(a)
{
	let LengthSq = Math.LengthSq3( [0,0,0], a );
	let Len = Math.sqrt( LengthSq );
	return Len;
}

Math.Normalise2 = function(xy,NormalLength=1)
{
	let Length = Math.Length2( xy );
	Length *= 1 / NormalLength;
	return [ xy[0]/Length, xy[1]/Length ];
}

Math.Normalise3 = function(a,NormalLength=1)
{
	let Length = Math.Length3( a );
	Length *= 1 / NormalLength;
	return [ a[0]/Length, a[1]/Length, a[2]/Length ];
}

Math.Subtract2 = function(a,b)
{
	return [ a[0]-b[0], a[1]-b[1] ];
}

Math.Subtract3 = function(a,b)
{
	return [ a[0]-b[0], a[1]-b[1], a[2]-b[2] ];
}

Math.Add3 = function(a,b)
{
	return [ a[0]+b[0], a[1]+b[1], a[2]+b[2] ];
}

Math.Multiply3 = function(a,b)
{
	return [ a[0]*b[0], a[1]*b[1], a[2]*b[2] ];
}

Math.Cross3 = function(a,b)
{
	let x = a[1] * b[2] - a[2] * b[1];
	let y = a[2] * b[0] - a[0] * b[2];
	let z = a[0] * b[1] - a[1] * b[0];
	return [x,y,z];
}


Math.Distance = function (a,b)
{
	let Delta = a - b;
	return Math.abs(Delta);
}

Math.Distance2 = function(a,b)
{
	let Delta = Math.Subtract2( a,b );
	return Math.Length2( Delta );
}

Math.Distance3 = function(a,b)
{
	let Delta = Math.Subtract3( a,b );
	return Math.Length3( Delta );
}

Math.Rotate2 = function(xy,AngleDegrees)
{
	const AngleRad = Math.DegToRad( AngleDegrees );
	const sin = Math.sin(AngleRad);
	const cos = Math.cos(AngleRad);
	
	const x = (cos * xy[0]) - (sin * xy[1]);
	const y = (sin * xy[0]) + (cos * xy[1]);
	return [x,y];
}

//	how many angles to turn A to B
Math.GetAngleDiffDegrees = function(a,b)
{
	//	make angle relative to zero
	if ( a > 180 )	a -= 360;
	if ( a < -180 )	a += 360;
	if ( b > 180 )	b -= 360;
	if ( b < -180 )	b += 360;

	return b - a;
}

function SnapRectInsideParent(Rect,ParentRect)
{
	//	don't modify original rect
	Rect = Rect.slice();
	
	//	fit bottom right
	let RectRight = Rect[0]+Rect[2];
	let ParentRight = ParentRect[0]+ParentRect[2];
	if ( RectRight > ParentRight )
		Rect[0] -= RectRight - ParentRight;
	
	let RectBottom = Rect[1]+Rect[3];
	let ParentBottom = ParentRect[1]+ParentRect[3];
	if ( RectBottom > ParentBottom )
		Rect[1] -= RectBottom - ParentBottom;
	
	//	now fit top left
	if ( Rect[0] < ParentRect[0] )
		Rect[0] = ParentRect[0];

	if ( Rect[1] < ParentRect[1] )
		Rect[1] = ParentRect[1];

	//	todo: clip, if right/bottom > parent, rect is too big
	if ( Rect[2] > ParentRect[2] )
		Rect[2] = ParentRect[2];
	if ( Rect[3] > ParentRect[3] )
		Rect[3] = ParentRect[3];

	return Rect;
}

function MakeRectSquareCentered(Rect,Grow=true)
{
	//	default to grow
	Grow = (Grow!==false);
	
	//	don't modify original rect
	Rect = Rect.slice();
	
	let PadWidth = 0;
	let PadHeight = 0;
	let w = Rect[2];
	let h = Rect[3];
	if ( w==h )
		return Rect;
	
	if ( Grow )
	{
		if ( w > h )
			PadHeight = w - h;
		else
			PadWidth = h - w;
	}
	else
	{
		if ( w > h )
			PadWidth = h - w;
		else
			PadHeight = w - h;
	}
	
	Rect[0] -= PadWidth/2;
	Rect[1] -= PadHeight/2;
	Rect[2] += PadWidth;
	Rect[3] += PadHeight;
	return Rect;
}

function GrowRect(Rect,Scale)
{
	//	don't modify original rect
	Rect = Rect.slice();
	
	let LeftChange = (Rect[2] * Scale) - Rect[2];
	let TopChange = (Rect[3] * Scale) - Rect[3];
	Rect[0] -= LeftChange/2;
	Rect[1] -= TopChange/2;
	Rect[2] += LeftChange;
	Rect[3] += TopChange;
	return Rect;
}



Math.SplitRect = function(ParentRect,Border,Columns,Rows)
{
	let ParentWidth = ParentRect.w;
	ParentWidth -= Border * (Columns-1);
	let BoxWidth = ParentWidth / Columns;
	//BoxWidth -= Border * (Columns-1);
	
	let ParentHeight = ParentRect.h;
	ParentHeight -= Border * (Rows-1);
	let BoxHeight = ParentHeight / Rows;
	//BoxHeight -= Border * (Rows-1);
	
	let Rects = [];
	
	let y = ParentRect.y;
	for ( let r=0;	r<Rows;	r++ )
	{
		let x = ParentRect.x;
		for ( let c=0;	c<Columns;	c++ )
		{
			let Rect = new TRect( x, y, BoxWidth, BoxHeight );
			x += BoxWidth + Border;
			Rects.push( Rect );
		}
		y += Border + BoxHeight;
	}
	
	return Rects;
}

function GetNormalisedRect(ChildRect,ParentRect)
{
	let pl = ParentRect[0];
	let pr = pl + ParentRect[2];
	let pt = ParentRect[1];
	let pb = pt + ParentRect[3];
	
	let cl = ChildRect[0];
	let cr = cl + ChildRect[2];
	let ct = ChildRect[1];
	let cb = ct + ChildRect[3];
	
	let l = Math.Range( pl, pr, cl );
	let r = Math.Range( pl, pr, cr );
	let t = Math.Range( pt, pb, ct );
	let b = Math.Range( pt, pb, cb );
	let w = r-l;
	let h = b-t;
	
	return [l,t,w,h];
}


Math.ScaleRect = function(ChildRect,ParentRect)
{
	let pl = ParentRect[0];
	let pr = pl + ParentRect[2];
	let pt = ParentRect[1];
	let pb = pt + ParentRect[3];
	
	let cl = ChildRect[0];
	let cr = cl + ChildRect[2];
	let ct = ChildRect[1];
	let cb = ct + ChildRect[3];
	
	let l = Math.Lerp( pl, pr, cl );
	let r = Math.Lerp( pl, pr, cr );
	let t = Math.Lerp( pt, pb, ct );
	let b = Math.Lerp( pt, pb, cb );
	let w = r-l;
	let h = b-t;
	
	return [l,t,w,h];
}

function AccumulateRects(RectA,RectB)
{
	let ra = RectA[0] + RectA[2];
	let rb = RectB[0] + RectB[2];
	let ba = RectA[1] + RectA[3];
	let bb = RectB[1] + RectB[3];
	let l = Math.min( RectA[0], RectB[0] );
	let r = Math.max( ra, rb );
	let t = Math.min( RectA[1], RectB[1] );
	let b = Math.max( ba, bb );
	let w = r-l;
	let h = b-t;
	return [l,t,w,h];
}


function ClipRectsToOverlap(RectA,RectB)
{
	let ra = RectA[0] + RectA[2];
	let rb = RectB[0] + RectB[2];
	let ba = RectA[1] + RectA[3];
	let bb = RectB[1] + RectB[3];
	let l = Math.max( RectA[0], RectB[0] );
	let r = Math.min( ra, rb );
	let t = Math.max( RectA[1], RectB[1] );
	let b = Math.min( ba, bb );
	let w = r-l;
	let h = b-t;
	return [l,t,w,h];
}


function PointInsideRect(xy,Rect)
{
	let x = xy[0];
	let y = xy[1];
	
	if ( x < Rect[0] )			return false;
	if ( x > Rect[0]+Rect[2] )	return false;
	if ( y < Rect[1] )			return false;
	if ( y > Rect[1]+Rect[3] )	return false;
	
	return true;
}

function RectIsOverlapped(RectA,RectB)
{
	let la = RectA[0];
	let lb = RectB[0];
	let ta = RectA[1];
	let tb = RectB[1];
	let ra = RectA[0] + RectA[2];
	let rb = RectB[0] + RectB[2];
	let ba = RectA[1] + RectA[3];
	let bb = RectB[1] + RectB[3];

	//	there's a better way of doing this by putting rectB into RectA space
	//	but lets do that later
	if ( PointInsideRect( [la,ta], RectB ) )	return true;
	if ( PointInsideRect( [ra,ta], RectB ) )	return true;
	if ( PointInsideRect( [ra,ba], RectB ) )	return true;
	if ( PointInsideRect( [la,ba], RectB ) )	return true;
	
	if ( PointInsideRect( [lb,tb], RectA ) )	return true;
	if ( PointInsideRect( [rb,tb], RectA ) )	return true;
	if ( PointInsideRect( [rb,bb], RectA ) )	return true;
	if ( PointInsideRect( [lb,bb], RectA ) )	return true;
	
	return false;
}


function GetRectArea(Rect)
{
	return Rect[2] * Rect[3];
}

//	overlap area is the overlap as a fraction of the biggest rect
function GetOverlapArea(Recta,Rectb)
{
	let Overlap = ClipRectsToOverlap( Recta, Rectb );
	let OverlapSize = GetRectArea(Overlap);
	let BigSize = Math.max( GetRectArea(Recta), GetRectArea(Rectb) );
	return OverlapSize / BigSize;
}


Pop.Colour.HexToRgb = function(HexRgb)
{
	let GetNibble = function(){};
	
	if ( typeof HexRgb == 'string' )
	{
		if ( HexRgb[0] != '#' )
			throw HexRgb + " doesn't begin with #";
		
		GetNibble = function(CharIndex)
		{
			let Char = HexRgb.charCodeAt(CharIndex+1);
			let a = 'a'.charCodeAt(0);
			let z = 'z'.charCodeAt(0);
			let A = 'A'.charCodeAt(0);
			let Z = 'Z'.charCodeAt(0);
			let zero = '0'.charCodeAt(0);
			let nine = '9'.charCodeAt(0);
			if (Char >= zero && Char <= nine) return (0+Char-zero);
			if (Char >= a && Char <= z) return (10+Char-a);
			if (Char >= A && Char <= Z) return (10+Char-A);
			throw "Non hex-char " + Char;
		}
	}
	else	//	int 0xffaa00
	{
		GetNibble = function(Index)
		{
			Index = 5-Index;
			let i = HexRgb >> (4*Index);
			i &= 0xf;
			return i;
		}
	}
	
	
	let a = GetNibble(0);
	let b = GetNibble(1);
	let c = GetNibble(2);
	let d = GetNibble(3);
	let e = GetNibble(4);
	let f = GetNibble(5);
	
	let Red = (a<<4) | b;
	let Green = (c<<4) | d;
	let Blue = (e<<4) | f;
	//Pop.Debug(a,b,c,d,e,f);
	//Pop.Debug(Red,Green,Blue);
	return [Red,Green,Blue];
}

Pop.Colour.HexToRgbf = function(HexRgb)
{
	let rgb = Pop.Colour.HexToRgb( HexRgb );
	rgb[0] /= 255;
	rgb[1] /= 255;
	rgb[2] /= 255;
	return rgb;
}


Math.GetSphereSphereIntersection = function(Sphere4a,Sphere4b)
{
	let Delta = Math.Subtract3( Sphere4b, Sphere4a );
	let Distance = Math.Length3( Delta );
	let RadiusA = Sphere4a[3];
	let RadiusB = Sphere4b[3];
	if ( Distance > RadiusA + RadiusB )
		return null;

	
	let MidDistance = (RadiusA + RadiusB)/2;
	let Intersection = [];
	Intersection[0] = Sphere4a[0] + Delta[0] * MidDistance;
	Intersection[1] = Sphere4a[1] + Delta[1] * MidDistance;
	Intersection[2] = Sphere4a[2] + Delta[2] * MidDistance;
	return Intersection;
}

Math.MatrixInverse4x4 = function(Matrix)
{
	let m = Matrix;
	let r = [];
	
	r[0] = m[5]*m[10]*m[15] - m[5]*m[14]*m[11] - m[6]*m[9]*m[15] + m[6]*m[13]*m[11] + m[7]*m[9]*m[14] - m[7]*m[13]*m[10];
	r[1] = -m[1]*m[10]*m[15] + m[1]*m[14]*m[11] + m[2]*m[9]*m[15] - m[2]*m[13]*m[11] - m[3]*m[9]*m[14] + m[3]*m[13]*m[10];
	r[2] = m[1]*m[6]*m[15] - m[1]*m[14]*m[7] - m[2]*m[5]*m[15] + m[2]*m[13]*m[7] + m[3]*m[5]*m[14] - m[3]*m[13]*m[6];
	r[3] = -m[1]*m[6]*m[11] + m[1]*m[10]*m[7] + m[2]*m[5]*m[11] - m[2]*m[9]*m[7] - m[3]*m[5]*m[10] + m[3]*m[9]*m[6];
	
	r[4] = -m[4]*m[10]*m[15] + m[4]*m[14]*m[11] + m[6]*m[8]*m[15] - m[6]*m[12]*m[11] - m[7]*m[8]*m[14] + m[7]*m[12]*m[10];
	r[5] = m[0]*m[10]*m[15] - m[0]*m[14]*m[11] - m[2]*m[8]*m[15] + m[2]*m[12]*m[11] + m[3]*m[8]*m[14] - m[3]*m[12]*m[10];
	r[6] = -m[0]*m[6]*m[15] + m[0]*m[14]*m[7] + m[2]*m[4]*m[15] - m[2]*m[12]*m[7] - m[3]*m[4]*m[14] + m[3]*m[12]*m[6];
	r[7] = m[0]*m[6]*m[11] - m[0]*m[10]*m[7] - m[2]*m[4]*m[11] + m[2]*m[8]*m[7] + m[3]*m[4]*m[10] - m[3]*m[8]*m[6];
	
	r[8] = m[4]*m[9]*m[15] - m[4]*m[13]*m[11] - m[5]*m[8]*m[15] + m[5]*m[12]*m[11] + m[7]*m[8]*m[13] - m[7]*m[12]*m[9];
	r[9] = -m[0]*m[9]*m[15] + m[0]*m[13]*m[11] + m[1]*m[8]*m[15] - m[1]*m[12]*m[11] - m[3]*m[8]*m[13] + m[3]*m[12]*m[9];
	r[10] = m[0]*m[5]*m[15] - m[0]*m[13]*m[7] - m[1]*m[4]*m[15] + m[1]*m[12]*m[7] + m[3]*m[4]*m[13] - m[3]*m[12]*m[5];
	r[11] = -m[0]*m[5]*m[11] + m[0]*m[9]*m[7] + m[1]*m[4]*m[11] - m[1]*m[8]*m[7] - m[3]*m[4]*m[9] + m[3]*m[8]*m[5];
	
	r[12] = -m[4]*m[9]*m[14] + m[4]*m[13]*m[10] + m[5]*m[8]*m[14] - m[5]*m[12]*m[10] - m[6]*m[8]*m[13] + m[6]*m[12]*m[9];
	r[13] = m[0]*m[9]*m[14] - m[0]*m[13]*m[10] - m[1]*m[8]*m[14] + m[1]*m[12]*m[10] + m[2]*m[8]*m[13] - m[2]*m[12]*m[9];
	r[14] = -m[0]*m[5]*m[14] + m[0]*m[13]*m[6] + m[1]*m[4]*m[14] - m[1]*m[12]*m[6] - m[2]*m[4]*m[13] + m[2]*m[12]*m[5];
	r[15] = m[0]*m[5]*m[10] - m[0]*m[9]*m[6] - m[1]*m[4]*m[10] + m[1]*m[8]*m[6] + m[2]*m[4]*m[9] - m[2]*m[8]*m[5];
	
	let det = m[0]*r[0] + m[1]*r[4] + m[2]*r[8] + m[3]*r[12];
	for ( let i=0;	i<16;	i++ )
		r[i] /= det;
	
	return r;

}

//	multiply position by matrix
Math.TransformPosition = function (Position,Transform)
{
	const PosMatrix = Math.CreateTranslationMatrix(...Position);
	const TransMatrix = Math.MatrixMultiply4x4(Transform,PosMatrix);
	const TransPos = Math.GetMatrixTranslation(TransMatrix,true);
	return TransPos;
}

//	gr: I've made this simpler, but its backwards to the other, and usual multiply notation, so maybe no...
//	order is left-to-right of significance. eg. scale, then move.
Math.MatrixMultiply4x4Multiple = function()
{
	//	apply in the right order!
	let Matrix = null;
	for ( let m=0;	m<arguments.length;	m++ )
	{
		let ParentMatrix = arguments[m];
		if ( Matrix == null )
			Matrix = ParentMatrix;
		else
			Matrix = Math.MatrixMultiply4x4( ParentMatrix, Matrix );
	}
	
	return Matrix;
}

//	apply A, then B. So A is child, B is parent
//	gr: but that doesn't seem to be riht
Math.MatrixMultiply4x4 = function(a,b)
{
	var a00 = a[0],
	a01 = a[1],
	a02 = a[2],
	a03 = a[3];
	var a10 = a[4],
	a11 = a[5],
	a12 = a[6],
	a13 = a[7];
	var a20 = a[8],
	a21 = a[9],
	a22 = a[10],
	a23 = a[11];
	var a30 = a[12],
	a31 = a[13],
	a32 = a[14],
	a33 = a[15];
	
	// Cache only the current line of the second matrix
	var b0 = b[0],
	b1 = b[1],
	b2 = b[2],
	b3 = b[3];

	let out = [];
	out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	
	b0 = b[4];b1 = b[5];b2 = b[6];b3 = b[7];
	out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	
	b0 = b[8];b1 = b[9];b2 = b[10];b3 = b[11];
	out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	
	b0 = b[12];b1 = b[13];b2 = b[14];b3 = b[15];
	out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	return out;
}

Math.CreateLookAtRotationMatrix = function(eye,up,center)
{
	let z = Math.Subtract3( center, eye );
	z = Math.Normalise3( z );
	
	let x = Math.Cross3( up, z );
	x = Math.Normalise3( x );
	
	let y = Math.Cross3( z,x );
	y = Math.Normalise3( y );
	
	let tx = 0;
	let ty = 0;
	let tz = 0;
	
	let out =
	[
	 x[0],	y[0],	z[0],	0,
	 x[1],	y[1],	z[1],	0,
	 x[2],	y[2],	z[2],	0,
	 tx,	ty,	tz,	1,
	 ];
	
	return out;
}

Math.SetMatrixTranslation = function(Matrix,x,y,z,w=1)
{
	Matrix[12] = x;
	Matrix[13] = y;
	Matrix[14] = z;
	Matrix[15] = w;
}

Math.CreateTranslationMatrix = function(x,y,z)
{
	return [ 1,0,0,0,	0,1,0,0,	0,0,1,0,	x,y,z,1	];
}

Math.CreateScaleMatrix = function(x,y,z)
{
	y = (y === undefined) ? x : y;
	z = (z === undefined) ? x : z;

	return [ x,0,0,0,	0,y,0,0,	0,0,z,0,	0,0,0,1	];
}

Math.CreateTranslationScaleMatrix = function(Position,Scale)
{
	let sx = Scale[0];
	let sy = Scale[1];
	let sz = Scale[2];
	let tx = Position[0];
	let ty = Position[1];
	let tz = Position[2];
	return [ sx,0,0,0,	0,sy,0,0,	0,0,sz,0,	tx,ty,tz,1 ];
}

Math.Matrix3x3ToMatrix4x4 = function(Matrix3,Row4=[0,0,0,1])
{
	let Matrix4 =
	[
		Matrix3[0],	Matrix3[1],	Matrix3[2], 0,
		Matrix3[3],	Matrix3[4],	Matrix3[5],	0,
		Matrix3[6],	Matrix3[7],	Matrix3[8],	0,
		Row4[0],	Row4[1],	Row4[2],	Row4[3]
	];
	return Matrix4;
}

Math.CreateIdentityMatrix = function()
{
	return Math.CreateTranslationMatrix( 0,0,0 );
}

Math.GetMatrixScale = function(Matrix)
{
	let Rowx = Matrix.slice(0,4);
	let Rowy = Matrix.slice(4,8);
	let Rowz = Matrix.slice(8,12);
	let Scalex = Math.Length3( Rowx );
	let Scaley = Math.Length3( Rowy );
	let Scalez = Math.Length3( Rowz );
	return [Scalex,Scaley,Scalez];
}

Math.GetMatrixTranslation = function(Matrix,DivW=false)
{
	//	do we need to /w here?
	let xyz = Matrix.slice(12,12+3);
	if ( DivW )
	{
		let w = Matrix[15];
		xyz[0] /= w;
		xyz[1] /= w;
		xyz[2] /= w;
	}
	return xyz;
}

Math.CreateAxisRotationMatrix = function(Axis,Degrees)
{
	let Radians = Math.DegToRad( Degrees );
	
	let x = Axis[0];
	let y = Axis[1];
	let z = Axis[2];
	let len = Math.sqrt(x * x + y * y + z * z);
	len = 1 / len;
	x *= len;
	y *= len;
	z *= len;
		
	let s = Math.sin(Radians);
	let c = Math.cos(Radians);
	let t = 1 - c;
		
	// Perform rotation-specific matrix multiplication
	let out = [];
	out[0] = x * x * t + c;
	out[1] = y * x * t + z * s;
	out[2] = z * x * t - y * s;
	out[3] = 0;
	out[4] = x * y * t - z * s;
	out[5] = y * y * t + c;
	out[6] = z * y * t + x * s;
	out[7] = 0;
	out[8] = x * z * t + y * s;
	out[9] = y * z * t - x * s;
	out[10] = z * z * t + c;
	out[11] = 0;
	out[12] = 0;
	out[13] = 0;
	out[14] = 0;
	out[15] = 1;
	return out;
}

Math.Min3 = function(a,b)
{
	let Min =
	[
	 Math.min( a[0], b[0] ),
	 Math.min( a[1], b[1] ),
	 Math.min( a[2], b[2] ),
	];
	return Min;
}

Math.Max3 = function(a,b)
{
	let Max =
	[
	 Math.max( a[0], b[0] ),
	 Math.max( a[1], b[1] ),
	 Math.max( a[2], b[2] ),
	 ];
	return Max;
}


Math.GetNextPowerOf2 = function(Number)
{
	//	round any floats
	Number = Math.ceil( Number );
	
	if ( Number <= 0 )
		return false;
	
	//	get bits under us
	const LowerBits = Number & (Number-1);
	if ( LowerBits == 0 )
		return Number;
	
	//Pop.Debug("number",Number,LowerBits);
	//	OR all the ^2 bits below us
	Number--;
	Number |= Number >> 1;
	Number |= Number >> 2;
	Number |= Number >> 4;
	Number |= Number >> 8;
	Number |= Number >> 16;
	//	now it's all bits below, roll over to the power^2 bit
	Number++;
	
	return Number;
}


Math.NormalisePlane = function(Plane4)
{
	let Length = Math.Length3( Plane4 );
	Plane4[0] /= Length;
	Plane4[1] /= Length;
	Plane4[2] /= Length;
	Plane4[3] /= Length;
}


Math.GetNormalisedPlane = function(Plane4)
{
	Plane4 = Plane4.slice();
	Math.NormalisePlane( Plane4 );
	return Plane4;
}


//	from https://stackoverflow.com/a/34960913/355753
Math.GetFrustumPlanes = function(ProjectionMatrix4x4,Normalised=true)
{
	const FrustumMatrix4x4 = ProjectionMatrix4x4;
	let left = [];
	let right = [];
	let bottom = [];
	let top = [];
	let near = [];
	let far = [];
	
	let mat;
	if ( true )//Params.TransposeFrustumPlanes )
	{
		mat = function(row,col)
		{
			return FrustumMatrix4x4[ (row*4) + col ];
		}
	}
	else
	{
		mat = function(col,row)
		{
			return FrustumMatrix4x4[ (row*4) + col ];
		}
	}
	
	for ( let i=0;	i<4;	i++ )
	{
		left[i]		= mat(i,3) + mat(i,0);
		right[i]	= mat(i,3) - mat(i,0);
		bottom[i]	= mat(i,3) + mat(i,1);
		top[i]		= mat(i,3) - mat(i,1);
		near[i]		= mat(i,3) + mat(i,2);
		far[i]		= mat(i,3) - mat(i,2);
	}
	
	if ( Normalised )
	{
		Math.NormalisePlane( left );
		Math.NormalisePlane( right );
		Math.NormalisePlane( top );
		Math.NormalisePlane( bottom );
		Math.NormalisePlane( near );
		Math.NormalisePlane( far );
	}
	
	const Planes = {};
	Planes.Left = left;
	Planes.Right = right;
	Planes.Top = top;
	Planes.Bottom = bottom;
	Planes.Near = near;
	Planes.Far = far;
	return Planes;
}



Math.IsBoundingBoxIntersectingFrustumPlanes = function(Box,Planes)
{
	//	convert to list of planes from .Left .Near .Far etc
	if ( !Array.isArray(Planes) )
	{
		function GetPlaneFromKey(Key)
		{
			return Planes[Key];
		}
		Planes = Object.keys( Planes ).map( GetPlaneFromKey );
	}

	const BoxCorners =
	[
		[Box.Min[0], Box.Min[1], Box.Min[2], 1],
		[Box.Max[0], Box.Min[1], Box.Min[2], 1],
		[Box.Min[0], Box.Max[1], Box.Min[2], 1],
		[Box.Max[0], Box.Max[1], Box.Min[2], 1],
		[Box.Min[0], Box.Min[1], Box.Max[2], 1],
		[Box.Max[0], Box.Min[1], Box.Max[2], 1],
		[Box.Min[0], Box.Max[1], Box.Max[2], 1],
		[Box.Max[0], Box.Max[1], Box.Max[2], 1],
	];
	
	//	https://www.iquilezles.org/www/articles/frustumcorrect/frustumcorrect.htm
	for ( let i=0;	i<Planes.length;	i++	)
	{
		let out = 0;
		const Plane = Planes[i];
		for ( let c=0;	c<BoxCorners.length;	c++ )
			out += Math.Dot4( Plane, BoxCorners[c] ) < 0.0;
		
		//	all corners are outside this plane
		if( out == BoxCorners.length )
			return false;
	}
	/*	extra check for when large box is outside frustum but being included
	int out;
	out=0; for( int i=0; i<8; i++ ) out += ((fru.mPoints[i].x > box.mMaxX)?1:0); if( out==8 ) return false;
	out=0; for( int i=0; i<8; i++ ) out += ((fru.mPoints[i].x < box.mMinX)?1:0); if( out==8 ) return false;
	out=0; for( int i=0; i<8; i++ ) out += ((fru.mPoints[i].y > box.mMaxY)?1:0); if( out==8 ) return false;
	out=0; for( int i=0; i<8; i++ ) out += ((fru.mPoints[i].y < box.mMinY)?1:0); if( out==8 ) return false;
	out=0; for( int i=0; i<8; i++ ) out += ((fru.mPoints[i].z > box.mMaxZ)?1:0); if( out==8 ) return false;
	out=0; for( int i=0; i<8; i++ ) out += ((fru.mPoints[i].z < box.mMinZ)?1:0); if( out==8 ) return false;
	*/
	return true;
}

Math.GetIntersectionRayBox3 = function(RayStart,RayDirection,BoxMin,BoxMax)
{
	let tmin = -Infinity;
	let tmax = Infinity;
	
	for ( let dim=0;	dim<3;	dim++ )
	{
		let AxisDir = RayDirection[dim];
		if ( AxisDir == 0 )
			continue;
		let tx1 = ( BoxMin[dim] - RayStart[dim] ) / AxisDir;
		let tx2 = ( BoxMax[dim] - RayStart[dim] ) / AxisDir;
		
		let min = Math.min( tx1, tx2 );
		let max = Math.max( tx1, tx2 );
		tmin = Math.max( tmin, min );
		tmax = Math.min( tmax, max );
	}
	
	//	invalid input ray (dir = 000)
	if ( tmin === null )
	{
		Pop.Debug("GetIntersectionRayBox3 invalid ray", RayStart, RayDirection );
		return false;
	}
	
	//	ray inside box... maybe change this return so its the exit intersection?
	if ( tmin < 0 )
	{
		//return RayStart;
		return false;
	}
	
	//	ray miss
	if ( tmax < tmin )
		return;
	//	from inside?
	if ( tmax < 0.0 )
		return false;
	
	let Intersection = Math.Multiply3( RayDirection, [tmin,tmin,tmin] );
	Intersection = Math.Add3( RayStart, Intersection );
	
	return Intersection;
}



//	returns signed distance, so if negative, point is behind plane.
Math.GetDistanceToPlane = function(Plane4,Position3)
{
	//	plane should be normalised
	const Distance = Math.Dot3( Position3, Plane4 ) + Plane4[3];
	return Distance;
	/*
	 // n must be normalized
	 return dot(p,n.xyz) + n.w;
	 
	 const a = Plane4[0];
	 const b = Plane4[1];
	 const c = Plane4[2];
	 const d = Plane4[3];
	 const x = Position3[0];
	 const y = Position3[1];
	 const z = Position3[2];
	 const Distance = (a * x + b * y + c * z + d);
	 return Distance;
	 */
}

Math.InsideMinusOneToOne = function(f)
{
	return ( f>=-1 && f<= 1 );
}

Math.PositionInsideBoxXZ = function(Position3,Box3)
{
	if ( Position3[0] < Box3.Min[0] )	return false;
	//if ( Position3[1] < Box3.Min[1] )	return false;
	if ( Position3[2] < Box3.Min[2] )	return false;
	if ( Position3[0] > Box3.Max[0] )	return false;
	//if ( Position3[1] > Box3.Max[1] )	return false;
	if ( Position3[2] > Box3.Max[2] )	return false;
	return true;
}


//	wait, is this cubic? it's not quadratic!
Math.GetCubicBezierPosition = function(Start,Middle,End,Time,TravelThroughMiddle=false)
{
	function GetBezier(p0,p1,p2,t)
	{
		const oneMinusT = 1 - t;
		const oneMinusTsq = oneMinusT * oneMinusT;
		const tsq = t*t;
		return (p0*oneMinusTsq) + (p1 * 4.0 * t * oneMinusT) + (p2 * tsq);
	}
	
	//	calculate the middle control point so it goes through middle
	//	https://stackoverflow.com/a/6712095/355753
	//const ControlMiddle_x = GetBezier(Start[0], Middle[0], End[0], 0.5 );
	//const ControlMiddle_y = GetBezier(Start[1], Middle[1], End[1], 0.5 );
	//const ControlMiddle_z = GetBezier(Start[2], Middle[2], End[2], 0.5 );
	const GetControl = function(a,b,c,Index)
	{
		const p0 = a[Index];
		const p1 = b[Index];
		const p2 = c[Index];
		
		//	x(t) = x0 * (1-t)^2 + 2 * x1 * t * (1 - t) + x2 * t^2
		//	x(t=1/2) = xt = x0 * 1/4 + 2 * x1 * 1/4 + x2 * 1/4
		//	x1/2 = xt - (x0 + x2)/4
		let pc = p1 - ((p0 + p2)/4);
		return pc;
		
		//	need to work out what p1/middle/control point should be when
		//	t=0.5 == p1
		//	https://stackoverflow.com/a/9719997/355753
		//const pc = 2 * (p1 - (p0 + p2)/2);
		//return pc;
	}
	const GetControlPoint = function(a,b,c)
	{
		const ControlMiddle_x = GetControl( Start, Middle, End, 0 );
		const ControlMiddle_y = GetControl( Start, Middle, End, 1 );
		const ControlMiddle_z = GetControl( Start, Middle, End, 2 );
		const ControlMiddle = [ ControlMiddle_x, ControlMiddle_y, ControlMiddle_z ];
		return ControlMiddle;
	}
	
	//	calculate where the control point needs to be for t=0.5 to go through the middle point
	if ( TravelThroughMiddle )
	{
		Middle = GetControlPoint( Start, Middle, End );
	}

	//	enum dimensions
	let Position = [];
	for ( let i=0;	i<Start.length;	i++ )
	{
		let p0 = Start[i];
		let p1 = Middle[i];
		let p2 = End[i];
		
		Position[i] = GetBezier( p0, p1, p2, Time );
	}
	return Position;
}


//	this gives a point between Start & End
Math.GetCatmullPosition = function(Previous,Start,End,Next,Time)
{
	function GetCatmull(p0,p1,p2,p3,t)
	{
		//	https://github.com/chen0040/cpp-spline/blob/master/spline/src/main/cpp/CatmullRom.cpp
		let u = t;
		let Result = u * u * u * ( (-1) * p0 + 3 * p1 - 3 * p2 + p3) / 2;
		Result += u * u * ( 2 * p0 - 5 * p1 + 4 * p2 - p3) / 2;
		Result += u * ((-1) * p0 + p2) / 2;
		Result += p1;
		return Result;
	}

	//	enum the dimensions
	let Position = [];
	for ( let i=0;	i<Start.length;	i++ )
	{
		let p0 = Previous[i];
		let p1 = Start[i];
		let p2 = End[i];
		let p3 = Next[i];
		Position[i] = GetCatmull( p0, p1, p2, p3, Time );
	}
	return Position;
}

//	Time normalised along the path to cope with looping
Math.GetCatmullPathPosition = function(Path,Time,Loop=false)
{
	if ( Time > 1 )
		throw "Math.GetCatmullPathPosition(Time="+Time+") should have normalised time";
	
	if ( Path.length < 4 )
		throw "Catmull path must have at least 4 points (this has "+ Path.length + ")";
	
	if ( Loop )
		Time *= Path.length;
	else
		Time *= Path.length - 1;
	
	//	get index from time
	let Start = Math.floor( Time );
	
	//	we calc the points between [Prev] Start & End [Next]
	let Previous = Start - 1;
	let End = Start + 1;
	let Next = End + 1;
	
	//	we're calculating points between start & end
	const Lerp = Math.range( Start, End, Time );
	if ( Lerp < 0 || Lerp > 1 )
		throw "Trying to calculate wrong time between Start=" + Start + " End=" + End + " Time="+Time;

	//	wrap numbers around if looping
	//	otherwise clamp
	let FixIndex = null;
	
	if ( Loop )
	{
		FixIndex = function(Index)
		{
			if ( Index < 0 )			Index += Path.length;
			if ( Index >= Path.length )	Index -= Path.length;
			return Index;
		}
	}
	else
	{
		FixIndex = function(Index)
		{
			Index = Math.clamp( 0, Path.length-1, Index );
			return Index;
		}
	}
	
	Previous = FixIndex( Previous );
	Start = FixIndex( Start );
	End = FixIndex( End );
	Next = FixIndex( Next );
	
	//	indexes should be correct now
	if ( Next >= Path.length )
		throw "Next is wrong";
	if ( Previous < 0 )
		throw "Previous is wrong";
	
	const Pos = Math.GetCatmullPosition( Path[Previous], Path[Start], Path[End], Path[Next], Lerp );
	return Pos;
}
