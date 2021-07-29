export default 'Mp4.js';
import Pop from './PopEngine.js'
import PromiseQueue from './PromiseQueue.js'
import {JoinTypedArrays,BytesToString,BytesToBigInt} from './PopApi.js'


//	gr: copied from c#
//		so if either gets fixed, they both need to
//	https://github.com/NewChromantics/PopCodecs/blob/7cecd65448aa7dececf7f4216b6b195b5b77f208/PopMpeg4.cs#L164
function GetDateTimeFromSecondsSinceMidnightJan1st1904(Seconds)
{
	//	todo: check this
	//var Epoch = new DateTime(1904, 1, 1, 0, 0, 0, DateTimeKind.Utc);
	//Epoch.AddSeconds(Seconds);
	const Epoch = new Date('January 1, 1904 0:0:0 GMT');
	//	https://stackoverflow.com/questions/1197928/how-to-add-30-minutes-to-a-javascript-date-object
	const EpochMilliSecs = Epoch.getTime();
	const NewTime = new Date( EpochMilliSecs + (Seconds*1000) );
	return NewTime;
}


//	todo? specific atom type encode&decoders?

//	todo: expand to allow Data to be an array of datas
//	todo: expand to have a "wait for more data" async func, so we can replace the general mp4 reader
class DataReader
{
	constructor(Data,InitialPositon=0)
	{
		this.FilePosition = 0;
		this.FileBytes = Data;
	}
	
	
	//	random access, but async so if we're waiting on data, it waits
	async GetBytes(FilePosition,Length)
	{
		const EndPosition = FilePosition + Length;
		while ( EndPosition > this.FileBytes.length )
		{
			Pop.Debug(`waiting for ${EndPosition-this.FileBytes.length} more bytes...`);
			throw `todo`;
			/*
			const NewBytes = await this.NewByteQueue.WaitForNext();
			Pop.Debug(`New bytes x${NewBytes.length}`);
			this.FileBytes = JoinTypedArrays(this.FileBytes,NewBytes);
			Pop.Debug(`File size now x${this.FileBytes.length}`);
			*/
		}
		const Bytes = this.FileBytes.slice( FilePosition, EndPosition );
		if ( Bytes.length != Length )
			throw `Something gone wrong with reading ${Length} bytes`;
		return Bytes;
	}
	
	async Read8()
	{
		const Bytes = await this.GetBytes(this.FilePosition,1);
		this.FilePosition += 1;
		return Bytes[0];
	}

	async Read16()
	{
		const Bytes = await this.GetBytes(this.FilePosition,16/8);
		this.FilePosition += 16/8;
		const Int = (Bytes[0]<<8) | (Bytes[1]<<0);
		return Int;
	}
	
	async Read24()
	{
		const Bytes = await this.GetBytes(this.FilePosition,24/8);
		this.FilePosition += 24/8;
		const Int = (Bytes[0]<<16) | (Bytes[1]<<8) | (Bytes[2]<<0);
		return Int;
	}
	
	async Read32()
	{
		const Bytes = await this.GetBytes(this.FilePosition,32/8);
		this.FilePosition += 32/8;
		const Int = (Bytes[0]<<24) | (Bytes[1]<<16) | (Bytes[2]<<8) | (Bytes[3]<<0);
		return Int;
	}
	
	async Read64()
	{
		const Bytes = await this.GetBytes(this.FilePosition,64/8);
		this.FilePosition += 64/8;
		const Int = BytesToBigInt(Bytes);
		return Int;
	}
	
	async ReadBytes(Length)
	{
		const Bytes = await this.GetBytes(this.FilePosition,Length);
		this.FilePosition += Length;
		return Bytes;
	}
	
	async ReadString(Length)
	{
		const Bytes = await this.GetBytes(this.FilePosition,Length);
		const String = BytesToString(Bytes);
		this.FilePosition += Length;
		return String;
	}
	
	async ReadNextAtom()
	{
		const Atom = new Atom_t();
		Atom.Size = await this.Read32();
		Atom.Fourcc = await this.ReadString(4);
		
		//	size of 1 means 64 bit size
		if ( Atom.Size == 1 )
		{
			Atom.Size64 = await this.Read64();
		}
		if ( Atom.AtomSize < 8 )
			throw `Atom (${Atom.Fourcc}) reported size as less than 8 bytes(${Atom.AtomSize}); not possible.`;
			
		Atom.Data = await this.ReadBytes(Atom.ContentSize); 
		return Atom;
	}
	
}


class Atom_t
{
	constructor()
	{
		this.Size = 0;		//	total size 
		this.Fourcc = 'ATOM';
		this.Size64 = null;	//	only set if Size=1
		
		this.Data = null;	//	raw data following this header
		this.ChildAtoms = [];	//	more Atom_t's (key these? can there be dupliates?)
	}
	
	get HeaderSize()
	{
		let Size = 0;
		Size += (32/8);	//	.Size
		Size += 4;	//	.Fourcc
		
		//	64bit size
		if ( this.Size == 1 )
			Size += (64/8);
		return Size;
	}
	
	get AtomSize()
	{
		return (this.Size==1) ? this.Size64 : this.Size;
	}
	
	get ContentSize()
	{
		return this.AtomSize - this.HeaderSize;
	}
	
	//	if this is an atom with child atoms, parse the next level here
	async DecodeChildAtoms()
	{
		const Reader = new DataReader(this.Data,0);
		while ( Reader.FilePosition < this.Data.length )
		{
			const Atom = await Reader.ReadNextAtom();
			this.ChildAtoms.push(Atom);
		}
	}
	
	GetChildAtom(Fourcc)
	{
		const Matches = this.ChildAtoms.filter( a => a.Fourcc == Fourcc );
		if ( Matches.length == 0 )
			return null;
		if ( Matches.length > 1 )
			throw `More than one(x${Matches.length}) child ${Fourcc}} atom found`;
		return Matches[0];
	}
	
	GetChildAtoms(Fourcc)
	{
		const Matches = this.ChildAtoms.filter( a => a.Fourcc == Fourcc );
		return Matches;
	}
	
};

/*
	this is an async (stream data in, async chunks out)
	mp4 decoder, based on my C#/unity one https://github.com/NewChromantics/PopCodecs/blob/master/PopMpeg4.cs
	probably not perfect, but hand made to work around random weird/badly constructed mpeg files
*/
export class Mp4Decoder
{
	constructor()
	{
		//	gonna end up with a bunch of different version of these for debugging
		this.NewAtomQueue = new PromiseQueue('Mp4 decoded atoms');
		this.NewTrackQueue = new PromiseQueue('Mpeg decoded Tracks');
		this.RootAtoms = [];	//	trees coming off root atoms
		
		this.NewByteQueue = new PromiseQueue('Mp4 pending bytes');
		this.FileBytes = new Uint8Array(0);	//	for now merging into one big array, but later make the read-bytes func span chunks
		this.FilePosition = 0;
		
		this.ParsePromise = this.ParseFileThread();
	}
	
	//	any atom at all
	//	may want 
	//	- WaitForNewRootAtom (completed)
	//	- WaitForNewMdat (ie, new chunks of real parsed data)
	async WaitForNextAtom()
	{
		return this.NewAtomQueue.WaitForNext();
	}
	
	async WaitForChange()
	{
		await this.NewAtomQueue.WaitForNext();
		return this.RootAtoms;
	}
	
	PushData(Bytes)
	{
		this.NewByteQueue.Push(Bytes);
	}
	
	//	random access, but async so if we're waiting on data, it waits
	async GetBytes(FilePosition,Length)
	{
		const EndPosition = FilePosition + Length;
		while ( EndPosition > this.FileBytes.length )
		{
			Pop.Debug(`waiting for ${EndPosition-this.FileBytes.length} more bytes...`);
			const NewBytes = await this.NewByteQueue.WaitForNext();
			Pop.Debug(`New bytes x${NewBytes.length}`);
			this.FileBytes = JoinTypedArrays(this.FileBytes,NewBytes);
			Pop.Debug(`File size now x${this.FileBytes.length}`);
		}
		const Bytes = this.FileBytes.slice( FilePosition, EndPosition );
		if ( Bytes.length != Length )
			throw `Something gone wrong with reading ${Length} bytes`;
		return Bytes;
	}
	
	async Read32()
	{
		const Bytes = await this.GetBytes(this.FilePosition,32/8);
		this.FilePosition += 32/8;
		const Int = (Bytes[0]<<24) | (Bytes[1]<<16) | (Bytes[2]<<8) | (Bytes[3]<<0);
		return Int;
	}
	
	async Read64()
	{
		const Bytes = await this.GetBytes(this.FilePosition,64/8);
		this.FilePosition += 64/8;
		const Int = BytesToBigInt(Bytes);
		return Int;
	}
	
	async ReadBytes(Length)
	{
		const Bytes = await this.GetBytes(this.FilePosition,Length);
		this.FilePosition += Length;
		return Bytes;
	}
	
	async ReadString(Length)
	{
		const Bytes = await this.GetBytes(this.FilePosition,Length);
		const String = BytesToString(Bytes);
		this.FilePosition += Length;
		return String;
	}
	
	async ReadNextAtom()
	{
		const Atom = new Atom_t();
		Atom.Size = await this.Read32();
		Atom.Fourcc = await this.ReadString(4);
		
		//	size of 1 means 64 bit size
		if ( Atom.Size == 1 )
		{
			Atom.Size64 = await this.Read64();
		}
		if ( Atom.AtomSize < 8 )
			throw `Atom (${Atom.Fourcc}) reported size as less than 8 bytes(${Atom.AtomSize}); not possible.`;
			
		Atom.Data = await this.ReadBytes(Atom.ContentSize); 
		return Atom;
	}
	
	async ParseFileThread()
	{
		while ( true )
		{
			const Atom = await this.ReadNextAtom();
			
			this.RootAtoms.push(Atom);
			this.NewAtomQueue.Push(Atom);
			
			if ( Atom.Fourcc == 'moov' )
			{
				await this.DecodeAtom_Moov(Atom);
			}
			else
			{
				Pop.Debug(`Skipping atom ${Atom.Fourcc} x${Atom.ContentSize}`);
			}
		}
	}
	
	EnumTracks(Tracks)
	{
		Pop.Debug(`Got new tracks ${Tracks}`);
	}
	
	async DecodeAtom_Moov(Atom)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const MovieHeaderAtom = Atom.GetChildAtom("mvhd");
		let MovieHeader;
		if ( MovieHeaderAtom )
		{
			MovieHeader = await this.DecodeAtom_MovieHeader(MovieHeaderAtom);
		}
		
		//	now go through all the trak children
		const TrakAtoms = Atom.GetChildAtoms('trak');
		for ( let TrakAtom of TrakAtoms )
		{
			const Track = await this.DecodeAtom_Trak(TrakAtom);
			this.NewTrackQueue.Push(Track);
		}
	}
	
	//	gr; this doesn tneed to be async as we have the data, but all the reader funcs currently are
	async DecodeAtom_MovieHeader(Atom)
	{
		const Reader = new DataReader(Atom.Data,0);
		//	https://developer.apple.com/library/content/documentation/QuickTime/QTFF/art/qt_l_095.gif
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		
		//	hololens had what looked like 64 bit timestamps...
		//	this is my working reference :)
		//	https://github.com/macmade/MP4Parse/blob/master/source/MP4.MVHD.cpp#L50
		let CreationTime,ModificationTime,Duration;	//	long
		let TimeScale;
		if ( Version == 0)
		{
			CreationTime = await Reader.Read32();
			ModificationTime = await Reader.Read32();
			TimeScale = await Reader.Read32();
			Duration = await Reader.Read32();
		}
		else if(Version == 1)
		{
			CreationTime = await Reader.Read64();
			ModificationTime = await Reader.Read64();
			TimeScale = await Reader.Read32();
			Duration = await Reader.Read64();
		}
		else
		{
			throw `Expected Version 0 or 1 for MVHD (Version=${Version}). If neccessary can probably continue without timing info!`;
		}
		
		const PreferredRate = await Reader.Read32();
		const PreferredVolume = await Reader.Read16();	//	8.8 fixed point volume
		const Reserved = await Reader.ReadBytes(10);

		const Matrix_a = await Reader.Read32();
		const Matrix_b = await Reader.Read32();
		const Matrix_u = await Reader.Read32();
		const Matrix_c = await Reader.Read32();
		const Matrix_d = await Reader.Read32();
		const Matrix_v = await Reader.Read32();
		const Matrix_x = await Reader.Read32();
		const Matrix_y = await Reader.Read32();
		const Matrix_w = await Reader.Read32();

		const PreviewTime = await Reader.Read32();
		const PreviewDuration = await Reader.Read32();
		const PosterTime = await Reader.Read32();
		const SelectionTime = await Reader.Read32();
		const SelectionDuration = await Reader.Read32();
		const CurrentTime = await Reader.Read32();
		const NextTrackId = await Reader.Read32();

		for ( const Zero of Reserved )
		{
			if (Zero != 0)
				Pop.Warning(`Reserved value ${Zero} is not zero`);
		}

		//	actually a 3x3 matrix, but we make it 4x4 for unity
		//	gr: do we need to transpose this? docs don't say row or column major :/
		//	wierd element labels, right? spec uses them.
/*
		//	gr: matrixes arent simple
		//		https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap4/qtff4.html#//apple_ref/doc/uid/TP40000939-CH206-18737
		//	All values in the matrix are 32 - bit fixed-point numbers divided as 16.16, except for the { u, v, w}
		//	column, which contains 32 - bit fixed-point numbers divided as 2.30.Figure 5 - 1 and Figure 5 - 2 depict how QuickTime uses matrices to transform displayed objects.
		var a = Fixed1616ToFloat(Matrix_a);
		var b = Fixed1616ToFloat(Matrix_b);
		var u = Fixed230ToFloat(Matrix_u);
		var c = Fixed1616ToFloat(Matrix_c);
		var d = Fixed1616ToFloat(Matrix_d);
		var v = Fixed230ToFloat(Matrix_v);
		var x = Fixed1616ToFloat(Matrix_x);
		var y = Fixed1616ToFloat(Matrix_y);
		var w = Fixed230ToFloat(Matrix_w);
		var MtxRow0 = new Vector4(a, b, u, 0);
		var MtxRow1 = new Vector4(c, d, v, 0);
		var MtxRow2 = new Vector4(x, y, w, 0);
		var MtxRow3 = new Vector4(0, 0, 0, 1);
*/
		const Header = {};
		//var Header = new TMovieHeader();
		Header.TimeScale = 1.0 / TimeScale; //	timescale is time units per second
		//Header.VideoTransform = new Matrix4x4(MtxRow0, MtxRow1, MtxRow2, MtxRow3);
		//Header.Duration = new TimeSpan(0,0,(int)(Duration * Header.TimeScale));
		Header.Duration = Duration * Header.TimeScale;
		Header.CreationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904(CreationTime);
		Header.ModificationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904(ModificationTime);
		Header.CreationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904(CreationTime);
		Header.PreviewDuration = PreviewDuration * Header.TimeScale;
		return Header;
	}
	
	async DecodeAtom_Trak(Atom)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const Track = {};
		const Medias = [];
		
		const MediaAtoms = Atom.GetChildAtoms('mdia');
		for ( let MediaAtom of MediaAtoms )
		{
			const Media = await this.DecodeAtom_Media( MediaAtom, Track );
			Medias.push(Media);
		}
		
		Pop.Debug(`Found x${Medias.length} media atoms`);
		return Track;
	}
	
	async DecodeAtom_Media(Atom)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
	
		const Media = {};
		
		//	these may not exist
		Media.MediaHeader = await this.DecodeAtom_MediaHandlerHeader( Atom.GetChildAtom('mdhd') );
		
		//	defaults (this timescale should come from further up)
		if ( !Media.MediaHeader )
		{
			Media.MediaHeader = {};
			Media.MediaHeader.TimeScale = 1;
		}
		
		Media.MediaInfo = await this.DecodeAtom_MediaInfo( Atom.GetChildAtom('minf'), Media.MediaHeader );
		return Media;
	}

	async DecodeAtom_MediaHandlerHeader(Atom)
	{
		if ( !Atom )
			return null;
			
		const Reader = new DataReader(Atom.Data,0);
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		const CreationTime = await Reader.Read32();
		const ModificationTime = await Reader.Read32();
		const TimeScale = await Reader.Read32();
		const Duration =  await Reader.Read32();
		const Language = await Reader.Read16();
		const Quality = await Reader.Read16();

		const Header = {};//new TMediaHeader();
		Header.TimeScale = 1.0 / TimeScale; //	timescale is time units per second
		//Header.Duration = new TimeSpan(0,0, (int)(Duration * Header.TimeScale));
		Header.CreationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904(CreationTime);
		Header.ModificationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904(ModificationTime);
		Header.CreationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904(CreationTime);
		Header.LanguageId = Language;
		Header.Quality = Quality / (1 << 16);
		return Header;
	}
	
	async DecodeAtom_MediaInfo(Atom,MediaHeader)
	{
		if ( !Atom )
			return null;

		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const SampleTable = await this.DecodeAtom_SampleTable( Atom.GetChildAtom('stbl') );
		
		//	gmhd
		//	hdlr
		//	dinf
		//	stbl
	}
	
	async DecodeAtom_SampleTable(Atom)
	{
		if ( !Atom )
			return null;
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		//	get all the atoms we're expecting
		//	http://mirror.informatimago.com/next/developer.apple.com/documentation/QuickTime/REF/Streaming.35.htm
		const ChunkOffsets32Atom = Atom.GetChildAtom('stco');
		const ChunkOffsets64Atom = Atom.GetChildAtom('co64');
		const SampleSizesAtom = Atom.GetChildAtom('stsz');
		const SampleToChunkAtom = Atom.GetChildAtom('stsc');
		const SyncSamplesAtom = Atom.GetChildAtom('stss');
		const SampleDecodeDurationsAtom = Atom.GetChildAtom('stts');
		const SamplePresentationTimeOffsetsAtom = Atom.GetChildAtom('ctts');

		//	work out samples from atoms!
		if (SampleSizesAtom == null)
			throw "Track missing sample sizes atom";
		if (ChunkOffsets32Atom == null && ChunkOffsets64Atom == null)
			throw "Track missing chunk offset atom";
		if (SampleToChunkAtom == null)
			throw "Track missing sample-to-chunk table atom";
		if (SampleDecodeDurationsAtom == null)
			throw "Track missing time-to-sample table atom";
		
		const PackedChunkMetas = await this.DecodeAtom_GetChunkMetas(SampleToChunkAtom);
		Pop.Debug(`PackedChunkMetas x${PackedChunkMetas.length}`);
		/*
		var ChunkOffsets = GetChunkOffsets(ChunkOffsets32Atom, ChunkOffsets64Atom, ReadData);
		var SampleSizes = GetSampleSizes(SampleSizesAtom.Value, ReadData);
		var SampleKeyframes = GetSampleKeyframes(SyncSamplesAtom, ReadData, SampleSizes.Count);
		var SampleDurations = GetSampleDurations(SampleDecodeDurationsAtom.Value, ReadData, SampleSizes.Count);
		var SamplePresentationTimeOffsets = GetSampleDurations(SamplePresentationTimeOffsetsAtom, ReadData, 0, SampleSizes.Count);

		//	durations start at zero (proper time must come from somewhere else!) and just count up over durations
		var SampleDecodeTimes = new int[SampleSizes.Count];
		for (int i = 0; i < SampleDecodeTimes.Length;	i++)
		{
			var LastDuration = (i == 0) ? 0 : SampleDurations[i - 1];
			var LastTime = (i == 0) ? 0 : SampleDecodeTimes[i - 1];
			SampleDecodeTimes[i] = LastTime + LastDuration;
		}

		//	pad the metas to fit offset information
		//	https://sites.google.com/site/james2013notes/home/mp4-file-format
		var ChunkMetas = new List<ChunkMeta>();
		//foreach ( var ChunkMeta in PackedChunkMetas )
		for (var i = 0; i < PackedChunkMetas.Count; i++)
		{
			var ChunkMeta = PackedChunkMetas[i];
			//	first begins at 1. despite being an index...
			var FirstChunk = ChunkMeta.FirstChunk - 1;
			//	pad previous up to here
			while (ChunkMetas.Count < FirstChunk)
				ChunkMetas.Add(ChunkMetas[ChunkMetas.Count - 1]);

			ChunkMetas.Add(ChunkMeta);
		}
		//	and pad the end
		while (ChunkMetas.Count < ChunkOffsets.Count)
			ChunkMetas.Add(ChunkMetas[ChunkMetas.Count - 1]);

		//	we're now expecting this to be here
		var MdatStartPosition = MdatAtom.HasValue ? MdatAtom.Value.AtomDataFilePosition : (long?)null;

		//	superfolous data
		var Chunks = new List<TSample>();
		long? MdatEnd = (MdatAtom.HasValue) ? (MdatAtom.Value.DataSize) : (long?)null;
		for (int i = 0; i < ChunkOffsets.Count; i++)
		{
			var ThisChunkOffset = ChunkOffsets[i];
			//	chunks are serial, so length is up to next
			//	gr: mdatend might need to be +1
			long? NextChunkOffset = (i >= ChunkOffsets.Count - 1) ? MdatEnd : ChunkOffsets[i + 1];
			long ChunkLength = (NextChunkOffset.HasValue) ? (NextChunkOffset.Value - ThisChunkOffset) : 0;

			var Chunk = new TSample();
			Chunk.DataPosition = ThisChunkOffset;
			Chunk.DataSize = ChunkLength;
			Chunks.Add(Chunk);
		}

		var Samples = new List<TSample>();

		System.Func<int,int> TimeToMs = (TimeUnit) =>
		{
			//	to float
			var Timef = TimeUnit * TimeScale;
			var TimeMs = Timef * 1000.0f;
			return (int)TimeMs;
		};

		int SampleIndex = 0;
		for (int i = 0; i < ChunkMetas.Count(); i++)
		{
			var SampleMeta = ChunkMetas[i];
			var ChunkIndex = i;
			var ChunkFileOffset = ChunkOffsets[ChunkIndex];

			for (int s = 0; s < SampleMeta.SamplesPerChunk; s++)
			{
				var Sample = new TSample();

				if (MdatStartPosition.HasValue)
					Sample.DataPosition = ChunkFileOffset - MdatStartPosition.Value;
				else
					Sample.DataFilePosition = ChunkFileOffset;

				Sample.DataSize = SampleSizes[SampleIndex];
				Sample.IsKeyframe = SampleKeyframes[SampleIndex];
				Sample.DecodeTimeMs = TimeToMs( SampleDecodeTimes[SampleIndex] );
				Sample.DurationMs = TimeToMs( SampleDurations[SampleIndex] );
				Sample.PresentationTimeMs = TimeToMs( SampleDecodeTimes[SampleIndex] + SamplePresentationTimeOffsets[SampleIndex] );
				Samples.Add(Sample);

				ChunkFileOffset += Sample.DataSize;
				SampleIndex++;
			}
		}

		if (SampleIndex != SampleSizes.Count)
			Debug.LogWarning("Enumerated " + SampleIndex + " samples, expected " + SampleSizes.Count);

		return Samples;
		*/
	}
	
	async DecodeAtom_GetChunkMetas(Atom)
	{
		const Metas = [];
		const Reader = new DataReader(Atom.Data,0);
		
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		const EntryCount = await Reader.Read32();
		
		const MetaSize = 3 * 4;	//	3x32 bit
		/*
		const Offset = Reader.FilePosition;
		for ( let i=Offset;	i<Atom.Data.length;	i+=MetaSize )
		{
			const ChunkData = Atom.Data.slice( i, i+MetaSize );
			const Meta = new ChunkMeta_t(ChunkData);
			Metas.Add(Meta);
		}
		*/
		for ( let e=0;	e<EntryCount;	e++ )
		{
			const ChunkMeta = {};
			ChunkMeta.FirstChunk = await Reader.Read32();
			ChunkMeta.SamplesPerChunk = await Reader.Read32();
			ChunkMeta.SampleDescriptionId = await Reader.Read32();
			Metas.push(ChunkMeta);
		};
		if (Metas.length != EntryCount)
			throw `Expected ${EntryCount} chunk metas, got ${Metas.length}`;
		return Metas;
	}
	
}


