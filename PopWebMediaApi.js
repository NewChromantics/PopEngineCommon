//	gr: clean this up and name it properly!
//		and use the proper media api
//		not a video element!
import {Debug,Warning,Yield} from './PopWebApiCore.js'
import {WaitForNextFrame} from './PopWebApi.js'
import PromiseQueue from './PromiseQueue.js'
import {CreatePromise} from './PromiseQueue.js'


export class Source
{
	constructor(Serial)
	{
		if ( navigator.mediaDevices === undefined )
			throw `Browser doesn't support .mediaDevices`;

		this.StreamPromise = this.CreateStream(Serial);
		this.FrameQueue = new PromiseQueue();
	}
	
	OnStreamData(DataEvent)
	{
		//	get blob and add to framequeue
		Debug(`Got stream data ${DataEvent}`);
	}
	
	async ReadVideoLoop()
	{
	
		while ( this.VideoElement )
		{
			if ( !this.VideoElement.videoWidth || !this.VideoPlayed )
			{
				const w = this.VideoElement.videoWidth;
				const h = this.VideoElement.videoHeight;
				Debug(`Video size is ${w}x${h}, starting video`);
				
				try
				{
					Debug(`Video.play()`);
					const PlayResult = await this.VideoElement.play();	//	gr: osx safari said this was async...
					this.VideoPlayed = true;
					Debug(`Video play result = ${PlayResult}`);
					const Width = Math.max( 200, this.VideoElement.videoWidth );	//	w/h is 1x1 on safari
					const Height = Math.max( 200, this.VideoElement.videoHeight );
					Debug(`Video(canvas) size ${this.VideoElement.videoWidth}x${this.VideoElement.videoHeight}`);
				}
				catch(e)
				{
					Warning(`Video.play exception; ${e}`);
					await Yield(500);
					continue;
					return;
				}
			}
			
			
			//requestAnimationFrame( this.ReadVideoLoop.bind(this) );
			await WaitForNextFrame();
			
			const ImageWidth = this.VideoElement.videoWidth;
			const ImageHeight = this.VideoElement.videoHeight;
				
			if ( ImageWidth == 0 || ImageHeight == 0 )
			{
				Warning(`ReadVideoLoop has VideoElement (.width/.height) size ${this.VideoElement.width}x${this.VideoElement.height}`);
				await Yield(500);
				continue;
			}
			
			//	helper because a lot of stuff doesn't expect this to be (just) a video element
			this.VideoElement.width = this.VideoElement.videoWidth;
			this.VideoElement.height = this.VideoElement.videoHeight;
			
			const Frame = this.VideoElement;
			this.FrameQueue.Push(Frame);
		}
	}
	
	async CreateStream(CameraDeviceName)
	{
		const SupportedConstraints = navigator.mediaDevices.getSupportedConstraints();
		Debug(`SupportedConstraints; ${JSON.stringify(SupportedConstraints)}`,SupportedConstraints);
	
		//	init params
		const Constraints = {};
		Constraints.audio = false;
		//	gr: setting min:1 here on safari gives us video 1x1,
		//		so have some min and hopefully with no resize mode we get native camera res
		//	we may want to pick a size here and crop and scale to reduce CPU work when searching for aruco later
		Constraints.video = 
		{
			width:	{ min: 320, ideal: 640 },
			height:	{ min: 240, ideal: 480 },
			
			//	avoid any resizing/cropping in the browser to reduce any cpu work
			//	'crop-and-scale' will resize to match ideal constraints 
			resizeMode: 'none',	
  		};
  		
		//	use a specific device
		if ( this.CameraDeviceName )
			Constraints.video.optional = [{sourceId: CameraDeviceName}];

		//const GetUserMedia = navigator.mediaDevices.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
		const Stream = await navigator.mediaDevices.getUserMedia( Constraints );
		
		const Format = 'Rgba';
		
		if ( Format == 'H264' )
		{
			//	gr: this creates h264 data
			//	make a data consumer
			Stream.Recorder = new MediaRecorder(Stream);
			Stream.Recorder.ondataavailable = this.OnStreamData.bind(this);
			
			//	https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start
			//	The number of milliseconds to record into each Blob
			//	 If this parameter isn't included, the entire media duration is recorded into a single Blob
			const TimeSlice = 1000/60;
			Stream.Recorder.start(TimeSlice);
		}
		else
		{
			this.Stream = Stream;
			this.VideoElement = document.createElement('video');//new HTMLVideoElement();
			document.body.appendChild(this.VideoElement);
			//VideoElement.srcObject = Stream;
			//VideoElement.autoplay = true;
			//VideoElement.onloadedmetadata = OnLoaded;
			//await VideoLoadedMetaPromise;
		
			const LoadedMetaPromise = CreatePromise();
			const CanPlayPromise = CreatePromise();
			const ResizedPromise = CreatePromise();
			
			function OnLoadedMeta(Event)
			{
				Debug('OnLoadedMeta');
				LoadedMetaPromise.Resolve(Event);
			}
			
			function OnCanPlay(Event)
			{
				Debug('OnCanPlay');
				CanPlayPromise.Resolve(Event);
			}
			
			function OnResized(Event)
			{
				Debug('OnResized');
				ResizedPromise.Resolve(Event);
			}
			
			this.VideoElement.onloadedmetadata = OnLoadedMeta;
			this.VideoElement.onloadstart = ()=>Debug('onloadstart');
			this.VideoElement.ondurationchange = ()=>Debug('ondurationchange');
			this.VideoElement.onloadeddata = ()=>Debug('onloadeddata');
			//this.VideoElement.onprogress = ()=>Debug('onprogress');
			this.VideoElement.oncanplay = OnCanPlay;
			this.VideoElement.oncanplaythrough = ()=>Debug('oncanplaythrough');
			
			this.VideoElement.addEventListener('resize',OnResized);

			this.VideoElement.srcObject = Stream;
			
			
			//	start streaming
			//	+ extras for safari
			//	https://stackoverflow.com/a/59893075/355753
			this.VideoElement.setAttribute('autoplay', true);
			//this.VideoElement.setAttribute('autoplay', '');
			this.VideoElement.setAttribute('muted', '');
			this.VideoElement.setAttribute('playsinline', '');
			
			const Meta = await LoadedMetaPromise;
			//	still needs play for safari? (once meta is loaded)
			Debug(`Meta loaded...`,Meta);
			await CanPlayPromise;
			await ResizedPromise;
			this.ReadVideoLoop();
		}	
		
		return Stream;
	}
	
	async WaitForFrame()
	{
		const Stream = await this.StreamPromise;
		const NextFrame = await this.FrameQueue.WaitForNext();
		return NextFrame;
	}
}

//	module
const Media = {};
export default Media;

Media.Source = Source;

