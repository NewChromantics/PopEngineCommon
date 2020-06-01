//	namespace
const Pop = {};



//	gr; this is a duplicate in PopApi.js
//		fix this cyclic dependency!
class WebApi_PromiseQueue
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
	
	Flush(HandlePromise)
	{
		//	pop array incase handling results in more promises, so we avoid infinite loop
		const Promises = this.Promises.splice(0);
		//	need to try/catch here otherwise some will be lost
		Promises.forEach( HandlePromise );
	}
	
	Push(Value)
	{
		const Args = Array.from(arguments);
		this.PendingValues.push( Args );
		
		//	now flush, in case there's something waiting for this value
		if ( this.Promises.length == 0 )
			return;
		
		//	and flush 0 (FIFO)
		//	we pre-pop as we want all listeners to get the same value
		const Value0 = this.PendingValues.shift();
		const HandlePromise = function(Promise)
		{
			Promise.Resolve( ...Value0 );
		}
		this.Flush( HandlePromise );
	}
	
	Resolve()
	{
		throw "PromiseQueue.Resolve() has been deprecated for Push() to enforce the pattern that we're handling a queue of values";
	}
	
	//	reject all the current promises
	Reject()
	{
		const Args = arguments;
		const HandlePromise = function(Promise)
		{
			Promise.Reject( ...Args );
		}
		this.Flush( HandlePromise );
	}
}



//	specific web stuff, assume this doesn't exist on desktop
Pop.WebApi = {};

//	we cannot poll the focus/blur state of our page, so we
//	assume it's foreground (may not be the case if opened via middle button?)
Pop.WebApi.ForegroundState = true;
//	gr: currently require a PromiseQueue() class as we have a cyclic dependency. Fix this!
Pop.WebApi.ForegroundChangePromises = new WebApi_PromiseQueue();

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
	Pop.WebApi.ForegroundChangePromises.Push(Foreground);
}

Pop.WebApi.WaitForForegroundChange = async function ()
{
	return Pop.WebApi.ForegroundChangePromises.WaitForNext();
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
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.GetCachedAssetOrFalse(Filename);
	if ( Cache !== false )
		return Cache;
	
	function LoadHtmlImageAsync()
	{
		let Promise = Pop.CreatePromise();
		const HtmlImage = new Image();
		HtmlImage.crossOrigin = "anonymous";
		HtmlImage.onload = function ()
		{
			Promise.Resolve(HtmlImage);
		};
		HtmlImage.onerror = function (Error)
		{
			Promise.Reject(Error);
		}
		//  trigger load
		HtmlImage.src = Filename;
		return Promise;
	}

	//	the API expects to return an image, so wait for the load,
	//	then make an image. This change will have broken the Pop.Image(Filename)
	//	constructor as it uses the asset cache, which is only set after this
	const HtmlImage = await LoadHtmlImageAsync();
	const Img = new Pop.Image(HtmlImage);
	Pop.SetFileCache(Filename,Img);
	return Img;
}

Pop.LoadFileAsStringAsync = async function(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.GetCachedAssetOrFalse(Filename);
	if ( Cache !== false )
		return Cache;
	
	const Fetched = await fetch(Filename);
	//Pop.Debug("Fetch created:", Filename, Fetched);
	const Contents = await Fetched.text();
	//Pop.Debug("Fetch finished:", Filename, Fetched);
	if ( !Fetched.ok )
		throw "Failed to fetch " + Filename + "; " + Fetched.statusText;
	Pop.SetFileCache(Filename,Contents);
	return Contents;
}


Pop.LoadFileAsArrayBufferAsync = async function(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.GetCachedAssetOrFalse(Filename);
	if ( Cache !== false )
		return Cache;

	const Fetched = await fetch(Filename);
	//Pop.Debug("Fetch created:", Filename, Fetched);
	const Contents = await Fetched.arrayBuffer();
	//Pop.Debug("Fetch finished:", Filename, Fetched);
	
	//	todo: SetFileCacheError ?
	if ( !Fetched.ok )
		throw "Failed to fetch " + Filename + "; " + Fetched.statusText;
	const Contents8 = new Uint8Array(Contents);
	Pop.SetFileCache(Filename,Contents8);
	return Contents8;
}

Pop.SetFileCache = function(Filename,Contents)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug(`Warning overwriting AssetCache[${Filename}]`);
	}
	Pop._AssetCache[Filename] = Contents;
}

Pop.SetFileCacheError = function(Filename,Error)
{
	Pop.Debug("Error loading file",Filename,e);
	Pop.SetFileCache(Filename,false);
}


Pop.AsyncCacheAssetAsString = async function(Filename)
{
	Pop.Debug(`Deprecated: AsyncCacheAssetAsString(), now just use LoadFileAsStringAsync(). Caveat is that this function used to mark file as error'd, but now will throw`);
	return Pop.LoadFileAsStringAsync(Filename);
}

Pop.AsyncCacheAssetAsImage = async function(Filename)
{
	Pop.Debug(`Deprecated: AsyncCacheAssetAsImage(), now just use LoadFileAsImageAsync(). Caveat is that this function used to mark file as error'd, but now will throw`);
	return Pop.LoadFileAsImageAsync(Filename);
}

Pop.AsyncCacheAssetAsArrayBuffer = async function(Filename)
{
	Pop.Debug(`Deprecated: AsyncCacheAssetAsArrayBuffer(), now just use LoadFileAsArrayBufferAsync(). Caveat is that this function used to mark file as error'd, but now will throw`);
	return Pop.LoadFileAsArrayBufferAsync(Filename);
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


Pop.LoadFileAsArrayBuffer = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	gr: our asset loader currently replaces the contents of this
	//		with binary, so do the conversion here (as native engine does)
	const Contents = Pop.GetCachedAsset(Filename);
	return Contents;
}


Pop.WriteStringToFile = function(Filename,Contents)
{
	//	on web (chrome?)
	//		folder/folder/file.txt
	//	turns in folder_folder_file.txt, so clip the name
	const DownloadFilename = Filename.split('/').slice(-1)[0];

	//	gr: "not a sequence" error means the contents need to be an array
	const ContentsBlob = new Blob([Contents],
		{
			type: "text/plain;charset=utf-8"
		}
	);

	const DataUrl = URL.createObjectURL(ContentsBlob);
	Pop.Debug(`WriteFile blob url: `)

	//	make a temp element to invoke the download
	const a = window.document.createElement('a');
	function Cleanup()
	{
		document.body.removeChild(a);
		//	delete seems okay here
		URL.revokeObjectURL(ContentsBlob);
	}
	try
	{
		a.href = DataUrl;
		a.download = DownloadFilename;
		document.body.appendChild(a);
		a.click();
		Cleanup();
	}
	catch (e)
	{
		Cleanup();
		throw e;
	}		
}

Pop.LoadFilePromptAsStringAsync = async function (Filename)
{
	const OnChangedPromise = Pop.CreatePromise();
	const InputElement = window.document.createElement('input');
	InputElement.setAttribute('type','file');
	//InputElement.multiple = true;
	InputElement.setAttribute('accept','Any/*');

	function OnFilesChanged(Event)
	{
		//	extract files from the control
		const Files = Array.from(InputElement.files);
		Pop.Debug(`OnChanged: ${JSON.stringify(Files)}`);
		OnChangedPromise.Resolve(Files);
		InputElement.files = null;
	}
	//InputElement.addEventListener('input',OnFilesChanged,false);
	InputElement.addEventListener('change',OnFilesChanged,false);
	InputElement.click();

	const Files = await OnChangedPromise;
	if (!Files.length)
		throw `User selected no files`;

	//	read file contents
	//	currently only interested in first
	const File = Files[0];
	const Contents = await File.text();
	return Contents;
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

Pop.GetCachedAssetOrFalse = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
		return false;

	const Asset = Pop._AssetCache[Filename];
	return Asset;
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


