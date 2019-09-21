function RenderTargetFrameBuffer(OpenglFrameBuffer,Viewport)
{
	this.Bind = function(OpenglContext)
	{
		OpenglContext.bindFramebuffer( OpenglContext.FRAMEBUFFER, OpenglFrameBuffer );
		
	}
	//gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
	//gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	//	bind
}



Pop.Xr = {};

//	currently webxr lets us create infinite sessions, so monitor when we have a device already created
Pop.Xr.Devices = [];

Pop.Xr.Pose = function(RenderState,Pose)
{
	this.NearDistance = RenderState.depthNear;
	this.FarDistance = RenderState.depthFar;
	this.VerticalFieldOfView = RenderState.inlineVerticalFieldOfView;

	//	gr: dunno if this is camera, projection, or what
	this.LocalToWorldMatrix = Pose.matrix;
	this.Position = [Pose.position.x,Pose.position.y,Pose.position.z,Pose.position.w];
	//Pose.orientation is xyzw, quaternion?
}

Pop.Xr.Device = function(Session,ReferenceSpace,OpenglContext)
{
	this.OnEndPromises = [];
	
	//	I think here we can re-create layers if context dies,
	//	without recreating device
	this.InitLayer = function(OpenglContext)
	{
		this.Layer = new XRWebGLLayer(Session, OpenglContext);
		Session.updateRenderState({ baseLayer: this.Layer });
	}
	
	this.WaitForEnd = function()
	{
		let Prom = {};
		function CreatePromise(Resolve,Reject)
		{
			Prom.Resolve = Resolve;
			Prom.Reject = Reject;
		}
		const OnEnd = new Promise(CreatePromise);
		OnEnd.Resolve = Prom.Resolve;
		OnEnd.Reject = Prom.Reject;
		this.OnEndPromises.push( OnEnd );
		return OnEnd;
	}
	
	this.OnSessionEnded = function()
	{
		Pop.Debug("XR session ended");
		//	notify all promises waiting for us to finish, fifo, remove as we go
		while ( this.OnEndPromises.length )
		{
			const Promise = this.OnEndPromises.shift();
			Promise.Resolve();
		}
	}
	
	this.OnFrame = function(TimeMs,Frame)
	{
		Pop.Debug("XR frame",Frame);
		//	request next frame
		Session.requestAnimationFrame( this.OnFrame.bind(this) );
		
		//	get pose in right space
		const Pose = Frame.getViewerPose(ReferenceSpace);
		
		//	don't know what to render?
		if ( !Pose )
			return;
		
		//	or this.Layer
		const glLayer = Session.renderState.baseLayer;
		//	make camera + render target and send to render
		const RenderTargets = [];
		const Cameras = [];
		
		const PushView = function(View)
		{
			//	make a Pop.RenderTarget from glLayer.glLayer.framebuffer
			//gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
			//gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			const ViewPort = glLayer.getViewport(View);
			//gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
			//	scene.draw(view.projectionMatrix, view.transform);
			const RenderTarget = new RenderTargetFrameBuffer( glLayer.framebuffer, ViewPort );
			const Camera = {};//new Pop.Camera();
			Camera.Transform = View.transform;
			Camera.ProjectionMatrix = View.projectionMatrix;
			RenderTargets.push( RenderTarget );
			Cameras.push( Camera );
		}
		Pose.views.forEach( PushView );
		this.OnRender( RenderTargets, Cameras );
	}
	
	this.Destroy = function()
	{
		Session.end();
	}

	//	overload this!
	this.OnRender = function(RenderTargets,Cameras)
	{
		RenderTargets[0].ClearColour( 0,0.5,1 );
		RenderTargets[1].ClearColour( 1,0,0 );
	}
	
	//	bind to device
	Session.addEventListener('end', this.OnSessionEnded.bind(this) );
	this.InitLayer( OpenglContext );

	//	start loop
	Session.requestAnimationFrame( this.OnFrame.bind(this) );
}

Pop.Xr.CreateDevice = async function(Window)
{
	const SessionMode = 'inline';
	const PlatformXr = navigator.xr;
	if ( !PlatformXr )
		throw "Browser doesn't support XR.";
	if ( !PlatformXr.supportsSession(SessionMode) )
		throw "Browser doesn't support XR mode (" + SessionMode + ")";
	
	//	if we have a device, wait for it to finish
	if ( Pop.Xr.Devices.length )
		await Pop.Xr.Devices[0].WaitForEnd();
	
	//	loop until we get a session
	while(true)
	{
		try
		{
			const OpenglContext = Window.GetGlContext();
			const Session = await PlatformXr.requestSession(SessionMode);
			const ReferenceSpaceType = Session.isImmersive ? 'local' : 'viewer';
			const ReferenceSpace = Session.requestReferenceSpace(ReferenceSpaceType);
			const Device = new Pop.Xr.Device( Session, ReferenceSpace, OpenglContext );
			
			//	add to our global list (currently only to make sure we have one at a time)
			Pop.Xr.Devices.push( Device );
			
			//	when device ends, remove it from the list
			const RemoveDevice = function()
			{
				Pop.Xr.Devices.remove( Device )
			}
			Device.WaitForEnd().then(RemoveDevice).catch(RemoveDevice);
			
			return Device;
		}
		catch(e)
		{
			Pop.Debug("Error creating XR session",e);
			await Pop.Yield(10*1000);
		}
	}
}

