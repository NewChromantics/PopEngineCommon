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


//	a promise queue that manages multiple listeners
Pop.PromiseQueue = class
{
	constructor()
	{
		//	pending promises
		this.Promises = [];
		//	values we've yet to resolve (each is array capturing arguments from push()
		this.PendingValues = [];
	}
	
	async WaitForNext()
	{
		const Promise = this.Allocate();
		
		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending();
		
		return Promise;
	}
	
	//	allocate a promise, maybe deprecate this for the API WaitForNext() that makes more sense for a caller
	Allocate()
	{
		//	create a promise function with the Resolve & Reject functions attached so we can call them
		function CreatePromise()
		{
			let Callbacks = {};
			let PromiseHandler = function (Resolve,Reject)
			{
				Callbacks.Resolve = Resolve;
				Callbacks.Reject = Reject;
			}
			let Prom = new Promise(PromiseHandler);
			Prom.Resolve = Callbacks.Resolve;
			Prom.Reject = Callbacks.Reject;
			return Prom;
		}
		
		const NewPromise = CreatePromise();
		this.Promises.push( NewPromise );
		return NewPromise;
	}
	
	Push()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.ResolveValues = Args;
		this.PendingValues.push( Value );
		this.FlushPending();
	}
	
	FlushPending()
	{
		//	if there are promises and data's waiting, we can flush next
		if ( this.Promises.length == 0 )
			return;
		if ( this.PendingValues.length == 0 )
			return;
		
		//	flush 0 (FIFO)
		//	we pre-pop as we want all listeners to get the same value
		const Value0 = this.PendingValues.shift();
		const HandlePromise = function(Promise)
		{
			if ( Value0.RejectionValues )
				Promise.Reject( ...Value0.RejectionValues );
			else
				Promise.Resolve( ...Value0.ResolveValues );
		}
		
		//	pop array incase handling results in more promises, so we avoid infinite loop
		const Promises = this.Promises.splice(0);
		//	need to try/catch here otherwise some will be lost
		Promises.forEach( HandlePromise );
	}
	
	Resolve()
	{
		throw "PromiseQueue.Resolve() has been deprecated for Push() to enforce the pattern that we're handling a queue of values";
	}
	
	//	reject all the current promises
	Reject()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.RejectionValues = Args;
		this.PendingValues.push(Value);
		this.FlushPending();
	}
}

