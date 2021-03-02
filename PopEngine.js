const PopX = {};
export default PopX;

import Opengl from './PopEngineOpengl.js'
import PromiseQueue from './PromiseQueue.js'

//	assign namespaces
PopX.Opengl = Opengl;



//	global functions
PopX.Debug = console.log;
PopX.Warning = console.warn;

PopX.GetTimeNowMs = function()
{
	return performance.now();
}

//	create a promise function with the Resolve & Reject functions attached so we can call them
PopX.CreatePromise = function()
{
	let Callbacks = {};
	let PromiseHandler = function(Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	Prom.Resolve = Callbacks.Resolve;
	Prom.Reject = Callbacks.Reject;
	return Prom;
}

PopX.Yield = function(Milliseconds)
{
	const Promise = PopX.CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}

//	private web platform things
PopX.WebApi = {};


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
