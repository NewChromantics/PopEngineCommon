const Default = 'H264 module';
export default Default;


/**
 * Parser for exponential Golomb codes, a variable-bitwidth number encoding scheme used by h264.
*/

export class ExpGolomb {

	constructor(data) {
		this.data = data;
		this.index = 0;
		this.bitLength = data.byteLength * 8;
	}

	get bitsAvailable() {
		return this.bitLength - this.index;
	}

	skipBits(size) {
		// console.log(`  skip bits: size=${size}, ${this.index}.`);
		if (this.bitsAvailable < size) {
			//throw new Error('no bytes available');
			return false;
		}
		this.index += size;
	}

	readBits(size, moveIndex = true) {
		// console.log(`  read bits: size=${size}, ${this.index}.`);
		const result = this.getBits(size, this.index, moveIndex);
		// console.log(`    read bits: result=${result}`);
		return result;
	}

	getBits(size, offsetBits, moveIndex = true) {
		if (this.bitsAvailable < size) {
			//throw new Error('no bytes available');
			return 0;
		}
		const offset = offsetBits % 8;
		const byte = this.data[(offsetBits / 8) | 0] & (0xff >>> offset);
		const bits = 8 - offset;
		if (bits >= size) {
			if (moveIndex) {
				this.index += size;
			}
			return byte >> (bits - size);
		} else {
			if (moveIndex) {
				this.index += bits;
			}
			const nextSize = size - bits;
			return (byte << nextSize) | this.getBits(nextSize, offsetBits + bits, moveIndex);
		}
	}

	skipLZ() {
		let leadingZeroCount;
		for (leadingZeroCount = 0; leadingZeroCount < this.bitLength - this.index; ++leadingZeroCount) {
			if (this.getBits(1, this.index + leadingZeroCount, false) !== 0) {
				// console.log(`  skip LZ  : size=${leadingZeroCount}, ${this.index}.`);
				this.index += leadingZeroCount;
				return leadingZeroCount;
			}
		}
		return leadingZeroCount;
	}

	skipUEG() {
		this.skipBits(1 + this.skipLZ());
	}

	skipEG() {
		this.skipBits(1 + this.skipLZ());
	}

	readUEG() {
		const prefix = this.skipLZ();
		return this.readBits(prefix + 1) - 1;
	}

	readEG() {
		const value = this.readUEG();
		if (0x01 & value) {
			// the number is odd if the low order bit is set
			return (1 + value) >>> 1; // add 1 to make it even, and divide by 2
		} else {
			return -1 * (value >>> 1); // divide by two then make it negative
		}
	}

	readBoolean() {
		return this.readBits(1) === 1;
	}
	readUByte(numberOfBytes = 1) {
		return this.readBits((numberOfBytes * 8));
	}
	readUShort() {
		return this.readBits(16);
	}
	readUInt() {
		return this.readBits(32);
	}
}



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
	return IsContentTypeKeyframe(Meta.Content);
}

export function IsContentTypeKeyframe(ContentType)
{
	switch (ContentType)
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
	if ( Packet[0] == 0 &&
		Packet[1] == 0 &&
		Packet[2] == 0 &&
		Packet[3] == 1 )
	{
		return SplitNalus_Nalu4(Packet);
	}
	if ( Packet[0] == 0 &&
		Packet[1] == 0 &&
		Packet[2] == 1 )
	{
		return SplitNalus_Nalu4(Packet);
	}

	const Nalus = [];
	let Pos = 0;
	while ( Pos < Packet.length )
	{
		let Length = 0;
		Length += Packet[Pos+0] << 24;
		Length += Packet[Pos+1] << 16;
		Length += Packet[Pos+2] << 8;
		Length += Packet[Pos+3] << 0;
		const Data = Packet.slice( Pos, Pos+Length+4 );
		Nalus.push( Data );
		Pos += 4;
		Pos += Length;
	}
	return Nalus;
}

function SplitNalus_Nalu4(Packet)
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


export function ParseSps(data)
{
	let decoder = new ExpGolomb(data);
	let frameCropLeftOffset = 0,
		frameCropRightOffset = 0,
		frameCropTopOffset = 0,
		frameCropBottomOffset = 0,
		sarScale = 1,
		profileIdc,
		profileCompat,
		levelIdc,
		numRefFramesInPicOrderCntCycle,
		picWidthInMbsMinus1,
		picHeightInMapUnitsMinus1,
		frameMbsOnlyFlag,
		scalingListCount;
	decoder.readUByte();
	profileIdc = decoder.readUByte(); // profile_idc
	profileCompat = decoder.readBits(5); // constraint_set[0-4]_flag, u(5)
	decoder.skipBits(3); // reserved_zero_3bits u(3),
	levelIdc = decoder.readUByte(); // level_idc u(8)
	decoder.skipUEG(); // seq_parameter_set_id
	// some profiles have more optional data we don't need
	if (profileIdc === 100 ||
		profileIdc === 110 ||
		profileIdc === 122 ||
		profileIdc === 244 ||
		profileIdc === 44 ||
		profileIdc === 83 ||
		profileIdc === 86 ||
		profileIdc === 118 ||
		profileIdc === 128) {
		var chromaFormatIdc = decoder.readUEG();
		if (chromaFormatIdc === 3) {
			decoder.skipBits(1); // separate_colour_plane_flag
		}
		decoder.skipUEG(); // bit_depth_luma_minus8
		decoder.skipUEG(); // bit_depth_chroma_minus8
		decoder.skipBits(1); // qpprime_y_zero_transform_bypass_flag
		if (decoder.readBoolean()) { // seq_scaling_matrix_present_flag
			scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
			for (let i = 0; i < scalingListCount; ++i) {
				if (decoder.readBoolean()) { // seq_scaling_list_present_flag[ i ]
					if (i < 6) {
						H264Parser.skipScalingList(decoder, 16);
					} else {
						H264Parser.skipScalingList(decoder, 64);
					}
				}
			}
		}
	}
	decoder.skipUEG(); // log2_max_frame_num_minus4
	var picOrderCntType = decoder.readUEG();
	if (picOrderCntType === 0) {
		decoder.readUEG(); // log2_max_pic_order_cnt_lsb_minus4
	} else if (picOrderCntType === 1) {
		decoder.skipBits(1); // delta_pic_order_always_zero_flag
		decoder.skipEG(); // offset_for_non_ref_pic
		decoder.skipEG(); // offset_for_top_to_bottom_field
		numRefFramesInPicOrderCntCycle = decoder.readUEG();
		for (let i = 0; i < numRefFramesInPicOrderCntCycle; ++i) {
			decoder.skipEG(); // offset_for_ref_frame[ i ]
		}
	}
	decoder.skipUEG(); // max_num_ref_frames
	decoder.skipBits(1); // gaps_in_frame_num_value_allowed_flag
	picWidthInMbsMinus1 = decoder.readUEG();
	picHeightInMapUnitsMinus1 = decoder.readUEG();
	frameMbsOnlyFlag = decoder.readBits(1);
	if (frameMbsOnlyFlag === 0) {
		decoder.skipBits(1); // mb_adaptive_frame_field_flag
	}
	decoder.skipBits(1); // direct_8x8_inference_flag
	if (decoder.readBoolean()) { // frame_cropping_flag
		frameCropLeftOffset = decoder.readUEG();
		frameCropRightOffset = decoder.readUEG();
		frameCropTopOffset = decoder.readUEG();
		frameCropBottomOffset = decoder.readUEG();
	}
	if (decoder.readBoolean()) {
		// vui_parameters_present_flag
		if (decoder.readBoolean()) {
			// aspect_ratio_info_present_flag
			let sarRatio;
			const aspectRatioIdc = decoder.readUByte();
			switch (aspectRatioIdc) {
				case 1: sarRatio = [1, 1]; break;
				case 2: sarRatio = [12, 11]; break;
				case 3: sarRatio = [10, 11]; break;
				case 4: sarRatio = [16, 11]; break;
				case 5: sarRatio = [40, 33]; break;
				case 6: sarRatio = [24, 11]; break;
				case 7: sarRatio = [20, 11]; break;
				case 8: sarRatio = [32, 11]; break;
				case 9: sarRatio = [80, 33]; break;
				case 10: sarRatio = [18, 11]; break;
				case 11: sarRatio = [15, 11]; break;
				case 12: sarRatio = [64, 33]; break;
				case 13: sarRatio = [160, 99]; break;
				case 14: sarRatio = [4, 3]; break;
				case 15: sarRatio = [3, 2]; break;
				case 16: sarRatio = [2, 1]; break;
				case 255: {
					sarRatio = [decoder.readUByte() << 8 | decoder.readUByte(), decoder.readUByte() << 8 | decoder.readUByte()];
					break;
				}
			}
			if (sarRatio) {
				sarScale = sarRatio[0] / sarRatio[1];
			}
		}
		if (decoder.readBoolean()) { decoder.skipBits(1); }

		if (decoder.readBoolean()) {
			decoder.skipBits(4);
			if (decoder.readBoolean()) {
				decoder.skipBits(24);
			}
		}
		if (decoder.readBoolean()) {
			decoder.skipUEG();
			decoder.skipUEG();
		}
		if (decoder.readBoolean()) {
			let unitsInTick = decoder.readUInt();
			let timeScale = decoder.readUInt();
			let fixedFrameRate = decoder.readBoolean();
			let frameDuration = timeScale / (2 * unitsInTick);
		}
	}
	return {
		width: Math.ceil((((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2) * sarScale),
		height: ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) - ((frameMbsOnlyFlag ? 2 : 4) * (frameCropTopOffset + frameCropBottomOffset)),
	};
}

export function Nalu4ToAnnexB(Data)
{
	if ( Data[0] == 0 && Data[1] == 0 && Data[2] == 0 && Data[3] == 1 )
	{
		let Length = Data.length - 4;	//	ignore prefix in size
		Data[0] = (Length >> 24) & 0xff;
		Data[1] = (Length >> 16) & 0xff;
		Data[2] = (Length >> 8) & 0xff;
		Data[3] = (Length >> 0) & 0xff;
		//	Data = Data.slice(4);	//	wrong!
		//Pop.Debug(`converted to avcc`);
	}
	
	//	ignore sps & pps & sei
	/*
	//	gr: we dont need to ignore them, but it does slow video down (cos of timestamps)
	if ( Data.length == 13 || Data.length == 8 )
		return null;
	//	ignore sei
	if ( Data.length == 34 )
		return null;
	*/
	return Data;
}

export function AnnexBToNalu4(Data)
{
	//	already 0001 or 001
	if ( Data[0] == 0 && Data[1] == 0 && Data[2] == 0 && Data[3] == 1 )
		return Data;
	if ( Data[0] == 0 && Data[1] == 0 && Data[2] == 1 )
		return Data;

	let Length = 0;
	Length += Data[0] << 24;
	Length += Data[1] << 16;
	Length += Data[2] << 8;
	Length += Data[3] << 0;

	//	todo: check the length
	Data[0] = 0;
	Data[1] = 0;
	Data[2] = 0;
	Data[3] = 1;
	return Data;
}
