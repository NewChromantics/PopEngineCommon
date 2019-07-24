
Pop.Camera = function()
{
	this.FovVertical = 45;
	
	this.Position = [ 0,0.5,1 ];
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
	
	
	this.OnCameraPan = function(x,y,FirstClick)
	{
		if ( FirstClick )
			this.LastPanPos = [x,y];
		
		let Deltax = this.LastPanPos[0] - x;
		let Deltay = this.LastPanPos[1] - y;
		this.Position[0] += Deltax * 0.01
		this.Position[1] -= Deltay * 0.01
		
		this.LastPanPos = [x,y];
	}
	
	this.OnCameraZoom = function(x,y,FirstClick)
	{
		if ( FirstClick )
			this.LastZoomPos = [x,y];
		
		let Deltax = this.LastZoomPos[0] - x;
		let Deltay = this.LastZoomPos[1] - y;
		//this.Position[0] -= Deltax * 0.01
		this.Position[2] -= Deltay * 0.01
		
		this.LastZoomPos = [x,y];
	}
	
}

