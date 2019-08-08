//	namespace
let Pop = {};

Pop._AssetCache = [];

//	simple aliases
Pop.Debug = console.log;


Pop.GetTimeNowMs = function()
{
	return performance.now();
}

Pop.LoadFileAsStringAsync = async function(Filename)
{
	const Fetched = await fetch(Filename);
	const Contents = Fetched.text();
	return Contents;
}

Pop.AsyncCacheAsset = async function(Filename)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug("Asset " + Filename + " already cached");
		return;
	}
	
	const Contents = await Pop.LoadFileAsStringAsync(Filename);
	Pop._AssetCache[Filename] = Contents;
}

Pop.LoadFileAsString = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	todo: binary vs string type stuff here (and in AsyncCacheAsset)
	return Pop._AssetCache[Filename];
}


Pop.CompileAndRun = function(Source,Filename)
{
	let OnLoaded = function(x)
	{
		//Pop.Debug(Filename + " script loaded",this,x);
	}
	let OnError = function(x)
	{
		//Pop.Debug(Filename + " script error",this,x);
	}
	
	//	create a new script element and execute immediately
	const Script = document.createElement('script');
	Script.type = 'text/javascript';
	Script.async = false;
	//Script.src = Source;
	Script.text = Source;
	Script.onload = Script.onreadystatechange = OnLoaded;
	Script.onerror = OnError;
	
	document.head.appendChild( Script );
	
	//	note: normal API returns evaluation result here, not that we usually use it...
}

Pop.GetExeArguments = function()
{
	return [];
}

Pop.Yield = function(Milliseconds)
{
	let Callbacks = {};
	let PromiseHandler = function(Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	setTimeout( Callbacks.Resolve, Milliseconds );
	return Prom;
}


Pop.LeapMotion = {};

Pop.LeapMotion.Input = function()
{
	throw "Leap motion not supported";
}


