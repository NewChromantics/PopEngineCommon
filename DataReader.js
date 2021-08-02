import Pop from './PopEngine.js'
import {IsTypedArray,JoinTypedArrays,BytesToString,StringToBytes,BytesToBigInt} from './PopApi.js'

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

export class DataWriter
{
	constructor()
	{
		this.Datas = [];	//	array of arrays of bytes, gets baked in GetData
	}
	
	GetData()
	{
		if ( !this.Datas.length )
			return new Uint8Array(0);
			
		const JoinedData = JoinTypedArrays(...this.Datas);
		this.Datas = [JoinedData];
		return JoinedData;
	}
	
	Write8(Value)
	{
		if ( Value === undefined )	throw `Invalid Write8(${Value})`;
		const Data = new Uint8Array(1);
		Data[0] = Value;
		this.Datas.push(Data);
	}
	
	Write16(Value)
	{
		if ( Value === undefined )	throw `Invalid Write16(${Value})`;
		const Data = new Uint8Array(2);
		Data[0] = (Value >> 8) & 0xff;
		Data[1] = (Value >> 0) & 0xff;
		this.Datas.push(Data);
	}
	
	Write24(Value)
	{
		if ( Value === undefined )	throw `Invalid Write24(${Value})`;
		const Data = new Uint8Array(3);
		Data[0] = (Value >> 16) & 0xff;
		Data[1] = (Value >> 8) & 0xff;
		Data[2] = (Value >> 0) & 0xff;
		this.Datas.push(Data);
	}
	
	Write32(Value)
	{
		if ( Value === undefined )	throw `Invalid Write32(${Value})`;
		const Data = new Uint8Array(4);
		Data[0] = (Value >> 24) & 0xff;
		Data[1] = (Value >> 16) & 0xff;
		Data[2] = (Value >> 8) & 0xff;
		Data[3] = (Value >> 0) & 0xff;
		this.Datas.push(Data);
	}
	
	Write64(Value)
	{
		//	convert into bytes
		//	todo: handle big int
		const Data = new Uint8Array(64/8);
		if ( typeof Value != typeof 1 )
			throw `todo: handle ${typeof Value} as 64bit`

		if ( Value > 0xffffffff )
			throw `todo: handle 64 bit number properly`;

		Data[4] = (Value >> 24) & 0xff;
		Data[5] = (Value >> 16) & 0xff;
		Data[6] = (Value >> 8) & 0xff;
		Data[7] = (Value >> 0) & 0xff;
		this.Datas.push(Data);
	}
		
	WriteBytes(Value)
	{
		if ( Value === undefined )	throw `Invalid WriteBytes(${Value})`;
		
		if ( Array.isArray(Value) )
		{
			Value = new Uint8Array(Value);
		}
		
		//	convert to u8 array
		if ( IsTypedArray(Value) )
		{
			const ArrayBuffer = Value.buffer;
			Value = new Uint8Array(ArrayBuffer);
		}
		
		this.Datas.push(Value);
	}
	
	WriteStringAsBytes(String)
	{
		const Bytes = StringToBytes(String);
		this.WriteBytes(Bytes);
	}
}
