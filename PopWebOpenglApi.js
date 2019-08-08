Pop.Opengl = {};

//	webgl only supports glsl 100!
Pop.GlslVersion = 100;



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
		Source = Source.replace(/in /gi,'attribute ');
		Source = Source.replace(/out /gi,'varying ');
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
	let Match = 'texture2D(';
	Source = Source.replace(Match,'texture(');

	if ( Pop.GlslVersion == 100 )
	{
		Source = Source.replace(/in /gi,'varying ');
	}
	else if ( Pop.GlslVersion >= 300 )
	{
		Source = Source.replace(/varying /gi,'in ');
		//Source = Source.replace(/gl_FragColor/gi,'FragColor');
	}
	return Source;
}





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
		this.Context = Canvas.getContext("webgl2");
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
			//try
			{
				//	gr: here we need to differentiate between render target and render context really
				//		as we use the object. this will get messy when we have textre render targets in webgl
				if ( !this.RenderTarget )
					this.RenderTarget = new WindowRenderTarget(this);
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



Pop.Opengl.Shader = function(Context,VertShaderSource,FragShaderSource)
{
	let Name = "A shader";
	this.Name = Name;
	this.VertShader = null;
	this.FragShader = null;
	this.Program = null;
	this.CurrentTextureIndex = 0;
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
		
		//	reset texture counter everytime we bind
		this.CurrentTextureIndex = 0;
	}
	
	//	gr: can't tell the difference between int and float, so err that wont work
	this.SetUniform = function(Uniform,Value)
	{
		if( Array.isArray(Value) )				this.SetUniformArray( Uniform, Value );
		else if ( Value instanceof TTexture )	this.SetUniformTexture( Uniform, Value, this.CurrentTextureIndex++ );
		else if ( Value instanceof float2 )		this.SetUniformFloat2( Uniform, Value );
		else if ( Value instanceof float3 )		this.SetUniformFloat3( Uniform, Value );
		else if ( Value instanceof float4 )		this.SetUniformFloat4( Uniform, Value );
		else if ( Value instanceof Matrix4x4 )	this.SetUniformMatrix4x4( Uniform, Value );
		else if ( typeof Value === 'number' )	this.SetUniformNumber( Uniform, Value );
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
				ValuesEnum.push(...v);
			else if ( typeof v == "object" )
				v.Enum( function(v)	{	ValuesExpanded.push(v);	} );
			else
				ValuesExpanded.push(v);
		};
		Values.forEach( EnumValue );
		
		//	check array size (allow less, but throw on overflow)
		//	error if array is empty
		while ( ValuesExpanded.length < UniformMeta.size )
			ValuesExpanded.push(0);
		/*
		 if ( ValuesExpanded.length > UniformMeta.size )
		 throw "Trying to put array of " + ValuesExpanded.length + " values into uniform " + UniformName + "[" + UniformMeta.size + "] ";
		 */
		UniformMeta.SetValues( ValuesExpanded );
	}
	
	this.SetUniformTexture = function(Uniform,Texture,TextureIndex)
	{
		let gl = this.GetGlContext();
		let UniformPtr = gl.getUniformLocation( this.Program, Uniform );
		//  https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
		//  WebGL provides a minimum of 8 texture units;
		let GlTextureNames = [ gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3, gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE6, gl.TEXTURE7 ];
		//	setup textures
		gl.activeTexture( GlTextureNames[TextureIndex] );
		try
		{
			gl.bindTexture(gl.TEXTURE_2D, Texture.Asset);
		}
		catch(e)
		{
			console.log("SetUniformTexture: " + e);
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
	
	//	todo: cache this!
	this.GetUniformMeta = function(MatchUniformName)
	{
		let gl = this.GetGlContext();
		let UniformCount = gl.getProgramParameter( this.Program, gl.ACTIVE_UNIFORMS );
		for ( let i=0;	i<UniformCount;	i++ )
		{
			let UniformMeta = gl.getActiveUniform( this.Program, i );
			//	match name even if it's an array
			//	todo: struct support
			let UniformName = UniformMeta.name.split('[')[0];
			//	note: uniform consists of structs, Array[Length] etc
			if ( UniformName != MatchUniformName )
				continue;
			
			UniformMeta.Location = gl.getUniformLocation( this.Program, UniformMeta.name );
			switch( UniformMeta.type )
			{
				case gl.INT:
				case gl.UNSIGNED_INT:
				case gl.BOOL:
					UniformMeta.SetValues = function(v)	{	gl.uniform1iv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT:
					UniformMeta.SetValues = function(v)	{	gl.uniform1fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_VEC2:
					UniformMeta.SetValues = function(v)	{	gl.uniform2fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_VEC3:
					UniformMeta.SetValues = function(v)	{	gl.uniform3fv( UniformMeta.Location, v );	};
					break;
				case gl.FLOAT_VEC4:
					UniformMeta.SetValues = function(v)	{	gl.uniform4fv( UniformMeta.Location, v );	};
					break;
					
				default:
				case gl.FLOAT_MAT2:
				case gl.FLOAT_MAT3:
				case gl.FLOAT_MAT4:
					UniformMeta.SetValues = function(v)	{	throw "Unhandled type " + Uniform.type + " on " + MatchUniformName;	};
					break;
			}
			return UniformMeta;
		}
		throw "No uniform named " + MatchUniformName;
	}
	
	
	
	let gl = this.GetGlContext();
	this.FragShader = this.CompileShader( gl.FRAGMENT_SHADER, FragShaderSource );
	this.VertShader = this.CompileShader( gl.VERTEX_SHADER, VertShaderSource );
	this.Program = this.CompileProgram();
}


Pop.Opengl.TriangleBuffer = function(RenderContext)
{
	Pop.Debug("todo create triangle buffer");
}

