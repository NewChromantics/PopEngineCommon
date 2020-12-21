
const Opengl = {};


export class RenderContext
{
	constructor(Context)
	{
		//	todo: create if null
		this.Context = Context;
		
		//	new version when reacquired when assets need rebuilding
		this.ContextVersion = 0;
	}
	
	GetGlContext()
	{
		return this.Context;
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
	
			
	
	CompileShader(RenderContext,Type,Source,TypeName)
	{
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
		
		function CleanLineFeeds(TheString)
		{
			const Lines = TheString.split(/\r?\n/);
			const NewLines = Lines.join('\n');
			return NewLines;
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
		
		function StringToAsciis(String)
		{
			const Asciis = [];
			for ( let i=0;	i<String.length;	i++ )
				Asciis.push( String.charCodeAt(i) );
			return Asciis;
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
		const Shader = gl.createShader(Type);
		gl.shaderSource( Shader, Source );
		gl.compileShader( Shader );
		
		const CompileStatus = gl.getShaderParameter( Shader, gl.COMPILE_STATUS);
		if ( !CompileStatus )
		{
			let Error = gl.getShaderInfoLog(Shader);
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
		else if ( Value instanceof Pop.Image )		this.SetUniformTexture( Uniform, UniformMeta, Value, this.Context.AllocTexureIndex() );
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

//	these symbols need to be after definition...
export default Opengl;
Opengl.RenderContext = RenderContext;
Opengl.Shader = Shader;
