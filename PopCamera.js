
Pop.Camera = function()
{
	this.FovVertical = 45;
	
	this.Position = [ 0,2,20 ];
	this.LookAt = [ 0,0,0 ];
	
	this.NearDistance = 0.01;
	this.FarDistance = 100;
	
	//	world to pixel
	this.GetOpencvProjectionMatrix = function(ViewRect)
	{
		//	this is the projection matrix on a rectified/undistorted image
		//	3D to 2D... (seems like its backwards..)
		/*
		 Matrix[0] =
		 |fx  0 cx|
		 |0  fy cy|
		 |0  0   1|
		*/
		
		//	from calibration
		//	on 800x800 image
		let w = 363.30 * 2;
		let h = 364.19 * 2;
		let cx = 400;
		let cy = 400;
		
		/*
		//	gr: this works far better if square
		let w = ViewRect[2];
		//let h = ViewRect[3];
		let h = w;
		let cx = w/2;
		let cy = h/2;
		*/
		
		let Matrix =
		[
			w, 	0, 	cx,
		  	0,	h,	cy,
		  	0, 	0, 	1
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
	
	
	//	this generates a pos & rot matrix already multiplied together
	//	would be nice to seperate to be more readable
	function CreateLookAtMatrix(eye,up,center)
	{
		let z = Math.Subtract3( eye, center );
		z = Math.Normalise3( z );
		
		let x = Math.Cross3( up, z );
		x = Math.Normalise3( x );
		
		let y = Math.Cross3( z,x );
		y = Math.Normalise3( y );
		
		//	this is the result when multiplying rot*trans matrix
		//	(dot prod)
		let tx = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
		let ty = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
		let tz = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
		
		let out =
		[
		 x[0],	y[0],	z[0],	0,
		 x[1],	y[1],	z[1],	0,
		 x[2],	y[2],	z[2],	0,
		 tx,	ty,	tz,	1,
		 ];
		
		return out;
	}

	
	//	camera's modelview transform
	this.GetWorldToCameraMatrix = function()
	{
		//	https://stackoverflow.com/questions/349050/calculating-a-lookat-matrix
		const Up = this.GetUp();
		
		let Rotation = Math.CreateLookAtRotationMatrix( this.Position, Up, this.LookAt );
		let Trans = Math.Subtract3( [0,0,0], this.Position );
		let Translation = Math.CreateTranslationMatrix( ...Trans );
		let Matrix = Math.MatrixMultiply4x4( Rotation, Translation );
		//Pop.Debug("GetWorldToCameraMatrix", Matrix.slice(12,16) );
		return Matrix;
	}
	
	this.GetLocalToWorldMatrix = function()
	{
		let WorldToCameraMatrix = this.GetWorldToCameraMatrix();
		
		//	gr; this SHOULD be inverse...
		let Matrix = Math.MatrixInverse4x4( WorldToCameraMatrix );
		//let Matrix = LocalToWorld;
		//Pop.Debug("Matrix",Matrix);
		
		return Matrix;
	}
	
	this.GetUp = function()
	{
		//let y = Math.Cross3( z,x );
		//y = Math.Normalise3( y );
		return [0,1,0];
	}
	
	this.GetForward = function()
	{
		//	gr: this is backwards, but matches the camera matrix, erk
		let z = Math.Subtract3( this.Position, this.LookAt );
		z = Math.Normalise3( z );
		return z;
	}
	
	this.GetRight = function()
	{
		const up = this.GetUp();
		const z = this.GetForward();
		let x = Math.Cross3( up, z );
		x = Math.Normalise3( x );
		return x;
	}
	
	
	this.MoveCameraAndLookAt = function(Delta)
	{
		this.Position[0] += Delta[0];
		this.Position[1] += Delta[1];
		this.Position[2] += Delta[2];
		this.LookAt[0] += Delta[0];
		this.LookAt[1] += Delta[1];
		this.LookAt[2] += Delta[2];
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
		//Pop.Debug("SetOrbit()", ...arguments );
		//Pop.Debug("Pitch = "+Pitch);
		
		let Deltax = Math.sin(Yawr) * Math.cos(Pitchr);
		let Deltay = -Math.sin(Pitchr);
		let Deltaz = Math.cos(Yawr) * Math.cos(Pitchr);
		Deltax *= Distance;
		Deltay *= Distance;
		Deltaz *= Distance;
		
		//Pop.Debug( "SetOrbit deltas", Deltax, Deltay, Deltaz );
		this.Position[0] = this.LookAt[0] + Deltax;
		this.Position[1] = this.LookAt[1] + Deltay;
		this.Position[2] = this.LookAt[2] + Deltaz;
		
	}
	
	this.OnCameraOrbit = function(x,y,z,FirstClick)
	{
		//	remap input from xy to yaw, pitch
		let yxz = [y,x,z];
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
		//Pop.Debug("OnCameraPan", ...arguments, JSON.stringify(this));

		let Deltax = this.LastPos_PanPos[0] - x;
		let Deltay = this.LastPos_PanPos[1] - y;
		let Deltaz = this.LastPos_PanPos[2] - z;
		Deltax = Deltax * 0.01;
		Deltay = Deltay * -0.01;
		Deltaz = Deltaz * 0.01;
		let Delta = [ Deltax, Deltay, Deltaz ];
		this.MoveCameraAndLookAt( Delta );
		
		this.LastPos_PanPos = [x,y,z];
	}
	
	this.OnCameraPanLocal = function(x,y,z,FirstClick)
	{
		if ( FirstClick )
			this.LastPos_PanLocalPos = [x,y,z];
	
		let Deltax = this.LastPos_PanLocalPos[0] - x;
		let Deltay = this.LastPos_PanLocalPos[1] - y;
		let Deltaz = this.LastPos_PanLocalPos[2] - z;
		Deltax *= 0.01;
		Deltay *= -0.01;
		Deltaz *= 0.01;

		let Right3 = this.GetRight();
		Right3 = Math.Multiply3( Right3, [Deltax,Deltax,Deltax] );
		this.MoveCameraAndLookAt( Right3 );

		let Up3 = this.GetUp();
		Up3 = Math.Multiply3( Up3, [Deltay,Deltay,Deltay] );
		this.MoveCameraAndLookAt( Up3 );

		let Forward3 = this.GetForward();
		Forward3 = Math.Multiply3( Forward3, [Deltaz,Deltaz,Deltaz] );
		this.MoveCameraAndLookAt( Forward3 );

		this.LastPos_PanLocalPos = [x,y,z];
	}
	
	Pop.Debug("initial pitch/yaw/roll/distance",this.GetPitchYawRollDistance());
}

