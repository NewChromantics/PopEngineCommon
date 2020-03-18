//	namespace
const Pop = {};

//	file cache, not asset cache!
Pop._AssetCache = [];

//	simple aliases
Pop.Debug = console.log;

Pop.GetPlatform = function()
{
	return 'Web';
}

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


Pop.GetTimeNowMs = function()
{
	return performance.now();
}

Pop.LoadFileAsImageAsync = async function(Filename)
{
	let Promise = Pop.CreatePromise();
	
	//	clean up blobs. There may be a time we DON'T this?
	const Cleanup = function()
	{
		if ( Filename.startsWith('blob:' ) )
		{
			Pop.Debug("Cleaning up blob", Filename);
			window.URL.revokeObjectURL( Filename );
		}
	}
	
	const HtmlImage = new Image();
	HtmlImage.crossOrigin = "anonymous";
	//	bind to this to remove the variable reference
	//	so it wont leave a self-reference and stop being garbage collected
	HtmlImage.onload = function()
	{
		Promise.Resolve( this );
		Cleanup();
	}.bind(HtmlImage);
	HtmlImage.onerror = function(Error)
	{
		Promise.Reject( Error );
		Cleanup();
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
	
	try
	{
		const Contents = await Pop.LoadFileAsImageAsync( Filename );
		Pop._AssetCache[Filename] = Contents;
	}
	catch(e)
	{
		Pop.Debug("Error loading file",Filename,e);
		Pop._AssetCache[Filename] = false;
		throw "Error loading file " + Filename + ": " + e;
	}
}

Pop.LoadFileAsString = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	gr: our asset loader currently replaces the contents of this
	//		with binary, so do the conversion here (as native engine does)
	const Contents = Pop.GetCachedAsset(Filename);
	if ( typeof Contents == 'string' )
		return Contents;
	
	//	convert array buffer to string
	if ( Array.isArray( Contents ) || Contents instanceof Uint8Array )
	{
		Pop.Debug("Convert "+Filename+" from ", typeof Contents," to string");
		//	this is super slow!
		const ContentsString = BytesToString( Contents );
		return ContentsString;
	}

	throw "Pop.LoadFileAsString("+Filename+") failed as contents is type " + (typeof Contents) + " and needs converting";
}

Pop.LoadFileAsImage = function(Filename)
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
	let Promise = Pop.CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}


Pop.LeapMotion = {};

Pop.LeapMotion.Input = function()
{
	throw "Leap motion not supported";
}


