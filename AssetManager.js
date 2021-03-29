const PopAssetManager = {};
export default PopAssetManager;

import {GetUniqueHash} from './Hash.js'
//	gr:this import is crashing native
//	need to fix this. Shaders or any type-specific asset stuff shouldn't really be in here anyway
//import * as Opengl from './PopWebOpenglApi.js'

//	AssetCacheContexts[ContextHash][AssetName] = CachedAsset
PopAssetManager.AssetCacheContexts = {};
PopAssetManager.AssetPendingContexts = {};	//	promises of pending loads

//	put this somewhere else
//		AssetFetchFunctions[Name] = function(Context)
//	where the function takes a context (eg. render context) and returns the apporiate asset or throws if not loaded
PopAssetManager.AssetFetchFunctions = {};
PopAssetManager.AssetFetchAsyncFunctions = {};

//	for shaders (later more files?) multiple-filenames => asset name need to be identifiable/split/joined but we
//	need to distinguish them from valid filename chars. Not much in unix/osx is invalid...
PopAssetManager.AssetFilenameJoinString = ':';

//	bindings if using as module
PopAssetManager.GetAsset = GetAsset;
PopAssetManager.RegisterShaderAssetFilename = RegisterShaderAssetFilename;
PopAssetManager.RegisterAssetFetchFunction = RegisterAssetFetchFunction;
PopAssetManager.RegisterAssetAsyncFetchFunction = RegisterAssetAsyncFetchFunction;

export function RegisterAssetFetchFunction(Filename,FetchFunction)
{
	PopAssetManager.AssetFetchFunctions[Filename] = FetchFunction;

	//	auto invalidate the old asset, we're assuming there's a change
	InvalidateAsset(Filename);
	
	return Filename;
}

export function RegisterAssetAsyncFetchFunction(Filename,FetchFunction)
{
	PopAssetManager.AssetFetchAsyncFunctions[Filename] = FetchFunction;
	/*
	if ( PopAssetManager.AssetFetchAsyncPending.hasOwnProperty(Filename) )
	{
		Pop.Warning(`Async asset function registered, and a load is pending, we need to handle this`);
	}
*/
	//	auto invalidate the old asset, we're assuming there's a change
	InvalidateAsset(Filename);
	
	return Filename;
}

function OnAssetChanged()
{
	
}


export function GetAsset(Name,RenderContext)
{
	const Assets = PopAssetManager.AssetCacheContexts;
	const Pendings = PopAssetManager.AssetPendingContexts;
	const AssetFetchFunctions = PopAssetManager.AssetFetchFunctions;
	const AssetFetchAsyncFunctions = PopAssetManager.AssetFetchAsyncFunctions;
	
	const ContextKey = GetUniqueHash( RenderContext );
	if ( !Assets.hasOwnProperty(ContextKey) )
		Assets[ContextKey] = {};
	if ( !Pendings.hasOwnProperty(ContextKey) )
		Pendings[ContextKey] = {};
	
	const ContextAssets = Assets[ContextKey];
	const ContextPendings = Pendings[ContextKey];
	
	//	already loaded, return cached asset
	if ( ContextAssets.hasOwnProperty(Name) )
		return ContextAssets[Name];
	
	if ( !AssetFetchAsyncFunctions.hasOwnProperty(Name) )
		if ( !AssetFetchFunctions.hasOwnProperty(Name) )
			throw `No known asset named ${Name} registered`;
	
	Pop.Debug(`Generating asset ${Name} on context ${ContextKey}...`);
	const Timer_Start = Pop.GetTimeNowMs();
	
	//	check if an async load is pending
	if ( ContextPendings[Name] )
		throw `Asset ${Name} on context ${ContextKey} is async-loading still...`;
	
	function OnLoadedAsset(Asset)
	{
		//	set cache
		ContextAssets[Name] = Asset;
		
		//	delete pending
		ContextPendings[Name] = null;
		
		if ( Asset === undefined )
			throw `Asset created for ${Name} on context ${ContextKey} is undefined`;
		
		const Timer_Duration = Math.floor(Pop.GetTimeNowMs() - Timer_Start);
		Pop.Debug(`Generating asset ${Name}(${typeof Asset}) on context ${ContextKey} took ${Timer_Duration}ms`);
		Pop.Debug(`Completed asset=${ContextAssets[Name]}`);
		OnAssetChanged( Name );
	}
	
	function OnFailedToLoadAsset(Error)
	{
		Pop.Warning(`todo: handle failed async loading of ${Name}! ${Error}`);
		delete ContextPendings[Name];
	}
	
	//	start async load
	if ( AssetFetchAsyncFunctions.hasOwnProperty(Name) )
	{
		const LoadFunc = AssetFetchAsyncFunctions[Name];
		ContextPendings[Name] = LoadFunc( RenderContext );
		ContextPendings[Name].then( OnLoadedAsset ).catch( OnFailedToLoadAsset );
		throw `Asset ${Name} on context ${ContextKey} is now async loading...`;
	}
	else
	{
		//	immediate load
		const Asset = AssetFetchFunctions[Name]( RenderContext );
		OnLoadedAsset(Asset);
		return ContextAssets[Name];
	}
}

//	this returns the "asset name"
//	gr: should this be somewhere else, not in the core asset manager?
export function RegisterShaderAssetFilename(FragFilename,VertFilename,ShaderUniforms,ShaderAttribs)
{
	//	we use / as its not a valid filename char
	const AssetName = FragFilename+PopAssetManager.AssetFilenameJoinString+VertFilename;

	async function LoadAndCompileShader(RenderContext)
	{
		const ShaderName = AssetName;
		let FragSource = Pop.LoadFileAsString(FragFilename);
		let VertSource = Pop.LoadFileAsString(VertFilename);

		FragSource = RefactorFragShader(FragSource);
		VertSource = RefactorVertShader(VertSource);

		//const Shader = new Pop.Opengl.Shader( RenderContext, ShaderName, VertSource, FragSource );
		//const Shader = new Opengl.Shader( RenderContext, ShaderName, VertSource, FragSource );
		Pop.Debug(`LoadAndCompileShader ${AssetName}`);
		const Shader = await RenderContext.CreateShader( VertSource, FragSource, ShaderUniforms, ShaderAttribs );
		return Shader;
	}

	RegisterAssetAsyncFetchFunction(AssetName,LoadAndCompileShader);
	return AssetName;
}



//	modify object, but don't store a reference to it! otherwise it wont garbage collect
const ContextUniqueHashCounter = [1000];
function GetContextUniqueHash(Object)
{
	let HashPrefix = 'object_hash#';
	
	//	the string is the hash
	if ( typeof Object == 'string' )
		return Object;
	
	if ( typeof Object != 'object' )
		throw "Need to work out how to store unique hash on a " + (typeof Object);
	
	//	objects are passed by reference, so we can add a hash
	if ( Object._UniqueHash !== undefined )
		return Object._UniqueHash;
	
	ContextUniqueHashCounter[0]++;
	Object._UniqueHash = HashPrefix + ContextUniqueHashCounter[0];
	// Pop.Debug("Created new hash for object: " + Object._UniqueHash );
	
	return Object._UniqueHash;
}

export function InvalidateAsset(Filename,ForceInvalidation=false,NewFileMeta=undefined)
{
	const Assets = PopAssetManager.AssetCacheContexts;

	if ( !Filename )
		throw `InvalidateAsset(${Filename}) invalid filename`;
	Pop.Debug(`InvalidateAsset ${Filename}`);
	
	function InvalidateAssetInContext(Context)
	{
		const ContextKey = GetContextUniqueHash( Context );
		const ContextAssets = Assets[ContextKey];
		
		//	gr: cope with assetnames containing multiple filenames
		function ShouldInvalidateKey(AssetName)
		{
			const Filenames = AssetName.split(PopAssetManager.AssetFilenameJoinString);
			const AnyMatches = Filenames.some( f => f == Filename );
			return AnyMatches;
		}
		
		const InvalidateKeys = Object.keys( ContextAssets ).filter( ShouldInvalidateKey );
		if ( !InvalidateKeys.length )
		{
			// Pop.Debug("Context",Context," has no matching assets for ",Filename,Object.keys(ContextAssets));
			return;
		}
		
		function InvalidateKey(AssetName)
		{
			//	if we've reached this point, we have an asset
			const Asset = ContextAssets[AssetName];
			
			//	for streaming assets, we dont want to just destroy & reload the asset
			//	if we dont need to (ie, we already have enough data, like with audio, avoid re-seeking and clicking)
			if ( Asset.ShouldInvalidateWithNewFile )
			{
				if ( !ForceInvalidation && NewFileMeta )
				{
					if ( !Asset.ShouldInvalidateWithNewFile(Context,NewFileMeta.Contents,NewFileMeta) )
					{
						Pop.Debug(`Skipped asset invalidation ${Filename}`);
						return;
					}
				}
			}
			
			//	delete existing asset
			//	if it has a cleanup func, call it
			if ( Asset.Free )
			{
				Pop.Debug(`Freeing asset ${AssetName}...`);
				try
				{
					Asset.Free();
				}
				catch(e)
				{
					Pop.Debug(`Erroring freeing asset ${AssetName}: ${e}`);
				}
			}
			//	delete from context cache (note: must use array accessor!)
			delete ContextAssets[AssetName];
			// Pop.Debug(`Invalidated ${AssetName} on ${Context}`,Context);
		}
		InvalidateKeys.forEach( InvalidateKey );
	}
	const AssetContexts = Object.keys(Assets);
	AssetContexts.forEach( InvalidateAssetInContext );
	
	//	todo; this should be OnAssetChanged(AssetName), not just filename (eg. shaders)
	//	so code above should accumulate unique asset name and then call here after
	OnAssetChanged(Filename);
}


