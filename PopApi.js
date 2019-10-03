//	some generic javascript helpers

//	gr: this is to deal with
//	SomeThing.constructor == Pop.Image <-- chrome/v8
//	SomeThing.constructor == Pop.Image.constructor <-- javascript core
function IsObjectInstanceOf(This,TypeConstructor)
{
	if ( !(This instanceof Object) )
		return false;
	
	if ( This instanceof TypeConstructor )
		return true;
	
	//	jscore
	if ( This.__proto__ == TypeConstructor.__proto__ )
		return true;

	//	object == func... so wrong match
	//if ( This instanceof TypeConstructor.constructor )
	//	return true;
	
	if ( This.constructor )
	{
		if ( This.constructor == TypeConstructor )
			return true;
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
Pop.PromiseQueue = function()
{
	//	pending promises
	this.Promises = [];
	
	this.Allocate = function()
	{
		const NewPromise = Pop.CreatePromise();
		this.Promises.push( NewPromise );
		return NewPromise;
	}
	
	this.Flush = function(HandlePromise)
	{
		//	pop array incase handling results in more promises
		const Promises = this.Promises.splice(0);
		//	need to try/catch here otherwise some will be lost
		Promises.forEach( HandlePromise );
	}
	
	this.Resolve = function()
	{
		const Args = arguments;
		const HandlePromise = function(Promise)
		{
			Promise.Resolve( ...Args );
		}
		this.Flush( HandlePromise );
	}
	
	this.Reject = function()
	{
		const Args = arguments;
		const HandlePromise = function(Promise)
		{
			Promise.Reject( ...Args );
		}
		this.Flush( HandlePromise );
	}
}

