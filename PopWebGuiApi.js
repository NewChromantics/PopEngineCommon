import PromiseQueue from './PromiseQueue.js'
import * as Pop from './PopWebApiCore.js'

const Default = 'Pop Gui module';
export default Default;


export let DebugMouseEvent = function(){};	//	Pop.Debug;


//	wrapper for a generic element which converts input (touch, mouse etc) into
//	our mouse functions
function TElementMouseHandler(Element,OnMouseDown,OnMouseMove,OnMouseUp,OnMouseScroll)
{
	//	touchend doesn't tell us what touches were released;
	//	so call this function to keep track of them
	let LastTouches = [];
	//	gr: touch identifier is unique, so not persistent. Whilst this would be better, (returning TouchXXX for button)
	//		we cannot detect say, double-tap from the same source, so we still need to use the tracked "names" (indexes)
	let RegisteredTouchButtons = {};	//	[Identifier] = TouchIndexWhenActivated = ButtonIndex
	let ArchiveRegisteredTouchButtons = {};
	
	
	function UpdateTouches(MouseEvent)
	{
		function TouchIdentifierPresent(Identifier,TouchArray)
		{
			const Match = TouchArray.find( t => t.identifier == Identifier );
			return Match!=null;
		}
	
		//	not a touch device
		if ( !MouseEvent.touches )
			return;
		
		//	turn touches into array
		const NewTouches = Array.from( MouseEvent.touches );
		
		function GetNextUnassignedButtonIndex()
		{
			//	shouldn't have 1000 touch buttons, loop for safety
			const UsedButtonIndexes = Object.values(RegisteredTouchButtons);
			for ( let bi=0;	bi<1000;	bi++ )
			{
				const Match = UsedButtonIndexes.find( Value => Value===bi );
				if ( Match !== undefined )
					continue;
				return bi;
			}
			throw `Failed to find /1000 a free button index`;
		}
		
		function UpdateIdentifierButton(Touch)
		{
			if ( RegisteredTouchButtons.hasOwnProperty(Touch.identifier) )
				return;
			
			const ButtonIndex = GetNextUnassignedButtonIndex();
			DebugMouseEvent(`New touch ${Touch.identifier} = Button ${ButtonIndex}`);
			RegisteredTouchButtons[Touch.identifier] = ButtonIndex;
			ArchiveRegisteredTouchButtons[Touch.identifier] = ButtonIndex;
		}
		function UnregisterTouch(Touch)
		{
			//	gr: we cannot unregister, as some things use the identifer later
			if ( !RegisteredTouchButtons.hasOwnProperty(Touch.identifier) )
			{
				DebugMouseEvent(`UnregisterTouch ${Touch.identifier} but not registered`);
				return;
			}
			const Button = RegisteredTouchButtons[Touch.identifier];
			DebugMouseEvent(`UnregisterTouch ${Touch.identifier} button was ${Button}`);
			delete RegisteredTouchButtons[Touch.identifier];
		}

		//	assign button indexes for new touches
		NewTouches.forEach(UpdateIdentifierButton);
	
		//	find changes
		const RemovedTouches = LastTouches.filter( t => !TouchIdentifierPresent(t.identifier,NewTouches) );
		const AddedTouches = NewTouches.filter( t => !TouchIdentifierPresent(t.identifier,LastTouches) );
		
		//	removed button assignments for deleted touches
		RemovedTouches.forEach(UnregisterTouch);		
		
		MouseEvent.Touches = NewTouches;
		MouseEvent.RemovedTouches = RemovedTouches;
		MouseEvent.AddedTouches = AddedTouches;
		LastTouches = NewTouches;
	}
	
	function GetButtonNameFromTouch(Touch)
	{
		//	can't use unique identifier (safari) as we need to track buttons between touches
		//return `Touch${Touch.identifier}`;

		//	gr: registered = active
		function GetButtonIndexFromTouch(Touch)
		{
			if ( !ArchiveRegisteredTouchButtons.hasOwnProperty(Touch.identifier) )
			{
				Pop.Warning(`Touch ${Touch.identifier} has no registered button. Returning 0`);
				return 0;
			}
			return ArchiveRegisteredTouchButtons[Touch.identifier];
		}
		const ButtonIndex = GetButtonIndexFromTouch(Touch);
		return `Touch${ButtonIndex}`;
	}
	
	function GetPositionFromTouch(Touch)
	{
		return GetMousePos(Touch,null);
	}

	//	annoying distinctions
	let GetButtonFromMouseEventButton = function(MouseButton,AlternativeButton,TouchArray)
	{
		//	html/browser definitions
		const BrowserMouseLeft = 0;
		const BrowserMouseMiddle = 1;
		const BrowserMouseRight = 2;

		//	handle event & button arg
		if ( typeof MouseButton == "object" )
		{
			let MouseEvent = MouseButton;
			
			//	gr: still needs re-working for touches
			//	look at specific touch list
			if ( TouchArray )
			{
				//	have to assume there's always one?
				return GetButtonNameFromTouch(TouchArray[0]);
			}
			//	this needs a fix for touches
			else if ( MouseEvent.Touches )
			{
				return GetButtonNameFromTouch(MouseEvent.Touches[0]);
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
				case BrowserMouseLeft:	return 'Back';
				case BrowserMouseRight:	return 'Forward';
			}
		}
		
		//	gr: where is back and forward mouse buttons??
		switch ( MouseButton )
		{
			case BrowserMouseLeft:		return 'Left';
			case BrowserMouseMiddle:	return 'Middle';
			case BrowserMouseRight:		return 'Right';
		}
		throw "Unhandled MouseEvent.button (" + MouseButton + ")";
	}
	
	let GetButtonsFromMouseEventButtons = function(MouseEvent,IncludeTouches)
	{
		//	note: button bits don't match mousebutton!
		//	https://www.w3schools.com/jsref/event_buttons.asp
		//	https://www.w3schools.com/jsref/event_button.asp
		//	index = 0 left, 1 middle, 2 right (DO NOT MATCH the bits!)
		//	gr: ignore back and forward as they're not triggered from mouse down, just use the alt mode
		//let ButtonMasks = [ 1<<0, 1<<2, 1<<1, 1<<3, 1<<4 ];
		const ButtonMasks = [ 1<<0, 1<<2, 1<<1 ];
		const ButtonMask = MouseEvent.buttons || 0;	//	undefined if touches
		const AltButton = (MouseEvent.ctrlKey==true);
		const Buttons = [];
		
		for ( let i=0;	i<ButtonMasks.length;	i++ )
		{
			if ( ( ButtonMask & ButtonMasks[i] ) == 0 )
				continue;
			let ButtonIndex = i;
			let ButtonName = GetButtonFromMouseEventButton( ButtonIndex, AltButton );
			if ( ButtonName === null )
				continue;
			Buttons.push( ButtonName );
		}

		//	mobile
		if ( IncludeTouches && MouseEvent.Touches )
		{
			function PushTouch(Touch,Index)
			{
				const ButtonName = GetButtonNameFromTouch( Touch );
				if ( ButtonName === null )
					return;
				Buttons.push( ButtonName );
			}
			MouseEvent.Touches.forEach( PushTouch );
		}

		return Buttons;
	}
	
	//	gr: should api revert to uv?
	let GetMousePos = function(MouseEvent,TouchArray)
	{
		const Rect = Element.getBoundingClientRect();
		
		//	touch event, need to handle multiple touch states
		if ( TouchArray )
			MouseEvent = TouchArray[0];
		else if ( MouseEvent.Touches )
			MouseEvent = MouseEvent.Touches[0];
		
		const ClientX = MouseEvent.pageX || MouseEvent.clientX;
		const ClientY = MouseEvent.pageY || MouseEvent.clientY;
		const x = ClientX - Rect.left;
		const y = ClientY - Rect.top;
		return [x,y];
	}
	
	function ReportTouches(MouseEvent)
	{
		if ( MouseEvent.AddedTouches )
		{
			function ReportNewTouch(Touch)
			{
				const Button = GetButtonNameFromTouch(Touch);
				const Position = GetPositionFromTouch(Touch);
				DebugMouseEvent(`Touch MouseDown ${Position} button ${Button}`);
				OnMouseDown(...Position,Button);
			}
			MouseEvent.AddedTouches.forEach(ReportNewTouch);
		}
		
		//	update positions
		if ( MouseEvent.Touches )
		{
			function ReportTouchMove(Touch)
			{
				const Button = GetButtonNameFromTouch(Touch);
				const Position = GetPositionFromTouch(Touch);
				DebugMouseEvent(`Touch MouseMove ${Position} button ${Button}`);
				OnMouseMove(...Position,Button);
			}
			MouseEvent.Touches.forEach(ReportTouchMove);
		}
		
		if ( MouseEvent.RemovedTouches )
		{
			function ReportOldTouch(Touch)
			{
				const Button = GetButtonNameFromTouch(Touch);
				const Position = GetPositionFromTouch(Touch);
				DebugMouseEvent(`Touch MouseUp ${Position} button ${Button}`);
				OnMouseUp(...Position,Button);
			}
			MouseEvent.RemovedTouches.forEach(ReportOldTouch);
		}
		
	}
	
	let MouseMove = function(MouseEvent)
	{
		UpdateTouches(MouseEvent);
		ReportTouches(MouseEvent);
		
		if ( !MouseEvent.changedTouches )
		{
			const Pos = GetMousePos(MouseEvent);
			const Buttons = GetButtonsFromMouseEventButtons( MouseEvent, false );
			
			if ( Buttons.length == 0 )
			{
				DebugMouseEvent(`MouseMove ${Pos} zero buttons ${Buttons}`);
				Buttons.push(null);
			}
			
			//	report each button as its own mouse move
			DebugMouseEvent(`MouseMove ${Pos} buttons ${Buttons}`);
			for ( let Button of Buttons )
				OnMouseMove( Pos[0], Pos[1], Button );
		}
		MouseEvent.preventDefault();
	}
	
	let MouseDown = function(MouseEvent)
	{
		UpdateTouches(MouseEvent);
		ReportTouches(MouseEvent);
		
		if ( !MouseEvent.changedTouches )
		{
			const Pos = GetMousePos(MouseEvent);
			const Button = GetButtonFromMouseEventButton(MouseEvent);
			DebugMouseEvent(`MouseDown ${Pos} ${Button}`);
			OnMouseDown( Pos[0], Pos[1], Button );
		}
		MouseEvent.preventDefault();
	}
	
	let MouseUp = function(MouseEvent)
	{
		UpdateTouches(MouseEvent);
		ReportTouches(MouseEvent);
		
		if ( !MouseEvent.changedTouches )
		{
			//	todo: trigger multiple buttons (for multiple touches)
			const Pos = GetMousePos(MouseEvent,MouseEvent.RemovedTouches);
			const Button = GetButtonFromMouseEventButton(MouseEvent,null,MouseEvent.RemovedTouches);
		
			//	gr: hack for kandinsky, i need to know when touches are (all) released to turn off "hover"
			//		this will probably change again, as this is probably a common thing
			//		plus its at this level we should deal with touch+mouse cursor (desktop touchscreen, or ipad+mouse)
			//		and maybe XR's touching-button, but not pressing-button 
			const Meta = {};
			Meta.IsTouch = MouseEvent.touches != undefined;	//	gr: this will break on screens with a touch screen
		
			DebugMouseEvent(`MouseUp ${Pos} ${Button} ${JSON.stringify(Meta)}`);
			OnMouseUp( Pos[0], Pos[1], Button, Meta );
		}
		MouseEvent.preventDefault();
	}
	
	let MouseWheel = function(MouseEvent)
	{
		UpdateTouches(MouseEvent);
		ReportTouches(MouseEvent);
		
		const Pos = GetMousePos(MouseEvent);
		const Button = GetButtonFromMouseEventButton(MouseEvent);
		
		//	gr: maybe change scale based on
		//WheelEvent.deltaMode = DOM_DELTA_PIXEL, DOM_DELTA_LINE, DOM_DELTA_PAGE
		const DeltaScale = 0.01;
		const WheelDelta = [ MouseEvent.deltaX * DeltaScale, MouseEvent.deltaY * DeltaScale, MouseEvent.deltaZ * DeltaScale ];
		OnMouseScroll( Pos[0], Pos[1], Button, WheelDelta );
		MouseEvent.preventDefault();
	}
	
	let ContextMenu = function(MouseEvent)
	{
		//	allow use of right mouse down events
		//MouseEvent.stopImmediatePropagation();
		MouseEvent.preventDefault();
		return false;
	}
	
	//	use add listener to allow pre-existing canvas elements to retain any existing callbacks
	Element.addEventListener('mousemove', MouseMove );
	Element.addEventListener('wheel', MouseWheel, false );
	Element.addEventListener('contextmenu', ContextMenu, false );
	Element.addEventListener('mousedown', MouseDown, false );
	Element.addEventListener('mouseup', MouseUp, false );
	
	Element.addEventListener('touchmove', MouseMove );
	Element.addEventListener('touchstart', MouseDown, false );
	Element.addEventListener('touchend', MouseUp, false );
	Element.addEventListener('touchcancel', MouseUp, false );
	//	not currently handling up
	//this.Element.addEventListener('mouseup', MouseUp, false );
	//this.Element.addEventListener('mouseleave', OnDisableDraw, false );
	//this.Element.addEventListener('mouseenter', OnEnableDraw, false );
	

}


//	wrapper for a generic element which converts input (touch, mouse etc) into
//	our mouse functions
function TElementKeyHandler(Element,OnKeyDown,OnKeyUp)
{
	function GetKeyFromKeyEventButton(KeyEvent)
	{
		// DebugMouseEvent("KeyEvent",KeyEvent);
		return KeyEvent.key;
	}
	
	const KeyDown = function(KeyEvent)
	{
		//	if an input element has focus, ignore event
		if ( KeyEvent.srcElement instanceof HTMLInputElement )
		{
			DebugMouseEvent("Ignoring OnKeyDown as input has focus",KeyEvent);
			return false;
		}
		//Pop.Debug("OnKey down",KeyEvent);
		
		const Key = GetKeyFromKeyEventButton(KeyEvent);
		const Handled = OnKeyDown( Key );
		if ( Handled === true )
			KeyEvent.preventDefault();
	}
	
	const KeyUp = function(KeyEvent)
	{
		const Key = GetKeyFromKeyEventButton(KeyEvent);
		const Handled = OnKeyUp( Key );
		if ( Handled === true )
			KeyEvent.preventDefault();
	}
	

	Element = document;
	
	//	use add listener to allow pre-existing canvas elements to retain any existing callbacks
	Element.addEventListener('keydown', KeyDown );
	Element.addEventListener('keyup', KeyUp );
}







const PopGuiStorage = window.sessionStorage;

//	should have some general Pop API to use session storage, localstorage, cookies etc crossplatform
export function ReadSettingJson(Key)
{
	const Json = PopGuiStorage.getItem(Key);
	if ( !Json )
		throw `No setting for ${Key}`;
	const Object = JSON.parse(Json);
	return Object;
}

export function WriteSettingJson(Key,Object)
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
	//	assume this is a element id and not configuration
	if ( typeof Rect == 'string' )
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

//	gr: this should change to a list of always-incrementing z's for our windows
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
	if ( !Element )
		return;
	const RectKey = `${Element.id}_WindowRect`;
	function LoadRect()
	{
		//	if an element is draggable, see if we've got a previos position to restore
		//	todo: make sure previous pos fits on new screen when we restore
		try
		{
			const NewRect = ReadSettingJson(RectKey);
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
			WriteSettingJson(RectKey,Rect);
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

export class Window
{
	constructor(Name,Rect,Resizable)
	{
		//	child controls should be added to this
		//	todo: rename to ChildContainer
		this.ElementParent = null;
		this.ElementWindow = null;
		this.ElementTitleBar = null;
		this.RestoreHeight = null;		//	if non-null, stores the height we were before minimising
		this.TitleBarClickLastTime = null;	//	to detect double click 
		
			
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

	//	gr: element may not be assigned yet, maybe rework construction of controls
	AddChildControl(Child,Element)
	{
		//Element.style.zIndex = 2;
		this.ElementParent.appendChild( Element );
	}
	
	GetContainerElement()
	{
		return this.ElementParent;
	}
	
	CreateElement(Name,Parent,Rect)
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
		TitleBar.addEventListener('click',this.OnTitleBarClick.bind(this),true);
		
		//	this may need some style to force position
		this.ElementParent = AddChild( Element, 'PopGuiIconView');
		//	need to make this absolute as the new static position-base for child controls
		SetGuiControl_SubElementStyle(this.ElementParent);

		//	default scrollbars on
		this.EnableScrollbars(true,true);
		
		return Element;
	}
	
	OnTitleBarClick(Event)
	{
		const DoubleClickMaxTime = 300;
		
		//	todo: filter button
		//	detect double click
		if ( this.TitleBarClickLastTime !== null )
		{
			const TimeSinceClick = Pop.GetTimeNowMs() -  this.TitleBarClickLastTime;
			if ( TimeSinceClick < DoubleClickMaxTime )
			{
				this.OnToggleMinimise();
				this.TitleBarClickLastTime = null;
			}
		}
		
		this.TitleBarClickLastTime = Pop.GetTimeNowMs();				
	}
	
	EnableScrollbars(Horizontal,Vertical)
	{
		this.ElementParent.style.overflowY = Vertical ? 'scroll' : 'hidden';
		this.ElementParent.style.overflowX = Horizontal ? 'scroll' : 'hidden';
	}

	SetMinimised(Minimise=true)
	{
		if ( this.IsMinimised() != Minimise )
		   this.OnToggleMinimise();
	}
												   
	IsMinimised()
	{
		return (this.RestoreHeight !== null);
	}

	Flash(Enable)
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

	OnToggleMinimise(DoubleClickEvent)
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

}

function GetExistingElement(Name,ExpectedType=null)
{
	if ( Name == null )
		return null;
		
	//	search for element
	let Element;
	if ( typeof Name == 'string' )
	{
		Element = document.getElementById(Name);
		if ( !Element )
			throw `No existing element named ${Name}`;
	}
	else if ( Name instanceof HTMLElement )
	{
		Element = Name;
	}
	else
	{
		return null;
	}	
		
	//	verify (input) type
	if ( ExpectedType )
	{
		if ( Element.type != ExpectedType )
			throw `Found element ${Name} but type is ${Element.type} not ${ExpectedType}`;
	}

	return Element;
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
			case BrowserMouseLeft:	return 'Back';
			case BrowserMouseRight:	return 'Forward';
		}
	}
		
	//	gr: where is back and forward mouse buttons??
	switch ( MouseButton )
	{
		case BrowserMouseLeft:		return 'Left';
		case BrowserMouseMiddle:	return 'Middle';
		case BrowserMouseRight:		return 'Right';
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



function SetStyle(Element,Key,Value)
{
	//	change an attribute
	Element.setAttribute(Key,Value);
	//	set a css value
	Element.style.setProperty(`${Key}`,Value);
	//	set a css variable
	Element.style.setProperty(`--${Key}`,Value);
}

//	finally doing proper inheritance for gui
export class BaseControl
{
	constructor()
	{
		this.OnDragDropQueue = new PromiseQueue();

		//	WaitForDragDrop() can provide a function to rename files
		//	this may have issues with multi-callers or race conditions
		//	essentially if this wants to be different for different calls,
		//	so we'd need to link this rename func to each promise waiting in the queue
		this.OnDragDropRenameFiles = null;
	}

	BindEvents()
	{
		Pop.Debug(`BindEvents`);
		const Element = this.GetElement();
		Element.addEventListener('drop',this.OnDragDrop.bind(this));
		Element.addEventListener('dragover',this.OnTryDragDropEvent.bind(this));
		
		
		//	gr: is this all the new input system, which does
		//		multitouch, XR, mouse
		//		Name,[x,y,z]
		const OnMouseDown = function()	{	return this.OnMouseDown ? this.OnMouseDown(...arguments) : false;	};
		const OnMouseMove = function()	{	return this.OnMouseMove ? this.OnMouseMove(...arguments) : false;	};
		const OnMouseUp = function()	{	return this.OnMouseUp ? this.OnMouseUp(...arguments) : false;	};
		const OnMouseScroll = function(){	return this.OnMouseScroll ? this.OnMouseScroll(...arguments) : false;	};
		
		TElementMouseHandler( Element, OnMouseDown.bind(this), OnMouseMove.bind(this), OnMouseUp.bind(this) , OnMouseScroll.bind(this) );

		/*
		//	need to move all these from Opengl window
		Element.addEventListener('wheel', this.OnMouseWheelEvent.bind(this) );
		
		/*
		Element.addEventListener('mousemove', MouseMove );
		Element.addEventListener('wheel', MouseWheel, false );
		Element.addEventListener('contextmenu', ContextMenu, false );
		Element.addEventListener('mousedown', MouseDown, false );
		Element.addEventListener('mouseup', MouseUp, false );
	
		Element.addEventListener('touchmove', MouseMove );
		Element.addEventListener('touchstart', MouseDown, false );
		Element.addEventListener('touchend', MouseUp, false );
		Element.addEventListener('touchcancel', MouseUp, false );
		*/
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
			const FinalAddedFiles = [];
			async function LoadFile(File,FileIndex)
			{
				const Filename = NewFilenames[FileIndex];
				const Mime = File.type;
				Pop.Debug(`Filename ${File.name}->${Filename} mime ${Mime}`);
				const FileArray = await File.arrayBuffer();
				const File8 = new Uint8Array(FileArray);
				if ( Pop.SetFileCache )
					Pop.SetFileCache(Filename,File8);
				FinalAddedFiles.push(Filename);
			}
			//	make a promise for each file
			const LoadPromises = Files.map(LoadFile.bind(this));
			//	wait for them to all load
			await Promise.all(LoadPromises);

			//	now notify with new filenames
			this.OnDragDropQueue.Push(FinalAddedFiles);
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
		SetStyle(Element,Key,Value);
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


export class RenderView extends BaseControl
{
	constructor(Parent,Rect)
	{
		super(...arguments);

		if ( !Rect instanceof HTMLCanvasElement )
			throw `Currently require rect to be a canvas`;

		this.Element = Rect;
		this.BindEvents();
	}
	
	GetElement()
	{
		return this.Element;
	}
}



export class Label extends BaseControl
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
	
	SetText()
	{
		this.SetValue(...arguments);
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
		let Div = GetExistingElement(Rect) || GetExistingElement(Parent);
		if ( Div )
			return Div;
		
		Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		
		Div.innerText = 'Pop.Gui.Label';
		Parent.AddChildControl( Parent, Div );
		return Div;
	}
}



export class Button extends BaseControl
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
		const ElementType = 'input';
		Div = document.createElement(ElementType);
		SetGuiControlStyle( Div, Rect );
		Div.type = 'button';
		
		Div.innerText = 'Pop.Gui.Button innertext';
		Div.value = 'Pop.Gui.Button value';
		Parent.AddChildControl( Parent, Div );
		return Div;
	}
}

export class Slider
{
	constructor(Parent,Rect,Notches)
	{
		this.InputElement = null;
		this.ValueCache = undefined;
	
		this.Element = this.CreateElement(Parent,Rect);
	}
	
	SetMinMax(Min,Max)
	{
		this.InputElement.min = Min;
		this.InputElement.max = Max;
	}
	
	SetValue(Value)
	{
		if ( this.ValueCache === Value )
			return;
		
		this.InputElement.value = Value;
		this.ValueCache = Value;
		
		//	trigger js events attached to input
		this.InputElement.dispatchEvent(new Event('change'));
	}
	
	OnElementChanged(Event)
	{
		//	call our callback
		let Value = this.InputElement.valueAsNumber;
		this.ValueCache = Value;
		this.OnChanged( Value );
	}
	
	CreateElement(Parent,Rect)
	{
		const ExistingSlider = GetExistingElement(Rect,'range');
		if ( ExistingSlider )
		{
			this.InputElement = ExistingSlider;
			this.SetupEvents();
			return ExistingSlider;
		}
		
		let Input = document.createElement('input');
		this.InputElement = Input;
		this.SetupEvents();
		
		//	gr: what are defaults in pop?
		Input.min = 0;
		Input.max = 100;
		Input.value = 0;
		Input.type = 'range';
		SetGuiControl_SubElementStyle( Input );
		//Input.oninput = this.OnElementChanged.bind(this);
		
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		//Div.innerText = 'Pop.Gui.Slider';
		
		Div.appendChild( Input );
		Parent.AddChildControl( this, Div );
		
		return Div;
	}
	
	SetupEvents()
	{
		this.InputElement.addEventListener('input', this.OnElementChanged.bind(this) );
		//	this is event is triggered from this.SetValue() so creates a loop
		//InputElement.addEventListener('change', this.OnElementChanged.bind(this) );
	}
}


export class TickBox
{
	constructor(Parent,Rect)
	{
		this.Label = '';
		this.InputElement = null;
		this.LabelElement = null;
	
		this.Element = this.CreateElement(Parent,Rect);
		this.RefreshLabel();
	}

	GetValue()
	{
		return this.InputElement.checked;
	}
	
	SetValue(Value)
	{
		this.InputElement.checked = Value;
		this.RefreshLabel();
	}
	
	SetLabel(Value)
	{
		this.Label = Value;
		this.RefreshLabel();
	}
	
	RefreshLabel()
	{
		if ( this.LabelElement )
			this.LabelElement.innerText = this.Label;
	}

	OnElementChanged(Event)
	{
		//	call our callback
		let Value = this.GetValue();
		this.RefreshLabel();
		this.OnChanged( Value );
	}
	
	CreateElement(Parent,Rect)
	{
		const ExistingCheckbox = GetExistingElement(Rect,'checkbox');
		if ( ExistingCheckbox )
		{
			this.InputElement = ExistingCheckbox;
			this.SetupEvents();
			return;
		}
	
		let Input = document.createElement('input');
		this.InputElement = Input;
		
		//	gr: what are defaults in pop?
		Input.checked = true;
		Input.type = 'checkbox';
		SetGuiControl_SubElementStyle( Input, 0, 50 );
		
		let Label = document.createElement('label');
		this.LabelElement = Label;
		Label.innerText = 'checkbox';
		SetGuiControl_SubElementStyle( Label, 50, 100 );
	
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );

		Div.appendChild( Input );
		Div.appendChild( Label );
		Parent.AddChildControl( this, Div );

		this.SetupEvents();

		return Div;
	}
	
	SetupEvents()
	{
		this.InputElement.oninput = this.OnElementChanged.bind(this);
	}
}



export class Colour
{
	constructor(Parent,Rect)
	{
		this.InputElement = null;
		this.LabelElement = null;
		this.LabelTextCache = undefined;
		this.ValueCache = undefined;
	
		this.Element = this.CreateElement(Parent,Rect);
	}
	
	GetValue()
	{
		let RgbHex = this.InputElement.value;
		let Rgbf = Pop.Colour.HexToRgbf( RgbHex );
		return Rgbf;
	}
	
	SetValue(Value)
	{
		let RgbHex = Pop.Colour.RgbfToHex( Value );
		if ( this.ValueCache === RgbHex )
			return;
		this.InputElement.value = RgbHex;
		this.ValueCache = RgbHex;
	}
	
	SetLabel(Value)
	{
		if ( this.LabelTextCache === Value )
			return;
		this.LabelElement.innerText = Value;
		this.LabelTextCache = Value;
	}
	
	OnElementChanged(Event)
	{
		//	call our callback
		let Value = this.GetValue();
		this.OnChanged( Value );
	}
	
	CreateElement(Parent,Rect)
	{
		const ExistingElement = GetExistingElement(Rect,'color');
		if ( ExistingElement )
		{
			this.InputElement = ExistingElement;
			this.SetupEvents();
			return;
		}
		
		let Input = document.createElement('input');
		this.InputElement = Input;
		this.SetupEvents();
		
		//	gr: what are defaults in pop?
		Input.checked = true;
		Input.type = 'color';
		SetGuiControl_SubElementStyle( Input, 0, 20 );
		
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
	
	SetupEvents()
	{
		this.InputElement.oninput = this.OnElementChanged.bind(this);
	}
}


export class TextBox extends BaseControl
{
	constructor(Parent,Rect)
	{
		super(...arguments);

		this.Label = '';
		this.InputElement = null;
		this.LabelElement = null;

		//	overload
		this.OnChanged = function (NewValue)
		{
			Pop.Debug(`Pop.Gui.TextBox.OnChanged -> ${NewValue}`);
		}

		this.ContainerElement = this.CreateElement(Parent,Rect);
		this.InputElement = this.ContainerElement.InputElement;
		this.LabelElement = this.ContainerElement.LabelElement;
		this.BindEvents();
		this.RefreshLabel();
	}

	GetElement()
	{
		return this.ContainerElement;
	}

	GetValue()
	{
		return this.InputElement.value;
	}
	
	SetValue(Value)
	{
		this.InputElement.value = Value;
		this.RefreshLabel();
	}
	
	SetLabel(Value)
	{
		this.Label = Value;
		this.RefreshLabel();
	}
	
	RefreshLabel()
	{
		this.LabelElement.innerText = this.Label;
	}
	
	OnElementChanged(Event)
	{
		//	call our callback
		let Value = this.GetValue();
		this.RefreshLabel();
		this.OnChanged( Value );
	}
	
	CreateElement(Parent,Rect)
	{
		//	if it already exists, need to work out if it's an input or container
		const ExistingElement = GetExistingElement(Parent,'text');
		if (ExistingElement)
		{
			ExistingElement.InputElement = ExistingElement;
			ExistingElement.LabelElement = {};//	dummy
			return ExistingElement;
		}

		const ElementType = 'span';//'input';
		const Div = document.createElement(ElementType);
		SetGuiControlStyle(Div,Rect);
		Parent.AddChildControl(Parent,Div);

		const Input = document.createElement('input');
		SetGuiControl_SubElementStyle(Input,0,50);
		Input.type = 'text';
		Input.value = 'Pop.Gui.Button value';
		SetGuiControl_SubElementStyle( Input, 0, 50 );
		Div.InputElement = Input;
		Div.appendChild(Input);

		const Label = document.createElement('label');
		Label.innerText = 'TextBox';
		SetGuiControl_SubElementStyle( Label, 50, 100 );
		Div.LabelElement = Label;
		Div.appendChild( Label );
		
		return Div;
	}

	BindEvents()
	{
		super.BindEvents();

		const Input = this.InputElement;
		//	oninput = every change
		//	onchange = on lose focus
		Input.oninput = this.OnElementChanged.bind(this);
		Input.onchange = this.OnElementChanged.bind(this);
	}
}


export class ImageMap extends BaseControl
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




export class Table extends BaseControl
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
				SetStyle(Element,StyleName,Value);
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
