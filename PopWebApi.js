//	namespace
const Pop = {};


//	specific web stuff, assume this doesn't exist on desktop
Pop.WebApi = {};

//	we cannot poll the focus/blur state of our page, so we
//	assume it's foreground (may not be the case if opened via middle button?)
Pop.WebApi.ForegroundState = true;
Pop.WebApi.ForegroundChangePromises = new PromiseQueue();

Pop.WebApi.IsMinimised = function ()
{
	//	android chome;
	//		sleep or change app:	minimised
	//		other tab:				NOT minimised (foreground=false)
	
	//	windows chrome:
	//		Hidden==minimised (visibility!==Visible)

	//	ios (safari);
	//		always hidden==false
	if (document.hidden !== undefined)
	{
		//Pop.Debug("IsMinimised  document.hidden= ",document.hidden);
		return document.hidden;
	}
	
	if (document.visibilityState !== undefined)
	{
		const Visible = document.visibilityState === 'visible';
		//Pop.Debug("IsMinimised document.visibilityState= ",document.visibilityState);
		return !Visible;
	}
	
	//Pop.Debug("IsMinimised not supported");
	//	neither supported, never minimised
	return false;
}

Pop.WebApi.IsForeground = function ()
{
	//	always returns true on ios
	if (document.hasFocus !== undefined)
	{
		//Pop.Debug("IsForeground = ",document.hasFocus());
		return document.hasFocus();
	}
	
	//	android chrome
	//	normal:				!hidden visible foreground
	//	bring up tabs:		!hidden visible !foreground
	//	sleep/changeapp:	hidden !visible foreground
	//	wake tab visible:	!Hidden Visibility !Foreground
	
	//	desktop chrome:
	//	normal:				!hidden visible foreground
	//	click non-page:		!hidden visible !foreground
	//	minimised:			hidden !visible foreground
	//Pop.Debug("IsForeground hasFocus not supported,. state=",Pop.WebApi.ForegroundState);
	return Pop.WebApi.ForegroundState;
}


Pop.WebApi.SetIsForeground = function (IsForeground,Event)
{
	//Pop.Debug("Foreground changed from ",Pop.WebApi.ForegroundState,"to",IsForeground);
	if (IsForeground!==undefined)
		Pop.WebApi.ForegroundState = IsForeground;

	Pop.Debug("Foreground change; ",Event);
	const Foreground = Pop.WebApi.IsForeground() && !Pop.WebApi.IsMinimised();
	Pop.WebApi.ForegroundChangePromises.Resolve(Foreground);
}

Pop.WebApi.WaitForForegroundChange = function ()
{
	return Pop.WebApi.ForegroundChangePromises.Allocate();
}


//	todo: call a func here in case we expand to have some async change promise queues
window.addEventListener('focus',function () { Pop.WebApi.SetIsForeground(true,'focus'); });
window.addEventListener('blur',function () { Pop.WebApi.SetIsForeground(false,'blur'); });
window.addEventListener('visibilitychange',function () { Pop.WebApi.SetIsForeground(undefined,'visibilitychange'); });
window.addEventListener('pagehide',function () { Pop.WebApi.SetIsForeground(undefined,'pagehide'); });
window.addEventListener('pageshow',function () { Pop.WebApi.SetIsForeground(undefined,'pageshow'); });


//	file cache, not asset cache!
//	rework this system so we have an async version on desktop too
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


