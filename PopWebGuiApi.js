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
	Element.style.border = '1px solid #000';
}

function SetGuiControl_SubElementStyle(Element)
{
	Element.style.display = 'block';
	Element.style.width = '100%';
	Element.style.position = 'absolute';
	Element.style.left = '0px';
	Element.style.right = '0px';
	Element.style.top = '0px';
	Element.style.bottom = '0px';
}

//	todo: DOM wrapper for gui
Pop.Gui.Window = function(Name,Rect,Resizable)
{
	this.CreateElement = function(Parent)
	{
		let Element = document.createElement('div');
		SetGuiControlStyle( Element, Rect );
		Element.innerText = 'Pop.Gui.Window';
		Element.style.zIndex = 1;
		Element.style.overflow = 'scroll';
		Parent.appendChild( Element );
		return Element;
	}
	
	this.EnableScrollbars = function(Horizontal,Vertical)
	{
		
	}

	this.Element = this.CreateElement(document.body);
}

Pop.Gui.Label = function(Parent, Rect)
{
	this.SetValue = function(Value)
	{
		this.Element.innerText = Value;
	}

	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		
		Div.innerText = 'Pop.Gui.Label';
		Parent.appendChild( Div );
		return Div;
	}

	this.Element = this.CreateElement(Parent.Element);
}

Pop.Gui.Slider = function(Parent,Rect,Notches)
{
	this.InputElement = null;
	
	this.SetMinMax = function(Min,Max)
	{
		this.InputElement.min = Min;
		this.InputElement.max = Max;
	}
	
	this.SetValue = function(Value)
	{
		this.InputElement.value = Value;
	}
	
	this.OnInputChanged = function(Event)
	{
		//	call our callback
		let Value = this.InputElement.value;
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		let Input = document.createElement('input');
		//	gr: what are defaults in pop?
		Input.min = 0;
		Input.max = 100;
		Input.value = 0;
		Input.type = 'range';
		SetGuiControl_SubElementStyle( Input );
		Input.oninput = this.OnInputChanged.bind(this);
		
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		//Div.innerText = 'Pop.Gui.Slider';
		
		Div.appendChild( Input );
		Parent.appendChild( Div );
		
		this.InputElement = Input;
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
}


Pop.Gui.TickBox = function(Parent,Rect)
{
	this.Value = false;
	this.Label = '';
	
	this.SetValue = function(Value)
	{
		this.Value = Value;
		this.RefreshLabel();
	}
	
	this.SetLabel = function(Value)
	{
		this.Label = Value;
		this.RefreshLabel();
	}
	
	this.RefreshLabel = function()
	{
		let TickString = this.Value ? '[true]' : '[false]';
		this.Element.innerText = TickString + ' ' + this.Label;
	}

	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		Parent.appendChild( Div );
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
	this.RefreshLabel();
}
