//	safari doesn't like assigning imports to a global Pop object
//	any more, so this must now be used like
//		import * as Pop from './PopEngine.js'
//
//	all exports in this file are expected to be in the native api
//	the native api should really change to use virtual "xx.js" files for imports

//	Core native-global-api-replacements
//import * as WebApi from './PopWebApi.js';
export * from './PopWebApi.js'

export { PopImage as Image } from './PopWebImageApi.js'
export * as Opengl from './PopWebOpenglApi.js'
//	native name. Should rename both of these to Renderer?
export * as Sokol from './PopWebOpenglApi.js'
export * as Gui from './PopWebGuiApi.js'
export * as Websocket from './PopWebSocketApi.js'
export * as Xr from './PopWebXrApi.js'
export * as FileSystem from './FileSystem.js'

//export { * as Zip } from './PopWebZipApi.js'
