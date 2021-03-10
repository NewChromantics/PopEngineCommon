/* gr: this was my WIP "easy-load wasm as a dll" class */
Pop.Wasm = {};


Pop.Wasm.Module = class
{
	constructor()
	{
		this.Module = null;
		this.Instance = null;
		this.UsedBytes = 0;
	}
	
	GetMemory()
	{
		return this.Instance.exports.memory;
	}
	
	ResetHeap()
	{
		this.UsedBytes = 0;
	}
	
	HeapAlloc(Size)
	{
		const Offset = this.UsedBytes;
		this.UsedBytes += Size;
		
		//	realloc if we need to
		const NewBytesUsed = this.UsedBytes;
		
		const Memory = this.GetMemory();
		const MaxBytes = Memory.buffer.byteLength;
		if (NewBytesUsed > MaxBytes)
		{
			const PageSize = 64 * 1024;
			const NewPages = Math.ceil((NewBytesUsed - MaxBytes) / PageSize);
			Pop.Debug(`Reallocating heap in WASM module ${NewBytesUsed} > ${MaxBytes}. New Pages x${NewPages}`);
			Memory.grow(NewPages);
			Pop.Debug(`New WASM module heap size ${Memory.buffer.byteLength}`);
		}
		
		return Offset;
	}
	
	HeapAllocArray(ArrayType,Length)
	{
		const ElementSize = ArrayType.BYTES_PER_ELEMENT;
		const ByteOffset = this.HeapAlloc(Length * ElementSize);
		const Memory = this.GetMemory();
		return new ArrayType(Memory.buffer,ByteOffset,Length);
	}
}

async function LoadWasmModule(WasmCode)
{
	const PageSize = 64 * 1024;
	function BytesToPages(Bytes)
	{
		return Math.ceil(Bytes / PageSize);
	}
	
	let WasmImports = {};
	WasmImports.a = {};
	WasmImports.a.a = function(){};
	WasmImports.a.b = function(){};
	WasmImports.a.memory = function(){};
	
	/*	gr: not sure this is having any effect, can't get constructor right?
	 const MaxPages = BytesToPages(64 * 1024 * 1024);
	 const InitialPages = MaxPages;
	 Pop.Debug(`Allocating ${MaxSizeBytes / 1024 / 1024}mb`);
	 const Memory = new WebAssembly.Memory({ initial: InitialPages,maximum: MaxPages });
	 Pop.Debug("WASM instance memory buffer:",Memory.buffer.byteLength);
	 Pop.Debug("WASM instance memory buffer maximum:",Memory.maximum);
	 
	 WasmImports.env = {};
	 WasmImports.env.memory = Memory;
	 */
	const WasmCodeArrayBuffer = WasmCode.buffer;
	const Wasm = new Pop.Wasm.Module();
	Wasm.Module = await WebAssembly.compile(WasmCode);
	//Wasm.Instance = await WebAssembly.instantiate(Wasm.Module,WasmImports);
	const InstPromise = await WebAssembly.instantiate(Wasm.Module,WasmImports);
	Wasm.Instance = await InstPromise;
	//Pop.Debug("REAL WASM instance memory buffer:",Wasm.Instance.exports.memory.buffer.byteLength);
	return Wasm;
}
