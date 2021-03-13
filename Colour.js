
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


//	returns null if no colour
Math.ColourToHue = function(Rgbaf)
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

Math.HueToColour = function(Hue,Alpha=1)
{
	if ( Hue === null )
		return [0,0,0,Alpha];
	
	let Normal = Hue;
	//	same as NormalToRedGreenBluePurple
	if ( Normal < 1/6 )
	{
		//	red to yellow
		Normal = Math.Range( 0/6, 1/6, Normal );
		return [1, Normal, 0, Alpha];
	}
	else if ( Normal < 2/6 )
	{
		//	yellow to green
		Normal = Math.Range( 1/6, 2/6, Normal );
		return [1-Normal, 1, 0, Alpha];
	}
	else if ( Normal < 3/6 )
	{
		//	green to cyan
		Normal = Math.Range( 2/6, 3/6, Normal );
		return [0, 1, Normal, Alpha];
	}
	else if ( Normal < 4/6 )
	{
		//	cyan to blue
		Normal = Math.Range( 3/6, 4/6, Normal );
		return [0, 1-Normal, 1, Alpha];
	}
	else if ( Normal < 5/6 )
	{
		//	blue to pink
		Normal = Math.Range( 4/6, 5/6, Normal );
		return [Normal, 0, 1, Alpha];
	}
	else //if ( Normal < 5/6 )
	{
		//	pink to red
		Normal = Math.Range( 5/6, 6/6, Normal );
		return [1, 0, 1-Normal, Alpha];
	}
}



Math.NormalToRedGreen = function(Normal,Alpha=1)
{
	if ( Normal === null )
		return [0,0,0,Alpha];
	
	if ( Normal < 1/2 )
	{
		//	red to yellow
		Normal = Math.Range( 0/2, 1/2, Normal );
		return [1, Normal, 0, Alpha];
	}
	else if ( Normal <= 2/2 )
	{
		//	yellow to green
		Normal = Math.Range( 1/2, 2/2, Normal );
		return [1-Normal, 1, 0, Alpha];
	}
	else
	{
		return [0, 0, 1, Alpha];
	}
}

Pop.Colour.HexToRgbf = function(HexRgb)
{
	let rgb = Pop.Colour.HexToRgb( HexRgb );
	rgb[0] /= 255;
	rgb[1] /= 255;
	rgb[2] /= 255;
	return rgb;
}


Pop.Colour.HexToRgb = function(HexRgb)
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
