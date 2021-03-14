import PopImage from './PopWebImageApi.js'
import PromiseQueue from './PromiseQueue.js'
export * from './PopWebApiCore.js'
import * as Pop from './PopWebApiCore.js'

//	need to re-export some of the core parts
//export Debug,Warning;

//	we cannot poll the focus/blur state of our page, so we
//	assume it's foreground (may not be the case if opened via middle button?)
let ForegroundState = true;
//	gr: currently require a PromiseQueue() class as we have a cyclic dependency. Fix this!
let ForegroundChangePromises = new PromiseQueue();

function IsMinimised()
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

function IsForeground()
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
	let State = ForegroundState;
	State = State && !IsMinimised();
	return State;
}

function SetIsForeground(NowIsForeground)
{
	Pop.Debug(`Foreground changed from ,${ForegroundState} to ${NowIsForeground}. Document.hidden=${document.hidden}`);
	if (NowIsForeground!==undefined)
		ForegroundState = NowIsForeground;

	const Foreground = IsForeground();
	Pop.Debug(`IsForeground state = ${IsForeground()}`);
	ForegroundChangePromises.Push(Foreground);
}

export async function WaitForForegroundChange()
{
	return ForegroundChangePromises.WaitForNext();
}


//	todo: call a func here in case we expand to have some async change promise queues
window.addEventListener('focus',function () { SetIsForeground(true); });
window.addEventListener('blur',function () { SetIsForeground(false); });
window.addEventListener('visibilitychange',function () { SetIsForeground(!document.hidden); });




export function GetPlatform()
{
	return 'Web';
}


//	computer name wants to be some kind of unique, but not-neccessarily unique name
//	this doesn't really exist, so store & retrieve a random string in the session
//	storage, so we can at least have unique tabs
export function GetComputerName()
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
		//Debug(`RandomString=${RandomString}`);
		return RandomString;
	}
	
	//	make one up
	Name = 'Pop_' + CreateRandomHash();
	window.sessionStorage.setItem('Pop.ComputerName',Name);
	return Name;
}

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


export function GetTimeNowMs()
{
	//	this returns a float, even though it's in ms,
	//	so round to integer
	const Now = performance.now();
	return Math.floor(Now);
}

export function ShowWebPage(Url)
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



//	call this when any kind of download gets new information
function OnInternetGood()
{
	WebApi.InternetStatus = true;
	WebApi.InternetStatusChangedQueue.PushUnique();
}
//	call when any fetch fails (not due to 404 or anything with a response)
function OnInternetBad()
{
	WebApi.InternetStatus = false;
	WebApi.InternetStatusChangedQueue.PushUnique();
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

export function CompileAndRun(Source,Filename)
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


export async function Yield(Milliseconds)
{
	const Promise = CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}

/*
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

*/




/*
class AsyncFrameLoop
{
	constructor()
	{
		this.AnimationFramePromiseQueue = new PromiseQueue();
		this.LastFrameTime = null;
		this.MaxTimestep = 1/30;
		
		this.BrowserAnimationStep(null);
	}
	
	BrowserAnimationStep(Time)
	{
		if ( Time !== null )
		{
			//	clear old frames so we don't get a backlog
			this.AnimationFramePromiseQueue.ClearQueue();
			this.AnimationFramePromiseQueue.Push(Time);
			//Pop.Debug(`BrowserStep(${Time})`);
		}
		window.requestAnimationFrame(this.BrowserAnimationStep.bind(this));
	}

	//	returns delta seconds since last frame
	//	we cap the timestep as the gap between frames will be massive when debugging
	//	anything that needs real time can use Pop.GetTimeNowMs()
	async WaitForFrame()
	{
		//	wait for next frame time
		const Time = await this.AnimationFramePromiseQueue.WaitForLatest();
	
		//	cap timestep as this time will be massive between frames when debugging
		let Timestep = (this.LastFrameTime===null) ? 0 : (Time-this.LastFrameTime);
		Timestep = Math.min( this.MaxTimestep, Timestep );
		this.LastFrameTime = Time;
		return Timestep;
	}
}

//	gr: I keep assuming this is the name of the func, so maybe this is a better name
PopX.WebApi.AsyncFrameLoop = new AsyncFrameLoop();
PopX.WaitForNextFrame = PopX.WebApi.AsyncFrameLoop.WaitForFrame.bind(PopX.WebApi.AsyncFrameLoop);
*/


//	todo: promise queue that only stores the latest (we need a keyframe'd queue!)
const AnimationFramePromiseQueue = new PromiseQueue();	

function BrowserAnimationStep(Time)
{
	//	clear old frames so we don't get a backlog
	AnimationFramePromiseQueue.ClearQueue();
	AnimationFramePromiseQueue.Push(Time);
	//Pop.Debug(`BrowserStep(${Time})`);
	window.requestAnimationFrame(BrowserAnimationStep);
}
//	start loop sequence
BrowserAnimationStep();

//	gr: currently web only, but the main API should have something like this
//	returns delta seconds since last frame
//	we cap the timestep as the gap between frames will be massive when debugging
//	anything that needs real time can use Pop.GetTimeNowMs()
let LastFrameTime = null;
let MaxTimestep = 1/30;
export async function WaitForFrame()
{
	//	wait for next frame time
	//	gr: should be latest?
	const Time = await AnimationFramePromiseQueue.WaitForNext();
	
	//	cap timestep as this time will be massive between frames when debugging
	let Timestep = (LastFrameTime===null) ? 0 : (Time-LastFrameTime);
	Timestep = Math.min( MaxTimestep, Timestep );
	LastFrameTime = Time;
	return Timestep;
}
//	gr: I keep assuming this is the name of the func, so maybe this is a better name
export const WaitForNextFrame = WaitForFrame;

