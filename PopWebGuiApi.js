Pop.Gui = {};


const PopGuiStorage = window.sessionStorage;

//	should have some general Pop API to use session storage, localstorage, cookies etc crossplatform
Pop.Gui.ReadSettingJson = function(Key)
{
	const Json = PopGuiStorage.getItem(Key);
	if ( !Json )
		throw `No setting for ${Key}`;
	const Object = JSON.parse(Json);
	return Object;
}

Pop.Gui.WriteSettingJson = function(Key,Object)
{
	const Json = JSON.stringify(Object);
	PopGuiStorage.setItem(Key,Json);
}

function IsHtmlString(Value)
{
	if ( typeof Value != 'string' )
		return false;
	
	if ( Value.includes('<') )
		return true;
	
	//	contains html symbol
	//	&gt; &hearts; &#123;
	const Pattern = new RegExp('&([0-9a-zA-Z#]+);');
	if ( Value.match(Pattern) )
		return true;

	return false;
}

function SetGuiControlStyle(Element,Rect)
{
	if ( !Rect )
		return;
	
	//	to allow vw/% etc, we're using w/h now
	//	also, if you have bottom, but no height,
	//	you need block display to make that style work
	
	function NumberToPx(Number)
	{
		if ( typeof Number != 'number' )
			return Number;
		return Number + 'px';
	}
	const RectCss = Rect.map(NumberToPx);
	Element.style.position = 'absolute';
	Element.style.left = RectCss[0];
	Element.style.top = RectCss[1];
	Element.style.width = RectCss[2];
	Element.style.height = RectCss[3];
	//Element.style.border = '1px solid #0f0';
}

function SetGuiControl_SubElementStyle(Element,LeftPercent=0,RightPercent=100)
{
	Element.style.display = 'block';
	//	this makes it overflow, shouldn't be needed?
	//Element.style.width = (RightPercent-LeftPercent) + '%';
	Element.style.position = 'absolute';
	Element.style.left = LeftPercent + '%';
	Element.style.right = (100-RightPercent) + '%';
	Element.style.top = '0px';
	Element.style.bottom = '0px';
}

function SetElementPosition(Element,x,y)
{
	Element.style.position = 'absolute';
	Element.style.top = ( y) + "px";
	Element.style.left = ( x) + "px";
}

var $HighestZ = 99;
function SetElementToTop(Element)
{
	$HighestZ++;
	Element.style.zIndex = $HighestZ;
}

//	returns [float2].snapPos [function].callback [Element].newParent
function GetDropCallback(Element)
{
	//	there is no function for getting all elements under a rect,
	//	so instead we'll check the corners
	//	for now that'll probably be enough, if we get some thin places to drop, may we'll have to check a grid of the rect
	let ElementRect = GetElementRect(Element);
	let Min = float2( ElementRect.x, ElementRect.y );
	let Max = float2( Min.x + ElementRect.width, Min.y + ElementRect.height );
	
	let CheckPositions = [];
	CheckPositions.push( float2(Min.x,Min.y) );
	CheckPositions.push( float2(Min.x,Max.y) );
	CheckPositions.push( float2(Max.x,Max.y) );
	CheckPositions.push( float2(Max.x,Min.y) );
	
	let ShadowElements = [];
	let PushUniqueElement = function(ShadowElement)
	{
		let ExistingIndex = ShadowElements.indexOf( ShadowElement );
		if ( ExistingIndex >= 0 )
			return;
		//	filter droppable
		if ( ShadowElement.GetDropPos == undefined )
			return;
		ShadowElements.push( ShadowElement );
	};
	let EnumElementsUnderPoint = function(Point)
	{
		let PointShadows = document.elementsFromPoint(Point.x,Point.y);
		PointShadows.forEach( PushUniqueElement );
	};
	CheckPositions.forEach( EnumElementsUnderPoint );
	
	//	pick best shadow element
	let DroppableShadowElements = [];
	let UndroppableShadowElements = [];
	
	let CheckDroppable = function(ShadowElement)
	{
		let DropPos = ShadowElement.GetDropPos(Element);
		if ( DropPos == null )
			UndroppableShadowElements.push( ShadowElement );
		else
			DroppableShadowElements.push( ShadowElement );
	};
	ShadowElements.forEach( CheckDroppable );
	
	//	todo: sort z somehow
	
	if ( DroppableShadowElements.length > 0 )
	{
		let NewParent = DroppableShadowElements[0];
		let DropPos = NewParent.GetDropPos(Element);
		let DropFunc = NewParent.OnDrop;
		return { snapPos:DropPos, callback:DropFunc, newParent:NewParent };
	}
	
	if ( UndroppableShadowElements.length > 0 )
	{
		return null;
	}
	
	return null;
}

function float2(_x,_y)
{
	return {x:_x, y:_y };
}

function GetElementRect(Element)
{
	return Element.getBoundingClientRect();
}

function SetGuiControl_Draggable(Element)
{
	const RectKey = `${Element.id}_WindowRect`;
	function LoadRect()
	{
		//	if an element is draggable, see if we've got a previos position to restore
		//	todo: make sure previous pos fits on new screen when we restore
		try
		{
			const NewRect = Pop.Gui.ReadSettingJson(RectKey);
			const x = NewRect.x;
			const y = NewRect.y;
			SetElementPosition( Element, x, y );
		}
		catch(e)
		{
			Pop.Warning(`Failed to restore window position for ${RectKey}`);
		}
	}

	function SaveRect()
	{
		try
		{
			const ElementRect = GetElementRect(Element);
			if ( !ElementRect )
				throw `Failed to get element rect (${Element.id}`;
			const Rect = {};
			Rect.x = ElementRect.x
			Rect.y = ElementRect.y;
			Pop.Gui.WriteSettingJson(RectKey,Rect);
		}
		catch(e)
		{
			Pop.Warning(`Failed to write window position for ${RectKey}`);
		}
	}
	
	let AllowInteraction = function(Event)
	{
		//	gr: if we prevent top events (or dont preventdefault)
		//		then quick movements can fall onto window, and we're not currently
		//		handling when we move without starting with mousedown
		if (Event.target != Element)
		{
			//	gr: hack, to make a child invisible for mouse move/down/up
			//	find a proper fix for this, but can't seem to get it right
			//	as we're AddListener(Capture=true) it gets here first before child
			//	but we want to let children do their thing (eg, scroll bar)
			//	without registering it as a drag
			if (Event.target.AllowDraggable !== true )
				return false;
			//Pop.Debug(`Dragging from child via AllowDraggable`);
		}
		//if ( Event.target.tagName.toUpperCase() == 'INPUT' )
		//	return false;
		return true;
	}
	
	let OnMouseDrag = function(e)
	{
		e = e || window.event;
		//if ( !AllowInteraction(e) )
		//	return;
		
		e.preventDefault();
		
		let MouseX = e.clientX;
		let MouseY = e.clientY;
		
		let NewX = MouseX - Element.grabLocalX;
		let NewY = MouseY - Element.grabLocalY;
		SetElementPosition( Element, NewX, NewY );
		
		let Droppable = GetDropCallback(Element);
		if ( Droppable != null )
		{
			//	dont snap if dragging FROM this element
			if ( Element.grabParent != Droppable.newParent )
			{
				//	snap!
				NewX = Droppable.snapPos.x;
				NewY = Droppable.snapPos.y;
			}
		}
		Element.DropMeta = Droppable;
		
		SetElementPosition( Element, NewX, NewY );
	};
	
	let OnMouseUp = function(e)
	{
		//if ( !AllowInteraction(e) )
		//	return;
		//	update window position one final time & save
		OnMouseDrag(e);
		SaveRect();
												   
		//	drop!
		let Droppable = Element.DropMeta;
		//let Droppable = GetDropCallback(Element);
		if ( Droppable != null )
		{
			console.log("Has droppable");
			console.log("on drop " + Droppable.snapPos.x);
			//	do snap in case we skipped it earlier
			SetElementPosition( Element, Droppable.snapPos.x, Droppable.snapPos.y );
			
			//	do drop
			Droppable.callback(Element);
			SaveRect();
		}
		else
		{
			//console.log("revert droppable");
			//	revert the drag
			if ( Element.OnGrabRevert != null )
			{
				Element.OnGrabRevert();
			}
		}
		Element.OnGrabRevert = null;

		const CapturePhase = true;
		Element.removeEventListener('mouseup',OnMouseUp,CapturePhase);
		Element.removeEventListener('mousemove',OnMouseDrag,CapturePhase);
		document.onmouseup = null;
		document.onmousemove = null;
	};
	
	let OnMouseDown = function(e)
	{
		e = e || window.event;
		if ( !AllowInteraction(e) )
			return;

		//	grab from parent. This returns null if it can't be dragged.
		//	otherwise returns a revert func
		let Parent = Element.parentNode;
		if ( Parent.OnDetachElement == null )
		{
			console.log(Parent);
			console.log("#" + Parent.id + "." + Parent.className + " has no OnDetachElement func");
			return;
		}
		
		Element.OnGrabRevert = Parent.OnDetachElement( Element );
		if ( Element.OnGrabRevert == null )
		{
			console.log("#" + Parent.id + "." + Parent.className + " disallowed detatch");
			return;
		}
		
		e.preventDefault();
		
		//	jump to top
		Element.grabParent = Element.parentNode;
		SetElementToTop(Element);
		
		Element.grabClientX = e.clientX;
		Element.grabClientY = e.clientY;
		let ClientRect = GetElementRect(Element);
		Element.grabLocalX = Element.grabClientX - ClientRect.x;
		Element.grabLocalY = Element.grabClientY - ClientRect.y;
		Element.startDragX = ClientRect.x;
		Element.startDragY = ClientRect.y;
		
		//	convert element to absolute
		SetElementPosition( Element, Element.startDragX, Element.startDragY );

		const CapturePhase = true;
		Element.addEventListener('mouseup',OnMouseUp,CapturePhase);
		Element.addEventListener('mousemove',OnMouseDrag,CapturePhase);
		//	capture document mouse up in case the user drags off-window
		document.onmouseup = OnMouseUp;
		//	capture document mouse move for when the user moves the mouse so fast it goes off the element, and we don't get mousemove any more
		document.onmousemove = OnMouseDrag;
	};
	
	let OnDetachElement = function(Element)
	{
		//	rememeber to put the cards back in order!
		let Revert = function()
		{
		};
		return Revert;
	};

	const CapturePhase = true;
	Element.addEventListener('mousedown',OnMouseDown,CapturePhase);
	Element.parentNode.OnDetachElement = OnDetachElement;

	LoadRect();
}

Pop.Gui.Window = function(Name,Rect,Resizable)
{
	//	child controls should be added to this
	//	todo: rename to ChildContainer
	this.ElementParent = null;
	this.ElementWindow = null;
	this.ElementTitleBar = null;
	this.RestoreHeight = null;		//	if non-null, stores the height we were before minimising

	//	gr: element may not be assigned yet, maybe rework construction of controls
	this.AddChildControl = function(Child,Element)
	{
		//Element.style.zIndex = 2;
		this.ElementParent.appendChild( Element );
	}
	
	this.GetContainerElement = function()
	{
		return this.ElementParent;
	}
	
	this.CreateElement = function(Name,Parent,Rect)
	{
		let Element = document.createElement('div');
		if ( Rect == Parent.id )
			SetGuiControl_SubElementStyle(Element);
		else
			SetGuiControlStyle( Element, Rect );
		
		//Element.innerText = 'Pop.Gui.Window';
		Element.style.zIndex = $HighestZ;
		//Element.style.overflow = 'scroll';	//	inner div handles scrolling
		Element.className = 'PopGuiWindow';
		Element.id = Name;	//	multiple classes, so we can style at a generic level, and 
		Parent.appendChild( Element );
		
		if ( Rect == Parent.id )
		{
			//	filling parent, so can't drag
			//	maybe better if we check style settings?
		}
		else
		{
			//	gr: this should really be the title bar, but would need to move the window element
			//		so this is just easier
			SetGuiControl_Draggable( Element );
		}
		
		//	purely for styling
		let AddChild = function(Parent,ClassName,InnerText='',AllowMouseInteraction=true)
		{
			let Child = document.createElement('div');
			Child.className = ClassName;
			Child.innerText = InnerText;
			if (!AllowMouseInteraction )
				Child.style.pointerEvents = 'none';
			Parent.appendChild( Child );
			return Child;
		}
		this.ElementTitleBar = AddChild( Element, 'PopGuiTitleBar');
		const TitleBar = this.ElementTitleBar;
		//AddChild( TitleBar, 'PopGuiTitleIcon', 'X');
		AddChild(TitleBar,'PopGuiTitleText',Name,false);
		//	todo: add proper gui button types
		//AddChild( TitleBar, 'PopGuiButton', '_');
		//AddChild( TitleBar, 'PopGuiButton', 'X');

		TitleBar.AllowDraggable = true;
		TitleBar.addEventListener('dblclick',this.OnToggleMinimise.bind(this),true);
		
		//	this may need some style to force position
		this.ElementParent = AddChild( Element, 'PopGuiIconView');
		//	need to make this absolute as the new static position-base for child controls
		SetGuiControl_SubElementStyle(this.ElementParent);

		//	default scrollbars on
		this.EnableScrollbars(true,true);
		
		return Element;
	}
	
	this.EnableScrollbars = function(Horizontal,Vertical)
	{
		this.ElementParent.style.overflowY = Vertical ? 'scroll' : 'hidden';
		this.ElementParent.style.overflowX = Horizontal ? 'scroll' : 'hidden';
	}

	this.IsMinimised = function ()
	{
		return (this.RestoreHeight !== null);
	}

	this.Flash = function(Enable)
	{
		//	gr: turn this into an async func!
		const FlashOn = function()
		{
			this.ElementTitleBar.style.backgroundColor = '#888';
		}.bind(this);
		const FlashOff = function()
		{
			//	unset any overriding style colour
			//	todo: can we do this by setting css class?
			//	gr: delete doesnt work, undefined doesnt work.
			this.ElementTitleBar.style.backgroundColor = null;
		}.bind(this);
		
		//	already flashing
		if ( this.FlashTimer && !Enable )
		{
			clearTimeout(this.FlashTimer);
			this.FlashTimer = null;
			FlashOff();
		}
		else if ( !this.FlashTimer && Enable )
		{
			let Flashing = false;
			function FlashCallback()
			{
				this.FlashTimer = setTimeout(FlashCallback.bind(this),500);
				if ( Flashing )
					FlashOff();
				else
					FlashOn();
				Flashing = !Flashing;
			}
			FlashCallback.call(this);
		}
	}

	this.OnToggleMinimise = function (DoubleClickEvent)
	{
		//Pop.Debug(`OnToggleMinimise`);
		//	check height of window to see if it's minimised
		if (!this.IsMinimised())
		{
			this.RestoreHeight = this.ElementWindow.style.height;
			this.ElementWindow.style.height = '18px';
			this.ElementParent.style.visibility = 'hidden';
		}
		else
		{
			this.ElementWindow.style.height = this.RestoreHeight;
			this.RestoreHeight = null;
			this.ElementParent.style.visibility = 'visible';
		}
	}

	let Parent = document.body;
	if ( typeof Rect == 'string' )
	{
		Parent = document.getElementById(Rect);
	}
	else if ( Rect instanceof HTMLElement )
	{
		Parent = Rect;
		Rect = Parent.id;
	}
	
	this.ElementWindow = this.CreateElement( Name, Parent, Rect );
}

function GetExistingElement(Name)
{
	if ( typeof Name != 'string' )
		return null;
	
	let Element = document.getElementById(Name);
	if ( Element )
		return Element;
	
	return null;
}



function GetButtonFromMouseEventButton(MouseButton,AlternativeButton)
{
	//	html/browser definitions
	const BrowserMouseLeft = 0;
	const BrowserMouseMiddle = 1;
	const BrowserMouseRight = 2;
	
	//	handle event & button arg
	if ( typeof MouseButton == "object" )
	{
		let MouseEvent = MouseButton;
		
		//	this needs a fix for touches
		if ( MouseEvent.touches )
		{
			//	have to assume there's always one?
			const Touches = Array.from( MouseEvent.touches );
			if ( Touches.length == 0 )
				throw "Empty touch array, from event?";
			MouseButton = BrowserMouseLeft;
			AlternativeButton = false;
		}
		else
		{
			MouseButton = MouseEvent.button;
			AlternativeButton = (MouseEvent.ctrlKey == true);
		}
	}
	
	if ( AlternativeButton )
	{
		switch ( MouseButton )
		{
			case BrowserMouseLeft:	return Pop.SoyMouseButton.Back;
			case BrowserMouseRight:	return Pop.SoyMouseButton.Forward;
		}
	}
	
	switch ( MouseButton )
	{
		case BrowserMouseLeft:		return Pop.SoyMouseButton.Left;
		case BrowserMouseMiddle:	return Pop.SoyMouseButton.Middle;
		case BrowserMouseRight:		return Pop.SoyMouseButton.Right;
	}
	throw "Unhandled MouseEvent.button (" + MouseButton + ")";
}

//	gr: should api revert to uv?
function GetMousePos(MouseEvent,Element)
{
	const Rect = Element.getBoundingClientRect();
	
	//	touch event, need to handle multiple touch states
	if ( MouseEvent.touches )
		MouseEvent = MouseEvent.touches[0];
	
	const ClientX = MouseEvent.pageX || MouseEvent.clientX;
	const ClientY = MouseEvent.pageY || MouseEvent.clientY;
	const x = ClientX - Rect.left;
	const y = ClientY - Rect.top;
	return [x,y];
}



Pop.Gui.SetStyle = function(Element,Key,Value)
{
	//	change an attribute
	Element.setAttribute(Key,Value);
	//	set a css value
	Element.style.setProperty(`${Key}`,Value);
	//	set a css variable
	Element.style.setProperty(`--${Key}`,Value);
}

//	finally doing proper inheritance for gui
Pop.Gui.BaseControl = class
{
	constructor()
	{
		this.OnDragDropQueue = new Pop.PromiseQueue();

		//	WaitForDragDrop() can provide a function to rename files
		//	this may have issues with multi-callers or race conditions
		//	essentially if this wants to be different for different calls,
		//	so we'd need to link this rename func to each promise waiting in the queue
		this.OnDragDropRenameFiles = null;
	}

	BindEvents()
	{
		const Element = this.GetElement();
		Element.addEventListener('drop',this.OnDragDrop.bind(this));
		Element.addEventListener('dragover',this.OnTryDragDropEvent.bind(this));
		
		//	need to move all these from Opengl window
		Element.addEventListener('wheel', this.OnMouseWheelEvent.bind(this), false );
	}
	
	OnMouseWheelEvent(MouseEvent)
	{
		//	if no overload/assigned event, ignore the event
		if ( !this.OnMouseScroll )
			return;
		
		const Element = this.GetElement();
		const Pos = GetMousePos(MouseEvent,Element);
		const Button = GetButtonFromMouseEventButton(MouseEvent);
		
		//	gr: maybe change scale based on
		//WheelEvent.deltaMode = DOM_DELTA_PIXEL, DOM_DELTA_LINE, DOM_DELTA_PAGE
		const DeltaScale = 0.01;
		const WheelDelta = [ MouseEvent.deltaX * DeltaScale, MouseEvent.deltaY * DeltaScale, MouseEvent.deltaZ * DeltaScale ];
		this.OnMouseScroll( Pos[0], Pos[1], Button, WheelDelta );
		MouseEvent.preventDefault();
	}

	GetDragDropFilenames(Files)
	{
		//	gr: we may need to make random/unique names here
		const Filenames = Files.map(f => f.name);

		//	let user modify filename array
		if (this.OnDragDropRenameFiles)
			this.OnDragDropRenameFiles(Filenames);

		return Filenames;
	}

	OnTryDragDropEvent(Event)
	{
		//	if this.OnTryDragDrop has been overloaded, call it
		//	if it hasn't, we allow drag and drop
		//	gr: maybe API really should change, so it only gets turned on if WaitForDragDrop has been called
		let AllowDragDrop = false;

		//	gr: HTML doesnt allow us to see filenames, just type & count
		//const Filenames = Array.from(Event.dataTransfer.files).map(this.GetDragDropFilename);
		const Filenames = new Array(Event.dataTransfer.items.length);
		Filenames.fill(null);

		if (!this.OnTryDragDrop)
		{
			AllowDragDrop = true;
		}
		else
		{
			AllowDragDrop = this.OnTryDragDrop(Filenames);
		}

		if (AllowDragDrop)
			Event.preventDefault();
	}

	OnDragDrop(Event)
	{
		async function LoadFilesAsync(Files)
		{
			const NewFilenames = this.GetDragDropFilenames(Files);
			async function LoadFile(File,FileIndex)
			{
				const Filename = NewFilenames[FileIndex];
				const Mime = File.type;
				Pop.Debug(`Filename ${File.name}->${Filename} mime ${Mime}`);
				const FileArray = await File.arrayBuffer();
				Pop._AssetCache[Filename] = new Uint8Array(FileArray);
				NewFilenames.push(Filename);
			}
			//	make a promise for each file
			const LoadPromises = Files.map(LoadFile.bind(this));
			//	wait for them to all load
			await Promise.all(LoadPromises);

			//	now notify with new filenames
			this.OnDragDropQueue.Push(NewFilenames);
		}

		Event.preventDefault();

		Pop.Debug(`OnDragDrop ${Event.dataTransfer}`);
		if (Event.dataTransfer.files)
		{
			const Files = Array.from(Event.dataTransfer.files);
			LoadFilesAsync.call(this,Files);
		}
		else
		{
			throw `Handle non-file drag&drop`;
		}

	}

	async WaitForDragDrop(RenameFilenames)
	{
		this.OnDragDropRenameFiles = RenameFilenames;
		return this.OnDragDropQueue.WaitForNext();
	}
	
	SetStyle(Key,Value)
	{
		const Element = this.GetElement();
		Pop.Gui.SetStyle(Element,Key,Value);
	}
	
	SetRect(Rect)
	{
		const Element = this.GetElement();
		SetGuiControlStyle( Element, Rect );
	}
	
	SetVisible(Visible)
	{
		this.SetStyle('visibility', Visible ? 'visible' : 'hidden' );
	}
}



Pop.Gui.Label = class extends Pop.Gui.BaseControl
{
	constructor(Parent,Rect)
	{
		super(...arguments);
		this.ValueCache = null;

		this.Element = this.CreateElement(Parent,Rect);
		this.BindEvents();
	}
	
	GetElement()
	{
		return this.Element;
	}
	
	SetValue(Value)
	{
		//	avoid DOM changes as much as possible
		if ( this.ValueCache == Value )
			return;
		
		//	inner html is slow!
		if ( IsHtmlString(Value) )
			this.Element.innerHTML = Value;
		else
			this.Element.innerText = Value;
		this.ValueCache = Value;
	}

	CreateElement(Parent,Rect)
	{
		let Div = GetExistingElement(Parent);
		if ( Div )
			return Div;
		
		Div = document.createElement('div');
		if ( Rect )
			SetGuiControlStyle( Div, Rect );
		
		Div.innerText = 'Pop.Gui.Label';
		Parent.AddChildControl( Parent, Div );
		return Div;
	}
}



Pop.Gui.Button = class extends Pop.Gui.BaseControl
{
	constructor(Parent,Rect)
	{
		super(...arguments);

		//	overload
		this.OnClicked = function ()
		{
			Pop.Debug("Pop.Gui.Button.OnClicked");
		}

		this.Element = this.CreateElement(Parent,Rect);
		this.BindEvents();
	}

	
	SetLabel(Value)
	{
		//Pop.Debug("Set button label",Value);
		const ElementType = this.Element.tagName.toLowerCase();
		
		if ( ElementType == 'input' && this.Element.type == 'button' )
		{
			this.Element.value = Value;
		}
		else if (this.Element.innerText !== undefined)
		{
			this.Element.innerText = Value;
		}
		else
			throw "Not sure how to set label on this button " + this.Element.constructor;
	}

	SetValue(Value)
	{
		return this.SetLabel(Value);
	}
	
	OnElementClicked(Event)
	{
		this.OnClicked();
	}

	GetElement()
	{
		return this.Element;
	}

	BindEvents()
	{
		super.BindEvents();

		const Element = this.GetElement();
		//	make sure its clickable!
		Element.style.pointerEvents = 'auto';
		Element.style.cursor = 'pointer';

		//	gr; this overrides old instance
		Element.oninput = this.OnElementClicked.bind(this);
		Element.onclick = this.OnElementClicked.bind(this);
	}

	CreateElement(Parent,Rect)
	{		
		let Div = GetExistingElement(Parent);
		if ( Div )
			return Div;
		
		//	gr: hard to style buttons/inputs, no benefit afaik, but somehow we shoulld make this an option
		const ElementType = 'span';//'input';
		Div = document.createElement(ElementType);
		if ( Rect )
			SetGuiControlStyle( Div, Rect );
		Div.type = 'button';
		
		Div.innerText = 'Pop.Gui.Button innertext';
		Div.value = 'Pop.Gui.Button value';
		Parent.AddChildControl( Parent, Div );
		return Div;
	}
}

Pop.Gui.Slider = function(Parent,Rect,Notches)
{
	this.InputElement = null;
	this.ValueCache = undefined;
	
	this.SetMinMax = function(Min,Max)
	{
		this.InputElement.min = Min;
		this.InputElement.max = Max;
	}
	
	this.SetValue = function(Value)
	{
		if ( this.ValueCache === Value )
			return;
		
		this.InputElement.value = Value;
		this.ValueCache = Value;
		
		//	trigger js events attached to input
		this.InputElement.dispatchEvent(new Event('change'));
	}
	
	this.OnElementChanged = function(Event)
	{
		//	call our callback
		let Value = this.InputElement.valueAsNumber;
		this.ValueCache = Value;
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		const ListenToInput = function(InputElement)
		{
			InputElement.addEventListener('input', this.OnElementChanged.bind(this) );
			//	this is event is triggered from this.SetValue() so creates a loop
			//InputElement.addEventListener('change', this.OnElementChanged.bind(this) );
		}.bind(this);
		
		let Div = GetExistingElement(Parent);
		if ( Div )
		{
			this.InputElement = Div;
			ListenToInput(Div);
			return Div;
		}
		
		let Input = document.createElement('input');
		this.InputElement = Input;
		
		//	gr: what are defaults in pop?
		Input.min = 0;
		Input.max = 100;
		Input.value = 0;
		Input.type = 'range';
		SetGuiControl_SubElementStyle( Input );
		//Input.oninput = this.OnElementChanged.bind(this);
		ListenToInput(Input);
		
		Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		//Div.innerText = 'Pop.Gui.Slider';
		
		Div.appendChild( Input );
		Parent.AddChildControl( this, Div );
		
		return Div;
	}
	
	this.Element = this.CreateElement(Parent);
}


Pop.Gui.TickBox = function(Parent,Rect)
{
	this.Label = '';
	this.InputElement = null;
	this.LabelElement = null;

	this.GetValue = function()
	{
		return this.InputElement.checked;
	}
	
	this.SetValue = function(Value)
	{
		this.InputElement.checked = Value;
		this.RefreshLabel();
	}
	
	this.SetLabel = function(Value)
	{
		this.Label = Value;
		this.RefreshLabel();
	}
	
	this.RefreshLabel = function()
	{
		this.LabelElement.innerText = this.Label;
	}

	this.OnElementChanged = function(Event)
	{
		//	call our callback
		let Value = this.GetValue();
		this.RefreshLabel();
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		let Input = document.createElement('input');
		this.InputElement = Input;
		
		//	gr: what are defaults in pop?
		Input.checked = true;
		Input.type = 'checkbox';
		SetGuiControl_SubElementStyle( Input, 0, 50 );
		Input.oninput = this.OnElementChanged.bind(this);
	
		let Label = document.createElement('label');
		this.LabelElement = Label;
		Label.innerText = 'checkbox';
		SetGuiControl_SubElementStyle( Label, 50, 100 );
	
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );

		Div.appendChild( Input );
		Div.appendChild( Label );
		Parent.AddChildControl( this, Div );

		return Div;
	}
	
	this.Element = this.CreateElement(Parent);
	this.RefreshLabel();
}



Pop.Gui.Colour = function(Parent,Rect)
{
	this.InputElement = null;
	this.LabelElement = null;
	this.LabelTextCache = undefined;
	this.ValueCache = undefined;
	
	this.GetValue = function()
	{
		let RgbHex = this.InputElement.value;
		let Rgbf = Pop.Colour.HexToRgbf( RgbHex );
		return Rgbf;
	}
	
	this.SetValue = function(Value)
	{
		let RgbHex = Pop.Colour.RgbfToHex( Value );
		if ( this.ValueCache === RgbHex )
			return;
		this.InputElement.value = RgbHex;
		this.ValueCache = RgbHex;
	}
	
	this.SetLabel = function(Value)
	{
		if ( this.LabelTextCache === Value )
			return;
		this.LabelElement.innerText = Value;
		this.LabelTextCache = Value;
	}
	
	this.OnElementChanged = function(Event)
	{
		//	call our callback
		let Value = this.GetValue();
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		let Input = document.createElement('input');
		this.InputElement = Input;
		
		//	gr: what are defaults in pop?
		Input.checked = true;
		Input.type = 'color';
		SetGuiControl_SubElementStyle( Input, 0, 20 );
		Input.oninput = this.OnElementChanged.bind(this);
		
		let Label = document.createElement('label');
		this.LabelElement = Label;
		SetGuiControl_SubElementStyle( Label, 30, 100 );
		
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		
		Div.appendChild( Input );
		Div.appendChild( Label );
		Parent.AddChildControl( this, Div );
		
		return Div;
	}
	
	this.Element = this.CreateElement(Parent);
}



Pop.Gui.TextBox = function(Parent,Rect)
{
	this.Label = '';
	this.InputElement = null;
	this.LabelElement = null;

	//	overwrite/overload this
	this.OnChanged = function (NewValue) { };
	
	this.GetValue = function()
	{
		return this.InputElement.value;
	}
	
	this.SetValue = function(Value)
	{
		this.InputElement.value = Value;
		this.RefreshLabel();
	}
	
	this.SetLabel = function(Value)
	{
		this.Label = Value;
		this.RefreshLabel();
	}
	
	this.RefreshLabel = function()
	{
		this.LabelElement.innerText = this.Label;
	}
	
	this.OnElementChanged = function(Event)
	{
		//	call our callback
		let Value = this.GetValue();
		this.RefreshLabel();
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		let Input = document.createElement('input');
		this.InputElement = Input;
		
		//	gr: what are defaults in pop?
		Input.type = 'text';
		SetGuiControl_SubElementStyle( Input, 0, 50 );
		//	oninput = every change
		//	onchange = on lose focus
		Input.oninput = this.OnElementChanged.bind(this);
		Input.onchange = this.OnElementChanged.bind(this);

		let Label = document.createElement('label');
		this.LabelElement = Label;
		Label.innerText = 'TextBox';
		SetGuiControl_SubElementStyle( Label, 50, 100 );
		
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		
		Div.appendChild( Input );
		Div.appendChild( Label );
		Parent.AddChildControl( this, Div );
		
		return Div;
	}
	
	this.Element = this.CreateElement(Parent);
	this.RefreshLabel();
}


Pop.Gui.ImageMap = class extends Pop.Gui.BaseControl
{
	constructor(Parent,Rect)
	{
		super(...arguments);

		//	this needs to be generic...
		//	also, the opengl window already handles a lot of this
		if ( typeof Rect == 'string' )
		{
			this.Element = document.getElementById(Rect);
		}
		else
		{
			if ( !Parent )
				throw `Creating new gui element requires parent`;

			this.Element = document.createElement('canvas');

			//	be smarter here
			if ( Rect )
				SetGuiControlStyle(this.Element,Rect);
			else
				SetGuiControl_SubElementStyle(this.Element);
			
			Parent.AddChildControl( this, this.Element );
		}

		this.BindEvents();
	}

	GetElement()
	{
		return this.Element;
	}

	SetImage(Image)
	{
		//	need to implement this in the proper image api
		if ( Image.GetFormat() != 'RGBA' )
			throw `todo: ImageMap requires RGBA pixels at the moment`;
	
		//	todo: init size
		//	todo: platforms stretch input image
		this.Element.width = Image.GetWidth();
		this.Element.height = Image.GetHeight();
		
		//	we're kinda assuming the pixel buffer is an uint8array (but it needs to be clamped in chrome!)
		const Pixels = new Uint8ClampedArray(Image.GetPixelBuffer());

		const Context = this.Element.getContext('2d');
		const Img = new ImageData( Pixels, Image.GetWidth(), Image.GetHeight() );
		Context.putImageData(Img, 0, 0);
	}
}




Pop.Gui.Table = class extends Pop.Gui.BaseControl
{
	constructor(Parent,Rect)
	{
		super(...arguments);
		this.TableElement = this.CreateElement(Parent,Rect);
		this.InitStyle();
		this.BindEvents();
		this.KnownKeys = [];
	}

	GetElement()
	{
		return this.TableElement;
	}

	SetValue(Rows)
	{
		function SpecialKey(Key)
		{
			return Key == 'Style';
		}
		function NotSpecialKey(Key)
		{
			return !SpecialKey(Key);
		}

		//	check is an array of keyd values
		if (!Array.isArray(Rows) )
			throw `Pop.Gui.Table.SetValue(${Rows}) expecting an array of keyed objects`;

		//	merge new keys
		if (Rows.length > 0)
		{
			const NewKeys = Object.keys(Rows[0]);
			this.KnownKeys = Array.from(new Set(this.KnownKeys.concat(NewKeys)));
			this.KnownKeys = this.KnownKeys.filter(NotSpecialKey);
		}

		this.UpdateTableDimensions(this.KnownKeys,Rows.length);

		//	set all cells
		const SetRowCells = function (RowValues,RowIndex)
		{
			const Style = RowValues.Style;
			for (let [Key,Value] of Object.entries(RowValues))
			{
				const ColumnIndex = this.KnownKeys.indexOf(Key);
				//	column/key probably filtered out
				if (ColumnIndex == -1)
					continue;
				this.SetTableCell(ColumnIndex,RowIndex,Value,Style,Key);
			}
		}
		Rows.forEach(SetRowCells.bind(this));
	}

	SetTableCell(Column,Row,Value,Style,ColumnKey)
	{
		const Table = this.GetElement();
		const Body = Table.tBodies[0];
		//const Header = Table.createTHead();
		const Element = Body.rows[Row].cells[Column];
		Element.innerText = (Value===undefined) ? "" : Value;
		
		//	gr: as we're shuffling rows, we currently let old styles hang around
		//		and they get left set (as they're never unset)
		//		so clear old style (this still doesn't remove attributes!)
		Element.style = '';
		
		//	style should be a keyed object
		if ( typeof Style == 'string' )
		{
			Pop.Warning(`Deprecated: Style on a table row should be keyed object of attributes; ${ColumnKey}:${Style}`);
			Element.style = Style;
		}
		else if ( Style )
		{
			for ( let [StyleName,Value] of Object.entries(Style) )
			{
				Pop.Gui.SetStyle(Element,StyleName,Value);
			}
		}
	}

	UpdateTableRow(Row,ColumnValues,SetIdToColumnNames)
	{
		while (Row.cells.length < ColumnValues.length)
			Row.insertCell(0);
		while (Row.cells.length > ColumnValues.length)
			Row.deleteCell(0);
		//if ( SetIdToColumnNames )	Pop.Debug(`SetIdToColumnNames`);
		function SetCell(Value,Index)
		{
			Row.cells[Index].innerText = Value;
			if ( SetIdToColumnNames )
				Row.cells[Index].id = ColumnValues[Index];
		}
		ColumnValues.forEach(SetCell);
	}

	UpdateTableDimensions(Columns,RowCount)
	{
		const Table = this.GetElement();
		const Body = Table.tBodies[0];
		const Header = Table.createTHead();

		//	update header cells
		this.UpdateTableRow(Header.rows[0],Columns,true);
		
		//	append then delete rows
		while (Body.rows.length < RowCount)
			Body.insertRow(Body.rows.length - 1);
		//	todo: work out row diff and try and and cull the correct one
		while (Body.rows.length > RowCount)
			Body.deleteRow(0);

		//	make sure all rows are correct size
		for (let r = 0;r < RowCount;r++)
		{
			this.UpdateTableRow(Body.rows[r],Columns);
		}
	}


	CreateElement(Parent,Rect)
	{
		let Div = GetExistingElement(Rect);
		if (Div)
		{
			//	gr: we currently style according to a table
			if (Div.nodeName != 'TABLE')
				throw `Pop.Gui.Table parent ${Parent} isn't a table, is ${Div.nodeName}`;

			return Div;
		}

		Div = document.createElement('TABLE');
		if (Rect)
			SetGuiControlStyle(Div,Rect);

		Parent.AddChildControl(Parent,Div);
		return Div;
	}

	//	force styling for table
	InitStyle()
	{
		const Table = this.GetElement();

		//	make sure we have distinct bodys and headers
		Table.createTHead();
		if (!Table.tHead.rows.length)
			Table.tHead.insertRow(0);
		if (!Table.tBodies.length)
			Table.createTBody();
	}
}
