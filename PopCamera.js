
Pop.Camera = function(CopyCamera)
{
	this.FovVertical = 45;

	this.Up = [0,1,0];
	this.Position = [ 0,2,20 ];
	this.LookAt = [ 0,0,0 ];
	this.Rotation4x4 = undefined;		//	override rotation
	this.ProjectionMatrix = undefined;	//	override projection matrix
	
	this.NearDistance = 0.01;
	this.FarDistance = 100;

	this.FocalCenter = [0,0];		//	cx & cy for projection matrix

	if ( CopyCamera instanceof Pop.Camera )
	{
		this.FovVertical = CopyCamera.FovVertical;
		this.Position = CopyCamera.Position.slice();
		this.LookAt = CopyCamera.LookAt.slice();
		this.NearDistance = CopyCamera.NearDistance;
		this.FarDistance = CopyCamera.FarDistance;
		this.Rotation4x4 = CopyCamera.Rotation4x4;
	}

	
	
	this.FieldOfViewToFocalLengths = function(FovHorz,FovVert)
	{
		let fx = 363.30 * 2;
		let s = 0;
		let fy = 364.19 * 2;
		let cx = 400;
		let cy = 400;
		
		//	lengths should be in pixels?
		let Width = 1;
		let Height = 1;
		let FocalLengthHorz = Width / Math.tan( Math.radians(FovHorz) / 2);
		let FocalLengthVert = Height / Math.tan( Math.radians(FovVert) / 2);
		Pop.Debug('FocalLengthVert',FocalLengthVert,'FocalLengthHorz',FocalLengthHorz);
		//^^^ FocalLengthHorz=1.816739344621
		
		//	needs to convert to -1...1?
		//	or 0..1
		//	https://strawlab.org/2011/11/05/augmented-reality-with-OpenGL
		let ImW = 800;
		let ImH = 800;
		let x0 = 0;	//	image center in...opengl?
		let y0 = 0;	//	image center in...opengl?
		FocalLengthHorz = 2 * fx / ImW;	//	2*K00/width
		let GL_s = -2 * s /ImW;			//	-2*K01/width
		let LensCenterX = (ImW - 2 * cx + 2 * x0)/ImW;	//	(width - 2*K02 + 2*x0)/width
		//	0
		let Flip = 1;	//	-1 to flip
		FocalLengthVert = (Flip*2) * fy / ImH;	//	-2*K11/height
		let LensCenterY = ((ImH*Flip) - 2 * (Flip*cy) + 2*y0)/ImH;	//	(height - 2*K12 + 2*y0)/height
		Pop.Debug('FocalLengthVert',FocalLengthVert,'FocalLengthHorz',FocalLengthHorz);
		
		let Focal = {};
		Focal.fx = FocalLengthHorz;
		Focal.fy = FocalLengthVert;
		Focal.cx = LensCenterX;
		Focal.cy = LensCenterY;
		return Focal;
	}
	
	this.FocalLengthsToFieldOfView = function(fx,fy,cx,cy,ImageWidth,ImageHeight)
	{
		let FovHorizontal = Math.RadToDeg( 2 * Math.atan( ImageWidth / (2*fx) ) );
		let FovVertical = Math.RadToDeg( 2 * Math.atan( ImageHeight / (2*fy) ) );
		let Fov = {};
		Fov.Horz = FovHorizontal;
		Fov.Vert = FovVertical;
		return Fov;
	}
	
	this.GetFieldOfView = function(ViewRect)
	{
		let Fov = {};
		let Aspect = ViewRect[2] / ViewRect[3];
		Fov.Horz = this.FovVertical / Aspect;
		Fov.Vert = this.FovVertical;
		return Fov;
	}
	
	this.GetPixelFocalLengths = function(ViewRect)
	{
		/*
		let UseFov = true;
		
		if ( UseFov )
		{
			let Fov = this.GetFieldOfView();
		}
		*/
		let Focal = {};
		//	from calibration on 800x800 image
		Focal.fx = 363.30 * 2;
		Focal.fy = 364.19 * 2;
		Focal.cx = 400;
		Focal.cy = 400;
		Focal.s = 0;
		
		return Focal;
	}
	
	this.PixelToOpenglFocalLengths = function(PixelFocals,ImageSize)
	{
		//	https://strawlab.org/2011/11/05/augmented-reality-with-OpenGL
		//	convert pixel focal projection to opengl projection frustum
		let s = 0;
		let ImW = ImageSize[0];
		let ImH = ImageSize[1];
		
		
		let x0 = 0;	//	image center in...opengl?
		let y0 = 0;	//	image center in...opengl?
		let FocalLengthHorz = 2 * PixelFocals.fx / ImW;	//	2*K00/width
		let GL_s = -2 * s /ImW;			//	-2*K01/width
		let LensCenterX = (ImW - 2 * PixelFocals.cx + 2 * x0)/ImW;	//	(width - 2*K02 + 2*x0)/width
		//	0
		let Flip = 1;	//	-1 to flip
		let FocalLengthVert = (Flip*2) * PixelFocals.fy / ImH;	//	-2*K11/height
		let LensCenterY = ((ImH*Flip) - 2 * (Flip*PixelFocals.cy) + 2*y0)/ImH;	//	(height - 2*K12 + 2*y0)/height
		//Pop.Debug('FocalLengthVert',FocalLengthVert,'FocalLengthHorz',FocalLengthHorz);
		
		const OpenglFocal = {};
		OpenglFocal.fx = FocalLengthHorz;
		OpenglFocal.fy = FocalLengthVert;
		OpenglFocal.cx = LensCenterX;
		OpenglFocal.cy = LensCenterY;
		OpenglFocal.s = GL_s;
		
		return OpenglFocal;
	}
	
	this.GetOpenglFocalLengths = function(ViewRect)
	{
		/*
		const Focal = this.GetPixelFocalLengths();
		//	image size from calibrated focal lengths
		const ImageWidth = 800;
		const ImageHeight = 800;
		const OpenglFocal = this.PixelToOpenglFocalLengths( Focal, [ImageWidth, ImageHeight] );
		*/
		
		const Aspect = ViewRect[2] / ViewRect[3];
		const FovVertical = this.FovVertical;
		//const FovHorizontal = FovVertical * Aspect;
		
		const OpenglFocal = {};
		OpenglFocal.fy = 1.0 / Math.tan( Math.radians(FovVertical) / 2);
		//OpenglFocal.fx = 1.0 / Math.tan( Math.radians(FovHorizontal) / 2);
		OpenglFocal.fx = OpenglFocal.fy / Aspect;
		OpenglFocal.cx = this.FocalCenter[0];
		OpenglFocal.cy = this.FocalCenter[1];
		OpenglFocal.s = 0;
		return OpenglFocal;
	}
	
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
		
		//	from calibration on 800x800 image
		const Focal = this.GetPixelFocalLengths();
		
		let Matrix =
		[
			Focal.fx, 	Focal.s,	Focal.cx,
		  	0,			Focal.fy,	Focal.cy,
		  	0, 			0, 			1
		];
		/*	test unconvert
		let w = ViewRect[2];
		let h = ViewRect[3];
		
		let Fov = this.FocalLengthsToFieldOfView( fx, fy, cx, cy, w, h );
		//let FovHorizontal = Math.RadToDeg( 2 * Math.atan( w / (2*fx) ) );
		//let FovVertical = Math.RadToDeg( 2 * Math.atan( h / (2*fy) ) );
		Pop.Debug('opencv camera','FovHorizontal',Fov.Horz,'FovVertical',Fov.Vert);
		
		//let FocalLengthHorz = w / Math.tan( Math.radians(FovHorizontal) / 2) / 2;
		//Pop.Debug("fx",fx,"...",FocalLengthHorz);
		*/
		return Matrix;
	}
	
	//	GetOpencvProjectionMatrix but 4x4 with z correction for near/far
	this.GetProjectionMatrix = function(ViewRect)
	{
		//	overriding user-provided matrix
		if ( this.ProjectionMatrix )
			return this.ProjectionMatrix;
		
		const OpenglFocal = this.GetOpenglFocalLengths( ViewRect );
		
		let Matrix = [];
		Matrix[0] = OpenglFocal.fx;
		Matrix[1] = OpenglFocal.s;
		Matrix[2] = OpenglFocal.cx;
		Matrix[3] = 0;
		
		Matrix[4] = 0;
		Matrix[5] = OpenglFocal.fy;
		Matrix[6] = OpenglFocal.cy;
		Matrix[7] = 0;
		
		const Far = this.FarDistance;
		const Near = this.NearDistance;
		
		//	near...far in opengl needs to resovle to -1...1
		//	gr: glDepthRange suggests programmable opengl pipeline is 0...1
		//		not sure about this, but matrix has changed below so 1 is forward on z
		//		which means we can now match the opencv pose (roll is wrong though!)
		//	http://ogldev.atspace.co.uk/www/tutorial12/tutorial12.html
		Matrix[8] = 0;
		Matrix[9] = 0;
		Matrix[10] = (-Near-Far) / (Near-Far);
		Matrix[11] = 1;
		
		Matrix[12] = 0;
		Matrix[13] = 0;
		Matrix[14] = (2*Far*Near) / (Near-Far);
		Matrix[15] = 0;
		
		return Matrix;
	}
	
	
	this.SetLocalRotationMatrix = function(Rotation4x4)
	{
		if ( Rotation4x4.length != 4*4 )
			throw "SetLocalRotationMatrix() matrix is not 4x4: " + JSON.stringify(Rotation4x4);
		
		this.Rotation4x4 = Rotation4x4.slice();
	}
	
	this.GetLocalRotationMatrix = function()
	{
		if ( this.Rotation4x4 )
			return this.Rotation4x4;
		
		//	allow user to override here with a rotation matrix
		const Up = this.GetUp();
		const Mtx = Math.CreateLookAtRotationMatrix( this.Position, Up, this.LookAt );
		return Mtx;
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
		
		let Rotation = this.GetLocalRotationMatrix();
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
	
	this.GetWorldToFrustumTransform = function(ViewRect=[-1,-1,1,1])
	{
		const CameraToFrustum = this.GetProjectionMatrix( ViewRect );
		const WorldToCamera = this.GetWorldToCameraMatrix();
		const WorldToFrustum = Math.MatrixMultiply4x4( CameraToFrustum, WorldToCamera );
		return WorldToFrustum;
	}
	
	//	this gets a transform, which when applied to a cube of -1..1,-1..1,-1..1
	//	will skew the cube into a representation of the view frustum in world space
	this.GetLocalToWorldFrustumTransformMatrix = function(ViewRect=[-1,-1,1,1])
	{
		//	todo: correct viewrect with aspect ratio of viewport
		//		maybe change input to Viewport to match GetProjection matrix?
		let Matrix = this.GetProjectionMatrix( ViewRect );
		Matrix = Math.MatrixInverse4x4( Matrix );
		//	put into world space
		Matrix = Math.MatrixMultiply4x4( this.GetLocalToWorldMatrix(), Matrix );
		return Matrix;
	}
	
	this.GetUp = function()
	{
		//let y = Math.Cross3( z,x );
		//y = Math.Normalise3( y );
		return this.Up.slice();
	}
	
	this.GetForward = function()
	{
		//	gr: this is backwards, but matches the camera matrix, erk
		let z = Math.Subtract3( this.LookAt, this.Position );
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
		
		if ( FirstClick || !this.Last_OrbitPos )
		{
			this.Start_OrbitPyrd = this.GetPitchYawRollDistance();
			//Pop.Debug("this.Start_OrbitPyrd",this.Start_OrbitPyrd);
			this.Last_OrbitPos = [x,y,z];
		}
		
		let Deltax = this.Last_OrbitPos[0] - x;
		let Deltay = this.Last_OrbitPos[1] - y;
		let Deltaz = this.Last_OrbitPos[2] - z;
	
		Deltax *= 0.1;
		Deltay *= -0.1;
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
		if ( FirstClick || !this.LastPos_PanLocalPos )
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
	
	//Pop.Debug("initial pitch/yaw/roll/distance",this.GetPitchYawRollDistance());
}

