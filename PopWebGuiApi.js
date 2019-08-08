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
	
	this.OnElementChanged = function(Event)
	{
		//	call our callback
		let Value = this.InputElement.value;
		this.OnChanged( Value );
	}
	
	this.CreateElement = function(Parent)
	{
		let Input = document.createElement('input');
		this.InputElement = Input;
		
		//	gr: what are defaults in pop?
		Input.min = 0;
		Input.max = 100;
		Input.value = 0;
		Input.type = 'range';
		SetGuiControl_SubElementStyle( Input );
		Input.oninput = this.OnElementChanged.bind(this);
		
		
		let Div = document.createElement('div');
		SetGuiControlStyle( Div, Rect );
		//Div.innerText = 'Pop.Gui.Slider';
		
		Div.appendChild( Input );
		Parent.appendChild( Div );
		
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
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
		Parent.appendChild( Div );

		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
	this.RefreshLabel();
}



Pop.Gui.Colour = function(Parent,Rect)
{
	this.InputElement = null;
	this.LabelElement = null;
	
	this.GetValue = function()
	{
		let RgbHex = this.InputElement.value;
		let Rgbf = Pop.Colour.HexToRgbf( RgbHex );
		return Rgbf;
	}
	
	this.SetValue = function(Value)
	{
		let RgbHex = Pop.Colour.RgbfToHex( Value );
		this.InputElement.value = RgbHex;
	}
	
	this.SetLabel = function(Value)
	{
		this.LabelElement.innerText = Value;
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
		Parent.appendChild( Div );
		
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
}
