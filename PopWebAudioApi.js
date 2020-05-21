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
	
	Seek(TimeMs)
	{
		function DoSeek()
		{
			this.Sound.currentTime = TimeMs / 1000;
		}
		this.ActionQueue.Push( DoSeek );
	}
	
	async Update()
	{
		//	load
		//	wait until we can play in browser
		await WaitForClick();
		await this.Sound.play();
		
		//	immediately pause
		this.Sound.pause();
		
		while(this.Sound)
		{
			const Action = await this.ActionQueue.WaitForNext();
			await Action.call(this);
		}
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
				Pop.Debug(`Play delay ${this.Name} ${Delay}ms`);
		}
		this.ActionQueue.Push(DoPlay);
	}
}
