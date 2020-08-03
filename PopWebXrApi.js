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


function IsReferenceSpaceOriginFloor(ReferenceSpaceType)
{
	switch( ReferenceSpaceType )
	{
		case 'local-floor':
		case 'bounded-floor':
			return true;
			
		default:
			return false;
	}
}

//	this will probably merge with the native input state structs,
//	but for now we're using it to track input state changes
class XrInputState
{
	constructor()
	{
		this.Buttons = [];		//	[Name] = true/false/pressure
		this.Position = null;	//	[xyz] or false if we lost tracking
		this.Transform = null;	//	for now, saving .position .quaternion .matrix
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
		
		this.InputStates = {};	//	[Name] = XrInputState
		
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
	
	UpdateInputState(InputName,Pose,Buttons)
	{
		//	new state!
		if ( !this.InputStates.hasOwnProperty(InputName) )
		{
			//	new state!
			this.InputStates[InputName] = new XrInputState();
			Pop.Debug(`New input! ${InputName}`);
		}
		const State = this.InputStates[InputName];
		
		//	if no pose, no longer tracking
		if ( !Pose )
		{
			if ( State.Position )
				Pop.Debug(`${InputName} lost tracking`);
			State.Position = false;
			State.Transform = false;
		}
		else
		{
			if ( !State.Position )
				Pop.Debug(`${InputName} now tracking`);
			
			const Position = [Pose.transform.position.x,Pose.transform.position.y,Pose.transform.position.z];
			const RotationQuat = Pose.transform.orientation;
			State.Position = Position;
			State.Transform = Pose.transform;
		}
		
		//	work out new button states & any changes
		//	gr: here, if not tracking, we may want to skip any changes
		const ButtonCount = Math.max(State.Buttons.length,Buttons.length);
		const NewButtonState = [];
		let ButtonChangedCount = 0;
		for ( let b=0;	b<ButtonCount;	b++ )
		{
			//	currently the button is either a button object(.pressed .touched) or a bool, or nothing
			const FrameButton = Buttons[b];
			const Old = (b < State.Buttons.length) ? State.Buttons[b] : undefined;
			const New = (FrameButton && FrameButton.pressed) || (FrameButton===true);
			const ButtonName = b;
			
			if ( !Old && New )
			{
				ButtonChangedCount++;
				this.OnMouseDown(State.Position,ButtonName,InputName, State.Transform );
			}
			else if ( Old && !New )
			{
				ButtonChangedCount++;
				this.OnMouseUp(State.Position,ButtonName,InputName, State.Transform );
			}
			NewButtonState.push(New);
		}

		State.Buttons = NewButtonState;
		
		//	if no button changes, we still want to register a controller move with no button
		if ( ButtonChangedCount == 0 )
			this.OnMouseMove( State.Position, Pop.SoyMouseButton.None, InputName, State.Transform );
	}
	
	OnFrame(TimeMs,Frame)
	{
		//	gr: need a better fix here.
		//	https://github.com/immersive-web/webxr/issues/225
		//		when XR is active, and the 2D window is NOT active
		//		the window.requestAnimationFrame is not fired, so we
		//		continue the generic Pop API animation from here
		//	I imagine there is some situation where both are firing and we're
		//	getting double the updates... need to figure that out
		//	gr: problem here? we're rendering before the frame as we queue up an
		//		update...
		//	maybe Session.requestAnimationFrame should also trigger Pop.WebApi.BrowserAnimationStep itself?
		const ProxyWindowAnimation = true;
		if ( ProxyWindowAnimation )
		{
			//	clear old frames so we don't get a backlog
			Pop.WebApi.AnimationFramePromiseQueue.ClearQueue();
			Pop.WebApi.AnimationFramePromiseQueue.Push(TimeMs);
		}
		
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
		const FrameInputs = Array.from(Frame.session.inputSources);
		
		const UpdateInputNode = function(InputXrSpace,InputName,Buttons)
		{
			//	get the pose
			const InputPose = InputXrSpace ? Frame.getPose(InputXrSpace,this.ReferenceSpace) : null;
			this.UpdateInputState(InputName,InputPose,Buttons);
		}.bind(this);
		
		//	track which inputs we updated, so we can update old inputs that have gone missing
		const UpdatedInputNames = [];
		function UpdateInput(Input)
		{
			try
			{
				//	gr: this input name is not unique enough yet!
				const InputName = Input.handedness;

				//	treat joints as individual inputs as they all have their own pos
				if (Input.hand!==null)
				{
					const ThumbToJointMaxDistance = 0.03;
					//	for hands, if a finger tip touches the thumb tip, its a button press
					const ThumbKey = XRHand.THUMB_PHALANX_TIP;
					const FingerKeys =
					[
					 XRHand.INDEX_PHALANX_TIP,XRHand.MIDDLE_PHALANX_TIP,XRHand.RING_PHALANX_TIP,XRHand.LITTLE_PHALANX_TIP,
					 XRHand.INDEX_PHALANX_DISTAL,XRHand.MIDDLE_PHALANX_DISTAL,XRHand.RING_PHALANX_DISTAL,XRHand.LITTLE_PHALANX_DISTAL,
					 XRHand.INDEX_PHALANX_INTERMEDIATE,XRHand.MIDDLE_PHALANX_INTERMEDIATE,XRHand.RING_PHALANX_INTERMEDIATE,XRHand.LITTLE_PHALANX_INTERMEDIATE,
					 ];
					const ReferenceSpace = this.ReferenceSpace;
					
					//	we're duplicating work here
					function GetJointPos(Key)
					{
						const XrSpace = Input.hand[Key];
						const Pose = XrSpace ? Frame.getPose(XrSpace,ReferenceSpace) : null;
						const Position = Pose ? [Pose.transform.position.x,Pose.transform.position.y,Pose.transform.position.z] : null;
						return Position;
					}
					function IsTipCloseToThumb(Key)
					{
						if ( !ThumbPos )
							return false;
						const FingerPos = GetJointPos(Key);
						if ( !FingerPos )
							return false;
						const Distance = Math.Distance3(ThumbPos,FingerPos);
						return Distance <= ThumbToJointMaxDistance;
					}
					const ThumbPos = GetJointPos(ThumbKey);
					const FingersNear = FingerKeys.map(IsTipCloseToThumb);
					
					
					//	enum all the joints
					const JointNames = Object.keys(XRHand);
					function EnumJoint(JointName)
					{
						const Key = XRHand[JointName];	//	XRHand.WRIST = int = key for .hand
						const PoseSpace = Input.hand[Key];
						const NodeName = `${InputName}_${JointName}`;
						const Buttons = [];
						const FingerNearThumbIndex = FingerKeys.indexOf(Key);
						if ( FingerNearThumbIndex != -1 )
							Buttons.push(FingersNear[FingerNearThumbIndex]);
						UpdatedInputNames.push(NodeName);
						UpdateInputNode(PoseSpace,NodeName,Buttons);
					}
					JointNames.forEach(EnumJoint.bind(this));
					//Pop.Debug(`Input has hand! ${JSON.stringify(Input.hand)}`,Input.hand);
				}

				//	normal controller
				if ( Input.gamepad )
				{
					if (!Input.gamepad.connected)
						return;
				
					UpdatedInputNames.push(InputName);
					const Buttons = Input.gamepad.buttons || [];
					UpdateInputNode( Input.targetRaySpace, InputName, Buttons );
				}
			}
			catch(e)
			{
				Pop.Debug(`Input error ${e}`);
			}
		}
		FrameInputs.forEach(UpdateInput.bind(this));
		
		const OldInputNames = Object.keys(this.InputStates);
		const MissingInputNames = OldInputNames.filter( Name => !UpdatedInputNames.some( uin => uin == Name) );
		MissingInputNames.forEach( Name => UpdateInputNode(null,Name,[]) );
		
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
			
			//	maybe need a better place to propogate this info (along with chaperone/bounds)
			//	but for now renderer just needs to know (but input doesnt know!)
			Camera.IsOriginFloor = IsOriginFloor;

			//	use the render params on our camera
			if ( Frame.session.renderState )
			{
				Camera.NearDistance = Frame.session.renderState.depthNear || Camera.NearDistance;
				Camera.FarDistance = Frame.session.renderState.depthFar || Camera.FarDistance;
				Camera.FovVertical = Frame.session.renderState.inlineVerticalFieldOfView || Camera.FovVertical;
			}
			
			//	update camera
			//	view has an XRRigidTransform (quest)
			//	https://developer.mozilla.org/en-US/docs/Web/API/XRRigidTransform
			Camera.Transform = View.transform;	//	stored for debugging
			
			//	write position (w should always be 0
			Camera.Position = [View.transform.position.x,View.transform.position.y,View.transform.position.z];
			
			//	get rotation but remove the translation (so we use .Position)
			//	we also want the inverse for our camera-local purposes
			Camera.Rotation4x4 = View.transform.inverse.matrix;
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
	
	OnMouseEvent_Default(xyz,Button,Controller,Transform)
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
					//	gr: this should/could request for permission for the extra functionality
					//	https://immersive-web.github.io/webxr/#dictdef-xrsessioninit
					//Options.requiredFeatures = ['local-floor'];
					//	gr: add all the features!
					Options.optionalFeatures = ['local-floor','hand-tracking','bounded-floor'];
					
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
			if ( ReferenceSpace.boundsGeometry )
				Pop.Debug(`Got bounding geometry! ${JSON.stringify(ReferenceSpace.boundsGeometry)}`,ReferenceSpace.boundsGeometry);
			
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

