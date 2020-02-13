Pop.Gui = {};


function SetGuiControlStyle(Element,Rect)
{
	let Left = Rect[0];
	let Right = Rect[0] + Rect[2];
	let Top = Rect[1];
	let Bottom = Rect[1] +  Rect[3];
	
	Element.style.position = 'absolute';
	Element.style.left = Left+'px';
	//Element.style.right = Right+'px';
	Element.style.top = Top+'px';
	//Element.style.bottom = Bottom+'px';
	Element.style.width = Rect[2]+'px';
	Element.style.height = Rect[3]+'px';
	//Element.style.border = '1px solid #000';
}

function SetGuiControl_SubElementStyle(Element,LeftPercent=0,RightPercent=100)
{
	Element.style.display = 'block';
	Element.style.width = (RightPercent-LeftPercent) + '%';
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
	let absolutePosition = GetElementRect;
	let el = Element;
	//	need to cope with scroll, not just getBoundingClientRect :/
	//	https://stackoverflow.com/a/32623832/355753
	let
	found,
	left = 0,
	top = 0,
	width = 0,
	height = 0,
	offsetBase = absolutePosition.offsetBase;
	if (!offsetBase && document.body) {
		offsetBase = absolutePosition.offsetBase = document.createElement('div');
		offsetBase.style.cssText = 'position:absolute;left:0;top:0';
		document.body.appendChild(offsetBase);
	}
	if (el && el.ownerDocument === document && 'getBoundingClientRect' in el && offsetBase) {
		let boundingRect = el.getBoundingClientRect();
		let baseRect = offsetBase.getBoundingClientRect();
		found = true;
		left = boundingRect.left - baseRect.left;
		top = boundingRect.top - baseRect.top;
		width = boundingRect.right - boundingRect.left;
		height = boundingRect.bottom - boundingRect.top;
	}
	return {
	found: found,
	left: left,
	top: top,
	width: width,
	height: height,
	right: left + width,
	bottom: top + height,
	x: left,
	y: top,
	xy: float2(left,top)
	};
}

function SetGuiControl_Draggable(Element)
{
	let AllowInteraction = function(Event)
	{
		//	gr: if we prevent too events (or dont preventdefault)
		//		then quick movements can fall onto window, and we're not currently
		//		handling when we move without starting with mousedown
		if ( Event.target != Element )
			return false;
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
		OnMouseDrag(e);
		
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
		}
		else
		{
			console.log("revert droppable");
			//	revert the drag
			if ( Element.OnGrabRevert != null )
			{
				Element.OnGrabRevert();
			}
		}
		Element.OnGrabRevert = null;
		
		Element.onmouseup = null;
		Element.onmousemove = null;
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
		//	need to make any children go above that though
		//let ElementCardChildren = GetCardChildren(Element);
		//ElementCardChildren.forEach( SetElementToTop );
		
		Element.grabClientX = e.clientX;
		Element.grabClientY = e.clientY;
		let ClientRect = GetElementRect(Element);
		Element.grabLocalX = Element.grabClientX - ClientRect.x;
		Element.grabLocalY = Element.grabClientY - ClientRect.y;
		Element.startDragX = ClientRect.x;
		Element.startDragY = ClientRect.y;
		
		//	convert element to absolute
		SetElementPosition( Element, Element.startDragX, Element.startDragY );
		
		Element.onmouseup = OnMouseUp;
		Element.onmousemove = OnMouseDrag;
		//	capture document mouse up in case the user drags off-window
		document.onmouseup = OnMouseUp;
		//	capture document mouse move for when the user moves the mouse so fast it goes off the element, and we don't get mousemove any more
		document.onmousemove = OnMouseDrag;
	};
	
	let OnDetachElement = function(Element)
	{
		/*
		//	can't pickup a mystery card
		if ( IsCardMystery(Element) )
			return null;
		if ( !IsCard(Element) )
			return null;
		
		//	take any non mystery card, but take all those below it too
		//	gr: maybe the actual detatching needs to be here...
		let ElementLatterCards = GetCardChildren(DeckElement,Element);
		let ParentToElement = function(ChildElement)
		{
			SetElementParent( ChildElement, Element );
		};
		ElementLatterCards.forEach( ParentToElement );
		*/
		//	rememeber to put the cards back in order!
		let Revert = function()
		{
			/*
			SetElementParent( Element, DeckElement );
			let ElementChildren = GetCardChildren(Element);
			let ReplaceToDeck = function(ec)
			{
				SetElementParent( ec, DeckElement );
			};
			ElementChildren.forEach(ReplaceToDeck);
			 */
		};
		return Revert;
	};
	
	Element.onmousedown = OnMouseDown;
	Element.parentNode.OnDetachElement = OnDetachElement;
}

Pop.Gui.Window = function(Name,Rect,Resizable)
{
	//	child controls should be added to this
	this.ElementParent = null;

	//	gr: element may not be assigned yet, maybe rework construction of controls
	this.AddChildControl = function(Child,Element)
	{
		//Element.style.zIndex = 2;
		this.ElementParent.appendChild( Element );
	}
	
	this.CreateElement = function(Parent)
	{
		let Element = document.createElement('div');
		SetGuiControlStyle( Element, Rect );
		//Element.innerText = 'Pop.Gui.Window';
		Element.style.zIndex = $HighestZ;
		//Element.style.overflow = 'scroll';	//	inner div handles scrolling
		Element.className = 'PopGuiWindow';
		Parent.appendChild( Element );
		SetGuiControl_Draggable( Element );
		
		//	purely for styling
		let AddChild = function(Parent,ClassName,InnerText='')
		{
			let Child = document.createElement('div');
			Child.className = ClassName;
			Child.innerText = InnerText;
			Parent.appendChild( Child );
			return Child;
		}
		const TitleBar = AddChild( Element, 'PopGuiTitleBar');
		TitleBar.style.pointerEvents = 'none';
		//AddChild( TitleBar, 'PopGuiTitleIcon', 'X');
		AddChild( TitleBar, 'PopGuiTitleText', Name );
		//AddChild( TitleBar, 'PopGuiButton', '_');
		//AddChild( TitleBar, 'PopGuiButton', 'X');
		
		//	this may need some style to force position
		this.ElementParent = AddChild( Element, 'PopGuiIconView');
		//	need to make this absolute as the new static position-base for child controls
		this.ElementParent.style.position = 'absolute';
		this.ElementParent.style.top = '0px';
		this.ElementParent.style.left = '0px';
		this.ElementParent.style.right = '0px';
		this.ElementParent.style.bottom = '0px';
		//	toggle this with enablescrollbars
		this.ElementParent.style.overflow = 'scroll';
		
		return Element;
	}
	
	this.EnableScrollbars = function(Horizontal,Vertical)
	{
		
	}

	this.Element = this.CreateElement(document.body);
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

Pop.Gui.Label = function(Parent, Rect)
{
	this.ValueCache = null;
	
	this.SetValue = function(Value)
	{
		//	avoid DOM changes as much as possible
		if ( this.ValueCache == Value )
			return;
		
		//	inner html is slow!
		if ( typeof Value == 'string' && Value.includes('<') )
			this.Element.innerHTML = Value;
		else
			this.Element.innerText = Value;
		this.ValueCache = Value;
	}

	this.CreateElement = function(Parent)
	{
		let Div = GetExistingElement(Parent);
		if ( Div )
			return Div;
		
		Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		
		Div.innerText = 'Pop.Gui.Label';
		Parent.AddChildControl( Parent, Div );
		return Div;
	}

	this.Element = this.CreateElement(Parent);
}



Pop.Gui.Button = function(Parent, Rect)
{
	this.OnClicked = function()
	{
		Pop.Debug("Pop.Gui.Button.OnClicked");
	}
	
	this.SetLabel = function(Value)
	{
		Pop.Debug("Set button label",Value);
		if ( this.Element.type && this.Element.type == 'button' )
			this.Element.value = Value;
		else if ( this.Element.innerText !== undefined )
			this.Element.innerText = Value;
		else
			throw "Not sure how to set label on this button " + this.Element.constructor;
	}
	this.SetValue = this.SetLabel;
	
	this.OnElementClicked = function(Event)
	{
		this.OnClicked();
	}
	
	this.CreateElement = function(Parent)
	{
		let SetupEvents = function(Element)
		{
			//	make sure its clickable!
			Element.style.pointerEvents = 'auto';
			Element.style.cursor = 'pointer';
			
			//	gr; this overrides old instance
			Element.oninput = this.OnElementClicked.bind(this);
			Element.onclick = this.OnElementClicked.bind(this);
		}.bind(this);
		
		let Div = GetExistingElement(Parent);
		if ( Div )
		{
			SetupEvents(Div);
			return Div;
		}
		
		Div = document.createElement('input');
		SetGuiControlStyle( Div, Rect );
		Div.type = 'button';
		SetupEvents(Div);
		
		Div.innerText = 'Pop.Gui.Button innertext';
		Div.value = 'Pop.Gui.Button value';
		Parent.AddChildControl( Parent, Div );
		return Div;
	}
	
	this.Element = this.CreateElement(Parent);
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
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		const ListenToInput = function(InputElement)
		{
			InputElement.addEventListener('input', this.OnElementChanged.bind(this) );
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
