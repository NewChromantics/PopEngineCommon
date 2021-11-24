import * as WebApi from './PopWebApi.js';

//	gr: this module should only export Pop. namespaces that are
//		present in the native API
//	NOT:
//		.Math
//		.Colour
//		.Assets


//import * as Opengl from './PopWebOpenglApi.js';
//Pop.Opengl = Opengl;


//	gr: all the non-namespaced stuff is in webapi... but can't modify that module,
//		so... just link?
const Pop = Object.assign({},WebApi);
export default Pop;
//Pop.GetTimeNowMs = WebApi.GetTimeNowMs;

import PopImage from './PopWebImageApi.js'
Pop.Image = PopImage;

import * as Opengl from './PopWebOpenglApi.js'
Pop.Opengl = Opengl;
Pop.Sokol = Opengl;	//	native name. Should rename both of these to Renderer?

import * as Gui from './PopWebGuiApi.js'
Pop.Gui = Gui;

import * as Websocket from './PopWebSocketApi.js'
Pop.Websocket = Websocket;

import * as FileSystem from './FileSystem.js'
//	gr: hmm these are root functions, so they need to go into PopWebApi?
Pop.FileSystem = FileSystem;
//Pop.LoadFileAsStringAsync = Pop.FileSystem.LoadFileAsStringAsync;
Object.assign( Pop, Pop.FileSystem );


import * as Zip from './PopWebZipApi.js'
Pop.Zip = Zip;

