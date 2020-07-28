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
	//	in chromium (usually) navigator.xr is only availible under secure connections
	//	but accessible from localhost. To enable use of this, use chromium
	//	remote inspctor to portforward $PORT to devmachine:$PORT then
	//	browse to localhost:$PORT
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

function IsReferenceSpaceOriginFloor(ReferenceSpaceType)
{
	switch( ReferenceSpaceType )
	{
		case 'local-floor':
			return true;
			
		default:
			return false;
	}
}



Pop.Xr.Device = class
{
	constructor(Session,ReferenceSpace,RenderContext)
	{
		this.OnEndPromises = [];
		this.Cameras = {};
		this.Session = Session;
		this.ReferenceSpace = ReferenceSpace;
		this.RenderContext = RenderContext;
		
		//	overload this
		this.OnRender = this.OnRender_Default.bind(this);

		//	overload these! (also, name it better, currently matching window/touches)
		this.OnMouseDown = this.OnMouseEvent_Default.bind(this);
		this.OnMouseMove = this.OnMouseEvent_Default.bind(this);
		this.OnMouseUp = this.OnMouseEvent_Default.bind(this);
		
		//	bind to device
		Session.addEventListener('end', this.OnSessionEnded.bind(this) );
		this.InitLayer( RenderContext );
		
		//	start loop
		Session.requestAnimationFrame( this.OnFrame.bind(this) );
	}
	
	//	I think here we can re-create layers if context dies,
	//	without recreating device
	InitLayer(RenderContext)
	{
		const OpenglContext = this.RenderContext.GetGlContext();
		this.Layer = new XRWebGLLayer(this.Session, OpenglContext);
		this.Session.updateRenderState({ baseLayer: this.Layer });
	}
	
	WaitForEnd()
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
	
	OnSessionEnded()
	{
		Pop.Debug("XR session ended");
		//	notify all promises waiting for us to finish, fifo, remove as we go
		while ( this.OnEndPromises.length )
		{
			const Promise = this.OnEndPromises.shift();
			Promise.Resolve();
		}
	}
	
	GetCamera(Name)
	{
		if ( !this.Cameras.hasOwnProperty(Name) )
		{
			this.Cameras[Name] = new Pop.Camera();
			this.Cameras[Name].Name = Name;
		}
		return this.Cameras[Name];
	}
	
	OnFrame(TimeMs,Frame)
	{
		//Pop.Debug("XR frame",Frame);
		//	request next frame
		this.Session.requestAnimationFrame( this.OnFrame.bind(this) );
		
		//	get pose in right space
		const Pose = Frame.getViewerPose(this.ReferenceSpace);
		
		//	don't know what to render?
		if ( !Pose )
		{
			Pop.Warning(`XR no pose`,Pose);
			return;
		}
		
		const IsOriginFloor = IsReferenceSpaceOriginFloor(this.ReferenceSpace.Type);
		
		//	handle inputs
		//	gr: we're propogating like a mousebutton for integration, but our Openvr api
		//		has keyframed input structs per-controller/pose
		const Inputs = Array.from(Frame.session.inputSources);
		function UpdateInput(Input)
		{
			try
			{
				if (Input.hand!==null)
				{
					Pop.Debug(`Input has hand! ${JSON.stringify(Input.hand)}`,Input.hand);
				}

				if (!Input.gamepad)
					return;

				if (!Input.gamepad.connected)
					return;
				//	quest:
				//	Input.gamepad.id = ""
				//	Input.gamepad.index = -1
				const InputRayPose = Frame.getPose(Input.targetRaySpace,this.ReferenceSpace);
				//	quest hand-tracking has null pose when out of view
				if (!InputRayPose)
				{
					//	gr: should have a un-tracked state/event? at least a mouse up
					return;
				}
				const Position = [InputRayPose.transform.position.x,InputRayPose.transform.position.y,InputRayPose.transform.position.z];
				const RotationQuat = InputRayPose.transform.orientation;

				//	gr: this input name is not unique enough yet
				const InputName = Input.handedness;

				//	todo: we need to store this for mouse up!
				let DownCount = 0;
				function UpdateButton(GamepadButton,ButtonIndex)
				{
					//	gr: we're not doing anything with .touched
					const Down = GamepadButton.pressed;
					DownCount += Down ? 1 : 0;
					if ( Down )
						this.OnMouseMove(Position,ButtonIndex,InputName);
				}
				if ( Input.gamepad.buttons )
					Input.gamepad.buttons.forEach(UpdateButton.bind(this));
				
				//	if none down, pass a mouse move with no button
				if ( DownCount == 0 )
					this.OnMouseMove(Position,Pop.SoyMouseButton.None,InputName);
				//	todo: mouse up!
			}
			catch(e)
			{
				Pop.Debug(`Input error ${e}`);
			}
		}
		Inputs.forEach(UpdateInput.bind(this));
		
		//	or this.Layer
		const glLayer = this.Session.renderState.baseLayer;
		
		function GetCameraName(View)
		{
			//	different names from different browsers
			if (typeof View.eye == 'string')
				return View.eye.toLowerCase();
			
			if (typeof View.eye == 'number')
			{
				const EyeNames = ['left', 'right'];
				return EyeNames[View.eye];
			}

			Pop.Debug(`Improperly handled View.eye=${View.eye}(${typeof View.eye})`);
			return View.eye;
		}
		
		const RenderView = function(View)
		{
			const ViewPort = glLayer.getViewport(View);
			//	scene.draw(view.projectionMatrix, view.transform);
			const RenderTarget = new RenderTargetFrameBufferProxy( glLayer.framebuffer, ViewPort, this.RenderContext );
			
			const CameraName = GetCameraName(View);
			const Camera = this.GetCamera(CameraName);
			
			Camera.IsOriginFloor = IsOriginFloor;

			//	update camera
			//	view has an XRRigidTransform (quest)
			//	https://developer.mozilla.org/en-US/docs/Web/API/XRRigidTransform
			Camera.Transform = View.transform;	//	stored for debugging
			
			//	write position (w should always be 0
			Camera.Position = [View.transform.position.x,View.transform.position.y,View.transform.position.z];

			//	transform.matrix is column major
			//	get rotation but remove the translation (so we use .Position)
			Camera.Rotation4x4 = Pop.Math.GetMatrixTransposed(View.transform.matrix);
			Math.SetMatrixTranslation(Camera.Rotation4x4,0,0,0,1);
			
			Camera.ProjectionMatrix = View.projectionMatrix;
			RenderTarget.BindRenderTarget( this.RenderContext );
			this.OnRender( RenderTarget, Camera );
		}
		Pose.views.forEach( RenderView.bind(this) );
	}
	
	Destroy()
	{
		this.Session.end();
	}

	//	overload this!
	OnRender_Default(RenderTarget,Camera)
	{
		if ( Camera.Name == 'left' )
			RenderTarget.ClearColour( 0,0.5,1 );
		else if (Camera.Name == 'right')
			RenderTarget.ClearColour(1, 0, 0);
		else if (Camera.Name == 'none')
			RenderTarget.ClearColour(0, 1, 0);
		else
			RenderTarget.ClearColour( 0,0,1 );
	}
	
	OnMouseEvent_Default(xyz,Button,Controller)
	{
		Pop.Debug(`OnXRInput(${[...arguments]})`);
	}
}


Pop.Xr.CreateDevice = async function(RenderContext,OnWaitForCallback)
{
	if ( !OnWaitForCallback )
		throw `Pop.Xr.CreateDevice requires OnUserCallback callback for 2nd argument`;
	
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
			//	this will cause a dom exception if there's more than one async queue
			//	so we create a callback, that a callback can call when the user clicks a button
			//const Session = await PlatformXr.requestSession(SessionMode);
			const SessionPromise = Pop.CreatePromise();
			const Callback = function()
			{
				//	gr: could use a generic callback like the audio system does
				//	this should be called from user interaction, so we start,
				//	and return that promise
				try
				{
					const Options = {};
					//	gr: this should request for permission for the extra functionality
					//	https://immersive-web.github.io/webxr/#dictdef-xrsessioninit
					//Options.requiredFeatures: ['local-floor'];	
					Options.optionalFeatures: ['local-floor'];	
						
					const RequestSessionPromise = PlatformXr.requestSession(SessionMode,Options);
					RequestSessionPromise.then( Session => SessionPromise.Resolve(Session) ).catch( e => SessionPromise.Reject(e) );
				}
				catch(e)
				{
					SessionPromise.Reject(e);
				}
			}
			OnWaitForCallback(Callback);
			const Session = await SessionPromise;
			
			//	gr: isImmersive was deprecated
			//		we want a local space, maybe not relative to the floor?
			//		so we can align with other remote spaces a bit more easily
			//	try and get reference space types in an ideal order
			const ReferenceSpaceTypes =
			[
				'bounded-floor',	//	expecting player to not move out of this space. bounds geometry returned, y=0=floor
				'local-floor',		//	y=0=floor
				'local',			//	origin = view starting pos
				'unbounded',		//	gr: where is origin?
			 	'viewer',
			];
			async function GetReferenceSpace()
			{
				for ( let ReferenceSpaceType of ReferenceSpaceTypes )
				{
					try
					{
						const ReferenceSpace = await Session.requestReferenceSpace(ReferenceSpaceType);
						ReferenceSpace.Type = ReferenceSpaceType;
						return ReferenceSpace;
					}
					catch(e)
					{
						Pop.Warning(`XR ReferenceSpace type ${ReferenceSpaceType} not supported.`);
					}
				}
				throw `Failed to find supported XR reference space`;
			}
			const ReferenceSpace = await GetReferenceSpace();
			Pop.Debug(`Got XR ReferenceSpace`,ReferenceSpace);
			const Device = new Pop.Xr.Device( Session, ReferenceSpace, RenderContext );
			
			//	add to our global list (currently only to make sure we have one at a time)
			Pop.Xr.Devices.push( Device );
			
			//	when device ends, remove it from the list
			const RemoveDevice = function()
			{
				Pop.Xr.Devices = Pop.Xr.Devices.filter( d => d!=Device );
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

