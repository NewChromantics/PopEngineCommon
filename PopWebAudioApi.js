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


//	we need to associate these per context really...
Pop.Audio.Uniforms = {};
Pop.Audio.ContextJobQueue = new Pop.PromiseQueue();

Pop.Audio.ContextJobQueueProcessor = async function ()
{
	while (true)
	{
		const Context = await Pop.Audio.WaitForContext();
		const Job = await Pop.Audio.ContextJobQueue.WaitForNext();
		await Job(Context);
	}
}
Pop.Audio.ContextJobQueueProcessor().then(Pop.Debug).catch(Pop.Debug);

Pop.Audio.GetUniform = function (Name)
{
	if (!Pop.Audio.Uniforms.hasOwnProperty(Name))
	{
		throw `Pop.Audio.Uniforms has no key named ${Name}; ${Object.keys(Pop.Audio.Uniforms)}`;
	}
	return Pop.Audio.Uniforms[Name];
}

Pop.Audio.SetUniform = function (Name,Value)
{
	//	todo: call other cases for things like shared buffers
	Pop.Audio.SetUniformValue(Name,Value);
}

Pop.Audio.SetUniformValue = function (Name,Value)
{
	function SetUniformValue()
	{
		//	if the object already exists, update it
		if (!Pop.Audio.Uniforms.hasOwnProperty(Name))
			return false;
		const Uniform = Pop.Audio.Uniforms[Name];
		//	assuming gain
		//	todo: tolernace check
		Uniform.offset = Value;
	}

	//	update immediately
	if (SetUniformValue())
		return;

	//	create job to create & set
	async function Job(Context)
	{
		//	has been created in the mean time
		if (SetUniformValue())
			return;

		//	create
		const Uniform = Context.createConstantSource();
		Pop.Audio.Uniforms[Name] = Uniform;
		SetUniformValue();
	}
	Pop.Audio.ContextJobQueue.Push(Job);
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
		this.SampleBuffer = null;
		this.ReverbBuffer = null;
		
		//	webaudio says bufferSource's are one-shot and cheap to make
		//	and kill themselves off.
		//	we only need a reference to the last one in case we need to kill it
		//	or modify the node tree (params on effects)
		this.SampleNode = null;

		this.SampleGainNode = null;
		this.ReverbGainNode = null;
		this.ReverbNode = null;
		this.SampleVolume = 1;	//	gain
		this.ReverbVolume = 1;	//	wetness/gain

		this.Name = Name;
		this.ActionQueue = new Pop.PromiseQueue();
		this.Update().then(Pop.Debug).catch(Pop.Debug);
		
		this.SetSample(WaveData);
	}
	
	IsSignificantVolumeChange(Old,New)
	{
		const Diff = Math.abs(Old-New);
		if ( Diff < 0.01 )
			return false;
		return true;
	}
	
	SetReverbWetness(Gain)
	{
		//	we need to change the nodes as little as possible, so have to check for differences
		if ( !this.IsSignificantVolumeChange(this.ReverbVolume,Gain) )
			return;
		
		this.ReverbVolume = Gain;
		
		if ( this.ReverbGainNode )
			this.ReverbGainNode.gain.value = Gain;
	}
	
	SetVolume(Volume)
	{
		//	we need to change the nodes as little as possible, so have to check for differences
		if ( !this.IsSignificantVolumeChange(this.SampleVolume,Volume) )
			return;
		
		this.SampleVolume = Volume;
		
		if ( this.SampleGainNode )
			this.SampleGainNode.gain.value = Volume;
	}
	
	SetSample(WaveData)
	{
		async function Run(Context)
		{
			if ( WaveData instanceof AudioBuffer )
			{
				this.SampleBuffer = WaveData;
			}
			else
			{
				this.SampleBuffer = await this.DecodeAudioBuffer(Context,WaveData);
			}
			//	now out of date/not dirt
			this.SampleWaveData = null;
			
			//this.DestroySamplerNodes(Context);
			//Pop.Debug(`SetSample() todo: retrigger sample creation at current time if playing`);
		}
		this.ActionQueue.Push(Run);
	}
	
	SetReverb(ReverbData)
	{
		async function Run(Context)
		{
			//	todo: decode if wavedata rather than AudioBuffer
			//const AudioBuffer = await this.DecodeAudioBuffer(Context,this.ReverbImpulseResponseWave);
			const AudioBuffer = ReverbData;
			this.ReverbBuffer = AudioBuffer;
			
			this.DestroyReverbNodes(Context);
			Pop.Debug(`SetReverb() todo: retrigger sample creation at current time if playing`);
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
		
		//	could decode data here
		
		while (true)
		{
			const Action = await this.ActionQueue.WaitForNext();
			await Action.call(this,Context);
		}
	}
	
	
	DestroyReverbNodes(Context)
	{
		if ( this.ReverbNode )
		{
			if ( this.ReverbNode.stop )
				this.ReverbNode.stop();
			this.ReverbNode.disconnect();
			this.ReverbNode = null;
		}
		
		if ( this.ReverbGainNode )
		{
			if ( this.ReverbGainNode.stop )
				this.ReverbGainNode.stop();
			this.ReverbGainNode.disconnect();
			this.ReverbGainNode = null;
		}
	}
	
	DestroySamplerNodes(Context)
	{
		if ( this.SampleNode )
		{
			if ( this.SampleNode.stop )
				this.SampleNode.stop();
			this.SampleNode.disconnect();
			this.SampleNode = null;
		}
		
		//	gr: dont need to keep deleting this
		/*
		if ( this.SampleGainNode )
		{
			if ( this.SampleGainNode.stop )
				this.SampleGainNode.stop();
			this.SampleGainNode.disconnect();
			this.SampleGainNode = null;
		}
		*/
	}
	
	CreateSamplerNodes(Context)
	{
		this.DestroySamplerNodes(Context);
		
		//	create sample buffer if we need to (ie. out of date)
		if ( !this.SampleBuffer )
			throw `Sample Buffer is out of date`;
		
		//	create nodes
		this.SampleNode = Context.createBufferSource();
		this.SampleNode.buffer = this.SampleBuffer;
		
		//	create gain node if it doesn't exist
		if ( !this.SampleGainNode )
		{
			this.SampleGainNode = Context.createGain();
			//	make sure volume is correct
			//	gr: doing this every time causes a click!
			this.SampleGainNode.gain.value = this.SampleVolume;
		}

		this.SampleNode.connect( this.SampleGainNode );
		this.SampleGainNode.connect( Context.destination );
	}
	
	
	CreateReverbNodes(Context)
	{
		//	recreating these nodes every time causes a click in chrome
		//this.DestroyReverbNodes(Context);
		
		//	no reverb data
		if ( !this.ReverbBuffer )
			return;
		
		//	create nodes
		if ( !this.ReverbNode )
		{
			this.ReverbNode = Context.createConvolver();
			this.ReverbNode.loop = true;
			this.ReverbNode.normalize = true;
			this.ReverbNode.buffer = this.ReverbBuffer;
		}
		
		//	create gain node if it doesn't exist
		if ( !this.ReverbGainNode )
		{
			this.ReverbGainNode = Context.createGain();

			//	make sure gain is correct
			this.ReverbGainNode.gain.value = this.ReverbVolume;
		}

		this.SampleNode.connect( this.ReverbNode );
		this.ReverbNode.connect( this.ReverbGainNode );
		this.ReverbGainNode.connect( Context.destination );
	}
	
	Play(TimeMs)
	{
		const QueueTime = Pop.GetTimeNowMs();
		//Pop.Debug(`Queue play(${Name}) at ${Pop.GetTimeNow}
		async function DoPlay(Context)
		{
			this.CreateSamplerNodes(Context);
			this.CreateReverbNodes(Context);

			//	start!
			const DelaySecs = 0;
			const OffsetSecs = TimeMs / 1000;
			this.SampleNode.start(DelaySecs,OffsetSecs);
			
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
		const Channels = 1;
		const Duration = 4;
		const BufferSize = Duration * Channels * Context.sampleRate;
		const NoiseBuffer = Context.createBuffer( Channels, BufferSize, Context.sampleRate );
		for ( let c=0;	c<NoiseBuffer.numberOfChannels;	c++ )
		{
			const Data = NoiseBuffer.getChannelData(c);
			Pop.Math.FillRandomFloat(Data,-1,1);
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
	
	const Context = await Pop.Audio.WaitForContext();

	//	test noise buffer creation
	//return CreateNoiseBuffer(Context);
	
	// create a noise burst which decays over the duration in each channel
	const Channels = 1;
	const SampleRate = Context.sampleRate;
	const DurationSamples = (DecaySecs + PreDelaySecs) * SampleRate;
	const OfflineContext = new OfflineAudioContext( Channels, DurationSamples, SampleRate );
	const noiseL = CreateNoiseNode(OfflineContext);
	//const noiseR = CreateNoiseNode(OfflineContext);
	//const merge = CreateMergeNode(OfflineContext);
	//noiseL.connect(merge, 0, 0);
	//noiseR.connect(merge, 0, 1);
	const gainNode = OfflineContext.createGain()
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
	gainNode.gain.exponentialRampToValueAtTime(0.01,NinetyPercent);
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
