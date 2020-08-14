// This relies on the NPM package https://github.com/nika-begiashvili/libarchivejs
import { Archive } from '../node_modules/libarchive.js/main.js';

Archive.init( {
	workerUrl: '../node_modules/libarchive.js/dist/worker-bundle.js'
} );

//	namespace
export const PopZip = {};

PopZip.Archive = class
{
	constructor( ZipFile )
	{
		this.OpenPromise = this.Open( ZipFile );
		this.archive = null;
	}

	async Open( ZipFile )
	{
		const Contents = await Pop.LoadFileAsArrayBufferAsync(ZipFile)
		const ContentsBlob = new Blob([Contents],
			{
				type: "application/zip"
			}
		);

		this.archive = await Archive.open( ContentsBlob );
	}

	async GetFilenames()
	{
		await this.OpenPromise;
		await this.ExtractFiles();
		const DecompressedArray = await this.archive.getFilesArray()
		return DecompressedArray.map(DecompressedFile => DecompressedFile.file.name);
	}

	async ExtractFiles()
	{
		return await this.archive.extractFiles();
	}

	async LoadFileAsStringAsync( FilenameInsideZip )
	{
		const File = await this.ValidateFileExists( FilenameInsideZip )

		async function LoadStringFromReaderAsync()
		{
			let Promise = Pop.CreatePromise();
			const reader = new FileReader();
			reader.onload = () => Promise.Resolve(reader.result)
			reader.onerror = (Error) => Promise.Reject(Error)
			reader.readAsText( File )
			return Promise;
		}

		let FileReaderString = await LoadStringFromReaderAsync()
		return FileReaderString;
	}

	async LoadFileAsImageAsync( FilenameInsideZip )
	{
		const File = await this.ValidateFileExists( FilenameInsideZip )

		async function LoadDataURLFromReaderAsync()
		{
			let Promise = Pop.CreatePromise();
			const reader = new FileReader();
			reader.onload = () => Promise.Resolve( reader.result)
			reader.onerror = (Error) => Promise.Reject(Error)
			reader.readAsDataURL( File )
			return Promise;
		}

		const FileReaderDataURL = await LoadDataURLFromReaderAsync();
		const Img = new Pop.Image(FileReaderDataURL);
		return Img;

	}

	async ValidateFileExists( Filename )
	{
		await this.OpenPromise;
		const Filenames = await this.GetFilenames();
		if ( !Filenames.includes(Filename ) )
			throw `${Filename} missing`;

		const FileArray = await this.archive.getFilesArray()
		return FileArray.find(ExtractedFile => ExtractedFile.file.name === Filename ).file
	}
}

