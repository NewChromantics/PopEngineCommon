const Default = 'Pop Colour.js module';
export default Default;

function Range(Min,Max,Value)
{
	return (Value-Min) / (Max-Min);
}

export function RgbfToHex(Rgb)
{
	function FloatToHex(f)
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


//	returns null if no colour
export function ColourToHue(Rgbaf)
{
	let [r,g,b,a] = [...Rgbaf];
	
	//	https://stackoverflow.com/a/26233318/355753
	const Min = Math.min( r,g,b );
	const Max = Math.max( r,g,b );
	
	if ( Min == Max )
		return null;
	
	//	have a darkness tolerance
	if ( Max < 0.3 )
		return null;
	
	//	and a brightness tolerance
	if ( Min > 0.9 )
		return null;
	
	//	todo: change this so it's 0-1 instead of 360
	let Hue = 0;
	if ( Max == r )
	{
		Hue = (g - b) / (Max - Min);
	}
	else if (Max == g)
	{
		Hue = 2 + (b - r) / (Max - Min);
	}
	else
	{
		Hue = 4 + (r - g) / (Max - Min);
	}
	
	Hue = Hue * (360/6);
	if ( Hue < 0 )
		Hue += 360;
	
	Hue /= 360;
	return Hue;
}

export function HueToColour(Hue,Alpha=1)
{
	if ( Hue === null )
		return [0,0,0,Alpha];
	
	let Normal = Hue;
	//	same as NormalToRedGreenBluePurple
	if ( Normal < 1/6 )
	{
		//	red to yellow
		Normal = Range( 0/6, 1/6, Normal );
		return [1, Normal, 0, Alpha];
	}
	else if ( Normal < 2/6 )
	{
		//	yellow to green
		Normal = Range( 1/6, 2/6, Normal );
		return [1-Normal, 1, 0, Alpha];
	}
	else if ( Normal < 3/6 )
	{
		//	green to cyan
		Normal = Range( 2/6, 3/6, Normal );
		return [0, 1, Normal, Alpha];
	}
	else if ( Normal < 4/6 )
	{
		//	cyan to blue
		Normal = Range( 3/6, 4/6, Normal );
		return [0, 1-Normal, 1, Alpha];
	}
	else if ( Normal < 5/6 )
	{
		//	blue to pink
		Normal = Range( 4/6, 5/6, Normal );
		return [Normal, 0, 1, Alpha];
	}
	else //if ( Normal < 5/6 )
	{
		//	pink to red
		Normal = Range( 5/6, 6/6, Normal );
		return [1, 0, 1-Normal, Alpha];
	}
}



export function NormalToRedGreen(Normal,Alpha=1)
{
	if ( Normal === null )
		return [0,0,0,Alpha];
	
	if ( Normal < 1/2 )
	{
		//	red to yellow
		Normal = Range( 0/2, 1/2, Normal );
		return [1, Normal, 0, Alpha];
	}
	else if ( Normal <= 2/2 )
	{
		//	yellow to green
		Normal = Range( 1/2, 2/2, Normal );
		return [1-Normal, 1, 0, Alpha];
	}
	else
	{
		return [0, 0, 1, Alpha];
	}
}

export function HexToRgbf(HexRgb)
{
	let rgb = HexToRgb( HexRgb );
	rgb[0] /= 255;
	rgb[1] /= 255;
	rgb[2] /= 255;
	return rgb;
}
/*
function GetRed(Colour)
{
	let Value = parseInt( Colour.substring(0,2), 16);
	return Value / 255;
}

function GetGreen(Colour)
{
	let Value = parseInt( Colour.substring(2,4), 16);
	return Value / 255;
}

function GetBlue(Colour)
{
	let Value = parseInt( Colour.substring(4,6), 16);
	return Value / 255;
}

function GetAlpha(Colour)
{
	let Value = parseInt( Colour.substring(6,8), 16);
	return Value / 255;
}

function HexToColour4(Hex)
{
	let Colour4 = new float4(0,0,0,0);
	Colour4.x = GetRed( Hex );
	Colour4.y = GetGreen( Hex );
	Colour4.z = GetBlue( Hex );
	Colour4.w = GetAlpha( Hex );
	return Colour4;
}
*/

function CharToHex(Char)
{
	Char = Char.charCodeAt(0);
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

function ByteToFloat(Byte)
{
	return Byte/255.0;
}

//	mix of previous functions
export function HexToRgbaf(HexColour)
{
	if ( typeof HexColour != 'string' )
		throw `HexToRgbaf(${HexColour}) not handling non-strings`;
	
	if ( HexColour[0] == '#' )
		HexColour = HexColour.substr(1);
	
	//	gr; use string to bytes?
	const NibbleChars = HexColour.split('');
	const Nibbles = NibbleChars.map(CharToHex);
	
	//	todo: handle FFF short hexes
	//	pad missing bytes for rgb
	while ( Nibbles.length < 2*3 )
		Nibbles.push(0);
	//	padd bytes for alpha
	while ( Nibbles.length < 2*4 )
		Nibbles.push(0xf);
	
	const [a,b, c,d, e,f, g,h] = Nibbles;
	
	const Red = (a<<4) | b;
	const Green = (c<<4) | d;
	const Blue = (e<<4) | f;
	const Alpha = (g<<4) | h;
	const Rgba = [Red,Green,Blue,Alpha];
	const Rgbaf = Rgba.map(ByteToFloat);
	return Rgbaf;	
}

export function HexToRgb(HexRgb)
{
	let GetNibble;
	let NibbleCount = 0;
	
	if ( typeof HexRgb == 'string' )
	{
		if ( HexRgb[0] != '#' )
			throw HexRgb + " doesn't begin with #";
		
		NibbleCount = HexRgb.length-1;
		
		GetNibble = function(CharIndex)
		{
			let Char = HexRgb.charCodeAt(CharIndex+1);
			return CharToHex(Char);
		}
	}
	else	//	int 0xffaa00
	{
		NibbleCount = 6;
		GetNibble = function(Index)
		{
			Index = 5-Index;
			let i = HexRgb >> (4*Index);
			i &= 0xf;
			return i;
		}
	}
	
	if ( NibbleCount != 3 && NibbleCount != 6 )
		throw `Hex colour ${HexRgb} expected 3 or 6 nibbles, but is ${NibbleCount}`;

	//Pop.Debug(`Hex colour ${HexRgb} nibbles; ${NibbleCount}`);
	const NibbleMaps =
	{
		3: [0,0,1,1,2,2],
		6: [0,1,2,3,4,5],
	};
	const NibbleMap = NibbleMaps[NibbleCount];
	const [a,b,c,d,e,f] = NibbleMap.map(GetNibble);
	
	const Red = (a<<4) | b;
	const Green = (c<<4) | d;
	const Blue = (e<<4) | f;
	//Pop.Debug(a,b,c,d,e,f);
	//Pop.Debug(Red,Green,Blue);
	return [Red,Green,Blue];
}
