const Default = `Common shader utilities`;
export default Default;

function CommentToJson(String)
{
	if ( !String )
		return;

	//	strip comment strings
	//	todo: do nice comment parsing (done this in another project!)
	String = String.replaceAll('/*','');
	String = String.replaceAll('*/','');
	String = String.replaceAll('//','');
	String = String.trim();
	if ( !String.length )
		return null;
	
	
	//	insert "key" quotes around keys
	//		min:10 -> "min":10
	//		min=10 -> "min":10
	//		min    = 10 -> "min": 10
	//	https://stackoverflow.com/a/44562916/355753
	//String = String.replace(/([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)/g, "\"$1\":\"$2\"");
	//String = String.replace(/([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)/g, "\"$1\":$2");
	String = String.replace(/([a-zA-Z0-9-]+)\s*[:|=]/g, "\"$1\":");
	
	//	if the string doesn't start with {
	//	wrap it, so we can allow
	//		//	min:1,max:10
	//	to be turned into {min:1,max:10}
	if ( String[0] != '{' )
		String = `{${String}}`;
	
	try
	{
		let Json = JSON.parse( String );
		return Json;
	}
	catch(e)
	{
		console.log(`Failed to convert comment "${String}" to json; ${e}`);
		return;
	}
}

//	could work for varying, uniform, attribute... 
function ExtractShaderSymbols(Prefix,Shader,Shader2=null)
{
	//	end of this pattern should be line feed or end of doc, but unlikely to get a uniform or attribute at the bottom
	const Pattern = new RegExp(`${Prefix}\\s([a-zA-Z0-9]+)\\s([a-zA-Z0-9_]+)\\s?;(.*)\n`,'g');
	const Uniforms = [];
	
	//	filter out duplicates
	//	gr: on native was causing some not to be written;
	//		I think uniform buffer has a bug (webgl okay as theyre set directly)
	function PushUniqueUniform(Uniform)
	{
		function MatchName(ExistingUniform)
		{
			return Uniform.Name == ExistingUniform.Name;
		}
		//	skip duplicate
		if ( Uniforms.some(MatchName) )
			return;
		Uniforms.push( Uniform );
	}
	
	for ( let i=0;	i<999;	i++ )	//	avoid infinite loop
	{
		const Match = Pattern.exec(Shader);
		if ( !Match )
			break;
		//Pop.Debug(`Match = ${JSON.stringify(Match)}`);
		const Uniform = {};
		
		Uniform.Comment = Match[3];
		const CommentJson = CommentToJson(Uniform.Comment) || {};
		Object.assign( Uniform, CommentJson );
		
		//	force these over any user-provided meta
		Uniform.Type = Match[1];
		Uniform.Name = Match[2];
		Uniform.Comment = Match[3];		
		
		PushUniqueUniform(Uniform);
	}
	
	//	recurse for multiple inputs
	if ( Shader2 )
	{
		const Uniforms2 = ExtractShaderSymbols(Prefix,Shader2);
		Uniforms2.forEach( PushUniqueUniform );
	}
	
	return Uniforms;
}


export function ExtractShaderUniforms(Shader,Shader2=null)
{
	return ExtractShaderSymbols('uniform',...arguments);
}

export function ExtractShaderAttributes(Shader,Shader2=null)
{
	return ExtractShaderSymbols('attribute',...arguments);
}
