export default 'Mp4.js';
import Pop from './PopEngine.js'
import PromiseQueue from './PromiseQueue.js'
import {JoinTypedArrays,BytesToString,BytesToBigInt} from './PopApi.js'


//	when we push this data to a decoder, it signals no more data coming
const EndOfFileMarker = 'eof';

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


//	mp4 parser and ms docs contradict themselves
//	these are bits for trun (fragment sample atoms)
//	mp4 parser
const TrunFlags = 
{
	DataOffsetPresent:			0,
	FirstSampleFlagsPresent:	2,
	SampleDurationPresent:		8,
	SampleSizePresent:			9,
	SampleFlagsPresent:			10,
	SampleCompositionTimeOffsetPresent:	11
};
/*
//	ms (matching hololens stream)
enum TrunFlags  
{
	DataOffsetPresent = 0,
	FirstSampleFlagsPresent = 3,
	SampleDurationPresent = 9,
	SampleSizePresent = 10,
	SampleFlagsPresent = 11,
	SampleCompositionTimeOffsetPresent = 12
};
*/

//	todo? specific atom type encode&decoders?

//	todo: expand to allow Data to be an array of datas
//	todo: expand to have a "wait for more data" async func, so we can replace the general mp4 reader
class DataReader
{
	constructor(Data,ExternalFilePosition=0,WaitForMoreData=null,InitialPositon=0)
	{
		if ( !WaitForMoreData )
		{
			WaitForMoreData = async function()
			{
				throw `No async WaitForMoreData function provided. No more data.`;
			};
		}
		
		this.ExternalFilePosition = ExternalFilePosition;
		this.FilePosition = InitialPositon;
		this.FileBytes = Data;
		this.WaitForMoreData = WaitForMoreData;	//	async func that returns more data
	}
	
	//	assuming no data to be async-read to come in
	get BytesRemaining()
	{
		return this.FileBytes.length - this.FilePosition;
	}
	
	//	random access, but async so if we're waiting on data, it waits
	async GetBytes(FilePosition,Length)
	{
		const EndPosition = FilePosition + Length;
		while ( EndPosition > this.FileBytes.length )
		{
			Pop.Debug(`waiting for ${EndPosition-this.FileBytes.length} more bytes...`);
			
			const NewBytes = await this.WaitForMoreData();
			if ( NewBytes == EndOfFileMarker )
				throw EndOfFileMarker;//`No more data (EOF) and waiting on ${EndPosition-this.FileBytes.length} more bytes`;
			
			Pop.Debug(`New bytes x${NewBytes.length}`);
			this.FileBytes = JoinTypedArrays(this.FileBytes,NewBytes);
			Pop.Debug(`File size now x${this.FileBytes.length}`);
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
		Atom.FilePosition = this.ExternalFilePosition + this.FilePosition;
		//	catch EOF and return null, instead of throwing
		try
		{
			Atom.Size = await this.Read32();
		}
		catch(e)
		{
			if ( e == EndOfFileMarker )
				return null;
			throw e;
		}
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


class Sample_t
{
	constructor()
	{
		this.DataSize;
		this.IsKeyframe;
		this.DecodeTimeMs;
		this.DurationMs;
		this.PresentationTimeMs;
		this.DataPosition;
		this.DataFilePosition;
	}
}

class Atom_t
{
	constructor()
	{
		this.Size = 0;		//	total size 
		this.FilePosition = null;
		this.Fourcc = 'ATOM';
		this.Size64 = null;	//	only set if Size=1
		
		this.Data = null;	//	raw data following this header
		this.ChildAtoms = [];	//	more Atom_t's (key these? can there be dupliates?)
	}
	
	get DataFilePosition()
	{
		return this.FilePosition + this.HeaderSize;
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
		const Reader = new DataReader(this.Data,this.DataFilePosition);
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
		this.NewSamplesQueue = new PromiseQueue('Mpeg Decoded samples');
		
		this.RootAtoms = [];	//	trees coming off root atoms
		this.Mdats = [];		//	atoms with data
		this.Tracks = [];
		
		this.NewByteQueue = new PromiseQueue('Mp4 pending bytes');
		
		this.FileReader = new DataReader( new Uint8Array(0), 0, this.WaitForMoreFileData.bind(this) );
		
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
	
	async WaitForNextSamples()
	{
		return this.NewSamplesQueue.WaitForNext();
	}
	
	async WaitForMoreFileData()
	{
		return this.NewByteQueue.WaitForNext();
	}
	
	PushEndOfFile()
	{
		this.PushData(EndOfFileMarker);
	}
	
	PushData(Bytes)
	{
		this.NewByteQueue.Push(Bytes);
	}
	
	PushMdat(MdatAtom)
	{
		this.Mdats.push(MdatAtom);
	}
	
	PushFragmentTrack(Track)
	{
		this.Tracks.push(Track);
	}
	
	async ParseFileThread()
	{
		while ( true )
		{
			const Atom = await this.FileReader.ReadNextAtom();
			if ( Atom === null )
			{
				Pop.Debug(`End of file`);
				break;
			}
			
			this.RootAtoms.push(Atom);
			this.NewAtomQueue.Push(Atom);
			
			if ( Atom.Fourcc == 'moov' )
			{
				await this.DecodeAtom_Moov(Atom);
			}
			else if ( Atom.Fourcc == 'moof' )
			{
				await this.DecodeAtom_Moof(Atom);
			}
			else if ( Atom.Fourcc == 'mdat' )
			{
				await this.DecodeAtom_Mdat(Atom);
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
	
	async DecodeAtom_Mdat(Atom)
	{
		this.PushMdat(Atom);
	}
	
	async DecodeAtom_MoofHeader(Atom)
	{
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);

		const Header = {};

		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		Header.SequenceNumber = await Reader.Read32();
		
		return Header;
	}
	
	async DecodeAtom_Moof(Atom)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		let Header = await this.DecodeAtom_MoofHeader( Atom.GetChildAtom('mfhd') );
		if ( !Header )
		{
			Header = {};
		}

		//	gr: units are milliseconds in moof
		//	30fps = 33.33ms = [512, 1024, 1536, 2048...]
		//	193000ms = 2959360
		Header.TimeScale = 1.0 / 15333.4;
		
		const TrackFragmentAtoms = Atom.GetChildAtoms('traf');
		for ( const TrackFragmentAtom of TrackFragmentAtoms )
		{
			const MdatIdent = null;
			const Track = await this.DecodeAtom_TrackFragment( TrackFragmentAtom, Atom, Header, MdatIdent );
			this.PushFragmentTrack(Track);
		}
	}
	
	async DecodeAtom_TrackFragment(Atom,MoofAtom,MoofHeader,MdatIdent)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const Tfhd = Atom.GetChildAtom('tfhd');	//	header
		const Tfdt = Atom.GetChildAtom('tfdt');	//	delta time
		
		const Header = await this.DecodeAtom_TrackFragmentHeader(Tfhd,Tfdt);
		Header.TimeScale = MoofHeader.TimeScale;
		
		const Trun = Atom.GetChildAtom('trun');
		const Samples = await this.DecodeAtom_FragmentSampleTable( Trun, MoofAtom, Header );
		this.NewSamplesQueue.Push(Samples);
	}
	
	async DecodeAtom_TrackFragmentDelta(Tfdt)
	{
		const Atom = Tfdt;
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
		
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();

		let DecodeTime;
		if ( Version == 0 )
		{
			DecodeTime = await Reader.Read32(); 
		}
		else
		{
			DecodeTime = await Reader.Read64(); 
		}
		return DecodeTime;
	}
		
	async DecodeAtom_TrackFragmentHeader(Atom,DeltaTimeAtom)
	{
		const Header = {};
	
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		Header.TrackId = await Reader.Read32();

		function HasFlagBit(Bit)
		{
			return (Flags & (1 << Bit)) != 0;
		}
	
		//	http://178.62.222.88/mp4parser/mp4.js
		if (HasFlagBit(0))
			Header.BaseDataOffset = await Reader.Read64();	//	unsigned
		if (HasFlagBit(1))
			Header.SampleDescriptionIndex = await Reader.Read32();
		if (HasFlagBit(3))
			Header.DefaultSampleDuration = await Reader.Read32();
		if (HasFlagBit(4))
			Header.DefaultSampleSize = await Reader.Read32();
		if (HasFlagBit(5))
			Header.DefaultSampleFlags = await Reader.Read32();
		if (HasFlagBit(16))
			Header.DurationIsEmpty = true;
		if (HasFlagBit(17))
			Header.DefaultBaseIsMoof = true;
		
		Header.DecodeTime = await this.DecodeAtom_TrackFragmentDelta(DeltaTimeAtom);
		
		return Header;
	}
	
	async DecodeAtom_FragmentSampleTable(Atom,MoofAtom,TrackHeader)
	{
		const Header = TrackHeader;
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
		//	this stsd description isn't well documented on the apple docs
		//	http://xhelmboyx.tripod.com/formats/mp4-layout.txt
		//	https://stackoverflow.com/a/14549784/355753
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		const EntryCount = await Reader.Read32();
		
		//	gr; with a fragmented mp4 the headers were incorrect (bad sample sizes, mismatch from mp4parser's output)
		//	ffmpeg -i cat_baseline.mp4 -c copy -movflags frag_keyframe+empty_moov cat_baseline_fragment.mp4
		//	http://178.62.222.88/mp4parser/mp4.js
		//	so trying this version
		//	VERSION8
		//	FLAGS24
		//	SAMPLECOUNT32

		//	https://msdn.microsoft.com/en-us/library/ff469478.aspx
		//	the docs on which flags are which are very confusing (they list either 25 bits or 114 or I don't know what)
		//	0x0800 is composition|size|duration
		//	from a stackoverflow post, 0x0300 is size|duration
		//	0x0001 is offset from http://mp4parser.com/
		function IsFlagBit(Bit)	{ return (Flags & (1 << Bit)) != 0; };
		const SampleSizePresent = IsFlagBit(TrunFlags.SampleSizePresent);
		const SampleDurationPresent = IsFlagBit(TrunFlags.SampleDurationPresent);
		const SampleFlagsPresent = IsFlagBit(TrunFlags.SampleFlagsPresent);
		const SampleCompositionTimeOffsetPresent = IsFlagBit(TrunFlags.SampleCompositionTimeOffsetPresent);
		const FirstSampleFlagsPresent = IsFlagBit(TrunFlags.FirstSampleFlagsPresent);
		const DataOffsetPresent = IsFlagBit(TrunFlags.DataOffsetPresent);

		//	This field MUST be set.It specifies the offset from the beginning of the MoofBox field(section 2.2.4.1).
		//	gr:... to what?
		//	If only one TrunBox is specified, then the DataOffset field MUST be the sum of the lengths of the MoofBox and all the fields in the MdatBox field(section 2.2.4.8).
		//	basically, start of mdat data (which we know anyway)
		if (!DataOffsetPresent)
			throw "Expected data offset to be always set";
		const DataOffsetFromMoof = await (DataOffsetPresent ? Reader.Read32() : 0 );

		function TimeToMs(TimeUnit)
		{
			//	to float
			const Timef = TimeUnit * Header.TimeScale;
			const TimeMs = Timef * 1000.0;
			return Math.floor(TimeMs);
		};

		//	DataOffset(4 bytes): This field MUST be set.It specifies the offset from the beginning of the MoofBox field(section 2.2.4.1).
		//	If only one TrunBox is specified, then the DataOffset field MUST be the sum of the lengths of the MoofBo
		//	gr: we want the offset into the mdat, but we would have to ASSUME the mdat follows this moof
		//		just for safety, we work out the file offset instead, as we know where the start of the moof is
		if (Header.BaseDataOffset !== undefined )
		{
			const HeaderPos = Header.BaseDataOffset;
			const MoofPos = MoofAtom.FilePosition;
			if (HeaderPos != MoofPos)
			{
				Debug.Log("Expected Header Pos(" + HeaderPos + ") and moof pos(" + MoofPos + ") to be the same");
			}
		}
		const MoofPosition = (Header.BaseDataOffset!==undefined) ? Header.BaseDataOffset : MoofAtom.FilePosition;
		const DataFileOffset = MoofPosition + DataOffsetFromMoof;


		const Samples = [];	//	sample_t
		let CurrentDataStartPosition = DataFileOffset;
		let CurrentTime = (Header.DecodeTime!==undefined) ? Header.DecodeTime : 0;
		let FirstSampleFlags = 0;
		if (FirstSampleFlagsPresent )
		{
			FirstSampleFlags = await Reader.Read32();
		}

		//	when the fragments are really split up into 1sample:1dat a different box specifies values
		let DefaultSampleDuration = Header.DefaultSampleDuration || 0;
		let DefaultSampleSize = Header.DefaultSampleSize || 0;
		let DefaultSampleFlags = Header.DefaultSampleFlags || 0;

		for ( let sd=0;	sd<EntryCount;	sd++)
		{
			let SampleDuration = await (SampleDurationPresent ? Reader.Read32() : DefaultSampleDuration);
			let SampleSize = await (SampleSizePresent ? Reader.Read32() : DefaultSampleSize);
			let TrunBoxSampleFlags = await (SampleFlagsPresent ? Reader.Read32() : DefaultSampleFlags);
			let SampleCompositionTimeOffset = await (SampleCompositionTimeOffsetPresent ? Reader.Read32() : 0 );

			if (SampleCompositionTimeOffsetPresent)
			{
				//	correct CurrentTimeMs?
			}

			const Sample = new Sample_t();
			//Sample.MDatIdent = MDatIdent.HasValue ? MDatIdent.Value : -1;
			Sample.DataFilePosition = CurrentDataStartPosition;
			Sample.DataSize = SampleSize;
			Sample.DurationMs = TimeToMs(SampleDuration);
			Sample.IsKeyframe = false;
			Sample.DecodeTimeMs = TimeToMs(CurrentTime);
			Sample.PresentationTimeMs = TimeToMs(CurrentTime+SampleCompositionTimeOffset);
			Sample.Flags = TrunBoxSampleFlags;
			Samples.push(Sample);

			CurrentTime += SampleDuration;
			CurrentDataStartPosition += SampleSize;
		}

		return Samples;
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
			const Track = await this.DecodeAtom_Trak(TrakAtom,MovieHeader);
			this.NewTrackQueue.Push(Track);
		}
	}
	
	//	gr; this doesn tneed to be async as we have the data, but all the reader funcs currently are
	async DecodeAtom_MovieHeader(Atom)
	{
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
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
	
	async DecodeAtom_Trak(Atom,MovieHeader)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const Track = {};
		const Medias = [];
		
		const MediaAtoms = Atom.GetChildAtoms('mdia');
		for ( let MediaAtom of MediaAtoms )
		{
			const Media = await this.DecodeAtom_Media( MediaAtom, Track, MovieHeader );
			Medias.push(Media);
		}
		
		Pop.Debug(`Found x${Medias.length} media atoms`);
		return Track;
	}
	
	async DecodeAtom_Media(Atom,Track,MovieHeader)
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
		
		Media.MediaInfo = await this.DecodeAtom_MediaInfo( Atom.GetChildAtom('minf'), Media.MediaHeader, MovieHeader );
		return Media;
	}

	async DecodeAtom_MediaHandlerHeader(Atom)
	{
		if ( !Atom )
			return null;
			
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
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
	
	async DecodeAtom_MediaInfo(Atom,MediaHeader,MovieHeader)
	{
		if ( !Atom )
			return null;

		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const Samples = await this.DecodeAtom_SampleTable( Atom.GetChildAtom('stbl'), MovieHeader );
		
		this.NewSamplesQueue.Push(Samples);
		//	gmhd
		//	hdlr
		//	dinf
		//	stbl
	}
	
	async DecodeAtom_SampleTable(Atom,MovieHeader)
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
		
		const PackedChunkMetas = await this.DecodeAtom_ChunkMetas(SampleToChunkAtom);
		const ChunkOffsets = await this.DecodeAtom_ChunkOffsets( ChunkOffsets32Atom, ChunkOffsets64Atom );
		const SampleSizes = await this.DecodeAtom_SampleSizes(SampleSizesAtom);
		const SampleKeyframes = await this.DecodeAtom_SampleKeyframes(SyncSamplesAtom, SampleSizes.length);
		const SampleDurations = await this.DecodeAtom_SampleDurations( SampleDecodeDurationsAtom, SampleSizes.length);
		const SamplePresentationTimeOffsets = await this.DecodeAtom_SampleDurations(SamplePresentationTimeOffsetsAtom, SampleSizes.length, 0 );
		
		//	durations start at zero (proper time must come from somewhere else!) and just count up over durations
		const SampleDecodeTimes = [];//new int[SampleSizes.Count];
		for ( let i=0;	i<SampleSizes.length;	i++ )
		{
			const LastDuration = (i == 0) ? 0 : SampleDurations[i - 1];
			const LastTime = (i == 0) ? 0 : SampleDecodeTimes[i - 1];
			const DecodeTime = LastTime + LastDuration;
			SampleDecodeTimes.push( DecodeTime );
		}

		//	pad (fill in gaps) the metas to fit offset information
		//	https://sites.google.com/site/james2013notes/home/mp4-file-format
		const ChunkMetas = [];
		for ( let i=0;	i<PackedChunkMetas.length;	i++ )
		{
			const ChunkMeta = PackedChunkMetas[i];
			//	first begins at 1. despite being an index...
			const FirstChunk = ChunkMeta.FirstChunk - 1;
			//	pad previous up to here
			while ( ChunkMetas.length < FirstChunk )
				ChunkMetas.push(ChunkMetas[ChunkMetas.length - 1]);

			ChunkMetas.push(ChunkMeta);
		}
		//	and pad the end
		while (ChunkMetas.length < ChunkOffsets.length)
			ChunkMetas.push(ChunkMetas[ChunkMetas.length - 1]);

		/*
		//	we're now expecting this to be here
		var MdatStartPosition = MdatAtom.HasValue ? MdatAtom.Value.AtomDataFilePosition : (long?)null;
*/
		Pop.Debug(`todo; grab last mdat?`);
		let MdatStartPosition = null;
		/*
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
		*/
		const Samples = [];	//	array of Sample_t

		const TimeScale = MovieHeader ? MovieHeader.TimeScale : 1;

		function TimeToMs(TimeUnit)
		{
			//	to float
			const Timef = TimeUnit * TimeScale;
			const TimeMs = Timef * 1000.0;
			return Math.floor(TimeMs);	//	round to int
		}

		let SampleIndex = 0;
		for ( let i=0;	i<ChunkMetas.length;	i++)
		{
			const SampleMeta = ChunkMetas[i];
			const ChunkIndex = i;
			let ChunkFileOffset = ChunkOffsets[ChunkIndex];

			for ( let s=0;	s<SampleMeta.SamplesPerChunk;	s++ )
			{
				const Sample = new Sample_t();

				if ( MdatStartPosition !== null )
					Sample.DataPosition = ChunkFileOffset - MdatStartPosition.Value;
				else
					Sample.DataFilePosition = ChunkFileOffset;

				Sample.DataSize = SampleSizes[SampleIndex];
				Sample.IsKeyframe = SampleKeyframes[SampleIndex];
				Sample.DecodeTimeMs = TimeToMs( SampleDecodeTimes[SampleIndex] );
				Sample.DurationMs = TimeToMs( SampleDurations[SampleIndex] );
				Sample.PresentationTimeMs = TimeToMs( SampleDecodeTimes[SampleIndex] + SamplePresentationTimeOffsets[SampleIndex] );
				Samples.push(Sample);

				ChunkFileOffset += Sample.DataSize;
				SampleIndex++;
			}
		}

		if (SampleIndex != SampleSizes.length)
			Pop.Warning(`Enumerated ${SampleIndex} samples, expected ${SampleSizes.length}`);

		return Samples;
	}
	
	async DecodeAtom_ChunkMetas(Atom)
	{
		const Metas = [];
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
		
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
	
	async DecodeAtom_ChunkOffsets(ChunkOffsets32Atom,ChunkOffsets64Atom)
	{
		let OffsetSize,Atom;
		if ( ChunkOffsets32Atom )
		{
			OffsetSize = 32 / 8;
			Atom = ChunkOffsets32Atom;
		}
		else if ( ChunkOffsets64Atom )
		{
			OffsetSize = 64 / 8;
			Atom = ChunkOffsets64Atom;
		}
		else
		{
			throw `Missing offset atom`;
		}
		
		const Offsets = [];
		const Reader = new DataReader( Atom.Data,Atom.FilePosition );
		
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		//var Version = AtomData[8];
		//var Flags = Get24(AtomData[9], AtomData[10], AtomData[11]);
		const EntryCount = await Reader.Read32();
		for ( let e=0;	e<EntryCount;	e++ )
		{
			let Offset;
			if ( OffsetSize == 32/8 )
				Offset = await Reader.Read32();
			if ( OffsetSize == 64/8 )
				Offset = await Reader.Read64();
			Offsets.push(Offset);
		}
	
		//var Offset = Get32(AtomData[i + 0], AtomData[i + 1], AtomData[i + 2], AtomData[i + 3]);
		//var Offset = Get64(AtomData[i + 0], AtomData[i + 1], AtomData[i + 2], AtomData[i + 3], AtomData[i + 4], AtomData[i + 5], AtomData[i + 6], AtomData[i + 7]);
		return Offsets;
	}
	
	async DecodeAtom_SampleSizes(Atom)
	{
		const Reader = new DataReader( Atom.Data,Atom.FilePosition );
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		let SampleSize = await Reader.Read32();
		const EntryCount = await Reader.Read32();
		
		const Sizes = [];
		
		//	if size specified, they're all this size
		if (SampleSize != 0)
		{
			for ( let i=0;	i<EntryCount;	i++)
				Sizes.push(SampleSize);
			return Sizes;
		}
		
		//	each entry in the table is the size of a sample (and one chunk can have many samples)
		//const SampleSizeStart = 20;	//	Reader.FilePosition
		const SampleSizeStart = Reader.FilePosition;
		if ( Reader.FilePosition != SampleSizeStart )
			throw `Offset calculation has gone wrong`;
			
		//	gr: docs don't say size, but this seems accurate...
		//		but also sometimes doesnt SEEM to match the size in the header?
		SampleSize = (Atom.Data.length - SampleSizeStart) / EntryCount;
		//for ( let i = SampleSizeStart; i < AtomData.Length; i += SampleSize)
		for ( let e=0;	e<EntryCount;	e++ )
		{
			if (SampleSize === 3)
			{
				const Size = await Reader.Read24();
				//var Size = Get24(AtomData[i + 0], AtomData[i + 1], AtomData[i + 2]);
				Sizes.push(Size);
			}
			else if (SampleSize === 4)
			{
				const Size = await Reader.Read32();
				//var Size = Get32(AtomData[i + 0], AtomData[i + 1], AtomData[i + 2], AtomData[i + 3]);
				Sizes.push(Size);
			}
			else
				throw `Unhandled sample size ${SampleSize}`;
		}
		
		return Sizes;
	}
	
	async DecodeAtom_SampleKeyframes(Atom,SampleCount)
	{
		//	keyframe index map
		const Keyframes = [];
		//	init array
		{
			const Default = Atom ? false : true;
			for ( let i=0;	i<SampleCount;	i++ )
				Keyframes.push(Default);
		}
		if ( !Atom )
			return Keyframes;
		
		const Reader = new DataReader( Atom.Data,Atom.FilePosition );
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		const EntryCount = await Reader.Read32();
		
		if ( EntryCount == 0 )
			return Keyframes;
			
		//	gr: docs don't say size, but this seems accurate...
		const IndexSize = (Atom.Data.length - Reader.FilePosition) / EntryCount;
		for ( let e=0;	e<EntryCount;	e++ )
		{
			let SampleIndex;
			if ( IndexSize === 3 )
			{
				SampleIndex = await Reader.Read24();
			}
			else if ( IndexSize === 4 )
			{
				SampleIndex = await Reader.Read32();
			}
			else
				throw `Unhandled index size ${IndexSize}`;
			//	gr: indexes start at 1
			SampleIndex--;
			Keyframes[SampleIndex] = true;
		}
		return Keyframes;
	}

	async DecodeAtom_SampleDurations(Atom,SampleCount,Default=null)
	{
		if ( !Atom )
		{
			if ( Default === null )
				throw `No atom and no default to get sample durations from`;
				
			const Offsets = [];
			for ( let e=0;	e<SampleCount;	e++ )
				Offsets.push(Default);
			return Offsets;
		}
		
		const Durations = [];
		const Reader = new DataReader(Atom.Data,Atom.DataFilePosition);
		const Version = await Reader.Read8();
		const Flags = await Reader.Read24();
		const EntryCount = await Reader.Read32();
		
		//	read durations as we go
		while ( Reader.BytesRemaining )
		{
			const SubSampleCount = await Reader.Read32();
			const SubSampleDuration = await Reader.Read32();
			
			for ( let s=0;	s<SubSampleCount;	s++ )
				Durations.push(SubSampleDuration);
		}
		
		if ( Durations.length != EntryCount )
		{
			//	gr: for some reason, EntryCount is often 1, but there are more samples
			//	throw `Durations extracted doesn't match entry count`
		}
		if ( Durations.length != SampleCount )
			throw `Durations Extracted(${Durations.length}) don't match sample count(${SampleCount}) EntryCount=${EntryCount}`;
		
		return Durations;
	}

}


