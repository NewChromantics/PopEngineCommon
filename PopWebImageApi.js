Pop.Image = function()
{
	Pop.Debug("Pop.Image(",...arguments,")");
	
	this.Size = [undefined,undefined];
	
	this.GetWidth = function()
	{
		return this.Size[0];
	}
	
	this.GetHeight = function()
	{
		return this.Size[1];
	}

	this.WritePixels = function(Width,Height,Pixels,Format)
	{
		this.Size = [Width,Height];
	}
}

