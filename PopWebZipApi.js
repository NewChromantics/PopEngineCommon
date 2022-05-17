// This relies on the NPM package https://github.com/nika-begiashvili/libarchivejs
//	gr: moved this to be a submodule... but the worker url isn't relative to the module!
import { Archive as LibArchive } from './libarchive.js/main.js';
import {LoadFileAsArrayBufferAsync,LoadFileAsImageAsync} from './PopWebFileSystem.js';
import {CreatePromise} from './PopApi.js'

//	gr: I hate not having the source to hand, but this is the fix for now
//		until I can figure out how to get these ES modules out of the damned repos :)
//	https://github.com/101arrowz/fflate
import * as fflate from 'https://cdn.skypack.dev/fflate?min';

function GetLibArchiveWorkerUrl()
{
	let ModuleUrl = import.meta.url;	//	this is full http://xxx/x.js url
	const ThisUrl = new URL( import.meta.url );	//	convert to URL object so it's parsed
	let ThisPath = ThisUrl.pathname;
	let LastSlash = ThisPath.lastIndexOf('/');
	ThisPath = ThisPath.slice(0, LastSlash);
	return `${ThisPath}/libarchive.js/dist/worker-bundle.js`;
}

const WorkerUrl = GetLibArchiveWorkerUrl();
LibArchive.init( {
	workerUrl: WorkerUrl
} );


//	todo: merge these together!
export class NewZipArchive
{
	constructor()
	{
		//	fflate uses keys for directory structure
		this.Files = {};
	}
	
	AddFile(Filename,Contents)
	{
		const FileOptions = {};
		//FileOptions.level = 8;
		//FileOptions.mtime = new Date('10/20/2020')
		const NewFile = [ Contents, FileOptions ];
		this.Files[Filename] = NewFile;
	}
	
	//	return arraybuffer of the compressed archive
	GetZipFileData()
	{
		//	there are some async calls, but they need a worker and aren't async/await
		//	so for now, just using blocking
		const Options = {};
		const Zipped = fflate.zipSync( this.Files, Options );
		const ArchiveData = Zipped;
		return ArchiveData;
	}
}




export class Archive
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
			let Promise = CreatePromise();
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
			let Promise = CreatePromise();
			const reader = new FileReader();
			reader.onload = () => Promise.Resolve( reader.result)
			reader.onerror = (Error) => Promise.Reject(Error)
			reader.readAsDataURL( File )
			return Promise;
		}

		const FileReaderDataURL = await LoadDataURLFromReaderAsync();
		const Img = await LoadFileAsImageAsync(FileReaderDataURL);
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


export default Archive;

