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
//	gr: Kandisnky AudioManager listened for touchend ... is this significant?
window.addEventListener('touchstart',OnDomTrigger,true);
window.addEventListener('touchend',OnDomTrigger,true);

async function WaitForClick()
{
	await DomTriggerPromise;
}


//	gr: I dont like double negatives, but matching Audio.muted
//	https://www.w3schools.com/TAGs/av_prop_muted.asp
Pop.Audio._GlobalMuted = false;
Pop.WebApi.MutedChangePromises = new WebApi_PromiseQueue();

Pop.Audio.SetMuted = function(Muted)
{
	Pop.Audio._GlobalMuted = Muted;
	Pop.WebApi.MutedChangePromises.Push(Muted);
}

Pop.Audio.IsMuted = function()
{
	const Background = !Pop.WebApi.IsForeground();
	const Muted = Background || Pop.Audio._GlobalMuted;
	return Muted;
}

Pop.Audio.WaitForMutedChange = async function()
{
	return Pop.WebApi.MutedChangePromises.WaitForNext();
}

/*
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
Pop.Audio.ContextJobQueueProcessor().then(Pop.Debug).catch(Pop.Warning);

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
*/


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
		
		//	null if not paused
		this.ResumeTimeMs = null;
		
		this.ActionQueue = new Pop.PromiseQueue();
		this.GlobalUpdateCheckThread().then(Pop.Debug).catch(Pop.Warning);
		this.Update().then(Pop.Debug).catch(Pop.Warning);
	}
	
	async GlobalUpdateCheckThread()
	{
		const OnMutedChange = function(Muted)
		{
			/*
			if ( Foreground )
			{
				if ( this.ResumeTimeMs !== null )
				{
					Pop.Debug(`SimpleSound(${this.Name}) resume ${this.ResumeTimeMs}`);
					this.Play(this.ResumeTimeMs);
					this.ResumeTimeMs = null;
				}
			}
			else 
			{
		 		this.Pause();
			}
			*/
			this.Sound.muted = Muted;
		}.bind(this);
	
		//	do an initial state in case we start a sound when we expect it silent
		while(this.Sound)
		{
			const Muted = Pop.Audio.IsMuted();	//	checks foreground & state
			Pop.Debug(`SimpleSound(${this.Name}) Muted=${Muted}`);
			OnMutedChange(Muted);

			const OnForeground = Pop.WebApi.WaitForForegroundChange();
			const OnMuted = Pop.Audio.WaitForMutedChange();
			await Promise.race([OnForeground,OnMuted]);
		}
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

	PushAction(Lambda)
	{
		//	prevent massive queues;
		//	play() should do something more intelligent like a dirty desired time and a thread wake

		//	this queue is not being flushed (Update async thread not being called when tab in the background?)
		//	but the web-animation async call IS, which results in a massive unflushed queue...
		if (this.ActionQueue.length > 10)
		{
			Pop.Warning(`WebAudio action queue has reached ${this.ActionQueue.length}, discarding`);
			this.ActionQueue.ClearQueue();
		}
		this.ActionQueue.Push(Lambda);
	}

	Play(TimeMs=0)
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
		this.PushAction(DoPlay);
		this.ResumeTimeMs = null;	//	unset any pause time
	}
	
	Pause()
	{
		if ( this.Sound )
		{
			this.ResumeTimeMs = this.Sound.currentTime * 1000;
			Pop.Debug(`SimpleSound(${this.Name}) pause at ${this.ResumeTimeMs}`);
		}
		Pop.Debug(`SimpleSound(${this.Name}) pausing`);
		async function DoPause()
		{
			this.Sound.pause();
		}
		this.PushAction(DoPause);
	}

	Stop()
	{
		async function DoStop()
		{
			this.Sound.pause();
		}
		//	dont allow resume
		this.ResumeTimeMs = null;
		this.PushAction(DoStop);
	}
}


//	singleton
//	gr: could turn this into a single promise that is resolved once and then forever ready
Pop.Audio.Context = null;
Pop.Audio.WaitForContext = async function()
{
	if (Pop.Audio.Context)
		return Pop.Audio.Context;
	
	//	wait for DOM security
	await WaitForClick();
	
	//	gr: this can follow through many times,
	//		so make sure only the first one causes an alloc
	if (Pop.Audio.Context)
		return Pop.Audio.Context;

	//	get func
	const TAudioContext = window.AudioContext || window.webkitAudioContext;
	Pop.Audio.Context = new TAudioContext();
	return Pop.Audio.Context;
}

Pop.Audio.SoundInstanceCounter = 1000;

//	more complex WebAudio sound
Pop.Audio.Sound = class
{
	constructor(WaveData,Name)
	{
		//	overload this for visualisation
		this.OnVolumeChanged = function(Volume01){};

		//	data
		this.BufferByteSize = WaveData.length;
		this.SampleBuffer = null;
		this.ReverbBuffer = null;
		
		//	webaudio says bufferSource's are one-shot and cheap to make
		//	and kill themselves off.
		//	we only need a reference to the last one in case we need to kill it
		//	or modify the node tree (params on effects)
		this.SampleNode = null;
		this.SampleGainNode = null;
		this.SampleVelocityGainNode = null;
		this.ReverbGainNode = null;
		this.ReverbNode = null;
		this.SampleVolume = 1;	//	gain
		this.SampleVelocity = 1;	//	gain
		this.ReverbVolume = 1;	//	wetness/gain

		//	meta
		this.KnownDurationMs = null;
		this.Name = Name;
		this.UniqueInstanceNumber = Pop.Audio.SoundInstanceCounter++;

		//	to reduce job queue, when we have a new target time or stop command
		//	we update this value to non-null and queue a UpdatePlayState
		//	if it's a time, we want to seek to that time. if it's false, we want to stop
		//	if it's null the state isn't dirty
		this.PlayTargetTime = null;

		//	run state
		this.ActionQueue = new Pop.PromiseQueue();
		this.Alive = true;	//	help get out of update loop
		this.Update().catch(Pop.Warning);
		
		this.SetSample(WaveData);
	}
	
	GetDurationMs()
	{
		if ( this.KnownDurationMs == null )
			throw `Pop.Audio.Sound ${this.Name} has [currently] unknown duration`;
		return this.KnownDurationMs;
	}
	
	IsSignificantVolumeChange(Old,New)
	{
		const Diff = Math.abs(Old-New);
		if ( Diff < 0.001 )
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
	
	SetVelocity(Velocity)
	{
		//	assume has not been transformed and still 0-127
		if (!Number.isInteger(Velocity))
			throw `Pop.Sound.SetVelocity(${Velocity}) is expecting an integer from 0-127`;
		
		//Velocity = (Velocity*Velocity) / (127*127);
		const Velocity01 = Velocity/127;
		//	velocity is a logarithmic curve, which gives us attenuation
		//	gain is DB change (also logarithmic) so do we still need to convert attenuation to db change?
		Velocity = Math.log1p(Velocity01);
		
		//	we need to change the nodes as little as possible, so have to check for differences
		if ( !this.IsSignificantVolumeChange(this.SampleVelocity,Velocity) )
			return;
		/*
		if ( Velocity < 0 || Velocity > 1 )
			throw `Expecting Velocity(${Velocity}) 0...1`;
*/
		this.SampleVelocity = Velocity;
		Pop.Debug(`New Velocity ${Velocity}`);
		
		if ( this.SampleVelocityGainNode )
			this.SampleVelocityGainNode.gain.value = Velocity;
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
			//	now out of date/not dirty
			this.SampleWaveData = null;

			//	restore time/stopped state, but force sampler rebuild
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
		this.KnownDurationMs = SampleBuffer.duration * 1000;
		//Pop.Debug(`Audio ${this.Name} duration: ${this.KnownDurationMs}ms`);
		return SampleBuffer;
	}
	
	
	async Update()
	{
		//	load
		const Context = await Pop.Audio.WaitForContext();

		//	run through commands that need a context
		//	if we're being freed(!alive) process all remaining actions
		while ( this.Alive || this.ActionQueue.HasPending() )
		{
			let Action = await this.ActionQueue.WaitForNext();
			if (Action == 'UpdatePlayTargetTime')
				Action = this.UpdatePlayTargetTime.bind(this);
			await Action.call(this,Context);
		}
	}
	
	DestroyAllNodes(Context)
	{
		this.DestroySamplerNodes(Context);
		this.DestroyReverbNodes(Context);
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
	
	DestroySamplerNodes(Context,DestroyGainNode=false)
	{
		if ( this.SampleNode )
		{
			//	this should stop the reverb too as it's linked to this node
			if ( this.SampleNode.stop )
				this.SampleNode.stop();
			this.SampleNode.disconnect();
			this.SampleNode = null;
			
			this.OnVolumeChanged(0);
		}
		
		//	gr: dont need to keep deleting this
		if ( this.SampleGainNode && DestroyGainNode )
		{
			if ( this.SampleGainNode.stop )
				this.SampleGainNode.stop();
			this.SampleGainNode.disconnect();
			this.SampleGainNode = null;
		}
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
		
		if ( !this.SampleVelocityGainNode )
		{
			this.SampleVelocityGainNode = Context.createGain();
			//	make sure volume is correct
			//	gr: doing this every time causes a click!
			this.SampleVelocityGainNode.gain.value = this.SampleVelocity;
		}
		
		//	report for visualisation
		const Volume = this.SampleGainNode.gain.value * this.SampleVelocityGainNode.gain.value;
		this.OnVolumeChanged(Volume);

		this.SampleNode.connect( this.SampleVelocityGainNode );
		this.SampleVelocityGainNode.connect( this.SampleGainNode );
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
		this.ReverbNode.connect(this.ReverbGainNode);

		const ApplySampleGain = true;
		if (ApplySampleGain)
		{
			this.ReverbGainNode.connect(this.SampleVelocityGainNode);
			this.SampleVelocityGainNode.connect(this.SampleGainNode);
			this.SampleGainNode.connect(Context.destination);
		}
		else
		{
			this.ReverbGainNode.connect(Context.destination);
		}
	}
	
	//	sample node doesnt have a time, it's just offset
	//	from the real time we started, so we have to track it
	GetSampleNodeCurrentTimeMs()
	{
		if ( !this.SampleNode )
			return false;
		
		const Now = Pop.GetTimeNowMs();
		const Offset = Now - this.SampleNodeStartTime;
		return Offset;
	}

	async UpdatePlayTargetTime(Context)
	{
		if (this.PlayTargetTime === null)
			return Pop.Warning(`Sound has caused a play/stop but the target value is not dirty`);

		if (this.PlayTargetTime === false)
		{
			this.DestroySamplerNodes(Context);
			this.PlayTargetTime = null;
			return;
		}

		//	seek to time
		const TimeMs = this.PlayTargetTime;
		this.PlayTargetTime = null;

		//	gr: avoid seek/reconstruction where possible
		const SampleTimeIsClose = function ()
		{
			const MaxMsOffset = 100;
			const CurrentTime = this.GetSampleNodeCurrentTimeMs();
			if (CurrentTime === false)
				return false;
			const Difference = Math.abs(TimeMs - CurrentTime);
			if (Difference < MaxMsOffset)
				return true;
			Pop.Debug(`Sample ${this.Name} time is ${TimeMs - CurrentTime}ms out`);
			return false;
		}.bind(this);

		if (SampleTimeIsClose())
			return;

		this.CreateSamplerNodes(Context);
		this.CreateReverbNodes(Context);

		//	start!
		const DelaySecs = 0;
		const OffsetSecs = TimeMs / 1000;
		this.SampleNode.start(DelaySecs,OffsetSecs);
		this.SampleNodeStartTime = Pop.GetTimeNowMs() - TimeMs;
		Pop.Debug(`Starting audio ${OffsetSecs} secs #${this.UniqueInstanceNumber} ${this.Name}`);
	}
	
	Play(TimeMs=0)
	{
		//	gr: could call SampleTimeIsClose() here and avoid this queue entirely
		//	mark dirty and do new state update (if not already queued)
		this.PlayTargetTime = TimeMs;
		this.ActionQueue.PushUnique('UpdatePlayTargetTime');
	}
	
	Stop()
	{
		//	mark dirty and cause update of state (if not already queued)
		this.PlayTargetTime = false;
		this.ActionQueue.PushUnique('UpdatePlayTargetTime');
	}
	
	Free()
	{
		//	stop ASAP & cleanup everything
		//	gr: can we clear out as many actions as possible?
		async function Destroy(Context)
		{
			this.DestroyAllNodes(Context);
			//Pop.Debug(`Destroy other sound resources`,this);
			this.SampleBuffer = null;
			this.SampleWaveData = null;
			Pop.Debug(`Free'd sound instance #${this.UniqueInstanceNumber}/${this.Name}`)
		}
		//	other immediate cleanup here?
		this.Alive = false;
		this.ActionQueue.Push(Destroy);
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

Pop.Audio.FakeMidiInputName = 'FakeMidiInput';

Pop.Audio.GetMidiInputs = async function ()
{
	if (!window.navigator.requestMIDIAccess)
		throw `Midi devices not supported`;

	const Options = {};
	Options.sysex = true;
	const Access = await window.navigator.requestMIDIAccess(Options);
	const Inputs = [];

	for (let [Key,Input] of Access.inputs)
	{
		Inputs.push(Input);
	}

	return Inputs;
}

Pop.Audio.FakeMidiInput = class
{
	constructor()
	{
		this.name = Pop.Audio.FakeMidiInputName;

		//	listen to keynboard
		window.addEventListener('keydown',this.OnKeyDown.bind(this));
		window.addEventListener('keyup',this.OnKeyUp.bind(this));
		this.onmidimessage = function () { };
	}

	GetNoteFromKey(Key)
	{
		const FirstNote = 12 * 6;
		switch (Key)
		{
			case 'a': return FirstNote + 0;
			case 's': return FirstNote + 2;
			case 'd': return FirstNote + 4;
			case 'f': return FirstNote + 5;
			case 'g': return FirstNote + 7;
			case 'h': return FirstNote + 9;
			case 'j': return FirstNote + 10;
			default: return null;
		}
	}

	OnKeyDown(KeyEvent)
	{
		//	dont retrigger if this is a repeat
		if (KeyEvent.repeat)
		{
			KeyEvent.preventDefault();
			return false;
		}

		// Pop.Debug(`OnKeyDown`);
		const Note = this.GetNoteFromKey(KeyEvent.key);
		if (!Note)
			return;

		const MidiEvent = {};
		MidiEvent.NoteOn = Note;
		this.onmidimessage(MidiEvent);
		KeyEvent.preventDefault();

		//	stop this going up the dom
		//KeyEvent.stopPropagation();
	}

	OnKeyUp(KeyEvent)
	{
		const Note = this.GetNoteFromKey(KeyEvent.key);
		if (!Note)
			return;

		const MidiEvent = {};
		MidiEvent.NoteOff = Note;
		this.onmidimessage(MidiEvent);
		KeyEvent.preventDefault();
	}
}

Pop.Audio.MidiDevice = class
{
	constructor(Name)
	{
		this.Input = null;
		this.EventQueue = new Pop.PromiseQueue();
		this.Init(Name).catch(this.OnError.bind(this));
	}

	OnError(Error)
	{
		this.EventQueue.Reject(Error);
	}

	async Init(Name)
	{
		const Inputs = await Pop.Audio.GetMidiInputs();

		if (Name == Pop.Audio.FakeMidiInputName)
		{
			this.Input = new Pop.Audio.FakeMidiInput();
		}
		else
		{
			const MatchingInputs = Inputs.filter(i => i.name == Name);
			if (MatchingInputs.length == 0)
				throw `No MIDI devices matching ${Name}`;
			this.Input = MatchingInputs[0];
		}
		this.Input.onmidimessage = this.OnMidiMessage.bind(this);
	}

	OnMidiMessage(Event)
	{
		const MidiData = Event.data;
		//	reuse Pop.Midi stuff better!
		let Read = 0;
		function Pop8()	{	return MidiData[Read++];	}

		//	function ParseMidiEvent(MidiEventAndChannel,TimeMs)
		const MidiEventAndChannel = Pop8();
		const MidiEvent = (MidiEventAndChannel & 0b11110000) >> 4;
		const Channel = MidiEventAndChannel & 0b00001111;
		//const MidiEventName = MidiEvents.GetName(MidiEvent) || MidiEvent.toString(16);

		const OutputEvent = {};
		OutputEvent.MidiEvent = MidiEvent;
		OutputEvent.Channel = Channel;
		OutputEvent.Note = Pop8();
		OutputEvent.Velocity = Pop8();
		OutputEvent.Time = Event.timeStamp;
		
		//	[144,44,105]
		//	https://developer.mozilla.org/en-US/docs/Web/API/MIDIMessageEvent
		//	turn event into something we can handle (or let raw midi stuff flow to mix with Pop.Midi)
		this.EventQueue.Push(OutputEvent);
	}

	WaitForNext()
	{
		return this.EventQueue.WaitForNext();
	}
}

//	Pop.Midi = file format, so put these under Pop.Audio
Pop.Audio.OnNewMidiDevicePromiseQueue = null;

Pop.Audio.EnumMidiDevicesLoop = async function(IncludeFakeDevice)
{
	Pop.Audio.OnNewMidiDevicePromiseQueue = new Pop.PromiseQueue();

	const Inputs = await Pop.Audio.GetMidiInputs();
	for ( let Input of Inputs )
	{
		const DeviceName = Input.name;
		Pop.Audio.OnNewMidiDevicePromiseQueue.Push(DeviceName);
	}

	//	add our fake device last
	if ( IncludeFakeDevice )
	{
		const FakeDeviceName = Pop.Audio.FakeMidiInputName;
		Pop.Audio.OnNewMidiDevicePromiseQueue.Push(FakeDeviceName);
	}
	
	//	how to we wait for new devices?
}

Pop.Audio.WaitForNewMidiDevice = async function(IncludeFakeDevice)
{
	//	start the watch loop
	if (!Pop.Audio.OnNewMidiDevicePromiseQueue)
	{
		Pop.Audio.EnumMidiDevicesLoop(IncludeFakeDevice);
	}

	return Pop.Audio.OnNewMidiDevicePromiseQueue.WaitForNext();
}
