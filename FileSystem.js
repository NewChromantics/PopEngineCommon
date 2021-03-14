import Image from './PopWebImageApi.js'
import FileCache_t from './FileCache.js'
import PromiseQueue from './PromiseQueue.js'


const Default = 'FileSystem.js Module';
export default Default;

//	file cache, not asset cache!
//	rework this system so we have an async version on desktop too
export const FileCache = new FileCache_t();


//	we're interpreting the url as
//	http://exefilename/exedirectory/?exearguments
export function GetExeFilename()
{
	return window.location.hostname;
}

export function GetExeDirectory()
{
	//	exe could be path location.pathname
	const Path = window.location.pathname;
	//	including /
	const Directory = Path.substr( 0, Path.lastIndexOf("/") + 1 );
	return Directory;
}

export function GetExeArguments()
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
let InternetStatus = true;	//	we can pretty safely assume it's initially fine
const InternetStatusChangedQueue = new PromiseQueue('InternetStatusChangedQueue');

export async function WaitForInternetStatusChange()
{
	//	wait for a change (dirty) and then return latest status 
	await InternetStatusChangedQueue.WaitForNext();
	return InternetStatus;
}

//	call this when any kind of download gets new information
function OnInternetGood()
{
	InternetStatus = true;
	InternetStatusChangedQueue.PushUnique();
}
//	call when any fetch fails (not due to 404 or anything with a response)
function OnInternetBad()
{
	InternetStatus = false;
	InternetStatusChangedQueue.PushUnique();
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
	Debug(`Streaming file; `,Fetched);
	let KnownSize = parseInt(Fetched.headers.get("content-length"));
	KnownSize = isNaN(KnownSize) ? -1 : KnownSize;
	const KnownSizeKb = (KnownSize/1024).toFixed(2);
	//	gr: maybe fture speed up with our own buffer
	//		https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamBYOBReader but currently 0 support
	const Reader = Fetched.body.getReader();

	async function ReaderThread()
	{
		Debug(`Reading fetch stream ${Url}/${KnownSizeKb}kb`);
	
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
				Debug(`Stopping stream ${Filename} at ${TotalContents.length / 1024}kb`);
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
			//Debug(`chunk ${Url} Finished=${Finished} x${ChunkSize}/${KnownSizeKb}`,Chunk);
			AppendChunk(ChunkContents);
			if ( Finished )
				break;
		}
		
		
		//	do a final join. OnProgress should have done this in the file cache
		//	so this array may be a bit redundant (and a duplicate!)
		//	so try and fetch the other one, but for now, keep it here to make sure
		//	the old way of expecting a complete buffer is here
		//	gr: we now only auto resolve chunks on request
		//const TotalContents = JoinTypedArrays(...ContentChunks);
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
		Warning(`Reader thread error; ${e}`);
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
		await Yield(1000); 
		delete FetchCache[Url];
		throw e;
	}
}


//	gr: this needs a fix like FetchOnce
export async function LoadFileAsImageAsync(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = WebApi.FileCache.GetOrFalse(Filename);
	if ( Cache !== false )
	{
		if ( IsObjectInstanceOf(Cache,PopImage) )
			return Cache;

		Warning(`Converting cache from ${typeof Cache} to Pop.Image...`);
		const CacheImage = await new PopImage();
		CacheImage.LoadPng(Cache);
		FileCache.Set(Filename,CacheImage);
		return CacheImage;
	}
	
	function LoadHtmlImageAsync()
	{
		let Promise = CreatePromise();
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
	const Img = new PopImage(HtmlImage);
	FileCache.Set(Filename,Img);
	return Img;
}

export async function LoadFileAsStringAsync(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = FileCache.GetOrFalse(Filename);
	if ( Cache !== false )
	{
		//	convert cache if its not a string. Remote system may deliver raw binary file
		//	and we don't know the type until it's requested
		if ( typeof Cache == 'string' )
			return Cache;

		const CacheString = BytesToString(Cache);
		FileCache.Set(Filename,CacheString);
		return CacheString;
	}
	
	const Contents = await FetchOnce(Filename,FetchText);
	FileCache.Set(Filename,Contents);
	return Contents;
}


export async function LoadFileAsArrayBufferAsync(Filename)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = FileCache.GetOrFalse(Filename);
	if ( Cache !== false )
		return Cache;

	const Contents = await FetchOnce(Filename,FetchArrayBuffer);
	FileCache.Set(Filename,Contents);
	return Contents;
}


export async function LoadFileAsArrayBufferStreamAsync(Filename,ResolveChunks=true)
{
	//	return cache if availible, if it failed before, try and load again
	const Cache = FileCache.GetOrFalse(Filename,ResolveChunks);
	if (Cache !== false)
		return Cache;

	function OnStreamProgress(Contents,TotalSize)
	{
		//	set meta of known size if we have it, so we can work out %
		if ( TotalSize )
			FileCache.SetFileKnownSize(Filename,TotalSize);
		//	keep re-writing a new file
		FileCache.Set(Filename,null,Contents);
	}

	const Contents = await FetchOnce(Filename,FetchArrayBufferStream,OnStreamProgress);
	if ( Contents !== true )
		throw `FetchArrayBufferStream() should now return only true, to avoid auto resolving chunks`;
	//FileCache.Set(Filename,Contents);
	//return Contents;
	return FileCache.GetOrFalse(Filename,ResolveChunks);
}

export function LoadFileAsString(Filename)
{
	//	synchronous functions on web will fail
	if (!Pop.WebApi.FileCache.IsCached(Filename))
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	gr: our asset loader currently replaces the contents of this
	//		with binary, so do the conversion here (as native engine does)
	const Contents = FileCache.Get(Filename);
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

export function LoadFileAsImage(Filename)
{
	//	synchronous functions on web will fail
	if (!FileCache.IsCached(Filename))
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	return FileCache.Get(Filename);
}


export function LoadFileAsArrayBuffer(Filename,ResolveChunks=true)
{
	//	synchronous functions on web will fail
	if (!Pop.WebApi.FileCache.IsCached(Filename))
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	gr: our asset loader currently replaces the contents of this
	//		with binary, so do the conversion here (as native engine does)
	const Contents = FileCache.Get(Filename,ResolveChunks);
	return Contents;
}

//	on web, this call causes a Save As... dialog to appear to save the contents
export function WriteToFile(Filename,Contents,Append=false)
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

export const WriteStringToFile = WriteToFile;



export async function LoadFilePromptAsStringAsync(Filename)
{
	const OnChangedPromise = CreatePromise();
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
export function FileExists(Filename)
{
	return FileCache.IsCached(Filename);
}

