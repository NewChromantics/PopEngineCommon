//	namespace
let Pop = {};

Pop._AssetCache = [];

//	alias
Pop.Debug = console.log;





Pop.LoadFileAsStringAsync = async function(Filename)
{
	const Fetched = await fetch(Filename);
	Pop.Debug( "Fetched", Fetched );
	const Contents = Fetched.text();
	Pop.Debug( "Contents", Contents );
	return Contents;
}

Pop.AsyncCacheAsset = async function(Filename)
{
	if ( Pop._AssetCache.hasOwnProperty(Filename) )
	{
		Pop.Debug("Asset " + Filename + " already cached");
		return;
	}
	
	const Contents = await Pop.LoadFileAsStringAsync(Filename);
	Pop._AssetCache[Filename] = Contents;
}

Pop.CompileAndRun = function(Source,Filename)
{
	let OnLoaded = function(x)
	{
		Pop.Debug(Filename + " script loaded",this,x);
	}
	let OnError = function(x)
	{
		Pop.Debug(Filename + " script error",this,x);
	}
	
	//	create a new script element and execute immediately
	const Script = document.createElement('script');
	Script.type = 'text/javascript';
	Script.async = false;
	//Script.src = Source;
	Script.text = Source;
	Script.onload = Script.onreadystatechange = OnLoaded;
	Script.onerror = OnError;
	
	document.head.appendChild( Script );
	
	//	note: normal API returns evaluation result here, not that we usually use it...
}
