Pop.Opengl = {};

//	counters for debugging
Pop.Opengl.TrianglesDrawn = 0;
Pop.Opengl.BatchesDrawn = 0;
Pop.Opengl.GeometryBindSkip = 0;
Pop.Opengl.ShaderBindSkip = 0;
Pop.Opengl.GeometryBinds = 0;
Pop.Opengl.ShaderBinds = 0;


//	webgl only supports glsl 100!
Pop.GlslVersion = 100;

//	mobile typically can not render to a float texture. Emulate this on desktop
//	gr: we now test for this on context creation.
//		MAYBE this needs to be per-context, but it's typically by device
//		(and we typically want to know it without a render context)
//		set to false to force it off (eg. for testing on desktop against
//		ios which doesn't support it [as of 13]
Pop.Opengl.CanRenderToFloat = undefined;

//	allow turning off float support
Pop.Opengl.AllowFloatTextures = !Pop.GetExeArguments().includes('DisableFloatTextures');


Pop.Opengl.GetString = function(Context,Enum)
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
const AllowVao = !Pop.GetExeArguments().includes('DisableVao');

//	if we fail to get a context (eg. lost context) wait this long before restarting the render loop (where it tries again)
//	this stops thrashing cpu/system whilst waiting
const RetryGetContextMs = 1000;

//	need to sort this!, should be in gui
//	currently named to match c++
Pop.SoyMouseButton = Pop.SoyMouseButton || {};
//	matching SoyMouseButton
Pop.SoyMouseButton.None = -1;	//	todo: in api, change this to undefined
Pop.SoyMouseButton.Left = 0;
Pop.SoyMouseButton.Middle = 2;
Pop.SoyMouseButton.Right = 1;
Pop.SoyMouseButton.Back = 3;
Pop.SoyMouseButton.Forward = 4;



//	need a generic memory heap system in Pop for js side so
//	we can do generic heap GUIs
Pop.HeapMeta = function(Name)
{
	this.AllocCount = 0;
	this.AllocSize = 0;
	
	this.OnAllocated = function(Size)
	{
		if ( isNaN(Size) )
			throw "Bad size " + Size;
		this.AllocCount++;
		this.AllocSize += Size;
	}
	
	this.OnDeallocated = function(Size)
	{
		if ( isNaN(Size) )
			throw "Bad size " + Size;
		this.AllocCount--;
		this.AllocSize -= Size;
	}
}







//	this is currenly in c++ in the engine. need to swap to javascript
Pop.Opengl.RefactorGlslShader = function(Source)
{
	if ( !Source.startsWith('#version ') )
	{
		Source = '#version ' + Pop.GlslVersion + '\n' + Source;
	}
	
	//Source = 'precision mediump float;\n' + Source;
	
	Source = Source.replace(/float2/gi,'vec2');
	Source = Source.replace(/float3/gi,'vec3');
	Source = Source.replace(/float4/gi,'vec4');

	return Source;
}

Pop.Opengl.RefactorVertShader = function(Source)
{
	Source = Pop.Opengl.RefactorGlslShader(Source);
	
	if ( Pop.GlslVersion == 100 )
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
	else if ( Pop.GlslVersion >= 300 )
	{
		Source = Source.replace(/attribute /gi,'in ');
		Source = Source.replace(/varying /gi,'out ');
		//Source = Source.replace(/gl_FragColor/gi,'FragColor');
	}
	
	return Source;
}

Pop.Opengl.RefactorFragShader = function(Source)
{
	Source = Pop.Opengl.RefactorGlslShader(Source);

	//	gr: this messes up xcode's auto formatting :/
	//let Match = /texture2D\(/gi;
	let Match = 'texture(';
	Source = Source.replace(Match,'texture2D(');

	if ( Pop.GlslVersion == 100 )
	{
		//	in but only at the start of line (well, after the end of prev line)
		Source = Source.replace(/\nin /gi,'varying ');
	}
	else if ( Pop.GlslVersion >= 300 )
	{
		Source = Source.replace(/varying /gi,'in ');
		//Source = Source.replace(/gl_FragColor/gi,'FragColor');
	}
	return Source;
}


//	wrapper for a generic element which converts input (touch, mouse etc) into
//	our mouse functions
function TElementMouseHandler(Element,OnMouseDown,OnMouseMove,OnMouseUp,OnMouseScroll)
{
	//	annoying distinctions
	let GetButtonFromMouseEventButton = function(MouseButton,AlternativeButton)
	{
		//	handle event & button arg
		if ( typeof MouseButton == "object" )
		{
			let MouseEvent = MouseButton;
			MouseButton = MouseEvent.button;
			AlternativeButton = (MouseEvent.ctrlKey == true);
		}
		
		//	html/browser definitions
		const BrowserMouseLeft = 0;
		const BrowserMouseMiddle = 1;
		const BrowserMouseRight = 2;
		
		if ( AlternativeButton )
		{
			switch ( MouseButton )
			{
				case BrowserMouseLeft:	return Pop.SoyMouseButton.Back;
				case BrowserMouseRight:	return Pop.SoyMouseButton.Forward;
			}
		}
		
		switch ( MouseButton )
		{
			case BrowserMouseLeft:		return Pop.SoyMouseButton.Left;
			case BrowserMouseMiddle:	return Pop.SoyMouseButton.Middle;
			case BrowserMouseRight:		return Pop.SoyMouseButton.Right;
		}
		throw "Unhandled MouseEvent.button (" + MouseButton + ")";
	}
	
	let GetButtonsFromMouseEventButtons = function(MouseEvent)
	{
		//	note: button bits don't match mousebutton!
		//	https://www.w3schools.com/jsref/event_buttons.asp
		//	https://www.w3schools.com/jsref/event_button.asp
		//	index = 0 left, 1 middle, 2 right (DO NOT MATCH the bits!)
		//	gr: ignore back and forward as they're not triggered from mouse down, just use the alt mode
		//let ButtonMasks = [ 1<<0, 1<<2, 1<<1, 1<<3, 1<<4 ];
		const ButtonMasks = [ 1<<0, 1<<2, 1<<1 ];
		const ButtonMask = MouseEvent.buttons;
		const AltButton = (MouseEvent.ctrlKey==true);
		const Buttons = [];
		
		for ( let i=0;	i<ButtonMasks.length;	i++ )
		{
			if ( ( ButtonMask & ButtonMasks[i] ) == 0 )
				continue;
			let ButtonIndex = i;
			let ButtonName = GetButtonFromMouseEventButton( ButtonIndex, AltButton );
			if ( ButtonName === null )
				continue;
			Buttons.push( ButtonName );
		}
		return Buttons;
	}
	
	//	gr: should api revert to uv?
	let GetMousePos = function(MouseEvent)
	{
		const Rect = Element.getBoundingClientRect();
		const x = MouseEvent.clientX - Rect.left;
		const y = MouseEvent.clientY - Rect.top;
		return [x,y];
	}
	
	let MouseMove = function(MouseEvent)
	{
		const Pos = GetMousePos(MouseEvent);
		const Buttons = GetButtonsFromMouseEventButtons( MouseEvent );
		if ( Buttons.length == 0 )
		{
			MouseEvent.preventDefault();
			OnMouseMove( Pos[0], Pos[1], Pop.SoyMouseButton.None );
			return;
		}
		
		//	for now, do a callback on the first button we find
		//	later, we might want one for each button, but to avoid
		//	slow performance stuff now lets just do one
		//	gr: maybe API should change to an array
		OnMouseMove( Pos[0], Pos[1], Buttons[0] );
		MouseEvent.preventDefault();
	}
	
	let MouseDown = function(MouseEvent)
	{
		const Pos = GetMousePos(MouseEvent);
		const Button = GetButtonFromMouseEventButton(MouseEvent);
		OnMouseDown( Pos[0], Pos[1], Button );
		MouseEvent.preventDefault();
	}
	
	let MouseWheel = function(MouseEvent)
	{
		const Pos = GetMousePos(MouseEvent);
		const Button = GetButtonFromMouseEventButton(MouseEvent);
		
		//	gr: maybe change scale based on
		//WheelEvent.deltaMode = DOM_DELTA_PIXEL, DOM_DELTA_LINE, DOM_DELTA_PAGE
		const DeltaScale = 0.01;
		const WheelDelta = [ MouseEvent.deltaX * DeltaScale, MouseEvent.deltaY * DeltaScale, MouseEvent.deltaZ * DeltaScale ];
		OnMouseScroll( Pos[0], Pos[1], Button, WheelDelta );
		MouseEvent.preventDefault();
	}
	
	let ContextMenu = function(MouseEvent)
	{
		//	allow use of right mouse down events
		//MouseEvent.stopImmediatePropagation();
		MouseEvent.preventDefault();
		return false;
	}
	
	//	use add listener to allow pre-existing canvas elements to retain any existing callbacks
	Element.addEventListener('mousemove', MouseMove );
	Element.addEventListener('wheel', MouseWheel, false );
	Element.addEventListener('contextmenu', ContextMenu, false );
	Element.addEventListener('mousedown', MouseDown, false );
	Element.addEventListener('mousemove', MouseMove, false );
	//	not currently handling up
	//this.Element.addEventListener('mouseup', MouseUp, false );
	//this.Element.addEventListener('mouseleave', OnDisableDraw, false );
	//this.Element.addEventListener('mouseenter', OnEnableDraw, false );
	

}


//	wrapper for a generic element which converts input (touch, mouse etc) into
//	our mouse functions
function TElementKeyHandler(Element,OnKeyDown,OnKeyUp)
{
	function GetKeyFromKeyEventButton(KeyEvent)
	{
		Pop.Debug("KeyEvent",KeyEvent);
		return KeyEvent.key;
	}
	
	const KeyDown = function(KeyEvent)
	{
		//	if an input element has focus, ignore event
		if ( KeyEvent.srcElement instanceof HTMLInputElement )
		{
			Pop.Debug("Ignoring OnKeyDown as input has focus",KeyEvent);
			return false;
		}
		//Pop.Debug("OnKey down",KeyEvent);
		
		const Key = GetKeyFromKeyEventButton(KeyEvent);
		const Handled = OnKeyDown( Key );
		if ( Handled === true )
			KeyEvent.preventDefault();
	}
	
	const KeyUp = function(KeyEvent)
	{
		const Key = GetKeyFromKeyEventButton(KeyEvent);
		const Handled = OnKeyUp( Key );
		if ( Handled === true )
			KeyEvent.preventDefault();
	}
	

	Element = document;
	
	//	use add listener to allow pre-existing canvas elements to retain any existing callbacks
	Element.addEventListener('keydown', KeyDown );
	Element.addEventListener('keyup', KeyUp );
}


Pop.Opengl.Window = function(Name,Rect)
{
	//	things to overload
	//this.OnRender = function(RenderTarget){};
	this.OnMouseDown = function(x,y,Button)					{	Pop.Debug('OnMouseDown',...arguments);	};
	this.OnMouseMove = function(x,y,Button)					{	/*Pop.Debug("OnMouseMove",...arguments);*/	};
	this.OnMouseUp = function(x,y,Button)					{	Pop.Debug('OnMouseUp',...arguments);	};
	this.OnMouseScroll = function(x,y,Button,WheelDelta)	{	Pop.Debug('OnMouseScroll',...arguments);	};
	this.OnKeyDown = function(Key)							{	Pop.Debug('OnKeyDown',...arguments);	};
	this.OnKeyUp = function(Key)							{	Pop.Debug('OnKeyUp',...arguments);	};

	//	treat minimised and foreground as the same on web;
	//	todo: foreground state for multiple windows on one page
	this.IsForeground = function () { return Pop.WebApi.IsForeground(); }
	this.IsMinimised = function () { return Pop.WebApi.IsForeground(); }

	this.Context = null;
	this.ContextVersion = 0;	//	used to tell if resources are out of date
	this.RenderTarget = null;
	this.CanvasMouseHandler = null;
	this.CanvasKeyHandler = null;
	this.ScreenRectCache = null;
	this.TextureHeap = new Pop.HeapMeta("Opengl Textures");
	this.GeometryHeap = new Pop.HeapMeta("Opengl Geometry");

	this.FloatTextureSupported = false;
	this.Int32TextureSupported = false;	//	depth texture 24,8
	
	this.ActiveTexureIndex = 0;
	this.TextureRenderTargets = [];	//	this is a context asset, so maybe it shouldn't be kept here

	this.OnResize = function(ResizeEvent)
	{
		Pop.Debug("OnResize",JSON.stringify(ResizeEvent));
		
		//	invalidate cache
		this.ScreenRectCache = null;
	
		//	resize to original rect
		const Canvas = this.GetCanvasElement();
		Pop.Debug("Re-setting canvas size to original rect",JSON.stringify(Rect))
		this.SetCanvasSize( Canvas, Rect );
	}
	
	this.AllocTexureIndex = function()
	{
		//	gr: make a pool or something
		//		we fixed this on desktop, so take same model
		const Index = (this.ActiveTexureIndex % 8);
		this.ActiveTexureIndex++;
		return Index;
	}
	
	this.InitCanvasElement = function()
	{
		let Element = document.getElementById(Name);
		
		//	setup event bindings
		//	gr: can't bind here as they may change later, so relay (and error if not setup)
		let OnMouseDown = function()	{	return this.OnMouseDown.apply( this, arguments );	}.bind(this);
		let OnMouseMove = function()	{	return this.OnMouseMove.apply( this, arguments );	}.bind(this);
		let OnMouseUp = function()		{	return this.OnMouseUp.apply( this, arguments );	}.bind(this);
		let OnMouseScroll = function()	{	return this.OnMouseScroll.apply( this, arguments );	}.bind(this);
		let OnKeyDown = function()		{	return this.OnKeyDown.apply( this, arguments );	}.bind(this);
		let OnKeyUp = function()		{	return this.OnKeyUp.apply( this, arguments );	}.bind(this);
		
		this.CanvasMouseHandler = new TElementMouseHandler( Element, OnMouseDown, OnMouseMove, OnMouseUp, OnMouseScroll );
		this.CanvasKeyHandler = new TElementKeyHandler( Element, OnKeyDown, OnKeyUp );

		//	catch window resize
		window.addEventListener('resize',this.OnResize.bind(this));

		//	https://medium.com/@susiekim9/how-to-compensate-for-the-ios-viewport-unit-bug-46e78d54af0d
		/*	this doesn't help
		window.onresize = function ()
		{
			document.body.height = window.innerHeight;
		}
		window.onresize(); // called to initially set the height.
		*/

		//	catch fullscreen state change
		Element.addEventListener('fullscreenchange', this.OnFullscreenChanged.bind(this) );
	}
	
	this.GetScreenRect = function()
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
		return this.ScreenRectCache;
	}
	
	this.SetCanvasSize = function(CanvasElement,Rect=null)
	{
		const ParentElement = CanvasElement.parentElement;
		
		//	if null, then fullscreen
		//	go as fullscreen as possible
		if ( !Rect )
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
		}
		
		let Left = Rect[0];
		let Top = Rect[1];
		let Width = Rect[2];
		let Height = Rect[3];
			
		CanvasElement.style.display = 'block';
		CanvasElement.style.position = 'absolute';
		//Element.style.border = '1px solid #f00';
			
		CanvasElement.style.left = Left+'px';
		CanvasElement.style.top = Top+'px';
		//Element.style.right = Right+'px';
		//Element.style.bottom = Bottom+'px';
		CanvasElement.style.width = Width+'px';
		CanvasElement.style.height = Height+'px';
		//Element.style.width = '100%';
		//Element.style.height = '500px';
		
		CanvasElement.width = Rect[2];
		CanvasElement.height = Rect[3];
	}
	
	this.GetCanvasElement = function()
	{
		let Element = document.getElementById(Name);
		if ( Element )
			return Element;
		
		const ParentElement = document.body;
		
		//	create!
		Element = document.createElement('canvas');
		Element.id = Name;
		
		ParentElement.appendChild( Element );
		this.SetCanvasSize( Element, Rect );

		//	double check
		{
			let MatchElement = document.getElementById(Name);
			if ( !MatchElement )
				throw "Created, but failed to refind new element";
		}
		
		return Element;
	}
	
	this.OnLostContext = function(Error)
	{
		Pop.Debug("Lost webgl context",Error);
		this.Context = null;
		this.CurrentBoundGeometryHash = null;
		this.CurrentBoundShaderHash = null;
		this.ResetContextAssets();
	}
	
	this.ResetContextAssets = function()
	{
		//	dont need to reset this? but we will anyway
		this.ActiveTexureIndex = 0;
		
		//	todo: proper cleanup
		this.TextureRenderTargets = [];
	}

	this.TestLoseContext = function()
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
	

	this.CreateContext = function()
	{
		const ContextMode = "webgl";
		const Canvas = this.GetCanvasElement();
		const Options = {};
		//Options.antialias = true;
		Options.xrCompatible = true;
		const Context = Canvas.getContext( ContextMode, Options );
		
		if ( !Context )
			throw "Failed to initialise " + ContextMode;
		
		if ( Context.isContextLost() )
		{
			//	gr: this is a little hacky
			throw "Created " + ContextMode + " context but is lost";
		}
		
		Pop.Debug("Created new context");
		
		//	handle losing context
		function OnLostWebglContext(Event)
		{
			Pop.Debug("OnLostWebglContext",Event);
			Event.preventDefault();
			this.OnLostContext("Canvas event");
		}
		Canvas.addEventListener('webglcontextlost', OnLostWebglContext.bind(this), false);
		
		const gl = Context;
		//	enable float textures on GLES1
		//	https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_float
		
		Pop.Debug("Supported Extensions", gl.getSupportedExtensions() );

		const InitFloatTexture = function(Context)
		{
			//	gl.Float already exists, but this now allows it for texImage
			this.FloatTextureSupported = true;
			Context.FloatTextureSupported = true;
			
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
		
		if ( Pop.Opengl.AllowFloatTextures )
			EnableExtension('OES_texture_float',InitFloatTexture);
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
	
	this.IsFloatRenderTargetSupported = function()
	{
		//	gr: because of some internal workarounds/auto conversion in images
		//		trying to create & bind a float4 will inadvertently work! if we
		//		dont support float textures
		if ( !this.FloatTextureSupported )
			return false;
		
		try
		{
			const FloatTexture = new Pop.Image([1,1],'Float4');
			const RenderTarget = new Pop.Opengl.TextureRenderTarget( [FloatTexture] );
			const RenderContext = this;
			RenderTarget.BindRenderTarget( RenderContext );
			//	cleanup!
			//	todo: restore binding, viewports etc
			return true;
		}
		catch(e)
		{
			Pop.Debug("IsFloatRenderTargetSupported failed: "+e);
			return false;
		}
	}

	
	this.InitVao = function(Context,Extension)
	{
		//	already enabled with webgl2
		if ( Context.createVertexArray )
			return;
		
		Context.createVertexArray = Extension.createVertexArrayOES.bind(Extension);
		Context.deleteVertexArray = Extension.deleteVertexArrayOES.bind(Extension);
		Context.isVertexArray = Extension.isVertexArrayOES.bind(Extension);
		Context.bindVertexArray = Extension.bindVertexArrayOES.bind(Extension);
	}
	
	this.InitMultipleRenderTargets = function(Context,Extension)
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
	
	
	
	this.InitialiseContext = function()
	{
		this.Context = this.CreateContext();
		this.ContextVersion++;
		
		//	gr: I want this in CreateContext, but the calls require this.Context to be setup
		//		so doing it here for now
		//	test support for float render targets
		//	test for undefined, as it may have been forced off by client
		if ( Pop.Opengl.CanRenderToFloat === undefined )
		{
			Pop.Opengl.CanRenderToFloat = this.IsFloatRenderTargetSupported();
		}
	}
	
	//	we could make this async for some more control...
	this.RenderLoop = function()
	{
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
			
			//	now render and let it throw (user error presumably)
			const RenderContext = this;
			if ( !this.RenderTarget )
				this.RenderTarget = new WindowRenderTarget(this);
			this.RenderTarget.BindRenderTarget( RenderContext );
			this.OnRender( this.RenderTarget );
			
			window.requestAnimationFrame( Render.bind(this) );
		}
		window.requestAnimationFrame( Render.bind(this) );
	}

	this.GetGlContext = function()
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
	
	this.OnAllocatedTexture = function(Image)
	{
		this.TextureHeap.OnAllocated( Image.OpenglByteSize );
	}
	
	this.OnDeletedTexture = function(Image)
	{
		//	todo: delete render targets that use this image
		this.TextureHeap.OnDeallocated( Image.OpenglByteSize );
	}
	
	this.OnAllocatedGeometry = function(Geometry)
	{
		this.GeometryHeap.OnAllocated( Geometry.OpenglByteSize );
	}
	
	this.OnDeletedGeometry = function(Geometry)
	{
		this.GeometryHeap.OnDeallocated( Geometry.OpenglByteSize );
	}
	
	this.GetTextureRenderTarget = function(Textures)
	{
		if ( !Array.isArray(Textures) )
			Textures = [Textures];
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
		
		let RenderTarget = this.TextureRenderTargets.find(MatchRenderTarget);
		if ( RenderTarget )
			return RenderTarget;
		
		//	make a new one
		RenderTarget = new Pop.Opengl.TextureRenderTarget( Textures );
		this.TextureRenderTargets.push( RenderTarget );
		if ( !this.TextureRenderTargets.find(MatchRenderTarget) )
			throw "New render target didn't re-find";
		return RenderTarget;
	}

	this.IsFullscreenSupported = function()
	{
		return document.fullscreenEnabled;
	}
	
	this.OnFullscreenChanged = function(Event)
	{
		Pop.Debug("OnFullscreenChanged", Event);
		//this.OnResize();
	}
	
	this.IsFullscreen = function()
	{
		const Canvas = this.GetCanvasElement();
		//if ( document.fullscreenElement == Canvas )
		if ( document.fullscreenElement )
			return true;
		return false;
	}
	
	this.SetFullscreen = function(Enable=true)
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
	

	this.InitialiseContext();
	this.InitCanvasElement();

	this.RenderLoop();
}


//	base class with generic opengl stuff
Pop.Opengl.RenderTarget = function()
{
	this.GetRenderContext = function()
	{
		throw "Override this on your render target";
	}
	
	this.RenderToRenderTarget = function(TargetTexture,RenderFunction)
	{
		const RenderContext = this.GetRenderContext();
		
		//	setup render target
		let RenderTarget = RenderContext.GetTextureRenderTarget( TargetTexture );
		RenderTarget.BindRenderTarget( RenderContext );
		
		RenderFunction( RenderTarget );
		
		//	todo: restore previously bound, not this.
		//	restore rendertarget
		this.BindRenderTarget( RenderContext );
	}
	
	this.GetGlContext = function()
	{
		const RenderContext = this.GetRenderContext();
		const Context = RenderContext.GetGlContext();
		return Context;
	}
	
	this.ClearColour = function(r,g,b,a=1)
	{
		const gl = this.GetGlContext();
		gl.clearColor( r, g, b, a );
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	this.ClearDepth = function()
	{
		const gl = this.GetGlContext();
		gl.clear(gl.DEPTH_BUFFER_BIT);
	}

	this.ResetState = function()
	{
		const gl = this.GetGlContext();
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.SCISSOR_TEST);
		//	to make blending work well, don't reject things on same plane
		gl.depthFunc(gl.LEQUAL);
	}
	
	this.SetBlendModeBlit = function()
	{
		const gl = this.GetGlContext();
		
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.ONE, gl.ZERO );
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	this.SetBlendModeAlpha = function()
	{
		const gl = this.GetGlContext();
		
		//	set mode
		//	enable blend
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		gl.blendEquation( gl.FUNC_ADD );
	}
	
	this.SetBlendModeMax = function()
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
	
	this.DrawGeometry = function(Geometry,Shader,SetUniforms,TriangleCount)
	{
		const RenderContext = this.GetRenderContext();
		
		if ( TriangleCount === undefined )
		{
			TriangleCount = Geometry.IndexCount/3;
		}
		else
		{
			const GeoTriangleCount = Geometry.IndexCount/3;
			if ( TriangleCount > GeoTriangleCount )
			{
				//Pop.Debug("Warning, trying to render " + TriangleCount + " triangles, but geo only has " + GeoTriangleCount + ". Clamping as webgl sometimes will render nothing and give no warning");
				TriangleCount = GeoTriangleCount;
			}
		}
		
		//	0 gives a webgl error/warning so skip it
		if ( TriangleCount <= 0 )
		{
			Pop.Debug("Triangle count",TriangleCount);
			return;
		}
		
		const gl = this.GetGlContext();
		
		//	this doesn't make any difference
		if ( gl.CurrentBoundShaderHash != GetUniqueHash(Shader) )
		{
			const Program = Shader.GetProgram(RenderContext);
			gl.useProgram( Program );
			gl.CurrentBoundShaderHash = GetUniqueHash(Shader);
			Pop.Opengl.ShaderBinds++;
		}
		else
		{
			Pop.Opengl.ShaderBindSkip++;
		}
		
		//	this doesn't make any difference
		if ( gl.CurrentBoundGeometryHash != GetUniqueHash(Geometry) )
		{
			Geometry.Bind( RenderContext );
			gl.CurrentBoundGeometryHash = GetUniqueHash(Geometry);
			Pop.Opengl.GeometryBinds++;
		}
		else
		{
			Pop.Opengl.GeometryBindSkip++;
		}
		SetUniforms( Shader, Geometry );
		
		Pop.Opengl.TrianglesDrawn += TriangleCount;
		Pop.Opengl.BatchesDrawn += 1;
		gl.drawArrays( Geometry.PrimitiveType, 0, TriangleCount * 3 );
	}
	
}


//	maybe this should be an API type
Pop.Opengl.TextureRenderTarget = function(Images)
{
	Pop.Opengl.RenderTarget.call( this );
	if ( !Array.isArray(Images) )
		throw "Pop.Opengl.TextureRenderTarget now expects array of images for MRT support";
	
	this.FrameBuffer = null;
	this.FrameBufferContextVersion = null;
	this.FrameBufferRenderContext = null;
	this.Images = Images;
	
	this.IsImagesValid = function()
	{
		Pop.Debug("IsImagesValid",this);
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
			if ( IsFloat && Pop.Opengl.CanRenderToFloat===false )
				throw "This platform cannot render to " + Image.PixelsFormat + " texture";
		}
		IsImageRenderable(Image0);
	}
	
	this.GetRenderContext = function()
	{
		return this.FrameBufferRenderContext;
	}
	
	this.GetRenderTargetRect = function()
	{
		const FirstImage = this.Images[0];
		let Rect = [0,0,0,0];
		Rect[2] = FirstImage.GetWidth();
		Rect[3] = FirstImage.GetHeight();
		return Rect;
	}
	
	this.CreateFrameBuffer = function(RenderContext)
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
			gl.bindTexture(gl.TEXTURE_2D, null);
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
			throw "New framebuffer attachment status not complete: " + Pop.Opengl.GetString(gl,Status);
		
		if ( TestFrameBuffer )
			if ( !gl.isFramebuffer( this.FrameBuffer ) )
				throw "Is not frame buffer!";
		//let Status = gl.checkFramebufferStatus( this.FrameBuffer );
		//Pop.Debug("Framebuffer status",Status);
	}
	
	this.GetFrameBuffer = function()
	{
		return this.FrameBuffer;
	}
	
	//  bind for rendering
	this.BindRenderTarget = function(RenderContext)
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
	}
	
	this.AllocTexureIndex = function()
	{
		return this.RenderContext.AllocTexureIndex();
	}
	
	//	verify each image is same dimensions (and format?)
	this.IsImagesValid();
}

function WindowRenderTarget(Window)
{
	const RenderContext = Window;
	this.ViewportMinMax = [0,0,1,1];

	Pop.Opengl.RenderTarget.call( this );

	this.GetFrameBuffer = function()
	{
		return null;
	}
	
	this.GetRenderContext = function()
	{
		return RenderContext;
	}
	
	this.AllocTexureIndex = function()
	{
		return Window.AllocTexureIndex();
	}

	this.GetScreenRect = function()
	{
		return Window.GetScreenRect();
	}

	this.GetRenderTargetRect = function()
	{
		let Rect = this.GetScreenRect();
		Rect[0] = 0;
		Rect[1] = 0;
		return Rect;
	}

	
	this.BindRenderTarget = function(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
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
	}
	
	this.GetViewportWidth = function()
	{
		const RenderRect = this.GetRenderTargetRect();
		return RenderRect[2] * (this.ViewportMinMax[2]-this.ViewportMinMax[0]);
	}
	
	this.GetViewportHeight = function()
	{
		const RenderRect = this.GetRenderTargetRect();
		return RenderRect[3] * (this.ViewportMinMax[3]-this.ViewportMinMax[1]);
	}
	
}



Pop.Opengl.Shader = function(Context_Deprecated,VertShaderSource,FragShaderSource)
{
	let Name = "A shader";
	this.Name = Name;
	this.Program = null;
	this.ProgramContextVersion = null;
	this.Context = null;			//	 need to remove this, currently still here for SetUniformConvinience
	this.UniformMetaCache = null;	//	may need to invalidate this on new context
	

	this.VertShaderSource = Pop.Opengl.RefactorVertShader(VertShaderSource);
	this.FragShaderSource = Pop.Opengl.RefactorFragShader(FragShaderSource);

	this.GetGlContext = function()
	{
		return this.Context.GetGlContext();
	}
	
	this.GetProgram = function(RenderContext)
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
	
	this.CompileShader = function(RenderContext,Type,Source)
	{
		const gl = RenderContext.GetGlContext();
		const Shader = gl.createShader(Type);
		gl.shaderSource( Shader, Source );
		gl.compileShader( Shader );
		
		const CompileStatus = gl.getShaderParameter( Shader, gl.COMPILE_STATUS);
		if ( !CompileStatus )
		{
			let Error = gl.getShaderInfoLog(Shader);
			throw "Failed to compile " + Type + " shader: " + Error;
		}
		return Shader;
	}
	
	this.CompileProgram = function(RenderContext)
	{
		let gl = RenderContext.GetGlContext();
		
		const FragShader = this.CompileShader( RenderContext, gl.FRAGMENT_SHADER, this.FragShaderSource );
		const VertShader = this.CompileShader( RenderContext, gl.VERTEX_SHADER, this.VertShaderSource );
		
		let Program = gl.createProgram();
		gl.attachShader( Program, VertShader );
		gl.attachShader( Program, FragShader );
		gl.linkProgram( Program );
		
		let LinkStatus = gl.getProgramParameter( Program, gl.LINK_STATUS );
		if ( !LinkStatus )
		{
			let Error = gl.getProgramInfoLog(Program);
			throw "Failed to link " + this.Name + " shaders; " + Error;
		}
		return Program;
	}
	
	
	//	gr: can't tell the difference between int and float, so err that wont work
	this.SetUniform = function(Uniform,Value)
	{
		let UniformMeta = this.GetUniformMeta(Uniform);
		if ( !UniformMeta )
			return;
		if( Array.isArray(Value) )					this.SetUniformArray( Uniform, Value );
		else if( Value instanceof Float32Array )	this.SetUniformArray( Uniform, Value );
		else if ( Value instanceof Pop.Image )		this.SetUniformTexture( Uniform, Value, this.Context.AllocTexureIndex() );
		//else if ( Value instanceof float2 )		this.SetUniformFloat2( Uniform, Value );
		//else if ( Value instanceof float3 )		this.SetUniformFloat3( Uniform, Value );
		//else if ( Value instanceof float4 )		this.SetUniformFloat4( Uniform, Value );
		//else if ( Value instanceof Matrix4x4 )	this.SetUniformMatrix4x4( Uniform, Value );
		else if ( typeof Value === 'number' )		this.SetUniformNumber( Uniform, Value );
		else if ( typeof Value === 'boolean' )		this.SetUniformNumber( Uniform, Value );
		else
		{
			console.log(typeof Value);
			console.log(Value);
			throw "Failed to set uniform " +Uniform + " to " + ( typeof Value );
		}
	}
	
	this.SetUniformArray = function(UniformName,Values)
	{
		//	determine type of array, and length, and is array
		const UniformMeta = this.GetUniformMeta(UniformName);
		
		const ExpectedValueCount = UniformMeta.ElementSize * UniformMeta.ElementCount;
		
		//	all aligned
		if ( Values.length == ExpectedValueCount )
		{
			UniformMeta.SetValues( Values );
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
	
	this.SetUniformTexture = function(Uniform,Image,TextureIndex)
	{
		let Texture = Image.GetOpenglTexture( this.Context );
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform );
		//  https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
		//  WebGL provides a minimum of 8 texture units;
		let GlTextureNames = [ gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3, gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE6, gl.TEXTURE7 ];
		//	setup textures
		gl.activeTexture( GlTextureNames[TextureIndex] );
		try
		{
			gl.bindTexture(gl.TEXTURE_2D, Texture );
		}
		catch(e)
		{
			Pop.Debug("SetUniformTexture: " + e);
			//  todo: bind "invalid" texture
		}
		gl.uniform1i( UniformPtr, TextureIndex );
	}
	
	this.SetUniformNumber = function(Uniform,Value)
	{
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform);
		let UniformType = this.GetUniformType( Uniform );
		//	gr: this always returns 0 on imac12,2
		//let UniformType = gl.getUniform( this.Program, UniformPtr );
		
		//	these are hard to track down and pretty rare anyone would want a nan
		if ( isNaN(Value) )
			throw "Setting NaN on Uniform " + Uniform.Name;
		
		switch ( UniformType )
		{
			case gl.INT:
			case gl.UNSIGNED_INT:
			case gl.BOOL:
				gl.uniform1i( UniformPtr, Value );
				break;
			case gl.FLOAT:
				gl.uniform1f( UniformPtr, Value );
				break;
			default:
				throw "Unhandled Number uniform type " + UniformType;
		}
	}
	
	this.SetUniformFloat2 = function(Uniform,Value)
	{
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform);
		gl.uniform2f( UniformPtr, Value.x, Value.y );
	}
	
	this.SetUniformFloat3 = function(Uniform,Value)
	{
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform);
		gl.uniform3f( UniformPtr, Value.x, Value.y, Value.z );
	}
	
	this.SetUniformFloat4 = function(Uniform,Value)
	{
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform);
		gl.uniform4f( UniformPtr, Value.x, Value.y, Value.z, Value.w );
	}
	
	this.SetUniformMatrix4x4 = function(Uniform,Value)
	{
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform);
		let float16 = Value.Values;
		let Transpose = false;
		//console.log(float16);
		gl.uniformMatrix4fv( UniformPtr, Transpose, float16 );
	}
	
	this.GetUniformType = function(UniformName)
	{
		let Meta = this.GetUniformMeta(UniformName);
		return Meta.type;
	}
	
	this.GetUniformMetas = function()
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
					UniformMeta.SetValues = function(v)	{	throw "Unhandled type " + UniformMeta.type + " on " + MatchUniformName;	};
					break;
			}
			
			this.UniformMetaCache[UniformName] = UniformMeta;
		}
		return this.UniformMetaCache;
	}

	this.GetUniformMeta = function(MatchUniformName)
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

Pop.Opengl.TriangleBuffer = function(RenderContext,VertexAttributeName,VertexData,VertexSize,TriangleIndexes)
{
	this.BufferContextVersion = null;
	this.Buffer = null;
	this.Vao = null;
	
	let Attribs = {};
	
	//	backwards compatibility
	if ( typeof VertexAttributeName == 'string' )
	{
		Pop.Debug("[deprecated] Old TriangleBuffer constructor, use a keyed object");
		const Attrib = {};
		Attrib.Size = VertexSize;
		Attrib.Data = VertexData;
		Attribs[VertexAttributeName] = Attrib;
	}
	else
	{
		Attribs = VertexAttributeName;
	}
	
	
	this.GetBuffer = function(RenderContext)
	{
		if ( this.BufferContextVersion !== RenderContext.ContextVersion )
		{
			Pop.Debug("Buffer context version changed",this.BufferContextVersion,RenderContext.ContextVersion);
			this.CreateBuffer(RenderContext);
		}
		return this.Buffer;
	}
	
	this.DeleteBuffer = function(RenderContext)
	{
		RenderContext.OnDeletedGeometry( this );
	}
	
	this.DeleteVao = function()
	{
		this.Vao = null;
	}
	
	this.GetVao = function(RenderContext,Shader)
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
			let Buffer = this.GetBuffer( RenderContext );
			gl.bindBuffer( gl.ARRAY_BUFFER, Buffer );
			//	we'll need this if we start having multiple attributes
			if ( DisableOldVertexAttribArrays )
				for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
					gl.disableVertexAttribArray(i);
			this.BindVertexPointers( RenderContext, Shader );
		
			gl.bindVertexArray( null );
		}
		return this.Vao;
	}
			
	
	this.CreateBuffer = function(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		
		this.Buffer = gl.createBuffer();
		this.BufferContextVersion = RenderContext.ContextVersion;
		
		this.PrimitiveType = gl.TRIANGLES;
		if ( TriangleIndexes )
		{
			this.IndexCount = TriangleIndexes.length;
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
		gl.bindBuffer( gl.ARRAY_BUFFER, this.Buffer );
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
	
	
	
	this.BindVertexPointers = function(RenderContext,Shader)
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
	
	this.Bind = function(RenderContext,Shader)
	{
		const Vao = AllowVao ? this.GetVao( RenderContext, Shader ) : null;
		const gl = RenderContext.GetGlContext();

		if ( Vao )
		{
			gl.bindVertexArray( Vao );
		}
		else
		{
			const Buffer = this.GetBuffer(RenderContext);
			gl.bindBuffer( gl.ARRAY_BUFFER, Buffer );
			
			//	we'll need this if we start having multiple attributes
			if ( DisableOldVertexAttribArrays )
				for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
					gl.disableVertexAttribArray(i);
			//	gr: we get glDrawArrays: attempt to access out of range vertices in attribute 0, if we dont update every frame (this seems wrong)
			//		even if we call gl.enableVertexAttribArray
			this.BindVertexPointers( RenderContext, Shader );
		}
	}
}

