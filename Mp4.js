export default 'Mp4.js';
import Pop from './PopEngine.js'
import PromiseQueue from './PromiseQueue.js'
import {JoinTypedArrays,BytesToString,BytesToBigInt} from './PopApi.js'



class Atom_t
{
	constructor()
	{
		this.Size = 0;		//	total size 
		this.Fourcc = 'ATOM';
		this.Size64 = null;	//	only set if Size=1
		
		this.Children = [];	//	more Atom_t's
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
		while ( EndPosition >= this.FileBytes.length )
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
		return Atom;
	}
	
	async ParseFileThread()
	{
		while ( true )
		{
			const Atom = await this.ReadNextAtom();
			
			this.RootAtoms.push(Atom);
			this.NewAtomQueue.Push(Atom);
			
			/*if ( Atom.Fourcc == 'moov' )
			{
				const Tracks = this.DecodeAtom_Moov(Atom);
				this.EnumTracks(Tracks);
			}
			else*/
			{
				Pop.Debug(`Skipping atom ${Atom.Fourcc} x${Atom.ContentSize}`);
				await this.ReadBytes(Atom.ContentSize);
			}
		}
	}
	
	EnumTracks(Tracks)
	{
		Pop.Debug(`Got new tracks ${Tracks}`);
	}
}


