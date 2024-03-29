const Default = 'Mp4.js';
export default Default;

import PromiseQueue from './PromiseQueue.js'
import {DataReader,DataWriter,EndOfFileMarker} from './DataReader.js'
import {StringToBytes,JoinTypedArrays} from './PopApi.js'
import * as H264 from './H264.js'
import {MP4,H264Remuxer} from './Mp4_Generator.js'
import {Debug,Warning,Yield} from './PopWebApiCore.js'


export class AtomDataReader extends DataReader
{
	//	gr: move this to an overloaded Atom/Mpeg DataReader
	async ReadNextAtom(GetAtomType=null)
	{
		GetAtomType = GetAtomType || function(Fourcc)	{	return null;	}
	
		const Atom_FilePosition = this.ExternalFilePosition + this.FilePosition;
		let Atom_Size;
		//	catch EOF and return null, instead of throwing
		try
		{
			Atom_Size = await this.Read32();
		}
		catch(e)
		{
			if ( e == EndOfFileMarker )
				return null;
			throw e;
		}
		const Atom_Fourcc = await this.ReadString(4);

		//	alloc atom
		const AtomType = GetAtomType(Atom_Fourcc) ||  Atom_t;
		const Atom = new AtomType();
		Atom.FilePosition = Atom_FilePosition;
		Atom.Size = Atom_Size;
		Atom.Fourcc = Atom_Fourcc;
		
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

//	todo:
function GetSecondsSinceMidnightJan1st1904(TimeStamp)
{
	const Epoch = new Date('January 1, 1904 0:0:0 GMT');
	const DeltaMs = TimeStamp - Epoch;
	const DeltaSecs = Math.floor(DeltaMs/1000);
	return DeltaSecs;
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

const SampleFlags =
{
	//	https://chromium.googlesource.com/chromium/src/media/+/refs/heads/main/formats/mp4/box_definitions.h#541
	//	sample_depends_on values in ISO/IEC 14496-12 Section 8.40.2.3.
	//	gr: used in chromium as (x>>24)&3 then cast to 0x3
	//	https://chromium.googlesource.com/chromium/src/media/+/refs/heads/main/formats/mp4/track_run_iterator.cc#189
	//kSampleDependsOnUnknown = 0,
	//kSampleDependsOnOthers = 1,	bit 24 set
	//kSampleDependsOnNoOther = 2,	bit 25 set
	//kSampleDependsOnReserved = 3, both set
	DependsOnOthers:		24+0,
	DependsOnNoOthers:		24+1,	//	"is depended on" in other cases, so is keyframe
	isLeading:				24+2,	//	
	
	IsNotKeyframe:			0+16,
	PaddingValue:			1+16,
	HasRedundancy:			4+16,
	//IsDepedendedOn:			6+16,//	keyframe
	
	//	last 2 bytes of flags are priority
	DegredationPriority0:	0xff00,
	DegredationPriority1:	0x00ff,
};
//	todo? specific atom type encode&decoders?



class Sample_t
{
	constructor()
	{
		this.DecodeTimeMs = null;
		this.PresentationTimeMs = null;
		this.IsKeyframe = true;
		this.TrackId = null;

		//	decoder
		this.DataSize;
		this.DurationMs;
		this.DataPosition;
		this.DataFilePosition;
		
		//	encoder
		this.Data;
		this.CompositionTimeOffset;
	}
	
	get Flags()
	{
		let Flags = 0;
		if ( this.IsKeyframe )
		{
			Flags |= 1<<SampleFlags.DependsOnNoOthers;
		}
		else
		{
			Flags |= 1<<SampleFlags.IsNotKeyframe;
			Flags |= 1<<SampleFlags.DependsOnOthers;
		}
		return Flags;
	}
	
	set Flags(Flags)
	{
		const NotKeyframe = Flags & (1<<SampleFlags.IsNotKeyframe);
		const DependsOnOthers = Flags & (1<<SampleFlags.DependsOnOthers);
		//	in case of bad flags, assume keyframe? 
		this.IsKeyframe = (!NotKeyframe) || (!DependsOnOthers);
	}
		
	
	get Size()
	{
		if ( this.Data )
			return this.Data.length;
		return this.DataSize;
	}
		
}

export class Atom_t
{
	constructor(Fourcc=null,CopyAtom=null)
	{
		this.Size = 0;		//	total size 
		this.FilePosition = null;
		this.Fourcc = Fourcc;	//	string of four chars
		this.Size64 = null;	//	only set if Size=1
		
		this.Data = null;	//	raw data following this header
		this.ChildAtoms = [];	//	more Atom_t's (key these? can there be duplicates?)
		
		if ( CopyAtom )
		{
			if ( CopyAtom.Fourcc != this.Fourcc )
				throw `Copying atom with different fourcc (${this.Fourcc} -> ${CopyAtom.Fourcc})`;
			//	gr: do deep copy of child atoms?
			Object.assign(this,CopyAtom);
		}
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
		const Reader = new AtomDataReader(this.Data,this.DataFilePosition);
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
	
	//	turn atom[tree] into Uint8Array()
	Encode(IncludeAtomHeader=true)
	{
		if ( this.Fourcc.length != 4 )
			throw `Atom fourcc (${this.Fourcc}) is not 4 chars`;
			
		//	bake sub data
		const SubDataWriter = new DataWriter();
		this.EncodeData(SubDataWriter);
		const Data = SubDataWriter.GetData();
		
		if ( !IncludeAtomHeader )
			return Data;
		
		//	atom size includes header size
		let AtomSize = (32/8) + 4;	//	size + fourcc
		AtomSize += Data.length;
		
		if ( AtomSize > 0xffffffff )
		{
			AtomSize += 64/8;
			this.Size64 = AtomSize;
			this.Size = 1;
		}
		else
		{
			this.Size64 = null;
			this.Size = AtomSize;
		}
		
		//	write out atom header+data
		const Writer = new DataWriter();
		Writer.Write32(this.Size);
		Writer.WriteStringAsBytes(this.Fourcc);
		if ( this.Size64 !== null )
			Writer.Write64(this.Size64);
			
		Writer.WriteBytes(Data);
		
		const AtomData = Writer.GetData();
		return AtomData;
	}
	
	//	default, overload if not writing child atoms or dumb data
	EncodeData(DataWriter)
	{
		if ( this.ChildAtoms.length )
		{
			if ( this.Data )
				throw `Atom has child nodes AND data, should only have one`;

			for ( let ChildAtom of this.ChildAtoms )
			{
				const ChildAtomAsData = ChildAtom.Encode();
				DataWriter.WriteBytes(ChildAtomAsData);
			}
			return;
		}
		
		if ( !this.Data )
		{
			//throw `Atom has no data`;
		}
		else
		{
			DataWriter.WriteBytes( this.Data );
		}
	}
};


function GetSampleHash(Sample)
{
	//	we can use the file position for a unique hash for a sample
	//	gr: make sure this doesnt fall over with fragmented mp4s
	const FilePosition = Sample.DataFilePosition;
	if ( FilePosition === undefined )
		return false;
	return FilePosition;
}

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
		this.SamplesAlreadyOutput = {};	//	[SampleHash] if defined, this sample has already been output
		
		this.PendingAtoms = [];	//	pre-decoded atoms pushed into file externally
		this.RootAtoms = [];	//	trees coming off root atoms
		this.Mdats = [];		//	atoms with data
		this.Tracks = [];
		
		this.NewByteQueue = new PromiseQueue('Mp4 pending bytes');
		
		this.FileReader = new AtomDataReader( new Uint8Array(0), 0, this.WaitForMoreFileData.bind(this) );
		
		this.ParsePromise = this.ParseFileThread();
		this.ParsePromise.catch( this.OnError.bind(this) );
	}

	OnError(Error)
	{
		//	make queues fail
		Warning(`Mp4 decode thread error ${Error}`);
		this.NewSamplesQueue.Reject(Error);
		this.NewAtomQueue.Reject(Error);
		this.NewTrackQueue.Reject(Error);
	}

	//	gr: should this integrate into WaitForNextSamples?	
	async WaitForParseFinish()
	{
		return this.ParsePromise;
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
	
	OnNewSamples(Samples)
	{
		//	null == EOF
		if ( !Samples )
		{
			this.NewSamplesQueue.Push( Samples );
			return;
		}
		
		function VerifySample(Sample)
		{
			if ( !Number.isInteger(Sample.TrackId) )
				throw `Sample has invalid track id ${Sample.TrackId}`;
		}
		
		//	detect bad sample input
		Samples.forEach(VerifySample);
		
		//	remove samples we've already output
		//	we need this because if we inject a tail-moov and output samples, 
		//	when the file comes across that moov again, it processes them and outputs new samples
		//	todo: somehow detect that atom is a duplicate and skip the decoding of the sample table 
		//		and just use this as a failsafe
		function HasOutputSample(Sample)
		{
			const Hash = GetSampleHash(Sample);
			//	unhashable samples (eg dynamic SPS/PPS) don't get filtered
			if ( !Hash )
				return false;
			if ( this.SamplesAlreadyOutput.hasOwnProperty(Hash) )
				return true;
			return false;
		}
		Samples = Samples.filter( Sample => !HasOutputSample.call(this,Sample) );
		
		//	all samples filtered out
		if ( !Samples.length )
			return;

		function MarkSampleOutput(Hash)
		{
			this.SamplesAlreadyOutput[Hash] = true;
		}
		//	mark samples as output
		const SampleHashs = Samples.map( GetSampleHash ).filter( Hash => Hash!=null );
		SampleHashs.forEach(MarkSampleOutput.bind(this));
		
		this.NewSamplesQueue.Push( Samples );
	}
	
	PushEndOfFile()
	{
		this.PushData(EndOfFileMarker);
	}
	
	PushData(Bytes)
	{
		//	we now allow caller to push in pre-decoded atoms
		//	eg. MOOV extracted from tail of an mp4
		//	gr: when data moves through web workers, it loses
		//		it's type. so check for our Atom_t member[s]
		if ( Bytes.hasOwnProperty('Fourcc') )
		{
			const Atom = new Atom_t();
			Object.assign( Atom, Bytes );
			Bytes = Atom;
		}
			
		if ( Bytes instanceof Atom_t )
		{
			this.PendingAtoms.push(Bytes);
			return;
		}
		
		//	check valid input types
		if ( Bytes == EndOfFileMarker )
		{
		}
		else if ( Bytes instanceof Uint8Array )
		{
		}
		else
		{
			throw `PushData(${typeof Bytes}) to mp4 which isn't a byte array`;
		}
		
		if ( !Bytes )
			throw `Don't pass null to Mp4 PushData(), call PushEndOfFile()`;
		this.NewByteQueue.Push(Bytes);
	}
	
	PushMdat(MdatAtom)
	{
		this.Mdats.push(MdatAtom);
	}
	
	
	async ReadNextAtom()
	{
		if ( this.PendingAtoms.length > 0 )
		{
			const Atom = this.PendingAtoms.shift();
			return Atom;
		}
		
		const Atom = await this.FileReader.ReadNextAtom();
		return Atom;
	}
	
	async ParseFileThread()
	{
		while ( true )
		{
			const Atom = await this.ReadNextAtom();
			if ( Atom === null )
			{
				//Debug(`End of file`);
				break;
			}
			
			this.RootAtoms.push(Atom);
			this.NewAtomQueue.Push(Atom);
			
			if ( Atom.Fourcc == 'ftyp' )
			{
				await this.DecodeAtom_Ftyp(Atom);
			}
			else if ( Atom.Fourcc == 'moov' )
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
				//Debug(`Skipping atom ${Atom.Fourcc} x${Atom.ContentSize}`);
			}
			
			//	breath
			await Yield(0);
		}
		
		//	push a null eof sample when parsing done
		this.OnNewSamples(null);
	}
	
	OnNewTrack(Track)
	{
		this.Tracks.push(Track);
		this.NewTrackQueue.Push(Track);
	}
	
	GetTrack(TrackId)
	{
		const Track = this.Tracks.find( t => t.Id == TrackId );
		if ( !Track )
			throw `No track ${TrackId}`;
		return Track;
	}
	
	async DecodeAtom_Mdat(Atom)
	{
		this.PushMdat(Atom);
	}
	
	async DecodeAtom_MoofHeader(Atom)
	{
		const Header = {};
		if ( !Atom )
			return Header; 

		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);

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
			this.OnNewTrack(Track);
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
		this.OnNewSamples(Samples);
	}
	
	async DecodeAtom_TrackFragmentDelta(Atom)
	{
		if ( !Atom )
			return 0;
			
		const Tfdt = await Atom_Tfdt.Read(Atom);
		return Tfdt.DecodeTime;
	}
		
	async DecodeAtom_TrackFragmentHeader(Atom,DeltaTimeAtom)
	{
		if ( !Atom )
			return new Atom_Tfhd('tfhd');
	
		const tfhd = await Atom_Tfhd.Read(Atom);
		
		//Header.DecodeTime = await this.DecodeAtom_TrackFragmentDelta(DeltaTimeAtom);
		
		return tfhd;
	}
	
	async DecodeAtom_FragmentSampleTable(Atom,MoofAtom,TrackHeader)
	{
		if ( !Atom )
			return [];
			
		const Header = TrackHeader;
		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);
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
				Debug("Expected Header Pos(" + HeaderPos + ") and moof pos(" + MoofPos + ") to be the same");
				Header.BaseDataOffset = MoofPos;
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

		const Track = this.GetTrack(TrackHeader.TrackId);
		
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
			Sample.DecodeTimeMs = TimeToMs(CurrentTime);
			Sample.PresentationTimeMs = TimeToMs(CurrentTime+SampleCompositionTimeOffset);
			Sample.Flags = TrunBoxSampleFlags;
			Sample.TrackId = TrackHeader.TrackId;
			Sample.ContentType = Track.ContentType;
			Samples.push(Sample);

			CurrentTime += SampleDuration;
			CurrentDataStartPosition += SampleSize;
		}

		return Samples;
	}
	
	async DecodeAtom_Ftyp(Atom)
	{
		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);
		const MajorBrand = await Reader.ReadString(4);
		const MinorVersion = await Reader.Read32();
		//Debug(`ftyp ${MajorBrand} ver 0x${MinorVersion.toString(16)}`); 
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
			this.OnNewTrack(Track);
		}
	}
	
	//	gr; this doesn tneed to be async as we have the data, but all the reader funcs currently are
	async DecodeAtom_MovieHeader(Atom)
	{
		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);
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
				Warning(`Reserved value ${Zero} is not zero`);
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
		Header.PreviewDuration = PreviewDuration * Header.TimeScale;
		return Header;
	}
	
	async DecodeAtom_Trak(Atom,MovieHeader)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const TrackHeader = await Atom_Tkhd.Read( Atom.GetChildAtom('tkhd') );
		
		const Track = {};
		Track.Id = TrackHeader.TrackId;
		
		const Medias = [];
		
		const MediaAtoms = Atom.GetChildAtoms('mdia');
		for ( let MediaAtom of MediaAtoms )
		{
			const Media = await this.DecodeAtom_Media( MediaAtom, Track, MovieHeader );
			Medias.push(Media);
		}
		
		Track.Medias = Medias;
		Track.ContentType = Object.keys(Medias[0].MediaInfo)[0];
		//Debug(`Found x${Medias.length} media atoms`);
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
			Media.MediaHeader.TimeScale = 1000;
		}
		
		Media.MediaInfo = await this.DecodeAtom_MediaInfo( Atom.GetChildAtom('minf'), Track.Id, Media.MediaHeader, MovieHeader );
		return Media;
	}

	async DecodeAtom_MediaHandlerHeader(Atom)
	{
		if ( !Atom )
			return null;
			
		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);
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
		Header.LanguageId = Language;
		Header.Quality = Quality / (1 << 16);
		return Header;
	}
	
	async DecodeAtom_MediaInfo(Atom,TrackId,MediaHeader,MovieHeader)
	{
		if ( !Atom )
			return null;

		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		
		const Samples = await this.DecodeAtom_SampleTable( Atom.GetChildAtom('stbl'), TrackId, MediaHeader, MovieHeader );
		
		const Dinfs = Atom.GetChildAtoms('dinf');
		for ( let Dinf of Dinfs )
			await this.DecodeAtom_Dinf(Dinf);
		
		const MediaInfo = {};
		
		//	subtitle meta
		const Tx3g = MediaHeader.SampleMeta.GetChildAtom('tx3g');
		if ( Tx3g )
		{
			MediaInfo.Subtitle = Tx3g;

		}
		
		//	todo: should we convert header to samples? (SPS & PPS)
		//		does this ONLY apply to h264/video?
		const Avc1 = MediaHeader.SampleMeta.GetChildAtom('avc1');
		if ( Avc1 )
		{
			const Avcc = Avc1.GetChildAtom('avcC');
			if ( Avcc )
			{
				const ContentType = 'H264';
				MediaInfo[ContentType] = Avcc;
				
				//	it's possible to get this header with no samples
				//	(fragmented mp4?)
				//	so we dont have a first deocde/presentation time...
				//	bit of a flaw in the system... should we hold here?
				const DummyFirstSample = new Sample_t();
				DummyFirstSample.TrackId = TrackId;
				const FirstSample = Samples[0] || DummyFirstSample;
			
				//	messy hack! should start with nalu size prefix
				const SpsSample = new Sample_t();
				SpsSample.Data = [0,0,0,1,	...Avcc.SpsDatas[0] ];
				SpsSample.DecodeTimeMs = FirstSample.DecodeTimeMs;
				SpsSample.PresentationTimeMs = FirstSample.PresentationTimeMs;
				SpsSample.TrackId = FirstSample.TrackId;
				SpsSample.ContentType = ContentType;
				SpsSample.DurationMs = 0;

				const PpsSample = new Sample_t();
				PpsSample.Data = [0,0,0,1,	...Avcc.PpsDatas[0] ];
				PpsSample.DecodeTimeMs = FirstSample.DecodeTimeMs;
				PpsSample.PresentationTimeMs = FirstSample.PresentationTimeMs;
				PpsSample.TrackId = FirstSample.TrackId;
				PpsSample.ContentType = ContentType;
				PpsSample.DurationMs = 0;

				this.OnNewSamples( [SpsSample,PpsSample] );
			}
		}
			
		this.OnNewSamples(Samples);
		//	gmhd
		//	hdlr
		//	dinf
		//	stbl
		
		return MediaInfo;
	}
	
	async DecodeAtom_Dinf(Atom)
	{
		await Atom.DecodeChildAtoms();
		Atom.ChildAtoms.forEach( a => this.NewAtomQueue.Push(a) );
		//	expecting this to just contain one dref
	}
	
	//	todo: see how much this overlaps with DecodeAtom_FragmentSampleTable
	async DecodeAtom_SampleTable(Atom,TrackId,MediaHeader,MovieHeader)
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
		const SampleDescriptorAtom = Atom.GetChildAtom('stsd');
		
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

		//	extract sample info, including AVCC headers for h264
		MediaHeader.SampleMeta = await this.DecodeAtom_Stsd(SampleDescriptorAtom);
		
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
		//Debug(`todo; grab last mdat?`);
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

		const TimeScale = MovieHeader ? MovieHeader.TimeScale : 1000;

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
				Sample.TrackId = TrackId;
				Samples.push(Sample);

				ChunkFileOffset += Sample.DataSize;
				SampleIndex++;
			}
		}

		if (SampleIndex != SampleSizes.length)
			Warning(`Enumerated ${SampleIndex} samples, expected ${SampleSizes.length}`);

		return Samples;
	}
	
	async DecodeAtom_ChunkMetas(Atom)
	{
		const Metas = [];
		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);
		
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
		const Reader = new AtomDataReader( Atom.Data,Atom.FilePosition );
		
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
		const Reader = new AtomDataReader( Atom.Data,Atom.FilePosition );
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
		
		const Reader = new AtomDataReader( Atom.Data,Atom.FilePosition );
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

	//	sample descriptor (meta for samples in a table)
	async DecodeAtom_Stsd(Atom)
	{
		if ( !Atom )
			return;
		
		//	gr: is this similar to DecodeAtom_FragmentSampleTable ?
		const Stsd = await Atom_Stsd.Read(Atom, (a) => this.NewAtomQueue.Push(a) );
		return Stsd;
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
		const Reader = new AtomDataReader(Atom.Data,Atom.DataFilePosition);
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


class PendingTrack_t
{
	constructor()
	{
		this.Samples = [];
	}
	
	PushSample(Sample)
	{
		this.Samples.push(Sample);
	}
}

//	encoding atoms, but maybe we can merge with decode
class Atom_Moov extends Atom_t
{
	constructor()
	{
		super('moov');
		
		this.mvhd = new Atom_Mvhd();
		this.ChildAtoms.push(this.mvhd);
		
		//	fragment needs trex in mvex
		this.mvex = new Atom_Mvex();
		this.ChildAtoms.push(this.mvex);
	}
	
	GetTrakAtom(TrackId)
	{
		const Traks = this.GetChildAtoms('trak');
		const Trak = Traks.find( t => t.TrackId == TrackId );
		return Trak;
	}
	
	AddTrack(TrackId)
	{
		//	does trak this already exist?
		const ExistingTrack = this.GetTrakAtom(TrackId);
		if ( ExistingTrack )
			return;
		
		const Trak = new Atom_Trak(TrackId);
		this.ChildAtoms.push(Trak);
		
		//	add a trex for every track
		this.mvex.ChildAtoms.push( new Atom_Trex(TrackId) );
	}
}

class Atom_Mvex extends Atom_t
{
	constructor()
	{
		super('mvex');
	}
}

class Atom_Trex extends Atom_t
{
	constructor(TrackId)
	{
		super('trex');
		
		//	https://sce.umkc.edu/faculty-sites/lizhu/teaching/2018.fall.video-com/ref/mp4.pdf
		//	This sets up default values used by the movie fragments. 
		//	By setting defaults in this way, space and complexity can
		//	be saved in each Track Fragment Box
		this.Flags = 0;
		this.TrackId = TrackId;
		this.DefaultSampleDescriptionIndex = 0;
		this.DefaultSampleDuration = 0;
		this.DefaultSampleSize = 0;
		this.DefaultSampleFlags = 0;
	}
	
	EncodeData(DataWriter)
	{
		if ( this.TrackId == 0 )
			throw `Invalid Track Id ${this.TrackId} in Trex`;
		/*
		//	https://sce.umkc.edu/faculty-sites/lizhu/teaching/2018.fall.video-com/ref/mp4.pdf
		gr: flags, I think signal more data
		bit(6) reserved=0;
		unsigned int(2) sample_depends_on;
		unsigned int(2) sample_is_depended_on;
		unsigned int(2) sample_has_redundancy;
		bit(3) sample_padding_value;
		bit(1) sample_is_difference_sample;
		 // i.e. when 1 signals a non-key or non-sync sample
		unsigned int(16) sample_degradation_priority
		*/
		DataWriter.Write32(this.Flags);
		DataWriter.Write32(this.TrackId);
		DataWriter.Write32(this.DefaultSampleDescriptionIndex);
		DataWriter.Write32(this.DefaultSampleDuration);
		DataWriter.Write32(this.DefaultSampleSize);
		DataWriter.Write32(this.DefaultSampleFlags);
	}
}

class Atom_Trak extends Atom_t
{
	constructor(TrackId)
	{
		super('trak');
		
		this.tkhd = new Atom_Tkhd(TrackId);
		this.ChildAtoms.push(this.tkhd);
		this.mdia = new Atom_Mdia();
		this.ChildAtoms.push(this.mdia);
	}
	
	get TrackId()
	{
		return this.tkhd.TrackId;
	}	
	
	set TrackId(Value)
	{
		this.tkhd.TrackId = Value;
	}
}

function GetFixed_16_16(Float)
{
	const MaxIntMask = ((1<<16)-1);
	const MaxDecMask = ((1<<16)-1);
	let Major = Math.floor(Float) & MaxIntMask;
	let Minor = (Float-Major) * MaxDecMask;
	return (Major<<16) | (Minor<<0);
}

function GetFixed_2_30(Float)
{
	const MaxIntMask = ((1<<2)-1);
	const MaxDecMask = ((1<<30)-1);
	let Major = Math.floor(Float) & MaxIntMask;
	let Minor = (Float-Major) * MaxDecMask;
	return (Major<<30) | (Minor<<0);
}

function CreateMatrix(a,b,u,c,d,v,tx,ty,w)
{
	const Matrix = 
	[
		GetFixed_16_16(a),
		GetFixed_16_16(b),
		GetFixed_2_30(u),
		GetFixed_16_16(c),
		GetFixed_16_16(d),
		GetFixed_2_30(v),
		GetFixed_16_16(tx),
		GetFixed_16_16(ty),
		GetFixed_2_30(w)
	];
	return new Uint32Array(Matrix);
}

class Atom_Tkhd extends Atom_t
{
	constructor(TrackId=0)
	{
		super('tkhd');
		
		this.Version = 0;
		const Flag_Enabled = 1<<0;
		const Flag_Used = 1<<1;
		const Flag_Preview = 1<<2;
		const Flag_Poster = 1<<3;
		this.Flags = Flag_Enabled | Flag_Used;
		this.CreationTime = new Date();
		this.ModificationTime = new Date();
		this.TrackId = TrackId;	//	0 is invalid
		this.Duration = 123*1000;
		
		//	A 16-bit integer that indicates this tracks spatial priority in its movie. The QuickTime Movie Toolbox uses this value to determine how tracks overlay one another. Tracks with lower layer values are displayed in front of tracks with higher layer values.

		this.Layer = 0;
		this.AlternateGroup = 0;	//	zero =  not an alternative track
		this.Volume = 0;	//	8.8 fixed
		
		this.Matrix = CreateMatrix(1,0,0,	0,1,0,	0,0,1);
		this.PixelsWidth = 640;
		this.PixelsHeight = 480;
	}
	
	EncodeData(DataWriter)
	{
		//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap2/qtff2.html#//apple_ref/doc/uid/TP40000939-CH204-25550
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		
		const CreationTime = GetSecondsSinceMidnightJan1st1904(this.CreationTime);
		DataWriter.Write32(CreationTime);
		const ModificationTime = GetSecondsSinceMidnightJan1st1904(this.ModificationTime);
		DataWriter.Write32(ModificationTime);

		if ( this.TrackId == 0 )
			throw `zero is not a valid Track id number`;
		DataWriter.Write32(this.TrackId);
		DataWriter.Write32(0);	//	reserved
		
		const Duration = this.Duration;	//	 scaled to movie time scalar
		DataWriter.Write32(Duration);

		DataWriter.WriteBytes( new Uint8Array(8) );	//	reserved
		DataWriter.Write16( this.Layer );
		DataWriter.Write16( this.AlternateGroup );
		DataWriter.Write16( this.Volume );
		DataWriter.Write16( 0 );	//	reserved
		DataWriter.WriteBytes( this.Matrix );
		DataWriter.Write32( this.PixelsWidth );
		DataWriter.Write32( this.PixelsHeight );
	}
	
	static async Read(AnonymousAtom,EnumChildAtom)
	{
		const Reader = new AtomDataReader(AnonymousAtom.Data,AnonymousAtom.DataFilePosition);
		const Atom = new Atom_Tkhd();
		Atom.Version = await Reader.Read8();
		Atom.Flags = await Reader.Read24();
		Atom.CreationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904( await Reader.Read32() );
		Atom.ModificationTime = GetDateTimeFromSecondsSinceMidnightJan1st1904( await Reader.Read32() );
		Atom.TrackId = await Reader.Read32();
		const Reserved = await Reader.Read32();
		Atom.Duration = await Reader.Read32();
		const Reserved8 = await Reader.ReadBytes(8);
		Atom.Layer = await Reader.Read16();
		Atom.AlternateGroup = await Reader.Read16();
		Atom.Volume = await Reader.Read16();
		const Reserved16 = await Reader.Read16();
		Atom.Matrix = await Reader.ReadBytes( 3*3 *4 );//	u32 * 3x3
		Atom.PixelsWidth = await Reader.Read32();
		Atom.PixelsHeight = await Reader.Read32();

		return Atom;
	}
}

class Atom_Mdia extends Atom_t
{
	constructor()
	{
		super('mdia');
		
		this.mdhd = new Atom_Mdhd();
		this.ChildAtoms.push(this.mdhd);

		//	hdlr is optional, but I think we can't decode without it
		//	it also dictates audio/visual/subtitle, so pretty important
		this.hdlr = new Atom_Hdlr();
		this.ChildAtoms.push(this.hdlr);
		this.minf = new Atom_Minf_Video();
		this.ChildAtoms.push(this.minf);
	}
}

class Atom_Mdhd extends Atom_t
{
	constructor()
	{
		super('mdhd');
		this.Version = 0;
		this.Flags = 0;
		this.CreationTime = new Date();
		this.ModificationTime = new Date();
		this.TimeScale = 1000;
		this.DurationMs = 123*1000;
		this.Language = 0;
		this.Quality = 1;	//	0..1
	}
	
	EncodeData(DataWriter)
	{
		const CreationTime = GetSecondsSinceMidnightJan1st1904(this.CreationTime);
		const ModificationTime = GetSecondsSinceMidnightJan1st1904(this.ModificationTime);
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		DataWriter.Write32(CreationTime);
		DataWriter.Write32(ModificationTime);
		DataWriter.Write32(this.TimeScale);
		const Duration = this.DurationMs / 1000 / this.TimeScale;
		DataWriter.Write32(Duration);	//	need to scale this
		DataWriter.Write16(this.Language);
		
		const Quality16 = this.Quality * 0xffff;
		DataWriter.Write16(Quality16);
	}
};

class Atom_Hdlr extends Atom_t
{
	constructor()
	{
		super('hdlr');
		
		this.Version = 0;
		this.Flags = 0;
		
		//	'mhlr' for media handlers and 'dhlr'
		this.Type = 'mhlr';	//	media handler
		//this.Type = 'dhlr';	//	Data handler
		
		//	fourcc
		//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-SW1
		this.SubType = 'vide';	
		//this.SubType = 'soun';
		//this.SubType = 'subt';
		//this.SubType = 'meta';	//	timed meta data
		//this.SubType = 'text';	//	text with some formatting
	}
	
	EncodeData(DataWriter)
	{
		if ( this.Type.length != 4 )
			throw `Expected Track HDLR Type ($this.Type) to be 4 chars (fourcc)`;
		if ( this.SubType.length != 4 )
			throw `Expected Track HDLR Type ($this.SubType) to be 4 chars (fourcc)`;
			
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		//	quicktime generated files have 0x0 here...
		//DataWriter.WriteStringAsBytes(this.Type);//
		DataWriter.Write32(0);
		DataWriter.WriteStringAsBytes(this.SubType);
		
		DataWriter.Write32(0);	// Component manufacturer - reserved
		DataWriter.Write32(0);	// Component flags - reserved
		DataWriter.Write32(0);	// Component flags mask - reserved
		DataWriter.WriteStringAsBytes('VideoHandler');	// Component name - can be empty
		//	gr: quicktime file has one extra byte... null terminator?
		DataWriter.Write8(0);
	}
}

class Atom_Dinf extends Atom_t
{
	constructor()
	{
		super('dinf');
		this.dref = new Atom_Dref();
		this.ChildAtoms.push(this.dref);
	}
	
	AddData(Index,Data)
	{
		this.dref.AddData(Index,Data);
	}
}


class Atom_Dref extends Atom_t
{
	constructor()
	{
		super('dref');
		
		this.Version = 0;
		this.Flags = 0;
		this.Datas = [];
	}
	
	AddData(Index,DataAtom)
	{
		while ( this.Datas.length < Index+1 )
			this.Datas.push(null);
		this.Datas[Index] = DataAtom;
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		DataWriter.Write32(this.Datas.length);
		
		for ( let Data of this.Datas )
		{
			if ( Data == null )
				Data = new Uint8Array(0);
			if ( typeof Data == typeof '' )
				Data = StringToBytes(Data);
			
			Debug(`Dref data; ${Data}`);
			let Size = 4+4+1+3+Data.length+1;
			DataWriter.Write32( Size );
			const Type = 'url\0';
			DataWriter.WriteStringAsBytes(Type);
			const Version = 0;
			const Flag_SelfReference = 0x1;	//	data is in same file as movie atom
			const Flags = 0;//Flag_SelfReference;
			
			DataWriter.Write8(Version);
			DataWriter.Write24(Flags);
			
			DataWriter.WriteBytes( Data );
			//	terminator
			DataWriter.Write8(0);
		}
	}
}

class Atom_Minf_Video extends Atom_t
{
	constructor()
	{
		super('minf');
		
		this.vmhd = new Atom_Vmhd();
		this.ChildAtoms.push(this.vmhd);
		//this.hdlr = new Atom_Hdlr();
		//this.ChildAtoms.push(this.hdlr);
		
		this.dinf = new Atom_Dinf();
		this.ChildAtoms.push(this.dinf);
		this.dinf.AddData(0,'Hello!');

		this.stbl = new Atom_Stbl();
		this.ChildAtoms.push(this.stbl);
	}
}

class Atom_Vmhd extends Atom_t
{
	constructor()
	{
		super('vmhd');
		
		this.Version = 0;
		const Flag_NoLeanAhead = 1<<0;
		this.Flags = Flag_NoLeanAhead;
		
		//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap4/qtff4.html#//apple_ref/doc/uid/TP40000939-CH206-18741
		const GraphicsMode_Copy = 0;
		this.GraphicsMode = GraphicsMode_Copy;
		this.OpColour = [0,0,0];
	}
	
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		DataWriter.Write16(this.GraphicsMode);
		DataWriter.Write16(this.OpColour[0]);
		DataWriter.Write16(this.OpColour[1]);
		DataWriter.Write16(this.OpColour[2]);
	}
}

class Atom_Stbl extends Atom_t
{
	constructor()
	{
		super('stbl');
		this.ChildAtoms.push( new Atom_Stsd() );
		this.ChildAtoms.push( new Atom_Stts() );
		this.ChildAtoms.push( new Atom_Stsc() );
		this.ChildAtoms.push( new Atom_Stsz() );
		this.ChildAtoms.push( new Atom_Stco() );
	}
}


function GetSampleDescriptionExtensionType(Fourcc)
{
	switch ( Fourcc )
	{
		//	improve naming of this!
		case 'avc1':	return VideoSampleDescription;
		
		//	extensions
		case Atom_SampleDescriptionExtension_Avcc.Fourcc:	return Atom_SampleDescriptionExtension_Avcc;
		case Atom_SampleDescriptionExtension_Btrt.Fourcc:	return Atom_SampleDescriptionExtension_Btrt;
		case Atom_SampleDescriptionExtension_Pasp.Fourcc:	return Atom_SampleDescriptionExtension_Pasp;

		case Atom_SampleDescriptionExtension_tx3g.Fourcc:	return Atom_SampleDescriptionExtension_tx3g;

		default:
			return Atom_t;
	}
}


//	bit rate meta
class Atom_SampleDescriptionExtension_Btrt extends Atom_t
{
	static get Fourcc()	{	return 'btrt';	}
	constructor()
	{
		super( Atom_SampleDescriptionExtension_Btrt.Fourcc );
		this.Data = 
		[
			0x00, 0x1c, 0x9c, 0x80, // bufferSizeDB
			0x00, 0x2d, 0xc6, 0xc0, // maxBitrate
			0x00, 0x2d, 0xc6, 0xc0 // avgBitrate
		];
	}
	
}

export class Atom_SampleDescriptionExtension_Avcc extends Atom_t
{
	static get Fourcc()	{	return 'avcC';	}

	constructor()
	{
		super( Atom_SampleDescriptionExtension_Avcc.Fourcc );
		
		this.Version = 1;

		//const Sps = [/*0,0,0,1,*/39,66,0,30,171,64,80,30,200];
		//const Pps = [/*0,0,0,1,*/40,206,60,48];
		//this.SpsDatas = [Sps];
		//this.PpsDatas = [Pps];
		this.SpsDatas = [];
		this.PpsDatas = [];
		this.NaluSize = 4;
	}
	
	EncodeData(DataWriter)
	{
		if ( this.SpsDatas.length == 0 || this.PpsDatas.length == 0 )
			throw `Missing SPS and/or PPS`;
			 
		DataWriter.Write8(this.Version);
		
		const Sps0 = this.SpsDatas[0];
		DataWriter.Write8( Sps0[1] );
		DataWriter.Write8( Sps0[2] );
		DataWriter.Write8( Sps0[3] );
		
		let NaluSizeByte = (this.NaluSize-1)&0x3;
		NaluSizeByte |= 0xFC;	//	other 6 bytes reserved, must be 1
		DataWriter.Write8(NaluSizeByte);
		
		let NumberOfSps = (this.SpsDatas.length & 0x1f);
		NumberOfSps |= 	0xE0;	//	reserved bytes, must be 1
		DataWriter.Write8(NumberOfSps);
		
		for ( let Sps of this.SpsDatas )
		{
			DataWriter.Write16( Sps.length );
			DataWriter.WriteBytes( Sps );
		}
		
		let NumberOfPps = (this.PpsDatas.length & 0x1f);
		DataWriter.Write8(NumberOfPps);
		for ( let Pps of this.PpsDatas )
		{
			DataWriter.Write16( Pps.length );
			DataWriter.WriteBytes( Pps );
		}
	}
	
	//	is different to Read()? (no atom headers etc)
	async DecodeData(Bytes)
	{
		const Reader = new DataReader(Bytes);
		this.Version = await Reader.Read8();
		
		//	[1,2,3] of sps0 is here (for simple profile & level access)
		const Sps0Copy = await Reader.ReadBytes(3);
		
		const NaluSizeAndReserved = await Reader.Read8();
		const Reserved0xFC = NaluSizeAndReserved & 0xfc;
		this.NaluSize = (NaluSizeAndReserved & ~0xfc) + 1;
		
		const NumberOfSpsAndReserved = await Reader.Read8();
		const Reserved0xE0 = NumberOfSpsAndReserved & 0xe0;
		const NumberOfSps = NumberOfSpsAndReserved & 0x1f;
		for ( let s=0;	s<NumberOfSps;	s++ )
		{
			const SpsSize = await Reader.Read16();
			const Sps = await Reader.ReadBytes(SpsSize);
			this.SpsDatas.push( Sps );
		}

		const NumberOfPpsAndReserved = await Reader.Read8();
		const NumberOfPps = NumberOfPpsAndReserved & 0x1f;
		for ( let p=0;	p<NumberOfPps;	p++ )
		{
			const PpsSize = await Reader.Read16();
			const Pps = await Reader.ReadBytes(PpsSize);
			this.PpsDatas.push( Pps );
		}
	}
}



class Atom_SampleDescriptionExtension_Pasp extends Atom_t
{
	static get Fourcc()	{	return 'pasp';	}
	constructor()
	{
		super( Atom_SampleDescriptionExtension_Pasp.Fourcc );
		this.Data = [0x00,0x00,0x00,0x01,	0x00,0x00,0x00,0x01,	0x00,0x00,0x00,0x01	];
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.WriteBytes( this.Data );
	}
}


export class Atom_SampleDescriptionExtension_tx3g extends Atom_t
{
	static get Fourcc()	{	return 'tx3g';	}

	constructor()
	{
		super( Atom_SampleDescriptionExtension_tx3g.Fourcc );
	}
	
	EncodeData(DataWriter)
	{
		throw `todo`;
	}
	
	//	is different to Read()? (no atom headers etc)
	async DecodeData(Bytes)
	{
		const Reader = new DataReader(Bytes);
		
		this.DisplayFlags = await Reader.Read32();
		
		const Vertical = 0x20000000;
		const SomeForced = 0x40000000;
		const AllForced = 0x80000000;
		
		const Reserved1 = await Reader.Read8();
		if ( Reserved1 != 1 )
			Debug(`tx3g atom reserved1(${Reserved1})!=1`);

		const ReservedMinus1 = await Reader.Read8();
		if ( ReservedMinus1 != 0xff )
			Debug(`tx3g atom ReservedMinus1(${ReservedMinus1})!=0xff`);

		const Reserved0 = await Reader.Read32();
		if ( Reserved0 != 0 )
			Debug(`tx3g atom Reserved0(${Reserved0})!=0`);

		//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-SW81
		//	Default text box
		//	A 64-bit rectangle that specifies an area to receive text
		//	(each 16 bits indicate top, left, bottom, and right,
		//	respectively) within the subtitle track. This rectangle must
		//	fill the track header dimensions exactly; that is, top is 0,
		//	left is 0, bottom is the height of the subtitle track header,
		//	and right is the width of the subtitle track header.
		//	See Subtitle Track Header Size and Placement.
		this.RectTop = await Reader.Read16();
		this.RectLeft = await Reader.Read16();
		this.RectBottom = await Reader.Read16();
		this.RectRight = await Reader.Read16();

		const Reserved00 = await Reader.Read32();
		if ( Reserved00 != 0 )
			Debug(`tx3g atom Reserved00(${Reserved00})!=0`);

		this.FontIdentifier = await Reader.Read16();
		this.FontStyleFlags = await Reader.Read8();	//	called FontFace in docs
		const Bold = 0x0001;
		const Italic = 0x0002;
		const Underline = 0x0004;

		//	An 8-bit value that should always be 0.05 multiplied by the video track header height. For example, if the video track header is 720 points in height, this should be 36 (points). This size should be used in the default style record and in any per-sample style records. If a subtitle does not fit in the text box, the subtitle media handler may choose to shrink the font size so that the subtitle fits.
		this.FontSize = await Reader.Read8();
		
		this.ForegroundRgba = await Reader.Read32();
	}
}


class VideoSampleDescription
{
	constructor()
	{
		this.Version = 0;
		this.RevisionLevel = 0;
		this.Vendor = '\0\0\0\0';
		
		this.SpatialQuality = 0;
		this.TemporalQuality = 0;	//	0..1
		this.FramesPerSample = 1;
		this.PixelWidth = 640;
		this.PixelHeight = 480;
		
		this.FramesPerSample = 1;

		this.Compressor = 'The Compressor';
		
		//	A 16-bit integer that indicates the pixel depth of the compressed image. Values of 1, 2, 4, 8 ,16, 24, and 32 indicate the depth of color images. The value 32 should be used only if the image contains an alpha channel. Values of 34, 36, and 40 indicate 2-, 4-, and 8-bit grayscale, respectively, for grayscale images.
		this.ColourDepth = 24;
		//	gr 0x1111 is -1?!
		this.ColourTableId = 0x1111;//0xffff;	//	ignored if 24 bit. -1= default table
		
		this.ExtensionAtoms = [];
		
		//	gr: now explicitly add sps & pps data,which creates the avcc header
		//this.ExtensionAtoms.push( new Atom_SampleDescriptionExtension_Avcc() );
		//	if I delete this from a valid file, quicktime doesnt play it
		//this.ExtensionAtoms.push( new Atom_SampleDescriptionExtension_Pasp() );
		//this.ExtensionAtoms.push( new Atom_SampleDescriptionExtension_Btrt() );
	}
	
	AddAvcc(Sps,Pps)
	{
		const Avcc = new Atom_SampleDescriptionExtension_Avcc();
		//	do any NALU detection/stripping here
		Avcc.SpsDatas.push( Sps );
		Avcc.SpsDatas.push( Pps );
		this.ExtensionAtoms.push( Avcc );
	}
	
	GetChildAtom(Fourcc)
	{
		const Matches = this.ExtensionAtoms.filter( a => a.Fourcc == Fourcc );
		if ( Matches.length == 0 )
			return null;
		if ( Matches.length > 1 )
			throw `More than one(x${Matches.length}) child ${Fourcc}} atom found`;
		return Matches[0];
	}	
	
	EncodeData(DataWriter)
	{
		if ( this.Vendor.length != 4 )
			throw `Vendor(${this.Vendor}) needs to be 4 chars`;
			
		DataWriter.Write16(this.Version);
		DataWriter.Write16(this.RevisionLevel);
		DataWriter.WriteStringAsBytes(this.Vendor);
		
		//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-74522
		//	note: docs actually specify 1023 and 1024!
		const TemporalQuality = this.TemporalQuality * 1023;
		DataWriter.Write32(TemporalQuality);
		const SpatialQuality = this.SpatialQuality * 1024;
		DataWriter.Write32(SpatialQuality);
		
		DataWriter.Write16(this.PixelWidth);
		DataWriter.Write16(this.PixelHeight);
		
		const HorizontalResolution = 72<<16;//	pixels per inch 32bit fixed point
		const VerticalResolution = 72<<16;//	pixels per inch 32bit fixed point
		DataWriter.Write32(HorizontalResolution);
		DataWriter.Write32(VerticalResolution);

		const DataSize = 0;	//	"A 32-bit integer that must be set to 0."
		DataWriter.Write32(DataSize);
		DataWriter.Write16(this.FramesPerSample);

		//	compressor needs to be 32-byte
		//	but it's a pascal string so first byte is length
		let CompressorLength = Math.min( 31, this.Compressor.length );
		let Compressor = this.Compressor.substring(0,31).padEnd(31,'\0');	//	pad with terminators
		DataWriter.Write8(CompressorLength);
		DataWriter.WriteStringAsBytes(Compressor);

		DataWriter.Write16(this.ColourDepth);
		DataWriter.Write16(this.ColourTableId);
		//	todo: write colour table if depth != 16,24,32 or -1 (default table)

		//	write extensions
		for ( let Extension of this.ExtensionAtoms )
		{
			const Data = Extension.Encode();
			DataWriter.WriteBytes(Data);
		}
	}
	
	async DecodeData(Bytes)
	{
		const Reader = new AtomDataReader(Bytes);
		
		//	see https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-74522
		this.Version = await Reader.Read16();
		this.RevisionLevel = await Reader.Read16();
		this.Vendor = await Reader.ReadString(4);
		this.TemporalQuality = await Reader.Read32() / 1023;
		this.SpatialQuality = await Reader.Read32() / 1024;
		this.PixelWidth = await Reader.Read16();
		this.PixelHeight = await Reader.Read16();
		//	72ppi shifted
		this.HorizontalResolution = await Reader.Read32() >> 16; 
		this.VerticalResolution = await Reader.Read32() >> 16;
		
		//	gr: not the following data size;
		//	"A 32-bit integer that must be set to 0."
		const DataSize = await Reader.Read32();
		if ( DataSize != 0 )
			throw `Unexpected non-zero data size in ${this.Fourcc} atom`;

		this.FramesPerSample = await Reader.Read16();
		//	apple docs say this is 32-byte pascal string
		//	so still has length at the start (so 31, which seems to align)
		const CompressorStringLength = await Reader.Read8();
		//this.Compressor = await Reader.ReadString(CompressorStringLength);
		this.Compressor = await Reader.ReadString(31);
		this.ColourDepth = await Reader.Read16();
		this.ColourTableId = await Reader.Read16();

		//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-74522
		//	If the color table ID is set to 0, a color table is contained within
		//	the sample description itself. The color table immediately follows 
		//	the color table ID field in the sample description. 
		//	See Color Table Atoms for a complete description of a color table.
		if ( this.ColourTableId == 0 )
		{
			//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap2/qtff2.html#//apple_ref/doc/uid/TP40000939-CH204-25533
			//	Size 32-bit integer that specifies the number of bytes in this color table atom.
			//	Type A 32-bit integer that identifies the atom type; this field must be set to 'ctab'.
			//	Color table seed A 32-bit integer that must be set to 0.
			//	Color table flags A 16-bit integer that must be set to 0x8000.
			//	Color table size A 16-bit integer that indicates the number of colors in the following color array. This is a zero-relative value; setting this field to 0 means that there is one color in the array.
			//	Color array An array of colors. Each color is made of four unsigned 16-bit integers. The first integer must be set to 0, the second is the red value, the third is the green value, and the fourth is the blue value.
			//	gr: the data here is lots of zeros, it does NOT contain 
			//	an atom CTAB, 0x8000 flags
			//	"This is a zero-relative value; setting this field to 0 means that there is one color in the array."
			let ColourTableSize = await Reader.Read16();
			ColourTableSize += 1;
			for ( let c=0;	c<ColourTableSize;	c++ )
			{
				let ZeroRedGreenBlue = await Reader.ReadBytes(4);
			}
		}
		
		try
		{
			//	remaining data is blocks of extension atoms
			while ( Reader.BytesRemaining )
			{
				const ExtensionAtom = await Reader.ReadNextAtom(GetSampleDescriptionExtensionType);
				//	decode self
				if ( ExtensionAtom.DecodeData )
					await ExtensionAtom.DecodeData( ExtensionAtom.Data );
				//Debug(`Atom ${this.Fourcc} found extension ${ExtensionAtom.Fourcc}`);
				this.ExtensionAtoms.push( ExtensionAtom );
			}
		}
		catch(e)
		{
			Warning(`Error parsing VideoSampleDescription extensions; ${e}`);
		}
	}
}

class Atom_Stsd extends Atom_t
{
	constructor()
	{
		super('stsd');
		
		this.Version = 0;
		this.Flags = 0;
		this.SampleDescriptions = [];
		
		const Avc1Data = new VideoSampleDescription();
		this.PushSampleDescription('avc1',0,Avc1Data);
	}
	
	PushSampleDescription(Name,DataReferenceIndex,Data)
	{
		if ( Name.length != 4 )
			throw `Expecting sample description name (${Name}) to be 4 chars (fourcc)`;
		const Description = {};
		Description.Name = Name;
		Description.DataReferenceIndex = DataReferenceIndex;
		Description.Data = Data;
		this.SampleDescriptions.push(Description);
	}
		
	EncodeData(Writer)
	{
		Writer.Write8(this.Version);
		Writer.Write24(this.Flags);
		Writer.Write32(this.SampleDescriptions.length);

		//	now write each sample
		for ( let Description of this.SampleDescriptions )
		{
			//	bake data
			let Data = Description.Data;
			//	if the data is an atom, encode it
			//if ( Data instanceof Atom_t )
			if ( typeof Data == typeof {} && Data.Encode )
			{
				Data = Data.Encode();
			}
			if ( typeof Data == typeof {} && Data.EncodeData )
			{
				const SubWriter = new DataWriter();
				Data.EncodeData(SubWriter);
				Data = SubWriter.GetData();
			}
			
			//	https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-74522
			//	When parsing sample descriptions in the stsd atom, be aware of the sample description size value in order to read each table entry correctly. Some sample descriptions terminate with four zero bytes that are not otherwise indicated.
			//	Note: Some video sample descriptions contain an optional 4-byte terminator with all bytes set to 0, 
			//	following all other sample description and sample description extension data. If this optional terminator is present, the sample description size value will include it. 
			//	It is important to check the sample description size when parsing: more than or fewer than these four optional bytes, if present in the size value, indicates a malformed sample description
			let DataSize = Data.length;
			const Last4 = Data.slice(-4);
			if ( Last4[0]+Last4[1]+Last4[2]+Last4[3] == 0 )
				DataSize -= 4;
				
			DataSize += 4;	//	size
			DataSize += Description.Name.length;	//	fourcc so always 4
			DataSize += 6;	//	reserved 6
			DataSize += 2;	//	16bit datareference index
			
			Writer.Write32(DataSize);
			Writer.WriteStringAsBytes(Description.Name);
			Writer.WriteBytes( new Uint8Array(6) );	//	reserved
			//	indexes starting at 1?
			Writer.Write16( Description.DataReferenceIndex+1 );
			Writer.WriteBytes( Data );
			
		}
	}
	
	static async Read(AnonymousAtom,EnumChildAtom)
	{
		const Reader = new AtomDataReader(AnonymousAtom.Data,AnonymousAtom.DataFilePosition);
		const Atom = new Atom_Stsd(AnonymousAtom);
		Atom.Version = await Reader.Read8();
		Atom.Flags = await Reader.Read24();
		Atom.SampleDescriptionCount = await Reader.Read32();
		
		for ( let s=0;	s<Atom.SampleDescriptionCount;	s++ )
		{
			const ExtensionSize = await Reader.Read32();
			const ExtensionFourcc = await Reader.ReadString(4);
			const ExtensionAtomType = GetSampleDescriptionExtensionType( ExtensionFourcc );
			
			const SampleDescriptionAtom = new ExtensionAtomType();
			SampleDescriptionAtom.Size = ExtensionSize;
			SampleDescriptionAtom.Fourcc = ExtensionFourcc;
			SampleDescriptionAtom.Zero6 = await Reader.ReadBytes(6);
			SampleDescriptionAtom.DataReferenceIndex = await Reader.Read16();
			
			//	see EncodeData() for some more magic numbers/caveats
			//	size - header read above
			let DataSize = SampleDescriptionAtom.Size;
			DataSize -= 4;	//	size
			DataSize -= 4;	//	fourcc
			DataSize -= 6;	//	reserved 6
			DataSize -= 2;	//	16bit datareference index

			const Data = await Reader.ReadBytes(DataSize);
			if ( SampleDescriptionAtom.DecodeData )
				await SampleDescriptionAtom.DecodeData(Data);
			else
				SampleDescriptionAtom.Data = Data;

			Atom.ChildAtoms.push(SampleDescriptionAtom);
			if ( EnumChildAtom )
				EnumChildAtom(SampleDescriptionAtom);
		}
		
		return Atom;
	}
}


class Atom_Stts extends Atom_t
{
	constructor()
	{
		super('stts');
		
		this.Version = 0;
		this.Flags = 0;
	}
		
	EncodeData(Writer)
	{
		Writer.Write8(this.Version);
		Writer.Write24(this.Flags);
		
		
		const EntryCount = 0;
		Writer.Write32(EntryCount);
	}
}

class Atom_Stsc extends Atom_t
{
	constructor()
	{
		super('stsc');
		
		this.Version = 0;
		this.Flags = 0;
	}
		
	EncodeData(Writer)
	{
		Writer.Write8(this.Version);
		Writer.Write24(this.Flags);
		
		const EntryCount = 0;
		Writer.Write32(EntryCount);
	}
}

class Atom_Stsz extends Atom_t
{
	constructor()
	{
		super('stsz');
		
		this.Version = 0;
		this.Flags = 0;
		this.SampleSizes = [];
	}
		
	EncodeData(Writer)
	{
		Writer.Write8(this.Version);
		Writer.Write24(this.Flags);
		
		const AllSameSizes = this.SampleSizes.every( v => v==this.SampleSizes[0] );
		const FixedSize = AllSameSizes ? (this.SampleSizes[0] || 0) : 0
		Writer.Write32( FixedSize );
		Writer.Write32( this.SampleSizes.length );

		if ( AllSameSizes )
			return;

		throw `todo; write sample sizes (24 or 32 bit)`;
	}
}

class Atom_Stco extends Atom_t
{
	constructor()
	{
		super('stco');
		
		this.Version = 0;
		this.Flags = 0;
	}
		
	EncodeData(Writer)
	{
		Writer.Write8(this.Version);
		Writer.Write24(this.Flags);
		
		const EntryCount = 0;
		Writer.Write32(EntryCount);
	}
}

class Atom_Mvhd extends Atom_t
{
	constructor()
	{
		super('mvhd');
		
		this.Version = 0;
		this.Flags = 0;
		this.CreationTime = new Date();
		this.ModificationTime = new Date();
		this.TimeScale = 1000; 
		this.DurationMs = 2*1000;
		this.PreferedRate = 0;
		this.PreferedVolume = 0;	//	8.8 fixed
		this.Reserved = new Uint8Array(10);
		this.Matrix = CreateMatrix(1,0,0,	0,1,0,	0,0,1);
		this.PreviewTime = 0;
		this.PreviewDuration = 0;
		this.PosterTime = 0;
		this.SelectionTime = 0;
		this.SelectionDuration = 0;
		this.CurrentTime = 0;
		this.NextTrackId = 0;
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		
		const CreationTime = GetSecondsSinceMidnightJan1st1904(this.CreationTime);
		const ModificationTime = GetSecondsSinceMidnightJan1st1904(this.ModificationTime);
		
		GetDateTimeFromSecondsSinceMidnightJan1st1904
		
		if ( this.Version == 0 )
		{
			DataWriter.Write32(CreationTime);
			DataWriter.Write32(ModificationTime);
			DataWriter.Write32(this.TimeScale);
			const Duration = this.DurationMs / 1000 / this.TimeScale;
			DataWriter.Write32(Duration);
		}
		else if ( this.Version == 1 )
		{
			DataWriter.Write64(CreationTime);
			DataWriter.Write64(ModificationTime);
			DataWriter.Write32(this.TimeScale);
			const Duration = this.DurationMs / 1000 / this.TimeScale;
			DataWriter.Write64(Duration);
		}
		else
			throw `unkown MVHD version ${this.Version}`;
			
		DataWriter.Write32(this.PreferedRate);
		DataWriter.Write16(this.PreferedVolume);
		DataWriter.WriteBytes(this.Reserved);
		DataWriter.WriteBytes(this.Matrix);
		DataWriter.Write32(this.PreviewTime);
		DataWriter.Write32(this.PreviewDuration);
		DataWriter.Write32(this.PosterTime);
		DataWriter.Write32(this.SelectionTime);
		DataWriter.Write32(this.SelectionDuration);
		DataWriter.Write32(this.CurrentTime);
		DataWriter.Write32(this.NextTrackId);
	}
}
	
class Atom_Ftyp extends Atom_t
{
	constructor()
	{
		super('ftyp');
		
		//	gr: get the proper version info etc
		this.MajorBrand = 'isom';
		this.MajorVersion = 1;
		//this.CompatibleBrands = ['isom','iso2','avc1','iso6','mp41'];
		this.CompatibleBrands = ['avc1'];
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.WriteStringAsBytes(this.MajorBrand);
		DataWriter.Write32(this.MajorVersion);
		for ( let Type of this.CompatibleBrands )
		{
			DataWriter.WriteStringAsBytes(Type);
		}
	}
}

class Atom_Free extends Atom_t
{
	constructor()
	{
		super('free');
	}
}

class Atom_Mfhd extends Atom_t
{
	constructor(SequenceNumber=0)
	{
		super('mfhd');
		this.Version = 0;
		this.Flags = 0;
		this.SequenceNumber = SequenceNumber;
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		DataWriter.Write32(this.SequenceNumber);
	}
}

class Atom_Moof extends Atom_t
{
	constructor(SequenceNumber)
	{
		super('moof');
		
		this.mfhd = new Atom_Mfhd(SequenceNumber);
		this.ChildAtoms.push(this.mfhd);
	}
}


class Atom_Traf extends Atom_t
{
	constructor(TrackId)
	{
		super('traf');
		
		this.Tfhd = new Atom_Tfhd(TrackId);
		this.Tfdt = new Atom_Tfdt();
		this.Trun = new Atom_Trun();
		this.ChildAtoms.push(this.Tfhd);
		this.ChildAtoms.push(this.Tfdt);
		this.ChildAtoms.push(this.Trun);
	}

	set BaseMediaDecodeTime(Value)
	{
		this.Tfdt.BaseMediaDecodeTime = Value;
	}
	
	AddSample(Sample)
	{
		this.Trun.AddSample(...arguments);
	}
}

class Atom_Mdat extends Atom_t
{
	constructor()
	{
		super('mdat');
		this.Datas = [];
	}
	
	PushData(Data)
	{
		//	gr: I was going to enforce data being bytes, but
		//		maybe should natively support subtitles
		if ( typeof Data == typeof '' )
			Data = StringToBytes(Data);
			
		//	get position before we add this new data
		const JoinedData = JoinTypedArrays(this.Datas);
		this.Datas.push(Data);
		return JoinedData.length;
	}
	
	EncodeData(DataWriter)
	{
		this.Datas.forEach( d => DataWriter.WriteBytes(d) );
	}
}

class Atom_Tfdt extends Atom_t
{
	constructor(CopyAtom)
	{
		super('tfdt',CopyAtom);
		
		this.Version = 0;
		this.Flags = 0;
		this.BaseMediaDecodeTime = 0;
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		
		if ( this.Version == 0 )
			DataWriter.Write32(this.BaseMediaDecodeTime);
		else
			DataWriter.Write64(this.BaseMediaDecodeTime);
	}
	
	static async Read(AnonymousAtom)
	{
		const Reader = new AtomDataReader(AnonymousAtom.Data,AnonymousAtom.DataFilePosition);
		const Atom = new Atom_Tfdt(AnonymousAtom);
		Atom.Version = await Reader.Read8();
		Atom.Flags = await Reader.Read24();
		
		if ( Atom.Version == 0 )
		{
			Atom.BaseMediaDecodeTime = await Reader.Read32();
		}
		else
		{
			Atom.BaseMediaDecodeTime = await Reader.Read64();
		}
		return Atom;
	}
}

		const TfhdFlag_HasBaseDataOffet = 1<<0;
		const TfhdFlag_HasSampleDescriptionIndex = 1<<1;
		const TfhdFlag_Unknown2 = 1<<2;
		const TfhdFlag_HasSampleDuration = 1<<3;
		const TfhdFlag_HasSampleSize = 1<<4;
		const TfhdFlag_HasSampleFlags = 1<<5;
		const TfhdFlag_DurationIsEmpty = 1<<16;
		const TfhdFlag_DefaultBaseIsMoof = 1<<17;


class Atom_Tfhd extends Atom_t
{
	constructor(TrackId)
	{
		super('tfhd');
		this.Version = 0;
		this.Flags = 0;
		this.TrackId = TrackId;
		/*
		this.Flags |= TfhdFlag_HasBaseDataOffet;
		this.Flags |= TfhdFlag_HasSampleDuration;
		this.Flags |= TfhdFlag_HasSampleSize;
		this.Flags |= TfhdFlag_HasSampleFlags;
		*/
		//	defaults if flag not set
		this.BaseDataOffset = 0;
		this.SampleDescriptionIndex = 0;
		this.DefaultSampleDuration = 1;
		this.DefaultSampleSize = 0;//0x000020C3;
		this.DefaultSampleFlags = 0;//0x01010000;
	}
	
	HasFlag(Flag)
	{
		return (this.Flags & Flag)!=0;
	}
	
	static async Read(AnonymousAtom)
	{
		if ( this.TrackId == 0 )
			throw `TrackId not set in TFHD (ffmpeg/libav/ffprobe wont parse without this correct)`;
			
		const Reader = new AtomDataReader(AnonymousAtom.Data,AnonymousAtom.DataFilePosition);
		const Atom = new Atom_Tfhd(AnonymousAtom);
		Atom.Version = await Reader.Read8();
		Atom.Flags = await Reader.Read24();
		Atom.TrackId = await Reader.Read32();
	
		//	http://178.62.222.88/mp4parser/mp4.js
		if ( Atom.HasFlag(TfhdFlag_HasBaseDataOffet) )
			Atom.BaseDataOffset = await Reader.Read64();	//	unsigned
		
		if ( Atom.HasFlag(TfhdFlag_HasSampleDescriptionIndex))
			Atom.SampleDescriptionIndex = await Reader.Read32();

		if ( Atom.HasFlag(TfhdFlag_HasSampleDuration))
			Atom.DefaultSampleDuration = await Reader.Read32();
		
		if ( Atom.HasFlag(TfhdFlag_HasSampleSize))
			Atom.DefaultSampleSize = await Reader.Read32();
		
		if ( Atom.HasFlag(TfhdFlag_HasSampleFlags))
			Atom.DefaultSampleFlags = await Reader.Read32();

		return Atom;
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		DataWriter.Write32(this.TrackId);

		if ( this.HasFlag(TfhdFlag_HasBaseDataOffet) )
			DataWriter.Write64(this.BaseDataOffset);	//	unsigned
		
		if ( this.HasFlag(TfhdFlag_HasSampleDescriptionIndex))
			DataWriter.Write32(this.SampleDescriptionIndex);
		
		if ( this.HasFlag(TfhdFlag_HasSampleDuration))
			DataWriter.Write32(this.DefaultSampleDuration);
		
		if ( this.HasFlag(TfhdFlag_HasSampleSize))
			DataWriter.Write32(this.DefaultSampleSize);
		
		if ( this.HasFlag(TfhdFlag_HasSampleFlags))
			DataWriter.Write32(this.DefaultSampleFlags);
		
	}
}

class Atom_Trun extends Atom_t
{
	constructor()
	{
		super('trun');
		this.Version = 0;
		this.Flags = 0;
		
		this.MoofSize = null;	//	null if not set
		
		this.Samples = [];
		
		//	setup flags
		this.Flags |= 1<<TrunFlags.DataOffsetPresent;
		this.Flags |= 1<<TrunFlags.SampleSizePresent;
		this.Flags |= 1<<TrunFlags.SampleDurationPresent;
		this.Flags |= 1<<TrunFlags.SampleFlagsPresent;
	}
	
	AddSample(Sample,MdatPosition)
	{
		Sample.MdatPosition = MdatPosition;
		this.Samples.push(Sample);
	}
	
	EncodeData(DataWriter)
	{
		DataWriter.Write8(this.Version);
		DataWriter.Write24(this.Flags);
		
		const EntryCount = this.Samples.length;
		DataWriter.Write32(EntryCount);
		
		const Flags = this.Flags;
		function IsFlagBit(Bit)	{ return (Flags & (1 << Bit)) != 0; };
		
		const SampleSizePresent = IsFlagBit(TrunFlags.SampleSizePresent);
		const SampleDurationPresent = IsFlagBit(TrunFlags.SampleDurationPresent);
		const SampleFlagsPresent = IsFlagBit(TrunFlags.SampleFlagsPresent);
		const SampleCompositionTimeOffsetPresent = IsFlagBit(TrunFlags.SampleCompositionTimeOffsetPresent);
		const FirstSampleFlagsPresent = IsFlagBit(TrunFlags.FirstSampleFlagsPresent);
		const DataOffsetPresent = IsFlagBit(TrunFlags.DataOffsetPresent);


		if ( DataOffsetPresent )
		{
			let DataOffsetFromMoof = (this.MoofSize||0);
			DataOffsetFromMoof += 8;	//	from analysing existing... this must be size+fourcc of mdat, or moof
			DataOffsetFromMoof += this.Samples[0].MdatPosition;
			DataWriter.Write32(DataOffsetFromMoof);
		}
		
		if ( FirstSampleFlagsPresent )
		{
			const FirstSampleFlags = 0;
			DataWriter.Write32(FirstSampleFlags);
		}

		const Header = {};
		Header.TimeScale = 1.0 / 15333.4;
		
		function MsToTime(TimeMs)
		{
			let Timef = TimeMs / 1000.0;
			let TimeUnit = Timef / Header.TimeScale;
			return Math.floor(TimeUnit);
		};
		
		//	may need to do some time conversion		
		//let CurrentTime = (Header.DecodeTime!==undefined) ? Header.DecodeTime : 0;
		
		//for ( let Sample of this.Samples )
		let LastDuration = 1;
		for ( let s=0;	s<this.Samples.length;	s++ )
		{
			const Sample = this.Samples[s];
			let NextSampleTime;
			if ( s == this.Samples.length-1 )
			{
				NextSampleTime = Sample.DecodeTimeMs + LastDuration;
			}
			else
			{
				NextSampleTime = this.Samples[s+1].DecodeTimeMs;
			}
			const DurationMs = NextSampleTime - Sample.DecodeTimeMs;
			
			if ( SampleDurationPresent )
				DataWriter.Write32(DurationMs);
			if ( SampleSizePresent )
				DataWriter.Write32(Sample.Size);
			if ( SampleFlagsPresent )
			{
				//Debug(`Sample ${Sample.DecodeTimeMs}ms Flags: 0x${Sample.Flags.toString(16)}`);
				DataWriter.Write32(Sample.Flags);
			}
			if ( SampleCompositionTimeOffsetPresent )
				DataWriter.Write32(Sample.CompositionTimeOffset);
		}
	}
}

export class Mp4FragmentedEncoder
{
	constructor()
	{
		//	gr: currently not stitching moofs together properly. only one works.
		this.BakeFrequencyMs = 5*1000;
		this.LastMoofSequenceNumber = 0;
		this.Ftyp = null;
		this.Moov = null;	//	if non-null it's been written
		
		this.TrackSps = {};	//	[trackid]=sps
		this.TrackPps = {};	//	[trackid]=sps
		
		this.RootAtoms = [];
		
		this.EncodedAtomQueue = new PromiseQueue('Mp4FragmentedEncoder.EncodedAtomQueue');
		this.EncodedDataQueue = new PromiseQueue('Mp4FragmentedEncoder.EncodedDataQueue');
		this.PendingSampleQueue = new PromiseQueue('Mp4FragmentedEncoder.PendingSampleQueue');
		
		this.PendingTracks = {};	//	[TrackId]
		
		this.EncodeThreadPromise = this.EncodeThread();
		this.EncodeThreadPromise.catch(this.OnError.bind(this));
	}
	
	OnError(Error)
	{
		//	make queues fail
		Warning(`Mp4 encode thread error ${Error}`);
		this.EncodedAtomQueue.Reject(Error);
		this.EncodedDataQueue.Reject(Error);
	}
	
	async WaitForNextEncodedBytes()
	{
		return this.EncodedDataQueue.WaitForNext();
	}
	
	async WaitForNextAtom()
	{
		return this.EncodedAtomQueue.WaitForNext();
	}
	
	async PushExtraData(Data,TrackId)
	{
		//	todo: async because of DataReader in DecodeData
		//		maybe this needs to be inserted as some job that needs to complete before
		//		tracks are baked, could easily get a race condition
		//	this function should be synchronous from the outside
		//	insert as a sps/pps
		//	parse
		const Atom = new Atom_SampleDescriptionExtension_Avcc();
		
		await Atom.DecodeData(Data);
		this.TrackSps[TrackId] = Atom.SpsDatas[0];
		this.TrackPps[TrackId] = Atom.PpsDatas[0];
	}
	
	PushSample(Data,DecodeTimeMs,PresentationTimeMs,TrackId)
	{
		//Debug(`PushSample DecodeTimeMs=${DecodeTimeMs}ms TrackId=${TrackId}`);
		if ( !Number.isInteger(TrackId) || TrackId <= 0 )
			throw `Sample track id must be a positive integer and above zero`;

		//	hack! update SPS && PPS for each track
		//	would be better to keep this in the samples, then filter out?
		//	but we do need to hold onto them in case theyre not provided regularly...(or do we?)
		const ContentType = H264.GetNaluType(Data);
		if ( ContentType == H264.ContentTypes.SPS )
			this.TrackSps[TrackId] = Data.slice(4);
		if ( ContentType == H264.ContentTypes.PPS )
			this.TrackPps[TrackId] = Data.slice(4);

		Data = H264.Nalu4ToAnnexB(Data);
		if ( !Data )
			return;

		const Sample = new Sample_t();
		Sample.Data = Data;
		Sample.DecodeTimeMs = DecodeTimeMs;
		Sample.PresentationTimeMs = PresentationTimeMs;
		Sample.TrackId = TrackId;
		Sample.DurationMs = 33;
		Sample.IsKeyframe = H264.IsContentTypeKeyframe(ContentType);
		
		this.PendingSampleQueue.Push(Sample);
	}
	
	PushEndOfFile()
	{
		this.PendingSampleQueue.Push(EndOfFileMarker);
	}
	
	GetPendingTrack(TrackId)
	{
		if ( !this.PendingTracks.hasOwnProperty(TrackId) )
			this.PendingTracks[TrackId] = new PendingTrack_t();
		return this.PendingTracks[TrackId];
	}
	
	
	PushAtom(Atom)
	{
		this.RootAtoms.push(Atom);
		this.EncodedAtomQueue.Push(Atom);
			
		const EncodedData = Atom.Encode();
		//Debug(`Pushing atom data ${Atom.Fourcc} x${EncodedData.length}`);
		this.EncodedDataQueue.Push(EncodedData);
	}

	WriteFtyp()
	{
		if ( !this.Ftyp )
		{
			this.Ftyp = new Atom_Ftyp();
			this.PushAtom(this.Ftyp);
		}
	}
	
	BakePendingTracks()
	{
		Debug(`BakePendingTracks`);
		const MovieDuration = 999*1000;
		const MovieTimescale = 1000;
		this.LastMoofSequenceNumber++;
		const SequenceNumber = this.LastMoofSequenceNumber;

		const PendingTracks = this.PendingTracks;
		this.PendingTracks = {};
		const TrackIds = Object.keys(PendingTracks);
		
		const Moofs = [];
		const Mdats = [];
		const Mp4Tracks = [];

		for ( let TrackIdKey of TrackIds )
		{
			const PendingTrack = PendingTracks[TrackIdKey];
			const TrackId = Number(TrackIdKey);
			PendingTrack.Sps = this.TrackSps[TrackId];
			PendingTrack.Pps = this.TrackPps[TrackId];
			
			
			const Track =  new H264Remuxer(MovieTimescale);
			Track.mp4track.id = TrackId;
			Track.readyToDecode = true;

			//	hack
			if ( !PendingTrack.Sps )
				throw `missing SPS for track ${Track.mp4track.id}`;
			if ( !PendingTrack.Pps )
				throw `missing PPS for track ${Track.mp4track.id}`;
			Track.mp4track.sps = [PendingTrack.Sps];
			Track.mp4track.pps = [PendingTrack.Pps];
			
			function ShouldIncludeSample(Sample)
			{
				const SampleType = H264.GetNaluType(Sample.Data);
				switch(SampleType)
				{
				case H264.ContentTypes.SPS:
				case H264.ContentTypes.PPS:
				case H264.ContentTypes.SEI:
					return false;
				default:
					return true;
				}
			}
			
			//	fill track
			let Samples = PendingTrack.Samples;
			//	filter out [mp4]redundant packets
			Samples = Samples.filter(ShouldIncludeSample);
			
			//	fill old mp4 track system
			for ( let Sample of Samples )
			{
				const Unit = {};
				Unit.Data = Sample.Data;
				Unit.getData = () => {	return Sample.Data;	};
				Unit.getSize = () => {	return Sample.Data.length;	};

				Track.samples.push({
					units:	[Unit],
					size:	Sample.Data.length,
					keyFrame:	Sample.IsKeyframe,	//	helps web browser if all true
					duration:	Sample.DurationMs,
				});
			}		

			//	gr: this bakes sample meta into track
			const TrackPayload = Track.getPayload();
			Mp4Tracks.push(Track.mp4track);

			const mdat = new Atom_Mdat();
			
			const Moof = new Atom_Moof(SequenceNumber);
			const Traf = this.traf = new Atom_Traf(TrackId);
			Moof.ChildAtoms.push(Traf);
			for ( let Sample of Samples )
			{
				const MdatPosition = mdat.PushData( Sample.Data );
				Traf.AddSample(Sample,MdatPosition);
			}
			//	should this be zero, or maybe first sample's time?
			Traf.BaseMediaDecodeTime = Samples[0].DecodeTimeMs;
			
			//	need to get data offset to mdat, but we need the moof size for that
			{
				const NewMoofData = Moof.Encode();
				const MoofSize = NewMoofData.length;
				Traf.Trun.MoofSize = MoofSize;
			}	
			
			Moofs.push(Moof);
			Mdats.push(mdat);
		}
		
		this.WriteFtyp();
		
		//	write this once, can be done before backing moof
		//	gr: mp4track.len doesnt matter
		if ( !this.Moov )
		{
			//	replacement for mp4tracks
			const MoovMp4Tracks = [];
			for ( let TrackId of TrackIds )
			{
				const PendingTrack = PendingTracks[TrackId];
				
				const Mp4Track = {};
				//	mdia
				Mp4Track.timescale = MovieTimescale;
				Mp4Track.type = 'video';
				
				Mp4Track.sps = [PendingTrack.Sps];
				Mp4Track.pps = [PendingTrack.Pps];
				Mp4Track.id = Number(TrackId);

				const ParsedSps = H264.ParseSps(PendingTrack.Sps);
				const LastSample = PendingTrack.Samples[PendingTrack.Samples.length-1];
				const LastSampleEndTime = LastSample.DecodeTimeMs + LastSample.DurationMs;
				
				//	tkhd
				Mp4Track.duration = LastSampleEndTime;
				Mp4Track.width = ParsedSps.width;
				Mp4Track.height = ParsedSps.height;
				Mp4Track.volume = 0;
				
				MoovMp4Tracks.push(Mp4Track);
			}

			//this.Moov = MP4.initSegment( MoovMp4Tracks, MovieDuration, MovieTimescale );
			this.Moov = MP4.moov( MoovMp4Tracks, MovieDuration, MovieTimescale );

			
			this.EncodedDataQueue.Push(this.Moov);
			
			//	needs sps etc setting up properly
			this.Moov = new Atom_Moov();
			for ( let TrackId of TrackIds )
				this.Moov.AddTrack(TrackId);
			//this.EncodedDataQueue.Push(this.Moov.Encode());
			
		}
			
		for ( let i=0;	i<Moofs.length;	i++ )
		{
			const moof = Moofs[i];
			const mdat = Mdats[i];
			this.PushAtom(moof);
			this.PushAtom(mdat);
		}
	}

	OnEncodeEof()
	{
		Debug(`OnEncodeEof`);
		this.EncodedDataQueue.Push(null);
	}
	
	async EncodeThread()
	{
		let LastBakedTimestamp = null;
		
		while(true)
		{
			const Sample = await this.PendingSampleQueue.WaitForNext();
			//Debug(`Encoding sample...`);
			this.WriteFtyp();

			const Eof = Sample == EndOfFileMarker;
			if ( Eof )
			{
				//Debug(`Mp4 encoder got end of file`);
			}
			

			//	decide if previous data should bake
			const TimeSinceLastBake = Sample.DecodeTimeMs - (LastBakedTimestamp||0);
			if ( Eof || TimeSinceLastBake >= this.BakeFrequencyMs )
			{
				this.BakePendingTracks();
				LastBakedTimestamp = Sample.DecodeTimeMs;
			}
			
			if ( Eof )
				break;
			
			//	get the track this should go into.
			const Track = this.GetPendingTrack(Sample.TrackId);
			Track.PushSample(Sample);
		}
		
		this.BakePendingTracks();
		this.OnEncodeEof();
	}
}

