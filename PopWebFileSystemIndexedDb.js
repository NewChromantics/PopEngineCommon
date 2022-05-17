import {CreatePromise} from './PromiseQueue.js'
/*
//	polyfills from
//	https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
// DON'T use "var indexedDB = ..." if you're not in a function.
// Moreover, you may need references to some window.IDB* objects:
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || {READ_WRITE: "readwrite"}; // This line should only be needed if it is needed to support the object's constants for older browsers
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
*/

//	gr: we could turn this into a file system instance and use 
//		folder name as database name
const FileSystemDatabaseName = "Documents/";

const SchemaVersion = 1;
const FileObjectStoreName = "Files";
const ObjectStoreFilenameKey = "Filename";


function CreateSchema(Database)
{
	console.log(`Creating IndexedDb schema for ${FileSystemDatabaseName}/${FileObjectStoreName} version ${SchemaVersion}`); 

	//	this executes immediately
	const ObjectStore = Database.createObjectStore( FileObjectStoreName, { keyPath: ObjectStoreFilenameKey });

	ObjectStore.transaction.oncomplete = () => console.log(`Created schema`);
}

async function CreateConnection(DatabaseName)
{
	const Request = window.indexedDB.open(DatabaseName, SchemaVersion);
	const ResultPromise = CreatePromise();
	Request.onerror = () => ResultPromise.Reject( Request.errorCode );
	Request.onsuccess = () => ResultPromise.Resolve( Request.result );
	Request.onupgradeneeded = (Event) => CreateSchema(Request.result);
	return ResultPromise;
}

let DatabaseConnectionPromise;
async function GetConnection()
{
	if ( !DatabaseConnectionPromise )
	{
		DatabaseConnectionPromise = CreateConnection(FileSystemDatabaseName);
	}
	return DatabaseConnectionPromise;
}

export async function GetFilenames(Directory)
{
	let AllFilenames = [];
	async function ReadKeys(ObjectStore)
	{
		const JustKeys = true;
		//	faster
		if ( JustKeys )
		{
			ObjectStore.getAllKeys().onsuccess = (Event) => AllFilenames = Event.target.result;
		}
		else
		{
			function OnOpenCursor(Event)
			{
				const Cursor = event.target.result;
				if ( !Cursor )
					return;	//	dont call .continue()

				//	.value = { .Filename .Key }
				//AllFilenames.push(Cursor.value);
				AllFilenames.push(Cursor.key);
				Cursor.continue();
			}
			ObjectStore.openCursor().onsuccess = OnOpenCursor;
		}
	}
	await GetFileTransaction(ReadKeys);
	return AllFilenames;
}

export async function FileExists(Filename)
{
	const Filenames = await GetFilenames('Documents/');
	if ( !Filenames.includes(Filename) )
	{
		console.warn(`File not found ${Filename}`);
		return false;
	}
	return true;
}

async function GetFileTransaction(ProcessObjectStore)
{
	const db = await GetConnection();

	const Transaction = db.transaction( FileObjectStoreName, "readwrite");
	const TransactionResult = CreatePromise();
	Transaction.oncomplete = (Event) =>
	{
		console.log(`Transaction.oncomplete`);
		TransactionResult.Resolve(Event);
	}
	Transaction.onerror = (Event) =>
	{
		console.log(`Transaction.onerror`);
		TransactionResult.Reject(Event);
	}
	Transaction.onsuccess = (Event) =>
	{
		console.log(`Transaction.onsuccess`);
		TransactionResult.Resolve(Event);
	}

	const ObjectStore = Transaction.objectStore( FileObjectStoreName );
	
	//	do/queue the work
	await ProcessObjectStore(ObjectStore);
	
	//	wait for finish
	await TransactionResult;
}

export async function LoadFileAsStringAsync(Filename)
{
	const ReadResult = CreatePromise();
	async function Read(ObjectStore)
	{
		const ReadRequest = ObjectStore.get(Filename);
		function OnSuccess(Event)
		{
			ReadResult.Resolve( Event.target.result );
		}
		ReadRequest.onsuccess = OnSuccess;
		ReadRequest.onerror = ReadResult.Reject;
	}
	await GetFileTransaction(Read);

	const Result = await ReadResult;
	if ( !Result )
		throw `Loaded file from store, but is ${Result}`;
	const Content = Result.Content;
	return Content;
}

export async function WriteStringToFileAsync(Filename,Content)
{
	async function Write(ObjectStore)
	{
		const ContentEntry = {};
		ContentEntry[ObjectStoreFilenameKey] = Filename;
		ContentEntry.Content = Content;
		//	put = create/overwrite
		ObjectStore.put( ContentEntry );
	}
	await GetFileTransaction(Write);

}
