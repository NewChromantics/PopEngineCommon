// This relies on the NPM package https://github.com/nika-begiashvili/libarchivejs
//	gr: moved this to be a submodule... but the worker url isn't relative to the module!
import { LibArchive } from './libarchive.js/main.js';
import {LoadFileAsArrayBufferAsync} from './FileSystem.js'



LibArchive.init( {
	workerUrl: './PopEngine/libarchive.js/dist/worker-bundle.js'
} );


export default class ZipArchive
{
	constructor(ZipFilenameOrBytes)
	{
		this.OpenPromise = this.Open(ZipFilenameOrBytes);
		this.archive = null;
	}

	async Open(ZipFilenameOrBytes)
	{
		let Contents;
		
		//	load the file if it's a string
		if ( typeof ZipFilenameOrBytes == typeof '' )
			Contents = await LoadFileAsArrayBufferAsync(ZipFilenameOrBytes);
		else
			Contents = ZipFilenameOrBytes;
		
		const BlobParams = {};
		BlobParams.type = "application/zip";
		const ContentsBlob = new Blob([Contents],BlobParams);

		this.archive = await LibArchive.open( ContentsBlob );
	}

	async GetFilenames()
	{
		await this.OpenPromise;
		await this.ExtractFiles();

		//	get the fulle path of a file entry
		function FileToFilePath(File)
		{
			const CompressedFilename = `${File.path}${File.file.name}`;
			return CompressedFilename;
		}
		
		const DecompressedArray = await this.archive.getFilesArray()
		const Filenames = DecompressedArray.map(FileToFilePath);
		return Filenames;
	}

	async ExtractFiles()
	{
		return await this.archive.extractFiles();
	}

	async LoadFileAsStringAsync( FilenameInsideZip )
	{
		const File = await this.LoadFileAsync( FilenameInsideZip )

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
		const File = await this.LoadFileAsync( FilenameInsideZip )

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
		const Img = await Pop.LoadFileAsImageAsync(FileReaderDataURL);
		return Img;
	}
	
	
	async LoadFileAsArrayBufferAsync(FilenameInsideZip)
	{
		const File = await this.LoadFileAsync( FilenameInsideZip )
		const Buffer = await File.arrayBuffer();
		return Buffer;
	}

	//	returns a File object
	//	expects full path inside archive
	async LoadFileAsync(Filename)
	{
		await this.OpenPromise;
		
		function FileMatch(File)
		{
			const CompressedFilename = `${File.path}${File.file.name}`;
			if ( CompressedFilename != Filename )
				return false;
			return true;
		}

		const FileArray = await this.archive.getFilesArray()
		const Match = FileArray.find(FileMatch);
		if ( !Match )
			throw `Failed to find ${Filename} in archive`;
		return Match.file;
	}
}

