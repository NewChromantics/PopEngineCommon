import * as Pop from './PopEngine.js'


export class Clock
{
	constructor(TimeMs,GetLiveTimeMs=Pop.GetTimeNowMs)
	{
		this.GetLiveTimeMs = GetLiveTimeMs;
		this.ClockTimeMs = TimeMs;
		this.AppTimeMs = this.GetLiveTimeMs();
		
		this.PausedAppTime = null;
	}
	
	get TimeMs()
	{
		if ( this.PausedAppTime ) 
			return this.ClockTimeMs;
			
		const Elapsed = this.GetLiveTimeMs() - this.AppTimeMs;
		return this.ClockTimeMs + Elapsed;
	}
	
	Pause()
	{
		if ( this.PausedAppTime )
			return;
		
		//	reset our origin time to the current time and we can resume from that again later
		this.ClockTimeMs = this.TimeMs;
		this.PausedAppTime = this.GetLiveTimeMs();
		this.AppTimeMs = null;
	}
	
	Resume()
	{
		if ( !this.PausedAppTime )
			return;
		
		this.PausedAppTime = null;
		this.AppTimeMs = this.GetLiveTimeMs();
	}
}


export default class FrameCounter
{
	constructor(CounterName="",LapTimeMs=1000)
	{
		this.CounterName = CounterName;
		this.LapTimeMs = LapTimeMs;
		this.LastLapTime = null;
		this.Count = 0;
		
		//	this can be overloaded, so is a member
		this.Report = this.ReportDefault.bind(this);
	}
	
	ReportDefault(CountPerSec)
	{
		Pop.Debug( this.CounterName + " " + CountPerSec.toFixed(2) + "/sec");
	}

	OnLap()
	{
		let TimeElapsed = Pop.GetTimeNowMs() - this.LastLapTime;
		let Scalar = TimeElapsed / this.LapTimeMs;
		let CountPerSec = this.Count / Scalar;
		this.Report( CountPerSec );
		this.LastLapTime = Pop.GetTimeNowMs();
		this.Count = 0;
	}
	
	Add(Increment=1)
	{
		this.Count += Increment;
		
		if ( this.LastLapTime === null )
			this.LastLapTime = Pop.GetTimeNowMs();
		
		let TimeElapsed = Pop.GetTimeNowMs() - this.LastLapTime;
		if ( TimeElapsed > this.LapTimeMs )
		{
			this.OnLap();
		}
	}
}
