//	use PopJs here!

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


Math.LengthSq2 = function(x0,y0,x1,y1)
{
	let dx = x1-x0;
	let dy = y1-y0;
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


Math.Length2 = function(x0,y0,x1,y1)
{
	let LengthSq = Math.LengthSq2(x0,y0,x1,y1);
	let Len = Math.sqrt( LengthSq );
	return Len;
}


Math.Length3 = function(a)
{
	let LengthSq = Math.LengthSq3( [0,0,0], a );
	let Len = Math.sqrt( LengthSq );
	return Len;
}

Math.Normalise2 = function(a)
{
	let Length = Math.Length2( 0, 0, a[0], a[1] );
	return [ a[0]/Length, a[1]/Length ];
}

Math.Normalise3 = function(a)
{
	let Length = Math.Length3( a );
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

Math.Cross3 = function(a,b)
{
	let x = a[2] * b[3] - b[2] * a[3];
	let y = b[1] * a[3] - a[1] * b[3];
	let z = a[1] * b[2] - b[1] * a[2];
	return [x,y,z];
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





function HexToRgb(HexRgb)
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
			let zero = '0'.charCodeAt(0);
			let nine = '9'.charCodeAt(0);
			return (Char >= zero && Char <= nine) ? (0+Char-zero) : (10+Char-a);
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

function HexToRgbf(HexRgb)
{
	let rgb = HexToRgb( HexRgb );
	rgb[0] /= 255;
	rgb[1] /= 255;
	rgb[2] /= 255;
	return rgb;
}


