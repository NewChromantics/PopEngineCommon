//	namespace
const Pop = {};

Pop._AssetCache = [];

//	simple aliases
Pop.Debug = console.log;

Pop.GetExeDirectory = function()
{
	//	exe could be path location.pathname
	const Path = window.location.pathname;
	//	including /
	const Directory = Path.substr( 0, Path.lastIndexOf("/") + 1 );
	return Directory;
}

Pop.GetExeArguments = function()
{
	//	gr: probably shouldn't lowercase now it's proper
	const UrlParams = window.location.search.replace('?',' ').trim().split('&');
	return UrlParams;
}

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

Pop.LoadImageAsync = async function(Filename)
{
	let Promise = CreatePromise();
	
	const HtmlImage = new Image();
	HtmlImage.crossOrigin = "anonymous";
	HtmlImage.onload = function()
	{
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

Pop.LoadFileAsStringAsync = async function(Filename)
{
	const Fetched = await fetch(Filename);
	//Pop.Debug("Fetch created:", Filename, Fetched);
	const Contents = await Fetched.text();
	//Pop.Debug("Fetch finished:", Filename, Fetched);
	if ( !Fetched.ok )
		throw "Failed to fetch " + Filename + "; " + Fetched.statusText;
	return Contents;
}

Pop.AsyncCacheAssetAsString = async function(Filename)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug("Asset " + Filename + " already cached");
		return;
	}
	
	try
	{
		const Contents = await Pop.LoadFileAsStringAsync( Filename );
		Pop._AssetCache[Filename] = Contents;
	}
	catch(e)
	{
		Pop.Debug("Error loading file",Filename,e);
		Pop._AssetCache[Filename] = false;
		throw "Error loading file " + Filename + ": " + e;
	}
}

Pop.AsyncCacheAssetAsImage = async function(Filename)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug("Asset " + Filename + " already cached");
		return;
	}
	
	const Contents = await Pop.LoadImageAsync( Filename );
	Pop._AssetCache[Filename] = Contents;
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
	
	//	null is a file that failed to load
	const Asset = Pop._AssetCache[Filename];
	if ( Asset === false )
		return false;
	
	return true;
}

Pop.GetCachedAsset = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw Filename + " has not been cached with Pop.AsyncCacheAsset()";
	}
	
	//	null is a file that failed to load
	const Asset = Pop._AssetCache[Filename];
	if ( Asset === false )
		throw Filename + " failed to load";
		
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


