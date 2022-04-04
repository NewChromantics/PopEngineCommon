//	aruco marker detection as a module
//	gr: taken from https://github.com/jcmellado/js-aruco/blob/master/src/aruco.js
//	the PopAruco.js marker-utils needs to be non-module still for native

//	posit from https://github.com/jcmellado/js-aruco/blob/master/samples/debug-posit/posit1.js

import {GetPoseEstimation} from './PoseEstimation.js'
import CV from './Opencv.js'
import {GetQuaternionFromMatrix4x4} from './Math.js'




class WebBarcodeDetector
{
	constructor()
	{
		const Options = {};
		Options.formats = ['qr_code'];
		this.Detector = new BarcodeDetector(Options);
	}
	
	async detect(Image)
	{
	/*
		function PxToUv(xy)
		{
			let u = xy.x / Frame.Meta.Width;
			let v = xy.y / Frame.Meta.Height;
			return [u,v];
		}
		*/
		const Markers = await this.Detector.detect(Image);
		
		function MakeMarkerOutput(Marker)
		{
			const Output = {};
			Output.corners = Marker.cornerPoints;
			Output.value = Marker.rawValue;
			return Output;
		}
		const OutputMarkers = Markers.map(MakeMarkerOutput);
		
		return OutputMarkers;
	}
}


export function GetPoseFromMarkers(MarkerCorners,ImageWidth,ImageHeight,ObjectSizeOrCorners)
{
	const Flip = true;
		
	//	https://github.com/jcmellado/js-aruco/blob/master/samples/debug-posit/debug-posit.html#L220
	//	marker corners need to be -0.5...0.5 in marker space
	//	todo: move this to the pose() calc
	function NormaliseCorner(Corner)
	{
		const x = Corner.x - (ImageWidth/2);
		let y = Corner.y - (ImageHeight/2);
		if ( Flip )
			 y = (ImageHeight/2) - Corner.y;
			
		const xy = {};
		xy.x = x;
		xy.y = y;
		return xy;
	}
	const ProcessCorners = MarkerCorners.map(NormaliseCorner);
		
	const FocalLength = ImageWidth;
	const MarkerSize = ObjectSizeOrCorners;
	const MarkerNormal = null;
	const Pose = GetPoseEstimation(MarkerSize,MarkerNormal,FocalLength,ProcessCorners);

	//	gr: these are 3x3, so I guess they're rodrigues rotations?
	//	convert to a sensible matrix
	const Rotation3x3 = Pose.bestRotation;
	const Translation3 = Pose.bestTranslation;

	const Rotation4x4 = 
	[
		Rotation3x3[0][0],	Rotation3x3[1][0],	Rotation3x3[2][0],	0,
		Rotation3x3[0][1],	Rotation3x3[1][1],	Rotation3x3[2][1],	0,
		Rotation3x3[0][2],	Rotation3x3[1][2],	Rotation3x3[2][2],	0,
		0,					0,					0,					1
	];		
	
	/*
	const yaw = -Math.atan2(Rotation3x3[0][2], Rotation3x3[2][2]);
	const pitch = -Math.asin(-Rotation3x3[1][2]);
	const roll = Math.atan2(Rotation3x3[1][0], Rotation3x3[1][1]);
	
	Pop.Debug(`Rotation3x3=${Rotation3x3} Translation3=${Translation3} pitch=${pitch} yaw=${yaw} roll=${roll}`);
	*/
	const Quaternion = GetQuaternionFromMatrix4x4(Rotation4x4);
		
	Pose.RotationQuaternion = Quaternion;
	Pose.RotationMatrix = Rotation4x4;
	
	//	position should be in camera space units	
	Pose.Position = Translation3;

	return Pose;
}


let DetectorInstance;

//	todo: this is/shouldnt be ARUCO specific
//	marker -> pose
async function DetectMarkers(imageData,MarkerSize=1)
{
	if ( !DetectorInstance )
	{
		try
		{
			DetectorInstance = new WebBarcodeDetector();
		}
		catch(e)
		{
			console.error(e)
			DetectorInstance = new ArucoDetector();
		}
	}

	const ImageWidth = imageData.width;
	const ImageHeight = imageData.height;
	const Markers = await DetectorInstance.detect(imageData);
	
	
	
	function AddPoseToMarker(Marker)
	{
		const ObjectSizeOrCorners = 1;
		Marker.Pose = GetPoseFromMarkers( Marker.corners, ImageWidth, ImageHeight, ObjectSizeOrCorners );
	}
	Markers.forEach(AddPoseToMarker);
	
	
	return Markers;
}

export default DetectMarkers;


class ArucoMarker
{
	constructor(id, corners)
	{
		this.id = id;
		this.corners = corners;
	}
}



class ArucoDetector
{
	constructor()
	{
		this.grey = new CV.Image();
		this.thres = new CV.Image();
		this.homography = new CV.Image();
		this.binary = [];
		this.contours = [];
		this.polys = [];
		this.candidates = [];
	}

	async detect(image)
	{
		CV.grayscale(image, this.grey);
		CV.adaptiveThreshold(this.grey, this.thres, 2, 7);

		this.contours = CV.findContours(this.thres, this.binary);

		this.candidates = this.findCandidates(this.contours, image.width * 0.20, 0.05, 10);
		this.candidates = this.clockwiseCorners(this.candidates);
		this.candidates = this.notTooNear(this.candidates, 10);

		return this.findMarkers(this.grey, this.candidates, 49);
	}

	findCandidates(contours, minSize, epsilon, minLength)
	{
		var candidates = [], len = contours.length, contour, poly, i;

		this.polys = [];

		for (i = 0; i < len; ++ i){
		contour = contours[i];

		if (contour.length >= minSize){
		  poly = CV.approxPolyDP(contour, contour.length * epsilon);

		  this.polys.push(poly);

		  if ( (4 === poly.length) && ( CV.isContourConvex(poly) ) ){

			if ( CV.minEdgeLength(poly) >= minLength){
			  candidates.push(poly);
			}
		  }
		}
		}

		return candidates;
	}

	clockwiseCorners(candidates)
	{
		var len = candidates.length, dx1, dx2, dy1, dy2, swap, i;

		for (i = 0; i < len; ++ i)
		{
			dx1 = candidates[i][1].x - candidates[i][0].x;
			dy1 = candidates[i][1].y - candidates[i][0].y;
			dx2 = candidates[i][2].x - candidates[i][0].x;
			dy2 = candidates[i][2].y - candidates[i][0].y;

			if ( (dx1 * dy2 - dy1 * dx2) < 0)
			{
				swap = candidates[i][1];
				candidates[i][1] = candidates[i][3];
				candidates[i][3] = swap;
			}
		}

		return candidates;
	};

	notTooNear(candidates, minDist)
	{
		var notTooNear = [], len = candidates.length, dist, dx, dy, i, j, k;

		for (i = 0; i < len; ++ i){

		for (j = i + 1; j < len; ++ j){
		  dist = 0;
		  
		  for (k = 0; k < 4; ++ k){
			dx = candidates[i][k].x - candidates[j][k].x;
			dy = candidates[i][k].y - candidates[j][k].y;
		  
			dist += dx * dx + dy * dy;
		  }
		  
		  if ( (dist / 4) < (minDist * minDist) ){
		  
			if ( CV.perimeter( candidates[i] ) < CV.perimeter( candidates[j] ) ){
			  candidates[i].tooNear = true;
			}else{
			  candidates[j].tooNear = true;
			}
		  }
		}
		}

		for (i = 0; i < len; ++ i){
		if ( !candidates[i].tooNear ){
		  notTooNear.push( candidates[i] );
		}
		}

		return notTooNear;
	}

	findMarkers(imageSrc, candidates, warpSize)
	{
		var markers = [], len = candidates.length, candidate, marker, i;

		for (i = 0; i < len; ++ i)
		{
			candidate = candidates[i];

			CV.warp(imageSrc, this.homography, candidate, warpSize);

			CV.threshold(this.homography, this.homography, CV.otsu(this.homography) );

			marker = this.getMarker(this.homography, candidate);
			if (marker)
			{
				markers.push(marker);
			}
		}

		return markers;
	};

	getMarker(imageSrc, candidate)
	{
		var width = (imageSrc.width / 7) >>> 0,
		  minZero = (width * width) >> 1,
		  bits = [], rotations = [], distances = [],
		  square, pair, inc, i, j;

		for (i = 0; i < 7; ++ i){
		inc = (0 === i || 6 === i)? 1: 6;

		for (j = 0; j < 7; j += inc){
		  square = {x: j * width, y: i * width, width: width, height: width};
		  if ( CV.countNonZero(imageSrc, square) > minZero){
			return null;
		  }
		}
		}

		for (i = 0; i < 5; ++ i){
		bits[i] = [];

		for (j = 0; j < 5; ++ j){
		  square = {x: (j + 1) * width, y: (i + 1) * width, width: width, height: width};
		  
		  bits[i][j] = CV.countNonZero(imageSrc, square) > minZero? 1: 0;
		}
		}

		rotations[0] = bits;
		distances[0] = this.hammingDistance( rotations[0] );

		pair = {first: distances[0], second: 0};

		for (i = 1; i < 4; ++ i){
		rotations[i] = this.rotate( rotations[i - 1] );
		distances[i] = this.hammingDistance( rotations[i] );

		if (distances[i] < pair.first){
		  pair.first = distances[i];
		  pair.second = i;
		}
		}

		if (0 !== pair.first){
		return null;
		}

		const id = this.mat2id( rotations[pair.second] );
		const Corners = this.rotate2(candidate, 4 - pair.second);
		const Marker = new ArucoMarker( id, Corners );
		return Marker;
	}

	hammingDistance(bits)
	{
		var ids = [ [1,0,0,0,0], [1,0,1,1,1], [0,1,0,0,1], [0,1,1,1,0] ],
		  dist = 0, sum, minSum, i, j, k;

		for (i = 0; i < 5; ++ i){
		minSum = Infinity;

		for (j = 0; j < 4; ++ j){
		  sum = 0;

		  for (k = 0; k < 5; ++ k){
			  sum += bits[i][k] === ids[j][k]? 0: 1;
		  }

		  if (sum < minSum){
			minSum = sum;
		  }
		}

		dist += minSum;
		}

		return dist;
	}

	mat2id(bits)
	{
		var id = 0, i;

		for (i = 0; i < 5; ++ i){
		id <<= 1;
		id |= bits[i][1];
		id <<= 1;
		id |= bits[i][3];
		}

		return id;
	}

	rotate(src)
	{
		var dst = [], len = src.length, i, j;

		for (i = 0; i < len; ++ i){
		dst[i] = [];
		for (j = 0; j < src[i].length; ++ j){
		  dst[i][j] = src[src[i].length - j - 1][i];
		}
		}

		return dst;
	}

	rotate2(src, rotation)
	{
		var dst = [], len = src.length, i;

		for (i = 0; i < len; ++ i)
		{
			dst[i] = src[ (rotation + i) % len ];
		}
		return dst;
	}
}

