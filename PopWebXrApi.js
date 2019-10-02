function RenderTargetFrameBufferProxy(OpenglFrameBuffer,Viewport,RenderContext)
{
	Pop.Opengl.RenderTarget.call( this );
	
	this.GetFrameBuffer = function()
	{
		return OpenglFrameBuffer;
	}
	
	this.GetRenderContext = function()
	{
		return RenderContext;
	}
	
	this.GetRenderTargetRect = function()
	{
		let Rect = [Viewport.x,Viewport.y,Viewport.width,Viewport.height];
		return Rect;
	}
	
	this.BindRenderTarget = function(RenderContext)
	{
		const gl = RenderContext.GetGlContext();
		const FrameBuffer = this.GetFrameBuffer();
	
		//	todo: make this common code
		gl.bindFramebuffer( gl.FRAMEBUFFER, FrameBuffer );
		
		const Viewport = this.GetRenderTargetRect();
		gl.viewport( ...Viewport );
		gl.scissor( ...Viewport );
		
		this.ResetState();
	}
}


Pop.Xr = {};

//	currently webxr lets us create infinite sessions, so monitor when we have a device already created
Pop.Xr.Devices = [];

Pop.Xr.SupportedSessionMode = null;

Pop.Xr.IsSupported = function()
{
	const PlatformXr = navigator.xr;
	if ( !PlatformXr )
		return false;
	
	//	check session mode support
	//	this replaces this function with true/fa
	return Pop.Xr.SupportedSessionMode != false;
}

Pop.Xr.GetSupportedSessionMode = async function()
{
	const PlatformXr = navigator.xr;
	if ( !PlatformXr )
		return false;
	
	//	mozilla XR emulator has supportsSession
	//	proper spec is isSessionSupported
	if ( !PlatformXr.isSessionSupported && !PlatformXr.supportsSession )
		throw "XR platform missing isSessionSupported and supportsSession";
	if ( !PlatformXr.isSessionSupported )
	{
		//	make a wrapper
		PlatformXr.isSessionSupported = async function(SessionType)
		{
			//	sessionSupported throws if not supported
			try
			{
				await PlatformXr.supportsSession( SessionType );
				return true;
			}
			catch(e)
			{
				return false;
			}
		}
	}
	
	try
	{
		const Supported = await PlatformXr.isSessionSupported('immersive-vr');
		if (!Supported)
			throw Supported;
		return 'immersive-vr';
	}
	catch(e)
	{
		Pop.Debug("Browser doesn't support immersive-vr",e);
	}
	
	try
	{
		const Supported = await PlatformXr.isSessionSupported('inline');
		if (!Supported)
			throw Supported;
		return 'inline';
	}
	catch(e)
	{
		Pop.Debug("Browser doesn't support inline",e);
	}
	
	return false;
}

//	setup cache of support for synchronous call
Pop.Xr.GetSupportedSessionMode().then( Mode => Pop.Xr.SupportedSessionMode=Mode ).catch( Pop.Debug );



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

Pop.Xr.Device = function(Session,ReferenceSpace,RenderContext)
{
	this.OnEndPromises = [];
	
	//	I think here we can re-create layers if context dies,
	//	without recreating device
	this.InitLayer = function(RenderContext)
	{
		const OpenglContext = RenderContext.GetGlContext();
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
		//Pop.Debug("XR frame",Frame);
		//	request next frame
		Session.requestAnimationFrame( this.OnFrame.bind(this) );
		
		//	get pose in right space
		const Pose = Frame.getViewerPose(ReferenceSpace);
		
		//	don't know what to render?
		if ( !Pose )
			return;
		
		//	or this.Layer
		const glLayer = Session.renderState.baseLayer;
		
		const RenderView = function(View)
		{
			const ViewPort = glLayer.getViewport(View);
			//	scene.draw(view.projectionMatrix, view.transform);
			const RenderTarget = new RenderTargetFrameBufferProxy( glLayer.framebuffer, ViewPort, RenderContext );
			const Camera = {};//new Pop.Camera();
			Camera.Transform = View.transform;
			Camera.ProjectionMatrix = View.projectionMatrix;
			if (typeof View.eye == 'string')
			{
				Camera.Name = View.eye;
			}
			else if (typeof View.eye == 'number')
			{
				const EyeNames = ['Left', 'Right'];
				Camera.Name = EyeNames[View.eye];
			}
			else
			{
				Camera.Name = View.eye;
			}
			RenderTarget.BindRenderTarget( RenderContext );
			this.OnRender( RenderTarget, Camera );
		}
		Pose.views.forEach( RenderView.bind(this) );
	}
	
	this.Destroy = function()
	{
		Session.end();
	}

	//	overload this!
	this.OnRender = function(RenderTarget,Camera)
	{
		if ( Camera.Name == 'Left' )
			RenderTarget.ClearColour( 0,0.5,1 );
		else if (Camera.Name == 'Right')
			RenderTarget.ClearColour(1, 0, 0);
		else if (Camera.Name == 'none')
			RenderTarget.ClearColour(0, 1, 0);
		else
			RenderTarget.ClearColour( 0,0,1 );
	}
	
	//	bind to device
	Session.addEventListener('end', this.OnSessionEnded.bind(this) );
	this.InitLayer( RenderContext );

	//	start loop
	Session.requestAnimationFrame( this.OnFrame.bind(this) );
}


Pop.Xr.CreateDevice = async function(RenderContext)
{
	const SessionMode = await Pop.Xr.GetSupportedSessionMode();
	if ( SessionMode == false )
		throw "Browser doesn't support XR.";
	
	//	if we have a device, wait for it to finish
	if ( Pop.Xr.Devices.length )
		await Pop.Xr.Devices[0].WaitForEnd();

	const PlatformXr = navigator.xr;

	//	loop until we get a session
	while(true)
	{
		try
		{
			const Session = await PlatformXr.requestSession(SessionMode);
			const ReferenceSpaceType = Session.isImmersive ? 'local' : 'viewer';
			const ReferenceSpace = await Session.requestReferenceSpace(ReferenceSpaceType);
			const Device = new Pop.Xr.Device( Session, ReferenceSpace, RenderContext );
			
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

