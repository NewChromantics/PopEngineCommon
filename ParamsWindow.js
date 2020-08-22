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
		Pop.Debug(`Control changed ${Value}`);
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
			LabelControl.SetValue(Label);
			if (Control.SetLabel)
				Control.SetLabel("");
		}
		else if (Control.SetLabel)
		{
			Control.SetLabel(Label);
		}
	}
	
	Control.OnChanged = OnChanged.bind(this);
}


class SyncMeta
{
	constructor(Name,InitialValue)
	{
		//	use this for syncing
		this.ValueVersion = 0;
		
		this.CleanValue = function(v)
		{
			return v;
		}.bind(this);
		
		this.GetLabelForValue = function(Value)
		{
			return `${Name}: ${Value}`;
		}.bind(this);
		
		this.IsValueSignificantChange = function(Old,New)
		{
			return Old != New;
		}.bind(this);
		
		//	TreatAsType
		this.GetType = function()
		{
			return typeof InitialValue;
		}
	}
}

function SetupBooleanSyncMeta(Meta)
{
	Meta.CleanValue = function (Value) { return Value == true; }
}

function SetupNumberSyncMeta(Meta)
{
	Meta.CleanValue = function (Value) { return Number(Value); }
}

function SetupColourSyncMeta(Meta)
{
	Meta.GetLabelForValue = function(Value)
	{
		let r = Value[0].toFixed(2);
		let g = Value[1].toFixed(2);
		let b = Value[2].toFixed(2);
		return `[${r},${g},${b}]`;
	}
	
	/*
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
	 */
}

function SetupEnumSyncMeta(Meta)
{
	/*
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
	 let NormValue = Math.Range(TickMin,TickMax,ControlValue);
	 let RealValue = Math.Lerp(Min,Max,NormValue);
	 let Value = RealCleanValue(RealValue);
	 NormValue = Math.Range(Min,Max,RealValue);
	 ControlValue = Math.Lerp(TickMin,TickMax,NormValue);
	 return ControlValue;
	 }*/
}

//	this is now a Sync-Object class with some value validation/meta
Pop.SyncObject = class
{
	constructor(Params,AutoPopulate=true)
	{
		this.Params = Params;
		//	init cache
		this.Cache = JSON.parse(JSON.stringify(this.Params));
		
		this.WaitForParamsChangedPromiseQueue = new Pop.PromiseQueue();
		this.ParamMetas = {};
		
		//	auto create meta!
		for ( let Name in Params )
			this.AddParam(Name);
	}
	
	async WaitForChange()
	{
		return this.WaitForParamsChangedPromiseQueue.WaitForNext();
	}
	
	GetParamMeta(Name)
	{
		return this.ParamMetas[Name];
	}
	
	//	this needs to return arguments for AddParam() functions for each key
	GetParamMetas()
	{
		return {};
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
	
	GetNames()
	{
		return Object.keys(this.Params);
	}
	
	//	add new control
	//	CleanValue = function
	//	Min can sometimes be a cleanvalue function
	//		AddParam('Float',Math.floor);
	//	TreatAsType overrides the control
	//		AddParam('Port',0,1,Math.floor,'String')
	AddParam(Name,Min,Max,CleanValue,TreatAsType)
	{
		//Pop.Debug(`SyncObject AddParam(${Name})`);
		//	replace existing meta, but propogate this info so a UI can replace controls
		const InitialValue = this.Params[Name];
		const ParamMeta = new SyncMeta(Name,InitialValue);
		this.ParamMetas[Name] = ParamMeta;

		TreatAsType = ParamMeta.GetType();
		
		//	configure meta
		if ( TreatAsType == 'boolean' )
			SetupBooleanSyncMeta(ParamMeta);
		
		if ( TreatAsType == 'Colour' )
			SetupColourSyncMeta(ParamMeta);
		
		//	todo: parse params and update meta funcs
		/*
		let SetValue = function (Value,IsFinalValue)
		{
			Params[Name] = Value;
			OnAnyChanged(Params,Name,Value,IsFinalValue);
			this.WaitForParamsChangedPromiseQueue.Push([Params,Name,Value,IsFinalValue]);
		}.bind(this);
		*/
	}
	
	SetValue(Name,Value,IsFinalValue=true)
	{
		//	gr: do we need to clean etc here?
		this.Params[Name] = Value;
		
		this.OnParamChanged(Name,IsFinalValue);
	}
	
	//	value has changed externally, propogate
	OnParamChanged(Name,IsFinalValue=true)
	{
		//	check for a change against the cache
		const Meta = this.GetParamMeta(Name);
		const OldValue = this.Cache[Name];
		const NewValue = this.Params[Name];
		const IsDifferent = Meta.IsValueSignificantChange(OldValue,NewValue);
		
		if ( !IsDifferent )
		{
			//Pop.Debug(`Param ${Name} not changed, skipping propogation`);
			return;
		}
		
		//	update cache
		this.Cache[Name] = NewValue;
		
		//	chance here to change the output to an object for more verbose callback
		const Change = [this.Params,Name,NewValue,IsFinalValue];
		this.WaitForParamsChangedPromiseQueue.Push(Change);
	}
	
	OnParamsChanged()
	{
		const Keys = this.GetNames();
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
				Pop.Warning(`OnParamChanged(${Key}) error ${e}`);
			}
		}
	}
}

//	dummy window we can swap out quickly in code
//	change this so params window can just be hidden more easily?
//	gr: deprecated
Pop.DummyParamsWindow = class extends Pop.SyncObject
{
	constructor()
	{
		Pop.Warning("DummyParamsWindow is now deprecated, just use Pop.ParamsSync");
		super(...arguments);
	}
}

/*
Pop.Gui.ColourAsString = class extends Pop.Gui.TextBox
{

 //	no colour control, create string <-> Colour conversion
 //	gr: this should be a fake Colour control in Pop.Gui namespace
 
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
 */

//	this is now a control-manager on top of the sync
Pop.ParamsWindow = class
{
	constructor(Params,OnAnyChanged,WindowRect,WindowName="Params")
	{
		this.Params = Params;
		const AutoPopulate = false;
		this.SyncObject = new Pop.SyncObject(Params,AutoPopulate);
		this.CreateWindow(WindowRect,WindowName);
	}
	
	CreateWindow(WindowRect,WindowName)
	{
		//	if the window rect is a string, then it's for gui/form/div mapping
		//	but to layout the controls, we still want some value
		const DefaultWidth = 600;
		WindowRect = WindowRect || [800,20,DefaultWidth,300];
		const WindowWidth = !isNaN(WindowRect[2]) ? WindowRect[2] : DefaultWidth;

		//	running layout for controls
		this.LabelRect = [10,10,WindowWidth * 0.3,18];
		this.ControlSpacing = 10;
		const ControlLeft = this.LabelRect[0] + this.LabelRect[2] + this.ControlSpacing;
		const ControlRight = WindowWidth - this.ControlSpacing;
		const ControlWidth = ControlRight - ControlLeft;
		const ControlHeight = this.LabelRect[3];
		const ControlTop = this.LabelRect[1];
		this.ControlRect = [ControlLeft,ControlTop,ControlWidth,ControlHeight];
		
		this.Window = new Pop.Gui.Window(WindowName,WindowRect,false);
		this.Window.EnableScrollbars(false,true);
		
		//	control handlers
		this.Handlers = {};
		
		//	meta for recreating this window, this naming conflicts with syncobject!
		this.AddParamMetas = {};
		
		this.ParamChangedLoop().catch(Pop.Warning);
	}
	
	GetParamMetas()
	{
		//	this should return arguments for each memeber to recreate
		//	AddParam() call
		//	which conflicts with the naming in syncobject. Fix this!
		return this.AddParamMetas;
	}
	
	//	add new control
	//	CleanValue = function
	//	Min can sometimes be a cleanvalue function
	//		AddParam('Float',Math.floor);
	//	TreatAsType overrides the control
	//		AddParam('Port',0,1,Math.floor,'String')
	AddParam(Name,Min,Max,CleanValue,TreatAsType)
	{
		this.AddParamMetas[Name] = [Min,Max,CleanValue,TreatAsType];
		
		//	add to sync
		this.SyncObject.AddParam(...arguments);
		
		const ParamMeta = this.SyncObject.GetParamMeta(Name);
		
		const RealType = typeof this.Params[Name];
		TreatAsType = ParamMeta.GetType();
		
		//	control (handler)'s callbacks
		let GetValue;
		//let CleanValue;
		let GetLabelForValue;
		let IsValueSignificantChange;
		let SetValue;
		
		//	add control
		let Window = this.Window;
		const LabelRect = this.LabelRect.slice();
		const ControlRect = this.ControlRect.slice();
		
		//	move next control pos
		this.LabelRect[1] += this.LabelRect[3] + this.ControlSpacing;
		this.ControlRect[1] += this.ControlRect[3] + this.ControlSpacing;

		let Control = null;
		let LabelControl = new Pop.Gui.Label(Window,LabelRect);
		LabelControl.SetValue(Name);
		
		
		/*
		if ( TreatAsType == 'Button' && Pop.Gui.Button !== undefined)
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
		else if ( TreatAsType == 'boolean' )
		{
			Control = new Pop.Gui.TickBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
		}
		else if ( RealType == 'number' && TreatAsType == 'String')
		{
			Control = new Pop.Gui.TextBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
			
			const RealGetValue = GetValue;
			const RealSetValue = SetValue;
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
		else if ( TreatAsType == 'string' )
		{
			Control = new Pop.Gui.TextBox(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
		}
		else if (TreatAsType == 'Colour' )
		{
			if ( !Pop.Gui.Colour )
				Pop.Gui.Colour = Pop.Gui.ColourAsString;
			Control = new Pop.Gui.Colour(Window,[ControlLeft,ControlTop,ControlWidth,ControlHeight]);
		}
		else
		{
			
		}
		*/
		
		Control = new Pop.Gui.TextBox(Window,ControlRect);

		//	provide default callbacks
		//	gr: this should be cleaning?
		if ( !GetValue )
			GetValue = function()	{	return this.Params[Name];	}.bind(this);
			
		if (!CleanValue)
			CleanValue = ParamMeta.CleanValue;

		if (!GetLabelForValue)
			GetLabelForValue = ParamMeta.GetLabelForValue;

		if ( !IsValueSignificantChange )
			IsValueSignificantChange = ParamMeta.IsValueSignificantChange;
		
		if ( !SetValue )
		{
			SetValue = function(Value,IsFinalValue)
			{
				//Pop.Debug(`SetValue(${Name}->${Value} Isfinal=${IsFinalValue}))`);
				this.SyncObject.SetValue(Name,Value,IsFinalValue);
			}.bind(this);
		}
		
		const Handler = new TParamHandler(Control,LabelControl,GetValue,GetLabelForValue,CleanValue,SetValue,IsValueSignificantChange);
		this.Handlers[Name] = Handler;
		//	init
		Handler.UpdateDisplay();
	}
	
	async ParamChangedLoop()
	{
		//	update display whenever a param changes from the sync
		while(this)
		{
			let [Params,Name,Value,Final] = await this.SyncObject.WaitForChange();
			this.UpdateParamUi(Name);
		}
	}
	
	UpdateParamUi(Name)
	{
		try
		{
			const Handler = this.Handlers[Name];
			Handler.UpdateDisplay();
		}
		catch(e)
		{
			Pop.Warning(`Error updating display after sync(${Name}) change; ${e}; this.Handlers=${Object.keys(this.Handlers)}`);
		}
	}
	
	async WaitForChange()
	{
		return this.SyncObject.WaitForChange();
	}
	
	//	changed externally, update display
	OnParamChanged(Name)
	{
		this.SyncObject.OnParamChanged(Name);
		
		//	ui update caught by ParamChangedLoop
	}

	//	changed externally
	OnParamsChanged()
	{
		this.SyncObject.OnParamsChanged();
	}
}



function CreateParamsWindow(Params,OnAnyChanged,WindowRect)
{
	Pop.Warn("Using deprecated CreateParamsWindow(), switch to new Pop.TParamsWindow");
	const Window = new Pop.ParamsWindow(Params,OnAnyChanged,WindowRect);
	return Window;
}


function RunParamsWebsocketServer(Ports,OnJsonRecieved)
{
	let CurrentSocket = null;
	let CurrentPortIndex = 0;
	
	async function Loop()
	{
		while (true)
		{
			try
			{
				const Port = Ports[CurrentPortIndex%Ports.length];
				CurrentPortIndex++;
				const Socket = new Pop.Websocket.Server(Port);
				CurrentSocket = Socket;
				Pop.Debug(`Running Params Websocket server on ${JSON.stringify(CurrentSocket.GetAddress())}`);
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

function RunParamsHttpServer(Params,ParamsWindow,HttpPort=80)
{
	function OnJsonRecieved(Json)
	{
		//Pop.Debug("Remote change of params");
		try
		{
			//	update sync object
			Object.assign(Params,Json);
			ParamsWindow.OnParamsChanged(Params);
		}
		catch (e)
		{
			Pop.Debug("Exception setting new web params",JSON.stringify(Json));
		}
	}

	//	support multiple ports as chrome seems to block them for a little while after restarting
	const WebsocketPorts = [HttpPort + 1,HttpPort + 2,HttpPort + 3];
	//	create websocket server to send & recieve param changes
	const Websocket = RunParamsWebsocketServer(WebsocketPorts,OnJsonRecieved);

	function SendNewParams(Params)
	{
		Websocket.SendJson(Params);
	}

	//	kick off async loop waiting for change
	async function ParamsWindowWaitForChangeLoop()
	{
		while (true)
		{
			await ParamsWindow.WaitForChange();
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
	const Http = new Pop.Http.Server(HttpPort,HandleVirtualFile);
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

