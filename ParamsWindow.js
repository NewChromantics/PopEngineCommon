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


Pop.ParamsWindow = function(Params,OnAnyChanged,WindowRect)
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
		
		if (Min == 'Button' && Pop.Gui.Button!==undefined)
		{
			Control = new Pop.Gui.Button(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			Control.OnClicked = function ()
			{
				//	call the control's OnChanged func
				const Value = GetValue();
				Control.OnChanged(Value,true);
			}			
			//const Control = new Pop.Gui.Button(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			//Control.SetLabel(Name);
		}
		else if (typeof Params[Name] === 'boolean')
		{
			Control = new Pop.Gui.TickBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			CleanValue = function (Value) { return Value == true; }
		}
		else if (typeof Params[Name] === 'string')
		{
			Control = new Pop.Gui.TextBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
		}
		else if (Min == 'Colour' && Pop.Gui.Colour === undefined)
		{
			//	no colour control, create a button
			//	todo: implement a colour swatch in the PopEngine
			//	todo: swap tickbox for a button when we have one
			//	gr: lets use a text box for now
			//	gr: could make 3 text boxes here
			Control = new Pop.Gui.TextBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			const ColourDecimals = 3;
			function StringToColourfff(String)
			{
				let rgb = String.split(',',3);
				while (rgb.length < 3) rgb.push('0');
				rgb = rgb.map(parseFloat);
				return rgb;
			}
			function StringToColour888(String)
			{
				let rgb = String.split(',',3);
				while (rgb.length < 3) rgb.push('0');
				rgb = rgb.map(parseFloat);
				rgb = rgb.map(Math.floor);
				return rgb;
			}
			function ColourfffToString(Colour)
			{
				let r = Colour[0].toFixed(ColourDecimals);
				let g = Colour[1].toFixed(ColourDecimals);
				let b = Colour[2].toFixed(ColourDecimals);
				return `${r},${g},${b}`;
			}
			function Colour888ToString(Colour)
			{
				//	gr: these should be floored...
				let r = Colour[0].toFixed(0);
				let g = Colour[1].toFixed(0);
				let b = Colour[2].toFixed(0);
				return `${r},${g},${b}`;
			}
			function ColourfffToColour888(Colour)
			{
				function fffTo888(f)
				{
					return Math.floor(f * 255);
				}
				return Colour.map(fffTo888);
			}
			function Colour888ToColourfff(Colour)
			{
				function _888Tofff(f)
				{
					return f / 255;
				}
				return Colour.map(_888Tofff);
			}

			const RealGetValue = GetValue;
			const RealSetValue = SetValue;
			const RealCleanValue = CleanValue || function (v) { return v };
			GetValue = function ()
			{
				const Colourfff = RealGetValue();
				const Colour888 = ColourfffToColour888(Colourfff);
				const String = Colour888ToString(Colour888);
				return String;
			}
			SetValue = function (ControlValue,IsFinalValue)
			{
				const Colour888 = StringToColour888(ControlValue);
				const Colourfff = Colour888ToColourfff(Colour888);
				RealSetValue(Colourfff,IsFinalValue);
			}
			GetLabelForValue = function (ControlValue)
			{
				const Colour888 = StringToColour888(ControlValue);
				const Colourfff = Colour888ToColourfff(Colour888);
				const rgb = ColourfffToString(Colourfff);
				return `${Name}: [${rgb}]`;
			}
			CleanValue = function (ControlValue)
			{
				let Colourfff = StringToColourfff(ControlValue);
				const Colour888 = ColourfffToColour888(Colourfff);
				Colourfff = Colour888ToColourfff(Colour888);
				const String = ColourfffToString(Colourfff);
				return String;
			}
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
	Pop.Debug("Using deprecated CreateParamsWindow(), switch to new Pop.TParamsWindow");
	const Window = new Pop.ParamsWindow(Params,OnAnyChanged,WindowRect);
	return Window;
}

function RunParamsHttpServer(Params,OnAnyChanged,Port=80)
{
	//	serve HTTP, which delivers a page that creates a params window!
	const Http = new Pop.Http.Server(Port);
	const Address = Http.GetAddress();
	Pop.Debug("Http server:",JSON.stringify(Address));

	//	gr: this should change to be a WaitForRequest(UrlMatch) and default will serve files

	//	note: this will GC the server if you don't save the variable!
	return Http;
}

