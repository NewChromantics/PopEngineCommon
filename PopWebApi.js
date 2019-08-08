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

Pop.LoadFileAsString = function(Filename)
{
	if ( !Pop._AssetCache.hasOwnProperty(Filename) )
	{
		throw "Cannot synchronously load " + Filename + ", needs to be precached first with [async] Pop.AsyncCacheAsset()";
	}
	
	//	todo: binary vs string type stuff here (and in AsyncCacheAsset)
	return Pop._AssetCache[Filename];
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

Pop.GetExeArguments = function()
{
	return [];
}

Pop.Yield = function(Milliseconds)
{
	let Callbacks = {};
	let PromiseHandler = function(Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	setTimeout( Callbacks.Resolve, Milliseconds );
	return Prom;
}


Pop.LeapMotion = {};

Pop.LeapMotion.Input = function()
{
	throw "Leap motion not supported";
}

//	probably should have a seperate file for these modules
Pop.Opengl = {};

Pop.Opengl.Window = function(Name)
{
	this.OnRender = function(){}
	
	//	setup canvas element, webgl context etc
}


Pop.Gui = {};

//	todo: DOM wrapper for gui
Pop.Gui.Window = function(Name,Rect,Resizable)
{
	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		Div.style.position = 'absolute';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Div.innerText = 'Pop.Gui.Window';
		Parent.appendChild( Div );
		return Div;
	}
	
	this.EnableScrollbars = function(Horizontal,Vertical)
	{
		
	}

	this.Element = this.CreateElement(document.body);
}

Pop.Gui.Label = function(Parent, Rect)
{
	this.SetValue = function(Value)
	{
		this.Element.innerText = Value;
	}

	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		Div.style.position = 'relative';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Div.innerText = 'Pop.Gui.Label';
		Parent.appendChild( Div );
		return Div;
	}

	this.Element = this.CreateElement(Parent.Element);
}


Pop.Gui.Slider = function(Parent,Rect,Notches)
{
	this.SetMinMax = function(Min,Max)
	{
		
	}
	
	this.SetValue = function(Value)
	{
		
	}
	
	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		Div.style.position = 'relative';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Div.innerText = 'Pop.Gui.Slider';
		Parent.appendChild( Div );
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
}



Pop.Gui.TickBox = function(Parent,Rect)
{
	this.Value = false;
	this.Label = '';
	
	this.SetValue = function(Value)
	{
		this.Value = Value;
		this.RefreshLabel();
	}
	
	this.SetLabel = function(Value)
	{
		this.Label = Value;
		this.RefreshLabel();
	}
	
	this.RefreshLabel = function()
	{
		let TickString = this.Value ? '[true]' : '[false]';
		this.Element.innerText = TickString + ' ' + this.Label;
	}

	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		Div.style.position = 'relative';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Parent.appendChild( Div );
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
	this.RefreshLabel();
}
