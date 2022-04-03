//	dependencies
//		Pop.Gui.Timeline
//		Pop.FrameCounter
//		Pop.WaitForFrame	(PopWebApi atm)
//	this is currently dependent on the API's in the web implementation, native needs to catchup with stats
Pop.Gui.RenderTimelineWindow = class
{
	constructor(Name,Rect,GetData)
	{
		this.ReportFrequencyMs = 300;
		this.Window = new Pop.Gui.Window(Name,Rect);
		this.Window.EnableScrollbars(false,false);
		
		this.Timeline = new Pop.Gui.Timeline(this.Window,[0,0,'100%','100%'],this.GetTimelineData.bind(this));

		//	1 pixel for every report
		this.Timeline.ViewTimeToPx = 10/this.ReportFrequencyMs;
		this.Timeline.SmearData = true;
		this.Timeline.TrackHeight = 30;

		this.TimelineData = {};
		this.TimelineData.GetDataColour = this.GetDataColour.bind(this);
		
		this.Counters = {};
		
		this.UpdateRenderCounterLoop();
	}

	async UpdateRenderCounterLoop()
	{
		while(this.Window)
		{
			await Pop.WaitForFrame();
			
			if ( this.Window.IsMinimised() )
			{
				await Pop.Yield(2000);
				continue;
			}
			
			//	flush opengl stats
			const Stats = Pop.Opengl.Stats;
			for ( const Key in Stats )
			{
				//	grab value, update counter, reset counter
				const Value = Stats[Key];
				this.UpdateCounter(Key,Value);
				Stats[Key] = 0;
			}
		}
	}
	
	UpdateTimelineData(Name,Counter)
	{
		//	round to nearest frequency
		const Now = Math.floor(Pop.GetTimeNowMs()/this.ReportFrequencyMs) * this.ReportFrequencyMs;
		
		if ( !this.TimelineData.hasOwnProperty(Now) )
			this.TimelineData[Now] = {};
		this.TimelineData[Now][Name] = Counter;

		this.OnDataChanged();
	}
	
	UpdateCounter(Name,Add)
	{
		//	filter counters here
		if ( Name != 'Renders' )
			return;
		
		if ( !this.Counters.hasOwnProperty(Name) )
		{
			this.Counters[Name] = new FrameCounter(Name,this.ReportFrequencyMs);
			//	catch report
			function Report(CountPerSec)
			{
				this.UpdateTimelineData(Name,CountPerSec);
			}
			this.Counters[Name].Report = Report.bind(this);
		}
		this.Counters[Name].Add(Add);
	}
	
	GetDataColour(Key,Value)
	{
		//	scale data to 1sec
		Value *= 1000 / this.ReportFrequencyMs;
		
		//	renders are out of 60
		if ( Key == 'Renders' )
		{
			const Max = 60;
			const SizeNormal = Math.min( 1, Value / Max );
			const RgbHeight = Math.NormalToRedGreen(SizeNormal);
			RgbHeight[3] = SizeNormal;
			return RgbHeight;
		}
	}
	
	GetTimelineData(MinTime,MaxTime)
	{
		return this.TimelineData;
	}

	OnDataChanged()
	{
		if ( this.Window.IsMinimised() )
			return;
		this.Timeline.OnDataChanged();
	}

}



