const Default = 'PopWebApiCore.js module';
export default Default;
export * from './PopApi.js'

//	The only things that should be in this module are;
//	- dependency free
//	- web api only (ie. have a native equivelent)
//	- could be frequently used away from the engine

//	simple aliases
export const Debug = console.log;
export const Warning = console.warn;


export async function Yield(Milliseconds)
{
	const Promise = CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}

export function GetPlatform()
{
	return 'Web';
}

export function GetTimeNowMs()
{
	//	this returns a float, even though it's in ms,
	//	so round to integer
	const Now = performance.now();
	return Math.floor(Now);
}
