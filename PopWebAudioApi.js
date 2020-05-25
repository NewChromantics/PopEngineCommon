Pop.Audio = {};


const DomTriggerPromise = Pop.CreatePromise();
function OnDomTrigger()
{
	/*
	//	on safari, this has to be inside the actual event callback
	if ( !Pop.Audio.Context )
	{
		const TAudioContext = window.AudioContext || window.webkitAudioContext;
		Pop.Audio.Context = new TAudioContext();
	}*/

	DomTriggerPromise.Resolve();
}
window.addEventListener('click',OnDomTrigger,true);
window.addEventListener('touchstart',OnDomTrigger,true);

async function WaitForClick()
{
	await DomTriggerPromise;
}


//	simply play a sound with HTMLAudio objects, no effects
Pop.Audio.SimpleSound = class
{
	constructor(WaveData,Name)
	{
		this.Name = Name;
		
		//	convert wav to base64
		const WaveData64 = btoa(
						  WaveData.reduce((data, byte) => data + String.fromCharCode(byte), '')
						  );
		
		//const WaveData64 = btoa(String.fromCharCode.apply(null, WaveData));
		const Data64 = 'data:audio/mp3;base64,' + WaveData64;
		Pop.Debug('Converting to base64');
		//	load
		this.Sound = new Audio(Data64);
		this.ActionQueue = new Pop.PromiseQueue();
		this.Update().then(Pop.Debug).catch(Pop.Debug);
	}

	async Update()
	{
		//	load
		//	wait until we can play in browser
		await WaitForClick();
		//	gr: having this after click means they all play straight away
		//		see if we can do something to make sure it's ready to play, but not play()
		//await this.Sound.play();

		//	immediately pause
		this.Sound.pause();

		while (this.Sound)
		{
			const Action = await this.ActionQueue.WaitForNext();
			await Action.call(this);
		}
	}
	
	Play(TimeMs)
	{
		const QueueTime = Pop.GetTimeNowMs();
		//Pop.Debug(`Queue play(${Name}) at ${Pop.GetTimeNow}
		async function DoPlay()
		{
			this.Sound.currentTime = TimeMs / 1000;
			await this.Sound.play();
			const Delay = Pop.GetTimeNowMs() - QueueTime;
			if ( Delay > 5 )
				Pop.Debug(`Play(${TimeMs.toFixed(2)}) delay ${this.Name} ${Delay.toFixed(2)}ms`);
		}
		this.ActionQueue.Push(DoPlay);
	}

	Stop()
	{
		async function DoStop()
		{
			this.Sound.pause();
		}
		this.ActionQueue.Push(DoStop);
	}
}


//	singleton
//	gr: could turn this into a single promise that is resolved once and then forever ready
Pop.Audio.Context = null;
Pop.Audio.WaitForContext = async function()
{
	if (Pop.Audio.Context)
		return Pop.Audio.Context;
	
	//	wait for security
	await WaitForClick();
	//	get func
	const TAudioContext = window.AudioContext || window.webkitAudioContext;
	Pop.Audio.Context = new TAudioContext();
	return Pop.Audio.Context;
}


//	more complex WebAudio sound
Pop.Audio.Sound = class
{
	constructor(WaveData,Name)
	{
		this.WaveData = WaveData;
		
		this.Name = Name;
		this.ActionQueue = new Pop.PromiseQueue();
		this.Update().then(Pop.Debug).catch(Pop.Debug);
		
		this.SampleBuffer = null;
		
		//	webaudio says bufferSource's are one-shot and cheap to make
		//	and kill themselves off.
		//	we only need a reference to the last one in case we need to kill it
		//	or modify the node tree (params on effects)
		this.CurrentSampleNode = null;
		
		this.ReverbGainNode = null;
		this.ReverbNode = null;
	}
	
	
	SetReverb(ReverbImpulseResponseWaveData,Wetness)
	{
		async function Run(Context)
		{
			//	make a new reverb node
			//const AudioBuffer = await this.DecodeAudioBuffer(Context,this.ReverbImpulseResponseWave);
			const AudioBuffer = ReverbImpulseResponseWaveData;
			
			//	https://middleearmedia.com/demos/webaudio/convolver.html
			//	todo: update existing sources with tree
			const Convolver = Context.createConvolver();
			//const Convolver = Context.createBufferSource();
			//Convolver.start();
			Convolver.loop = true;
			Convolver.normalize = true;
			Convolver.buffer = AudioBuffer;
			
			
			//	we then control the effect with gain
			const ConvolverGain = Context.createGain();
			ConvolverGain.gain.setValueAtTime(Wetness,0);
			//	in here;
			//	https://middleearmedia.com/demos/webaudio/convolver.html
			//	source -> convgain -> convolver -> master gain
			//	source -> mastergain-> master compression(dynamics)
			
			this.ReverbGainNode = ConvolverGain;
			this.ReverbNode = Convolver;
		}
		this.ActionQueue.Push(Run);
	}
	
	SetSample(WaveData,Loop=false)
	{
		async function Run(Context)
		{
			//	make a new reverb node
			//const AudioBuffer = await this.DecodeAudioBuffer(Context,this.ReverbImpulseResponseWave);
			const AudioBuffer = WaveData;
			
			this.SampleBuffer = AudioBuffer;
			/*
			CurrentSampleNode
			const SampleNode = Context.createBufferSource();
			SampleNode.buffer = AudioBuffer;
			
			this.NoiseNode = SampleNode;
			this.NoiseNode.loop = true;
			 */
		}
		this.ActionQueue.Push(Run);
	}
	
	async DecodeAudioBuffer(Context,WaveData)
	{
		//	safari doesn't currently support the promise version of this
		//	https://github.com/chrisguttandin/standardized-audio-context
		//this.SampleBuffer = await Context.decodeAudioData( this.WaveData.buffer );
		const DecodeAudioPromise = Pop.CreatePromise();
		//	decodeAudioData detaches the data from the original source so becomes empty
		//	as this can affect the original file, we duplicate here
		const DataCopy = WaveData.slice();
		Context.decodeAudioData( DataCopy.buffer, DecodeAudioPromise.Resolve, DecodeAudioPromise.Reject );
		const SampleBuffer = await DecodeAudioPromise;
		return SampleBuffer;
	}
	
	
	async Update()
	{
		//	load
		const Context = await Pop.Audio.WaitForContext();
		
		this.SampleBuffer = await this.DecodeAudioBuffer(Context,this.WaveData);
		
		while (this.SampleBuffer)
		{
			const Action = await this.ActionQueue.WaitForNext();
			await Action.call(this,Context);
		}
	}
	
	CullCurrentSource()
	{
		if ( !this.CurrentSampleNode )
			return;
		
		//	check if it's ended
		//	warn if still playing, or stop?
	}
	
	CreateSource(Context)
	{
		//	create node tree
		const SampleNode = Context.createBufferSource();
		SampleNode.buffer = this.SampleBuffer;
		
		//BufferSource.connect( Context.destination );
		this.CurrentSampleNode = SampleNode;
		
		function ConnectNodes(Nodes)
		{
			//	skip if any null nodes
			if ( Nodes.some( n => n==null ) )
				return;
			for ( let i=0;	i<Nodes.length-1;	i++ )
			{
				const Prev = Nodes[i];
				const Next = Nodes[i+1];
				Prev.connect(Next);
			}
		}
		
		const SourceNodes = [SampleNode,Context.destination];
		const ReverbNodes = [SampleNode,this.ReverbGainNode,this.ReverbNode,Context.destination];
		//const ReverbNodes = [BufferSource,this.ReverbGainNode,Context.destination];
		//const ReverbNodes = [this.ReverbNode,Context.destination];
		//ConnectNodes(SourceNodes);
		ConnectNodes(ReverbNodes);
		
		//this.CurrentSampleNode.onended = function(){	Pop.Debug("Sample finished");	};
	}
	
	Play(TimeMs)
	{
		const QueueTime = Pop.GetTimeNowMs();
		//Pop.Debug(`Queue play(${Name}) at ${Pop.GetTimeNow}
		async function DoPlay(Context)
		{
			this.CullCurrentSource();
			this.CreateSource(Context);

			//	start!
			const DelaySecs = 0;
			const OffsetSecs = TimeMs / 1000;
			this.CurrentSampleNode.start(DelaySecs,OffsetSecs);
			
			//	debug
			const JobDelay = Pop.GetTimeNowMs() - QueueTime;
			if ( JobDelay > 5 )
				Pop.Debug(`Play delay ${this.Name} ${JobDelay.toFixed(2)}ms`);
		}
		this.ActionQueue.Push(DoPlay);
	}
	
	Stop()
	{
		async function DoStop()
		{
			if ( !this.CurrentSampleNode )
				return;
			const DelaySecs = 0;
			this.CurrentSampleNode.stop(DelaySecs);
		}
		this.ActionQueue.Push(DoStop);
	}
}


//	https://github.com/Tonejs/Tone.js/blob/dd10bfa4b526f4b78ac48877fce31efac745329c/Tone/effect/Reverb.ts#L108
Pop.Audio.GenerateImpulseResponseWaveBuffer = async function(DecaySecs=0.7,PreDelaySecs=0.01)
{
	function CreateNoiseBuffer(Context)
	{
		const Channels = 2;
		const Duration = 2;
		const BufferSize = Duration * Channels * Context.sampleRate;
		const NoiseBuffer = Context.createBuffer( Channels, BufferSize, Context.sampleRate );
		for ( let c=0;	c<NoiseBuffer.numberOfChannels;	c++ )
		{
			const Data = NoiseBuffer.getChannelData(c);
			for ( let i = 0; i < Data.length; i++)
			{
				Data[i] = Math.random() * 2 - 1;
			}
		}
		return NoiseBuffer;
	}
	
	function CreateNoiseNode(Context)
	{
		const NoiseBuffer = CreateNoiseBuffer(Context);
		var whiteNoise = Context.createBufferSource();
		whiteNoise.buffer = NoiseBuffer;
		whiteNoise.loop = true;
		whiteNoise.start(0);
		
		return whiteNoise;
	}
	/*
	function CreateMergeNode(Context)
	{
		
	}
	*/
	function CreateGainNode(Context)
	{
		const Node = Context.createGain();
		return Node;
	}
	
	const Context = await Pop.Audio.WaitForContext();

	//	test noise buffer creation
	//return CreateNoiseBuffer(Context);
	
	// create a noise burst which decays over the duration in each channel
	const Channels = 2;
	const SampleRate = Context.sampleRate;
	const DurationSamples = (DecaySecs + PreDelaySecs) * SampleRate;
	const OfflineContext = new OfflineAudioContext( Channels, DurationSamples, SampleRate );
	const noiseL = CreateNoiseNode(OfflineContext);
	//const noiseR = CreateNoiseNode(OfflineContext);
	//const merge = CreateMergeNode(OfflineContext);
	//noiseL.connect(merge, 0, 0);
	//noiseR.connect(merge, 0, 1);
	const gainNode = CreateGainNode(OfflineContext);
	//merge.connect(gainNode);
	noiseL.connect(gainNode);
	//noiseL.start(0);
	//noiseR.start(0);
	
	gainNode.connect( OfflineContext.destination );
	
	// predelay
	gainNode.gain.setValueAtTime(0, 0);
	gainNode.gain.setValueAtTime(1, PreDelaySecs);
	const HundredPercent = PreDelaySecs + DecaySecs;
	const NinetyPercent = HundredPercent * 0.9;
	//	this needs to calc the value at 90% (exponential can't go to zero)
	//gainNode.gain.exponentialRampToValueAtTime(0.01,NinetyPercent);
	// at 90% start a linear ramp to the final value
	gainNode.gain.linearRampToValueAtTime(0,HundredPercent);
	/*
	// decay
	function exponentialApproachValueAtTime(Value,Time,RampTime)
	{
		//time = this.toSeconds(time);
		//rampTime = this.toSeconds(rampTime);
		const timeConstant = Math.log(rampTime + 1) / Math.log(200);
		this.setTargetAtTime(value, time, timeConstant);
		// at 90% start a linear ramp to the final value
		this.cancelAndHoldAtTime(time + rampTime * 0.9);
		this.linearRampToValueAtTime(value, time + rampTime);
		return this;
	}.bind(gainNode.gain);
	//gainNode.gain.exponentialApproachValueAtTime(0, PreDelaySecs, DecaySecs );
	exponentialApproachValueAtTime(0, PreDelaySecs, DecaySecs );
	*/
	
	
	// render the buffer
	const CompletedEvent = await OfflineContext.startRendering();
	Pop.Debug(`CompletedEvent ${CompletedEvent}`);
	const AudioBuffer = CompletedEvent;
	
	return AudioBuffer;
}
