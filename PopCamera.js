
Pop.Camera = function()
{
	this.FovVertical = 45;
	
	this.Position = [ 0,2,20 ];
	this.LookAt = [ 0,0,0 ];
	
	this.NearDistance = 0.01;
	this.FarDistance = 100;
	
	this.GetOpencvProjectionMatrix = function(ViewRect)
	{
		/*
		 Matrix[0] =
		 |fx  0 cx|
		 |0  fy cy|
		 |0  0   1|
		*/
		
		//	from calibration
		//let w = 363.30 * 2;
		//let h = 364.19 * 2;
		//let cx = 400;
		//let cy = 400;
		let w = ViewRect[2];
		let h = ViewRect[3];
		let cx = w/2;
		let cy = h/2;
		
		let Matrix =
		[
			w/2,
		 	0,
		 	cx,
		 
		 	0,
			h/2,
			cy,
		 
		 	0,
		 	0,
		 	1
		];
		return Matrix;
	}
	
	this.GetProjectionMatrix = function(ViewRect)
	{
		let Aspect = ViewRect[2] / ViewRect[3];
		
		//	lengths should be in pixels
		let FocalLengthVertical = 1.0 / Math.tan( Math.radians(this.FovVertical) / 2);
		let FocalLengthHorizontal = FocalLengthVertical / Aspect;
		
		let nf = 1 / (this.NearDistance - this.FarDistance);
		let LensCenterX = 0;
		let LensCenterY = 0;

		let Matrix = [];
		Matrix[0] = FocalLengthHorizontal;
		Matrix[1] = 0;
		Matrix[2] = LensCenterX;
		Matrix[3] = 0;
		
		Matrix[4] = 0;
		Matrix[5] = FocalLengthVertical;
		Matrix[6] = LensCenterY;
		Matrix[7] = 0;
		
		Matrix[8] = 0;
		Matrix[9] = 0;
		Matrix[10] = (this.FarDistance + this.NearDistance) * nf;
		Matrix[11] = -1;
		
		Matrix[12] = 0;
		Matrix[13] = 0;
		Matrix[14] = 2 * this.FarDistance * this.NearDistance * nf;
		Matrix[15] = 0;
		
		return Matrix;
	}
	
	function GetLookAtMatrix(eye,up,center)
	{
		var eyex = eye[0];
		var eyey = eye[1];
		var eyez = eye[2];
		var upx = up[0];
		var upy = up[1];
		var upz = up[2];
		var centerx = center[0];
		var centery = center[1];
		var centerz = center[2];
	 
		//if (Math.abs(eyex - centerx) < glMatrix.EPSILON && Math.abs(eyey - centery) < glMatrix.EPSILON && Math.abs(eyez - centerz) < glMatrix.EPSILON) {
		//	return mat4.identity(out);
		//}
	 
		let z0 = eyex - centerx;
		let z1 = eyey - centery;
		let z2 = eyez - centerz;
		
		let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
		z0 *= len;
		z1 *= len;
		z2 *= len;
		
		let x0 = upy * z2 - upz * z1;
		let x1 = upz * z0 - upx * z2;
		let x2 = upx * z1 - upy * z0;
		len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
		if (!len) {
			x0 = 0;
			x1 = 0;
			x2 = 0;
		} else {
			len = 1 / len;
			x0 *= len;
			x1 *= len;
			x2 *= len;
		}
		
		let y0 = z1 * x2 - z2 * x1;
		let y1 = z2 * x0 - z0 * x2;
		let y2 = z0 * x1 - z1 * x0;
		
		len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
		if (!len) {
			y0 = 0;
			y1 = 0;
			y2 = 0;
		} else {
			len = 1 / len;
			y0 *= len;
			y1 *= len;
			y2 *= len;
		}
		
		let out = [];
		out[0] = x0;
		out[1] = y0;
		out[2] = z0;
		out[3] = 0;
		out[4] = x1;
		out[5] = y1;
		out[6] = z1;
		out[7] = 0;
		out[8] = x2;
		out[9] = y2;
		out[10] = z2;
		out[11] = 0;
		out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
		out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
		out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
		out[15] = 1;
		
		return out;
	}
	
	//	camera's modelview transform
	this.GetWorldToCameraMatrix = function()
	{
		//	https://stackoverflow.com/questions/349050/calculating-a-lookat-matrix
		let Up = [0,1,0];
		let Forward = Math.Subtract3( this.LookAt, this.Position );
		let zaxis = Math.Normalise3( Forward );
		let Right = Math.Cross3( Up, zaxis );
		let xaxis = Math.Normalise3( Right );
		let yaxis = Math.Cross3( zaxis, xaxis );
		yaxis = Math.Normalise3( yaxis );
		
		let tx = this.Position[0];
		let ty = this.Position[1];
		let tz = this.Position[2];
		
		return GetLookAtMatrix( this.Position, Up, this.LookAt );
		
		function GetTranslationMatrix(x,y,z)
		{
			return [ 1,0,0,0,	0,1,0,0,	0,0,1,0,	x,y,z,1	];
		}
		function GetIdentityMatrix(x,y,z)
		{
			return GetTranslationMatrix(0,0,0);
		}
		
		let Translation = GetTranslationMatrix( tx, ty, tz );
		
		let Rotation =
		[
			xaxis[0], yaxis[0], zaxis[0], 0,
			xaxis[1], yaxis[1], zaxis[1], 0,
			xaxis[2], yaxis[2], zaxis[2], 0,
			0, 0, 0, 1
		];
		
		let Matrix = Math.MatrixMultiply4x4( Rotation, Translation );
		
		return Matrix;
	}
	
	this.GetLocalToWorldMatrix = function()
	{
		let WorldToCameraMatrix = this.GetWorldToCameraMatrix();
		
		//	gr; this SHOULD be inverse...
		let Matrix = Math.MatrixInverse4x4( LocalToWorld );
		//let Matrix = LocalToWorld;
		Pop.Debug("Matrix",Matrix);
		
		
		return Matrix;
	}
	
	this.GetPitchYawRollDistance = function()
	{
		//	dir from lookat to position (orbit, not first person)
		let Dir = Math.Subtract3( this.Position, this.LookAt );
		let Distance = Math.Length3( Dir );
		//Pop.Debug("Distance = ",Distance,Dir);
		Dir = Math.Normalise3( Dir );
		
		let Yaw = Math.RadToDeg( Math.atan2( Dir[0], Dir[2] ) );
		let Pitch = Math.RadToDeg( Math.asin(-Dir[1]) );
		let Roll = 0;
		
		return [Pitch,Yaw,Roll,Distance];
	}
	
	this.SetOrbit = function(Pitch,Yaw,Roll,Distance)
	{
		let Pitchr = Math.radians(Pitch);
		let Yawr = Math.radians(Yaw);
		Pop.Debug("SetOrbit()", ...arguments );
		Pop.Debug("Pitch = "+Pitch);
		
		let Deltax = Math.sin(Yawr) * Math.cos(Pitchr);
		let Deltay = -Math.sin(Pitchr);
		let Deltaz = Math.cos(Yawr) * Math.cos(Pitchr);
		Deltax *= Distance;
		Deltay *= Distance;
		Deltaz *= Distance;
		
		Pop.Debug( "SetOrbit deltas", Deltax, Deltay, Deltaz );
		this.Position[0] = this.LookAt[0] + Deltax;
		this.Position[1] = this.LookAt[1] + Deltay;
		this.Position[2] = this.LookAt[2] + Deltaz;
		
	}
	
	this.OnCameraOrbit = function(x,y,z,FirstClick)
	{
		//	remap input from xy to yaw, pitch
		let yxz = [y,-x,z];
		x = yxz[0];
		y = yxz[1];
		z = yxz[2];
		
		if ( FirstClick )
		{
			this.Start_OrbitPyrd = this.GetPitchYawRollDistance();
			//Pop.Debug("this.Start_OrbitPyrd",this.Start_OrbitPyrd);
			this.Last_OrbitPos = [x,y,z];
		}
		
		let Deltax = this.Last_OrbitPos[0] - x;
		let Deltay = this.Last_OrbitPos[1] - y;
		let Deltaz = this.Last_OrbitPos[2] - z;
	
		Deltax *= 0.1;
		Deltay *= 0.1;
		Deltaz *= 0.1;
	
		let NewPitch = this.Start_OrbitPyrd[0] + Deltax;
		let NewYaw = this.Start_OrbitPyrd[1] + Deltay;
		let NewRoll = this.Start_OrbitPyrd[2] + Deltaz;
		let NewDistance = this.Start_OrbitPyrd[3];
		
		this.SetOrbit( NewPitch, NewYaw, NewRoll, NewDistance );
	}
	
	this.OnCameraPan = function(x,y,z,FirstClick)
	{
		if ( FirstClick )
			this.LastPos_PanPos = [x,y,z];
		
		let Deltax = this.LastPos_PanPos[0] - x;
		let Deltay = this.LastPos_PanPos[1] - y;
		let Deltaz = this.LastPos_PanPos[2] - z;
		this.Position[0] += Deltax * 0.01
		this.Position[1] -= Deltay * 0.01
		this.Position[2] += Deltaz * 0.01
		
		this.LastPos_PanPos = [x,y,z];
	}
	
	this.OnCameraZoom = function(x,y,FirstClick)
	{
		Pop.Debug("OnCameraZoom deprecated, pass z to CameraPan");
		
		if ( FirstClick )
			this.LastPosZoomPos = [x,y];
		
		let Deltax = this.LastPosZoomPos[0] - x;
		let Deltay = this.LastPosZoomPos[1] - y;
		//this.Position[0] -= Deltax * 0.01
		this.Position[2] -= Deltay * 0.01
		
		this.LastPosZoomPos = [x,y];
	}
	
	
	Pop.Debug("initial pitch/yaw/roll/distance",this.GetPitchYawRollDistance());
}

