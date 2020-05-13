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
	//	Hidden==minimised (visibility!==Visible)
	if (document.hidden !== undefined)
		return document.hidden;

	if (document.visibilityState !== undefined)
	{
		const Visible = document.visibilityState === 'visible';
		return !Visible;
	}

	//	neither supported, never minimised
	return false;
}

Pop.WebApi.IsForeground = function ()
{
	if (document.hasFocus !== undefined)
		return document.hasFocus();

	//	android chrome
	//	normal:				!hidden visible foreground
	//	bring up tabs:		!hidden visible !foreground
	//	sleep/changeapp:	hidden !visible foreground
	//	wake tab visible:	!Hidden Visibility !Foreground

	//	desktop chrome:
	//	normal:				!hidden visible foreground
	//	click non-page:		!hidden visible !foreground
	//	minimised:			hidden !visible foreground
	return Pop.WebApi.ForegroundState;
}

Pop.WebApi.SetIsForeground = function (IsForeground)
{
	//Pop.Debug("Foreground changed from ",Pop.WebApi.ForegroundState,"to",IsForeground);
	if (IsForeground!==undefined)
		Pop.WebApi.ForegroundState = IsForeground;

	const Foreground = Pop.WebApi.IsForeground() && !Pop.WebApi.IsMinimised();
	Pop.WebApi.ForegroundChangePromises.Resolve(Foreground);
}

Pop.WebApi.WaitForForegroundChange = function ()
{
	return Pop.WebApi.ForegroundChangePromises.Allocate();
}


//	todo: call a func here in case we expand to have some async change promise queues
window.addEventListener('focus',function () { Pop.WebApi.SetIsForeground(true); });
window.addEventListener('blur',function () { Pop.WebApi.SetIsForeground(false); });
window.addEventListener('visibilitychange',function () { Pop.WebApi.SetIsForeground(document.hidden); });


//	file cache, not asset cache!
//	rework this system so we have an async version on desktop too
Pop._AssetCache = [];

//	simple aliases
Pop.Debug = console.log;

Pop.GetPlatform = function()
{
	return 'Web';
}

//	we're interpreting the url as
//	http://exefilename/exedirectory/?exearguments
Pop.GetExeFilename = function()
{
	return window.location.hostname;
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
	const UrlArgs = window.location.search.replace('?',' ').trim().split('&');
	
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
			if ( !isNaN(NumberValue) )
				Value = NumberValue;
			else if ( Value == 'true' )
				Value = true;
			else if ( Value == 'false' )
				Value = false;
		}
		UrlParams[Key] = Value;
	}
	UrlArgs.forEach(AddParam);
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
	const Promise = Pop.CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}


Pop.LeapMotion = {};

Pop.LeapMotion.Input = function()
{
	throw "Leap motion not supported";
}

//	gr: does this need its own namespace?
Pop.Xml = {};

Pop.Xml.Parse = function(Xml)
{
	//	web version makes use of the dom parser
	//	https://stackoverflow.com/a/7951947/355753
	if ( typeof window.DOMParser == 'undefined' )
		throw "XML parser not supported";
	
	const Parser = new window.DOMParser();
	const Dom = Parser.parseFromString(Xml, 'text/xml');
	const Object = Dom.documentElement;
	return Object;
}


