// This relies on the NPM package https://github.com/nika-begiashvili/libarchivejs
import { Archive } from '../node_modules/libarchive.js/main.js';

Archive.init( {
	workerUrl: '../node_modules/libarchive.js/dist/worker-bundle.js'
} );

export default class PopZip
{
	constructor(fileName)
	{
		this.fileName = fileName;
		this.archive = null;
	}

	async open()
	{
		const Contents = await Pop.LoadFileAsArrayBufferAsync(this.fileName)
		const ContentsBlob = new Blob([Contents],
			{
				type: "application/zip"
			}
		);
		this.archive = await Archive.open( ContentsBlob );
	}

	async extractFiles()
	{
		return await this.archive.extractFiles();
	}

	async getFilesArray()
	{
		return await this.archive.getFilesArray();
	}
}