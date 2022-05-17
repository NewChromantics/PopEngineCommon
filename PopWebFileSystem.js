import PopImage from './PopWebImageApi.js'
import FileCache_t from './FileCache.js'
import PromiseQueue from './PromiseQueue.js'
import {Debug,Warning,CreatePromise,Yield} from './PopWebApiCore.js'
import {IsObjectInstanceOf,ParseExeArguments} from './PopApi.js'

//	external files are fetch()'d (and cached)
import * as ExternalFiles from './PopWebFileSystemExternal.js'

//	we re-use indexeddb in the browser as a "documents" filesystem
//	these files are stored on user's machines
import * as DocumentFiles from './PopWebFileSystemIndexedDb.js'

//	export some symbols that will always be external
export const LoadFilePromptAsArrayBufferAsync = ExternalFiles.LoadFilePromptAsArrayBufferAsync;


//	same magic string as native
export const DocumentsDirectory = 'Documents/';

export function IsDocumentsFilename(Filename)
{
	return Filename.startsWith( DocumentsDirectory );
}

//	we're interpreting the url as
//	http://exefilename/exedirectory/?exearguments
export function GetExeFilename()
{
	return window.location.hostname;
}

export function GetExeDirectory()
{
	//	exe could be path location.pathname
	const Path = window.location.pathname;
	//	including /
	const Directory = Path.substr( 0, Path.lastIndexOf("/") + 1 );
	return Directory;
}

export function GetExeArguments()
{
	//	gr: probably shouldn't lowercase now it's proper
	const UrlArgs = window.location.search.replace('?',' ').trim().split('&');
	
	return ParseExeArguments(UrlArgs);	
}

export function GetFilenames(Directory)
{
	if ( IsDocumentsFilename(Directory) )
		return DocumentFiles.GetFilenames(Directory);
	else
		return ExternalFiles.GetFilenames(Directory);
}

