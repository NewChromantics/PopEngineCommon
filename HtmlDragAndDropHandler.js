import PromiseQueue from './PromiseQueue.js'


export default class DragAndDropHandler
{
	constructor(Element,OnDragStart,OnDragEnd,OnError)
	{
		this.OnDragDropQueue = new PromiseQueue();
		
		//	callbacks to allow user to highlight a drag away from the async functions
		this.OnDragStart = OnDragStart || function(){	console.log(`OnDragStart...`); };
		this.OnDragEnd = OnDragEnd || function(){	console.log(`OnDragEnd...`); };
		this.OnError = OnError || function(Error){	console.error(`OnError...${Error}`); };
		
		Element.addEventListener('drop',this.OnDragDrop.bind(this));
		Element.addEventListener('dragover',this.OnTryDragDropEvent.bind(this));
		Element.addEventListener('dragleave',this.OnDragLeave.bind(this));
	}
	
	//	this returns an ARRAY of files.
	async WaitForDragAndDropFiles()
	{
		return this.OnDragDropQueue.WaitForNext();
	}
	
	OnDragLeave(Event)
	{
		this.OnDragEnd();
	}
	
	GetDragDropFilenames(Files)
	{
		//	gr: we may need to make random/unique names here
		const Filenames = Files.map(f => f.name);

		//	let user modify filename array
		if (this.OnDragDropRenameFiles)
			this.OnDragDropRenameFiles(Filenames);

		return Filenames;
	}

	OnTryDragDropEvent(Event)
	{
		//console.log(`OnTryDragDropEvent`,Event);
		//	if this.OnTryDragDrop has been overloaded, call it
		//	if it hasn't, we allow drag and drop
		//	gr: maybe API really should change, so it only gets turned on if WaitForDragDrop has been called
		let AllowDragDrop = false;

		//	gr: HTML doesnt allow us to see filenames, just type & count
		//const Filenames = Array.from(Event.dataTransfer.files).map(this.GetDragDropFilename);
		const Filenames = new Array(Event.dataTransfer.items.length);
		Filenames.fill(null);

		if (!this.OnTryDragDrop)
		{
			AllowDragDrop = true;
		}
		else
		{
			AllowDragDrop = this.OnTryDragDrop(Filenames);
		}

		if (AllowDragDrop)
		{
			Event.preventDefault();
			this.OnDragStart();
		}
		else
		{
			this.OnDragEnd();
		}
	}
	
	OnDragDrop(Event)
	{
		console.log(`OnDragDrop`,Event);
		async function LoadFilesAsync(Files)
		{
			const NewFilenames = this.GetDragDropFilenames(Files);
			const FinalAddedFiles = [];
			
			async function LoadFile(File,FileIndex)
			{
				const Filename = NewFilenames[FileIndex];
				const Mime = File.type;
				console.log(`Filename ${File.name}->${Filename} mime ${Mime}`);
				const FileArray = await File.arrayBuffer();
				const File8 = new Uint8Array(FileArray);
				
				const FileEntry = {};
				FileEntry.Name = Filename;
				FileEntry.Contents = File8;
				FileEntry.Mime = Mime;
				FinalAddedFiles.push(FileEntry);
			}
			//	make a promise for each file
			const LoadPromises = Files.map(LoadFile.bind(this));
			//	wait for them to all load
			await Promise.all(LoadPromises);
			this.OnDragEnd();

			//	now notify with new filenames
			this.OnDragDropQueue.Push(FinalAddedFiles);
		}

		Event.preventDefault();
	
		try
		{
			if (Event.dataTransfer.files)
			{
				const Files = Array.from(Event.dataTransfer.files);
				LoadFilesAsync.call(this,Files);
			}
			else
			{
				throw `Handle non-file drag&drop`;
			}
		}
		catch(e)
		{
			this.OnError(e);
		}
		finally
		{
			this.OnDragEnd();
		}
	}

}

