//	namespace
let Pop = {};

Pop._AssetCache = [];

//	simple aliases
Pop.Debug = console.log;




function CreatePromise()
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


Pop.GetTimeNowMs = function()
{
	return performance.now();
}

Pop.LoadImageAsync = async function(Filename,OnLoaded)
{
	OnLoaded = OnLoaded || function(){};
	let Promise = CreatePromise();
	
	const HtmlImage = new Image();
	HtmlImage.crossOrigin = "anonymous";
	HtmlImage.onload = function()
	{
		OnLoaded( HtmlImage );
		Promise.Resolve( HtmlImage );
	};
	HtmlImage.onerror = function(Error)
	{
		Promise.Reject( Error );
	}
	//  trigger load
	HtmlImage.src = Filename;
	
	return Promise;
}

Pop.LoadFileAsStringAsync = async function(Filename,OnLoaded)
{
	OnLoaded = OnLoaded || function(){};
	const Fetched = await fetch(Filename);
	Pop.Debug("Fetch created:", Filename, Fetched);
	const Contents = await Fetched.text();
	Pop.Debug("Fetch finished:", Filename, Fetched);
	OnLoaded(Contents);
	return Contents;
}

Pop.AsyncCacheAssetAsString = async function(Filename)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug("Asset " + Filename + " already cached");
		return;
	}
	
	let OnLoaded = function(Contents)
	{
		Pop._AssetCache[Filename] = Contents;
	}
	const Contents = await Pop.LoadFileAsStringAsync( Filename, OnLoaded );
	//Pop._AssetCache[Filename] = Contents;
}

Pop.AsyncCacheAssetAsImage = async function(Filename)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug("Asset " + Filename + " already cached");
		return;
	}
	
	let OnLoaded = function(Contents)
	{
		Pop._AssetCache[Filename] = Contents;
	}
	const Contents = await Pop.LoadImageAsync( Filename, OnLoaded );
	//Pop._AssetCache[Filename] = Contents;
}

Pop.LoadFileAsString = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	return Pop.GetCachedAsset(Filename);
}

Pop.WriteStringToFile = function(Filename,Contents)
{
	throw "WriteStringToFile not supported on this platform";
}

Pop.FileExists = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
		return false;
	return true;
}

Pop.GetCachedAsset = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw Filename + " has not been cached with Pop.AsyncCacheAsset()";
	}
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
	let Promise = CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}


Pop.LeapMotion = {};

Pop.LeapMotion.Input = function()
{
	throw "Leap motion not supported";
}


