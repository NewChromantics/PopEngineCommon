import PromiseQueue from './PromiseQueue.js'


//	this will become generic and not webapi specific
//	we just need to abstract what IS webapi specific first
export default class FileCache_t
{
	constructor()
	{
		//	we keep some meta on the side. eg. known size if we're streaming a file
		//	Do we leave this, even if we unload a file?
		this.CacheMeta = {};	//	[Filename] = .Size .OtherThings .LastAccessed?
		this.Cache = {};		//	[Filename] = Contents
		this.OnFilesChanged = new PromiseQueue('FileCache.OnFilesChanged');
	}

	async WaitForFileChange()
	{
		//	gr: we now return filename & contents, but we dont want to put the
		//		contents in the promise queue (will stop the unique-test and flood the queue)
		//		so we wait, grab it here, then return with current contents
		const Filename = await this.OnFilesChanged.WaitForNext();
		const File = Object.assign({},this.GetMeta(Filename));
		File.Filename = Filename;
		File.Contents = this.Cache[File.Filename];
		return File;
	}

	//	return a mutable meta object
	GetMeta(Filename)
	{
		if ( !this.CacheMeta[Filename] )
			this.CacheMeta[Filename] = {};
		return this.CacheMeta[Filename];
	}
	
	SetError(Filename,Error)
	{
		this.CacheMeta[Filename].Error = Error;
		Debug(`Error loading file ${Filename}: ${Error}`);
		this.Set(Filename,false);
	}

	Set(Filename,Contents,ContentChunks=undefined)
	{
		if (this.Cache.hasOwnProperty(Filename))
		{
			// Debug(`Warning overwriting AssetCache[${Filename}]`);
		}
		
		//	if our content is in chunks, store them, then
		//	on request, join together
		//	expecting Contents to be null
		//if ( ContentChunks )
		//	gr: always set chunks, so it gets unset
		{
			const Meta = this.GetMeta(Filename);
			Meta.ContentChunks = ContentChunks;
			
			//	gr: I really don't want to store this meta as it can go out of date
			//		but if this is the ONLY place the chunks get updated, it can do for now
			//		Some systems (filemonitor) call GetMeta(), can't JUST have it in 
			//		the OnChanged callback
			if ( Meta.ContentChunks === undefined )
			{
				Meta.PendingContentsSize = undefined;	//	not streaming(any more)
			}
			else
			{
				Meta.PendingContentsSize = 0;
				Meta.ContentChunks.forEach( Chunk => Meta.PendingContentsSize += Chunk.byteLength );
			}
			
			//	update known size
			if ( Contents )
			{
				Meta.Size = Math.max( Contents.length, Meta.Size||0 );
			}
		}
		
		this.Cache[Filename] = Contents;
		this.OnFilesChanged.PushUnique(Filename);
	}

	//	call this before returning any contents, expecting called to have already
	//	verified it exists etc, and just re-setting the contents/cache
	ResolveChunks(Filename)
	{
		const Meta = this.GetMeta(Filename);
		if ( !Meta.ContentChunks )
			return;
		//	todo: store running Contents and only append new chunks
		//		so we minimise copies as the already-copied parts aren't going
		//		to change (in theory)
		Debug(`Resolving x${Meta.ContentChunks.length} chunks of ${Filename}`);
		this.Cache[Filename] = JoinTypedArrays(...Meta.ContentChunks);
		Meta.ContentChunks = null;
	}
	
	Get(Filename,ResolveChunks=true)
	{
		if (!this.Cache.hasOwnProperty(Filename))
		{
			throw `${Filename} has not been cached with AsyncCacheAsset()`;
		}

		//	false is a file that failed to load
		const Asset = this.Cache[Filename];
		if (Asset === false)
		{
			const Error = this.GetMeta(Filename).Error;
			throw `${Filename} failed to load: ${Error}`;
		}
		
		//	gr: send back chunks if they haven't been resolved
		if ( !ResolveChunks )
		{
			const Meta = this.GetMeta(Filename);
			if ( Meta.ContentChunks )
			{
				if ( this.Cache[Filename] === false )
					throw `We have chunks, but cache is false (error), shouldn't hit this combination, something has errored but we still have chunks (still downloading?)`;
				//Debug(`Skipping chunk resolve of ${Filename} x${Meta.ContentChunks.length} chunks`);
				return Meta.ContentChunks;
			}
		}		
		
		//	if there are pending content chunks, we need to join them together
		//	as it's the first time it's been requested
		this.ResolveChunks(Filename);
		
		return this.Cache[Filename];
	}

	//	non-throwing function which returns false if the file load has errored
	GetOrFalse(Filename,ResolveChunks=true)
	{
		if (!this.Cache.hasOwnProperty(Filename))
			return false;
		
		//	gr: send back chunks if they haven't been resolved
		if ( !ResolveChunks )
		{
			const Meta = this.GetMeta(Filename);
			if ( Meta.ContentChunks )
			{
				if ( this.Cache[Filename] === false )
					throw `We have chunks, but cache is false (error), shouldn't hit this combination, something has errored but we still have chunks (still downloading?)`;
				//Debug(`Skipping chunk resolve of ${Filename} x${Meta.ContentChunks.length} chunks`);
				return Meta.ContentChunks;
			}
		}		
		
		//	if there are pending content chunks, we need to join them together
		//	as it's the first time it's been requested
		this.ResolveChunks(Filename);

		//	if this has failed to load, it will also be false
		const Asset = this.Cache[Filename];
		return Asset;
	}

	IsCached(Filename)
	{
		//	don't resolve chunks here, skip excess work for a simple "not false" check
		const ResolveChunks = false;
		
		return this.GetOrFalse(Filename,ResolveChunks) !== false;
	}
	
	SetKnownSize(Filename,Size)
	{
		//	update meta
		const Meta = this.GetMeta(Filename);
		Meta.Size = Size;
	}
}


