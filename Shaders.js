const Default = `Common shader utilities`;
export default Default;


export function ExtractShaderUniforms(Shader,Shader2=null)
{
	//const Pattern = new RegExp(`uniform\\s([a-zA-Z0-9]+)\\s([a-zA-Z0-9-_]+)\\s;`);
	const Pattern = new RegExp(`uniform\\s([a-zA-Z0-9]+)\\s([a-zA-Z0-9]+)\\s?;`,'g');
	const Uniforms = [];
	
	for ( let i=0;	i<999;	i++ )	//	avoid infinite loop
	{
		const Match = Pattern.exec(Shader);
		if ( !Match )
			break;
		//Pop.Debug(`Match = ${JSON.stringify(Match)}`);
		const Uniform = {};
		Uniform.Type = Match[1];
		Uniform.Name = Match[2];
		Uniforms.push(Uniform);
	}
	
	//	recurse for multiple inputs
	if ( Shader2 )
	{
		const Uniforms2 = ExtractShaderUniforms(Shader2);
		Uniforms.push( ...Uniforms2 );
	}
	
	return Uniforms;
}
