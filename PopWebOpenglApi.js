import PopImage from './PopWebImageApi.js'
import * as Pop from './PopWebApi.js'
const Default = 'Pop Opengl module';
export default Default;
import {GetUniqueHash} from './Hash.js'
import {CreatePromise} from './PopApi.js'
import Pool from './Pool.js'
import {IsTypedArray} from './PopApi.js'
import DirtyBuffer from './DirtyBuffer.js'
import { ExtractShaderUniforms } from './Shaders.js'
import { CleanShaderSource,RefactorFragShader,RefactorVertShader} from './OpenglShaders.js'
import { GetFormatElementSize,GetChannelsFromPixelFormat,IsFloatFormat } from './PopWebImageApi.js'



//	counters for debugging
export const Stats = {};
Stats.TrianglesDrawn = 0;
Stats.BatchesDrawn = 0;
Stats.GeometryBindSkip = 0;
Stats.ShaderBindSkip = 0;
Stats.GeometryBinds = 0;
Stats.ShaderBinds = 0;
Stats.Renders = 0;


//	mobile typically can not render to a float texture. Emulate this on desktop
//	gr: we now test for this on context creation.
//		MAYBE this needs to be per-context, but it's typically by device
//		(and we typically want to know it without a render context)
//		set to false to force it off (eg. for testing on desktop against
//		ios which doesn't support it [as of 13]
//	gr: mac safari 14.0.3 seems to not error at float texture support, but just writes zeroes
//		tested filters, clamping, POW sizes...
export let CanRenderToFloat = undefined;

//	allow turning off float support
export let AllowFloatTextures = !Pop.GetExeArguments().DisableFloatTextures;

const AllowMultiView = true;

export function GetString(Context,Enum)
{
	const gl = Context;
	const Enums =
	[
	 'FRAMEBUFFER_COMPLETE',
	 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT',
	 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT',
	 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS',
	 'FRAMEBUFFER_UNSUPPORTED',
	 //	webgl2
	 'FRAMEBUFFER_INCOMPLETE_MULTISAMPLE',
	 'FRAMEBUFFER_INCOMPLETE_VIEW_TARGETS_OVR',
	];
	const EnumValues = {};
	//	number -> string
	function PushEnum(EnumString)
	{
		const Key = gl[EnumString];
		if ( Key === undefined )
			return;
		EnumValues[Key] = EnumString;
	}
	Enums.forEach(PushEnum);
	if ( EnumValues.hasOwnProperty(Enum) )
		return EnumValues[Enum];
	
	return "<" + Enum + ">";
}

function GetUniformOrAttribMeta(Context,Program,Uniform)
{
	const gl = Context;
	const Meta = {};
	
	Meta.ElementCount = Uniform.size;
	Meta.ElementSize = undefined;
			
	//	match name even if it's an array
	//	todo: struct support
	Meta.Name = Uniform.name.split('[')[0];
	//	note: uniform consists of structs, Array[Length] etc

	let AttribLocation = gl.getAttribLocation( Program, Uniform.name );
	let UniformLocation = gl.getUniformLocation( Program, Uniform.name );
	//	invalid attribs are -1 or number
	//	invalid uniforms are null or WebGLUniformLocation
	AttribLocation = (AttribLocation == -1) ? null : AttribLocation;
	Meta.Location = UniformLocation || AttribLocation;
	Meta.GlType = Uniform.type;
	Meta.ElementType = Uniform.type;
	Meta.ElementRows = 1;
	
	switch( Uniform.type )
	{
		//	samplers' value is the texture index
		case gl.SAMPLER_2D:	
		case gl.SAMPLER_2D_ARRAY:
		case gl.SAMPLER_CUBE:
		case gl.SAMPLER_3D:
		case gl.INT:
		case gl.UNSIGNED_INT:
		case gl.BOOL:
			Meta.ElementSize = 1;
			Meta.SetValues = function(v)	{	gl.uniform1iv( Meta.Location, v );	};
			break;
		case gl.FLOAT:
			Meta.ElementSize = 1;
			Meta.SetValues = function(v)	{	gl.uniform1fv( Meta.Location, v );	};
			break;
		case gl.FLOAT_VEC2:
			Meta.ElementType = gl.FLOAT;
			Meta.ElementSize = 2;
			Meta.SetValues = function(v)	{	gl.uniform2fv( Meta.Location, v );	};
			break;
		case gl.FLOAT_VEC3:
			Meta.ElementType = gl.FLOAT;
			Meta.ElementSize = 3;
			Meta.SetValues = function(v)	{	gl.uniform3fv( Meta.Location, v );	};
			break;
		case gl.FLOAT_VEC4:
			Meta.ElementType = gl.FLOAT;
			Meta.ElementSize = 4;
			Meta.SetValues = function(v)	{	gl.uniform4fv( Meta.Location, v );	};
			break;
		case gl.FLOAT_MAT2:
			Meta.ElementType = gl.FLOAT;
			Meta.ElementSize = 2*2;
			Meta.ElementRows = 2;
			Meta.SetValues = function(v)	{	const Transpose = false;	gl.uniformMatrix2fv( Meta.Location, Transpose, v );	};
			break;
		case gl.FLOAT_MAT3:
			Meta.ElementType = gl.FLOAT;
			Meta.ElementSize = 3*3;
			Meta.ElementRows = 3;
			Meta.SetValues = function(v)	{	const Transpose = false;	gl.uniformMatrix3fv( Meta.Location, Transpose, v );	};
			break;
		case gl.FLOAT_MAT4:
			Meta.ElementType = gl.FLOAT;
			Meta.ElementSize = 4*4;
			Meta.ElementRows = 4;
			Meta.SetValues = function(v)	{	const Transpose = false;	gl.uniformMatrix4fv( Meta.Location, Transpose, v );	};
			break;

		default:
			Meta.SetValues = function(v)	{	throw `Unhandled type ${Uniform.type} on ${Uniform.name}`;	};
			break;
	}
	return Meta;
}


//	gl.isFrameBuffer is expensive! probably flushing
const TestFrameBuffer = false;

//	gr; VAO's are current disabled whilst attrib locations are fixed.
//		and now we're using attribs properly, disable before enable!
const DisableOldVertexAttribArrays = true;
const AllowVao = false;//!Pop.GetExeArguments().DisableVao;

//	I was concerned active texture was being used as render target and failing to write
const CheckActiveTexturesBeforeRenderTargetBind = false;	
const UnbindActiveTexturesBeforeRenderTargetBind = false;

//	if we fail to get a context (eg. lost context) wait this long before restarting the render loop (where it tries again)
//	this stops thrashing cpu/system whilst waiting
const RetryGetContextMs = 1000;


//	need a generic memory heap system in Pop for js side so
//	we can do generic heap GUIs
class HeapMeta
{
	constructor(Name)
	{
		this.AllocCount = 0;
		this.AllocSize = 0;
	}
	
	OnAllocated(Size)
	{
		if ( isNaN(Size) )
			throw "Bad size " + Size;
		this.AllocCount++;
		this.AllocSize += Size;
	}
	
	OnDeallocated(Size)
	{
		if ( isNaN(Size) )
			throw "Bad size " + Size;
		this.AllocCount--;
		this.AllocSize -= Size;
	}
}





//	temp copy of SetGuiControlStyle, reduce dependcy, but we also want the openglwindow to become a basecontrol dervied "view"
function Pop_Opengl_SetGuiControlStyle(Element,Rect)
{
	if ( !Rect )
		return;
	
	//	to allow vw/% etc, we're using w/h now
	//	also, if you have bottom, but no height,
	//	you need block display to make that style work
	
	function NumberToPx(Number)
	{
		if ( typeof Number != 'number' )
			return Number;
		return Number + 'px';
	}
	const RectCss = Rect.map(NumberToPx);
	Element.style.position = 'absolute';
	Element.style.left = RectCss[0];
	Element.style.top = RectCss[1];
	Element.style.width = RectCss[2];
	Element.style.height = RectCss[3];
	//Element.style.border = '1px solid #0f0';
}

//	temp copy of SetGuiControlStyle, reduce dependcy, but we also want the openglwindow to become a basecontrol dervied "view"
function Pop_Opengl_SetGuiControl_SubElementStyle(Element,LeftPercent=0,RightPercent=100)
{
	Element.style.display = 'block';
	//	this makes it overflow, shouldn't be needed?
	//Element.style.width = (RightPercent-LeftPercent) + '%';
	Element.style.position = 'absolute';
	Element.style.left = LeftPercent + '%';
	Element.style.right = (100-RightPercent) + '%';
	Element.style.top = '0px';
	Element.style.bottom = '0px';
}



async function WaitForSync(Sync,Context)
{
	const gl = Context;
	
	const RecheckMs = 1000/100;
	async function CheckSync()
	{
		const Flags = 0;
		const WaitNanoSecs = 0;
		while(true)
		{
			const Status = gl.clientWaitSync( Sync, Flags, WaitNanoSecs );
			if ( Status == gl.WAIT_FAILED )
				throw `clientWaitSync failed`;
			if ( Status == gl.TIMEOUT_EXPIRED )
			{
				await Pop.Yield( RecheckMs );
				continue;
			}
			//	ALREADY_SIGNALED
			//	CONDITION_SATISFIED
			break;
		}
	}
	return CheckSync();
}



//	parsed geometry info
class TCreateGeometry
{
}

//	matching native workflow
//	return TCreateGeometry from geo VertexAttribute descriptions
function ParseGeometryObject(VertexAttributesObject)
{
	return VertexAttributesObject;
}



class RenderCommand_Base
{
	//get Name()	{	return this.Params[0];	}
}

class RenderCommand_SetRenderTarget extends RenderCommand_Base
{
	constructor()
	{
		super();
		this.ReadBack = false;
		this.ColourTargetImages = [];	//	if none then renders to screen
		this.DepthTargetImages = [];
		this.ClearColour = null;
	}
	
	IsDeviceRenderTarget()
	{
		return (this.ColourTargetImages.length == 0) && (this.DepthTargetImages.length == 0);
	}		
	
	static ParseCommand(Params,PushCommand)
	{
		const SetRenderTarget = new RenderCommand_SetRenderTarget();
		const ParamColourTarget = 1;
		const ParamClearColour = 2;
		const ParamReadBackFormat = 3;
		const ParamDepthTarget = 4;
		
		//	targets can be null (screen), image, or array of images
		let ColourTargets = Params[ParamColourTarget];
		if ( ColourTargets === null )
		{
			//	must not have readback format
			if ( Params[ParamReadBackFormat] != undefined )
				throw `Render-to-screen(null) target cannot not have read-back format`;
			//	nor depth
			if ( Params[ParamDepthTarget] != undefined )
				throw `Render-to-screen(null) target cannot not have depth target`;
		}
		else
		{
			//	backwards compatible/simple api allowing 1 image to be passed in
			if ( !Array.isArray(ColourTargets) )
				ColourTargets = [ColourTargets];
			
			//	need to make sure these are all images
			SetRenderTarget.ColourTargetImages.push(...ColourTargets);
		}
		
		let DepthTargets = Params[ParamDepthTarget];
		if ( DepthTargets )
		{
			//	backwards compatible/simple api allowing 1 image to be passed in
			if ( !Array.isArray(DepthTargets) )
				DepthTargets = [DepthTargets];
			
			//	need to make sure these are all images
			SetRenderTarget.DepthTargetImages.push(...DepthTargets);
		}
		
		SetRenderTarget.ReadBack = (Params[ParamReadBackFormat] === true);
		if ( Params[ParamReadBackFormat] && Params[ParamReadBackFormat] !== true )
			throw `Readback format ${Params[ParamReadBackFormat]} now expected to be true, not a format, to match MRT formats`;
		
		//	make update commands for any render targets
		for ( let Image of SetRenderTarget.ColourTargetImages )
		{
			if ( Image instanceof RenderTarget )
				continue;
			const UpdateImageCommand = new RenderCommand_UpdateImage();
			UpdateImageCommand.Image = Image;
			UpdateImageCommand.IsRenderTarget = true;
			PushCommand( UpdateImageCommand );
		}
		for ( let Image of SetRenderTarget.DepthTargetImages )
		{
			if ( Image instanceof RenderTarget )
				continue;
			const UpdateImageCommand = new RenderCommand_UpdateImage();
			UpdateImageCommand.Image = Image;
			UpdateImageCommand.IsRenderTarget = true;
			PushCommand( UpdateImageCommand );
		}
		
		//	arg 2 is clear colour, or if none provided (or zero alpha), no clear
		SetRenderTarget.ClearColour = Params[ParamClearColour];
		if ( SetRenderTarget.ClearColour )
		{
			if ( SetRenderTarget.ClearColour.length < 3 )
				throw `Clear colour provided ${Command.ClearColour.length} colours, expecting RGB or RGBA`;

			const DefaultAlpha = 1;
			if ( SetRenderTarget.ClearColour.length < 4 )
				SetRenderTarget.ClearColour.push(DefaultAlpha);
		}
		
		PushCommand(SetRenderTarget);
	}
}

class RenderCommand_UpdateImage extends RenderCommand_Base
{
	static ParseCommand(Params,PushDependentCommand)
	{
	}
	
	constructor()
	{
		super();
		this.Image = null;
		this.IsRenderTarget = false;
	}
}

//	defaults, make sure this matches native
class StateParams_t
{
	constructor(Params)
	{
		Params = Params || {};
		
		this.DepthRead = 'LessEqual';	//	need to turn true into this default
		this.DepthWrite = true;
		this.CullFacing = null;	//	null = none, 'Front' and 'Back'/true
		this.BlendMode = 'Alpha';
		
		Object.assign( this, Params );
	}
}

export class RenderCommand_Draw extends RenderCommand_Base
{
	constructor()
	{
		super();
		this.Geometry = null;
		this.Shader = null;
		this.Uniforms = {};
		this.StateParams = null;
	}
	
	static ParseCommand(Params,PushCommand)
	{
		const Draw = new RenderCommand_Draw();
		
		//	get all images used in uniforms and push an update image command
		Draw.Geometry = Params[1];
		Draw.Shader = Params[2];
		Draw.Uniforms = Params[3];
		Draw.StateParams = new StateParams_t( Params[4] );
		
		if ( !(Draw.Geometry instanceof TriangleBuffer ) )
			throw `First param isn't a triangle buffer; ${Draw.TriangleBuffer}`;
		if ( !(Draw.Shader instanceof Shader ) )
			throw `First param isn't a shader; ${Draw.Shader}`;
		
		PushCommand(Draw);
	}
		
}

class RenderCommand_ReadPixels extends RenderCommand_Base
{
}

const RenderCommandTypeMap = {};
RenderCommandTypeMap['SetRenderTarget'] = RenderCommand_SetRenderTarget;
RenderCommandTypeMap['UpdateImage'] = RenderCommand_UpdateImage;
RenderCommandTypeMap['Draw'] = RenderCommand_Draw;
RenderCommandTypeMap['ReadPixels'] = RenderCommand_ReadPixels;

function ParseRenderCommand(PushCommand,CommandParams)
{
	if ( !CommandParams )
		return;
	const Name = CommandParams[0];//.shift();
	const Type = RenderCommandTypeMap[Name];
	if ( !Type )
		throw `Unknown render command ${Name}`;
	
	Type.ParseCommand(CommandParams,PushCommand);
}		
		


//	this is just an array of commands, but holds the promise to resolve once it's rendered
export class RenderCommands_t
{
	constructor(Commands)
	{
		if ( !Array.isArray(Commands) )
			throw `Render commands expecting an array of commands`;

		//	iterate through provided commands to verify and 
		//	generate dependent commands (eg. update texture before usage)
		const NewCommands = [];
		function PushCommand(NewCommand)
		{
			NewCommands.push(NewCommand);
		}
		Commands.forEach( CommandParams => ParseRenderCommand(PushCommand,CommandParams) );
		this.Commands = NewCommands;
		this.Promise = CreatePromise();
	}	
	
	OnRendered()
	{
		this.Promise.Resolve();
	}	
	
	OnError(Error)
	{
		this.Promise.Reject(Error);
	}
}

//	this was formely Pop.Opengl.Window
//	but now it's a render context. It expects a canvas to be provided (always via a RenderView?)
//	and all the gui/interaction is handled by a Pop.Gui.RenderView
//	this should match the new Sokol context, and async-renders RenderCommands
export class Context
{
	constructor(RenderView,ContextOptions={})
	{
		//	if no renderview, create an offscreen canvas for context
		//	todo: standardise this for native
		let Canvas;
		if ( !RenderView )
		{
			const Width = 256;
			const Height = 256;
			Canvas = new OffscreenCanvas(Width,Height);
		}
		else
		{
			Canvas = RenderView.GetElement();
			if ( !(Canvas instanceof HTMLCanvasElement) )
				throw `First element of Opengl.Context now expected to be a canvas`;
		}
		
		const CanvasIsElement = Canvas instanceof HTMLCanvasElement;
		
		//	todo: rename this, leftover naming from when this was a window
		//		now it needs to be set(to false) when we want to shutdown
		this.IsOpen = true;
		
		this.CanvasElement = Canvas;		//	cached element pointer
		this.ContextOptions = ContextOptions || {};
		
		//	proper way to detect when canvas is removed from the dom (and our context should die)
		if ( CanvasIsElement )
		{
			this.CanvasMutationObserver = new MutationObserver( this.OnCanvasMutationObservation.bind(this) );
			this.CanvasMutationObserver.observe( this.CanvasElement, { childList: true } );

			this.CanvasResizeObserver = new ResizeObserver( this.OnCanvasResizeObservation.bind(this) );
			this.CanvasResizeObserver.observe( this.CanvasElement );
		}
		
		this.Context = null;
		this.ContextVersion = 0;	//	used to tell if resources are out of date

		this.RenderTarget = null;
		this.ScreenRectCache = null;
		
		this.TextureHeap = new HeapMeta("Opengl Textures");
		this.GeometryHeap = new HeapMeta("Opengl Geometry");
	
		//	by default these are off in webgl1, enabled via extensions
		this.FloatTextureSupported = false;
		this.FloatLinearTextureSupported = false;
		this.Int32TextureSupported = false;	//	depth texture 24,8
		
		this.ActiveTextureIndex = 0;
		this.ActiveTextureRef = {};
		this.TextureRenderTargets = [];	//	this is a context asset, so maybe it shouldn't be kept here
		
		this.ArrayBuffers = {};	//	cache of object-hash associated gl buffers

		this.BindEvents();
		
		try
		{
			this.RefreshCanvasResolution();
			this.InitialiseContext();
		}
		catch(e)
		{
			console.warn(`Error during render context construction; ${e}`);
		}
		this.PendingRenderCommands = [];	//	RenderCommands_t

		this.RenderLoop();
	}
	
	OnCanvasMutationObservation(Event)
	{
		Pop.Debug(`Something happened to canvas; ${Event}`);
		this.Close();
	}

	OnCanvasResizeObservation(Event)
	{
		this.InvalidateCanvasResolution();
	}

	Close()
	{
		Pop.Debug(`Opengl.Window.Close`);

		this.UnbindEvents();

		//	stop render loop
		this.IsOpen = false;

		//	destroy render context
		//	free opengl resources

		//	destroy element if we created it
		if (this.NewCanvasElement)
		{
			this.NewCanvasElement.parent.removeChild(this.NewCanvasElement);
			this.NewCanvasElement = null;
		}
		
		this.CanvasElement = null;
		if ( this.CanvasMutationObserver )
			this.CanvasMutationObserver.disconnect();
		if ( this.CanvasResizeObserver )
			this.CanvasResizeObserver.disconnect();
			
		this.CanvasMutationObserver = null;
		this.CanvasResizeObserver = null;
	}

	OnOrientationChange(ResizeEvent)
	{
		const DoResize = function ()
		{
			this.OnResize.call(this,ResizeEvent);
		}.bind(this);

		//	delay as dom doesn't update fast enough
		setTimeout(DoResize,0);
		setTimeout(DoResize,50);
		setTimeout(DoResize,100);
		setTimeout(DoResize,500);
		setTimeout(DoResize,1000);
	}

	OnResize(ResizeEvent)
	{
		Pop.Debug(`Pop.Opengl.Window OnResize type=${ResizeEvent ? ResizeEvent.type:'null'}`);
		
		//	invalidate cache
		this.ScreenRectCache = null;
	
		//	resize to original rect
		const Canvas = this.GetCanvasElement();
		this.InvalidateCanvasResolution();
	}
	
	ResetActiveTextureSlots()
	{
		this.ActiveTextureIndex = 0;
		//	clear entries?
	}
	
	AllocTextureIndex(Image)
	{
		//	gr: make a pool or something
		//		we fixed this on desktop, so take same model
		const Index = (this.ActiveTextureIndex % 8);
		this.ActiveTextureIndex++;
	
		//	gr: only keep image reference for debugging!
		if ( CheckActiveTexturesBeforeRenderTargetBind )
			this.ActiveTextureRef[Index] = Image;	//	for debugging, check if any active textures are our target
			
		return Index;
	}
	
	GetCanvasElement()
	{
		return this.CanvasElement;
	}
	
	CreateCanvasElement(Name,Parent,Rect)
	{
		//	if element already exists, we need it to be a canvas
		//	if we're fitting inside a div, then Parent should be the name of a div
		//	we could want a situation where we want a rect inside a parent? but then
		//	that should be configured by css?

		let Element = document.getElementById(Name);

		// Check IFrames for Canvas Elements
		if (!Element)
		{
			let IFrames = document.getElementsByTagName("iframe")
			let IframeCanvases = Object.keys(IFrames).map((key) =>
			{
				let iframe = IFrames[key];
				let iframe_document = iframe.contentDocument || iframe.contentWindow.document;
				return iframe_document.getElementById(Name);
			});

			if(IframeCanvases.length > 1)
				throw `More than one Canvas with the name ${Name} found`

			Element = IframeCanvases[0]
		}

		if ( Element )
		{
			//	https://stackoverflow.com/questions/254302/how-can-i-determine-the-type-of-an-html-element-in-javascript
			//	apprently nodeName is the best case
			if ( Element.nodeName != 'CANVAS' )
				throw `Pop.Opengl.Window ${Name} needs to be a canvas, is ${Element.nodeName}`;
			return Element;
		}

		// if Rect is passed in as an object assume it is the canvas
		if (typeof Rect === 'object' && Rect !== null)
			return Rect;
		
		//	create new canvas
		this.NewCanvasElement = document.createElement('canvas');
		Element = this.NewCanvasElement;
		Element.id = Name;
		Parent.appendChild( Element );
		
		//	double check
		{
			let MatchElement = document.getElementById(Name);
			if ( !MatchElement )
				throw "Created, but failed to refind new element";
		}

		return Element;
	}
	
	BindEvents()
	{
		//	catch window resize
		//	gr: replace with specific dom watcher
		//	https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
		window.addEventListener('resize',this.OnResize.bind(this));
		window.addEventListener('orientationchange',this.OnOrientationChange.bind(this));
		
		//	https://medium.com/@susiekim9/how-to-compensate-for-the-ios-viewport-unit-bug-46e78d54af0d
		/*	this doesn't help
		window.onresize = function ()
		{
			document.body.height = window.innerHeight;
		}
		window.onresize(); // called to initially set the height.
		*/

		//	catch fullscreen state change
		const Element = this.GetCanvasElement();
		Element.addEventListener('fullscreenchange', this.OnFullscreenChanged.bind(this) );
	}
	
	UnbindEvents()
	{
		window.removeEventListener('resize',this.OnResize.bind(this));
		window.removeEventListener('orientationchange',this.OnOrientationChange.bind(this));
		const Element = this.GetCanvasElement();
		if ( Element )
			Element.removeEventListener('fullscreenchange', this.OnFullscreenChanged.bind(this) );
	}
	
	GetScreenRect()
	{
		if ( !this.ScreenRectCache )
		{
			let Canvas = this.GetCanvasElement();
			
			//	gr: offscreen canvas has no rect
			//let ElementRect = Canvas.getBoundingClientRect();
			//this.ScreenRectCache = [ ElementRect.x, ElementRect.y, ElementRect.width, ElementRect.height ];
			this.ScreenRectCache = [];
			
			//	gr: the bounding rect is correct, BUT for rendering,
			//		we should match the canvas pixel size
			this.ScreenRectCache[0] = 0;
			this.ScreenRectCache[1] = 0;
			this.ScreenRectCache[2] = Canvas.width;
			this.ScreenRectCache[3] = Canvas.height;
		}
		return this.ScreenRectCache.slice();
	}
	
	
	GetCanvasDomRect(Element)
	{
		//	first see if WE have our own rect
		const SelfRect = Element.getBoundingClientRect();
		if ( SelfRect.height )
		{
			return [SelfRect.x,SelfRect.y,SelfRect.width,SelfRect.height];
		}
		
		const ParentElement = Element.parentElement;
		if ( ParentElement )
		{
			//	try and go as big as parent
			//	values may be zero, so then go for window (erk!)
			const ParentSize = [ParentElement.clientWidth,ParentElement.clientHeight];
			const ParentInnerSize = [ParentElement.innerWidth,ParentElement.innerHeight];
			const WindowInnerSize = [window.innerWidth,window.innerHeight];

			let Width = ParentSize[0];
			let Height = ParentSize[1];
			if (!Width)
				Width = WindowInnerSize[0];
			if (!Height)
				Height = WindowInnerSize[1];
			let Rect = [0,0,Width,Height];
			Pop.Debug("SetCanvasSize defaulting to ",Rect,"ParentSize=" + ParentSize,"ParentInnerSize=" + ParentInnerSize,"WindowInnerSize=" + WindowInnerSize);
			return Rect;
		}
		
		throw `Don't know how to get canvas size`;
	}
	
	InvalidateCanvasResolution()
	{
		//	assume something has happened that has made us this the size has changed, make sure it gets refreshed
		//	this should also signal that the canvas width&height needs updating
		this.ScreenRectCache = null;
	}
		
	RefreshCanvasResolution()
	{
		const Canvas = this.GetCanvasElement();
		const CanvasIsElement = Canvas instanceof HTMLCanvasElement;
		
		//	not needed for offscreen canvases (should this ever be called?)
		if ( !CanvasIsElement )
			return;

		//	assume something has happened that has made us this the size has changed, make sure it gets refreshed
		this.ScreenRectCache = null;		

		//	GetCanvasDomRect will throw if the element has been disconnected from the dom
		try
		{
			//	gr: this function now should always just get the rect via dom,
			//		if it can't get it from itself, from it's parent
			//	GetScreenRect should be using canvas w/h, so this must always be called before
			const Rect = this.GetCanvasDomRect(Canvas);
			const w = Rect[2];
			const h = Rect[3];
			
			//	re-set resolution to match
			//	gr: todo: change this so we only resize the canvas (and invalidate it's contents)
			//		on render
			Canvas.width = w;
			Canvas.height = h;
			
			//	re-cache rect
			this.GetScreenRect();
		}
		catch(e)
		{
			console.warn(`RefreshCanvasResolution() ${e}`);
		}
	}
	
	OnLostContext(Error)
	{
		Pop.Debug("Lost webgl context",Error);
		this.Context = null;
		this.CurrentBoundGeometryHash = null;
		this.CurrentBoundShaderHash = null;
		this.ResetContextAssets();
	}
	
	ResetContextAssets()
	{
		//	dont need to reset this? but we will anyway
		this.ActiveTextureIndex = 0;
		this.ActiveTextureRef = {};
		
		//	todo: proper cleanup
		this.TextureRenderTargets = [];
	}

	TestLoseContext()
	{
		Pop.Debug("TestLoseContext");
		const Context = this.GetGlContext();
		const Extension = Context.getExtension('WEBGL_lose_context');
		if ( !Extension )
			throw "WEBGL_lose_context not supported";
		
		Extension.loseContext();
		
		//	restore after 3 secs
		function RestoreContext()
		{
			Extension.restoreContext();
		}
		setTimeout( RestoreContext, 3*1000 );
	}
	
	CreateContext()
	{
		const Webgl2Supported = ( typeof WebGL2RenderingContext != 'undefined');
		
		const ContextMode = Webgl2Supported ? "webgl2" : "webgl";
		const Canvas = this.GetCanvasElement();
		if ( !Canvas )
			throw `RenderContext has no canvas`;

		//this.RefreshCanvasResolution();
		this.OnResize();
		const Options = Object.assign({}, this.CanvasOptions);
		if (Options.antialias == undefined) Options.antialias = true;
		if (Options.xrCompatible == undefined) Options.xrCompatible = true;
		//	default is true. when true, this is causing an rgb blend with white,
		//	instead of what's behind the canvas, causing a white halo
		//	https://webglfundamentals.org/webgl/lessons/webgl-and-alpha.html
		if (Options.premultipliedAlpha == undefined) Options.premultipliedAlpha = false;
		if (Options.alpha == undefined) Options.alpha = true;	//	have alpha buffer
		const Context = Canvas.getContext( ContextMode, Options );
		const IsWebgl2 = Webgl2Supported ? (Context instanceof WebGL2RenderingContext ) : false;
		
		if ( !Context )
			throw "Failed to initialise " + ContextMode;
		
		if ( Context.isContextLost() )
		{
			//	gr: this is a little hacky
			throw "Created " + ContextMode + " context but is lost";
		}
		
		const gl = Context;
		
		//	debug these capabilities
		const CapabilityNames =
		[
			'MAX_VERTEX_UNIFORM_VECTORS',
			'MAX_RENDERBUFFER_SIZE',
			'MAX_TEXTURE_SIZE',
			'MAX_VIEWPORT_DIMS',
			'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
			'MAX_TEXTURE_IMAGE_UNITS',
			'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
			'MAX_VERTEX_ATTRIBS',
			'MAX_VARYING_VECTORS',
			'MAX_VERTEX_UNIFORM_VECTORS',
			'MAX_FRAGMENT_UNIFORM_VECTORS',
		];
		const Capabilities = {};
		function GetCapability(CapName)
		{
			const Key = gl[CapName];	//	parameter key is a number
			const Value = gl.getParameter(Key);
			Capabilities[CapName] = Value;
		}
		CapabilityNames.forEach(GetCapability);
		const Extensions = gl.getSupportedExtensions();
		
		Pop.Debug(`Created new ${ContextMode} context. Capabilities ${JSON.stringify(Capabilities)}; Extensions ${Extensions.join('\n')}`);
		
		
		//	handle losing context
		function OnLostWebglContext(Event)
		{
			Pop.Debug("OnLostWebglContext",Event);
			Event.preventDefault();
			this.OnLostContext("Canvas event");
		}
		Canvas.addEventListener('webglcontextlost', OnLostWebglContext.bind(this), false);
		
		
		//	enable float textures on GLES1
		//	https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_float
		
		// Pop.Debug("Supported Extensions", gl.getSupportedExtensions() );

		const InitFloatTexture = function(Context)
		{
			//	gl.Float already exists, but this now allows it for texImage
			this.FloatTextureSupported = true;
			Context.FloatTextureSupported = true;
			
		}.bind(this);
		
		const InitFloatLinearTexture = function(Context)
		{
			//	gl.Float already exists, but this now allows it for texImage
			this.FloatLinearTextureSupported = true;
			Context.FloatLinearTextureSupported = true;
			
		}.bind(this);

		const InitDepthTexture = function(Context,Extension)
		{
			Context.UNSIGNED_INT_24_8 = Extension.UNSIGNED_INT_24_8_WEBGL;
			this.Int32TextureSupported = true;
		}.bind(this);

		function InitInstancedArrays(Context,Extension)
		{
			console.log(`ANGLE_instanced_arrays supported; InitInstancedArrays()`);
			Context.vertexAttribDivisor = function(Location,Divisor)
			{
				return Extension.vertexAttribDivisorANGLE(...arguments);
			}
			
			Context.drawArraysInstanced = function()
			{
				return Extension.drawArraysInstancedANGLE(...arguments);
			}

			Context.drawElementsInstanced = function()
			{
				return Extension.drawElementsInstancedANGLE(...arguments);
			}
		}
		
		function InitBlendMinMax(Context,Extension)
		{
			Context.MIN = Extension.MIN_EXT;
			Context.MAX = Extension.MAX_EXT;
		}
		
		const EnableExtension = function(ExtensionName,Init)
		{
			try
			{
				const Extension = gl.getExtension(ExtensionName);
				gl[ExtensionName] = Extension;
				if ( Extension == null )
					throw ExtensionName + " not supported (null)";
				Pop.Debug("Loaded extension",ExtensionName,Extension);
				if ( Init )
					Init( gl, Extension );
			}
			catch(e)
			{
				Pop.Debug("Error enabling ",ExtensionName,e);
			}
		};
		
		if ( AllowFloatTextures )
		{
			EnableExtension('EXT_color_buffer_float',InitFloatTexture);
			EnableExtension('OES_texture_float',InitFloatTexture);
			EnableExtension('OES_texture_float_linear',InitFloatLinearTexture);
		}
		EnableExtension('WEBGL_depth_texture',InitDepthTexture);
		EnableExtension('EXT_blend_minmax',InitBlendMinMax);
		EnableExtension('OES_vertex_array_object', this.InitVaoExtension.bind(this) );
		EnableExtension('WEBGL_draw_buffers', this.InitMultipleRenderTargets.bind(this) );
		EnableExtension('OES_element_index_uint', this.Init32BitBufferIndexes.bind(this) );
		EnableExtension('ANGLE_instanced_arrays', InitInstancedArrays.bind(this) );
		EnableExtension('OES_standard_derivatives');
		EnableExtension('WEBGL_multisampled_render_to_texture', this.InitRenderToTextureMsaa.bind(this) );
		
		if ( AllowMultiView )
			EnableExtension('OCULUS_multiview', this.InitOculusMultiview.bind(this) );
		
		//	texture load needs extension in webgl1
		//	in webgl2 it's built in, but requires #version 300 es
		//	gr: doesnt NEED to be enabled??
		//EnableExtension('EXT_shader_texture_lod');
		//EnableExtension('OES_standard_derivatives');
		
		//	readpixels() fails with null as buffer in webgl1, no different symbols
		Context.CanReadPixelsAsync = function()
		{
			//	gr: not currently working
			return false;
			return IsWebgl2;
		}
		this.CanReadPixelsAsync = Context.CanReadPixelsAsync;

		return Context;
	}
	
	InitOculusMultiview(gl,Extension)
	{
		this.MultiView = Extension;
	}
	
	InitRenderToTextureMsaa(gl,Extension)
	{
		gl.framebufferTexture2DMultisampleEXT = Extension.framebufferTexture2DMultisampleEXT;
		this.RenderToTextureMsaa = Extension;
	}
	
	IsFloatRenderTargetSupported()
	{
		//	gr: because of some internal workarounds/auto conversion in images
		//		trying to create & bind a float4 will inadvertently work! if we
		//		dont support float textures
		if ( !this.FloatTextureSupported )
			return false;
		
		try
		{
			const FloatTexture = new PopImage([1,1],'Float4');
			FloatTexture.Name = 'IsFloatRenderTargetSupported';
			const RenderTarget = new TextureRenderTarget( [FloatTexture] );
			const RenderContext = this;
			const Unbind = RenderTarget.BindRenderTarget( RenderContext );
			//	cleanup!
			//	todo: restore binding, viewports etc
			Unbind();
			return true;
		}
		catch(e)
		{
			Pop.Debug("IsFloatRenderTargetSupported failed: "+e);
			return false;
		}
	}

	
	InitVaoExtension(Context,Extension)
	{
		//	already enabled with webgl2
		if ( Context.createVertexArray )
			return;
		
		Context.createVertexArray = Extension.createVertexArrayOES.bind(Extension);
		Context.deleteVertexArray = Extension.deleteVertexArrayOES.bind(Extension);
		Context.isVertexArray = Extension.isVertexArrayOES.bind(Extension);
		Context.bindVertexArray = Extension.bindVertexArrayOES.bind(Extension);
	}
	
	InitMultipleRenderTargets(Context,Extension)
	{
		Pop.Debug("MRT has MAX_COLOR_ATTACHMENTS_WEBGL=" + Extension.MAX_COLOR_ATTACHMENTS_WEBGL + " MAX_DRAW_BUFFERS_WEBGL=" + Extension.MAX_DRAW_BUFFERS_WEBGL );
		Extension.AttachmentPoints =
		[
		 Extension.COLOR_ATTACHMENT0_WEBGL,	Extension.COLOR_ATTACHMENT1_WEBGL,	Extension.COLOR_ATTACHMENT2_WEBGL,	Extension.COLOR_ATTACHMENT3_WEBGL,	Extension.COLOR_ATTACHMENT4_WEBGL,
		 Extension.COLOR_ATTACHMENT5_WEBGL,	Extension.COLOR_ATTACHMENT6_WEBGL,	Extension.COLOR_ATTACHMENT7_WEBGL,	Extension.COLOR_ATTACHMENT8_WEBGL,	Extension.COLOR_ATTACHMENT9_WEBGL,
		 Extension.COLOR_ATTACHMENT10_WEBGL,	Extension.COLOR_ATTACHMENT11_WEBGL,	Extension.COLOR_ATTACHMENT12_WEBGL,	Extension.COLOR_ATTACHMENT13_WEBGL,	Extension.COLOR_ATTACHMENT14_WEBGL,	Extension.COLOR_ATTACHMENT15_WEBGL,
		];
		
		//	already in webgl2
		if ( !Context.drawBuffers )
		{
			Context.drawBuffers = Extension.drawBuffersWEBGL.bind(Extension);
		}
	}
	
	Init32BitBufferIndexes(Context,Extension)
	{
		const gl = Context;
		Pop.Debug(`OES_element_index_uint gl.UNSIGNED_INT=${gl.UNSIGNED_INT}`);
		if ( !gl.UNSIGNED_INT )
			throw `Missing gl.UNSIGNED_INT`;
	}
	
	
	
	InitialiseContext()
	{
		this.Context = this.CreateContext();
		this.ContextVersion++;
		
		//	gr: I want this in CreateContext, but the calls require this.Context to be setup
		//		so doing it here for now
		//	test support for float render targets
		//	test for undefined, as it may have been forced off by client
		if ( CanRenderToFloat === undefined )
		{
			CanRenderToFloat = this.IsFloatRenderTargetSupported();
		}
	}
	
	CanRenderToPixelFormat(Format)
	{
		if ( Format == 'Float4' )
			return CanRenderToFloat;
			
		return true;
	}
	
	//	render some commands, (parse here)
	//	queue up, and return their promise so caller knows when it's rendered
	async Render(Commands)
	{
		const RenderCommands = new RenderCommands_t(Commands);
		this.PendingRenderCommands.push(RenderCommands);
		return RenderCommands.Promise;
	}
	
	async RenderLoop()
	{
		//	wait for new paint event ("render thread")
		//	process all queued render-submissions (which resolve a promise)
		
		//	gr: this is now an async function, using pop engine
		//	WaitForFrame()
		//	instead of request animation frame
		//	so that this renderloop still executes in say, XR mode
		//	to flush out gpu queued work (even if we don't render to screen)
		//	Is this a problem where we need to render whilst inside requestAnimationFrame() callback?
		
		while ( true )
		{
			const Timestep = await Pop.WaitForFrame();
		
			if ( !this.IsOpen )
			{
				console.warn(`RenderContext.IsOpen=${this.IsOpen}; ending render loop`);
				return;
			}
			
			//	try and get the context, if this fails, it may be temporary
			try
			{
				this.GetGlContext();
			}
			catch(e)
			{
				//	Renderloop error, failed to get context... waiting to try again
				console.error("OnRender error: ",e);
				await Pop.Yield(RetryGetContextMs);
				//setTimeout( Render.bind(this), RetryGetContextMs );
				//return;
				continue;
			}
			
			//	pop all the commands so we don't get stuck in an infinite loop if a command queues more commands
			const PendingRenderCommands = this.PendingRenderCommands;
			this.PendingRenderCommands = [];

			for ( let RenderCommands of PendingRenderCommands )
			{
				//	todo: only do this when rendering explicitly to the canvas/screen
				//	canvas has been invalidated
				if ( !this.ScreenRectCache )
					this.RefreshCanvasResolution();
				
				try
				{
					const DeviceRenderTarget = new WindowRenderTarget(this);
					this.ProcessRenderCommands(RenderCommands,DeviceRenderTarget);
					RenderCommands.OnRendered();
				}
				catch(e)
				{
					RenderCommands.OnError(e);
					//	slow down for shader errors etc
					//	gr: this should be done by caller in the promise rejection
					//await Pop.Yield(20);
				}
			}
			
			//	request next frame, before any render fails, so we will get exceptions thrown for debugging, but recover
			//window.requestAnimationFrame( Render.bind(this) );

			Stats.Renders++;
		}
	}
	
	//	Device render target is the target for "null"
	ProcessRenderCommands(RenderCommands,DeviceRenderTarget)
	{
		if ( !DeviceRenderTarget )
			throw `"null" (device) render target missing in ProcessRenderCommands()`;
			
		//	current state
		let PassRenderTarget = null;	//	MRT is still one target, so this is nice and simple
		let PassTargetUnbind = null;
		let ReadBackPass = false;
		let InsidePass = false;
		
		//	release any pool-allocated array buffers
		//	these could still be rendering... maybe this needs to be after a glfinish?
		let PoolArrayBuffers = [];
		const ReleaseArrayBuffers = function()
		{
			if ( this.ArrayBufferPool )
				PoolArrayBuffers.forEach( this.ArrayBufferPool.Release.bind(this.ArrayBufferPool) );
		}.bind(this);
		
		const EndPass = function()
		{
			if ( InsidePass )
			{
				if ( ReadBackPass )
				{
					try
					{
						//	todo: need to support depth textures here
						const TargetImage0 = PassRenderTarget.ColourImages[0];
						if ( this.Context.CanReadPixelsAsync() )
						{
							//	sets up buffers and makes a promise for pixel data, 
							//	which we'll hope has updated by the time the user wants it
							PassRenderTarget.ReadPixelsAsync(TargetImage0);
						}
						else
						{
							const ReadFormat = TargetImage0.GetFormat();
							const Pixels = PassRenderTarget.ReadPixels(ReadFormat);
							//	gr: need to set gl version to match pixels version here
							TargetImage0.WritePixels(Pixels.Width,Pixels.Height,Pixels.Data,Pixels.Format);
						}
					}
					catch(e)
					{
						console.error(`Error reading back texture in pass; ${e}`);
					}
				}
				else if ( PassRenderTarget.ColourImages )
				{
					//	todo: need to support depth textures here
					const TargetImage0 = PassRenderTarget.ColourImages[0];
					TargetImage0.OnOpenglRenderedTo();
				}
			
				//	endpass()
				//	unbind targets?
				PassTargetUnbind();
				PassTargetUnbind = null;
				PassRenderTarget = null;
				InsidePass = false;
			}
		}.bind(this);
		
		const NewPass = function(SetRenderTargetCommand,ClearColour,ReadBack)
		{
			//	zero alpha = no clear so we just load old contents
			//		so alpha needs to be null
			//	gr: we sometimes WANT zero alpha (eg, clearing a texture to 0,0,0,0)
			//	so explicitly needs to be missing clear colour to not clear
			//if ( ClearColour && ClearColour[3] <= 0.0 )
			//	ClearColour = null;
				
			EndPass();
			let Target;	
			if ( SetRenderTargetCommand.IsDeviceRenderTarget() )
			{
				//	bind to screen
				Target = DeviceRenderTarget;
				if ( ReadBack )
					throw `ReadBack not currently supported to screen. Need to allow user to pass in a texture instead of true/format here`;
			}
			else
			{
				let ColourTargetImages = SetRenderTargetCommand.ColourTargetImages;
				let DepthTargetImages = SetRenderTargetCommand.DepthTargetImages;
			
				//	get texture target
				Target = this.GetTextureRenderTarget(ColourTargetImages,DepthTargetImages);
			}
			
			const Unbind = Target.BindRenderTarget(this);
			PassRenderTarget = Target;
			PassTargetUnbind = Unbind;
			ReadBackPass = ReadBack;
			InsidePass = true;
			
			if ( ClearColour )
			{
				PassRenderTarget.ClearColour(...ClearColour);
			}
			else // always clear depth... make this an option!
			{
				PassRenderTarget.ClearDepth();
			}
			
			PassRenderTarget.ResetState();
			//PassRenderTarget.SetBlendModeAlpha();
		}.bind(this);
		
		//	run each command
		try
		{
			for ( let RenderCommand of RenderCommands.Commands )
			{
				if ( RenderCommand instanceof RenderCommand_UpdateImage )
				{
					const RenderContext = this;
					RenderCommand.Image.UpdateTexturePixels(RenderContext);
				}
				else if ( RenderCommand instanceof RenderCommand_Draw ) 
				{
					const RenderContext = this;
					const Geometry = RenderCommand.Geometry;
					const Shader = RenderCommand.Shader;
					const StateParams = RenderCommand.StateParams;
					
					//	bind geo & shader (these are intrinsicly linked by attribs, we should change code
					//	so they HAVE to be bound together)
					Shader.Bind( RenderContext );

					//	gr: change this around so we set all uniforms, 
					//		then setup attributes in one go

					//	seems to be okay after, putting after in case array buffers mess anything up
					//	but we may need to be after so uniform-attribs override geo attribs
					Geometry.Bind( RenderContext, Shader );

					let InstanceCount = 0;

					//	set uniforms on shader
					for ( let UniformKey in RenderCommand.Uniforms )
					{
						const UniformValue = RenderCommand.Uniforms[UniformKey];
						if ( Shader.SetUniform( UniformKey, UniformValue ) )
							continue;

						//	gr: this also picks up uniforms that have been optimised out...
						const AttributeMeta = Shader.GetAttributeMeta(UniformKey);
						if ( !AttributeMeta )
							continue;
					
						//console.log(`Turn ${UniformKey} into attrib`,AttributeMeta);
						//	prep for instancing support;
						//	if there are uniforms provided that are attributes, (AND not in geo?)
						//	we need to turn these values into an attribute buffer and bind it
						
						//	gr: for instancing, this needs to be an array for each instance...
						//	gr: now auto unrolling and expecting to align...
						const Values = UniformValue;
						const Bind = this.AllocAndBindAttribInstances( AttributeMeta, Values );
						const Buffer = Bind.Buffer;
						if ( Buffer.Pooled )
							PoolArrayBuffers.push( Buffer );
						
						if ( InstanceCount != 0 )
							if ( Bind.InstanceCount < InstanceCount )
								console.warn(`Attribute ${AttributeMeta.Name} detected ${Bind.InstanceCount} instances, but already detected ${InstanceCount}`);
						
						//	things wont render if any input data isnt aligned to instance count
						//	should we change this to min()>0 so something will render?
						if ( InstanceCount == 0 )
							InstanceCount = Bind.InstanceCount;
						else
							InstanceCount = Math.min( InstanceCount, Bind.InstanceCount );
					}

					//	sokol sets state every frame, we should too
					PassRenderTarget.SetState(StateParams);

					//	draw polygons
					Geometry.Draw( RenderContext, InstanceCount );
				}
				else if ( RenderCommand instanceof RenderCommand_SetRenderTarget ) 
				{
					//	get all target texture[s]/null
					//	get clear colour
					//	fetch opengl render targets/screen target
					//	bind target[s]
					//	clear
					NewPass( RenderCommand, RenderCommand.ClearColour, RenderCommand.ReadBack );
				}
				else if ( RenderCommand instanceof RenderCommand_ReadPixels )
				{
					//	get image
					//	bind render target
					//	bind PBO etc
					//	read into buffer
					//	update image contents
					throw `Handle RenderCommand_ReadPixels`; 
				}
				else
				{
					throw `Unknown render command type ${typeof RenderCommand}`;
				}
			}
		}
		catch(e)
		{
			console.error(`RenderError: ${e}`);
		}
		finally
		{
			EndPass();
			ReleaseArrayBuffers();
		}
	}

	GetGlContext()
	{
		//	catch if we have a context but its lost
		if ( this.Context )
		{
			//	gr: does this cause a sync?
			if ( this.Context.isContextLost() )
			{
				this.OnLostContext("Found context.isContextLost()");
			}
		}
		
		//	reinit
		if ( !this.Context )
		{
			this.InitialiseContext();
		}
		return this.Context;
	}
	
	//	get a buffer associated with an object, alloc if none
	//	todo: merge this into the pool? just so all buffers are in the same place
	GetArrayBuffer(ArrayObject)
	{
		const Hash = GetUniqueHash(ArrayObject);
		if ( this.ArrayBuffers.hasOwnProperty(Hash) )
			return this.ArrayBuffers[Hash];
		
		const gl = this.Context;
		
		//	new one!
		const Buffer = {};
		Buffer.Buffer = gl.createBuffer();
		Buffer.Version = 0;
		Buffer.Length = 0;
		this.ArrayBuffers[Hash] = Buffer;
		return Buffer;
	}
	
	AllocArrayBuffer(FloatCount)
	{
		function PopFromFreeList(FreeItems,Meta)
		{
			//	todo: match length, maybe hash on meta (meta=size)
			if ( !FreeItems.length )
				return false;	//	no match
				
			const First = FreeItems.shift();
			//	make sure float array aligns
			if ( First.Floats.length != Meta )
				First.Floats = new Float32Array(Meta);
			return First;
		}
		function Alloc(Meta)
		{
			if ( !Meta )
				throw `Now expected to pass length as meta for buffer pool`;
			const gl = this.Context;
			const Buffer = {};
			Buffer.Buffer = gl.createBuffer();
			Buffer.Floats = new Float32Array(Meta);
			Buffer.Pooled = true;
			return Buffer;
		}
		
		if ( !this.ArrayBufferPool )
		{
			this.ArrayBufferPool = new Pool(`ArrayBufferPool`,Alloc.bind(this),Pop.Warning,PopFromFreeList.bind(this));
		}
		
		const Buffer = this.ArrayBufferPool.Alloc(...arguments);
		return Buffer;
	}
	
	
	AllocAndBindAttribInstances(AttributeMeta,Values)
	{
		const gl = this.Context;
		
		let DataValues;
		let Buffer;
		
		if ( IsTypedArray(Values) )
		{
			//	find a buffer associted with this dirtybuffer
			Buffer = this.GetArrayBuffer( Values );
			DataValues = Values;
			gl.bindBuffer(gl.ARRAY_BUFFER, Buffer.Buffer);
			
			const Changed = (Buffer.Version == 0) || (Buffer.Version != Values.Version );
			if ( Changed )
			{
				gl.bufferData(gl.ARRAY_BUFFER, DataValues, gl.DYNAMIC_DRAW );
				Buffer.Version++;
			}
			Values.Version = Buffer.Version;
		}
		else if ( Values instanceof DirtyBuffer )
		{
			//	find a buffer associted with this dirtybuffer
			Buffer = this.GetArrayBuffer( Values );
			
			//	update changes
			gl.bindBuffer(gl.ARRAY_BUFFER, Buffer.Buffer);
			const Changes = Values.PopChanges();
			
			DataValues = Values.Data;
			
			const AlignmentLength = 1024*2;
			let PaddedLength = DataValues.length + AlignmentLength;
			PaddedLength -= PaddedLength % AlignmentLength;
			
			let WriteAll = (Buffer.Version==0);
			//	need to resize buffer
			if ( Buffer.Length < PaddedLength )
				WriteAll = true;
			
			//	new buffer, need to write all data
			if ( WriteAll )
			{
				const PaddedSize = PaddedLength * DataValues.BYTES_PER_ELEMENT;
				//	set size then write data so we can have biggger buffer than current size
				console.log(`New buffer size (writing all data) Length=${DataValues.length} PaddedLength=${PaddedLength}`);
				gl.bufferData(gl.ARRAY_BUFFER, PaddedSize, gl.DYNAMIC_DRAW );
				gl.bufferSubData(gl.ARRAY_BUFFER, 0, DataValues);
				Buffer.Length = PaddedLength;
				Buffer.Version++;
			}
			else if ( Changes.length )
			{
				for ( let ChangeRange of Changes )
				{
					const StartIndex = ChangeRange[0];
					const EndIndex = ChangeRange[1];
					const SubDataValues = Values.Data.subarray( StartIndex, EndIndex+1 );
					const ByteOffset = StartIndex * DataValues.BYTES_PER_ELEMENT;
					gl.bufferSubData(gl.ARRAY_BUFFER, ByteOffset, SubDataValues);
				}
				Buffer.Version++;
			}
		}
		else
		{
			//if ( !Array.isArray(Values) )
			//	throw `AllocAndBindAttribInstances(${AttributeMeta.Name}) expecting array of values (per instance)`;
		
			//	flatten as needed
			//	gr: this is mega expensive
			if ( Values.flat )
				if ( Array.isArray(Values[0]) )
					Values = Values.flat(2);
			
			//	alloc a buffer from a pool
			Buffer = this.AllocArrayBuffer(Values.length);
			gl.bindBuffer(gl.ARRAY_BUFFER, Buffer.Buffer);
							
			//	this needs to unroll the values into one giant array...
			//	if this an array of typed arrays, we need some more work
			DataValues = Values;
			if ( !IsTypedArray(DataValues) )
			{
				DataValues = Buffer.Floats;
				DataValues.set( Values );
			}
			//	gl.get = sync = slow!
			//	init buffer size (or resize if bigger than before)
			//const BufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
			//if ( DataValues.byteLength > BufferSize )
			//	gl.bufferData(gl.ARRAY_BUFFER, DataValues.byteLength, gl.DYNAMIC_DRAW, null );
			//const NewBufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
			//gl.bufferSubData(gl.ARRAY_BUFFER, 0, DataValues);
			gl.bufferData(gl.ARRAY_BUFFER, DataValues, gl.DYNAMIC_DRAW );
		}

		//	gr: we should forcibly clip the data if we already have a InstanceCount determined
		//		as the attributes have to align
		let DetectedInstanceCount = DataValues.length / AttributeMeta.ElementSize;
		if ( DetectedInstanceCount != Math.floor(DetectedInstanceCount) )
			throw `Attribute ${AttributeMeta.Name} has misaligned input`; 

		const ValueDataSize = AttributeMeta.ElementSize * DataValues.BYTES_PER_ELEMENT;
		
		//	matrixes are multiples of value*elementsize as all shader things are 4 floats at max
		//	so we iterate the sub parts to describe
		//	gr: maybe we can cache this layout so only needs updating if the pooled buffer is dirty
		//	https://stackoverflow.com/a/38853623/355753
		const Rows = AttributeMeta.ElementRows;
		
		function BindAttribArray(Row)
		{
			const ValueStride = ValueDataSize;
			const Normalised = false;
			const RowSize = AttributeMeta.ElementSize / AttributeMeta.ElementRows;
			if ( RowSize != Math.floor(RowSize) )
				throw `Attribute ${AttributeMeta.Name} ElementSize vs ElementRows not aligned`;
			const RowStride = RowSize * DataValues.BYTES_PER_ELEMENT;
			const Location = AttributeMeta.Location + Row;
			const Type = AttributeMeta.ElementType;	//	gl.FLOAT int etc
			const Offset = RowStride * Row;
			gl.enableVertexAttribArray(Location);
			gl.vertexAttribPointer( Location, RowSize, Type, Normalised, ValueStride, Offset);
			//	this line says this attribute only changes for each 1 instance
			//	and enables instancing
			gl.vertexAttribDivisor( Location, 1);
		}
		
		for ( let Row=0;	Row<Rows;	Row++ )
		{
			BindAttribArray(Row);
		}
		
		const BindMeta = {};
		BindMeta.Buffer = Buffer;
		BindMeta.InstanceCount = DetectedInstanceCount;
		return BindMeta;
	}
	
	OnAllocatedTexture(Image)
	{
		this.TextureHeap.OnAllocated( Image.OpenglByteSize );
	}
	
	OnDeletedTexture(Image)
	{
		//	todo: delete render targets that use this image
		this.TextureHeap.OnDeallocated( Image.OpenglByteSize );
	}
	
	OnAllocatedGeometry(Geometry)
	{
		this.GeometryHeap.OnAllocated( Geometry.OpenglByteSize );
	}
	
	OnDeletedGeometry(Geometry)
	{
		this.GeometryHeap.OnDeallocated( Geometry.OpenglByteSize );
	}
	
	GetRenderTargetIndex(ColourImages,DepthImages=[])
	{
		const ThisColourHashs = ColourImages.map( GetUniqueHash );
		const ThisDepthHashs = DepthImages.map( GetUniqueHash );

		function MatchRenderTarget(RenderTarget)
		{
			const MatchColourHashs = RenderTarget.ColourImages.map( GetUniqueHash );
			if ( !ThisColourHashs.every( (Hash,Index) => Hash == MatchColourHashs[Index] ) )
				return false;
			
			/* todo update all callers to pass depth before using this
			const MatchDepthHashs = RenderTarget.DepthImages.map( GetUniqueHash );
			if ( !ThisDepthHashs.every( (Hash,Index) => Hash == MatchDepthHashs[Index] ) )
				return false;
			*/
			return true;
		}
		
		const RenderTargetIndex = this.TextureRenderTargets.findIndex(MatchRenderTarget);
		if ( RenderTargetIndex < 0 )
			return false;
		return RenderTargetIndex;
	}
	
	GetTextureRenderTarget(ColourTextures,DepthTextures)
	{
		if ( !Array.isArray(ColourTextures) )
			ColourTextures = [ColourTextures];
		if ( !Array.isArray(DepthTextures) )
			DepthTextures = [DepthTextures];
		
		const RenderTargetIndex = this.GetRenderTargetIndex(ColourTextures,DepthTextures);
		if ( RenderTargetIndex !== false )
			return this.TextureRenderTargets[RenderTargetIndex];
		
		//	make a new one
		const RenderTarget = new TextureRenderTarget( ColourTextures, DepthTextures );
		this.TextureRenderTargets.push( RenderTarget );
		//	[unit test]check we can find the new target again
		if ( this.GetRenderTargetIndex(ColourTextures,DepthTextures) === false )
			throw "New render target didn't re-find";
		return RenderTarget;
	}
	
	FreeRenderTarget(Textures)
	{
		if ( !Array.isArray(Textures) )
			Textures = [Textures];
		
		let Found = 0;
		
		//	in case there's more than one!
		while(true)
		{
			const TargetIndex = this.GetRenderTargetIndex(Textures);
			if ( TargetIndex === false )
				break;
				
			this.TextureRenderTargets.splice(TargetIndex,1);
			Found++;
		}
		
		if ( !Found )
			Pop.Warning(`Found 0 matching targets in FreeRenderTarget()`);
	}
	
	ReadPixels(Image,ReadBackFormat)
	{
		const RenderContext = this;
		const gl = this.GetGlContext();
		const RenderTarget = this.GetTextureRenderTarget(Image);
		const Unbind = RenderTarget.BindRenderTarget( RenderContext );
		
		const Pixels = RenderTarget.ReadPixels(ReadBackFormat);
		//	this needs to restore bound rendertarget, really
		//	although any renders should be binding render target explicitly
		Unbind();
		return Pixels;
	}

	IsFullscreenSupported()
	{
		return document.fullscreenEnabled;
	}
	
	OnFullscreenChanged(Event)
	{
		Pop.Debug("OnFullscreenChanged", Event);
		//this.OnResize();
	}
	
	IsFullscreen()
	{
		const Canvas = this.GetCanvasElement();
		//if ( document.fullscreenElement == Canvas )
		if ( document.fullscreenElement )
			return true;
		return false;
	}
	
	SetFullscreen(Enable=true)
	{
		if ( !Enable )
		{
			//	undo after promise if there is a pending one
			document.exitFullscreen();
			return;
		}
		const Element = this.GetCanvasElement();
		
		const OnFullscreenSuccess = function()
		{
			//	maybe should be following fullscreenchange event
		}.bind(this);
		
		const OnFullscreenError = function(Error)
		{
			Pop.Debug("OnFullscreenError", Error);
		}.bind(this);
		
		//	gr: normally we want Element to go full screen
		//		but for acidic ocean, we're using other HTML elements
		//		and making the canvas fullscreen hides everything else
		//		so.... may need some user-option
		document.body.requestFullscreen().then( OnFullscreenSuccess ).catch( OnFullscreenError );
		//Element.requestFullscreen().then( OnFullscreenSuccess ).catch( OnFullscreenError );
	}
	
	
	async CreateShader(VertSource,FragSource,UniformDescriptions,AttribDescriptions)
	{
		//	todo: deprecate Uniform&Attribs explicitly
		//	we regex them now in AssetManager, and only sokol (not webgl) needs it, so
		//	even that regex should be native side
		
		//		and force adding a name for debugging
		const ShaderName = `A shader`;
		//	gr: I think this can be synchronous in webgl
		const ShaderObject = new Shader(this, ShaderName, VertSource, FragSource );
		//	gr: this needs to be managed so it's freed when no longer needed!
		return ShaderObject;
	}
	
	
	async CreateGeometry(VertexAttributes,TriangleIndexes)
	{
		//	gr: I think this can be synchronous in webgl
		const Geometry = ParseGeometryObject(VertexAttributes);
		const TriBuffer = new TriangleBuffer(this,Geometry,TriangleIndexes);
		//	gr: this needs to be managed so it's freed when no longer needed!
		return TriBuffer;
	}
}



//	base class with generic opengl stuff
export class RenderTarget
{
	GetRenderContext()
	{
		throw "Override this on your render target";
	}
	
	RenderToRenderTarget(TargetTexture,RenderFunction,ReadBackFormat,ReadTargetTexture)
	{
		const RenderContext = this.GetRenderContext();

		if ( CheckActiveTexturesBeforeRenderTargetBind )
		{
			const CurrentActiveTextureIndex =  (RenderContext.ActiveTextureIndex-1) % 8;
			const ActiveTexture = RenderContext.ActiveTextureRef[CurrentActiveTextureIndex];
			const ActiveTextureName = ActiveTexture ? ActiveTexture.Name : `<null ${CurrentActiveTextureIndex}>`;
			Pop.Debug(`BindRenderTarget to ${TargetTexture.Name} active=${ActiveTextureName}`);
		}
		//	unbind all texture units
		if ( UnbindActiveTexturesBeforeRenderTargetBind )
		{
			const gl = RenderContext.GetGlContext();
			const GlTextureNames = [ gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3, gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE6, gl.TEXTURE7 ];
			function UnbindTextureSlot(SlotName)
			{
				//gl.activeTexture(SlotName);
				//gl.bindTexture(gl.TEXTURE_2D, null );
			}
			GlTextureNames.forEach(UnbindTextureSlot);
		}
		
		//	setup render target
		let RenderTarget = RenderContext.GetTextureRenderTarget( TargetTexture );
		const Unbind = RenderTarget.BindRenderTarget( RenderContext );
		
		
		RenderFunction( RenderTarget );
		
		//	gr: merge this with ReadPixels()
		if (ReadBackFormat === true)
		{
			const ReadFormat = 'RGBA';
			const Pixels = RenderTarget.ReadPixels(ReadFormat);
			const target = ReadTargetTexture !== undefined ? ReadTargetTexture : TargetTexture
			target.WritePixels(Pixels.Width,Pixels.Height,Pixels.Data,Pixels.Format);
		}
		
		Unbind();
		
		//	todo: restore previously bound, not this.
		//	restore rendertarget
		this.BindRenderTarget( RenderContext );
	}
	
	GetGlContext()
	{
		const RenderContext = this.GetRenderContext();
		const Context = RenderContext.GetGlContext();
		return Context;
	}
	
	ClearColour(r,g,b,a=1)
	{
		const gl = this.GetGlContext();
		gl.clearColor( r, g, b, a );
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	ClearDepth()
	{
		const gl = this.GetGlContext();
		gl.clear(gl.DEPTH_BUFFER_BIT);
	}

	ResetState()
	{
		const gl = this.GetGlContext();
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		//gl.enable(gl.SCISSOR_TEST);
		gl.disable(gl.SCISSOR_TEST);
		//	to make blending work well, don't reject things on same plane
		gl.depthFunc(gl.LEQUAL);
	}
	
	SetState(StateParams)
	{
		const gl = this.GetGlContext();
		
		if ( StateParams.CullFacing == 'Front' )
		{
			gl.enable(gl.CULL_FACE);
			gl.cullFace(gl.FRONT);
		}
		else if ( StateParams.CullFacing == 'Back' )
		{
			gl.enable(gl.CULL_FACE);
			gl.cullFace(gl.BACK);
		}
		else
		{
			gl.disable(gl.CULL_FACE);
		}
		
		if ( StateParams.DepthWrite )
		{
			gl.depthMask(true);
		}
		else
		{
			gl.depthMask(false);
		}

		if ( StateParams.DepthRead )
		{
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LEQUAL);	//	todo: get proper mode
		}
		else
		{
			gl.disable(gl.DEPTH_TEST);
		}
		
		
		switch(StateParams.BlendMode)
		{
			//	no blending
			default:
			case 'Blit':
				this.SetBlendModeBlit();
				break;

			case 'Alpha':
				this.SetBlendModeAlpha();
				break;

			case 'Min':
				this.SetBlendModeMin();
				break;

			case 'Max':
				this.SetBlendModeMax();
				break;

			case 'Add':
				this.SetBlendModeAddByAlpha();
				break;

			case 'ExplicitAdd':
				this.SetBlendModeExplicitAdd();
				break;
			}
	}
	
	SetBlendModeBlit()
	{
		const gl = this.GetGlContext();
		
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.ONE, gl.ZERO );
		gl.blendEquation( gl.FUNC_ADD );
		gl.disable( gl.BLEND );
	}
	
	SetBlendModeAlpha()
	{
		const gl = this.GetGlContext();
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	SetBlendModeMax()
	{
		const gl = this.GetGlContext();
		if ( !gl.MAX )
			throw "EXT_blend_minmax hasn't been setup on this context";
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		//gl.blendEquation( gl.FUNC_ADD );
		gl.blendEquation( gl.MAX );
		//GL_FUNC_ADD
	}
	
	SetBlendModeMin()
	{
		const gl = this.GetGlContext();
		if ( !gl.MIN )
			throw "EXT_blend_minmax hasn't been setup on this context";
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		//gl.blendEquation( gl.FUNC_ADD );
		gl.blendEquation( gl.MIN );
		//GL_FUNC_ADD
	}
	
	//	add based on alpha
	SetBlendModeAdd()
	{
		const gl = this.GetGlContext();
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.ONE, gl.ONE_MINUS_SRC_ALPHA );
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	//	literally add rgba together
	SetBlendModeExplicitAdd()
	{
		const gl = this.GetGlContext();
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.ONE, gl.ONE );
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	DrawGeometry(Geometry,Shader,SetUniforms,TriangleCount)
	{
		const RenderContext = this.GetRenderContext();
		
		//	0 gives a webgl error/warning so skip it
		if ( TriangleCount === 0 )
		{
			//Pop.Debug("Triangle count",TriangleCount);
			return;
		}
		
		const gl = this.GetGlContext();
		
		RenderContext.ResetActiveTextureSlots();
		
		//	this doesn't make any difference
		if ( gl.CurrentBoundShaderHash != GetUniqueHash(Shader) )
		{
			const Program = Shader.GetProgram(RenderContext);
			gl.useProgram( Program );
			gl.CurrentBoundShaderHash = GetUniqueHash(Shader);
			Stats.ShaderBinds++;
		}
		else
		{
			Stats.ShaderBindSkip++;
		}
		
		//	this doesn't make any difference
		if ( gl.CurrentBoundGeometryHash != GetUniqueHash(Geometry) )
		{
			Geometry.Bind( RenderContext );
			gl.CurrentBoundGeometryHash = GetUniqueHash(Geometry);
			Stats.GeometryBinds++;
		}
		else
		{
			Stats.GeometryBindSkip++;
		}
		SetUniforms( Shader, Geometry );

		const GeoTriangleCount = Geometry.IndexCount/3;
		if ( TriangleCount === undefined )
			TriangleCount = GeoTriangleCount;

		//	if we try and render more triangles than geometry has, webgl sometimes will render nothing and give no warning
		TriangleCount = Math.min( TriangleCount, GeoTriangleCount );

		Stats.TrianglesDrawn += TriangleCount;
		Stats.BatchesDrawn += 1;
		gl.drawArrays( Geometry.PrimitiveType, 0, TriangleCount * 3 );
	}
	
	//	returns a {} struct with pixel data
	//	gr: this should return pixel data for each texture in MRT...
	ReadPixels(ReadBackFormat)
	{
		//	todo: check is bound
		const gl = this.GetGlContext();
		const TargetRect = this.GetRenderTargetRect();

		const Pixels = {};
		Pixels.Width = TargetRect[2];
		Pixels.Height = TargetRect[3]
		Pixels.Format = ReadBackFormat;
		if ( ReadBackFormat == 'RGBA' )
		{
			Pixels.Channels = 4;
			Pixels.Data = new Uint8Array(Pixels.Width * Pixels.Height * Pixels.Channels);
			gl.readPixels(0,0,Pixels.Width,Pixels.Height,gl.RGBA,gl.UNSIGNED_BYTE,Pixels.Data);
			return Pixels;
		}
		else if ( ReadBackFormat == 'Float4' )
		{
			Pixels.Channels = 4;
			Pixels.Data = new Float32Array(Pixels.Width * Pixels.Height * Pixels.Channels);
			gl.readPixels(0,0,Pixels.Width,Pixels.Height,gl.RGBA,gl.FLOAT,Pixels.Data);
			return Pixels;
		}
		
		throw `ReadPixels() Unhandled readback format ${ReadBackFormat}`;
	}
	
	ReadPixelsAsync(Image,ReadBackFormat)
	{
		ReadBackFormat = ReadBackFormat || Image.GetFormat();
		
		const gl = this.GetGlContext();

		//	should we pool these buffers?
		const ReadPixelsBuffer = gl.createBuffer();
		
		//	queue commands to read back
		const x = 0;
		const y = 0;
		const w = Image.GetWidth();
		const h = Image.GetHeight();
		const Channels = GetChannelsFromPixelFormat(ReadBackFormat);
		const PixelByteSize = Channels * GetFormatElementSize(ReadBackFormat);
		const ImageByteSize = w * h * PixelByteSize;
		const IsFloat = IsFloatFormat(ReadBackFormat);
		
		const PixelBufferFormat = IsFloat ? Float32Array : Uint8Array;
		const PixelBuffer = new PixelBufferFormat( w * h * Channels );
		
		const GlFormat = gl.RGBA;
		const GlType = IsFloat ? gl.FLOAT : gl.UNSIGNED_BYTE;
		
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, Image.ReadPixelsBuffer );
		gl.bufferData(gl.PIXEL_PACK_BUFFER, PixelBuffer.byteLength, gl.STREAM_READ );
		const Offset = 0;
		gl.readPixels( x, y, w, h, GlFormat, GlType, Offset );
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null );
		
		//	create a sync point so we know when readpixels commands above have completed
		const Sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		
		function Cleanup()
		{
			gl.deleteBuffer(ReadPixelsBuffer);
		}
		function OnError(Error)
		{
			console.error(`ReadPixelsAsync error ${Error}`);
		}
		async function DoRead()
		{
			await WaitForSync(Sync,gl);
			gl.deleteSync(Sync);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, ReadPixelsBuffer);
			const SourceOffset = 0;
			const DestinationOffset = 0;
			const DestinationSize = PixelBuffer.byteLength;
  			gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, SourceOffset, PixelBuffer, DestinationOffset, DestinationSize );
  			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  			//	todo: dont mark gl version as changed
  			Image.WritePixels( w, h, PixelBuffer, ReadBackFormat );
		}
		Image.ReadPixelsBufferPromise = DoRead();
		Image.ReadPixelsBufferPromise.finally(Cleanup);
	}
	
}


//	maybe this should be an API type
class TextureRenderTarget extends RenderTarget
{
	constructor(ColourImages,DepthImages=[])
	{
		super();
		if ( !Array.isArray(ColourImages) )
			throw "Pop.Opengl.TextureRenderTarget now expects array of images for MRT support";
		if ( !Array.isArray(DepthImages) )
			throw "Pop.Opengl.TextureRenderTarget now expects array of images for MRT support";
		
		this.FrameBuffer = null;
		this.FrameBufferContextVersion = null;
		this.FrameBufferRenderContext = null;
		
		this.ColourImages = ColourImages;
		this.DepthImages = DepthImages;
		
		if ( this.DepthImages.length > 1 )
			throw `Only supporting (Currently?) 1 depth image in TextureRenderTarget`;
		if ( this.ColourImages.length < 1 )
			throw `Require at least 1 colour image in TextureRenderTarget (x${this.DepthImages.length} depth images)`;
		
		//	verify each image is same dimensions (and format?)
		this.IsImagesValid();
	}
	
	IsImagesValid()
	{
		//	todo: check depth support, size etc as well as colour
		
		// Pop.Debug("IsImagesValid",this);
		
		//	if multiple images, size and format need to be the same
		const Image0 = this.ColourImages[0];
		const IsSameAsImage0 = function(Image)
		{
			if ( Image.GetWidth() != Image0.GetWidth() )	return false;
			if ( Image.GetHeight() != Image0.GetHeight() )	return false;
			if ( Image.PixelsFormat != Image0.PixelsFormat )	return false;
			return true;
		}
		if ( !this.ColourImages.every( IsSameAsImage0 ) )
			throw "Images for MRT are not all same size & format";
		
		//	reject some formats
		//	todo: need to pre-empt this some how on mobile, rather than at instantiation of the framebuffer
		//
		const IsImageRenderable = function(Image)
		{
			const IsFloat = Image.PixelsFormat.startsWith('Float');
			if ( IsFloat && CanRenderToFloat===false )
				throw "This platform cannot render to " + Image.PixelsFormat + " texture";
		}
		IsImageRenderable(Image0);
	}
	
	GetRenderContext()
	{
		return this.FrameBufferRenderContext;
	}
	
	GetRenderTargetRect()
	{
		const FirstImage = this.ColourImages[0];
		let Rect = [0,0,0,0];
		Rect[2] = FirstImage.GetWidth();
		Rect[3] = FirstImage.GetHeight();
		return Rect;
	}
	
	CreateFrameBuffer(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		this.FrameBuffer = gl.createFramebuffer();
		this.FrameBufferContextVersion = RenderContext.ContextVersion;
		this.FrameBufferRenderContext = RenderContext;
		
		
		//this.BindRenderTarget();
		gl.bindFramebuffer( gl.FRAMEBUFFER, this.FrameBuffer );
		
		function AttachImage(Image,AttachmentPoint)
		{
			const Level = 0;
			const Texture = Image.GetOpenglTexture( RenderContext );
			//gl.bindTexture(gl.TEXTURE_2D, null);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, AttachmentPoint, gl.TEXTURE_2D, Texture, Level );
		}
		
		//	one binding, use standard mode
		if ( this.ColourImages.length == 1 )
		{
			const Image = this.ColourImages[0];
			AttachImage( Image, gl.COLOR_ATTACHMENT0 );
		}
		else
		{
			if ( gl instanceof WebGL2RenderingContext )
				throw `todo: webgl2 colour attachment names for MRT`;
			
			//	MRT
			if ( !gl.WEBGL_draw_buffers )
				throw "Context doesn't support MultipleRenderTargets/WEBGL_draw_buffers";
			const AttachmentPoints = gl.WEBGL_draw_buffers.AttachmentPoints;
			const Attachments = [];
			function BindTextureColourAttachment(Image,Index)
			{
				const AttachmentPoint = AttachmentPoints[Index];
				AttachImage( Image, AttachmentPoint );
				Attachments.push( AttachmentPoint );
			}
			this.ColourImages.forEach( BindTextureColourAttachment );
			
			//	set gl_FragData binds in the shader
			gl.drawBuffers( Attachments );
		}
		
		//	note, if no depth images are provided, there is no depth
		//	should we always fallback and create a hardware RENDERBUFFER depth attachment?
		if ( this.DepthImages.length )
		{
			//	non MRT approach, not sure if we can MRT depth?
			const Image = this.DepthImages[0];
			AttachImage( Image, gl.DEPTH_ATTACHMENT );
		}
		
		if ( !gl.isFramebuffer( this.FrameBuffer ) )
			Pop.Debug("Is not frame buffer!");
		const Status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
		if ( Status != gl.FRAMEBUFFER_COMPLETE )
			throw "New framebuffer attachment status not complete: " + GetString(gl,Status);
		
		if ( TestFrameBuffer )
			if ( !gl.isFramebuffer( this.FrameBuffer ) )
				throw "Is not frame buffer!";
		//let Status = gl.checkFramebufferStatus( this.FrameBuffer );
		//Pop.Debug("Framebuffer status",Status);
	}
	
	GetFrameBuffer()
	{
		return this.FrameBuffer;
	}
	
	//  bind for rendering
	BindRenderTarget(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		
		if ( this.FrameBufferContextVersion !== RenderContext.ContextVersion )
		{
			this.FrameBuffer = null;
			this.FrameBufferContextVersion = null;
			this.FrameBufferRenderContext = null;
		}

		if ( !this.FrameBuffer )
		{
			this.CreateFrameBuffer( RenderContext );
		}
		
		if ( TestFrameBuffer )
			if ( !gl.isFramebuffer( this.FrameBuffer ) )
				throw "Is not frame buffer!";

		//	gr: chrome on mac; linear filter doesn't error, but renders black, force it off
		//	gr: this may be more to do with the extension OES_texture_float_linear
		//		so we should check for support and make sure it never gets set in the opengl image
		let PreviousFilter = null;
		if ( this.ColourImages )
		{
			//	gr: this is changing the active texture binding... but does it matter?
			/*
			const ImageTarget = this.ColourImages[0];
			const Texture = ImageTarget.OpenglTexture;
			gl.bindTexture(gl.TEXTURE_2D,Texture);
			PreviousFilter = ImageTarget.LinearFilter;
			const FilterMode = gl.NEAREST;
			const RepeatMode = gl.CLAMP_TO_EDGE;
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FilterMode);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FilterMode);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, RepeatMode);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, RepeatMode);
			//gl.bindTexture(gl.TEXTURE_2D,null);
			*/
		}
		
		const FrameBuffer = this.GetFrameBuffer();
		
		//	todo: make this common code
		gl.bindFramebuffer( gl.FRAMEBUFFER, FrameBuffer );
		
		if ( gl.WEBGL_draw_buffers )
		{
			const Attachments = gl.WEBGL_draw_buffers.AttachmentPoints.slice( 0, this.ColourImages.length );
			gl.drawBuffers( Attachments );
		}
		
		//	gr: this is givng errors...
		//let Status = gl.checkFramebufferStatus( this.FrameBuffer );
		//Pop.Debug("Framebuffer status",Status);
		const Viewport = this.GetRenderTargetRect();
		gl.viewport( ...Viewport );
		gl.scissor( ...Viewport );
		
		this.ResetState();
		
		function Unbind()
		{
			if ( this.ColourImages )
			{
				const ImageTarget = this.ColourImages[0];
				const Texture = ImageTarget.OpenglTexture;
				gl.bindTexture(gl.TEXTURE_2D,Texture);
				
				/*
				//	restore filter mode
				const FilterMode = ImageTarget.LinearFilter ? gl.LINEAR : gl.NEAREST;
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FilterMode);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FilterMode);
				*/
				//gl.bindTexture(gl.TEXTURE_2D,null);

				//	increment image's version
				//	gr: it's easy here... but to sync with ReadBack, we do it in render commands
				//this.ColourImages.forEach( Img => Img.OnOpenglRenderedTo() );
			}
		}
		
		return Unbind.bind(this);
	}
	
	AllocTextureIndex()
	{
		return this.RenderContext.AllocTextureIndex();
	}
}

class WindowRenderTarget extends RenderTarget
{
	constructor(Window)
	{
		super();
		this.Window = Window;
		this.RenderContext = Window;
		this.ViewportMinMax = [0,0,1,1];
	}
	
	GetFrameBuffer()
	{
		return null;
	}

	GetWindow()
	{
		return this.Window;
	}
	
	GetRenderContext()
	{
		return this.RenderContext;
	}
	
	AllocTextureIndex()
	{
		const Context = this.GetRenderContext();
		return Context.AllocTextureIndex();
	}

	GetScreenRect()
	{
		const Window = this.GetWindow();
		return Window.GetScreenRect();
	}

	GetRenderTargetRect()
	{
		let Rect = this.GetScreenRect();
		Rect[0] = 0;
		Rect[1] = 0;
		return Rect;
	}

	
	BindRenderTarget(RenderContext)
	{
		const gl = this.RenderContext.GetGlContext();
		const FrameBuffer = this.GetFrameBuffer();

		//	todo: make this common code
		gl.bindFramebuffer( gl.FRAMEBUFFER, FrameBuffer );
		const RenderRect = this.GetRenderTargetRect();
		let ViewportMinx = this.ViewportMinMax[0] * RenderRect[2];
		let ViewportMiny = this.ViewportMinMax[1] * RenderRect[3];
		let ViewportWidth = this.GetViewportWidth();
		let ViewportHeight = this.GetViewportHeight();

		//const Viewport = this.GetRenderTargetRect();
		//	viewport in pixels in webgl
		const Viewport = [ViewportMinx, ViewportMiny, ViewportWidth, ViewportHeight];
		gl.viewport( ...Viewport );
		gl.scissor( ...Viewport );
		
		this.ResetState();
		
		function Unbind()
		{
		}
		return Unbind.bind(this);
	}
	
	GetViewportWidth()
	{
		const RenderRect = this.GetRenderTargetRect();
		return RenderRect[2] * (this.ViewportMinMax[2]-this.ViewportMinMax[0]);
	}
	
	GetViewportHeight()
	{
		const RenderRect = this.GetRenderTargetRect();
		return RenderRect[3] * (this.ViewportMinMax[3]-this.ViewportMinMax[1]);
	}
}



export class Shader
{
	constructor(RenderContext,Name,VertShaderSource,FragShaderSource)
	{
		this.Name = Name;
		this.Program = null;
		this.ProgramContextVersion = null;
		this.Context = null;			//	 need to remove this, currently still here for SetUniformConvinience
		this.UniformMetaCache = null;	//	may need to invalidate this on new context
		this.AttributeMetaCache = null;	//	may need to invalidate this on new context
		this.VertShaderSource = VertShaderSource;
		this.FragShaderSource = FragShaderSource;
		this.SourceUniforms = ExtractShaderUniforms( VertShaderSource, FragShaderSource );
	}
	
	get UniformMetas()
	{
		//	collate all uniforms from shader & source (for extra user-meta opengl ignores)
		const Metas = {};
		function PushUniform(Name,Meta)
		{
			Metas[Name] = Object.assign( Metas[Name]||{}, Meta );
		}
	
		this.SourceUniforms.forEach( Meta => PushUniform(Meta.Name,Meta) );
	
		if ( this.UniformMetaCache )
			Object.entries( this.UniformMetaCache ).forEach( e => PushUniform(...e) );
		
		return Metas;
	}

	GetGlContext()
	{
		return this.Context.GetGlContext();
	}
	
	GetProgram(RenderContext)
	{
		//	if out of date, recompile
		if ( this.ProgramContextVersion !== RenderContext.ContextVersion )
		{
			this.Program = this.CompileProgram( RenderContext );
			this.ProgramContextVersion = RenderContext.ContextVersion;
			this.Context = RenderContext;
			this.UniformMetaCache = this.GetUniformMetas();
			this.AttributeMetaCache = this.GetAttributeMetas();
		}
		return this.Program;
	}
	
	Bind(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		const Program = this.GetProgram(RenderContext);
		gl.useProgram( Program );
	}
	
	
	CompileShader(RenderContext,Type,Source,TypeName)
	{
		Source = CleanShaderSource(Source);
		
		const gl = RenderContext.GetGlContext();
		
		//	gr: removed this for now as we dont have it native
		//const RefactorFunc = ( Type == gl.FRAGMENT_SHADER ) ? RefactorFragShader : RefactorVertShader;
		//Source = RefactorFunc(Source);
		
		const Shader = gl.createShader(Type);
		gl.shaderSource( Shader, Source );
		gl.compileShader( Shader );
		
		const CompileStatus = gl.getShaderParameter( Shader, gl.COMPILE_STATUS);
		if ( !CompileStatus )
		{
			let Error = gl.getShaderInfoLog(Shader);
			console.error(`Failed to compile ${this.Name}(${TypeName}): ${Error}`);
			throw `Failed to compile ${this.Name}(${TypeName}): ${Error}`;
		}
		return Shader;
	}
	
	CompileProgram(RenderContext)
	{
		let gl = RenderContext.GetGlContext();
		
		const FragShader = this.CompileShader( RenderContext, gl.FRAGMENT_SHADER, this.FragShaderSource, 'Frag' );
		const VertShader = this.CompileShader( RenderContext, gl.VERTEX_SHADER, this.VertShaderSource, 'Vert' );
		
		let Program = gl.createProgram();
		gl.attachShader( Program, VertShader );
		gl.attachShader( Program, FragShader );
		gl.linkProgram( Program );
		
		let LinkStatus = gl.getProgramParameter( Program, gl.LINK_STATUS );
		if ( !LinkStatus )
		{
			//	gr: list cases when no error "" occurs here;
			//	- too many varyings > MAX_VARYING_VECTORS
			const Error = gl.getProgramInfoLog(Program);
			throw "Failed to link " + this.Name + " shaders; " + Error;
		}
		return Program;
	}
	
	
	//	gr: can't tell the difference between int and float, so err that wont work
	SetUniform(Uniform,Value)
	{
		const UniformMeta = this.GetUniformMeta(Uniform);
		if ( !UniformMeta )
			return false;
		if( Array.isArray(Value) )					this.SetUniformArray( Uniform, UniformMeta, Value );
		else if( Value instanceof Float32Array )	this.SetUniformArray( Uniform, UniformMeta, Value );
		else if ( Value instanceof PopImage )		this.SetUniformPopImage( Uniform, UniformMeta, Value, this.Context.AllocTextureIndex() );
		else if ( Value instanceof WebGLTexture )	this.SetUniformTexture( Uniform, UniformMeta, Value, this.Context.AllocTextureIndex() );
		else if ( typeof Value === 'number' )		this.SetUniformNumber( Uniform, UniformMeta, Value );
		else if ( typeof Value === 'boolean' )		this.SetUniformNumber( Uniform, UniformMeta, Value );
		else
		{
			console.log(typeof Value);
			console.log(Value);
			throw "Failed to set uniform " +Uniform + " to " + ( typeof Value );
		}
		return true;
	}
	
	SetUniformArray(UniformName,UniformMeta,Values)
	{
		const ExpectedValueCount = UniformMeta.ElementSize * UniformMeta.ElementCount;
		
		//	all aligned
		if ( Values.length == ExpectedValueCount )
		{
			UniformMeta.SetValues( Values );
			return;
		}
		//	providing MORE values, do a quick slice. Should we warn about this?
		if ( Values.length >= ExpectedValueCount )
		{
			Pop.Debug(`SetUniformArray(${UniformName}) culling range ${Values.length} values/${ExpectedValueCount} in shader`);
			const ValuesCut = Values.slice(0,ExpectedValueCount);
			UniformMeta.SetValues( ValuesCut );
			return;
		}
		
		//Pop.Debug(`SetUniformArray(${UniformName}) slow path`);
		
		//	note: uniform iv may need to be Int32Array;
		//	https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/uniform
		//	enumerate the array
		let ValuesExpanded = [];
		let EnumValue = function(v)
		{
			if ( Array.isArray(v) || ArrayBuffer.isView(v) )	//	array || typedarray
				ValuesExpanded.push(...v);
			else if ( typeof v == "object" )
				v.Enum( function(v)	{	ValuesExpanded.push(v);	} );
			else
				ValuesExpanded.push(v);
		};
		Values.forEach( EnumValue );
		
		//	check array size (allow less, but throw on overflow)
		//	error if array is empty
		while ( ValuesExpanded.length < ExpectedValueCount )
			ValuesExpanded.push(0);
		/*
		 if ( ValuesExpanded.length > UniformMeta.size )
		 throw "Trying to put array of " + ValuesExpanded.length + " values into uniform " + UniformName + "[" + UniformMeta.size + "] ";
		 */
		UniformMeta.SetValues( ValuesExpanded );
	}
	
	SetUniformPopImage(Uniform,UniformMeta,Image,TextureIndex)
	{
		const Texture = Image.GetOpenglTexture( this.Context );
		this.SetUniformTexture( Uniform, UniformMeta, Texture, TextureIndex );
	}
	
	SetUniformTexture(Uniform,UniformMeta,Texture,TextureIndex)
	{
		const gl = this.GetGlContext();
		//  https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
		//  WebGL provides a minimum of 8 texture units;
		const GlTextureNames = [ gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3, gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE6, gl.TEXTURE7 ];
		//	setup textures
		gl.activeTexture( GlTextureNames[TextureIndex] );
		try
		{
			gl.bindTexture(gl.TEXTURE_2D, Texture );
		}
		catch(e)
		{
			Pop.Debug("SetUniformTexture: " + e);
			//  todo: bind an "invalid" texture
		}
		UniformMeta.SetValues( [TextureIndex] );
	}
	
	SetUniformNumber(Uniform,UniformMeta,Value)
	{
		//	these are hard to track down and pretty rare anyone would want a nan
		if ( isNaN(Value) )
			throw "Setting NaN on Uniform " + Uniform.Name;

		const gl = this.GetGlContext();
		UniformMeta.SetValues( [Value] );
	}
	
	
	GetAttributeMetas()
	{
		if ( this.AttributeMetaCache )
			return this.AttributeMetaCache;
	
		//	iterate and cache!
		this.AttributeMetaCache = {};
		let gl = this.GetGlContext();
		let Count = gl.getProgramParameter( this.Program, gl.ACTIVE_ATTRIBUTES );
		for ( let i=0;	i<Count;	i++ )
		{
			const UniformMeta = gl.getActiveAttrib( this.Program, i );
			const Meta = GetUniformOrAttribMeta( gl, this.Program, UniformMeta );
			Meta.Location = gl.getAttribLocation( this.Program, UniformMeta.name );
			this.AttributeMetaCache[Meta.Name] = Meta;
		}
		return this.AttributeMetaCache;
	}
	
	GetUniformMetas()
	{
		if ( this.UniformMetaCache )
			return this.UniformMetaCache;
	
		//	iterate and cache!
		this.UniformMetaCache = {};
		let gl = this.GetGlContext();
		let UniformCount = gl.getProgramParameter( this.Program, gl.ACTIVE_UNIFORMS );
		for ( let i=0;	i<UniformCount;	i++ )
		{
			const UniformMeta = gl.getActiveUniform( this.Program, i );
			const Meta = GetUniformOrAttribMeta( gl, this.Program, UniformMeta );
			this.UniformMetaCache[Meta.Name] = Meta;
		}
		return this.UniformMetaCache;
	}

	GetUniformMeta(Name)
	{
		const Metas = this.GetUniformMetas();
		if ( !Metas.hasOwnProperty(Name) )
		{
			//throw "No uniform named " + MatchUniformName;
			//Pop.Debug("No uniform named " + MatchUniformName);
		}
		return Metas[Name];
	}
	
	GetAttributeMeta(Name)
	{
		const Metas = this.GetAttributeMetas();
		if ( !Metas.hasOwnProperty(Name) )
		{
			//throw "No uniform named " + MatchUniformName;
			//Pop.Debug("No uniform named " + MatchUniformName);
		}
		return Metas[Name];
	}
	
	Free()
	{
		console.warn(`todo: free shader`);
	}
}



function GetOpenglElementType(OpenglContext,Elements)
{
	if ( !Elements )
		throw `GetOpenglElementType( ${Elements} )`;
	if ( Elements instanceof Float32Array )	return OpenglContext.FLOAT;
	if ( Elements instanceof Uint32Array )	return OpenglContext.UNSIGNED_INT;
	if ( Elements instanceof Uint16Array )	return OpenglContext.UNSIGNED_SHORT;
	if ( Elements instanceof Uint8Array )	return OpenglContext.UNSIGNED_BYTE;

	throw `GetOpenglElementType unhandled type; ${Elements.constructor.name}`;
}


//	turn our plain striped attrib layout into opengl-data
//	for geometry, but working towards generic vertex-attrib/vao layout caching in the context
function GetOpenglAttributes(Attribs,RenderContext)
{
	const gl = RenderContext;
	
	function CleanupAttrib(Attrib)
	{
		//	fix attribs
		//	data as array doesn't work properly and gives us
		//	gldrawarrays attempt to access out of range vertices in attribute 0
		if ( Array.isArray(Attrib.Data) )
			Attrib.Data = new Float32Array( Attrib.Data );
			
		Attrib.Stride = Attrib.Stride || 0;
	}
			
	function AttribNameToOpenglAttrib(Name,Index)
	{
		//	should get location from shader binding!
		const Attrib = Attribs[Name];
		CleanupAttrib(Attrib);
		
		//	gr: note the data here is already offset by gltf importer...
		//		we may want to undo that in the importer
		const OpenglAttrib = {};
		OpenglAttrib.Name = Name;
		OpenglAttrib.Floats = Attrib.Data;	//	gr: not all floats now!
		OpenglAttrib.Size = Attrib.Size;
		OpenglAttrib.Type = GetOpenglElementType( gl, Attrib.Data );
		OpenglAttrib.DataIndex = Index;
		OpenglAttrib.Stride = Attrib.Stride;
		//	we do NOT store location here, it's per-shader, not per geometry

		return OpenglAttrib;
	}
	const OpenglAttributes = Object.keys( Attribs ).map( AttribNameToOpenglAttrib );
	return OpenglAttributes;
}

//	attributes are keyed objects for each semantic
//	Attrib['Position'].Size = 3
//	Attrib['Position'].Data = <float32Array(size*vertcount)>
export class TriangleBuffer
{
	constructor(RenderContext,Attribs,TriangleIndexes)
	{
		this.VertexBufferContextVersion = null;
		this.IndexBufferContextVersion = null;
		this.VertexBuffer = null;
		this.IndexBuffer = null;
		this.Vao = null;
		this.VaoContext = null;
		this.TriangleIndexes = null;
		this.TriangleIndexesType = null;	//	gl.UNSIGNED_INT or gl.UNSIGNED_SHORT, but require OES_element_index_uint for 32bit
		this.Attribs = Attribs;
		this.OpenglAttributes = null;			//	calc-once opengl layouts. This should be a seperate thing (which can make use of VAO)
		
		//	backwards compatibility
		if ( typeof Attribs == 'string' )
		{
			Pop.Warning("[deprecated] Old TriangleBuffer constructor, use a keyed object");
			const VertexAttributeName = arguments[1];
			const VertexData = arguments[2];
			const VertexSize = arguments[3];
			this.TriangleIndexes = arguments[4];
			const Attrib = {};
			Attrib.Size = VertexSize;
			Attrib.Data = VertexData;
			this.Attribs = {};
			this.Attribs[VertexAttributeName] = Attrib;
		}
	
		//	verify input
		function VerifyAttrib(AttribName)
		{
			const Attrib = this.Attribs[AttribName];
			if ( typeof Attrib.Size != 'number' )
				throw `Attrib ${AttribName} size(${Attrib.Size}) not a number`;
			
			//	https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer
			if ( Attrib.Size < 1 || Attrib.Size > 4 )
				throw `Attrib ${AttribName} size(${Attrib.Size}) should be between 1 and 4`;
				
			if ( !Array.isArray(Attrib.Data) && !Pop.IsTypedArray(Attrib.Data) )
				throw `Attrib ${AttribName} data(${typeof Attrib.Data}) not an array`;
		}
		Object.keys(this.Attribs).forEach(VerifyAttrib.bind(this));
		
		//	check triangle indexes
		if ( TriangleIndexes )
		{
			const gl = RenderContext.GetGlContext();
			//	convert array to a typed array
			//	todo: detect >16bit values
			if ( Array.isArray(TriangleIndexes) )
			{
				TriangleIndexes = new Uint32Array(TriangleIndexes);
			}
			
			//	 use of gl.UNSIGNED_INT needs OES_element_index_uint support (missing on safari, and some other machines)
			if ( TriangleIndexes instanceof Uint32Array )
			{
				//	if we don't support 32bit, convert to 16bit and throw if some vertexes out of bouds
				//	todo: split mesh?
				if ( !gl.UNSIGNED_INT )
				{
					Pop.Debug(`32bit indexes not supported, converting to 16 bit...`);
					const TriangleIndexes16 = new Uint16Array(TriangleIndexes.length);
					for ( let i=0;	i<TriangleIndexes.length;	i++ )
						TriangleIndexes16[i] = TriangleIndexes[i];
					TriangleIndexes = TriangleIndexes16;
				}
			}
			else if ( TriangleIndexes instanceof Uint8Array )
			{
				//	if we don't support 8bit, convert to 16bit
				if ( !gl.UNSIGNED_BYTE )
				{
					throw `8 bit indexes not supported`;
				}
			}
			else if ( TriangleIndexes instanceof Uint16Array )
			{
			}
			else
			{
				throw `Triangle indexes provided is not an array, or 16/32bit typed array`;
			}
			this.TriangleIndexes = TriangleIndexes;
			this.TriangleIndexesType = (TriangleIndexes instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
		}
		
	}
	
	GetVertexBuffer(RenderContext)
	{
		if ( this.VertexBufferContextVersion !== RenderContext.ContextVersion )
		{
			//	don't warn on first creation
			if ( this.VertexBufferContextVersion!==null )
				Pop.Warning("Vertex Buffer context version changed",this.VertexBufferContextVersion,RenderContext.ContextVersion);
			this.CreateVertexBuffer(RenderContext);
		}
		return this.VertexBuffer;
	}
	
	GetIndexBuffer(RenderContext)
	{
		if ( this.IndexBufferContextVersion !== RenderContext.ContextVersion )
		{
			//	don't warn on first creation
			if ( this.IndexBufferContextVersion!==null )
				Pop.Warning("IndexBuffer context version changed",this.IndexBufferContextVersion,RenderContext.ContextVersion);
			this.CreateIndexBuffer(RenderContext);
		}
		return this.IndexBuffer;
	}
	
	DeleteBuffer(RenderContext)
	{
		RenderContext.OnDeletedGeometry( this );
	}
	
	Free()
	{
		//	gr: free() needs to do more than this
		this.DeleteVao();
	}
	
	DeleteVao()
	{
		if ( !this.Vao )
			return;
		
		this.VaoContext.deleteVertexArray(this.Vao);
		this.Vao = null;
		this.VaoContext = null;
	}
	
	GetVao(RenderContext,Shader)
	{
		//	only checking vertex buffer context version as we may not have an index one
		if ( this.VertexBufferContextVersion !== RenderContext.ContextVersion )
		{
			this.DeleteVao();
		}
		if ( this.Vao )
			return this.Vao;
		
		//	setup vao
		{
			const gl = RenderContext.GetGlContext();
			//this.Vao = gl.OES_vertex_array_object.createVertexArrayOES();
			this.Vao = gl.createVertexArray();
			this.VaoContext = gl;
			
			//	this currently initialises opengl layout
			this.GetVertexBuffer(RenderContext);
			
			//	setup buffer & bind stuff in the vao
			gl.bindVertexArray( this.Vao );
			/*
			//	we'll need this if we start having multiple attributes
			if ( DisableOldVertexAttribArrays )
				for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
					gl.disableVertexAttribArray(i);
			 */
			this.BindVertexPointers( RenderContext, Shader );
		
			gl.bindVertexArray( null );
		}
		return this.Vao;
	}
			
	//	todo: VAO's are a description of attributes, and not tied to buffers
	//	our rendercontext should pool, hash & share VAO's (shader locations + attrib layouts)
	//	https://stackoverflow.com/a/61583362/355753 
	//	^^ explains this well; "Setting buffer binding state is much cheaper than setting vertex format state."
	//	then we can make triangle buffers fast by fetching known VAO formats and binding new(or reusing)
	//	buffers when rendering
	CreateVertexBuffer(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		
		const Attribs = this.Attribs;
		this.VertexBuffer = gl.createBuffer();
		this.VertexBufferContextVersion = RenderContext.ContextVersion;
		
		this.PrimitiveType = gl.TRIANGLES;
		
		let MinVertexIndex = 0;
		let MaxVertexIndex = 0;
		if ( this.TriangleIndexes )
		{
			this.IndexCount = this.TriangleIndexes.length;
			MinVertexIndex = this.TriangleIndexes[0];
			MaxVertexIndex = this.TriangleIndexes[0];
			for ( let VertexIndex of this.TriangleIndexes )
			{
				MinVertexIndex = Math.min( MinVertexIndex, VertexIndex );
				MaxVertexIndex = Math.max( MaxVertexIndex, VertexIndex );
			}
		}
		else
		{
			const FirstAttrib = Attribs[Object.keys(Attribs)[0]];
			this.IndexCount = (FirstAttrib.Data.length / FirstAttrib.Size);
			MinVertexIndex = 0;
			MaxVertexIndex = this.IndexCount - 1;
		}
		
		//	this needs changing for non-triangle geometry
		if ( this.IndexCount % 3 != 0 )
		{
			throw "Triangle index count not divisible by 3";
		}
		
		console.log(`Triangle->VertexIndex min=${MinVertexIndex} max=${MaxVertexIndex}`);
		
		//	get the opengl-vertex/attrib layout
		this.OpenglAttributes = GetOpenglAttributes(Attribs,gl);

		function GetAttribVertexCount(Attrib)
		{
			return Attrib.Data.length / Attrib.Size;
		}
		
		function GetAttribByteSize(Attrib)
		{
			return Attrib.Size * Attrib.Data.BYTES_PER_ELEMENT;
		}
		
		for ( let AttribName of Object.keys(Attribs) )
		{
			const Attrib = Attribs[AttribName];
			const AttribVertexCount = GetAttribVertexCount( Attrib );
			console.log(`${AttribName} Vertex count = ${AttribVertexCount} x${Attrib.Size}`);
		}

		const AttribVertexCount = GetAttribVertexCount( Object.values(Attribs)[0] );
		if ( MinVertexIndex <0 || MaxVertexIndex >= AttribVertexCount )
			console.error(`Triangles out of range; Vertexes=${AttribVertexCount} triangle min=${MinVertexIndex} triangle max=${MaxVertexIndex}`);

		
		let TotalByteLength = 0;
		for ( let Attrib of Object.values(Attribs) )
			TotalByteLength += Attrib.Data.byteLength;
		
		const InterleavedData = (this.OpenglAttributes[0].Stride != 0) ? this.OpenglAttributes[0].Floats : null;
		//const InterleavedData = false;

		//	when using stride, we assume they're all using the same buffer.
		//	need to handle when different buffers and still concat
		let TotalData = null;
		if ( InterleavedData )
		{
			//	all strides need to be the same, otherwise, they're probably pointing at different data
			//	or stomping over each other, which could be possible!
			const AttribSizes = Object.values(Attribs).map( GetAttribByteSize );
			const Strides = this.OpenglAttributes.map( a => a.Stride );
			const StrideMisMatches = Strides.filter( s => s!=Strides[0] );
			if ( StrideMisMatches.length )
				throw `Got attributes with mis matched strides; ${Strides.join()}`;

			const DataS = Object.values(Attribs).map( a => a.Data );
			const DataBuffers = Object.values(Attribs).map( a => a.Data.buffer );
			const DataBufferMisMatches = DataBuffers.filter( s => s!=DataBuffers[0] );
			if ( DataBufferMisMatches.length )
				throw `Got interleaved data with different underlying buffers`;

			const VertexStride = Strides[0];
			//	gr: this is wrong, but interestingly /12
			const VertexCount = InterleavedData.byteLength / VertexStride;
			console.log(`Interleaved vertex count ${VertexCount}`);
			
			//TotalData = this.OpenglAttributes[0].Floats;
			this.OpenglByteSize = this.OpenglAttributes[0].Floats.byteLength;
			TotalByteLength = this.OpenglAttributes[0].Floats.byteLength;
		}
		else
		{
			//	concat data into one vertex buffer, and re-write ByteOffset
			let TotalData = new Uint8Array( TotalByteLength );
			
			let TotalDataOffset = 0;
			for ( let Attrib of this.OpenglAttributes )
			{
				TotalData.set( Attrib.Floats, TotalDataOffset );
				Attrib.ByteOffset = TotalDataOffset;// * Attrib.Floats.BYTES_PER_ELEMENT;
				Attrib.Stride = 0;
				TotalDataOffset += Attrib.Floats.byteLength;
			}
			this.OpenglByteSize = TotalData.byteLength;
		}

		gl.bindBuffer( gl.ARRAY_BUFFER, this.VertexBuffer );
		
		//	concatonated, just push all the data
		if ( TotalData )
		{
			gl.bufferData( gl.ARRAY_BUFFER, TotalData, gl.STATIC_DRAW );
		}
		else
		{
			//	init buffer size
			//gl.bufferData(gl.ARRAY_BUFFER, TotalByteLength, gl.STREAM_DRAW);
			gl.bufferData(gl.ARRAY_BUFFER, TotalByteLength, gl.STATIC_DRAW);
			//gl.bufferData(gl.ARRAY_BUFFER, this.OpenglAttributes[0].Floats, gl.STREAM_DRAW);
			//gl.bufferData( gl.ARRAY_BUFFER, VertexData, gl.STATIC_DRAW );

			if ( InterleavedData )
			{
				const GlAttribs = this.OpenglAttributes;
				const InterleavedBuffer = GlAttribs[0].Floats;
				//	this assumes they're all using the same buffer
				gl.bufferSubData( gl.ARRAY_BUFFER, 0, InterleavedBuffer );
				

				function GetFirstByteOffset(DataIndex)
				{
					let FirstByteOffset = 0;
					for ( let Attrib of GlAttribs )
					{
						if ( Attrib.DataIndex < DataIndex )
						{
							const AttribSizeBytes = Attrib.Size * Attrib.Floats.BYTES_PER_ELEMENT;
							FirstByteOffset += AttribSizeBytes;
						}
					}
					return FirstByteOffset;
				}

				//	need to write byte offsets
				function BufferAttribData(Attrib)
				{
					Attrib.ByteOffset = GetFirstByteOffset(Attrib.DataIndex);
				}
				this.OpenglAttributes.forEach( BufferAttribData );
			}
			else
			{
				let AttribByteOffset = 0;
				function BufferAttribData(Attrib)
				{
					//gl.bufferData( gl.ARRAY_BUFFER, VertexData, gl.STATIC_DRAW );
					gl.bufferSubData( gl.ARRAY_BUFFER, AttribByteOffset, Attrib.Floats );
					Attrib.ByteOffset = AttribByteOffset;
					AttribByteOffset += Attrib.Floats.byteLength;
				}
				this.OpenglAttributes.forEach( BufferAttribData );
				this.OpenglByteSize = AttribByteOffset;
			}
		}
		
		RenderContext.OnAllocatedGeometry( this );
	}
	
	
	CreateIndexBuffer(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		
		if ( !this.TriangleIndexes )
		{
			this.IndexBuffer = null;
			this.IndexBufferContextVersion = RenderContext.ContextVersion;
			return;
		}
			 
		this.IndexBuffer = gl.createBuffer();
		this.IndexBufferContextVersion = RenderContext.ContextVersion;
		this.PrimitiveType = gl.TRIANGLES;
		//	set the total buffer data
		gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer );
		gl.bufferData( gl.ELEMENT_ARRAY_BUFFER, this.TriangleIndexes, gl.STATIC_DRAW );
	}
	
	
	
	BindVertexPointers(RenderContext,Shader)
	{
		const gl = RenderContext.GetGlContext();
		
		//	setup offset in buffer
		let InitAttribute = function(Attrib)
		{
			//	this shader doesn't use this attrib
			const ShaderAttrib = Shader.GetAttributeMeta(Attrib.Name);
			if ( !ShaderAttrib )
				return;
			
			const Location = ShaderAttrib.Location;
			let Normalised = false;
			let StrideBytes = Attrib.Stride;
			let OffsetBytes = Attrib.ByteOffset;
			gl.enableVertexAttribArray( Location );
			gl.vertexAttribPointer( Location, Attrib.Size, Attrib.Type, Normalised, StrideBytes, OffsetBytes );
			//	repeats per vertex(0) not per instance(1)
			gl.vertexAttribDivisor( Location, 0 );
		}
		this.OpenglAttributes.forEach( InitAttribute );
	}
	
	Bind(RenderContext,Shader)
	{
		const gl = RenderContext.GetGlContext();

		//	gr: need to clear all bindings on a fresh geo binding;
		//		the problem here was some old instancd attributes were still bound
		//	we'll need this if we start having multiple attributes
		/*
		if ( DisableOldVertexAttribArrays )
		{
			for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
			{
				gl.vertexAttribDivisor( i, 0);
				gl.disableVertexAttribArray(i);
			}
		}
		*/

		let VertexBuffer = this.GetVertexBuffer( RenderContext );
		let IndexBuffer = this.GetIndexBuffer( RenderContext );
		
		//	bind the vertex layout
		const Vao = AllowVao ? this.GetVao( RenderContext, Shader ) : null;
		if ( Vao )
		{
			//	todo: need to fix VAO's;
			//		need to establish the exact things stored in a vao
			//		and whether we need vao per shader+geo or just per geo
			//	currently broken as we're using 1 geo for 2 shaders with different attrib locations
			//	VAO contains
			//		- buffer
			//		- vertex offset
			//		- vertex divisor?
			//		- attribute location?
			gl.bindVertexArray( Vao );
			function InitAttribute(Attrib)
			{
				const ShaderAttrib = Shader.GetAttributeMeta(Attrib.Name);
				if ( !ShaderAttrib )
					return;
				gl.enableVertexAttribArray( ShaderAttrib.Location );
			}
			this.OpenglAttributes.forEach( InitAttribute );
		}
		else
		{
			//	this currently initialises opengl layout
			this.GetVertexBuffer(RenderContext);
			
			//	gr: we get glDrawArrays: attempt to access out of range vertices in attribute 0, if we dont update every frame (this seems wrong)
			//		even if we call gl.enableVertexAttribArray
			gl.bindBuffer( gl.ARRAY_BUFFER, VertexBuffer );
			gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, IndexBuffer );
			this.BindVertexPointers( RenderContext, Shader );
		}

	}
	
	Draw(RenderContext,Instances=0)
	{
		const gl = RenderContext.GetGlContext();

		//	in future, we may use instances=0 for something, if we have a
		//	platform we cannot call instancing on
		//	instances=0 renders nothing (as expected!)
		Instances = Math.max( 1, Instances );

		//	gr: it seems we can provide an extra instanced param to drawXXX() without any problems
		//		we can also just use the instanced params	
		if ( this.TriangleIndexes )
		{
			const Offset = 0;
			//	todo less magic numbers!
			if ( this.PrimitiveType != gl.TRIANGLES )
				throw `todo: Handle element drawing with non-triangle primitives`;
			//	gr: this should be number of VERTEXES not number of primitives.
			//		don't change this again! (fix client code which makes me change this)
			const ElementCount = this.IndexCount;
			gl.drawElementsInstanced( this.PrimitiveType, ElementCount, this.TriangleIndexesType, Offset, Instances );
		}
		else
		{
			//gl.drawArrays( this.PrimitiveType, 0, this.IndexCount, Instances );
			gl.drawArraysInstanced( this.PrimitiveType, 0, this.IndexCount, Instances );
		}
	}
	
	GetIndexCount()
	{
		return this.IndexCount;
	}
}

