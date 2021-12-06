import PromiseQueue from './PromiseQueue.js'
import * as PopMath from './Math.js'
import Pop from './PopEngine.js'	//	for pop.gui.xxx

//	gr: need to sort a dependency system
//		PopEngineCommon/PopMath.js
function isFunction(functionToCheck)
{
	return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function isString(Variable)
{
	return typeof Variable === 'string';
}

function isTypedArray(obj)
{
	return !!obj && obj.byteLength !== undefined;
}

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
		//Pop.Debug("UpdateDisplay SetValue",JSON.stringify(this.ValueCache),typeof this.ValueCache);
		Control.SetValue(this.ValueCache);
		this.UpdateLabel(this.ValueCache);
	}

	let OnChanged = function (Value,IsFinalValue)
	{
		//	PopEngine returns typed arrays, we want regular arrays in controls
		//	(until we possibly need a control with a LOT of values)
		if (isTypedArray(Value))
		{
			Value = Array.from(Value);
		}

		//Pop.Debug("OnChanged",Value);

		//	let some controls send "not final value" so we can UI without expensive changes
		if (IsFinalValue === undefined)
			IsFinalValue = true;

		//	on changed
		//	clean value
		const OldValue = Value;
		Value = CleanValue(Value);
		this.UpdateLabel(Value);

		//	clean has changed the input, re-set it on the control
		//	gr: worried here that a control calls OnChanged again and we get recursion
		/*	gr: currently disabled as we're unable to type 1.1 in a string box that's cleaned to a float
		 *		maybe only do this OnFinalValue, but for a text box this would be return, or losing focus?
		if (OldValue !== Value)
		{
			Pop.Debug(`CleanValue corrected ${OldValue} to ${Value}, re-setting on control`);
			Control.SetValue(Value);
		}
		*/

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
		{
			LabelControl.SetText(Label);
			/*
			if (Control.SetText)
				Control.SetText("");*/
		}
		else if (Control.SetText)
		{
			Control.SetText(Label);
		}
	}
	
	Control.OnChanged = OnChanged.bind(this);
}

//	dummy window we can swap out quickly in code
//	change this so params window can just be hidden more easily?
export class DummyParamsWindow
{
	constructor()
	{
		this.OnParamChanged = function(){};
		this.OnParamsChanged = function(){};
		this.AddParam = function(){};
		this.GetParamMetas = function() {	return {};	};
		this.Window = {};
		this.Window.SetMinimised = function(){};
	}
	
	async WaitForParamsChanged()
	{
		return new Promise( function(res,rej){} );
	}
}


export class ParamsWindow
{
	constructor(Params,OnAnyChanged,WindowRect,WindowName="Params")
	{
		this.OnAnyChanged = OnAnyChanged || function(){};
		
		this.Params = Params;

		//	if the window rect is a string, then it's for gui/form/div mapping
		//	but to layout the controls, we still want some value
		const DefaultWidth = 600;
		WindowRect = WindowRect || [800,20,DefaultWidth,300];
		const WindowWidth = !isNaN(WindowRect[2]) ? WindowRect[2] : DefaultWidth;
		this.WindowWidth = WindowWidth;
		this.ControlTop = 10;

		this.Window = new Pop.Gui.Window(WindowName,WindowRect,false);
		this.Window.EnableScrollbars(false,true);
		this.Handlers = {};
		this.ParamMetas = {};
		this.WaitForParamsChangedPromiseQueue = new PromiseQueue();
	}
	
	async WaitForParamsChanged()
	{
		return this.WaitForParamsChangedPromiseQueue.WaitForNext();
	}

	GetParamMetas()
	{
		return this.ParamMetas;
	}

	GetMetaFromArguments(Arguments)
	{
		//	first is name
		const Name = Arguments.shift();
		function RenameFunc(Arg)
		{
			if (isFunction(Arg))
				return "function:" + Arg.name;
			return Arg;
		}
		Arguments = Arguments.map(RenameFunc);
		return Arguments;
	}

	//	add new control
	//	CleanValue = function
	//	Min can sometimes be a cleanvalue function
	//		AddParam('Float',Math.floor);
	//	TreatAsType overrides the control
	//		AddParam('Port',0,1,Math.floor,'String')
	AddParam(Name,Min,Max,CleanValue,TreatAsType)
	{
		try
		{
			this.AddParamUnsafe(...arguments);
		}
		catch(e)
		{
			Pop.Warning(e);
		}
	}
	
	AddParamUnsafe(Name,Min,Max,CleanValue,TreatAsType)
	{
		const Params = this.Params;
		const WindowWidth = this.WindowWidth;
		const LabelLeft = 10;
		const LabelWidth = WindowWidth * 0.3;
		const LabelHeight = 18;
		const ControlLeft = LabelLeft + LabelWidth + 10;
		const ControlWidth = WindowWidth - ControlLeft - 40;
		const ControlHeight = LabelHeight;
		const ControlSpacing = 10;


		this.ParamMetas[Name] = this.GetMetaFromArguments(Array.from(arguments));

		//	AddParam('x',Math.floor)
		if (isFunction(Min) && CleanValue === undefined)
		{
			CleanValue = Min;
			Min = undefined;
		}
		//	AddParam('x','Button')
		if (isString(Min) && TreatAsType === undefined)
		{
			TreatAsType = Min;
			Min = undefined;
		}
		//	AddParam('x',0,10,'String')
		if (isString(CleanValue) && TreatAsType === undefined)
		{
			TreatAsType = CleanValue;
			CleanValue = undefined;
		}
		//	AddParam('Index',[Enum0,Enum1,Enum2])
		if (Array.isArray(Min))
		{
			TreatAsType = Min;
			Min = undefined;
		}

		let GetValue = function ()
		{
			return Params[Name];
		}
		let SetValue = function (Value,IsFinalValue)
		{
			Params[Name] = Value;
			this.OnAnyChanged(Params,Name,Value,IsFinalValue);
			this.WaitForParamsChangedPromiseQueue.Push([Params,Name,Value,IsFinalValue]);
		}.bind(this);
		let IsValueSignificantChange = function (Old,New)
		{
			return Old != New;
		}
		let GetLabelForValue = undefined;

		function MakeControl(Type,Rect,Suffix='')
		{
			try
			{
				return new Type(Window,`${Name}${Suffix}`);
			}
			catch(e)
			{
				return new Type(Window,Rect);
			}
		}


		let Window = this.Window;
		let ControlTop = this.ControlTop;
		const LabelTop = ControlTop;
		const LabelControl = MakeControl(Pop.Gui.Label,[LabelLeft,LabelTop,LabelWidth,LabelHeight],'Label');
		LabelControl.SetText(Name);
		let Control = null;

		if (TreatAsType == 'Button' && Pop.Gui.Button !== undefined)
		{
			Control = MakeControl(Pop.Gui.Button,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			Control.OnClicked = function ()
			{
				//	call the control's OnChanged func
				const Value = GetValue();
				//	gr: if a function assigned, call it
				//		otherwise, we're triggering a fake change
				if ( isFunction(Value) )
					Value();
				else
					Control.OnChanged(Value,true);
			}
			GetLabelForValue = () => {	return Name;	}; 
			//const Control = new Pop.Gui.Button(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			//Control.SetLabel(Name);
		}
		else if (typeof Params[Name] === 'boolean')
		{
			Control = MakeControl(Pop.Gui.TickBox,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			CleanValue = function (Value) { return Value == true; }
		}
		else if (isString(Params[Name]))
		{
			Control = MakeControl(Pop.Gui.TextBox,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
		}
		else if (TreatAsType == 'Colour' && Pop.Gui.Colour === undefined)
		{
			//	no colour control, create a button
			//	todo: implement a colour swatch in the PopEngine
			//	todo: swap tickbox for a button when we have one
			//	gr: lets use a text box for now
			//	gr: could make 3 text boxes here
			Control = MakeControl(Pop.Gui.TextBox,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
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
		else if (TreatAsType == 'Colour' && Pop.Gui.Colour !== undefined)
		{
			Control = MakeControl(Pop.Gui.Colour,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
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
		else if (typeof Params[Name] === 'number' && TreatAsType == 'String')
		{
			//	add a default to-number clean
			if (!CleanValue)
				CleanValue = function (v) { return Number(v); };

			Control = MakeControl(Pop.Gui.TextBox,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);

			const RealGetValue = GetValue;
			const RealSetValue = SetValue;
			const RealCleanValue = CleanValue || function (v) { return v };
			GetValue = function ()
			{
				//	control wants a string
				return '' + RealGetValue();
			}
			SetValue = function (ControlValue,IsFinalValue)
			{
				//	control gives a string, output a number
				const NumberValue = Number(ControlValue);
				//	this should have been cleaned, but maybe needs it agian?
				RealSetValue(NumberValue,IsFinalValue);
			}
			GetLabelForValue = function (ControlValue)
			{
				const NumberValue = Number(ControlValue);
				return Name + ': ' + NumberValue;
			}
			CleanValue = function (ControlValue)
			{
				//	convert to number, clean, convert back to string
				let NumberValue = Number(ControlValue);
				NumberValue = RealCleanValue(NumberValue);
				return '' + NumberValue;
			}
		}
		else
		{
			//	todo: dropdown list that's an enum
			const IsEnum = (typeof Params[Name] === 'number') && Array.isArray(TreatAsType);

			if (IsEnum)
			{
				//	todo: get key count and use those
				Min = 0;
				Max = TreatAsType.length - 1;
				CleanValue = Math.floor;
			}

			//Pop.Debug("Defaulting param to number, typeof",typeof Params[Name]);
			//	no min/max should revert to a string editor?
			if (Min === undefined) Min = 0;
			if (Max === undefined) Max = 100;
			//	non-specific control, slider
			//	slider values are all int (16bit) so we need to normalise the value
			const TickMin = 0;
			const TickMax = (CleanValue === Math.floor) ? (Max - Min) : 1000;
			const Notches = (CleanValue === Math.floor) ? (Max - Min) : 10;
			Control = MakeControl(Pop.Gui.Slider,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			Control.SetMinMax(TickMin,TickMax,Notches);

			const RealGetValue = GetValue;
			const RealSetValue = SetValue;
			const RealCleanValue = CleanValue || function (v) { return v };
			GetValue = function ()
			{
				const RealValue = RealGetValue();
				const NormValue = PopMath.Range(Min,Max,RealValue);
				const ControlValue = PopMath.Lerp(TickMin,TickMax,NormValue);
				return ControlValue;
			}
			SetValue = function (ControlValue,IsFinalValue)
			{
				const NormValue = PopMath.Range(TickMin,TickMax,ControlValue);
				let RealValue = PopMath.Lerp(Min,Max,NormValue);
				RealValue = RealCleanValue(RealValue);
				RealSetValue(RealValue,IsFinalValue);
			}
			GetLabelForValue = function (ControlValue)
			{
				const NormValue = PopMath.Range(TickMin,TickMax,ControlValue);
				const RealValue = PopMath.Lerp(Min,Max,NormValue);
				let Value = RealCleanValue(RealValue);
				if (IsEnum)
				{
					Pop.Debug("Enum",Value,TreatAsType);
					const EnumLabel = TreatAsType[Value];
					return Name + ': ' + EnumLabel;
				}
				return Name + ': ' + Value;
			}
			CleanValue = function (ControlValue)
			{
				let NormValue = PopMath.Range(TickMin,TickMax,ControlValue);
				let RealValue = PopMath.Lerp(Min,Max,NormValue);
				let Value = RealCleanValue(RealValue);
				NormValue = PopMath.Range(Min,Max,RealValue);
				ControlValue = PopMath.Lerp(TickMin,TickMax,NormValue);
				return ControlValue;
			}
		}

		//	no clean specified
		if (!CleanValue)
		{
			CleanValue = function (v) { return v; }
		}

		//	default label
		if (!GetLabelForValue)
		{
			GetLabelForValue = function (Value)
			{
				return Name + ': ' + Value;
			}
		}

		const Handler = new TParamHandler(Control,LabelControl,GetValue,GetLabelForValue,CleanValue,SetValue,IsValueSignificantChange);
		this.Handlers[Name] = Handler;
		//	init
		Handler.UpdateDisplay();

		this.ControlTop += ControlHeight;
		this.ControlTop += ControlSpacing;
	}
	
	//	changed externally, update display
	OnParamChanged(Name)
	{
		const Handler = this.Handlers[Name];
		if (!Handler)
		{
			Pop.Warning(`Tried to change param ${Name} but no control assigned`);
			//throw "Tried to change param " + Name + " but no control assigned";
			return;
		}
		Handler.UpdateDisplay();
	}

	//	changed externally
	OnParamsChanged()
	{
		const Keys = Object.keys(this.Handlers);
		//Pop.Debug("OnParamsChanged",Keys);
		const UpdateInParams = true;
		for (const Key of Keys)
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



export function RunParamsWebsocketServer(Port,OnJsonRecieved)
{
	let CurrentSocket = null;
	
	async function Loop()
	{
		while (true)
		{
			try
			{
				Pop.Debug()
				const Socket = new Pop.Websocket.Server(Port);
				CurrentSocket = Socket;
				while (true)
				{
					const Message = await Socket.WaitForMessage();
					Pop.Debug("Got message",JSON.stringify(Message));
					const ParamsJson = JSON.parse(Message.Data);
					OnJsonRecieved(ParamsJson);
				}
			}
			catch (e)
			{
				Pop.Debug("ParamsWebsocketServer error",e);
				CurrentSocket = null;
			}
			await Pop.Yield(1000);
		}
	}
	Loop().then(Pop.Debug).catch(Pop.Warning);

	const Output = {};
	Output.SendJson = function (Object)
	{
		if (!CurrentSocket)
		{
			Pop.Debug("SendJson - not currently connected");
			//throw "Not currently connected";
			return;
		}
		const JsonString = JSON.stringify(Object,null,'\t');
		const Peers = CurrentSocket.GetPeers();
		function Send(Peer)
		{
			CurrentSocket.Send(Peer,JsonString);
		}
		Peers.forEach(Send);
	}

	Output.GetUrl = function ()
	{
		if (!CurrentSocket)
			throw "Not currently connected";
		const Addresses = CurrentSocket.GetAddress();
		function AddressToUrl(Address)
		{
			return `ws://${Address.Address}`;
		}
		const Urls = Addresses.map(AddressToUrl);
		return Urls;
	}

	return Output;
}

export function RunParamsHttpServer(Params,ParamsWindow,Port=80)
{
	function OnJsonRecieved(Json)
	{
		//Pop.Debug("Web changed params");
		try
		{
			Object.assign(Params,Json);
			ParamsWindow.OnParamsChanged(Params);
		}
		catch (e)
		{
			Pop.Debug("Exception setting new web params",JSON.stringify(Json));
		}
	}

	const WebocketPort = Port + 1;
	//	create websocket server to send & recieve param changes
	const Websocket = RunParamsWebsocketServer(WebocketPort,OnJsonRecieved);

	function SendNewParams(Params)
	{
		Websocket.SendJson(Params);
	}

	//	kick off async loop waiting for change
	async function ParamsWindowWaitForChangeLoop()
	{
		while (true)
		{
			await ParamsWindow.WaitForParamsChanged();
			SendNewParams(Params);
		}
	}
	ParamsWindowWaitForChangeLoop().then(Pop.Debug).catch(Pop.Warning);

	function GetParamMetas()
	{
		if (!ParamsWindow)
			return {};

		return ParamsWindow.GetParamMetas();
	}

	function HandleVirtualFile(Response)
	{
		//	redirect PopEngine files to local filename
		const Filename = Response.Url;

		if (Filename == "Websocket.json")
		{
			Response.Content = JSON.stringify(Websocket.GetUrl());
			Response.StatusCode = 200;
			return;
		}

		if (Filename == "Params.json")
		{
			Response.Content = JSON.stringify(Params,null,'\t');
			Response.StatusCode = 200;
			return;
		}

		if (Filename == "ParamMetas.json")
		{
			const ParamMetas = GetParamMetas();
			Response.Content = JSON.stringify(ParamMetas,null,'\t');
			Response.StatusCode = 200;
			return;
		}

		if (Filename.startsWith('PopEngineCommon/'))
		{
			return "../" + Filename;
		}

		//	some other file
		return Response;
	}

	//	serve HTTP, which delivers a page that creates a params window!
	const Http = new Pop.Http.Server(Port,HandleVirtualFile);
	const Address = Http.GetAddress();
	Pop.Debug("Http server:",JSON.stringify(Address));

	Http.GetUrl = function ()
	{
		return 'http://' + Address[0].Address;
	}
	//	gr: this should change to be a WaitForRequest(UrlMatch) and default will serve files

	//	note: this will GC the server if you don't save the variable!
	return Http;
}

export default ParamsWindow;
