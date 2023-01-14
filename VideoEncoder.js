//	Video Encode
//	Like VideoDecoder.js, this marrys H264 encoding and Mp4 encoding
import PromiseQueue from './PromiseQueue.js'
import {ChunkArray} from './PopApi.js'
import {Mp4FragmentedEncoder} from './Mp4.js'
import {GetNaluMeta,SplitNalus} from './H264.js'


export class VideoEncoder_t
{
	constructor()
	{
		this.InputFrameQueue = new PromiseQueue();
		this.EncodeThreadPromise = this.EncodeThread();
	}
	
	
	PushFrame(Image,TimeMs,Keyframe=false)
	{
		if ( !Image )
			return this.PushEndOfFile();
			
		const Frame = {};
		Frame.Image = Image;
		Frame.TimeMs = TimeMs;
		Frame.Keyframe = Keyframe;
		this.InputFrameQueue.Push(Frame);
	}

	
	PushEndOfFile()
	{
		this.InputFrameQueue.Push(null);
	}
	
	OnError(Error)
	{
		//	make encoder thread promise error
		console.error(`Encoding error ${Error}`);
		this.EncodeThreadPromise.Reject(Error);
	}

	
	
	async CreateH264Encoder(Image,OnFrameEncoded)
	{
		//	gr: could do this on first frame output
		const EncoderParams = {};
		EncoderParams.output = OnFrameEncoded;
		EncoderParams.error = this.OnError.bind(this);
		const OutputVideoEncoder = new VideoEncoder(EncoderParams);
		
		const EncoderConfig = {};
		EncoderConfig.codec = 'avc1.42E01E';	//	todo: construct properly
		EncoderConfig.width = Image.width;
		EncoderConfig.height = Image.height;
		EncoderConfig.bitrate = 8 * 1024 * 1024 * 30;//32_000_000;	// bits per second
		EncoderConfig.bitrateMode = 'variable';	//	'constant'
		//EncoderConfig.latencyMode = 'realtime';
		EncoderConfig.latencyMode = 'quality';
		//EncoderConfig.framerate = 30;
		EncoderConfig.optimizeForLatency = true;
		await OutputVideoEncoder.configure(EncoderConfig);
		return OutputVideoEncoder;
	}
	
	async EncodeThread()
	{
		const Mp4Encoder = new Mp4FragmentedEncoder();
		
		function OnFrameEncoded(EncodedVideoChunk,StreamMetaData)
		{
			const TrackId = 1;
			if ( StreamMetaData && StreamMetaData.decoderConfig )
			{
				const Meta = StreamMetaData.decoderConfig;
				const Codec = Meta.codec;
				const ColourSpace = Meta.colorSpace;
				const ExtraDataSpsPps = Meta.description;
				console.log(`StreamMetaData`,StreamMetaData);
				Mp4Encoder.PushExtraData( ExtraDataSpsPps, TrackId );
			}
			const Bytes = new Uint8Array( EncodedVideoChunk.byteLength );
			const TimeMs = EncodedVideoChunk.timestamp / 1000;
			EncodedVideoChunk.copyTo( Bytes );
			console.log(`Encoded frame x${Bytes.length} @${TimeMs}`,EncodedVideoChunk);
			Mp4Encoder.PushSample( Bytes, TimeMs, TimeMs, TrackId );
			try
			{
				const Packets = SplitNalus(Bytes);
				const Metas = Packets.map( GetNaluMeta );
				Metas.forEach( m => console.log(`Encoded packet:`,m) );
			}
			catch(e)
			{
				console.warn(`Nalu error: ${e}`);
			}
		}
		
		//	wait for first frame
		const FirstFrame = await this.InputFrameQueue.WaitForNext();
		
		//	create encoder
		const H264Encoder = await this.CreateH264Encoder( FirstFrame.Image, OnFrameEncoded.bind(this) );
		
		async function EncodeFrame(Frame)
		{
			const TimeMicro = Frame.TimeMs * 1000;
			const FrameMeta = {};
			//FrameMeta.duration = //	microsecs
			FrameMeta.timestamp = TimeMicro;//	microsecs
			//	for array buffer
			//FrameMeta.format = "RGBX";
			const Bitmap = await createImageBitmap(Frame.Image);
			const EncodeFrame = new VideoFrame( Bitmap, FrameMeta );
			const EncodeOptions = {};
			//EncodeOptions.keyFrame = true;
			H264Encoder.encode( EncodeFrame, EncodeOptions );
			//	discard VideoFrame we just created (get a warning from browser otherwise)
			EncodeFrame.close();
		}
		
		//	encode first frame
		await EncodeFrame( FirstFrame );

		//	wait for more frames
		//	wait for EOF
		while ( true )
		{
			const NextFrame = await this.InputFrameQueue.WaitForNext();
			if ( !NextFrame )
				break;
			await EncodeFrame( NextFrame );
		}
		
		//	wait for encoder to finish before marking mp4 finished
		await H264Encoder.flush();
		Mp4Encoder.PushEndOfFile();
		
		//	wait for mp4 encoder to finish
		const Mp4Datas = new ChunkArray();
		while ( true )
		{
			const Mp4Chunk = await Mp4Encoder.WaitForNextEncodedBytes();
			if ( !Mp4Chunk )
				break;
			Mp4Datas.push( Mp4Chunk );
		}
		const FinalMp4Data = Mp4Datas.slice();
		return FinalMp4Data;
	}
	
	async WaitForEncodedData()
	{
		return this.EncodeThreadPromise;
	}
}
