Pop.Audio = {};


const DomTriggerPromise = Pop.CreatePromise();
function OnDomTrigger()
{
	DomTriggerPromise.Resolve();
}
window.addEventListener('click',OnDomTrigger,true);
window.addEventListener('touchstart',OnDomTrigger,true);

async function WaitForClick()
{
	await DomTriggerPromise;
}


Pop.Audio.Sound = class
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

	Seek(TimeMs)
	{
		const QueueTime = Pop.GetTimeNowMs();
		function DoSeek()
		{
			//this.Sound.pause();	//	not sure if neccessary
			this.Sound.currentTime = TimeMs / 1000;
			const Delay = Pop.GetTimeNowMs() - QueueTime;
			if (Delay > 5)
				Pop.Debug(`Seek delay ${this.Name} ${Delay.toFixed(2)}ms now: ${this.Sound.currentTime}`);
		}
		this.ActionQueue.Push( DoSeek );
	}
	
	Play()
	{
		const QueueTime = Pop.GetTimeNowMs();
		//Pop.Debug(`Queue play(${Name}) at ${Pop.GetTimeNow}
		async function DoPlay()
		{
			await this.Sound.play();
			const Delay = Pop.GetTimeNowMs() - QueueTime;
			if ( Delay > 5 )
				Pop.Debug(`Play delay ${this.Name} ${Delay.toFixed(2)}ms`);
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
