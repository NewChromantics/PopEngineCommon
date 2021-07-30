import Pop from './PopEngine.js'
import {JoinTypedArrays,BytesToString,BytesToBigInt} from './PopApi.js'

//	when we push this data to a decoder, it signals no more data coming
export const EndOfFileMarker = 'eof';

//	todo: expand to allow Data to be an array of datas
//	todo: expand to have a "wait for more data" async func, so we can replace the general mp4 reader
export class DataReader
{
	constructor(Data,ExternalFilePosition=0,WaitForMoreData=null,InitialPositon=0)
	{
		//	todo: check incoming data, expecting byte array
		//	allow init with no data
		Data = Data || new Uint8Array(0);
		
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
	
	async ReadUntilMatch(MatchBytes,IncludeMatch=true)
	{
		const MatchLength = MatchBytes.length;
		let Position = this.FilePosition;
		
		function IsMatch(Bytes)
		{
			for ( let i=0;	i<MatchBytes.length;	i++ )
				if ( Bytes[i] != MatchBytes[i] )
					return false;
			return true;
		}
		
		while( true )
		{
			//	potential marker ends here
			const EndPosition = Position + MatchBytes.length;
			
			while ( EndPosition > this.FileBytes.length )
			{
				Pop.Debug(`waiting for ${EndPosition-this.FileBytes.length} more bytes...`);
				const NewBytes = await this.WaitForMoreData();
				if ( NewBytes == EndOfFileMarker )
					throw EndOfFileMarker;//`No more data (EOF) and waiting on ${EndPosition-this.FileBytes.length} more bytes`;
			
				//Pop.Debug(`New bytes x${NewBytes.length}`);
				this.FileBytes = JoinTypedArrays(this.FileBytes,NewBytes);
				//Pop.Debug(`File size now x${this.FileBytes.length}`);
			}
			
			const TestChunk = this.FileBytes.slice( Position, EndPosition );
			if ( TestChunk.length != MatchBytes.length )
				throw `Something gone wrong with reading bytes`;
			
			//	check for match
			if ( !IsMatch(TestChunk) )
			{
				Position++;
				continue;
			}
			
			//	found the marker! export data up to here
			const ExportStart = this.FilePosition;
			const ExportEnd = Position + (IncludeMatch ? MatchBytes.length : 0);
			const MatchedData = this.FileBytes.slice( ExportStart, ExportEnd );
			this.FilePosition = EndPosition;
			return MatchedData;
		}
	}
	
}
export default DataReader;
