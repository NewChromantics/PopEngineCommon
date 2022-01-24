import PromiseQueue from './PromiseQueue.js'
import * as H264 from './H264.js'
import {Atom_SampleDescriptionExtension_Avcc} from './Mp4.js'


function IntToHexString(Integer)
{
	return (Integer).toString(16).toUpperCase();
}

class DecoderBase
{
	constructor()
	{
		this.DecodedFrameQueue = new PromiseQueue('WebcodecDecoder DecodedFrames');
	}
	
	async WaitForNextFrame()
	{
		return this.DecodedFrameQueue.WaitForNext();
	}
	
	PushData(H264Packet)
	{
		throw `PushData() not overloaded`;
	}
	
	OnFrame(Frame)
	{
		//	turn into an image/planes/meta
		this.DecodedFrameQueue.Push(Frame);
	}
	OnFrameEof()
	{
		this.DecodedFrameQueue.Push(null);
	}
	
	OnError(Error)
	{
		this.DecodedFrameQueue.Reject(Error);
	}
};

function HexStringToInts(Hex)
{
	let Ints = Hex.split(' ');
	Ints = Ints.map( i => `0x${i}`);
	Ints = Ints.map( h => Number(h) );
	return Ints;
}
/*
	Decoder that uses webcodecs
*/
export default class WebcodecDecoder extends DecoderBase
{
	static Name()			{	return 'Webcodec';	}
	static IsSupported()	{	return VideoDecoder != undefined;	}

	constructor(AvccHeader)
	{
		super();
		
		this.Sps = null;
		this.Pps = null;
		this.AvccHeader = null;
		this.Decoder = null;
		//this.TestEncoder();
		this.HadInputEof = false;

		this.SubmittedFramesDecoded = {};	//	[SubmittedFrame] = HasFrameBeenDecoded
	}
	
	SetAvccHeader(AvccHeader)
	{
		this.AvccHeader = AvccHeader;
	}
	
	SetSps(Sps)
	{
		//	strip nalu!
		const NaluLength = H264.GetNaluLength(Sps);
		Sps = Sps.slice( NaluLength );
		this.Sps = Sps;
	}
	
	SetPps(Pps)
	{
		//	strip nalu!
		const NaluLength = H264.GetNaluLength(Pps);
		Pps = Pps.slice( NaluLength );
		this.Pps = Pps;
	}
	
	GetAvccHeader()
	{
		if ( this.AvccHeader )
			return this.AvccHeader;
		
		if ( !this.Sps )
			throw `No SPS yet`;
		if ( !this.Pps )
			throw `No PPS yet`;
			
		//	 should Atom_SampleDescriptionExtension_Avcc be stripping nalu from sps?
		const Atom = new Atom_SampleDescriptionExtension_Avcc();
		Atom.SpsDatas = [this.Sps];
		Atom.PpsDatas = [this.Pps];
		const Data = Atom.Encode(false);
		return Data;
	}	
	
	OnFrame(Frame)
	{
		super.OnFrame(Frame);
	
		//	if there are no more frames queued for decoding
		//	AND we've had a EOF submitted, there must be no more frames coming
		const DecoderQueueSize = this.Decoder.decodeQueueSize;
		/*
		console.log(`OnFrame(); DecoderQueueSize=${DecoderQueueSize} had eof=${this.HadInputEof}`);
		if ( DecoderQueueSize == 0 )
		{
			if ( this.HadInputEof )
			{
				this.OnFrameEof();
			}
		}
		*/
	}
	
	CreateDecoder(AvccHeader)
	{
		const DecoderOptions = {};
		DecoderOptions.output = this.OnFrame.bind(this);
		DecoderOptions.error = this.OnError.bind(this);
		const Decoder = new VideoDecoder( DecoderOptions );

		this.ExpectsAnnexB = true;
		//	need to convert to array other wise integeer conversion doesnt work
		let abc = Array.from( AvccHeader.slice(1,4) );
		abc = abc.map( IntToHexString ).join('');
		const Config = {};
		Config.codec = `avc1.${abc}`;
		//	hints not required
		//Config.codedWidth: 1280,	
		//Config.codedHeight: 720
		Config.description = new Uint8Array(AvccHeader); 

		//	configure and if doesn't throw, we've succeeded
		Decoder.configure(Config);
		this.ExpectsAnnexB = Config.description==null;
		
		return Decoder;
	}
		
	GetDecoder()
	{
		if ( this.Decoder )
			return this.Decoder;
		
		try
		{
			//	do we have all the data we need for avcc header?
			const AvccHeader = this.GetAvccHeader();
		
			this.Decoder = this.CreateDecoder(AvccHeader);
		}
		catch(e)
		{
			console.error(e);
		}
		return this.Decoder;
	}

	Free()
	{
		function FreeFrame(Frame)
		{
			Frame.close();
		}
		this.Decoder.flush();
		//this.Decoder.close();
		this.DecodedFrameQueue.FlushPending( false, FreeFrame );
	}
	
	async TestEncoder()
	{
		function OnChunk(Chunk)
		{
			console.log(`Chunk`,Chunk);
		}
		const Config = {
			codec: 'avc1.42E01E',
			width: 640,
			height: 480,
			bitrate: 8_000_000,     // 8 Mbps
			framerate: 30,
		};

		const Options = {};
		Options.error = console.error;
		Options.output = OnChunk;
		const Encoder = new VideoEncoder(Options);
		Encoder.configure(Config);
		
		const FrameImage = new ImageData(640,480);
		const Bitmap = await createImageBitmap(FrameImage);
		const Frame = new VideoFrame(Bitmap, { timestamp: 0 });

		Encoder.encode(Frame, { keyFrame: true });
		await Encoder.flush();
		console.log(`Encoder output`);
	}
	
	GetCodecNames()
	{
		const CodecNames = [];
		
		//	https://stackoverflow.com/questions/16363167/html5-video-tag-codecs-attribute
		//	codec needs more than just codec name
		//	gr: these are hex
		//	42,4D,64 = IDC in SPS
		//	01 = constraint flags
		//	1E = 30
		
		//	chromium constant names to aid googling
		const ProfileIntegers =
		{
			H264PROFILE_BASELINE:			66,
			H264PROFILE_MAIN:				77,
			H264PROFILE_SCALABLEBASELINE:	83,
			H264PROFILE_SCALABLEHIGH:		86,
			H264PROFILE_EXTENDED:			88,
			H264PROFILE_HIGH:				100,
			H264PROFILE_HIGH10PROFILE:		110,
			H264PROFILE_MULTIVIEWHIGH:		118,
			H264PROFILE_HIGH422PROFILE:		122,
			H264PROFILE_STEREOHIGH:			128,
			H264PROFILE_HIGH444PREDICTIVEPROFILE:	244,
		};

		const Profiles = Object.values(ProfileIntegers).map(IntToHexString);
	
		const Level30 = IntToHexString(30);	//	1E
		const Level40 = IntToHexString(40);	//	28
		const Level50 = IntToHexString(50);
		
		
		//	constraints are bits
		const Constraints00 = '00';
		const Constraints01 = '01';	//	will fail, as bottom 3 bits are reserved
		const ConstraintsE0 = 'E0';
		const Baseline30 = `42${Constraints00}${Level30}`;//42E01E
		const Main30 = '4D401E';
		const High30 = '64001E';		
		
		//	codec string registry
		//	https://www.w3.org/TR/webcodecs-codec-registry/
		/*
		//	working on mac	
		CodecNames.push(`avc1.${High30}`);
		CodecNames.push(`avc1.${Main30}`);
		CodecNames.push(`avc1.${Baseline30}`);
		*/
		const Levels = [Level50,Level40,Level30];
		for ( let CodecName of ['avc1'] )
		{
			for ( let Profile of Profiles )
			{
				for ( let Constraint of [Constraints00] )
				{
					for ( let Level of Levels )
					{
						const Codec = `${CodecName}.${Profile}${Constraint}${Level}`;
						CodecNames.push(Codec);
						/*
						CodecNames.push(`avcC.${Baseline}${Constraints00}${Level30}`);
						CodecNames.push(`avcC.${Baseline}${Constraints00}${Level40}`);
						CodecNames.push(`avcC.${Main}00${Level30}`);
						CodecNames.push(`avcC.${Main}00${Level40}`);
						CodecNames.push(`avcC.${High}00${Level30}`);
						CodecNames.push(`avcC.${High}00${Level40}`);
						*/
					}
				}
			}
		}
		return CodecNames;
	}
	
	PushEndOfFile()
	{
		console.log(`H264 PushEndOfFile()`);
		this.HadInputEof = true;
		
		function OnVideoDecoderFlushed()
		{
			console.log(`OnVideoDecoderFlushed()`);
			this.OnFrameEof();
		}
		console.log(`H264 decoder flush()`);
		this.Decoder.flush().then(OnVideoDecoderFlushed.bind(this));	
	}
	
	//	todo: detect keyframe from h264 data...
	PushData(H264Packet,FrameTime)
	{
		if ( FrameTime === undefined )
			throw `Invalid packet FrameTime(${FrameTime})`;
		
		//	split nalus
		const H264Packets = H264.SplitNalus(H264Packet);
		if ( H264Packets.length > 1 )
		{
			let AnyDecoded = false;
			for ( let i=0;	i<H264Packets.length;	i++ )
			{
				const Packeti = H264Packets[i];
				AnyDecoded |= this.PushData( Packeti, FrameTime );
			}
			return AnyDecoded;
		}
		H264Packet = H264Packets[0];
			
		
		const Meta = H264.GetNaluMeta(H264Packet);
		const IsKeyframe = H264.IsContentTypeKeyframe(Meta.Content);
		
		if ( Meta.Content == H264.ContentTypes.SPS )
			this.SetSps(H264Packet);
		if ( Meta.Content == H264.ContentTypes.PPS )
			this.SetPps(H264Packet);
		
		//	skip decoding some packets
		switch (Meta.Content)
		{
			case H264.ContentTypes.SEI:
				return false;
				
			case H264.ContentTypes.SPS:
			case H264.ContentTypes.PPS:
				if ( !this.ExpectsAnnexB )
					return false;
				break;
		}
		
		//	this will allocate decoder if it hasn't been yet 
		const Decoder = this.GetDecoder();
		if ( !Decoder )
		{
			console.warn(`Decoder not ready to be created`);
			return false;
		}

		//const Meta = { Content:6};
		//const IsKeyframe =true;
		//	data must be annexB format 0001! otherwise we get an immediate "expected keyframe data" error
		//	gr: if no description, i think we need to send sps
		if ( this.ExpectsAnnexB )
		{
			H264Packet = H264.AnnexBToNalu4(H264Packet);
		}
		
		try
		{
			const Duration = 16;
			
			const Packet = {};
			Packet.type = IsKeyframe ? 'key' : 'delta';
			Packet.timestamp = FrameTime;
			Packet.duration = Duration;
			Packet.data = H264Packet;
			const Chunk = new EncodedVideoChunk(Packet);
			//console.log(`Decoding x${Packet.data.length} (${H264.GetContentName(Meta.Content)})`);
			this.Decoder.decode(Chunk);
		}
		catch(e)
		{
			this.OnError(e);
		}
		
		return true;
	}
};


//	type factory
function GetDecoderType(DecoderName)
{
	const AnyDecoder = (DecoderName||'').length==0;
	
	if ( AnyDecoder || WebCodecsDecoder.Name() )
	{
		return WebcodecDecoder;
	}
	
	return null;
}


class DecoderParams
{
	constructor(Json={})
	{
		if ( typeof Json == typeof '' )
			Json = JSON.parse(Json);
		this.Options = Json;
	}
	
	get DecoderName()
	{
		const Name = this.Options.mDecoderName || this.Options.DecoderName;
		return Name || '';
	}

}
