import Pool from './Pool.js'
//import PopImage from './PopWebImageApi.js'
import { GetChannelsFromPixelFormat,IsFloatFormat } from './Images.js'
const PopImage = Pop.Image;

export class ImagePool extends Pool
{
	constructor(Name,OnWarning=function(){})
	{
		let Debug_AllocatedImageCounter = 0;

		function FindBestMatchingImage(FreeImages,Width,Height,Format)
		{
			for ( let i=0;	i<FreeImages.length;	i++ )
			{
				const FreeImage = FreeImages[i];
				if ( FreeImage.GetWidth() != Width )
					continue;
				if ( FreeImage.GetHeight() != Height )
					continue;
				if ( FreeImage.GetFormat() != Format )
					continue;
				return i;
			}
			
			let First = '';
			if ( FreeImages.length )
			{
				const fw = FreeImages[0].GetWidth();
				const fh = FreeImages[0].GetHeight();
				const ff = FreeImages[0].GetFormat();
				First = `${fw}x${fh}_${ff}`;
			}
			OnWarning(`No pool image matching ${Width}x${Height}_${Format} FirstFree=${First}`);
			return false;
		}
		
		function AllocImage(Width,Height,Format)
		{
			const Image = new PopImage(`ImagePool#${Debug_AllocatedImageCounter} ${Width}x${Height}_${Format} `);
			Debug_AllocatedImageCounter++;
			//	gr: we do need a pixel array. Maybe can update the image -> opengl texture process to not need it
			const Channels = GetChannelsFromPixelFormat(Format);
			const TypedArrayType = IsFloatFormat(Format) ? Float32Array : Uint8Array;
			const Pixels = new TypedArrayType( Width * Height * Channels );
			Image.WritePixels( Width, Height, Pixels, Format );
			return Image;
		}
	
		super( Name, AllocImage, OnWarning, FindBestMatchingImage );
	}
}

export default ImagePool;
