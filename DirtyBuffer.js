/*
	dirty buffer is just a wrapper for a typedarray,
	but stores a list of changes for say, a hardware/gl buffer
	where you want to minimise changes
*/
import {JoinTypedArrays} from './PopApi.js'

export default class DirtyBuffer
{
	constructor(InitialData)
	{
		this.Data = null;
		
		//	array of start/end index pairs to pack down change sets
		this.ChangedIndexRanges = [];
		
		//	todo: smarter arguments!
		//		sort this out once we've used the class a bit more
		//		probably want to restrict to any typed array
		if ( InitialData )
		{
			this.set( InitialData );
		}
	}
	
	get length()
	{
		return this.Data ? this.Data.length : 0;
	}

	PopChanges()
	{
		const Changes = this.ChangedIndexRanges;
		this.ChangedIndexRanges = [];
		return Changes;
	}
	
	MarkChanged(FirstIndex,Length)
	{
		const LastIndex = FirstIndex+Length-1;
		//	todo: append existing changes if they exist
		this.ChangedIndexRanges.push( [FirstIndex,LastIndex] );
	}
	
	set(Array,Offset=0)
	{
		if ( !this.Data )
		{
			this.Data = Array;
		}
		else
		{
			this.Data.set( Array, Offset );
		}
		this.MarkChanged( Offset, Array.length );
	}
	
	push(Array)
	{
		const NewIndex = this.Data ? this.Data.length : 0;
		//	maybe in future we want to use a chunk array to reduce allocs
		//	or have a bigger array buffer and return a few when something
		//	wants the data
		this.Data = JoinTypedArrays( [this.Data, Array] );
		this.MarkChanged( NewIndex, Array.length );
	}
}


const DirtyIndexArrayCache = {};	//	[Length] = DirtyBuffer of Float32Array filled with 0,1,2,3,4, etc
export function GetDirtyFloatIndexArray(Length)
{
	if ( !Number.isInteger(Length) )
		throw `Invalid index-array length ${Length}, needs to be an integer`;
		 
	if ( !DirtyIndexArrayCache[Length] )
	{
		const Values = new Array(Length).fill(0).map( (zero,index) => index );
		const FloatValues = new Float32Array(Values);
		DirtyIndexArrayCache[Length] = new DirtyBuffer( FloatValues );
	}
	return DirtyIndexArrayCache[Length];
}
