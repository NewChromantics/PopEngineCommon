//	namespace
//	gr: safari scopes const & let away from modules,
//		so if this file is loaded outside a module, Pop isn't availible
//		to modules in safari. So fully-global/singletons need to be var.
var Pop = Pop || {};



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
		
		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending();
		
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
	
	//	put this value in the queue, if its not already there (todo; option to choose oldest or newest position)
	PushUnique(Value)
	{
		const Args = Array.from(arguments);
		function IsMatch(PendingValue)
		{
			//	all arguments are now .PendingValues=[] or .RejectionValues=[]
			//	we are only comparing PendingValues, lets allow rejections to pile up as
			//	PushUnique wont be rejections. The Reject() code should have a RejectUnique() if this becomes the case
			if (!PendingValue.hasOwnProperty('ResolveValues'))
				return false;

			const a = PendingValue.ResolveValues;
			const b = Args;
			if ( a.length != b.length )	return false;
			for ( let i=0;	i<a.length;	i++ )
				if ( a[i] != b[i] )
					return false;
			return true;
		}
		//	skip adding if existing match
		if ( this.PendingValues.some(IsMatch) )
		{
			//Pop.Debug(`Skipping non-unique ${Args}`);
			return;
		}
		this.Push(...Args);
	}

	Push()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.ResolveValues = Args;
		this.PendingValues.push( Value );
		
		if ( this.PendingValues.length > 100 )
			Pop.Warning(`This promise queue has ${this.PendingValues.length} pending values and ${this.Promises.length} pending promises`,this);
		
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
	let State = Pop.WebApi.ForegroundState;
	State = State && !Pop.WebApi.IsMinimised();
	return State;
}

Pop.WebApi.SetIsForeground = function (IsForeground)
{
	Pop.Debug(`Foreground changed from ,${Pop.WebApi.ForegroundState} to ${IsForeground}. Document.hidden=${document.hidden}`);
	if (IsForeground!==undefined)
		Pop.WebApi.ForegroundState = IsForeground;

	const Foreground = Pop.WebApi.IsForeground();
	Pop.Debug(`IsForeground state = ${Pop.WebApi.IsForeground()}`);
	Pop.WebApi.ForegroundChangePromises.Push(Foreground);
}

Pop.WebApi.WaitForForegroundChange = async function ()
{
	return Pop.WebApi.ForegroundChangePromises.WaitForNext();
}


//	todo: call a func here in case we expand to have some async change promise queues
window.addEventListener('focus',function () { Pop.WebApi.SetIsForeground(true); });
window.addEventListener('blur',function () { Pop.WebApi.SetIsForeground(false); });
window.addEventListener('visibilitychange',function () { Pop.WebApi.SetIsForeground(!document.hidden); });


//	this will become generic and not webapi specific
Pop.WebApi.TFileCache = class
{
	constructor()
	{
		//	we keep some meta on the side. eg. known size if we're streaming a file
		//	Do we leave this, even if we unload a file?
		this.CacheMeta = {};	//	[Filename] = .Size .OtherThings .LastAccessed?
		this.Cache = {};		//	[Filename] = Contents
		this.OnFilesChanged = new WebApi_PromiseQueue('FileCache.OnFilesChanged');
	}

	async WaitForFileChange()
	{
		//	gr: we now return filename & contents, but we dont want to put the
		//		contents in the promise queue (will stop the unique-test and flood the queue)
		//		so we wait, grab it here, then return with current contents
		const Filename = await this.OnFilesChanged.WaitForNext();
		const File = Object.assign({},this.GetMeta(Filename));
		File.Filename = Filename;
		File.Contents = this.Cache[File.Filename];
		return File;
	}

	//	return a mutable meta object
	GetMeta(Filename)
	{
		if ( !this.CacheMeta[Filename] )
			this.CacheMeta[Filename] = {};
		return this.CacheMeta[Filename];
	}
	
	SetError(Filename,Error)
	{
		this.CacheMeta[Filename].Error = Error;
		Pop.Debug(`Error loading file ${Filename}: ${Error}`);
		this.Set(Filename,false);
	}

	Set(Filename,Contents,ContentChunks=undefined)
	{
		if (this.Cache.hasOwnProperty(Filename))
		{
			// Pop.Debug(`Warning overwriting AssetCache[${Filename}]`);
		}
		
		//	if our content is in chunks, store them, then
		//	on request, join together
		//	expecting Contents to be null
		//if ( ContentChunks )
		//	gr: always set chunks, so it gets unset
		{
			const Meta = this.GetMeta(Filename);
			Meta.ContentChunks = ContentChunks;
			
			//	gr: I really don't want to store this meta as it can go out of date
			//		but if this is the ONLY place the chunks get updated, it can do for now
			//		Some systems (filemonitor) call GetMeta(), can't JUST have it in 
			//		the OnChanged callback
			if ( Meta.ContentChunks === undefined )
			{
				Meta.PendingContentsSize = undefined;	//	not streaming(any more)
			}
			else
			{
				Meta.PendingContentsSize = 0;
				Meta.ContentChunks.forEach( Chunk => Meta.PendingContentsSize += Chunk.byteLength );
			}
			
			//	update known size
			if ( Contents )
			{
				Meta.Size = Math.max( Contents.length, Meta.Size||0 );
			}
		}
		
		this.Cache[Filename] = Contents;
		this.OnFilesChanged.PushUnique(Filename);
	}

	//	call this before returning any contents, expecting called to have already
	//	verified it exists etc, and just re-setting the contents/cache
	ResolveChunks(Filename)
	{
		const Meta = this.GetMeta(Filename);
		if ( !Meta.ContentChunks )
			return;
		//	todo: store running Contents and only append new chunks
		//		so we minimise copies as the already-copied parts aren't going
		//		to change (in theory)
		Pop.Debug(`Resolving x${Meta.ContentChunks.length} chunks of ${Filename}`);
		this.Cache[Filename] = Pop.JoinTypedArrays(...Meta.ContentChunks);
		Meta.ContentChunks = null;
	}
	
	Get(Filename,ResolveChunks=true)
	{
		if (!this.Cache.hasOwnProperty(Filename))
		{
			throw `${Filename} has not been cached with Pop.AsyncCacheAsset()`;
		}

		//	false is a file that failed to load
		const Asset = this.Cache[Filename];
		if (Asset === false)
		{
			const Error = this.GetMeta(Filename).Error;
			throw `${Filename} failed to load: ${Error}`;
		}
		
		//	gr: send back chunks if they haven't been resolved
		if ( !ResolveChunks )
		{
			const Meta = this.GetMeta(Filename);
			if ( Meta.ContentChunks )
			{
				if ( this.Cache[Filename] === false )
					throw `We have chunks, but cache is false (error), shouldn't hit this combination, something has errored but we still have chunks (still downloading?)`;
				//Pop.Debug(`Skipping chunk resolve of ${Filename} x${Meta.ContentChunks.length} chunks`);
				return Meta.ContentChunks;
			}
		}		
		
		//	if there are pending content chunks, we need to join them together
		//	as it's the first time it's been requested
		this.ResolveChunks(Filename);
		
		return this.Cache[Filename];
	}

	//	non-throwing function which returns false if the file load has errored
	GetOrFalse(Filename,ResolveChunks=true)
	{
		if (!this.Cache.hasOwnProperty(Filename))
			return false;
		
		//	gr: send back chunks if they haven't been resolved
		if ( !ResolveChunks )
		{
			const Meta = this.GetMeta(Filename);
			if ( Meta.ContentChunks )
			{
				if ( this.Cache[Filename] === false )
					throw `We have chunks, but cache is false (error), shouldn't hit this combination, something has errored but we still have chunks (still downloading?)`;
				//Pop.Debug(`Skipping chunk resolve of ${Filename} x${Meta.ContentChunks.length} chunks`);
				return Meta.ContentChunks;
			}
		}		
		
		//	if there are pending content chunks, we need to join them together
		//	as it's the first time it's been requested
		this.ResolveChunks(Filename);

		//	if this has failed to load, it will also be false
		const Asset = this.Cache[Filename];
		return Asset;
	}

	IsCached(Filename)
	{
		//	don't resolve chunks here, skip excess work for a simple "not false" check
		const ResolveChunks = false;
		
		return this.GetOrFalse(Filename,ResolveChunks) !== false;
	}
	
	SetKnownSize(Filename,Size)
	{
		//	update meta
		const Meta = this.GetMeta(Filename);
		Meta.Size = Size;
	}
}




//	file cache, not asset cache!
//	rework this system so we have an async version on desktop too
Pop.WebApi.FileCache = new Pop.WebApi.TFileCache();

//	old bindings
Pop.GetCachedAsset = Pop.WebApi.FileCache.Get.bind(Pop.WebApi.FileCache);
Pop.GetCachedAssetOrFalse = Pop.WebApi.FileCache.GetOrFalse.bind(Pop.WebApi.FileCache);
Pop.SetFileKnownSize = Pop.WebApi.FileCache.SetKnownSize.bind(Pop.WebApi.FileCache);
Pop.SetFileCache = Pop.WebApi.FileCache.Set.bind(Pop.WebApi.FileCache);
Pop.SetFileCacheError = Pop.WebApi.FileCache.SetError.bind(Pop.WebApi.FileCache);

//	simple aliases
Pop.Debug = Pop.Debug || console.log;
Pop.Warning = Pop.Warning || console.warn;

Pop.GetPlatform = function()
{
	return 'Web';
}


//	computer name wants to be some kind of unique, but not-neccessarily unique name
//	this doesn't really exist, so store & retrieve a random string in the session
//	storage, so we can at least have unique tabs
Pop.GetComputerName = function()
{
	let Name = window.sessionStorage.getItem('Pop.ComputerName');
	if ( Name )
		return Name;
	
	function CreateRandomHash(Length=4)
	{
		//	generate string of X characters
		const AnArray = new Array(Length);
		const Numbers = [...AnArray];
		//	pick random numbers from a-z (skipping 0-10)
		const RandNumbers = Numbers.map( x=>Math.floor(Math.random()*26) );
		const RandAZNumbers = RandNumbers.map(i=>i+10);
		//	turn into string with base36(10+26)
		const RandomString = RandAZNumbers.map(x=>x.toString(36)).join('').toUpperCase();
		//Pop.Debug(`RandomString=${RandomString}`);
		return RandomString;
	}
	
	//	make one up
	Name = 'Pop_' + CreateRandomHash();
	window.sessionStorage.setItem('Pop.ComputerName',Name);
	return Name;
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

			if ( Value === '' )
				Value = null;
			else if ( Value == 'null' )
				Value = null;
			else if ( !isNaN(NumberValue) )
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
	//	this returns a float, even though it's in ms,
	//	so round to integer
	const Now = performance.now();
	return Math.floor(Now);
}

Pop.ShowWebPage = function(Url)
{
	window.open( Url, '_blank');
}

//	gr: if we call fetch() 100 times for the same url, we make 100 requests
//		quick fix, have a cache of pending fetch() requests
//	gr: we cannot consume the result (.text or .arrayBuffer) more than once
//		so inside this caching, we need to do the read too, hence extra funcs
const FetchCache = {};

//	AbortController is undefined on firefox browser on hololens2
class AbortControllerStub
{
	constructor()
	{
		this.signal = null;
	}

	abort()
	{
	}
};
window.AbortController = window.AbortController || AbortControllerStub;

//	gr: hack for kandinsky;
//		if any fetch's fail
Pop.WebApi.InternetStatus = true;	//	we can pretty safely assume it's initially fine
Pop.WebApi.InternetStatusChangedQueue = new WebApi_PromiseQueue('InternetStatusChangedQueue');

Pop.WebApi.WaitForInternetStatusChange = async function()
{
	//	wait for a change (dirty) and then return latest status 
	await Pop.WebApi.InternetStatusChangedQueue.WaitForNext();
	return Pop.WebApi.InternetStatus;
}

//	call this when any kind of download gets new information
function OnInternetGood()
{
	Pop.WebApi.InternetStatus = true;
	Pop.WebApi.InternetStatusChangedQueue.PushUnique();
}
//	call when any fetch fails (not due to 404 or anything with a response)
function OnInternetBad()
{
	Pop.WebApi.InternetStatus = false;
	Pop.WebApi.InternetStatusChangedQueue.PushUnique();
}


async function CreateFetch(Url)
{
	//	gr: check for not a string?
	if ( Url === undefined )
		throw `Trying to fetch() undefined url`;
		
	//	attach a Cancel() function
	//	gr: work out when not supported
	const Controller = new window.AbortController();
	const Signal = Controller.signal;
	function Cancel()
	{
		Controller.abort();
	}

	const Params = {};
	//method: 'get',
	Params.signal = Signal;

	//	fetch() throws when disconnected, catch it
	let Fetched = null;
	try
	{
		Fetched = await fetch(Url,Params);
		if (!Fetched.ok)
			throw `fetch result not ok, status=${Fetched.statusText}`;
		OnInternetGood();
	}
	catch(e)
	{
		//	gr; need to check for 404 here
		OnInternetBad();
		throw `Fetch error with ${Url}; ${e}`;
	}
	Fetched.Cancel = Cancel;

	return Fetched;
}

async function FetchText(Url)
{
	const Fetched = await CreateFetch(Url);
	const Contents = await Fetched.text();
	return Contents;
}

async function FetchArrayBuffer(Url)
{
	const Fetched = await CreateFetch(Url);
	const Contents = await Fetched.arrayBuffer();
	const Contents8 = new Uint8Array(Contents);
	return Contents8;
}

async function FetchArrayBufferStream(Url,OnProgress)
{
	const Fetched = await CreateFetch(Url);

	//	gr: do we know full file size here
	Pop.Debug(`Streaming file; `,Fetched);
	let KnownSize = parseInt(Fetched.headers.get("content-length"));
	KnownSize = isNaN(KnownSize) ? -1 : KnownSize;
	const KnownSizeKb = (KnownSize/1024).toFixed(2);
	//	gr: maybe fture speed up with our own buffer
	//		https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamBYOBReader but currently 0 support
	const Reader = Fetched.body.getReader();

	async function ReaderThread()
	{
		Pop.Debug(`Reading fetch stream ${Url}/${KnownSizeKb}kb`);
	
		//	it's slow to keep merging chunks and notifying changes
		//	so push chunks to the file cache,
		//	the file cache can then merge them on demand (which will be
		//	far less frequent than this read)
		
		let ContentChunks = [];
		
		//	gr: this function is expensive, especially when called often
		//		we should keep an array of chunks, and merge on demand (or at the end)
		function AppendChunk(Chunk)
		{
			//	last is undefined
			if ( !Chunk )
				return;
			ContentChunks.push(Chunk);
			OnProgress( ContentChunks, KnownSize );
		}
		
		while (true)
		{
			/*
			//	gr: testing to see if we can pause the fetch by not read()ing
			if (TotalContents.length > 1024 * 500)
			{
				Pop.Debug(`Stopping stream ${Filename} at ${TotalContents.length / 1024}kb`);
				//	both of these stop network streaming
				Reader.cancel();
				Fetched.Cancel();
				return TotalContents;
			}
			*/
			const Chunk = await Reader.read();
			OnInternetGood();
			const Finished = Chunk.done;
			const ChunkContents = Chunk.value;
			//	chunk is undefined on last (finished)read
			const ChunkSize = ChunkContents ? ChunkContents.length : 0;
			//Pop.Debug(`chunk ${Url} Finished=${Finished} x${ChunkSize}/${KnownSizeKb}`,Chunk);
			AppendChunk(ChunkContents);
			if ( Finished )
				break;
		}
		
		
		//	do a final join. OnProgress should have done this in the file cache
		//	so this array may be a bit redundant (and a duplicate!)
		//	so try and fetch the other one, but for now, keep it here to make sure
		//	the old way of expecting a complete buffer is here
		//	gr: we now only auto resolve chunks on request
		//const TotalContents = Pop.JoinTypedArrays(...ContentChunks);
		//return TotalContents;
		return true;
	}
	
	try
	{
		const Contents8 = await ReaderThread();
		return Contents8;
	}
	catch(e)
	{
		Pop.Warning(`Reader thread error; ${e}`);
		OnInternetBad();
		throw e;
	}
}

async function FetchOnce(Url,FetchFunc,OnProgress)
{
	if ( FetchCache.hasOwnProperty(Url) )
		return FetchCache[Url];
	
	//	run the fetch, wait for it to finish, then clear the cache
	try
	{
		FetchCache[Url] = FetchFunc(Url,OnProgress);
		const Contents = await FetchCache[Url];
		delete FetchCache[Url];
		return Contents;
	}
	catch(e)
	{
		//	gr: to make the app retry (because of the internet-bad stuff)
		//		delete the fetch cache
		//		the point of this was originally to stop multiple fetch()s
		//		previously, if it failed, we ended up with a dangling [rejected] fetch cache
		//	gr: to avoid CPU hammering, we delay this so if something is trying to fetch
		//		every frame, we don't constantly fetch & fail
		//		the downside is we POSSIBLY start a successfull one here and this fetch cache
		//		gets deleted (can that happen? there's a check before... maybe in multithreaded app it would happen)
		await Pop.Yield(1000); 
		delete FetchCache[Url];
		throw e;
	}
}

//	gr: this needs a fix like FetchOnce
Pop.LoadFileAsImageAsync = async function(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.WebApi.FileCache.GetOrFalse(Filename);
	if ( Cache !== false )
	{
		if ( IsObjectInstanceOf(Cache,Pop.Image) )
			return Cache;

		Pop.Warning(`Converting cache from ${typeof Cache} to Pop.Image...`);
		const CacheImage = await new Pop.Image();
		CacheImage.LoadPng(Cache);
		Pop.SetFileCache(Filename,CacheImage);
		return CacheImage;
	}
	
	function LoadHtmlImageAsync()
	{
		let Promise = Pop.CreatePromise();
		const HtmlImage = new Image();
		HtmlImage.onload = function ()
		{
			Promise.Resolve(HtmlImage);
		};
		HtmlImage.addEventListener('load', HtmlImage.onload, false);
		HtmlImage.onerror = function (Error)
		{
			Promise.Reject(Error);
		}
		HtmlImage.crossOrigin = "anonymous";
		//  trigger load
		HtmlImage.src = '';
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


Pop.LoadFileAsArrayBufferStreamAsync = async function (Filename,ResolveChunks=true)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = Pop.GetCachedAssetOrFalse(Filename,ResolveChunks);
	if (Cache !== false)
		return Cache;

	function OnStreamProgress(Contents,TotalSize)
	{
		//	set meta of known size if we have it, so we can work out %
		if ( TotalSize )
			Pop.SetFileKnownSize(Filename,TotalSize);
		//	keep re-writing a new file
		Pop.SetFileCache(Filename,null,Contents);
	}

	const Contents = await FetchOnce(Filename,FetchArrayBufferStream,OnStreamProgress);
	if ( Contents !== true )
		throw `FetchArrayBufferStream() should now return only true, to avoid auto resolving chunks`;
	//Pop.SetFileCache(Filename,Contents);
	//return Contents;
	return Pop.GetCachedAssetOrFalse(Filename,ResolveChunks);
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
		// Pop.Debug("Convert "+Filename+" from ", typeof Contents," to string");
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


Pop.LoadFileAsArrayBuffer = function(Filename,ResolveChunks=true)
{
	//	synchronous functions on web will fail
	if (!Pop.WebApi.FileCache.IsCached(Filename))
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	gr: our asset loader currently replaces the contents of this
	//		with binary, so do the conversion here (as native engine does)
	const Contents = Pop.GetCachedAsset(Filename,ResolveChunks);
	return Contents;
}

//	on web, this call causes a Save As... dialog to appear to save the contents
Pop.WriteToFile = function(Filename,Contents,Append=false)
{
	if ( Append )
		throw `WriteToFile cannot append on web`;
		
	let MimePrefix;
	if ( typeof Contents == 'string' )
	{
		MimePrefix = "text/plain;charset=utf-8";
	}
	else
	{
		//'application/json'
	}
		
		
	//	on web (chrome?)
	//		folder/folder/file.txt
	//	turns in folder_folder_file.txt, so clip the name
	const DownloadFilename = Filename.split('/').slice(-1)[0];

	//	gr: "not a sequence" error means the contents need to be an array
	const Options = {};
	if ( MimePrefix )
		Options.type = MimePrefix;
	const ContentsBlob = new Blob([Contents],Options);

	const DataUrl = URL.createObjectURL(ContentsBlob);
	Pop.Debug(`WriteFile blob url: ${DataUrl}`);

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
		//	gr: trying to get callback when this was succesfull or failed
		//a.ping = "data:text/html,<script>alert('hi');</script>";
		//a.onerror = function(e){	Pop.Debug(`link error ${e}`);	}
		document.body.appendChild(a);
		a.click();	//	returns nothing
		Cleanup();
	}
	catch (e)
	{
		Cleanup();
		throw e;
	}	
}

Pop.WriteStringToFile = Pop.WriteToFile;



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
//	gr: I keep assuming this is the name of the func, so maybe this is a better name
Pop.WaitForNextFrame = Pop.WaitForFrame;

