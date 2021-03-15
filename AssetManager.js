const PopAssetManager = {};
export default PopAssetManager;

import {GetUniqueHash} from './Hash.js'


//	AssetCacheContexts[ContextHash][AssetName] = CachedAsset
PopAssetManager.AssetCacheContexts = {};

//	put this somewhere else
//		AssetFetchFunctions[Name] = function(Context)
//	where the function takes a context (eg. render context) and returns the apporiate asset or throws if not loaded
PopAssetManager.AssetFetchFunctions = {};

//	for shaders (later more files?) multiple-filenames => asset name need to be identifiable/split/joined but we
//	need to distinguish them from valid filename chars. Not much in unix/osx is invalid...
PopAssetManager.AssetFilenameJoinString = ':';

//	bindings if using as module
PopAssetManager.GetAsset = GetAsset;
PopAssetManager.RegisterShaderAssetFilename = RegisterShaderAssetFilename;
PopAssetManager.RegisterAssetFetchFunction = RegisterAssetFetchFunction;


export function RegisterAssetFetchFunction(Filename,FetchFunction)
{
	PopAssetManager.AssetFetchFunctions[Filename] = FetchFunction;

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
	const AssetFetchFunctions = PopAssetManager.AssetFetchFunctions;
	
	let ContextKey = GetUniqueHash( RenderContext );
	if ( !Assets.hasOwnProperty(ContextKey) )
		Assets[ContextKey] = {};
	
	let ContextAssets = Assets[ContextKey];
	
	if ( ContextAssets.hasOwnProperty(Name) )
		return ContextAssets[Name];
	
	if ( !AssetFetchFunctions.hasOwnProperty(Name) )
		throw "No known asset named "+ Name;
	
	Pop.Debug("Generating asset "+Name+"...");
	const Timer_Start = Pop.GetTimeNowMs();
	ContextAssets[Name] = AssetFetchFunctions[Name]( RenderContext );
	
	if ( ContextAssets[Name] === undefined )
		throw `Asset created for ${Name} is undefined`;
	
	const Timer_Duration = Math.floor(Pop.GetTimeNowMs() - Timer_Start);
	Pop.Debug("Generating asset "+Name+" took "+Timer_Duration + "ms");
	OnAssetChanged( Name );
	return ContextAssets[Name];
}


//	this returns the "asset name"
export function RegisterShaderAssetFilename(FragFilename,VertFilename)
{
	const AssetFetchFunctions = PopAssetManager.AssetFetchFunctions;

	function LoadAndCompileShader(RenderContext)
	{
		const FragShaderContents = Pop.LoadFileAsString(FragFilename);
		const VertShaderContents = Pop.LoadFileAsString(VertFilename);
		const Shader = Pop.GetShader( RenderContext, FragShaderContents, VertShaderContents );
		return Shader;
	}

	//	we use / as its not a valid filename char
	const AssetName = FragFilename+PopAssetManager.AssetFilenameJoinString+VertFilename;
	if ( AssetFetchFunctions.hasOwnProperty(AssetName) )
		throw "Shader asset name clash, need to change the name we use";
	
	RegisterAssetFetchFunction(AssetName,LoadAndCompileShader);
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
	// Pop.Debug(`InvalidateAsset ${Filename}`);
	
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


