
Pop.H264 = {};

Pop.H264.SPS = 7;
Pop.H264.PPS = 8;
Pop.H264.SEI = 6;	//	supplimental enhancement info
Pop.H264.EOS = 10;	//	endof sequence
Pop.H264.EOF = 11;	//	end of stream
Pop.H264.Slice_NonIDRPicture = 1;
Pop.H264.Slice_CodedPartitionA = 2;
Pop.H264.Slice_CodedPartitionB = 3;
Pop.H264.Slice_CodedPartitionC = 4;
Pop.H264.Slice_CodedIDRPicture = 5;

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

Pop.H264.GetNaluType = function (Packet)
{
	const NaluSize = Pop.H264.GetNaluLength(Packet);
	const TypeAndPriority = Packet[NaluSize];
	const Type = TypeAndPriority & 0x1f;
	const Priority = TypeAndPriority >> 5;

	return Type;
}


Pop.H264.IsKeyframe = function (Packet)
{
	const Type = Pop.H264.GetNaluType(Packet);
	switch (Type)
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
			return false;
	}
}

