export default 'Mp4.js';
import Pop from './PopEngine.js'
import PromiseQueue from './PromiseQueue.js'
import {JoinTypedArrays,BytesToString,BytesToBigInt} from './PopApi.js'


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
			MovieHeader = DecodeAtom_MovieHeader(MovieHeaderAtom);
		}
	}
}


