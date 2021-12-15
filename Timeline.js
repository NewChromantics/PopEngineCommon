class Keyframe_t
{
	constructor(Time,Uniforms={})
	{
		this.Time = parseFloat(Time);
		if ( isNaN(this.Time) )
			throw `Keyframe time(${Time}) in timeline keyframe is not a float`;
		
		this.Uniforms = Uniforms;
	}
}

//	A timeline is a class which for any Time will pull out interpolated
//	values for specific uniforms

//	expected json input is
//	time is keyed and should be in order for readability, but this class sorts order
//	"0":{ "a":0, "b":"Hello" },
//	"9.87":{ "a":10 }
export default class Timeline
{
	constructor(TimelineJson)
	{
		//	these should be in order
		this.Keyframes = [];
		
		for ( let Time in TimelineJson )
		{
			const Uniforms = TimelineJson[Time];
			this.AddKeyframe( Time, Uniforms );
		}
	}
	
	GetDurationMs()
	{
		//	gr: not figured out this timescale yet
		const LastTime = this.Keyframes[ this.Keyframes.length-1 ].Time;
		return LastTime;
	}
	
	AddKeyframe(Time,Uniforms)
	{
		//	todo: make sure there are no duplicates
		const Keyframe = new Keyframe_t( Time, Uniforms );
		this.Keyframes.push( Keyframe );
		this.OnKeyframesChanged();
	}
	
	OnKeyframesChanged()
	{
		function CompareTime(a,b)
		{
			if ( a.Time < b.Time )	return -1;
			if ( b.Time < a.Time )	return 1;
			throw `Not expecting two keyframes with the same time (${a.Time},${b.Time})`;
		}
		//	make sure keyframes are in order
		this.Keyframes.sort(CompareTime);
		
		//	regenerate holes/caches
	}
}
