const Default = `Common shader utilities`;
export default Default;


//	could work for varying, uniform, attribute... 
function ExtractShaderSymbols(Prefix,Shader,Shader2=null)
{
	const Pattern = new RegExp(`${Prefix}\\s([a-zA-Z0-9]+)\\s([a-zA-Z0-9_]+)\\s?;`,'g');
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
		Uniform.Type = Match[1];
		Uniform.Name = Match[2];
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
	return ExtractShaderSymbols('uniform',Shader);
}

export function ExtractShaderAttributes(Shader,Shader2=null)
{
	return ExtractShaderSymbols('attribute',Shader);
}
