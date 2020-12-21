const PopX = {};
export default PopX;

import Opengl from './PopEngineOpengl.js'

PopX.Opengl = Opengl;


PopX.GetTimeNowMs = function()
{
	return performance.now();
}

PopX.Debug = console.log;
PopX.Warning = console.warn;
