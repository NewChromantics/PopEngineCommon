Pop.Midi = {};


function Array_GetKey(TheArray,Value)
{
	const Match = Object.keys(TheArray).find(k => TheArray[k] === Value);
	return Match;
}

//	http://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html#BMA1_3
//	value => name
function GetNoteName(MidiNoteValue)
{
	const Note = MidiNoteValue % 12;
	const Octave = Math.floor(MidiNoteValue/12);
	//	this produces a filename + url friendly note name C~_1 D_1 F~3 B5
	const NoteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
	//const OctaveNames = ['_1',0,1,2,3,4,5,6,7,8,9];
	const OctaveNames = ['_2','_1',0,1,2,3,4,5,6,7,8];
	if ( Note < 0 || Note >= NoteNames.length || Octave < 0 || Octave >= OctaveNames.length )
		throw `Midi note value ${MidiNoteValue} out of range (Note=${Note} Octave=${Octave})`;
	return NoteNames[Note]+OctaveNames[Octave];
}

Pop.Midi.GetNoteNames = function()
{
	const Names = [];
	for ( let i=127;	i>=0;	i-- )
		Names.push(GetNoteName(i));
	return Names;
}

const MidiControllerMessages = {};
MidiControllerMessages.BankSelect = 0;
MidiControllerMessages.ModulationWheel = 1;
MidiControllerMessages.BreathControl = 2;
MidiControllerMessages.FootController = 4;
MidiControllerMessages.PortamentoTime = 5;
MidiControllerMessages.DataEntry = 6;
MidiControllerMessages.ChannelVolume = 7;
MidiControllerMessages.Balance = 8;
MidiControllerMessages.Pan = 10;
MidiControllerMessages.ExpressionController = 11;
MidiControllerMessages.EffectControl1 = 12;
MidiControllerMessages.EffectControl2 = 13;
MidiControllerMessages.GeneralPurposeController1 = 16;
MidiControllerMessages.GeneralPurposeController2 = 17;
MidiControllerMessages.GeneralPurposeController3 = 18;
MidiControllerMessages.GeneralPurposeController4 = 19;
MidiControllerMessages.BankSelect2 = 32;
MidiControllerMessages.ModulationWheel2 = 33;
MidiControllerMessages.BreathControl2 = 34;
MidiControllerMessages.FootController2 = 36;
MidiControllerMessages.PortamentoTime2 = 37;
MidiControllerMessages.DataEntry2 = 38;
MidiControllerMessages.ChannelVolume2 = 39;
MidiControllerMessages.Balance2 = 40;
MidiControllerMessages.Pan2 = 42;
MidiControllerMessages.EffectControl1_2 = 44;
MidiControllerMessages.EffectControl2_2 = 45;
MidiControllerMessages.GeneralPurposeController1_2 = 48;
MidiControllerMessages.GeneralPurposeController2_2 = 49;
MidiControllerMessages.GeneralPurposeController3_2 = 50;
MidiControllerMessages.GeneralPurposeController4_2 = 51;

MidiControllerMessages.SoundController1 = 70;
MidiControllerMessages.SoundController2 = 71;
MidiControllerMessages.SoundController3 = 72;
MidiControllerMessages.SoundController4 = 73;
MidiControllerMessages.SoundController5 = 74;
MidiControllerMessages.SoundController6 = 75;
MidiControllerMessages.SoundController7 = 76;
MidiControllerMessages.SoundController8 = 77;
MidiControllerMessages.SoundController9 = 78;
MidiControllerMessages.SoundController10 = 79;

MidiControllerMessages.DataEntryPlus1 = 96;
MidiControllerMessages.DataEntryMinus1 = 97;

MidiControllerMessages.AllSoundOff = 120;
MidiControllerMessages.ResetAllControllers = 121;
MidiControllerMessages.LocalControlOnOff = 122;
MidiControllerMessages.AllNotesOff = 123;

const MetaEvents = {};
MetaEvents.EndOfTrack = 0x2f;

//	http://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html#BMA1_
//	https://www.midi.org/specifications-old/item/table-1-summary-of-midi-message
const MidiEvents = {};
MidiEvents.Zero = 0b0000;
MidiEvents.Six = 0b0110;
MidiEvents.Three = 0b0011;
MidiEvents.NoteOff = 0b1000;
MidiEvents.NoteOn = 0b1001;
MidiEvents.PolyKeyPressure = 0b1010;
MidiEvents.ControlChange = 0b1011;
MidiEvents.ProgramChange = 0b1100;
MidiEvents.ChannelPressure = 0b1101;
MidiEvents.PitchBendChange = 0b1110;
MidiEvents.SystemMessage = 0b1111;

MidiEvents.GetName = function(Event)
{
	const Name = Array_GetKey(MidiEvents,Event);
	return Name;
}

function SliceString(Array,Start,Length)
{
	const String8 = Array.slice(Start,Start + Length);
	const StringString = String.fromCharCode(...String8);
	return StringString;
}

function Slice32(Array,Start)
{
	const Size8 = Array.slice(Start,Start + 4);
	const Size8a = new Uint8Array(Size8.reverse());
	const Size32 = new Uint32Array(Size8a.buffer)[0];
	return Size32;
}

function Slice16(Array,Start)
{
	const Size8 = Array.slice(Start,Start + 2);
	const Size8a = new Uint8Array(Size8.reverse());
	const Size16 = new Uint16Array(Size8a.buffer)[0];
	return Size16;
}

Pop.Midi.Parse = function (FileContents)
{
	function BpmToTempo(Bpm)
	{
		//	microsecs per 120bpm
		const Mult = 500000 / 120;
		return Bpm * Mult;
	}
	
	const Midi = {};
	Midi.TicksToMs = null;	//	func
	Midi.Tracks = null;
	Midi.Format = null;
	Midi.DurationMs = 0;
	Midi.TempoMicroSecs = BpmToTempo(120);	//	120bpm = default tempo
	
	function Parse_MTrk(Data)
	{
		//	add to next undefined track
		const NextTrack = Midi.Tracks.indexOf(null);
		const NewTrack = {};
		Midi.Tracks[NextTrack] = NewTrack;
		
		NewTrack.Notes = [];

		function GetLastNote(Note,Channel)
		{
			for ( let i=NewTrack.Notes.length-1;	i>=0;	i-- )
			{
				const NoteMeta = NewTrack.Notes[i];
				if ( NoteMeta.Channel != Channel )
					continue;
				if ( NoteMeta.Note != Note )
					continue;
				return NoteMeta;
			}
			throw `No last note (${Note},${Channel}) found`;
		}
		
		//Pop.Debug(`NextTrack = ${NextTrack}`);

		let DataPosition = 0;
		function Peek8(Count=1)
		{
			const Extra = Count - 1;
			if (DataPosition + Extra == Data.length)
				//throw `Peek8 is last`;
				return null;
			if (DataPosition + Extra > Data.length)
				throw RangeError("Track Data OOB")
			const Value = (Extra == 0) ? Data[DataPosition] : Data.slice(DataPosition,DataPosition + Count);
			return Value;
		}

		function Pop8()
		{
			const Value = Peek8();
			DataPosition++;
			return Value;
		}
		
		function Pop14()
		{
			const Lsb7 = Pop8() & 127;
			const Msb7 = Pop8() & 127;
			const Fourteen = (Msb7<<7) | (Lsb<<0);
			return Fourteen;
		}

		function PopVariableLengthValue()
		{
			let Value = 0;
			let LoopCount = 1000;
			while (LoopCount-->0)
			{
				const v8 = Pop8();
				const Continuation = v8 & 0x80;
				const v7 = v8 & (~0x80);
				//const Continuation = v8 & 0x01;
				//const v7 = v8 & (~0x01);
				Value <<= 8;
				Value |= v7;
				if (!Continuation)
					break;
			}
			return Value;
		}

		function PopData(Length)
		{
			const Data = Peek8(Length);
			DataPosition += Length;
			return Data;
		}
		
		function PushNoteOn(Channel,TimeMs,Note,Velocity)
		{
			if ( Velocity == 0 )
				return PushNoteOff(Channel,TimeMs,Note,Velocity);
			
			const Meta = {};
			Meta.Note = GetNoteName(Note);
			Meta.Channel = Channel;
			Meta.StartTimeMs = TimeMs;
			Meta.EndTimeMs = null;
			Meta.Velocity = Velocity;
			Pop.Debug(`Note on: ${JSON.stringify(Meta)}`);
			NewTrack.Notes.push(Meta);
			Midi.DurationMs = Math.max( Midi.DurationMs, Meta.StartTimeMs );
		}
		
		function PushNoteOff(Channel,TimeMs,Note,Velocity)
		{
			Note = GetNoteName(Note);
			Pop.Debug(`Note off @${TimeMs}: ${Note} vel=${Velocity}`);
			//	get the last matching note and end it
			const Meta = GetLastNote(Note,Channel);
			Meta.EndTimeMs = TimeMs;
			Meta.EndVelocity = Velocity;
			Midi.DurationMs = Math.max( Midi.DurationMs, Meta.EndTimeMs );
		}
		
		function PushPolyKeyPressure(Channel,TimeMs,Note,Velocity)
		{
			Note = GetNoteName(Note);
			Pop.Debug(`PolyKeyPressure @${TimeMs}: ${Note} x${Velocity}`);
		}
		
		function PushControlChange(Channel,TimeMs,Control,Value)
		{
			Pop.Debug(`Control/Channel mode @${TimeMs} ${Control}=${Value}`);
		}
		
		function PushProgramChange(Channel,TimeMs,ProgramNumber)
		{
			Pop.Debug(`Program change @${TimeMs} ${ProgramNumber}`);
		}
		
		function PushChannelPressure(Channel,TimeMs,PressureValue)
		{
			Pop.Debug(`Channel pressure @${TimeMs} ${PressureValue}`);
		}
		
		function PushPitchBendChange(Channel,TimeMs,Change)
		{
			Pop.Debug(`Pitch bend @${TimeMs} ${Change}`);
		}
		
		
		function ParseMidiEvent(MidiEventAndChannel,TimeMs)
		{
			const MidiEvent = (MidiEventAndChannel & 0b11110000) >> 4;
			const Channel = MidiEventAndChannel & 0b00001111;
			const MidiEventName = MidiEvents.GetName(MidiEvent) || MidiEvent.toString(16);
			
			const Next8 = Peek8();
			//Pop.Debug(`Midi event: ${MidiEventName} Channel[${Channel}] Next=${Next8}`);

			//	http://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html#BMA1_
			switch(MidiEvent)
			{
				case MidiEvents.NoteOn:				PushNoteOn(Channel,TimeMs,Pop8(),Pop8());	break;
				case MidiEvents.NoteOff:			PushNoteOff(Channel,TimeMs,Pop8(),Pop8());	break;
				case MidiEvents.PolyKeyPressure:	PushPolyKeyPressure(Channel,TimeMs,Pop8(),Pop8());	break;
				case MidiEvents.ControlChange:		PushControlChange(Channel,TimeMs,Pop8(),Pop8());	break;
				case MidiEvents.ProgramChange:		PushProgramChange(Channel,TimeMs,Pop8());	break;
				case MidiEvents.ChannelPressure:	PushChannelPressure(Channel,TimeMs,Pop8());	break;
				case MidiEvents.PitchBendChange:	PushPitchBendChange(Channel,TimeMs,Pop14());	break;
				default:
					Pop.Debug(`Midi event: ${MidiEventName} Channel[${Channel}] Next=${Next8}`);
					throw `Undhandled Midi event ${MidiEventName}`;
			}
		}

		function ParseSystemEvent(Event)
		{
			const Length = PopVariableLengthValue();
			Pop.Debug(`System event (${Event.toString(16)}) x${Length}`);
			const EventData = PopData(Length);
		}

		function ParseMetaEvent()
		{
			const Event2 = Pop8();
			if (Event2 == MetaEvents.EndOfTrack)
			{
				const Length0 = Pop8();
				//const Length0 = 0;
				Pop.Debug(`EndOfTrack length=${Length0}==0`);
				return;
			}
			const Length = PopVariableLengthValue();
			Pop.Debug(`Meta event #${Event2.toString(16)} x${Length}`);
			const EventData = PopData(Length);
		}

		function ParseEvent(Event,TimeMs)
		{
			const SystemEvent = 0xf0;
			const EscapeEvent = 0xf7;
			const MetaEvent = 0xff;
			switch (Event)
			{
				case SystemEvent:
				case EscapeEvent:
					return ParseSystemEvent(Event);
				case MetaEvent:
					return ParseMetaEvent();
				default:
					return ParseMidiEvent(Event,TimeMs);
			}
		}

		//	parse the data
		let TimeTicks = 0;
		while (Peek8()!==null)
		{
			//Pop.Debug(`Next= ${Peek8()}`);
			const TicksSinceLast = PopVariableLengthValue();
			TimeTicks += TicksSinceLast;
			const TimeMs = Midi.TicksToMs(TimeTicks);
			const Event = Pop8();
			//Pop.Debug(`Event=${Event} Time=${TimeMs}(+${TicksSinceLast} ticks) DataPos ${DataPosition}/${Data.length}`);
			ParseEvent(Event,TimeMs);
		}

	}

	function Parse_Mthd(Data)
	{
		Midi.Format = Slice16(Data,0);
		const TrackCount = Slice16(Data,2);
		const TimeFormat16 = Slice16(Data,4);
		Midi.Tracks = Array(TrackCount).fill(null);

		const TimeFormatSmpte = (TimeFormat16>>15) != 0;
		if ( !TimeFormatSmpte )
		{
			Midi.TicksToMs = function(Ticks)
			{
				const Tempo = Midi.TempoMicroSecs;
				const TicksPerQuarter = TimeFormat16;
				const MicroSecsPerQuarter = Tempo;
				const MicroSecsPerTick = MicroSecsPerQuarter / TicksPerQuarter;
				//const SecondsPerTick = MicroSecsPerTick / 1.000.000;
				const MilliSecondsPerTick = MicroSecsPerTick / 1000;
				const Ms = Ticks * MilliSecondsPerTick;
				return Ms;
			}
		}
		else
		{
			Midi.TicksToMs = function(Ticks)
			{
				const NegativeSmpte = (TimeFormat16 >> 7) & (127);	//	bits 8-14
				const TicksPerFrame = TimeFormat16 & 127;	//	bits 0-7
				throw `Todo: calculate Smpte time conversion ${TimeFormatSmpte} ${TimeFormat16} = ${NegativeSmpte} ${TicksPerFrame}`;
				//	negative SMPTE format	ticks per frame
				return Ticks;
			}
		}

		
		Pop.Debug(`Midi: ${JSON.stringify(Midi)}`);
	}

	function EnumAtom(Fourcc,Data)
	{
		Pop.Debug(`Atom ${Fourcc} x${Data.length}; ${Data}`);
		switch (Fourcc)
		{
			case 'MThd': return Parse_Mthd(Data);
			case 'MTrk': return Parse_MTrk(Data);
		}
		throw `Unhandled Midi Atom ${Fourcc} x${Data.length}`;
	}

	function ParseAtom(Offset)
	{
		const Atom = {};
		Atom.Fourcc = SliceString(FileContents,Offset + 0,4);
		Atom.DataSize = Slice32(FileContents,Offset + 4);
		Atom.DataOffset = 4 + 4;
		Atom.AtomSize = Atom.DataOffset + Atom.DataSize;
		return Atom;
	}

	for (let i = 0;i < FileContents.length;i += 0)
	{
		const Atom = ParseAtom(i);
		const DataStart = i + Atom.DataOffset;
		const DataEnd = DataStart + Atom.DataSize;
		if (DataEnd > FileContents.length)
			throw `Atom data ${DataStart}...${DataEnd} out of range (${FileContents.length})`;
		const AtomData = FileContents.slice(DataStart,DataEnd);
		EnumAtom( Atom.Fourcc, AtomData );
		i += Atom.AtomSize;
	}
	
	return Midi;
}
