import Pool from './Pool.js'
//import PopImage from './PopWebImageApi.js'
import { GetChannelsFromPixelFormat,IsFloatFormat } from './Images.js'
const PopImage = Pop.Image;


function GetTypedArrayConstructor(Format)
{
	if ( IsFloatFormat(Format) )
		return Float32Array;
	else
		return Uint8Array;
}
	
	
const DummyBuffers = {};	//	[200x100xRGBA] = typedarray
function GetDummyBuffer(Width,Height,Format)
{
	const Key = `${Width}x${Height}x${Format}`;
	if ( !DummyBuffers.hasOwnProperty(Key) )
	{
		const Constructor = GetTypedArrayConstructor(Format);
		const Channels = GetChannelsFromPixelFormat(Format);
		DummyBuffers[Key] = new Constructor( Width * Height * Channels );
	}
	return DummyBuffers[Key];
}

export class ImagePool extends Pool
{
	constructor(Name,OnWarning=function(){})
	{
		OnWarning = OnWarning || function(){};
		let Debug_AllocatedImageCounter = 0;
		const OnDebug = function(){};//OnWarning;

		function PopFromFreeList(FreeImages,Width,Height,Format)
		{
			for ( let i=0;	i<FreeImages.length;	i++ )
			{
				const FreeImage = FreeImages[i];
				if ( !FreeImage )
				{
					Pop.Warning(`Null${FreeImage} image in image pool`);
					continue;
				}
				if ( FreeImage.GetWidth() != Width )
					continue;
				if ( FreeImage.GetHeight() != Height )
					continue;
				if ( FreeImage.GetFormat() != Format )
					continue;
					
				OnDebug(`A) Found pool (${this.Name}) match ${Width},${Height},${Format} name=${FreeImage.Name}`);
				FreeImages.splice(i,1);
				return FreeImage;
			}
			OnWarning(`A) No pool(${this.Name}) image matching ${Width}x${Height}_${Format} (free=x${FreeImages.length})`);
			return false;
		}
		
		function AllocImage(Width,Height,Format)
		{
			const Image = new PopImage(`ImagePool#${Debug_AllocatedImageCounter} ${Width}x${Height}_${Format} `);
			Image.PoolAllocatedIndex = Debug_AllocatedImageCounter;
			Debug_AllocatedImageCounter++;
			
			//	gr: don't allocate a pixel array, let the image object
			//		handle that. if we need pixels, and there isn't a buffer, it should
			//		allocate it itself (this is to handle Yuv_8_88 easily)
			Image.WritePixels( Width, Height, null, Format );
			return Image;
		}
	
		super( Name, AllocImage, OnWarning, PopFromFreeList );
	}
}

export default ImagePool;
