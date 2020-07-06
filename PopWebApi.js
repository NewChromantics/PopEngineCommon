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

	ClearQueue()
	{
		//	delete values, losing data!
		this.PendingValues = [];
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


//	this will become generic and not webapi specific
Pop.WebApi.TFileCache = class
{
	constructor()
	{
		this.Cache = {};	//	[Filename] = Contents
		this.OnFilesChanged = new WebApi_PromiseQueue();
	}

	async WaitForFileChange()
	{
		return this.OnFilesChanged.WaitForNext();
	}

	SetError(Filename,Error)
	{
		Pop.Debug(`Error loading file ${Filename}: ${Error}`);
		this.Set(Filename,false);
	}

	Set(Filename,Contents)
	{
		if (this.Cache.hasOwnProperty(Filename))
		{
			// Pop.Debug(`Warning overwriting AssetCache[${Filename}]`);
		}
		this.Cache[Filename] = Contents;
		this.OnFilesChanged.Push(Filename);
	}

	Get(Filename)
	{
		if (!this.Cache.hasOwnProperty(Filename))
		{
			throw `${Filename} has not been cached with Pop.AsyncCacheAsset()`;
		}

		//	false is a file that failed to load
		//	todo: store an error!
		const Asset = this.Cache[Filename];
		if (Asset === false)
			throw `${Filename} failed to load`;

		return this.Cache[Filename];
	}

	//	non-throwing function which returns false if the file load has errored
	GetOrFalse(Filename)
	{
		if (!this.Cache.hasOwnProperty(Filename))
			return false;

		//	if this has failed to load, it will also be false
		const Asset = this.Cache[Filename];
		return Asset;
	}

	IsCached(Filename)
	{
		return this.GetOrFalse(Filename) !== false;
	}
}




//	file cache, not asset cache!
//	rework this system so we have an async version on desktop too
Pop.WebApi.FileCache = new Pop.WebApi.TFileCache();

//	old bindings
Pop.GetCachedAsset = Pop.WebApi.FileCache.Get.bind(Pop.WebApi.FileCache);
Pop.GetCachedAssetOrFalse = Pop.WebApi.FileCache.GetOrFalse.bind(Pop.WebApi.FileCache);
Pop.SetFileCache = Pop.WebApi.FileCache.Set.bind(Pop.WebApi.FileCache);
Pop.SetFileCacheError = Pop.WebApi.FileCache.SetError.bind(Pop.WebApi.FileCache);

//	simple aliases
Pop.Debug = console.log;
Pop.Warn = console.warn;
Pop.Warning = console.warn;

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


//	gr: if we call fetch() 100 times for the same url, we make 100 requests
//		quick fix, have a cache of pending fetch() requests
//	gr: we cannot consume the result (.text or .arrayBuffer) more than once
//		so inside this caching, we need to do the read too, hence extra funcs
const FetchCache = {};

async function FetchText(Url)
{
	const Fetched = await fetch(Url);
	const Contents = await Fetched.text();
	if ( !Fetched.ok )
		throw `Failed to fetch(${Url}) text; ${Fetched.statusText}`;
	return Contents;
}

async function FetchArrayBuffer(Url)
{
	const Fetched = await fetch(Url);
	const Contents = await Fetched.arrayBuffer();
	if ( !Fetched.ok )
		throw `Failed to fetch(${Url}) arrayBuffer; ${Fetched.statusText}`;
	const Contents8 = new Uint8Array(Contents);
	return Contents8;
}

async function FetchOnce(Url,FetchFunc)
{
	if ( FetchCache.hasOwnProperty(Url) )
		return FetchCache[Url];
	
	//	run the fetch, wait for it to finish, then clear the cache
	FetchCache[Url] = FetchFunc(Url);
	const Contents = await FetchCache[Url];
	delete FetchCache[Url];
	return Contents;
}

//	gr: this needs a fix like FetchOnce
Pop.LoadFileAsImageAsync = async function(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.WebApi.FileCache.GetOrFalse(Filename);
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
	{
		//	convert cache if its not a string. Remote system may deliver raw binary file
		//	and we don't know the type until it's requested
		if ( typeof Cache == 'string' )
			return Cache;

		const CacheString = Pop.BytesToString(Cache);
		Pop.SetFileCache(Filename,CacheString);
		return CacheString;
	}
	
	const Contents = await FetchOnce(Filename,FetchText);
	Pop.SetFileCache(Filename,Contents);
	return Contents;
}


Pop.LoadFileAsArrayBufferAsync = async function(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.GetCachedAssetOrFalse(Filename);
	if ( Cache !== false )
		return Cache;

	const Contents = await FetchOnce(Filename,FetchArrayBuffer);
	Pop.SetFileCache(Filename,Contents);
	return Contents;
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
	//	synchronous functions on web will fail
	if (!Pop.WebApi.FileCache.IsCached(Filename))
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
		const ContentsString = Pop.BytesToString( Contents );
		return ContentsString;
	}

	throw "Pop.LoadFileAsString("+Filename+") failed as contents is type " + (typeof Contents) + " and needs converting";
}

Pop.LoadFileAsImage = function(Filename)
{
	//	synchronous functions on web will fail
	if (!Pop.WebApi.FileCache.IsCached(Filename))
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	return Pop.GetCachedAsset(Filename);
}


Pop.LoadFileAsArrayBuffer = function(Filename)
{
	//	synchronous functions on web will fail
	if (!Pop.WebApi.FileCache.IsCached(Filename))
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	gr: our asset loader currently replaces the contents of this
	//		with binary, so do the conversion here (as native engine does)
	const Contents = Pop.GetCachedAsset(Filename);
	return Contents;
}

//	on web, this call causes a Save As... dialog to appear to save the contents
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

//	on web, this is a "can I synchronously load file" check
//	we may need to alter this to allow currently-downloading files
//	which haven't yet been cached, but not those that have started 
//	a fetch() but currently have no knowledge of sucess or not
Pop.FileExists = function(Filename)
{
	return Pop.WebApi.FileCache.IsCached(Filename);
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



Pop.WebApi.AnimationFramePromiseQueue = new WebApi_PromiseQueue();	//	todo: promise queue that only stores the latest (we need a keyframe'd queue!)

Pop.WebApi.BrowserAnimationStep = function(Time)
{
	//	clear old frames so we don't get a backlog
	Pop.WebApi.AnimationFramePromiseQueue.ClearQueue();
	Pop.WebApi.AnimationFramePromiseQueue.Push(Time);
	//Pop.Debug(`BrowserStep(${Time})`);
	window.requestAnimationFrame(Pop.WebApi.BrowserAnimationStep);
}
Pop.WebApi.BrowserAnimationStep();

//	gr: currently web only, but the main API should have something like this
//	returns delta seconds since last frame
//	we cap the timestep as the gap between frames will be massive when debugging
//	anything that needs real time can use Pop.GetTimeNowMs()
Pop.WebApi.LastFrameTime = null;
Pop.WebApi.MaxTimestep = 1/30;
Pop.WaitForFrame = async function()
{
	//	wait for next frame time
	const Time = await Pop.WebApi.AnimationFramePromiseQueue.WaitForNext();
	
	//	cap timestep as this time will be massive between frames when debugging
	let Timestep = (Pop.WebApi.LastFrameTime===null) ? 0 : (Time-Pop.WebApi.LastFrameTime);
	Timestep = Math.min( Pop.WebApi.MaxTimestep, Timestep );
	Pop.WebApi.LastFrameTime = Time;
	return Timestep;
}

