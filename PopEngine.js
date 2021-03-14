import * as WebApi from './PopWebApi.js';

//import * as Opengl from './PopWebOpenglApi.js';
//Pop.Opengl = Opengl;


//	gr: all the non-namespaced stuff is in webapi... but can't modify that module,
//		so... just link?
const Pop = Object.assign({},WebApi);
export default Pop;
//Pop.GetTimeNowMs = WebApi.GetTimeNowMs;

import PopImage from './PopWebImageApi.js'
Pop.Image = PopImage;

import * as Colour from './Colour.js'
Pop.Colour = Colour;

import * as PopMath from './Math.js'
Pop.Math = PopMath;

import * as FileSystem from './FileSystem.js'
//	gr: hmm these are root functions, so they need to go into PopWebApi?
Pop.FileSystem = FileSystem;
