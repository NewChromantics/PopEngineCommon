Pop.Opengl = {};

//	webgl only supports glsl 100!
Pop.GlslVersion = 100;

//	gl.isFrameBuffer is expensive! probably flushing
const TestFrameBuffer = false;


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


Pop.Opengl.Window = function(Name,Rect)
{
	//	things to overload
	//this.OnRender = function(RenderTarget){};
	this.OnMouseDown = function(x,y,Button)					{	Pop.Debug('OnMouseDown',...arguments);	};
	this.OnMouseMove = function(x,y,Button)					{	Pop.Debug('OnMouseMove',...arguments);	};
	this.OnMouseUp = function(x,y,Button)					{	Pop.Debug('OnMouseUp',...arguments);	};
	this.OnMouseScroll = function(x,y,Button,WheelDelta)	{	Pop.Debug('OnMouseScroll',...arguments);	};

	this.Context = null;
	this.RenderTarget = null;
	this.CanvasMouseHandler = null;
	this.ActiveTexureIndex = 0;

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
		this.CanvasMouseHandler = new TElementMouseHandler( Element, OnMouseDown, OnMouseMove, OnMouseUp, OnMouseScroll );
	}
	
	this.GetScreenRect = function()
	{
		let Canvas = this.GetCanvasElement();
		let ElementRect = Canvas.getBoundingClientRect();
		let Rect = [ ElementRect.x, ElementRect.y, ElementRect.width, ElementRect.height ];
		return Rect;
	}
	
	this.GetCanvasElement = function()
	{
		let Element = document.getElementById(Name);
		if ( Element )
			return Element;
		
		const ParentElement = document.body;
		
		//	go as fullscreen as possible
		if ( !Rect )
		{
			Rect = [0,0,ParentElement.clientWidth,window.innerHeight];
		}
		
		//	create!
		Element = document.createElement('canvas');
		Element.id = Name;
		if ( Rect !== undefined )
		{
			let Left = Rect[0];
			let Top = Rect[1];
			let Width = Rect[2];
			let Height = Rect[3];
			
			Element.style.display = 'block';
			Element.style.position = 'absolute';
			//Element.style.border = '1px solid #f00';
			
			Element.style.left = Left+'px';
			Element.style.top = Top+'px';
			//Element.style.right = Right+'px';
			//Element.style.bottom = Bottom+'px';
			Element.style.width = Width+'px';
			Element.style.height = Height+'px';
			//Element.style.width = '100%';
			//Element.style.height = '500px';
		}
		ParentElement.appendChild( Element );
		Element.width = Rect[2];
		Element.height = Rect[3];

		//	double check
		{
			let MatchElement = document.getElementById(Name);
			if ( !MatchElement )
				throw "Created, but failed to refind new element";
		}
		
		return Element;
	}

	this.InitialiseContext = function()
	{
		const Canvas = this.GetCanvasElement();
		this.Context = Canvas.getContext("webgl");
		if ( !this.Context )
			throw "Failed to initialise webgl";

		const gl = this.Context;
		//	enable float textures on GLES1
		//	https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_float
		
		Pop.Debug("Supported Extensions", gl.getSupportedExtensions() );
		
		let EnableExtension = function(ExtensionName)
		{
			try
			{
				const Extension = gl.getExtension(ExtensionName);
				gl[ExtensionName] = Extension;
				Pop.Debug("Loaded extension",ExtensionName,Extension);
			}
			catch(e)
			{
				Pop.Debug("Error enabling ",ExtensionName,e);
			}
		};
		EnableExtension('OES_texture_float');
		EnableExtension('EXT_blend_minmax');

		//	texture load needs extension in webgl1
		//	in webgl2 it's built in, but requires #version 300 es
		//EnableExtension('EXT_shader_texture_lod');
		//EnableExtension('OES_standard_derivatives');
		
	}
	
	//	we could make this async for some more control...
	this.RenderLoop = function()
	{
		let Render = function(Timestamp)
		{
			//try
			{
				//	gr: here we need to differentiate between render target and render context really
				//		as we use the object. this will get messy when we have textre render targets in webgl
				if ( !this.RenderTarget )
					this.RenderTarget = new WindowRenderTarget(this);
				this.RenderTarget.BindRenderTarget();
				this.OnRender( this.RenderTarget );
			}
			//catch(e)
			{
			//	console.error("OnRender error: ",e);
			}
			window.requestAnimationFrame( Render.bind(this) );
		}
		window.requestAnimationFrame( Render.bind(this) );
	}

	this.GetGlContext = function()
	{
		return this.Context;
	}

	this.InitialiseContext();
	this.InitCanvasElement();

	this.RenderLoop();
}


//	base class with generic opengl stuff
Pop.Opengl.RenderTarget = function(RenderContext)
{
	this.ClearColour = function(r,g,b,a=1)
	{
		let gl = this.GetGlContext();
		gl.clearColor( r, g, b, a );
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
	
	this.ResetState = function()
	{
		const gl = this.GetGlContext();
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		//	to make blending work well, don't reject things on same plane
		gl.depthFunc(gl.LEQUAL);
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
		if ( TriangleCount === undefined )
		{
			TriangleCount = Geometry.IndexCount/3;
		}
		else
		{
			const GeoTriangleCount = Geometry.IndexCount/3;
			if ( TriangleCount > GeoTriangleCount )
			{
				Pop.Debug("Warning, trying to render " + TriangleCount + " triangles, but geo only has " + GeoTriangleCount + ". Clamping as webgl sometimes will render nothing and give no warning");
				TriangleCount = GeoTriangleCount;
			}
		}
		
		if ( TriangleCount <= 0 )
		{
			Pop.Debug("Triangle count",TriangleCount);
			return;
		}
		
		const gl = this.GetGlContext();
		
		gl.useProgram( Shader.Program );
		
		//	setup geometry for rendering
		gl.bindBuffer( gl.ARRAY_BUFFER, Geometry.Buffer );
		
		//	we'll need this if we start having multiple attributes
		for ( let i=0;	i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);	i++)
			gl.disableVertexAttribArray(i);
		//	gr: we get glDrawArrays: attempt to access out of range vertices in attribute 0, if we dont update every frame (this seems wrong)
		//		even if we call gl.enableVertexAttribArray
		Geometry.BindVertexPointers( Shader );
		
		SetUniforms( Shader, Geometry );
		
		gl.drawArrays( Geometry.PrimitiveType, 0, TriangleCount * 3 );
	}
	
}


//	maybe this should be an API type
Pop.Opengl.TextureRenderTarget = function(RenderContext,Image)
{
	Pop.Opengl.RenderTarget.call( this, RenderContext );
	
	this.FrameBuffer = null;
	this.RenderContext = RenderContext;
	this.Image = null;

	
	this.GetGlContext = function()
	{
		const gl = this.RenderContext.GetGlContext();
		return gl;
	}
	
	this.GetRenderTargetRect = function()
	{
		let Rect = [0,0,0,0];
		Rect[2] = this.Image.GetWidth();
		Rect[3] = this.Image.GetHeight();
		return Rect;
	}
	
	this.CreateFrameBuffer = function(Image)
	{
		const Texture = Image.GetOpenglTexture( RenderContext );
		const gl = this.GetGlContext();
		this.FrameBuffer = gl.createFramebuffer();
		this.Image = Image;
		
		//this.BindRenderTarget();
		gl.bindFramebuffer( gl.FRAMEBUFFER, this.FrameBuffer );

		//let Status = gl.checkFramebufferStatus( this.FrameBuffer );
		//Pop.Debug("Framebuffer status",Status);

		//  attach this texture to colour output
		const level = 0;
		const attachmentPoint = gl.COLOR_ATTACHMENT0;
		gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, Texture, level);
		if ( TestFrameBuffer )
			if ( !gl.isFramebuffer( this.FrameBuffer ) )
				throw "Is not frame buffer!";
		//let Status = gl.checkFramebufferStatus( this.FrameBuffer );
		//Pop.Debug("Framebuffer status",Status);
	}
	
	//  bind for rendering
	this.BindRenderTarget = function()
	{
		const gl = this.GetGlContext();
		if ( TestFrameBuffer )
			if ( !gl.isFramebuffer( this.FrameBuffer ) )
				throw "Is not frame buffer!";
		gl.bindFramebuffer( gl.FRAMEBUFFER, this.FrameBuffer );
		
		//	gr: this is givng errors...
		//let Status = gl.checkFramebufferStatus( this.FrameBuffer );
		//Pop.Debug("Framebuffer status",Status);
		const Viewport = this.GetRenderTargetRect();
		gl.viewport( ...Viewport );
		
		this.ResetState();
	}
	
	this.AllocTexureIndex = function()
	{
		return this.RenderContext.AllocTexureIndex();
	}
	
	this.CreateFrameBuffer( Image );
}

function GetTextureRenderTarget(RenderContext,Texture)
{
	if ( !Texture.RenderTarget )
	{
		Texture.RenderTarget = new Pop.Opengl.TextureRenderTarget( RenderContext, Texture );
	}
	return Texture.RenderTarget;
}

function WindowRenderTarget(Window)
{
	const RenderContext = Window;
	this.ViewportMinMax = [0,0,1,1];

	Pop.Opengl.RenderTarget.call( this, RenderContext );

	this.GetGlContext = function()
	{
		return Window.GetGlContext();
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

	this.RenderToRenderTarget = function(TargetTexture,RenderFunction)
	{
		//	setup render target
		const RenderContext = Window;
		let RenderTarget = GetTextureRenderTarget( RenderContext, TargetTexture );
		RenderTarget.BindRenderTarget();
		
		RenderFunction( RenderTarget );
		
		//	todo: restore previously bound, not this.
		//	restore rendertarget
		this.BindRenderTarget();
	}
	
	this.BindRenderTarget = function()
	{
		const gl = this.GetGlContext();
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		const RenderRect = this.GetRenderTargetRect();
		let ViewportMinx = this.ViewportMinMax[0] * RenderRect[2];
		let ViewportMiny = this.ViewportMinMax[1] * RenderRect[3];
		let ViewportWidth = this.GetViewportWidth();
		let ViewportHeight = this.GetViewportHeight();
		//	viewport in pixels in webgl
		gl.viewport( ViewportMinx, ViewportMiny, ViewportWidth, ViewportHeight );
		
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



Pop.Opengl.Shader = function(Context,VertShaderSource,FragShaderSource)
{
	let Name = "A shader";
	this.Name = Name;
	this.VertShader = null;
	this.FragShader = null;
	this.Program = null;
	this.Context = Context;
	
	VertShaderSource = Pop.Opengl.RefactorVertShader(VertShaderSource);
	FragShaderSource = Pop.Opengl.RefactorFragShader(FragShaderSource);

	this.GetGlContext = function()
	{
		return this.Context.GetGlContext();
	}
	
	this.CompileShader = function(Type,Source)
	{
		let gl = this.GetGlContext();
		let Shader = gl.createShader(Type);
		gl.shaderSource( Shader, Source );
		gl.compileShader( Shader );
		
		let CompileStatus = gl.getShaderParameter( Shader, gl.COMPILE_STATUS);
		if ( !CompileStatus )
		{
			let Error = gl.getShaderInfoLog(Shader);
			throw "Failed to compile " + Type + " shader: " + Error;
		}
		return Shader;
	}
	
	this.CompileProgram = function()
	{
		let gl = this.GetGlContext();
		let Program = gl.createProgram();
		gl.attachShader( Program, this.VertShader );
		gl.attachShader( Program, this.FragShader );
		gl.linkProgram( Program );
		
		let LinkStatus = gl.getProgramParameter( Program, gl.LINK_STATUS );
		if ( !LinkStatus )
		{
			//let Error = gl.getShaderInfoLog(Shader);
			throw "Failed to link " + this.Name + " shaders";
		}
		return Program;
	}
	
	this.Bind = function()
	{
		let gl = this.GetGlContext();
		gl.useProgram( this.Program );
	}
	
	//	gr: can't tell the difference between int and float, so err that wont work
	this.SetUniform = function(Uniform,Value)
	{
		let UniformMeta = this.GetUniformMeta(Uniform);
		if ( !UniformMeta )
			return;
		if( Array.isArray(Value) )				this.SetUniformArray( Uniform, Value );
		else if ( Value instanceof Pop.Image )	this.SetUniformTexture( Uniform, Value, Context.AllocTexureIndex() );
		//else if ( Value instanceof float2 )		this.SetUniformFloat2( Uniform, Value );
		//else if ( Value instanceof float3 )		this.SetUniformFloat3( Uniform, Value );
		//else if ( Value instanceof float4 )		this.SetUniformFloat4( Uniform, Value );
		//else if ( Value instanceof Matrix4x4 )	this.SetUniformMatrix4x4( Uniform, Value );
		else if ( typeof Value === 'number' )	this.SetUniformNumber( Uniform, Value );
		else if ( typeof Value === 'boolean' )	this.SetUniformNumber( Uniform, Value );
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
		let UniformMeta = this.GetUniformMeta(UniformName);
		
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
		while ( ValuesExpanded.length < UniformMeta.ElementSize * UniformMeta.ElementCount )
			ValuesExpanded.push(0);
		/*
		 if ( ValuesExpanded.length > UniformMeta.size )
		 throw "Trying to put array of " + ValuesExpanded.length + " values into uniform " + UniformName + "[" + UniformMeta.size + "] ";
		 */
		UniformMeta.SetValues( ValuesExpanded );
	}
	
	this.SetUniformTexture = function(Uniform,Image,TextureIndex)
	{
		let Texture = Image.GetOpenglTexture( Context );
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
	
	this.UniformMetaCache = null;
	
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
	
	
	let gl = this.GetGlContext();
	this.FragShader = this.CompileShader( gl.FRAGMENT_SHADER, FragShaderSource );
	this.VertShader = this.CompileShader( gl.VERTEX_SHADER, VertShaderSource );
	this.Program = this.CompileProgram();
}
function GetOpenglElementType(OpenglContext,Elements)
{
	if ( Elements instanceof Float32Array )	return OpenglContext.FLOAT;
	
	throw "GetOpenglElementType unhandled type; " + Elements.prototype.constructor;
}

Pop.Opengl.TriangleBuffer = function(RenderContext,VertexAttributeName,VertexData,VertexSize,TriangleIndexes)
{
	const gl = RenderContext.GetGlContext();
	
	//	data as array doesn't work properly and gives us
	//	gldrawarrays attempt to access out of range vertices in attribute 0
	if ( Array.isArray(VertexData) )
		VertexData = new Float32Array( VertexData );
	
	this.Buffer = gl.createBuffer();
	this.PrimitiveType = gl.TRIANGLES;
	this.IndexCount = TriangleIndexes.length;
	
	if ( this.IndexCount % 3 != 0 )
	{
		throw "Triangle index count not divisible by 3";
	}
	
	
	this.BindVertexPointers = function(Shader)
	{
		//	setup offset in buffer
		let InitAttribute = function(Attrib)
		{
			let Location = Attrib.Location;
			
			if ( Shader )
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
			let OffsetBytes = 0;
			gl.vertexAttribPointer( Attrib.Location, Attrib.Size, Attrib.Type, Normalised, StrideBytes, OffsetBytes );
			gl.enableVertexAttribArray( Attrib.Location );
		}
		this.Attributes.forEach( InitAttribute );
	}
	
	let Attributes = [];
	let PushAttribute = function(Name,Floats,Location,Size)
	{
		let Type = GetOpenglElementType( gl, Floats );
		
		let Attrib = {};
		Attrib.Name = Name;
		Attrib.Floats = VertexData;
		Attrib.Size = Size;
		Attrib.Type = Type;
		Attrib.Location = Location;
		Attributes.push( Attrib );
	}
	PushAttribute( VertexAttributeName, VertexData, 0, VertexSize );
	
	this.Attributes = Attributes;
	
	//	set the total buffer data
	gl.bindBuffer( gl.ARRAY_BUFFER, this.Buffer );
	gl.bufferData( gl.ARRAY_BUFFER, VertexData, gl.STATIC_DRAW );
	
	this.BindVertexPointers();
}

