
let MemCheckLoop = async function()
{
	while(true)
	{
		try
		{
			await Pop.Yield(1000);
			Pop.GarbageCollect();
		
			let Debug = "Memory: ";
			
			const ImageHeapSize = (Pop.GetImageHeapSize() / 1024 / 1024).toFixed(2) + "mb";
			const ImageHeapCount = Pop.GetImageHeapCount();
			Debug += " ImageHeapSize="+ImageHeapSize+" x" + ImageHeapCount;
			
			const GeneralHeapSize = (Pop.GetHeapSize() / 1024 / 1024).toFixed(2) + "mb";
			const GeneralHeapCount = Pop.GetHeapCount();
			Debug += " GeneralHeapSize="+GeneralHeapSize+" x" + GeneralHeapCount;
			
			//Debug += JSON.stringify(Pop.GetHeapObjects());
			Pop.Debug(Debug);
		 	Debug = null;
		}
		catch(e)
		{
			Pop.Debug("Loop Error: " + e );
		}
	}
}
MemCheckLoop();
