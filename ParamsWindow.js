
function CreateParamsWindow(Params,OnAnyChanged)
{
	OnAnyChanged = OnAnyChanged || function(){};
	
	let WindowRect = [20,20,500,300];
	let ControlTop = 10;

	const LabelLeft = 10;
	const LabelWidth = 220;
	const LabelHeight = 28;
	const ControlLeft = LabelLeft + LabelWidth + 10;
	const ControlWidth = WindowRect[2] - ControlLeft - 40;
	const ControlHeight = LabelHeight;
	const ControlSpacing = 10;

	let Window = new Pop.Gui.Window("Params",WindowRect,false);
	Window.EnableScrollbars(false,true);
	Window.Controls = [];
	Window.Labels = [];

	Window.OnParamChanged = function(Name)
	{
		if ( !this.Controls.hasOwnProperty(Name) )
		{
			Pop.Debug("Tried to change param " + Name + " but no control assigned");
			return;
		}
		
		let Control = this.Controls[Name];
		let Value = Params[Name];
		Pop.Debug("Updating control", JSON.stringify(Control), Value );
		Control.SetValue( Value );
		Control.OnChanged( Value );
	}
	
	let AddSlider = function(Name,Min,Max,CleanValue)
	{
		if ( !CleanValue )
			CleanValue = function(v)	{	return v;	}
			
		let LabelTop = ControlTop;
		let Label = new Pop.Gui.Label( Window, [LabelLeft,LabelTop,LabelWidth,LabelHeight] );
		
		let Control;
		if ( typeof Params[Name] === 'boolean' )
		{
			Control = new Pop.Gui.TickBox( Window, [ControlLeft,ControlTop,ControlWidth,ControlHeight] );
			Control.SetValue( Params[Name] );
			
			Control.OnChanged = function(Value)
			{
				Value = CleanValue(Value);
				Params[Name] = Value;
				Label.SetValue( Name + ": " + Value );
				OnAnyChanged(Params);
			}
			
			//	init label
			Control.OnChanged( Params[Name] );
		}
		else if ( Min == 'Colour' )
		{
			Control = new Pop.Gui.TickBox( Window, [ControlLeft,ControlTop,ControlWidth,ControlHeight] );
			Control.SetValue(false);
			
			let GetValue8 = function(Rgbf)
			{
				let Rgb8 = [ Rgbf[0]*255, Rgbf[1]*255, Rgbf[2]*255 ];
				return Rgb8;
			}
			
			Control.OnChanged = function(Value)
			{
				//	unticked, hide (should remove all references... but isn't)
				if ( !Value )
				{
					Control.ColourPicker = null;
					return;
				}
				
				let Rgbf = Params[Name];
				let Rgb8 = GetValue8( Rgbf );
				
				let ColourPicker = new Pop.Gui.ColourPicker( Rgb8 );
				Control.ColourPicker = ColourPicker;
				
				ColourPicker.OnChanged = function(Rgb8)
				{
					let r = Rgb8[0] / 255.0;
					let g = Rgb8[1] / 255.0;
					let b = Rgb8[2] / 255.0;
					Value = [r,g,b];
					Value = CleanValue(Value);
					Params[Name] = Value;
					Control.UpdateLabel( Value );
					OnAnyChanged(Params);
				}
				
				ColourPicker.OnClosed = function()
				{
					Control.ColourPicker = null;
					Control.SetValue(false);	//	untick
				}
			}
			
			Control.UpdateLabel = function(Value)
			{
				let Value8 = GetValue8( Value );
				Control.SetLabel("RGB " + Value8 );
			}
			
			//	init label
			Control.UpdateLabel( Params[Name] );
		}
		else
		{
			const TickScalar = (CleanValue===Math.floor) ? Max : 1000;
			const Notches = (CleanValue===Math.floor) ? Max : false;
			let Slider = new Pop.Gui.Slider( Window, [ControlLeft,ControlTop,ControlWidth,ControlHeight], Notches );
			Slider.SetMinMax( 0, TickScalar );
			let Valuef = Math.range( Min, Max, Params[Name] );
			let Valuek = Valuef * TickScalar;
			Slider.SetValue( Valuek );
			
			Slider.OnChanged = function(Valuek)
			{
				let Valuef = Valuek/TickScalar;
				let Value = Math.lerp( Min, Max, Valuef );
				Value = CleanValue(Value);
				Params[Name] = Value;
				Label.SetValue( Name + ": " + Value );
				
				OnAnyChanged(Params);
			}
			
			//	init label
			Slider.OnChanged( Valuek );
			Control = Slider;
		}
		
		ControlTop += ControlHeight;
		ControlTop += ControlSpacing;
		
		
		//	save objects
		Window.Controls[Name] = Control;
		Window.Labels[Name] = Label;
	}
	
	Window.AddParam = AddSlider;
	
	
	return Window;
}

