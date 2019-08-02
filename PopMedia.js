//	use like Pop.Media.Source, but just 1 frame
Pop.Media.ImageSource = function(Filename)
{
	this.Image = new Pop.Image(Filename);
	
	this.GetNextFrame = async function(ImageBuffer,StreamIndex,Latest)
	{
		if ( !this.Image )
		{
			Pop.Debug("no more frames");
			//	gr: just never return? this is what a Pop.Media does, need to fix that
			await Pop.Yield(9999999);
			return;
			throw "No more frames in ImageMediaSource";
		}

		if ( ImageBuffer != null )
			ImageBuffer.Copy( this.Image );
		else
			ImageBuffer = this.Image;
		this.Image = null;
		return ImageBuffer;
	}
}



function TTrack(Track,TrackIndex)
{
	this.Track = Track;
	this.Frames = [];
	
	this.PushFrame = function(TimeMs,SampleIndex,NalUnits)
	{
		this.Frames.push( [TimeMs,SampleIndex,NalUnits] );
	}
	
	this.GetDuration = function()
	{
		let LastFrame = this.Frames[this.Frames.length-1];
		//	todo + duration to get proper end
		return LastFrame[0];
	}
	
	this.GetFrameIndexAtTime = function(TimeMs)
	{
		TimeMs = TimeMs % this.GetDuration();
		
		//	walk until we find frame
		//	normally this is bad and should binary chop,
		//	but video shouldn't be too long
		for ( let f=0;	f<this.Frames.length;	f++ )
		{
			let Frame = this.Frames[f];
			if ( Frame[0] < TimeMs )
				continue;
			
			return f;
		}
		
		throw "Didn't find nal units for time " + TimeMs;
	}
	
	this.GetFrameNalUnits = function(FrameIndex)
	{
		let Frame = this.Frames[FrameIndex];
		return Frame[2];
	}
	
	
	let IsSyncSample = function()
	{
		return true;
	}
	let SampleTimeTable = Track.trak.mdia.minf.stbl.stts.table;
	let Time = 0;	//	todo: get proper start time!
	let SampleIndex = 0;
	for ( let ChunkIndex=0;	ChunkIndex<SampleTimeTable.length;	ChunkIndex++ )
	{
		let Chunk = SampleTimeTable[ChunkIndex];
		for ( let ChunkSampleIndex=0;	ChunkSampleIndex<Chunk.count;	ChunkSampleIndex++ )
		{
			let IsLastFrame = (ChunkIndex==SampleTimeTable.length-1) && (ChunkSampleIndex==Chunk.count-1);
			let Meta = {};
			Meta.TrackIndex = TrackIndex;
			Meta.IsKeyframe = IsSyncSample(SampleIndex);
			Meta.IsLastFrame = IsLastFrame;
			Meta.FrameIndex = SampleIndex;
			Meta.TimeMs = Math.floor( Track.timeToSeconds(Time) * 1000 );
			Meta.DurationMs = Math.floor( Track.timeToSeconds(Chunk.delta) * 1000 );
			
			let NalUnits = Track.getSampleNALUnits( SampleIndex );
			let NalUnitHeader = NalUnits[0][0];
			let NalUnitZero = (NalUnitHeader >> 7) & 0x01;
			if ( NalUnitZero!= 0)
				Pop.Debug("NalUnitZero=="+NalUnitZero+" NalUnitHeader=="+NalUnitHeader);
			let NalUnitKeyframe = (NalUnitHeader >> 5) & 0x03;
			let NalUnitType = (NalUnitHeader >> 0) & 0x1F;
			//Pop.Debug("Nal unit type: " +NalUnitType);
			if ( NalUnitType==5 )
			{
				if ( !Meta.IsKeyframe )
					Pop.Debug("i frame isnt keyframe");
				Meta.IsKeyframe |= NalUnitType==5;
			}
			
			//	save this frame
			this.PushFrame( Meta.TimeMs, SampleIndex, NalUnits );
			Time += Chunk.delta;
			SampleIndex++;
		}
		
		//	debug frame times
		//this.Frames.forEach( f => Debug(f[0] + " " + (typeof f[2]) ) );
	}
	
}

//	same as Pop.Media.Source, but for video files
Pop.Media.VideoSource = function(Filename)
{
	this.FileBytes = Pop.LoadFileAsArrayBuffer(Filename);
	this.Reader = new MP4Reader( new Bytestream(this.FileBytes) );
	this.Reader.read();
	
	//	todo: proper tracks
	let TrackIndex = 1;
	this.VideoTrack = new TTrack( this.Reader.tracks[TrackIndex], TrackIndex );
	
	this.Decoder = new Pop.Media.AvcDecoder();
	this.LastFrame = null;
	this.StartTime = null;
	
	//	replace this to control timing
	this.GetCurrentTime = function()
	{
		const Time = (this.StartTime === null) ? 0 : Pop.GetTimeNowMs() - this.StartTime;
		return Time;
	}
	
	this.GetNextFrame = async function(ImageBuffer,StreamIndex,Latest)
	{
		//	gr: if !Latest, change Time to just the next frame in sequence
		//	get correct time
		//	grab samples we want to process
		//	decode them (pull planes of latest)

		//	need to wait until time is ready for next frame
		while ( true )
		{
			const Time = this.GetCurrentTime();
			let Frame = this.VideoTrack.GetFrameIndexAtTime(Time);
			
			//	latest = frame skip
			if ( !Latest )
			{
				if ( this.LastFrame === null )
					Frame = 0;
				if ( Frame > this.LastFrame )
					Frame = this.LastFrame+1;
			}
			
			//Pop.Debug("decoding frame", Frame, "last frame", this.LastFrame);
			const ExtractPlanes = true;
			const NewFrame = await this.DecodeFrame( Frame, ExtractPlanes, ImageBuffer );
			if ( !NewFrame )
			{
				await Pop.Yield(10);
				continue;
			}
		
			if ( this.StartTime === null )
				this.StartTime = Pop.GetTimeNowMs();
		
			return NewFrame;
		}
	}
	
	this.DecodeFrame = async function(FrameIndex,ExtractPlanes,ImageFrameBuffer)
	{
		//	replace with our frame buffer
		//	the avc decoder needs updating to specify the buffer I think,
		//	then we can control it at a high level
		let UseFrameBuffer = false;
		//Debug("DecodeFrame("+FrameIndex+")");
		
		if ( this.LastFrame === null )
		{
			//	decode headers!
			let Track = this.VideoTrack.Track;
			let Codec = Track.trak.mdia.minf.stbl.stsd.avc1.avcC;
			let sps = Codec.sps[0];
			let pps = Codec.pps[0];
			//Debug("Codec.sps.length="+Codec.sps.length);
			//Debug("Decoding SPS( " + sps + ") & PPS (" + pps + ")");
			await this.Decoder.Decode(sps);
			await this.Decoder.Decode(pps);
		}
		
		
		//	need to decode everything from last frame to frame index
		if ( this.LastFrame === null )
			this.LastFrame = -1;
		
		let Outputs = [];
		for ( let f=this.LastFrame+1;	f<=FrameIndex;	f++ )
		{
			let NalUnits = this.VideoTrack.GetFrameNalUnits(f);
			//Debug("Decoding frame #"+f + " x" + NalUnits.length + " nal units");
			
			let DecodeNalUnit = async function(Decoder,NalUnit,ExtractImage,UseFrameBuffer)
			{
				//Debug("This nalunit length = " + NalUnit.length);
				//Debug( NalUnit.slice(0,4) );	//	check there isn't a 0001 header
				//	pass null to NOT extract any images and just decode, so we can skip image copy/extraction on all but the last expected packet/frame
				let FrameOutput = await Decoder.Decode( NalUnit, ExtractImage ? ExtractPlanes : null, UseFrameBuffer );
				Outputs = Outputs.concat(FrameOutput);
			};
			
			for ( let u=0;	u<NalUnits.length;	u++ )
			{
				let ExtractImage = (f==FrameIndex) && (u==NalUnits.length-1);
				let NalUnit = NalUnits[u];
				await DecodeNalUnit( this.Decoder, NalUnit, ExtractImage, UseFrameBuffer );
			}
		}
		this.LastFrame = FrameIndex;
		if ( Outputs.length == 0 )
			return null;
		
		//	just return latest frame
		let Output = Outputs.pop();
		if ( Outputs.length > 0 )
		{
			//Pop.Debug("need to clear other outputs?");
			//Outputs.forEach( o => o.Clear() );
		}
		return Output;
	}
	
}
