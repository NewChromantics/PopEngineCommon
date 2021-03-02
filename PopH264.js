
Pop.H264 = {};

Pop.H264.Slice_NonIDRPicture = 1;
Pop.H264.Slice_CodedPartitionA = 2;
Pop.H264.Slice_CodedPartitionB = 3;
Pop.H264.Slice_CodedPartitionC = 4;
Pop.H264.Slice_CodedIDRPicture = 5;
Pop.H264.SEI = 6;	//	supplimental enhancement info
Pop.H264.SPS = 7;
Pop.H264.PPS = 8;
Pop.H264.AccessUnitDelimiter = 9;
Pop.H264.EOS = 10;	//	endof sequence
Pop.H264.EOF = 11;	//	end of stream

Pop.H264.GetContentName = function(ContentType)
{
	const KeyValues = Object.entries(Pop.H264);
	for ( const [Key, Value] of KeyValues)
	{
		if ( Value === ContentType )
			return Key;
	}
	return `Unknown H264 content type ${ContentType}`;
}

Pop.H264.GetNaluLength = function(Packet)
{
	const Data = Packet.slice(0,4);
	if (Data[0] != 0 && Data[1] != 0)
		throw `Nalu[${Data}] != 0001|001`;

	if (Data[2] == 1)
		return 3;
	if (Data[2] == 0 && Data[3] == 1)
		return 4;

	throw `Nalu[${Data}] != 0001|001`;
}


Pop.H264.GetNaluMeta = function (Packet)
{
	const NaluSize = Pop.H264.GetNaluLength(Packet);
	const TypeAndPriority = Packet[NaluSize];
	const Type = TypeAndPriority & 0x1f;
	const Priority = TypeAndPriority >> 5;
	
	const Meta = {};
	Meta.Content = Type;
	Meta.Priority = Priority;
	Meta.PacketSize = Packet.length;
	
	return Meta;
}

Pop.H264.GetNaluType = function (Packet)
{
	const Meta = Pop.H264.GetNaluMeta(Packet);
	return Meta.Content;
}



Pop.H264.IsKeyframe = function (Packet)
{
	const Meta = Pop.H264.GetNaluMeta(Packet);
	
	switch (Meta.Content)
	{
		case Pop.H264.SPS:
		case Pop.H264.PPS:
		case Pop.H264.SEI:
		case Pop.H264.EOS:
		case Pop.H264.EOF:
		case Pop.H264.Slice_CodedIDRPicture:
			return true;

		//	picture
		default:
			//Pop.Debug("Not keyframe H264",JSON.stringify(Meta));
			return false;
	}
}

Pop.H264.SplitNalus = function(Packet)
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


