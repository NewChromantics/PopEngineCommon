const Default = 'Opengl Shaders.js - helper functions';
export default Default;


//	webgl only supports glsl 100!
export const GlslVersion = 100;


//	this is currenly in c++ in the engine. need to swap to javascript
export function RefactorGlslShader(Source)
{
	if ( !Source.startsWith('#version ') )
	{
		Source = '#version ' + GlslVersion + '\n' + Source;
	}
	
	//Source = 'precision mediump float;\n' + Source;
	
	Source = Source.replace(/float4x4/gi,'mat4');
	Source = Source.replace(/float2x2/gi,'mat2');
	Source = Source.replace(/float3x3/gi,'mat3');
	Source = Source.replace(/float2/gi,'vec2');
	Source = Source.replace(/float3/gi,'vec3');
	Source = Source.replace(/float4/gi,'vec4');

	return Source;
}

export function RefactorVertShader(Source)
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

export function RefactorFragShader(Source)
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

export function CleanShaderSource(Source)
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
	return Source;
}
