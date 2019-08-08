Pop.Gui = {};

//	todo: DOM wrapper for gui
Pop.Gui.Window = function(Name,Rect,Resizable)
{
	this.CreateElement = function(Parent)
	{
		let Left = Rect[0];
		let Right = Rect[0] + Rect[2];
		let Top = Rect[1];
		let Bottom = Rect[1] +  Rect[3];
		
		let Element = document.createElement('div');
		Element.style.position = 'absolute';
		Element.style.left = Left+'px';
		//Element.style.right = Right+'px';
		Element.style.top = Top+'px';
		//Element.style.bottom = Bottom+'px';
		Element.style.width = Rect[2]+'px';
		Element.style.height = Rect[3]+'px';
		Element.style.border = '1px solid #000';
		Element.innerText = 'Pop.Gui.Window';
		Element.style.zIndex = 1;
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
		Div.style.position = 'relative';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Div.innerText = 'Pop.Gui.Label';
		Parent.appendChild( Div );
		return Div;
	}

	this.Element = this.CreateElement(Parent.Element);
}


Pop.Gui.Slider = function(Parent,Rect,Notches)
{
	this.SetMinMax = function(Min,Max)
	{
		
	}
	
	this.SetValue = function(Value)
	{
		
	}
	
	this.CreateElement = function(Parent)
	{
		let Div = document.createElement('div');
		Div.style.position = 'relative';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Div.innerText = 'Pop.Gui.Slider';
		Parent.appendChild( Div );
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
		Div.style.position = 'relative';
		Div.style.left = Rect[0];
		Div.style.right = Rect[0] + Rect[2];
		Div.style.top = Rect[1];
		Div.style.bottom = Rect[1] +  Rect[3];
		Div.style.border = '1px solid #000';
		Parent.appendChild( Div );
		return Div;
	}
	
	this.Element = this.CreateElement(Parent.Element);
	this.RefreshLabel();
}
