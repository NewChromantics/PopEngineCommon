//	some generic javascript helpers used in web & native
//	mostly array related things
const Default = 'PopApi.js module';
export default Default; 



const ZeroArrayCache = {};	//	[Length] = Float32Array(0's)
export function GetZeroArray(Length)
{
	if ( !ZeroArrayCache[Length] )
	{
		ZeroArrayCache[Length] = new Float32Array(Length);
		ZeroArrayCache[Length].fill(0);
	}
	return ZeroArrayCache[Length];
}



const IndexArrayCache = {};	//	[Length] = Float32Array(0's)
export function GetIndexArray(Length)
{
	if ( !Number.isInteger(Length) )
		throw `Invalid index-array length ${Length}, needs to be an integer`;
		 
	if ( !IndexArrayCache[Length] )
	{
		const Values = new Array(Length).fill(0).map( (zero,index) => index );
		IndexArrayCache[Length] = new Float32Array(Values);
	}
	return IndexArrayCache[Length];
}



export function GetArrayRandomIndex(Array)
{
	if ( !Array.length )
		return undefined;
	const Index = Math.floor( Math.random() * Array.length );
	return Index;
}

export function GetArrayRandomElement(Array)
{
	const Index = GetArrayRandomIndex(Array);
	if ( Index === undefined )
		return undefined;
	return Array[Index];
}

//	returns shuffled version of array
export function GetArrayShuffled(Array)
{
	let ArrayBin = Array.slice();
	let NewArray = [];
	//	avoid potential infinite loop errors
	for ( let i=0;	i<Array.length;	i++ )
	{
		//	this is very slow on big arrays of subarrays
		const Index = Math.floor( Math.random() * ArrayBin.length );
		const Popped = ArrayBin.splice( Index, 1 )[0];
		NewArray.push( Popped );
	}
	return NewArray;
}

//	shuffle in place
export function ShuffleArray(array)
{
	//	https://stackoverflow.com/a/47900462/355753
	//	this is faster than splicing
	for (var i = array.length - 1; i > 0; i--)
	{
		var j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

export function MoveElementFromArrayToArray(Element,SourceArray,DestArray)
{
	const SourceIndex = SourceArray.indexOf( Element );
	if ( SourceIndex < 0 )
		throw "Element is not in source array";
	const DestIndex = DestArray.indexOf( Element );
	if ( DestIndex >= 0 )
		throw "Element is already in destination array";
	SourceArray.splice( SourceIndex, 1 );
	DestArray.push( Element );
}

export function ArrayIsMatch(a,b)
{
	if ( a.length !== b.length )
		return false;
	for ( let i=0;	i<a.length;	i++ )
		if ( a[i] !== b[i] )
			return false;
	return true;
}



//	maybe better named as BufferToString? but this should be clear its "text vs binary"
//	this is for ascii, NOT UTF16 (hence bytes, not shorts)
export function BytesToString(Bytes)
{
	//	https://stackoverflow.com/questions/6965107/converting-between-strings-and-arraybuffers
	if ( TextDecoder !== undefined )
	{
		const Decoder = new TextDecoder("utf-8");
		const String = Decoder.decode(Bytes);
		return String;
	}
	
	let Str = "";
	for ( let i=0;	i<Bytes.length;	i++ )
	{
		const Char = String.fromCharCode(Bytes[i]);
		Str += Char;
	}
	return Str;
}
/*
class TextEncoderReplacement
{
	encode(String)
	{
	}
}

let TextEncoder_t = this.TextEncoder || TextEncoderReplacement;
*/

export function StringToBytes(Str,AsArrayBuffer=false)
{
	//	https://stackoverflow.com/questions/6965107/converting-between-strings-and-arraybuffers
	if ( TextEncoder !== undefined )
	{
		const Encoder = new TextEncoder("utf-8");
		const Bytes = Encoder.encode(Str);
		return Bytes;
	}
	
	let Bytes = [];
	for ( let i=0;	i<Str.length;	i++ )
	{
		const CharCode = Str.charCodeAt(i);
		if ( CharCode >= 128 )
			throw `Pop.StringToBytes(${Str.substr(i,10)}) has non-ascii char`;
		Bytes.push(CharCode);
	}
	
	if ( AsArrayBuffer )
		Bytes = new Uint8Array(Bytes);
	return Bytes;
}

export function BytesToBigInt(Bytes)
{
	if ( Bytes.length != 64/8 )
		throw `BytesToBigInt() expected to be ${64/8} bytes long (is ${Bytes.length})`;

	const Hex = [];
	function AppendHex(i) 
	{
		var h = i.toString(16);
		if (h.length % 2) 
		{
			h = '0' + h;
		}
		Hex.push(h);
	}
	Bytes.forEach(AppendHex);
	const HexString = `0x${Hex.join('')}`;
	const Int = BigInt(HexString);
}


export function Base64ToBytes(Base64)
{
	if ( typeof Base64 != typeof '' )
		throw `Base64ToBytes expects a string (not ${typeof Base64}), need to handle another type?`;
		
	//	gr: is this a js built-in (for native), or web only?
	//		in which case we need an alternative maybe
	const DataString = atob(Base64);
	//	convert from the char-data-string to u8 array
	const Data = StringToBytes(DataString);
	//const Data = Uint8Array.from(DataString, c => c.charCodeAt(0));
	return Data;
}

//	gr: this is to deal with
//	SomeThing.constructor == Pop.Image <-- chrome/v8
//	SomeThing.constructor == Pop.Image.constructor <-- javascript core
export function IsObjectInstanceOf(This,TypeConstructor)
{
	if ( !(This instanceof Object) )
		return false;
	
	//	this should work in chakracore/jsrt as long as the constructor .prototype "property" has been set
	if ( This instanceof TypeConstructor )
		return true;
	
	//	object == func... so wrong match
	//if ( This instanceof TypeConstructor.constructor )
	//	return true;

	if (This.__proto__)
	{
		//	jscore
		if (This.__proto__ == TypeConstructor.__proto__)
		{
			Pop.Debug("This __proto__ == TypeConstructor.__proto__",TypeConstructor);
			return true;
		}

		//	chakra
		if (This.__proto__.constructor == TypeConstructor)
		{
			Pop.Debug("This __proto__.constructor == TypeConstructor",TypeConstructor);
			return true;
		}
	}

	
	if ( This.constructor )
	{
		if ( This.constructor == TypeConstructor )
		{
			Pop.Debug("This.constructor == TypeConstructor",TypeConstructor);
			return true;
		}
		//	jscore: {} is matching Pop.Image here
		//if ( This.constructor == TypeConstructor.constructor )
		//	return true;
	}
	return false;
}

//	https://stackoverflow.com/a/46999598/355753
export function IsTypedArray(obj)
{
	return !!obj && obj.byteLength !== undefined;
}

export function JoinTypedArrays(Arrays,DeprecatedSecondArray)
{
	if ( DeprecatedSecondArray )
	{
		throw `JoinTypedArrays(a,b,c) deprecated, pass an array of typed arrays as first arg`;
		Arrays = Array.from(arguments);
	}
	
	if ( !Array.isArray(Arrays) )
		throw `JoinTypedArrays() expecting array for first arg(${typeof Arrays})`;
	
	//	skip some stuff we dont need to join
	Arrays = Arrays.filter( a => a!=null && a.length!=0 );
	
	//	what should we return if empty...
	if ( Arrays.length == 0 )
		return new Uint8Array(0);
	if ( Arrays.length == 1 )
		return Arrays[0];
	
	const a = Arrays[0];
	//	gr: need some more rigirous checks here
	if ( !IsTypedArray(a) )
		throw `Cannot JoinTypedArrays where 1st not typed array (${a})`;

	const Constructor = a.constructor;
	const TotalSize = Arrays.reduce( (Accumulator,a) => Accumulator + a.length, 0 );

	const NewArray = new Constructor(TotalSize);
	let Position = 0;
	for ( let TheArray of Arrays )
	{
		const NameA = TheArray.constructor.name;
		const NameB = Constructor.name;
		if ( TheArray.constructor != Constructor )
			throw `Cannot join to typedarrays of different types (${NameA} + ${NameB})`;
	
		NewArray.set( TheArray, Position );
		Position += TheArray.length;
	}
	return NewArray;
}



//	array of chunks to avoid joining typed arrays, with
//	a handy function to grab a slice that could straddle
//	chunks
//	so when storing lots of chunks of say, a file, instead of joining them
//	use this class, push() chunks, and grab slice()'s as needed 
//	(instead of joining everything) 
export class ChunkArray
{
	constructor()
	{
		this.Chunks = [];
	}
	
	get length()
	{
		//const TotalSize = Arrays.reduce( (Accumulator,a) => Accumulator + a.length, 0 );

		let Length = 0;
		for ( let Chunk of this.Chunks )
		{
			Length += Chunk.length;
		}
		return Length;
	}
	
	push(Chunk)
	{
		this.Chunks.push( Chunk );
	}
	
	slice(Start,End)
	{
		if ( Start === undefined && End === undefined )
			return JoinTypedArrays( this.Chunks );

		if ( End === undefined )
			throw `todo: handle slice() with no end, but start offset`;
			
		if ( Start===undefined || Start < 0 || End < 0 )
			throw `todo: Handle negative slice(${Start},${End}) params`;

		if ( this.Chunks.length == 0 )
		{
			throw `May need to handle this more gracefully... what do we return when no chunks?`;
			return null;
		}

		const SliceLength = End-Start;
		const a = this.Chunks[0];
		const Constructor = a.constructor;
		const NewArray = new Constructor(SliceLength);
		
		const ChunksToCopy = [];
		
		let Position = 0;
		for ( let TheArray of this.Chunks )
		{
			const NameA = TheArray.constructor.name;
			const NameB = Constructor.name;
			if ( TheArray.constructor != Constructor )
				throw `Cannot join to typedarrays of different types (${NameA} + ${NameB})`;
		
			//	dont need any of this array
			let ArrayStart = Position;
			let ArrayEnd = ArrayStart + TheArray.length;
			if ( End < ArrayStart || Start >= ArrayEnd )
			{
				Position += TheArray.length;
				continue;
			}
			
			//	whole of this array goes in
			if ( Start <= ArrayStart && End >= ArrayEnd )
			{
				ChunksToCopy.push( TheArray );
				Position += TheArray.length;
				continue;
			}
			
			//	only part of this array
			let StartOfThisArray = Math.max( 0, Start - ArrayStart );
			let EndOfThisArray = Math.min( End, ArrayEnd );
			//	make relative to this array for slicing
			StartOfThisArray = Math.max( 0, StartOfThisArray );
			EndOfThisArray = EndOfThisArray - ArrayStart;

			//	gr: instead of slice, we should be able to make a new bufferview?
			const Part = TheArray.slice( StartOfThisArray, EndOfThisArray );
			ChunksToCopy.push( Part );
			
			Position += TheArray.length;
		}
		
		const Slice = JoinTypedArrays(ChunksToCopy);
		if ( Slice.length != SliceLength )
			throw `calculated sub chunks wrong`;
		return Slice;
	}
}



//	create a promise function with the Resolve & Reject functions attached so we can call them
export function CreatePromise()
{
	let Callbacks = {};
	let PromiseHandler = function(Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	Prom.Resolve = Callbacks.Resolve;
	Prom.Reject = Callbacks.Reject;
	return Prom;
}

export function ParseExeArguments(Args)
{
	//	turn into keys & values - gr: we're not doing this in engine! fix so they match!
	const UrlParams = {};
	function AddParam(Argument)
	{
		let [Key,Value] = Argument.split('=',2);
		if ( Value === undefined )
			Value = true;
		
		//	attempt some auto conversions
		if ( typeof Value == 'string' )
		{
			const NumberValue = Number(Value);

			if ( Value === '' )
				Value = null;
			else if ( Value == 'null' )
				Value = null;
			else if ( !isNaN(NumberValue) )
				Value = NumberValue;
			else if ( Value == 'true' )
				Value = true;
			else if ( Value == 'false' )
				Value = false;
		}
		UrlParams[Key] = Value;
	}
	Args.forEach(AddParam);
	return UrlParams;
}
