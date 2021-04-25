import Pool from './Pool.js'
import PopImage from './PopWebImageApi.js'
import { GetChannelsFromPixelFormat,IsFloatFormat } from './PopWebImageApi.js'


export class ImagePool extends Pool
{
	constructor(Name,OnWarning)
	{
		let Debug_AllocatedImageCounter = 0;

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
					
				Pop.Debug(`B) Found imagepool (${this.Name}) match ${Width},${Height},${Format} name=${FreeImage.Name} index=${i}`);
				const Spliced = FreeImages.splice(i,1)[0];
				if ( Spliced != FreeImage )
				{
					Pop.Warning(`B) image pool spliced ${i} different to freeimage in loop`);
				}
				return Spliced;
			}
			OnWarning(`B) No image pool(${this.Name}) image matching ${Width}x${Height}_${Format}`);
			return false;
		}
		
		function AllocImage(Width,Height,Format)
		{
			const Image = new PopImage(`B)ImagePool#${Debug_AllocatedImageCounter} ${Width}x${Height}_${Format} `);
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
