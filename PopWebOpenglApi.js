Pop.Opengl = {};

Pop.Opengl.Window = function(Name,Rect)
{
	this.Context = null;
	this.RenderTarget = null;
	
	this.GetCanvasElement = function()
	{
		let Element = document.getElementById(Name);
		if ( Element )
			return Element;
		
		if ( !Rect )
			Rect = [10,10,640,480];
		
		//	create!
		Element = document.createElement('canvas');
		Element.id = Name;
		if ( Rect !== undefined )
		{
			Element.style.display = 'block';
			Element.style.position = 'absolute';
			Element.style.border = '1px solid #f00';
			
			let Left = Rect[0];
			let Right = Rect[0] + Rect[2];
			let Top = Rect[1];
			let Bottom = Rect[1] +  Rect[3];
			Element.style.left = Left+'px';
			//Element.style.right = Right+'px';
			Element.style.top = Top+'px';
			//Element.style.bottom = Bottom+'px';
			Element.style.width = Rect[2]+'px';
			Element.style.height = Rect[3]+'px';
		}
		document.body.appendChild( Element );
		
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
		var ext = gl.getExtension('OES_texture_float');
	}
	
	//	we could make this async for some more control...
	this.RenderLoop = function()
	{
		let Render = function(Timestamp)
		{
			try
			{
				//	gr: here we need to differentiate between render target and render context really
				//		as we use the object. this will get messy when we have textre render targets in webgl
				if ( !this.RenderTarget )
					this.RenderTarget = new WindowRenderTarget(this);
				this.OnRender( this.RenderTarget );
			}
			catch(e)
			{
				console.error("OnRender error: ",e);
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

	this.RenderLoop();
}

function WindowRenderTarget(Window)
{
	this.GetGlContext = function()
	{
		return Window.GetGlContext();
	}
	
	this.GetScreenRect = function()
	{
		let Canvas = Window.GetCanvasElement();
		let ElementRect = Canvas.getBoundingClientRect();
		let Rect = [ ElementRect.x, ElementRect.y, ElementRect.width, ElementRect.height ];
		return Rect;
	}
	
	this.ClearColour = function(r,g,b,a=1)
	{
		let gl = this.GetGlContext();
		gl.clearColor( r, g, b, a );
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
	
	this.DrawGeometry = function(Geometry,Shader,SetUniforms)
	{
	}
}

Pop.Opengl.Shader = function(RenderContext,VertSource,FragSource)
{
	Pop.Debug("todo create shader");
}

Pop.Opengl.TriangleBuffer = function(RenderContext)
{
	Pop.Debug("todo create triangle buffer");
}

