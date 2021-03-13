//	some generic javascript helpers

Pop.Array = {};

//	returns shuffled version of array
Pop.Array.Shuffled = function(Array)
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
Pop.Array.Shuffle = function(array)
{
	//	https://stackoverflow.com/a/47900462/355753
	//	this is faster than splicing
	for (var i = array.length - 1; i > 0; i--)
	{
		var j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

Pop.Array.MoveElementFromArrayToArray = function(Element,SourceArray,DestArray)
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

Pop.Array.IsMatch = function(a,b)
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
Pop.BytesToString = function(Bytes)
{
	let Str = "";
	for ( let i=0;	i<Bytes.length;	i++ )
	{
		const Char = String.fromCharCode(Bytes[i]);
		Str += Char;
	}
	return Str;
}


Pop.StringToBytes = function(Str,AsArrayBuffer=false)
{
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



//	gr: this is to deal with
//	SomeThing.constructor == Pop.Image <-- chrome/v8
//	SomeThing.constructor == Pop.Image.constructor <-- javascript core
function IsObjectInstanceOf(This,TypeConstructor)
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
Pop.IsTypedArray = function(obj)
{
	return !!obj && obj.byteLength !== undefined;
}
function IsTypedArray(obj)
{
	Pop.Warning(`Deprecated: IsTypedArray(); use Pop.IsTypedArray()`);
	return Pop.IsTypedArray(obj);
}

Pop.JoinTypedArrays = function(a,b,c,etc)
{
	//	gr: need some more rigirous checks here
	if ( !Pop.IsTypedArray(a) )
		throw `Cannot JoinTypedArrays where 1st not typed array (${a})`;

	const Constructor = a.constructor;
	const Arrays = Array.from(arguments);
	const TotalSize = Arrays.reduce( (Accumulator,a) => Accumulator + a.length, 0 );

	const NewArray = new Constructor(TotalSize);
	let Position = 0;
	for ( let TheArray of Arrays )
	{
		if ( TheArray.constructor != Constructor )
			throw `Cannot join to typedarrays of different types`;
	
		NewArray.set( TheArray, Position );
		Position += TheArray.length;
	}
	return NewArray;
}


//	create a promise function with the Resolve & Reject functions attached so we can call them
Pop.CreatePromise = function()
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

