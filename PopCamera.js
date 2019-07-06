
Pop.Camera = function()
{
	this.FovVertical = 45;
	this.Position = [ 0,0.2,1 ];
	this.LookAt = [ 0,0,0 ];
	this.NearDistance = 0.01;
	this.FarDistance = 100;
	
	this.GetProjectionMatrix = function(ViewRect)
	{
		let Aspect = ViewRect[2] / ViewRect[3];
		
		let f = 1.0 / Math.tan( Math.radians(this.FovVertical) / 2);
		let nf = 1 / (this.NearDistance - this.FarDistance);
		
		let Matrix = [];
		Matrix[0] = f / Aspect;
		Matrix[1] = 0;
		Matrix[2] = 0;
		Matrix[3] = 0;
		Matrix[4] = 0;
		Matrix[5] = f;
		Matrix[6] = 0;
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

