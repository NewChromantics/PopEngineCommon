import PopImage from './PopWebImageApi.js'
import * as Pop from './PopWebApi.js'
const Default = 'Pop Opengl module';
export default Default;
import {GetUniqueHash} from './Hash.js'
import {CreatePromise} from './PopApi.js'





//	counters for debugging
export const Stats = {};
Stats.TrianglesDrawn = 0;
Stats.BatchesDrawn = 0;
Stats.GeometryBindSkip = 0;
Stats.ShaderBindSkip = 0;
Stats.GeometryBinds = 0;
Stats.ShaderBinds = 0;
Stats.Renders = 0;

//	webgl only supports glsl 100!
const GlslVersion = 100;

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


function GetString(Context,Enum)
{
	const gl = Context;
	const Enums =
	[
	 'FRAMEBUFFER_COMPLETE',
	 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT',
	 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT',
	 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS',
	 'FRAMEBUFFER_UNSUPPORTED'
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


//	gl.isFrameBuffer is expensive! probably flushing
const TestFrameBuffer = false;
const TestAttribLocation = false;
const DisableOldVertexAttribArrays = false;
const AllowVao = !Pop.GetExeArguments().DisableVao;
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







//	this is currenly in c++ in the engine. need to swap to javascript
function RefactorGlslShader(Source)
{
	if ( !Source.startsWith('#version ') )
	{
		Source = '#version ' + GlslVersion + '\n' + Source;
	}
	
	//Source = 'precision mediump float;\n' + Source;
	
	Source = Source.replace(/float2/gi,'vec2');
	Source = Source.replace(/float3/gi,'vec3');
	Source = Source.replace(/float4/gi,'vec4');

	return Source;
}

function RefactorVertShader(Source)
{
	Source = RefactorGlslShader(Source);
	
	if ( GlslVersion == 100 )
	{
		Source = Source.replace(/\nin /gi,'\nattribute ');
		Source = Source.replace(/\nout /gi,'\nvarying ');
		
		//	webgl doesn't have texture2DLod, it just overloads texture2D
		//	in webgl1 with the extension, we need the extension func
		//	in webgl2 with #version 300 es, we can use texture2D
		//	gr: then it wouldn't accept texture2DLodEXT (webgl1)
		//		... then texture2DLod worked
		//Source = Source.replace(/texture2DLod/gi,'texture2DLodEXT');
		//Source = Source.replace(/texture2DLod/gi,'texture2D');
		Source = Source.replace(/textureLod/gi,'texture2DLod');
		
	}
	else if ( GlslVersion >= 300 )
	{
		Source = Source.replace(/attribute /gi,'in ');
		Source = Source.replace(/varying /gi,'out ');
		//Source = Source.replace(/gl_FragColor/gi,'FragColor');
	}
	
	return Source;
}

function RefactorFragShader(Source)
{
	Source = RefactorGlslShader(Source);

	//	gr: this messes up xcode's auto formatting :/
	//let Match = /texture2D\(/gi;
	let Match = 'texture(';
	Source = Source.replace(Match,'texture2D(');

	if ( GlslVersion == 100 )
	{
		//	in but only at the start of line (well, after the end of prev line)
		Source = Source.replace(/\nin /gi,'\nvarying ');
	}
	else if ( GlslVersion >= 300 )
	{
		Source = Source.replace(/varying /gi,'in ');
		//Source = Source.replace(/gl_FragColor/gi,'FragColor');
	}
	return Source;
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





//	parsed geometry info
class TCreateGeometry
{
}

//	matching native workflow
//	return TCreateGeometry from geo VertexAttribute descriptions
function ParseGeometryObject(VertexAttributesObject)
{
	return VertexAttributesObject;
	throw `todo: ParseGeometryObject()`;
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
		this.TargetImages = [];	//	if none then renders to screen
		this.ClearColour = null;
	}
	
	static ParseCommand(Params,PushCommand)
	{
		const SetRenderTarget = new RenderCommand_SetRenderTarget();
		
		//	targets can be null (screen), image, or array of images
		let Targets = Params[1];
		if ( Targets === null )
		{
			//	must not have readback format
			if ( Params[3] != undefined )
				throw `Render-to-screen(null) target must not have read-back format`;
		}
		else
		{
			if ( !Array.isArray(Targets) )
				Targets = [Targets];
			
			//	need to make sure these are all images
			SetRenderTarget.TargetImages.push(...Targets);
		}
		
		SetRenderTarget.ReadBack = (Params[3] === true);
		
		//	make update commands for any render targets
		for ( let Image of SetRenderTarget.TargetImages )
		{
			const UpdateImageCommand = new RenderCommand_UpdateImage();
			UpdateImageCommand.Image = Image;
			UpdateImageCommand.IsRenderTarget = true;
			PushCommand( UpdateImageCommand );
		}
		
		//	arg 2 is clear colour, or if none provided (or zero alpha), no clear
		SetRenderTarget.ClearColour = Params[2];
		if ( SetRenderTarget.ClearColour && SetRenderTarget.ClearColour.length < 3 )
		{
			throw `Clear colour provided ${Command.ClearColour.length} colours, expecting RGB or RGBA`;
		}
		if ( SetRenderTarget.ClearColour.length < 4 )
			SetRenderTarget.ClearColour.push(1);
		
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
		this.Image = null;
		this.IsRenderTarget = false;
	}
}

class RenderCommand_Draw extends RenderCommand_Base
{
	constructor()
	{
		super();
		this.Geometry = null;
		this.Shader = null;
		this.Uniforms = {};
	}
	
	static ParseCommand(Params,PushCommand)
	{
		const Draw = new RenderCommand_Draw();
		
		//	get all images used in uniforms and push an update image command
		Draw.Geometry = Params[1];
		Draw.Shader = Params[2];
		Draw.Uniforms = Params[3];
		
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
	const Name = CommandParams[0];//.shift();
	const Type = RenderCommandTypeMap[Name];
	if ( !Type )
		throw `Unknown render command ${Name}`;
	
	Type.ParseCommand(CommandParams,PushCommand);
}		
		


//	this is just an array of commands, but holds the promise to resolve once it's rendered
class RenderCommands_t
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
	constructor(Canvas,ContextOptions={})
	{
		if ( !(Canvas instanceof HTMLCanvasElement) )
			throw `First element of Opengl.Context now expected to be a canvas`;
			
		this.CanvasElement = Canvas;		//	cached element pointer
		this.ContextOptions = ContextOptions || {};

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

	Close()
	{
		Pop.Debug(`Opengl.Window.Close`);

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
		this.RefreshCanvasResolution();
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
	
	GetScreenRect()
	{
		if ( !this.ScreenRectCache )
		{
			let Canvas = this.GetCanvasElement();
			let ElementRect = Canvas.getBoundingClientRect();
			this.ScreenRectCache = [ ElementRect.x, ElementRect.y, ElementRect.width, ElementRect.height ];
			
			//	gr: the bounding rect is correct, BUT for rendering,
			//		we should match the canvas pixel size
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
			Rect = [0,0,Width,Height];
			Pop.Debug("SetCanvasSize defaulting to ",Rect,"ParentSize=" + ParentSize,"ParentInnerSize=" + ParentInnerSize,"WindowInnerSize=" + WindowInnerSize);
			return Rect;
		}
		
		throw `Don't know how to get canvas size`;
	}
		
	RefreshCanvasResolution()
	{
		const Canvas = this.GetCanvasElement();

		//	gr: this function now should always just get the rect via dom, 
		//		if it can't get it from itself, from it's parent
		//	GetScreenRect should be using canvas w/h, so this must always be called before
		const Rect = this.GetCanvasDomRect(Canvas);
		const w = Rect[2];
		const h = Rect[3];
		
		//	re-set resolution to match
		Canvas.width = w;
		Canvas.height = h;
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
		const ContextMode = "webgl";
		const Canvas = this.GetCanvasElement();
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
		
		if ( !Context )
			throw "Failed to initialise " + ContextMode;
		
		if ( Context.isContextLost() )
		{
			//	gr: this is a little hacky
			throw "Created " + ContextMode + " context but is lost";
		}
		
		const gl = Context;
		
		//	debug capabilities
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
		Pop.Debug(`Created new ${ContextMode} context. Capabilities; ${JSON.stringify(Capabilities)}`);
		
		
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
			EnableExtension('OES_texture_float',InitFloatTexture);
			EnableExtension('OES_texture_float_linear',InitFloatLinearTexture);
		}
		EnableExtension('WEBGL_depth_texture',InitDepthTexture);
		EnableExtension('EXT_blend_minmax');
		EnableExtension('OES_vertex_array_object', this.InitVao.bind(this) );
		EnableExtension('WEBGL_draw_buffers', this.InitMultipleRenderTargets.bind(this) );
		
		//	texture load needs extension in webgl1
		//	in webgl2 it's built in, but requires #version 300 es
		//	gr: doesnt NEED to be enabled??
		//EnableExtension('EXT_shader_texture_lod');
		//EnableExtension('OES_standard_derivatives');

		return Context;
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

	
	InitVao(Context,Extension)
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
	
	//	render some commands, (parse here)
	//	queue up, and return their promise so caller knows when it's rendered
	async Render(Commands)
	{
		const RenderCommands = new RenderCommands_t(Commands);
		this.PendingRenderCommands.push(RenderCommands);
		return RenderCommands.Promise;
	}
	
	RenderLoop()
	{
		//	wait for new paint event ("render thread")
		//	process all queued render-submissions (which resolve a promise)
		
		let Render = function(Timestamp)
		{
			//	try and get the context, if this fails, it may be temporary
			try
			{
				this.GetGlContext();
			}
			catch(e)
			{
				//	Renderloop error, failed to get context... waiting to try again
				console.error("OnRender error: ",e);
				setTimeout( Render.bind(this), RetryGetContextMs );
				return;
			}
			
			//	pop all the commands so we don't get stuck in an infinite loop if a command queues more commands
			const PendingRenderCommands = this.PendingRenderCommands;
			this.PendingRenderCommands = [];

			for ( let RenderCommands of PendingRenderCommands )
			{
				try
				{
					this.ProcessRenderCommands(RenderCommands);
					RenderCommands.OnRendered();
				}
				catch(e)
				{
					RenderCommands.OnError(e);
				}
			}
			
			//	request next frame, before any render fails, so we will get exceptions thrown for debugging, but recover
			window.requestAnimationFrame( Render.bind(this) );

			Stats.Renders++;
		}
		window.requestAnimationFrame( Render.bind(this) );
	}
	
	ProcessRenderCommands(RenderCommands)
	{
		//	current state
		let PassRenderTargets = [];
		let PassTargetUnbinds = [];
		let InsidePass = false;
		const EndPass = function()
		{
			if ( InsidePass )
			{
				//	endpass()
				//	unbind targets?
				PassTargetUnbinds.forEach( Unbind => Unbind() );
				PassRenderTargets = [];
				InsidePass = false;
			}
		}.bind(this);
		
		const NewPass = function(TargetImages,ClearColour)
		{
			//	zero alpha = no clear so we just load old contents
			if ( ClearColour && ClearColour[3] <= 0.0 )
				ClearColour = null;
				
			EndPass();
			if ( !TargetImages.length )
			{
				//	bind to screen
				const Target = new WindowRenderTarget(this);
				const Unbind = Target.BindRenderTarget(this);
				PassRenderTargets.push(Target);
				PassTargetUnbinds.push(Unbind);
			}
			else
			{
				//	get texture target
				throw `todo; texture render target pass`;
			}
			if ( ClearColour )
			{
				PassRenderTargets[0].ClearColour(...ClearColour);
			}
			PassRenderTargets[0].ResetState();
		}.bind(this);
		
		//	run each command
		try
		{
			for ( let RenderCommand of RenderCommands.Commands )
			{
				if ( RenderCommand instanceof RenderCommand_UpdateImage )
				{
					//	get image
					//	get/create opengl texture
					//	update pixels if out of date
					throw `Handle RenderCommand_UpdateImage`; 
				}
				else if ( RenderCommand instanceof RenderCommand_Draw ) 
				{
					const RenderContext = this;
					const Geometry = RenderCommand.Geometry;
					const Shader = RenderCommand.Shader;
					
					//	get geometry
					//	get shader
					//	bind geo
					Geometry.Bind( RenderContext );
					//	bind shader
					Shader.Bind( RenderContext );
					//	set uniforms
					for ( let UniformKey in RenderCommand.Uniforms )
					{
						const UniformValue = RenderCommand.Uniforms[UniformKey];
						Shader.SetUniform( UniformKey, UniformValue );
					}
										
					//	draw polygons
					Geometry.Draw(RenderContext);
				}
				else if ( RenderCommand instanceof RenderCommand_SetRenderTarget ) 
				{
					//	get all target texture[s]/null
					//	get clear colour
					//	fetch opengl render targets/screen target
					//	bind target[s]
					//	clear
					NewPass( RenderCommand.TargetImages, RenderCommand.ClearColour );
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
		/*
		catch(e)
		{
		}*/
		finally
		{
			EndPass();
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
	
	GetRenderTargetIndex(Textures)
	{
		function MatchRenderTarget(RenderTarget)
		{
			const RTTextures = RenderTarget.Images;
			if ( RTTextures.length != Textures.length )
				return false;
			//	check hash of each one
			for ( let i=0;	i<RTTextures.length;	i++ )
			{
				const a = GetUniqueHash( RTTextures[i] );
				const b = GetUniqueHash( Textures[i] );
				if ( a != b )
					return false;
			}
			return true;
		}
		
		const RenderTargetIndex = this.TextureRenderTargets.findIndex(MatchRenderTarget);
		if ( RenderTargetIndex < 0 )
			return false;
		return RenderTargetIndex;
	}
	
	GetTextureRenderTarget(Textures)
	{
		if ( !Array.isArray(Textures) )
			Textures = [Textures];
		
		const RenderTargetIndex = this.GetRenderTargetIndex(Textures);
		if ( RenderTargetIndex !== false )
			return this.TextureRenderTargets[RenderTargetIndex];
		
		//	make a new one
		const RenderTarget = new TextureRenderTarget( Textures );
		this.TextureRenderTargets.push( RenderTarget );
		if ( this.GetRenderTargetIndex(Textures) === false )
			throw "New render target didn't re-find";
		return RenderTarget;
	}
	
	FreeRenderTarget(Textures)
	{
		if ( !Array.isArray(Textures) )
			Textures = [Textures];
		
		//	in case there's more than one!
		while(true)
		{
			const TargetIndex = this.GetRenderTargetIndex(Textures);
			if ( TargetIndex === false )
				break;
				
			this.TextureRenderTargets.splice(TargetIndex,1);
		}
	}
	
	ReadPixels(Image,ReadBackFormat)
	{
		const RenderContext = this;
		const gl = this.GetGlContext();
		const RenderTarget = this.GetTextureRenderTarget(Image);
		const Unbind = RenderTarget.BindRenderTarget( RenderContext );
		const Pixels = {};
		Pixels.Width = RenderTarget.GetRenderTargetRect()[2];
		Pixels.Height = RenderTarget.GetRenderTargetRect()[3];
		Pixels.Format = ReadBackFormat;
		if ( ReadBackFormat == 'RGBA' )
		{
			Pixels.Channels = 4;
			Pixels.Data = new Uint8Array(Pixels.Width * Pixels.Height * Pixels.Channels);
			gl.readPixels(0,0,Pixels.Width,Pixels.Height,gl.RGBA,gl.UNSIGNED_BYTE,Pixels.Data);
			Unbind();
			return Pixels;
		}
		else if ( ReadBackFormat == 'Float4' )
		{
			Pixels.Channels = 4;
			Pixels.Data = new Float32Array(Pixels.Width * Pixels.Height * Pixels.Channels);
			gl.readPixels(0,0,Pixels.Width,Pixels.Height,gl.RGBA,gl.FLOAT,Pixels.Data);
			Unbind();
			return Pixels;
		}
		//	this needs to restore bound rendertarget, really
		//	although any renders should be binding render target explicitly
		Unbind();
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
		const ShaderName = `A shader`;
		//	gr: I think this can be synchronous in webgl
		const ShaderObject = new Shader(this, ShaderName, VertSource, FragSource );
		//	gr: this needs to be managed so it's freed when no longer needed!
		return ShaderObject;
		throw `Todo; CreateShader`;
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
			const gl = RenderContext.GetGlContext();
			const Width = RenderTarget.GetRenderTargetRect()[2];
			const Height = RenderTarget.GetRenderTargetRect()[3];
			const Pixels = new Uint8Array(Width * Height * 4);
			gl.readPixels(0,0,Width,Height,gl.RGBA,gl.UNSIGNED_BYTE,Pixels);
			const target = ReadTargetTexture !== undefined ? ReadTargetTexture : TargetTexture
			target.WritePixels(Width,Height,Pixels,'RGBA');
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
		gl.enable(gl.SCISSOR_TEST);
		//	to make blending work well, don't reject things on same plane
		gl.depthFunc(gl.LEQUAL);
	}
	
	SetBlendModeBlit()
	{
		const gl = this.GetGlContext();
		
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.ONE, gl.ZERO );
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	SetBlendModeAlpha()
	{
		const gl = this.GetGlContext();
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	SetBlendModeMax()
	{
		const gl = this.GetGlContext();
		if ( gl.EXT_blend_minmax === undefined )
			throw "EXT_blend_minmax hasn't been setup on this context";
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		//gl.blendEquation( gl.FUNC_ADD );
		gl.blendEquation( gl.EXT_blend_minmax.MAX_EXT );
		//GL_FUNC_ADD
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
	
}


//	maybe this should be an API type
class TextureRenderTarget extends RenderTarget
{
	constructor(Images)
	{
		super();
		if ( !Array.isArray(Images) )
			throw "Pop.Opengl.TextureRenderTarget now expects array of images for MRT support";
		
		this.FrameBuffer = null;
		this.FrameBufferContextVersion = null;
		this.FrameBufferRenderContext = null;
		this.Images = Images;
			
		//	verify each image is same dimensions (and format?)
		this.IsImagesValid();
	}
	
	IsImagesValid()
	{
		// Pop.Debug("IsImagesValid",this);
		
		//	if multiple images, size and format need to be the same
		const Image0 = this.Images[0];
		const IsSameAsImage0 = function(Image)
		{
			if ( Image.GetWidth() != Image0.GetWidth() )	return false;
			if ( Image.GetHeight() != Image0.GetHeight() )	return false;
			if ( Image.PixelsFormat != Image0.PixelsFormat )	return false;
			return true;
		}
		if ( !this.Images.every( IsSameAsImage0 ) )
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
		const FirstImage = this.Images[0];
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
		
		//  attach this texture to colour output
		const Level = 0;
		
		//	one binding, use standard mode
		if ( this.Images.length == 1 )
		{
			const Image = this.Images[0];
			const AttachmentPoint = gl.COLOR_ATTACHMENT0;
			const Texture = Image.GetOpenglTexture( RenderContext );
			//gl.bindTexture(gl.TEXTURE_2D, null);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, AttachmentPoint, gl.TEXTURE_2D, Texture, Level );
		}
		else
		{
			//	MRT
			if ( !gl.WEBGL_draw_buffers )
				throw "Context doesn't support MultipleRenderTargets/WEBGL_draw_buffers";
			const AttachmentPoints = gl.WEBGL_draw_buffers.AttachmentPoints;
			const Attachments = [];
			function BindTextureColourAttachment(Image,Index)
			{
				const AttachmentPoint = AttachmentPoints[Index];
				const Texture = Image.GetOpenglTexture( RenderContext );
				Attachments.push( AttachmentPoint );
				gl.framebufferTexture2D(gl.FRAMEBUFFER, AttachmentPoint, gl.TEXTURE_2D, Texture, Level );
			}
			this.Images.forEach( BindTextureColourAttachment );
			
			//	set gl_FragData binds in the shader
			gl.drawBuffers( Attachments );
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
		if ( this.Images )
		{
			//	gr: this is changing the active texture binding... but does it matter?
			/*
			const ImageTarget = this.Images[0];
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
			const Attachments = gl.WEBGL_draw_buffers.AttachmentPoints.slice( 0, this.Images.length );
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
			if ( this.Images )
			{
				const ImageTarget = this.Images[0];
				const Texture = ImageTarget.OpenglTexture;
				gl.bindTexture(gl.TEXTURE_2D,Texture);
				PreviousFilter = ImageTarget.LinearFilter;
				const FilterMode = gl.LINEAR;
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FilterMode);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FilterMode);
				//gl.bindTexture(gl.TEXTURE_2D,null);
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
		this.VertShaderSource = VertShaderSource;
		this.FragShaderSource = FragShaderSource;
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
			this.UniformMetaCache = null;
			this.Context = RenderContext;
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
		function StringToAsciis(String)
		{
			const Asciis = [];
			for ( let i=0;	i<String.length;	i++ )
				Asciis.push( String.charCodeAt(i) );
			return Asciis;
		}
		
		function IsNonAsciiCharCode(CharCode)
		{
			if ( CharCode >= 128 )
				return true;
			if ( CharCode < 0 )
				return true;
			
			//	wierdly, glsl (on a 2011 imac, AMD Radeon HD 6970M 1024 MB, safari, high sierra)
			//	considers ' (ascii 39) a non-ascii char
			if ( CharCode == 39 )
				return true;
			return false;
		}
		
		
		function CleanNonAsciiString(TheString)
		{
			//	safari glsl (on a 2011 imac, AMD Radeon HD 6970M 1024 MB, safari, high sierra)
			//	rejects these chracters as "non-ascii"
			//const NonAsciiCharCodes = [39];
			//const NonAsciiChars = NonAsciiCharCodes.map( cc => {	return String.fromCharCode(cc);});
			const NonAsciiChars = "'@";
			const ReplacementAsciiChar = '_';
			const Match = `[${NonAsciiChars}]`;
			var NonAsciiRegex = new RegExp(Match, 'g');
			const CleanString = TheString.replace(NonAsciiRegex,ReplacementAsciiChar);
			return CleanString;
		}
		
		function CleanLineFeeds(TheString)
		{
			const Lines = TheString.split(/\r?\n/);
			const NewLines = Lines.join('\n');
			return NewLines;
		}
		
		
		Source = CleanNonAsciiString(Source);
		
		//	safari will fail in shaderSource with non-ascii strings, so detect them to make it easier
		const Asciis = StringToAsciis(Source);
		const FirstNonAscii = Asciis.findIndex(IsNonAsciiCharCode);
		if ( FirstNonAscii != -1 )
		{
			const SubSample = 8;
			let NonAsciiSubString = Source.substring( FirstNonAscii-SubSample, FirstNonAscii );
			NonAsciiSubString += `>>>>${Source[FirstNonAscii]}<<<<`;
			NonAsciiSubString += Source.substring( FirstNonAscii+1, FirstNonAscii+SubSample );
			throw `glsl source has non-ascii char around ${NonAsciiSubString}`;
		}
		
		Source = CleanLineFeeds(Source);

		const gl = RenderContext.GetGlContext();
		
		const RefactorFunc = ( Type == gl.FRAGMENT_SHADER ) ? RefactorFragShader : RefactorVertShader;
		Source = RefactorFunc(Source);
		
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
			return;
		if( Array.isArray(Value) )					this.SetUniformArray( Uniform, UniformMeta, Value );
		else if( Value instanceof Float32Array )	this.SetUniformArray( Uniform, UniformMeta, Value );
		else if ( Value instanceof PopImage )		this.SetUniformTexture( Uniform, UniformMeta, Value, this.Context.AllocTextureIndex() );
		else if ( typeof Value === 'number' )		this.SetUniformNumber( Uniform, UniformMeta, Value );
		else if ( typeof Value === 'boolean' )		this.SetUniformNumber( Uniform, UniformMeta, Value );
		else
		{
			console.log(typeof Value);
			console.log(Value);
			throw "Failed to set uniform " +Uniform + " to " + ( typeof Value );
		}
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
			const ValuesCut = Values.slice(0,ExpectedValueCount);
			UniformMeta.SetValues( ValuesCut );
			return;
		}
		
		//Pop.Debug("SetUniformArray("+UniformName+") slow path");
		
		//	note: uniform iv may need to be Int32Array;
		//	https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/uniform
		//	enumerate the array
		let ValuesExpanded = [];
		let EnumValue = function(v)
		{
			if ( Array.isArray(v) )
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
	
	SetUniformTexture(Uniform,UniformMeta,Image,TextureIndex)
	{
		const Texture = Image.GetOpenglTexture( this.Context );
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
			let UniformMeta = gl.getActiveUniform( this.Program, i );
			UniformMeta.ElementCount = UniformMeta.size;
			UniformMeta.ElementSize = undefined;
			//	match name even if it's an array
			//	todo: struct support
			let UniformName = UniformMeta.name.split('[')[0];
			//	note: uniform consists of structs, Array[Length] etc
			
			UniformMeta.Location = gl.getUniformLocation( this.Program, UniformMeta.name );
			switch( UniformMeta.type )
			{
				case gl.SAMPLER_2D:	//	samplers' value is the texture index
				case gl.INT:
				case gl.UNSIGNED_INT:
				case gl.BOOL:
					UniformMeta.ElementSize = 1;
					UniformMeta.SetValues = function(v)	{	gl.uniform1iv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT:
					UniformMeta.ElementSize = 1;
					UniformMeta.SetValues = function(v)	{	gl.uniform1fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_VEC2:
					UniformMeta.ElementSize = 2;
					UniformMeta.SetValues = function(v)	{	gl.uniform2fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_VEC3:
					UniformMeta.ElementSize = 3;
					UniformMeta.SetValues = function(v)	{	gl.uniform3fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_VEC4:
					UniformMeta.ElementSize = 4;
					UniformMeta.SetValues = function(v)	{	gl.uniform4fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_MAT2:
					UniformMeta.ElementSize = 2*2;
					UniformMeta.SetValues = function(v)	{	const Transpose = false;	gl.uniformMatrix2fv( UniformMeta.Location, Transpose, v );	};
					break;
				case gl.FLOAT_MAT3:
					UniformMeta.ElementSize = 3*3;
					UniformMeta.SetValues = function(v)	{	const Transpose = false;	gl.uniformMatrix3fv( UniformMeta.Location, Transpose, v );	};
					break;
				case gl.FLOAT_MAT4:
					UniformMeta.ElementSize = 4*4;
					UniformMeta.SetValues = function(v)	{	const Transpose = false;	gl.uniformMatrix4fv( UniformMeta.Location, Transpose, v );	};
					break;

				default:
					UniformMeta.SetValues = function(v)	{	throw "Unhandled type " + UniformMeta.type + " on " + UniformName;	};
					break;
			}
			
			this.UniformMetaCache[UniformName] = UniformMeta;
		}
		return this.UniformMetaCache;
	}

	GetUniformMeta(MatchUniformName)
	{
		const Metas = this.GetUniformMetas();
		if ( !Metas.hasOwnProperty(MatchUniformName) )
		{
			//throw "No uniform named " + MatchUniformName;
			//Pop.Debug("No uniform named " + MatchUniformName);
		}
		return Metas[MatchUniformName];
	}
	
}



function GetOpenglElementType(OpenglContext,Elements)
{
	if ( Elements instanceof Float32Array )	return OpenglContext.FLOAT;
	
	throw "GetOpenglElementType unhandled type; " + Elements.prototype.constructor;
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
		this.TriangleIndexes = TriangleIndexes;
		this.Attribs = Attribs;
		
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
			
			if ( !Array.isArray(Attrib.Data) && !Pop.IsTypedArray(Attrib.Data) )
				throw `Attrib ${AttribName} data(${typeof Attrib.Data}) not an array`;
		}
		Object.keys(this.Attribs).forEach(VerifyAttrib.bind(this));
	}
	
	GetVertexBuffer(RenderContext)
	{
		if ( this.VertexBufferContextVersion !== RenderContext.ContextVersion )
		{
			Pop.Warning("Vertex Buffer context version changed",this.VertexBufferContextVersion,RenderContext.ContextVersion);
			this.CreateVertexBuffer(RenderContext);
		}
		return this.VertexBuffer;
	}
	
	GetIndexBuffer(RenderContext)
	{
		if ( this.IndexBufferContextVersion !== RenderContext.ContextVersion )
		{
			Pop.Warning("IndexBuffer context version changed",this.IndexBufferContextVersion,RenderContext.ContextVersion);
			this.CreateIndexBuffer(RenderContext);
		}
		return this.IndexBuffer;
	}
	
	DeleteBuffer(RenderContext)
	{
		RenderContext.OnDeletedGeometry( this );
	}
	
	DeleteVao()
	{
		this.Vao = null;
	}
	
	GetVao(RenderContext,Shader)
	{
		if ( this.BufferContextVersion !== RenderContext.ContextVersion )
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
			//	setup buffer & bind stuff in the vao
			gl.bindVertexArray( this.Vao );
			let VertexBuffer = this.GetVertexBuffer( RenderContext );
			let IndexBuffer = this.GetIndexBuffer( RenderContext );
			gl.bindBuffer( gl.ARRAY_BUFFER, VertexBuffer );
			gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, IndexBuffer );
			//	we'll need this if we start having multiple attributes
			if ( DisableOldVertexAttribArrays )
				for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
					gl.disableVertexAttribArray(i);
			this.BindVertexPointers( RenderContext, Shader );
		
			gl.bindVertexArray( null );
		}
		return this.Vao;
	}
			
	
	CreateVertexBuffer(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		
		const Attribs = this.Attribs;
		this.VertexBuffer = gl.createBuffer();
		this.VertexBufferContextVersion = RenderContext.ContextVersion;
		
		this.PrimitiveType = gl.TRIANGLES;
		if ( this.TriangleIndexes )
		{
			this.IndexCount = this.TriangleIndexes.length;
		}
		else
		{
			const FirstAttrib = Attribs[Object.keys(Attribs)[0]];
			this.IndexCount = (FirstAttrib.Data.length / FirstAttrib.Size);
		}
		
		if ( this.IndexCount % 3 != 0 )
		{
			throw "Triangle index count not divisible by 3";
		}
		
		function CleanupAttrib(Attrib)
		{
			//	fix attribs
			//	data as array doesn't work properly and gives us
			//	gldrawarrays attempt to access out of range vertices in attribute 0
			if ( Array.isArray(Attrib.Data) )
				Attrib.Data = new Float32Array( Attrib.Data );
		}		
		
		let TotalByteLength = 0;
		const GetOpenglAttribute = function(Name,Floats,Location,Size)
		{
			let Type = GetOpenglElementType( gl, Floats );
			
			let Attrib = {};
			Attrib.Name = Name;
			Attrib.Floats = Floats;
			Attrib.Size = Size;
			Attrib.Type = Type;
			Attrib.Location = Location;
			return Attrib;
		}
		function AttribNameToOpenglAttrib(Name,Index)
		{
			//	should get location from shader binding!
			const Location = Index;
			const Attrib = Attribs[Name];
			CleanupAttrib(Attrib);
			const OpenglAttrib = GetOpenglAttribute( Name, Attrib.Data, Location, Attrib.Size );
			TotalByteLength += Attrib.Data.byteLength;
			return OpenglAttrib;
		}
		
		this.Attributes = Object.keys( Attribs ).map( AttribNameToOpenglAttrib );
		
		//	concat data
		let TotalData = new Float32Array( TotalByteLength / 4 );//Float32Array.BYTES_PER_ELEMENT );
		
		let TotalDataOffset = 0;
		for ( let Attrib of this.Attributes )
		{
			TotalData.set( Attrib.Floats, TotalDataOffset );
			Attrib.ByteOffset = TotalDataOffset * Float32Array.BYTES_PER_ELEMENT;
			TotalDataOffset += Attrib.Floats.length;
			this.OpenglByteSize = TotalDataOffset;
		}
		
		//	set the total buffer data
		gl.bindBuffer( gl.ARRAY_BUFFER, this.VertexBuffer );
		if ( TotalData )
		{
			gl.bufferData( gl.ARRAY_BUFFER, TotalData, gl.STATIC_DRAW );
		}
		else
		{
			//	init buffer size
			gl.bufferData(gl.ARRAY_BUFFER, TotalByteLength, gl.STREAM_DRAW);
			//gl.bufferData( gl.ARRAY_BUFFER, VertexData, gl.STATIC_DRAW );

			let AttribByteOffset = 0;
			function BufferAttribData(Attrib)
			{
				//gl.bufferData( gl.ARRAY_BUFFER, VertexData, gl.STATIC_DRAW );
				gl.bufferSubData( gl.ARRAY_BUFFER, AttribByteOffset, Attrib.Floats );
				Attrib.ByteOffset = AttribByteOffset;
				AttribByteOffset += Attrib.Floats.byteLength;
			}
			this.Attributes.forEach( BufferAttribData );
			this.OpenglByteSize = AttribByteOffset;
		}
		
		RenderContext.OnAllocatedGeometry( this );
		
		this.BindVertexPointers( RenderContext );
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
			let Location = Attrib.Location;
			
			if ( Shader && TestAttribLocation )
			{
				let ShaderLocation = gl.getAttribLocation( Shader.Program, Attrib.Name );
				if ( ShaderLocation != Location )
				{
					Pop.Debug("Warning, shader assigned location (" + ShaderLocation +") different from predefined location ("+ Location + ")");
					Location = ShaderLocation;
				}
			}
			
			let Normalised = false;
			let StrideBytes = 0;
			let OffsetBytes = Attrib.ByteOffset;
			gl.vertexAttribPointer( Attrib.Location, Attrib.Size, Attrib.Type, Normalised, StrideBytes, OffsetBytes );
			gl.enableVertexAttribArray( Attrib.Location );
		}
		this.Attributes.forEach( InitAttribute );
	}
	
	Bind(RenderContext,Shader)
	{
		const Vao = AllowVao ? this.GetVao( RenderContext, Shader ) : null;
		const gl = RenderContext.GetGlContext();

		if ( Vao )
		{
			gl.bindVertexArray( Vao );
		}
		else
		{
			const VertexBuffer = this.GetVertexBuffer(RenderContext);
			const IndexBuffer = this.GetIndexBuffer(RenderContext);
			gl.bindBuffer( gl.ARRAY_BUFFER, VertexBuffer );
			gl.bindBuffer( gl.ELEMENTS_ARRAY_BUFFER, IndexBuffer );
			
			//	we'll need this if we start having multiple attributes
			if ( DisableOldVertexAttribArrays )
				for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
					gl.disableVertexAttribArray(i);
			//	gr: we get glDrawArrays: attempt to access out of range vertices in attribute 0, if we dont update every frame (this seems wrong)
			//		even if we call gl.enableVertexAttribArray
			this.BindVertexPointers( RenderContext, Shader );
		}
	}
	
	Draw(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		if ( this.TriangleIndexes )
		{
			const Offset = 0;
			gl.drawElements( this.PrimitiveType, this.IndexCount, gl.UNSIGNED_SHORT, Offset );
		}
		else
		{
			gl.drawArrays( this.PrimitiveType, 0, this.IndexCount );
		}
	}
	
	GetIndexCount()
	{
		return this.IndexCount;
	}
}

