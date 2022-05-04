//	Video decoder
//		Mp4.js is for decoding mp4 containers
//		H264XXX.js is for decoding h264 frames
//	this marrys them both, for a simpler user-centric "video decoder" class
//	lots to do to make this simpler (eg. construct from url)
//	but clock, data, is all controlled by user
//
//	this should be platform (web,native) indepdent.
//	so import.meta.url will need to change which is worker-specific stuff
import {Mp4Decoder,Atom_SampleDescriptionExtension_Avcc,Atom_t} from './Mp4.js'
import WebcodecDecoder from './PopH264WebApi.js'
import * as H264 from './H264.js'
import PromiseQueue from './PromiseQueue.js'
import {JoinTypedArrays,ChunkArray} from './PopApi.js'
import {Yield} from './PopWebApiCore.js'


//const UseMp4WebWorker = !isSafari();
const UseMp4WebWorker = false;
const UseChunkArray = true;




function GetWorkerJsUrl()
{
	const ModuleUrl = import.meta.url;
	const Paths = ModuleUrl.split('/');
	
	Paths.pop();
	Paths.push('Mp4DecoderWorker.js');
	const Path = Paths.join('/');
	return Path;
}


let Mp4DecoderWebWorker;

//	give each decoder a "unique id"
let DecoderInstanceCounter = 1000;


class Mp4DecoderWebWorker_t
{
	constructor()
	{
		this.Worker = new Worker( GetWorkerJsUrl() );
		this.Worker.onerror = this.OnWorkerError.bind(this);
		this.Worker.onmessage = this.OnWorkerMessage.bind(this);
		
		this.Instances = {};	//	[id] = Mp4DecoderWebWorkerInstance_t
	}
	
	Free()
	{
		if ( this.Worker )
		{
			this.Worker.terminate();
			this.Worker = null;
		}
	}
	
	AllocInstance()
	{
		const InstanceId = DecoderInstanceCounter++;
		function PushData(Chunk)
		{
			this.PushData(Chunk,InstanceId);
		}
		const Instance = new Mp4DecoderWebWorkerInstance_t(PushData.bind(this));
		this.Instances[InstanceId] = Instance;
		return Instance;
	}
	
	OnWorkerMessage(Event)
	{
		try
		{
			if ( Event.data && Event.data.Error )
				throw Event.data.Error;

			const Message = Event.data;
			if ( !Message.Instance )
				throw `Message from web worker missing .Instance`;
			const Instance = this.Instances[Message.Instance];
			if ( !Instance )
				throw `Message from web worker for non existant instance`;
			Instance.OutputQueue.Push(Message.Data);
		}
		catch(e)
		{
			const Error = {};
			Error.Message = e;
			return this.OnWorkerError(Error);
		}
	}
	
	OnWorkerError(Event)
	{
		let Location = Event.filename ? `${Event.filename}(${Event.lineno})` : GetWorkerJsUrl();
		let Message = Event.message || '(no message)';
		const Error = `${Location}: ${Message}`;
		console.log(`Error from webworker`,Error);
		this.OutputQueue.Reject(Error);
	}
	
	PushData(Chunk,Instance)
	{
		const Message = {};
		Message.Data = Chunk;
		Message.Instance = Instance;
		this.Worker.postMessage(Message);
	}
	
	PushEndOfFile(Instance)
	{
		this.PushData(null,Instance);
	}
}

function isSafari() 
{
	return (navigator.vendor.match(/apple/i) || "").length > 0
}

function AllocMp4DecoderInstance()
{
	//	our current setup doesn't work in safari (import()/use of modules inside a webworker)
	//	fall back 
	if ( !UseMp4WebWorker )
	{
		return new Mp4Decoder();
	}
	
	if ( !Mp4DecoderWebWorker )
		Mp4DecoderWebWorker = new Mp4DecoderWebWorker_t();
		
	return Mp4DecoderWebWorker.AllocInstance();
}


class Mp4DecoderWebWorkerInstance_t
{
	constructor(PushData)
	{
		this.PushData = PushData;
		this.OutputQueue = new PromiseQueue(`Mp4 worker output`);
	}
	
	async WaitForNextSamples()
	{
		return this.OutputQueue.WaitForNext();
	}
	
	PushEndOfFile()
	{
		this.PushData(null);
	}
	
	Free()
	{
		//	put out a no-more-samples message for the h264 thread 
		this.OutputQueue.Reject('Freed');
	}
}




export class VideoDecoder
{
	constructor(DebugName=`Video`,OnMp4Decoded,OnMp4SampleExtracted,OnFrameFreed,WaitForAllowedStart)
	{
		//	external control to stop webcodec/worker alloc
		this.WaitForAllowedStart = async function(){};
		 
		//	gone through all blocks
		this.OnMp4Decoded = OnMp4Decoded || function(){};
		
		//	sample meta has been extracted AND the data from MDAT has been extracted
		this.OnMp4SampleExtracted = OnMp4SampleExtracted || function(){};
		
		//	make mp4 decoding thread
		//this.Mp4Decoder = new Mp4Decoder();
		this.Mp4Decoder = AllocMp4DecoderInstance();
		
		//	dictionary for h264time <-> sample/frame meta 
		this.FrameMetas = {};	//	[FrameIndex] = Meta
		
		//	holding on to file contents for when we need to fetch it. 
		//	Could remove this and build it into mp4 decoder to lookup mdats and take its data
		this.Mp4FileContent = UseChunkArray ? new ChunkArray() : new Uint8Array(0);	
		this.Mp4HadEof = false;
		this.Mp4FileChunkQueue = new PromiseQueue(`Mp4 Input data ${DebugName}`);
		
		//	make h264 decoding thread
		this.H264Decoder = new WebcodecDecoder(OnFrameFreed);
		this.OutputFrameQueue = new PromiseQueue(`Video Output Queue ${DebugName}`);

		//	make h264 consumer thread
		this.Mp4DecoderThreadPromise = this.Mp4DecoderThread();
		this.H264OutputThreadPromise = this.H264OutputThread();
		
		this.Mp4DecoderThreadPromise.catch(this.OnMp4ThreadError.bind(this));
		this.H264OutputThreadPromise.catch(this.OnH264ThreadError.bind(this));
	}
	
	OnMp4ThreadError(Error)
	{
		this.OutputFrameQueue.Reject(Error);
	}
	
	OnH264ThreadError(Error)
	{
		this.OutputFrameQueue.Reject(Error);
	}
	
	async WaitForNextFrame()
	{
		return this.OutputFrameQueue.WaitForNext();
	}
	
	PushEndOfFile()
	{
		this.Mp4HadEof = true;
		if ( this.Mp4Decoder )
		{
			this.Mp4Decoder.PushEndOfFile();
		}
		else
		{
			//	mp4 decoder already free... ignore?
		}
		
		//	notify anything waiting for more mp4 data that we got EOF
		this.Mp4FileChunkQueue.Push(null);
	}
	
	PushData(Chunk)
	{
		if ( !this.Mp4Decoder )
		{
			//	gr: doing this is heavy, lets just silently lose the data...
			//throw `VideoDecoder.PushData() Mp4 decoder has been freed (or possible never allocated)`;
			return;
		}
		
		this.Mp4Decoder.PushData(Chunk);
		
		//	if the data going in is a pre-decoded atom (ie, MOOV we've extracted from the tail)
		//	then it's not normal file data, so ignore it for below
		if ( Chunk instanceof Atom_t )
			return;
		
		//	storing data for sample(mdat) lookup later
		//	gr: Joining typed arrays is expensive, so instead we'll leave chunks and
		//		iterate as we need
		if ( this.Mp4FileContent instanceof Uint8Array )
		{
			this.Mp4FileContent = JoinTypedArrays( [this.Mp4FileContent, Chunk] );
		}
		else
		{
			this.Mp4FileContent.push(Chunk);
		}
		
		//	notify anything waiting for more mp4 data
		this.Mp4FileChunkQueue.Push(Chunk);
	}
	
	async WaitForNextMp4FileData()
	{
		return await this.Mp4FileChunkQueue.WaitForNext();
	}
	
	async WaitForMp4FileDataChanged()
	{
		return await this.Mp4FileChunkQueue.WaitForLatest();
	}
	
	async GetSampleData(Sample)
	{
		const Start = Sample.DataFilePosition;
		const Length = Sample.DataSize
		const End = Start + Length;
		
		//	if data hasn't arrived yet, wait for some new data to arrive
		//	todo: may need to check here if we've got EOF and will never get
		while ( !this.Mp4HadEof && this.Mp4FileContent.length < End )
		{
			//console.log(`Waiting for MP4 chunk [${Start}...${End}]/${this.Mp4FileContent.length}...`);
			//	dont need to check each change, and we can assume last will be null
			const NextData = await this.WaitForMp4FileDataChanged();
			if ( !NextData )
			{
				console.log(`Waiting for MP4 chunk [${Start}...${End}]/${this.Mp4FileContent.length}... GOT EOF`);
				break;
			}
		}
		
		if ( this.Mp4FileContent.length < End )
			throw `Wait for MP4 sample data, but out of range after EOF`;
		
		const Data = this.Mp4FileContent.slice( Start, End );
		return Data;
	}
	
		
	//	this is our hack to use frame indexes
	//	wrapped in functions to highlight where the hack is 
	FrameMetaToH264Time(Sample,FrameIndex)
	{
		//this.FrameMetas[FrameIndex] = Sample;
		//this.FrameMetas[FrameIndex].FrameIndex = FrameIndex;
		return FrameIndex;
	}

	H264TimeToFrameIndex(PresentationTime)
	{
		const FrameIndex = PresentationTime;
		return FrameIndex;
	}
		
		
	async Mp4DecoderThread()
	{
		//	todo: we need to graciously handle OOP
		//	we need to fetch all the samples first, sort by decode order...
		//	i think thats always the order in mp4 though...
		
		//	temp until we fix time in mp4 decoder
		let FrameIndex = 0;
		
		while ( true )
		{
			const NextSamples = await this.Mp4Decoder.WaitForNextSamples();
			//	eof
			if ( !NextSamples )
				break;
			
			//	see if we ever get samples before we finish download
			if ( false )
			{
				const FileSizeMb = this.Mp4FileContent.length / 1024 / 1024;
				console.log(`Got samples when mp4 file size is ${FileSizeMb.toFixed(2)}`);
			}
			
			for ( let Sample of NextSamples )
			{
				//	gr: this depends on mp4 mdat existing...
				//		this could be async and wait for mdat data to arrive
				//	todo: switch anyway and make sure we're not passing data that doesnt exist to decoder 
				
				//console.log(`Sample`,Sample);
				//	get data from original input data
				let Data = Sample.Data;
				if ( !Data )
					Data = await this.GetSampleData(Sample);
					
					
				//	hack: I believe the mp4 decoder is decoding time wrong,
				//		but more importantly in order to sync, we're currently
				//		syncing by frame number
				//		pass the reliable frame index as a time, and get it out again
				//	we use a dumb function to explicitly highlight where the hack is used
				//	we should store meta
				const PresentationTimeMs = this.FrameMetaToH264Time(Sample,FrameIndex);
				
				this.OnMp4SampleExtracted(FrameIndex);
				
				//	decoder should figure this out
				const IsKeyframe = Sample.IsKeyframe;
				if ( !this.H264Decoder.PushData( Data, PresentationTimeMs, IsKeyframe ) )
				{
					//	gr: not 
					//throw `Error pushing sample to H264 decoder`;
				}

				//	I thought maybe we're flooding the webcodec decoder a bit, but doesnt seem to make much difference
				await Yield(0);
				
				//	increase frame index if not sps/pps
				if ( !Sample.Data )
					FrameIndex++;
			}
		}
		this.H264Decoder.PushEndOfFile();
		//console.log(`Mp4(not h264) decoder thread finished`);
	}
	
	async H264OutputThread()
	{
		while ( true )
		{
			const FrameImage = await this.H264Decoder.WaitForNextFrame();
			//	eof
			if ( !FrameImage )
				break;
			
			const Frame = {};
			Frame.Data = FrameImage;
			Frame.FrameIndex = this.H264TimeToFrameIndex(FrameImage.timestamp);

			//	Client is expected to call .Free() when they're done with this frame
			this.OutputFrameQueue.Push(Frame);
		}

		//	push an EOF frame
		this.OutputFrameQueue.Push(null);
		this.Free();
	}
	
	Free()
	{
		if ( this.Mp4Decoder )
		{
			if ( this.Mp4Decoder.Free )
				this.Mp4Decoder.Free();
			this.Mp4Decoder = null;
		}
		
		if ( this.H264Decoder )
		{
			this.H264Decoder.Free();
			this.H264Decoder = null;
		}
	}
}

