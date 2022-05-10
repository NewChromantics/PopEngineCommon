//	pick a better name! quick!
const ElementName = `popengine-canvas`;
export default ElementName;


import Pop from './PopEngine.js'
import Camera_t from './Camera.js'
import AssetManager from './AssetManager.js'
import {CompileShader} from './AssetManager.js'
import {CreatePromise} from './PromiseQueue.js'

export class Renderer_t
{
	constructor(Canvas,GetRenderCommands,XrOnWaitForCallback)
	{
		//	content
		this.Camera = new Camera_t();
		this.Camera.LookAt = [0,1.5,0.0];
		this.Camera.FovVertical = 80;
		const Distance = 3.0;
		this.Camera.Position = [-Distance,2.0,-Distance];

		//	control
		this.Running = true;
		this.RenderingPromise = this.RenderThread( Canvas, GetRenderCommands, XrOnWaitForCallback );
	}
	
	GetRenderContext()
	{
		return this.RenderContext;
	}
	
	Free()
	{
		this.Running = false;
	}
	
	
	async RenderThread(Canvas,GetRenderCommands,XrOnWaitForCallback)
	{
		this.RenderView = new Pop.Gui.RenderView(null,Canvas);
		this.RenderContext = new Pop.Opengl.Context(this.RenderView);
		
		this.BindMouseCameraControls( this.RenderView );
	
		//	nicest way atm to pause rendering whilst xr is rendering
		let LastXrRenderTime = null;

		const GetXrRenderCommands = (RenderContext,Camera)=>
		{
			LastXrRenderTime = GetTimeNowMs();
			
			//const ScreenRect = this.RenderView.GetScreenRect();
			const ScreenRect = [0,0,100,100];
			//await this.UpdateAssets(RenderContext);
			//const RenderCommands = this.RenderContent.GetRenderCommands(RenderContext,Camera,ScreenRect);
			const RenderCommands = GetRenderCommands( RenderContext,Camera,ScreenRect);
			return RenderCommands;
		};
		
		async function XrLoop(XrOnWaitForCallback)
		{
			while ( this.Running )
			{
				try
				{
					console.log(`Waiting for xr device...`);
					const Device = await Pop.Xr.CreateDevice( this.RenderContext, GetXrRenderCommands, XrOnWaitForCallback );
					//	should wait to finish now...
					await Device.WaitForEnd();
				}
				catch(e)
				{
					console.error(`Failed to create xr ${e}`);
					await Pop.Yield(1*1000);
				}
			}
		}
		//	xr works, but desktop is reporting it has some XR support when it doesnt... (so button first appears)
		//XrLoop.call(this,this.XrOnWaitForCallback.bind(this));
		
		while ( this.Running )
		{
			//await this.RenderContent.UpdateAssets(this.RenderContext);
			
			if ( LastXrRenderTime )
			{
				const TimeSinceXrRender = GetTimeNowMs() - LastXrRenderTime;
				if ( TimeSinceXrRender < 3*1000 )
				{
					await Pop.Yield(1000);
					continue;
				}
			}
			
			const ScreenRect = this.RenderView.GetScreenRect();
			const Camera = this.Camera;
			const RenderCommands = GetRenderCommands( this.RenderContext,Camera,ScreenRect);
			//const RenderCommands = this.RenderContent.GetRenderCommands(this.RenderContext,Camera,ScreenRect);
			await this.RenderContext.Render(RenderCommands);
		}
	}
	
	GetCameraUniforms(Camera,ScreenRect)
	{
		const w = ScreenRect[2];
		const h = ScreenRect[3];
		const Viewport = [0,0,w/w,h/w];
		
		const Uniforms = {};
		Uniforms.CameraToViewTransform = Camera.GetProjectionMatrix(Viewport);
		Uniforms.WorldToCameraTransform = Camera.GetWorldToCameraMatrix();
		return Uniforms;
	}
	

	BindMouseCameraControls(RenderView)
	{
		const Camera = this.Camera;
		let MoveScalar = 10;
		
		RenderView.OnMouseDown = function(x,y,Button,FirstDown=true)
		{
			if ( Button == 'Left' )
				Camera.OnCameraOrbit( x, y, 0, FirstDown!=false );
				
				
			if ( Button == 'Right' )
			{
				x *= MoveScalar;
				y *= MoveScalar;
				Camera.OnCameraPanLocal( x, y, 0, FirstDown!=false );
			}
		}
		
		RenderView.OnMouseMove = function(x,y,Button)
		{
			RenderView.OnMouseDown( x, y, Button, false );
		}
		
		RenderView.OnMouseScroll = function(x,y,Button,Delta)
		{
		x *= MoveScalar;
		y *= MoveScalar;
		Delta[1] *= MoveScalar;
		
			//	zoom clamps to lookat, panlocalz moves lookat
			Camera.OnCameraPanLocal( x, y, 0, true );
			Camera.OnCameraPanLocal( x, y, -Delta[1] * 10.0, false );
			//Camera.OnCameraZoom( -Delta[1] * 0.1 );
		}.bind(this);
	}
}




export class PopEngineCanvas extends HTMLElement 
{
	constructor()
	{
		super();
	
		//	the pop assetmanager is still a singleton atm
		this.AssetManager = AssetManager;

		this.DomEvents = {};	//	cached dom events eg. 'load'(onload) 'dataevent'(ondataevent)
		this.Renderer = null;
		this.LoadedPromise = CreatePromise();
	}

	static ElementName()	{	return ElementName;	}
	ElementName()			{	return PopEngineCanvas.ElementName();	}
	
	static get observedAttributes() 
	{
		return ['css'];
	}
	
	//	url for css file to include in <style>
	get css()			{	return this.getAttribute('css');	}
	
	GetCssContent()
	{
		const ImportCss = this.css ? `@import "${this.css}";` : '';
		const Css = `
		${ImportCss}
		
		/* these can all be overriden by host */
		:host
		{
			background:	#333;
			position:	relative;
			display:	block;
			min-width:	20px;
			min-height:	20px;
		}
		
		canvas
		{
			position:	absolute;
			top:		0px;
			left:		0px;
			right:		0px;
			bottom:		0px;
			width:		100%;
			height:		100%;
		}
		
		#StartXr
		{
			visibility:	hidden;
			padding:	0.5em;
			opacity:	0.6;
			xbackground:	rgba(0,0,0,0.5);
			xcolor:		#eee;
			position:	absolute;
			font-size:	200%;
			top:		1em;
			left:		1em;
			height:		3.0em;
			width:		8em;
		}

		`;
		return Css;
	}
	
	attributeChangedCallback(name, oldValue, newValue) 
	{
		//	todo: only update style if some css relative variables change
		if ( this.Style )
			this.Style.textContent = this.GetCssContent();
	}
	
	connectedCallback()
	{
		//	move any children in the html onto our dom
		//	Create a shadow root
		this.Shadow = this.attachShadow({mode: 'open'});
		
		this.CreateDom(this.Shadow);
		
		//	initialise
		this.attributeChangedCallback();
		
		//	this is for DOM load reporting
		//	not part of HTMLMediaPlayer
		this.OnLoad(this);
	}
	
	disconnectedCallback()
	{
		this.FreePlayer();
	}
	
	CreateDom(Parent)
	{
		this.CanvasElement = document.createElement('canvas');
		this.Style = document.createElement('style');
		this.StartXrButton = document.createElement('button');
		this.StartXrButton.id = 'StartXr';
		this.StartXrButton.innerHTML = 'Start XR';
		
		// attach the created elements to the shadow dom
		Parent.appendChild(this.Style);
		Parent.appendChild(this.CanvasElement);
		Parent.appendChild(this.StartXrButton);
		
		//	start render thread now we have a canvas
		this.RenderThreadPromise = this.RenderThread().catch(this.OnError.bind(this));
	}
	
	OnDebug(Debug)
	{
		console.log(`${this.ElementName()}; ${Debug}`);
	}

	CallDomEvent(DomEventName,Arguments=[])
	{
		//	cache ondataevent attribute into a functor
		if ( !this.DomEvents[DomEventName] && this.hasAttribute(`on${DomEventName}`) )
		{
			const EventFunctionString = this.getAttribute(`on${DomEventName}`);
			this.DomEvents[DomEventName] = window.Function(EventFunctionString);
		}

		//if ( !this.DomEvents[DomEventName] && this.hasOwnProperty(`on${DomEventName}`) )
		if ( !this.DomEvents[DomEventName] && this[`on${DomEventName}`] )
		{
			this.DomEvents[DomEventName] = this[`on${DomEventName}`];
		}

		//	todo: dispatch event for addListener support
		//this.dispatchEvent( new CustomEvent(DomEventName) )

		const Event = this.DomEvents[DomEventName];
		if ( Event )
		{
			try
			{
				return Event(...Arguments);
			}
			catch(e)
			{
				console.error(`on${DomEventName} exception; ${e}`);
			}
		}
		return null;
	}
	
	OnError(Error)
	{
		Error = `${Error}`;
		console.error(Error);
		this.CallDomEvent('error', arguments );
	}
	
	OnLoad()
	{
		this.CallDomEvent('load', arguments );
	}
	
	FreePlayer()
	{
		if ( this.Renderer )
		{
			this.Renderer.Free();
			this.Renderer = null;
		}
	}
	
	XrOnWaitForCallback(OnClickedStart)
	{
		const Button = this.StartXrButton;
		
		//	enable xr button, wait for click
		function OnClick()
		{
			Button.style.visibility = 'hidden';
			OnClickedStart();
		}
		
		Button.style.visibility = 'visible';
		Button.onclick = OnClick;
	}
	
	async RenderThread()
	{
		function GetRenderCommands(RenderContext,Camera,ScreenRect)
		{
			//	convert new rendercommands (names for assets)
			//	to old system (assets)
			//	we will move this at some point to the engine
			//	when we figure out how to deal with images in the same way
			function UpdateRenderCommand(Command)
			{
				if ( !Command )	return;
				if ( Command[0] == 'Draw' )
				{
					//	geo
					Command[1] = this.AssetManager.GetAsset(Command[1],RenderContext);
					//	shader
					Command[2] = this.AssetManager.GetAsset(Command[2],RenderContext);
				}
			}
					
			try
			{
				//	dont send render context to external commands any more
				const GetRenderCommandsArgs = [Camera,ScreenRect];
				const ExternalCommands = this.CallDomEvent('getrendercommands',GetRenderCommandsArgs);
				if ( !ExternalCommands )
					throw `No external commands returned from event`;
				//	gr; should this make a copy?
				ExternalCommands.forEach( UpdateRenderCommand.bind(this) );
				return ExternalCommands;
			}
			catch(e)
			{
				console.error(e);

				this.SomeCounter = (this.SomeCounter||0)+1;
				let Green = (this.SomeCounter % 60) / 60;
				const Clear = ['SetRenderTarget',null,[1,Green,0]];
				//const Clear = ['SetRenderTarget',null,ClearColour];
				return [Clear];
			}
		}
		
		//	this has its own render thread
		this.Renderer = new Renderer_t(this.CanvasElement, GetRenderCommands.bind(this) );
		this.LoadedPromise.Resolve();
	}
	
	//	todo: turn this into a more generic RegisterAsset() and assume the user uses the right names in the right places
	RegisterGeometry(Name,GetGeometryAsync)
	{
		async function FetchTriangleBuffer(RenderContext)
		{
			const Geometry = await GetGeometryAsync();
			const TriangleBuffer = await RenderContext.CreateGeometry(Geometry);
			return TriangleBuffer;
		}
		this.AssetManager.RegisterAssetAsyncFetchFunction(Name,FetchTriangleBuffer);
	}
	
	RegisterShader(Name,GetShaderSourceAsync)
	{
		async function FetchShader(RenderContext)
		{
			const [VertSource,FragSource,Macros] = await GetShaderSourceAsync();
			const Shader = await CompileShader( RenderContext, Name, VertSource, FragSource, Macros );
			return Shader;
		}
		this.AssetManager.RegisterAssetAsyncFetchFunction(Name,FetchShader);
	}

	async WaitForLoad()
	{
		return this.LoadedPromise;
	}
	
	GetRenderContext()
	{
		if ( !this.Renderer )
			return null;
		return this.Renderer.GetRenderContext();
	}
}	

window.customElements.define( PopEngineCanvas.ElementName(), PopEngineCanvas );

