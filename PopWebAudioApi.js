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
	constructor(WaveData,Name,ReverbImpulseResponseWave)
	{
		this.WaveData = WaveData;
		this.ReverbImpulseResponseWave = ReverbImpulseResponseWave;
		
		this.Name = Name;
		this.ActionQueue = new Pop.PromiseQueue();
		this.Update().then(Pop.Debug).catch(Pop.Debug);
		
		this.SampleBuffer = null;
		
		//	webaudio says bufferSource's are one-shot and cheap to make
		//	and kill themselves off.
		//	we only need a reference to the last one in case we need to kill it
		//	or modify the node tree (params on effects)
		this.CurrentSource = null;
		
		this.Nodes = [];
	}
	
	
	
	SetReverb(Params)
	{
		this.ReverbNode.attack = Params.Attack;
		this.ReverbNode.decay = Params.Decay;
		this.ReverbNode.release = Params.Release;
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
	
	async LoadReverbNode(Context)
	{
		if ( !this.ReverbImpulseResponseWave )
		{
			Pop.Debug(`No ReverbImpulseResponseWave supplied. No reverb`);
			return;
		}
		
		//	gr: cache file in context?
		const AudioBuffer = await this.DecodeAudioBuffer(Context,this.ReverbImpulseResponseWave);

		//	todo: update existing sources with tree
		const Node = Context.createConvolver();
		Node.buffer = AudioBuffer;
		//Node.attack = 0;
		//Node.decay = 0.1;
		//Node.release = 10;
		this.Nodes.push(Node);
		this.ReverbNode = Node;
	}
	
	async Update()
	{
		//	load
		const Context = await Pop.Audio.WaitForContext();
		
		this.SampleBuffer = await this.DecodeAudioBuffer(Context,this.WaveData);
		await this.LoadReverbNode(Context);
		
		while (this.SampleBuffer)
		{
			const Action = await this.ActionQueue.WaitForNext();
			await Action.call(this,Context);
		}
	}
	
	CullCurrentSource()
	{
		if ( !this.CurrentSource )
			return;
		
		//	check if it's ended
		//	warn if still playing, or stop?
	}
	
	CreateSource(Context)
	{
		//	create node tree
		//	todo: keep the tree (reverb, volume etc) in some meta
		const BufferSource = Context.createBufferSource();
		BufferSource.buffer = this.SampleBuffer;
		//BufferSource.connect( Context.destination );
		this.CurrentSource = BufferSource;
		
		const Tree = this.Nodes.slice();
		Tree.splice(0,0,BufferSource);
		Tree.push(Context.destination);
		for ( let i=0;	i<Tree.length-1;	i++ )
		{
			const Prev = Tree[i];
			const Next = Tree[i+1];
			Prev.connect(Next);
		}
		
		//this.CurrentSource.onended = function(){	Pop.Debug("Sample finished");	};
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
			this.CurrentSource.start(DelaySecs,OffsetSecs);
			
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
			if ( !this.CurrentSource )
				return;
			const DelaySecs = 0;
			this.CurrentSource.stop(DelaySecs);
		}
		this.ActionQueue.Push(DoStop);
	}
}
