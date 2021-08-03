const Default = 'H264 module';
export default Default;

//	this is in a namespace so we can enum keys
export const ContentTypes = {};
ContentTypes.Slice_NonIDRPicture = 1;
ContentTypes.Slice_CodedPartitionA = 2;
ContentTypes.Slice_CodedPartitionB = 3;
ContentTypes.Slice_CodedPartitionC = 4;
ContentTypes.Slice_CodedIDRPicture = 5;
ContentTypes.SEI = 6;	//	supplimental enhancement info
ContentTypes.SPS = 7;
ContentTypes.PPS = 8;
ContentTypes.AccessUnitDelimiter = 9;
ContentTypes.EOS = 10;	//	endof sequence
ContentTypes.EOF = 11;	//	end of stream


export function GetContentName(ContentType)
{
	const KeyValues = Object.entries(ContentTypes);
	for ( const [Key, Value] of KeyValues)
	{
		if ( Value === ContentType )
			return Key;
	}
	return `Unknown H264 content type ${ContentType}`;
}

export function GetNaluLength(Packet)
{
	const Data = Packet.slice(0,4);
	if (Data[0] != 0 && Data[1] != 0)
		throw `Nalu[${Data}] != 0001|001`;

	if (Data[2] == 1)
		return 3;
	if (Data[2] == 0 && Data[3] == 1)
		return 4;

	//	detect a 4xnalu length
	const Size = (Data[0] << 24) | (Data[1] << 16) | (Data[2] << 8) | (Data[3] << 0);
	if ( Size+4 == Packet.length )
		return 4; 

	throw `Nalu[${Data}] != 0001|001`;
}


export function GetNaluMeta(Packet)
{
	const NaluSize = GetNaluLength(Packet);
	const TypeAndPriority = Packet[NaluSize];
	const Type = TypeAndPriority & 0x1f;
	const Priority = TypeAndPriority >> 5;
	
	const Meta = {};
	Meta.Content = Type;
	Meta.Priority = Priority;
	Meta.PacketSize = Packet.length;
	
	return Meta;
}

export function GetNaluType(Packet)
{
	const Meta = GetNaluMeta(Packet);
	return Meta.Content;
}



export function IsKeyframe(Packet)
{
	const Meta = GetNaluMeta(Packet);
	
	switch (Meta.Content)
	{
		case ContentTypes.SPS:
		case ContentTypes.PPS:
		case ContentTypes.SEI:
		case ContentTypes.EOS:
		case ContentTypes.EOF:
		case ContentTypes.Slice_CodedIDRPicture:
			return true;

		//	picture
		default:
			//Pop.Debug("Not keyframe H264",JSON.stringify(Meta));
			return false;
	}
}

export function SplitNalus(Packet)
{
	//	gr: we need this fast search-for-bytes as a generic thing so we can get the fastest possible func
	const Marker = new Uint8Array([0,0,1]);
	const MarkerStarts = [];
	
	for ( let i=0;	i<Packet.length-Marker.length;	i++ )
	{
		const a = Packet[i+0] == Marker[0];
		const b = Packet[i+1] == Marker[1];
		const c = Packet[i+2] == Marker[2];
		if ( a && b && c )
			MarkerStarts.push(i);
	}
	
	if ( MarkerStarts.length == 0 )
	{
		Pop.Debug(`Didn't find any nalu markers. Assuming start`);
		MarkerStarts.push(0);
	}

	//	add a position at the end	
	MarkerStarts.push( Packet.length );

	const Nalus = [];
	for ( let ms=0;	ms<MarkerStarts.length-1;	ms++ )
	{
		const Start = MarkerStarts[ms+0];
		const End = MarkerStarts[ms+1];
		const Nalu = Packet.slice(Start,End);
		Nalus.push(Nalu);
	}
	return Nalus;
}


