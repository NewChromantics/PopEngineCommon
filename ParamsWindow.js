//	gr: need to sort a dependency system
//		PopEngineCommon/PopMath.js


//	user changes -> control changes -> update label, update data, save
//	data changes -> change control -> update label
function TParamHandler(Control,LabelControl,GetValue,GetLabelForValue,CleanValue,SetValue,IsValueSignificantChange)
{
	this.Control = Control;
	this.LabelControl = LabelControl;

	//	we use undefined for invalidation, so GetValue() cannot return that
	if (GetValue() === undefined)
		throw "GetValue() should never return undefined";

	this.ValueCache = undefined;

	this.UpdateDisplay = function ()
	{
		//	set new value
		//		set cached
		this.ValueCache = GetValue();
		//		set control (should invoke change)
		//		gr: DOES NOT invoke change unless done by user!
		Control.SetValue(this.ValueCache);
		this.UpdateLabel(this.ValueCache);
	}

	let OnChanged = function (Value,IsFinalValue)
	{
		//Pop.Debug("OnChanged",Value);

		//	let some controls send "not final value" so we can UI without expensive changes
		if (IsFinalValue === undefined)
			IsFinalValue = true;

		//	on changed
		//	clean value
		Value = CleanValue(Value);
		this.UpdateLabel(Value);

		//	is value much different from cache?
		//	gr: this check was for when re-setting value would trigger OnChange, but it doesnt (on windows)
		/*
		const Changed = (this.ValueCache === undefined) ? true : IsValueSignificantChange(this.ValueCache,Value);
		if (!Changed)
		{
			return;
		}
		*/
		//			save cache
		//			report changed
		this.ValueCache = Value;
		SetValue(Value,IsFinalValue);
	}

	this.UpdateLabel = function (Value)
	{
		const Label = GetLabelForValue(Value);

		//	set label (always!)
		if (LabelControl)
			LabelControl.SetValue(Label);
		if (Control.SetLabel)
			Control.SetLabel(Label);
	}
	
	Control.OnChanged = OnChanged.bind(this);
}


Pop.TParamsWindow = function(Params,OnAnyChanged,WindowRect)
{
	OnAnyChanged = OnAnyChanged || function(){};
	
	WindowRect = WindowRect || [800,20,600,300];
	this.ControlTop = 10;

	const LabelLeft = 10;
	const LabelWidth = WindowRect[2] * 0.3;
	const LabelHeight = 18;
	const ControlLeft = LabelLeft + LabelWidth + 10;
	const ControlWidth = WindowRect[2] - ControlLeft - 40;
	const ControlHeight = LabelHeight;
	const ControlSpacing = 10;

	this.Window = new Pop.Gui.Window("Params",WindowRect,false);
	this.Window.EnableScrollbars(false,true);
	this.Handlers = {};
	
	//	add new control
	this.AddParam = function(Name,Min,Max,CleanValue)
	{
		let GetValue = function ()
		{
			return Params[Name];
		}
		let SetValue = function (Value,IsFinalValue)
		{
			Params[Name] = Value;
			OnAnyChanged(Params,Name,Value,IsFinalValue);
		}
		let IsValueSignificantChange = function (Old,New)
		{
			return Old != New;
		}
		let GetLabelForValue = function (Value)
		{
			return Name + ': ' + Value;
		}

		let Window = this.Window;
		let ControlTop = this.ControlTop;
		const LabelTop = ControlTop;
		const LabelControl = new Pop.Gui.Label(Window,[LabelLeft,LabelTop,LabelWidth,LabelHeight]);
		LabelControl.SetValue(Name);
		let Control = null;
				
		if (Min == 'Button')
		{
			Control = new Pop.Gui.Button(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			throw "todo: button";
			/*
			const Control = new Pop.Gui.Button(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			Control.SetLabel(Name);
			Control.OnClicked = function ()
			{
				OnAnyChanged(Params,Name);
			}
			Handler = new TParamHandler(Control,LabelControl)
			*/
		}
		else if (typeof Params[Name] === 'boolean')
		{
			Control = new Pop.Gui.TickBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			CleanValue = function (Value) { return Value == true; }
		}
		else if (typeof Params[Name] === 'string')
		{
			ControlConstructor = Pop.Gui.TextBox;
		}
		else if (Min == 'Colour' && Pop.Gui.Colour === undefined)
		{
			throw "todo colour control";
			//	no colour control, create a tick box
			Control = new Pop.Gui.TickBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			/*
			 * Control = new Pop.Gui.TickBox( Window, [ControlLeft,ControlTop,ControlWidth,ControlHeight] );
			Control.SetControlValue = Control.SetValue;
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
					OnAnyChanged( Params, Name, );
				}

				ColourPicker.OnClosed = function()
				{
					Control.ColourPicker = null;
					Control.SetValue(false);	//	untick
				}
			}
			Control.OnValueChanged = Control.OnChanged;

			Control.UpdateLabel = function(Value)
			{
				let r = Value[0].toFixed(2);
				let g = Value[1].toFixed(2);
				let b = Value[2].toFixed(2);
				let Valuef = [r,g,b];
				Control.SetLabel( "[" + Valuef + "]" );
			}

			//	init label
			Control.UpdateLabel( Params[Name] );
			*/
		}
		else if (Min == 'Colour' && Pop.Gui.Colour !== undefined)
		{
			Control = new Pop.Gui.Colour(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			CleanValue = function (Valuefff)
			{
				Pop.Debug(`CleanValue(${Valuefff}) for colour`);
				return Valuefff;
			}
			GetLabelForValue = function (Value)
			{
				let r = Value[0].toFixed(2);
				let g = Value[1].toFixed(2);
				let b = Value[2].toFixed(2);
				return `[${r},${g},${b}]`;
			}
		}
		else
		{
			//	no min/max should revert to a string editor?
			if (Min === undefined)	Min = 0;
			if (Max === undefined)	Max = 100;
			//	non-specific control, slider
			//	slider values are all int (16bit) so we need to normalise the value
			const TickMin = 0;
			const TickMax = (CleanValue === Math.floor) ? (Max - Min) : 1000;
			const Notches = (CleanValue === Math.floor) ? (Max - Min) : 10;
			Control = new Pop.Gui.Slider(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			Control.SetMinMax(TickMin,TickMax,Notches);

			const RealGetValue = GetValue;
			const RealSetValue = SetValue;
			const RealCleanValue = CleanValue || function (v) { return v };
			GetValue = function ()
			{
				const RealValue = RealGetValue();
				const NormValue = Math.Range(Min,Max,RealValue);
				const ControlValue = Math.Lerp(TickMin,TickMax,NormValue);
				return ControlValue;
			}
			SetValue = function (ControlValue,IsFinalValue)
			{
				const NormValue = Math.Range(TickMin,TickMax,ControlValue);
				const RealValue = Math.Lerp(Min,Max,NormValue);
				//	this should have been cleaned, but maybe needs it agian?
				RealSetValue(RealValue,IsFinalValue);
			}
			GetLabelForValue = function (ControlValue)
			{
				const NormValue = Math.Range(TickMin,TickMax,ControlValue);
				const RealValue = Math.Lerp(Min,Max,NormValue);
				let Value = RealCleanValue(RealValue);
				return Name + ': ' + Value;
			}
			CleanValue = function (ControlValue)
			{
				let NormValue = Math.Range(TickMin,TickMax,ControlValue);
				let RealValue = Math.Lerp(Min,Max,NormValue);
				let Value = RealCleanValue(RealValue);
				NormValue = Math.Range(Min,Max,RealValue);
				ControlValue = Math.Lerp(TickMin,TickMax,NormValue);
				return ControlValue;
			}
		}

		//	no clean specified
		if (!CleanValue)
		{
			CleanValue = function (v) { return v; }
		}

		const Handler = new TParamHandler(Control,LabelControl,GetValue,GetLabelForValue,CleanValue,SetValue,IsValueSignificantChange);
		this.Handlers[Name] = Handler;
		//	init
		Handler.UpdateDisplay();

		this.ControlTop += ControlHeight;
		this.ControlTop += ControlSpacing;
	}
	
	//	changed externally, update display
	this.OnParamChanged = function (Name)
	{
		const Handler = this.Handlers[Name];
		if (!Handler)
			throw "Tried to change param " + Name + " but no control assigned";

		Handler.UpdateDisplay();
	}

	//	changed externally
	this.OnParamsChanged = function ()
	{
		const Keys = Object.keys(this.Handlers);
		Pop.Debug("OnParamsChanged",Keys);
		const UpdateInParams = true;
		for (const Key in Keys)
		{
			try
			{
				this.OnParamChanged(Key);
			}
			catch (e)
			{
				Pop.Debug("OnParamChanged(" + Key + ") error",e);
			}
		}
	}
	
}



function CreateParamsWindow(Params,OnAnyChanged,WindowRect)
{
	const Window = new Pop.TParamsWindow(Params,OnAnyChanged,WindowRect);
	return Window;
}

