//	this file is extensions for DLL handling which are more easily implemented in javascript
if ( !Pop.Dll )
	throw "Including PopDll extensions to Pop.Dll which is missing from the API. Probably not supported on this platform, so don't include?";

//	parse a C function like...
//		int GetFloats(float* FloatBuffer,uint32_t FloatCount);
//	and get function structure in return
Pop.Dll.ParseFunction = function(Declaration)
{
	const Pattern_Return = '(.+)[\\s]+';	//	type space
	const Pattern_Name = '([^\\s]+)[\\s]*';	//	name space?
	const Pattern_Parenthesis = '\\((.*)\\)';	//	( * )
	const Pattern_Tail = '[\\s]*;[\\s]*$';	//	space? ; space? end

	const SplitFunctionRegex = new RegExp( Pattern_Return + Pattern_Name + Pattern_Parenthesis + Pattern_Tail );
	const Match = Declaration.match(SplitFunctionRegex);
	const ReturnType = Match[1];
	const FunctionName = Match[2];
	const Arguments = (Match[3].length==0) ? [] : Match[3].split(',');
	//Pop.Debug('Arguments',JSON.stringify(Arguments), 'Match[3]',JSON.stringify(Match[3]));
	
	const ArgumentNames = [];
	const ArgumentTypes = [];
	function TypeAndNameFromVariable(Variable)
	{
		const SplitVariableRegex = new RegExp('(.+)[\\s]+([^\\s]*)[\\s]*$');
		const Match = Variable.match(SplitVariableRegex);
		const Type = Match[1];
		const Name = Match[2];
		return {'Type':Type,'Name':Name};
	}
	function PushVariableTypeAndName(Variable)
	{
		const TypeAndName = TypeAndNameFromVariable(Variable);
		let Type = TypeAndName.Type;
		Type = Type.replace('const','');
		Type = Type.trim();
		//Pop.Debug('['+Type+']');
		ArgumentTypes.push( Type );
		
		let Name = TypeAndName.Name.trim();
		ArgumentNames.push( Name );
	}
	Arguments.forEach( PushVariableTypeAndName );
	
	const Function = {};
	Function.Name = FunctionName;
	Function.ReturnType = ReturnType;
	Function.ArgumentTypes = ArgumentTypes;
	Function.ArgumentNames = ArgumentNames;

	return Function;
}

//	__proto__ in jscore and prototype in v8. Need to sort this!
Pop.Dll.Library.prototype = Pop.Dll.Library.prototype || Pop.Dll.Library.__proto__;

//	parse C function and get a callable lambda/functor in return
Pop.Dll.Library.prototype.GetFunctionFromDeclaration = function(CapiDeclaration)
{
	const FunctionDeclaration = Pop.Dll.ParseFunction( CapiDeclaration );
	this.BindFunction( FunctionDeclaration.Name, FunctionDeclaration.ArgumentTypes, FunctionDeclaration.ReturnType );
	
	//	create calling lambda
	let FunctionCaller = function()
	{
		const FunctionName = FunctionDeclaration.Name;
		//	call expending arguments
		//	todo: do some checks! eg. argument count. Engine will do that anwyay though
		const Result = this.CallFunction( FunctionName, ...arguments );
		return Result;
	}
	return FunctionCaller.bind(this);
}

