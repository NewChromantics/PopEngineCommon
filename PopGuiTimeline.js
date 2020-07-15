//	depends on Pop.Gui.ImageMap
Pop.Gui.Timeline = class
{
	constructor(Name,Rect,GetData)
	{
		this.ImageMap = new Pop.Gui.ImageMap(Name,Rect);
		this.ImageMap.OnMouseScroll = this.OnMouseScroll.bind(this);
		this.ViewImage = null;
		
		this.ViewTimeMin = null;	//	null until we have data
		this.ViewTimeToPx = null;	//	zoom	todo: auto once we have 2 times
		this.TrackLatest = true;
		this.SmearData = false;
		this.TrackHeight = 1;		//	allow height from GetDataColour to draw graphs

		this.KnownUniforms = [];
		this.GetData = GetData;
		this.OnDataChanged();
		this.RedrawLoop();
	}
					  
	OnDataChanged()
	{
		this.Dirty = true;
	}
	
	async RedrawLoop()
	{
		let FrameCounter = 0;
		let FrameSkip = 0;
		while(this.ImageMap)
		{
			await Pop.WaitForFrame();
			if ( !this.Dirty )
				continue;
			
			FrameCounter++;
			if ( (FrameCounter % (FrameSkip+1) ) != 0 )
				continue;
			
			this.Redraw();
			this.Dirty = false;
		}
	}
	
	DrawNoData()
	{
		const Components = 4;
		const Format = 'RGBA';
		const Width = 7;
		const Height = 7;
		const Pixels = new Uint8Array(Width*Height*Components);
		Pixels.fill(255);
		this.ViewImage = new Pop.Image();
		this.ViewImage.WritePixels( Width, Height, Pixels, Format );
		function Write(x,y,Colour)
		{
			if ( x < 0 || y < 0 || x >= Width || y >= Height )
				return;
			const ChannelColours = [[1,0,0],[1,1,0],[0,1,0],[0,1,1],[0,0,1],[1,0,1]];
			Colour = Array.isArray(Colour) ? Colour : ChannelColours[Colour%ChannelColours.length];
			
			let i = y * Width;
			i += x;
			i *= Components;
			Pixels[i+0] = Colour[0] * 255;
			Pixels[i+1] = Colour[1] * 255;
			Pixels[i+2] = Colour[2] * 255;
			Pixels[i+3] = 255;
		}
		Write(0,0,0);
		Write(1,1,0);
		Write(2,2,0);
		Write(3,3,0);
		Write(4,4,0);
		Write(5,5,0);
		Write(6,6,0);
		Write(6,0,0);
		Write(5,1,0);
		Write(4,2,0);
		Write(3,3,0);
		Write(2,4,0);
		Write(1,5,0);
		Write(0,6,0);
		this.ViewImage.WritePixels(Width,Height,Pixels,Format);
		this.ImageMap.SetImage(this.ViewImage);
	}
	
	UpdateUniforms(Data)
	{
		const Times = Object.keys(Data).map(parseFloat).filter( t => !isNaN(t) );
		if ( !Times.length )
			return this.KnownUniforms;
		
		//	check a few times for keys, bit expensive to do all though
		for ( let i=0;	i<5 && i<Times.length;	i++ )
		{
			const Frame0 = Data[Times[i]];
			//	merge uniforms
			const NewUniforms = Object.keys(Frame0);
			this.KnownUniforms = Array.from(new Set(this.KnownUniforms.concat(NewUniforms)));
		}
		
		return this.KnownUniforms;
	}
	
	Redraw()
	{
		//Pop.Debug(`Redraw`);
		//	get data to draw in view range
		const Data = Object.assign({},this.GetData());
		const TimeKeys = Object.keys(Data).map(parseFloat).filter( t => !isNaN(t) );
		let Times = TimeKeys.sort((a,b)=>a-b);
		if ( Times.length < 1 )
		{
			this.DrawNoData();
			return;
		}
		
		//	get uniforms, need to include ones we dont see
		const Uniforms = this.UpdateUniforms(Data);
		
		//	get size of control from image map so we can do pixel perfect width
		const TimeMin = Times[0];
		const TimeMax = Times[Times.length-1];
		const Width = 200;//Math.max(1,TimeMax-TimeMin);
		const Height = Uniforms.length * this.TrackHeight;

		//	init view on first data
		if ( this.ViewTimeMin === null )
		{
			this.ViewTimeMin = Times[0];
			//this.ViewTimeMin = Times[Times.length-1] - 50;
		}
		if ( this.ViewTimeToPx === null && Times.length >= 2 )
		{
			//	i want 200 to be 1/10 for 20ms diff with
			//	how many chunks per view
			const Chunks = 2;
			this.ViewTimeToPx = (TimeMax - TimeMin) / Width;
			this.ViewTimeToPx *= Chunks;
		}
		const ViewTimeToPx = (this.ViewTimeToPx === null) ? 1 : this.ViewTimeToPx;
		//Pop.Debug(`this.ViewTimeMin = ${this.ViewTimeMin} ${TimeMin}...${TimeMax}`);
		
		if ( this.TrackLatest )
		{
			if ( this.ViewTimeToPx !== null )
			{
				const LookBack = (Width-10) / this.ViewTimeToPx;
				this.ViewTimeMin = Times[Times.length-1] - LookBack;
			}
		}
		
		 //	invalidate any old image
		if ( this.ViewImage )
		{
			if ( this.ViewImage.GetWidth() != Width || this.ViewImage.GetHeight() != Height )
				this.ViewImage = null;
		}
		
		const Components = 4;
		const Format = 'RGBA';
		
		//	create new image if we need it
		if ( !this.ViewImage )
		{
			const Pixels = new Uint8Array(Width*Height*Components);
			Pixels.fill(123);
			this.ViewImage = new Pop.Image();
			this.ViewImage.WritePixels( Width, Height, Pixels, Format );
		}
		const Pixels = this.ViewImage.GetPixelBuffer();
		Pixels.fill(255);

		function Write(x,y,Colour)
		{
			if ( x < 0 || y < 0 || x >= Width || y >= Height )
				return;
			const ChannelColours = [[1,0,0],[1,1,0],[0,1,0],[0,1,1],[0,0,1],[1,0,1]];
			Colour = Array.isArray(Colour) ? Colour : ChannelColours[Colour%ChannelColours.length];

			let i = y * Width;
			i += x;
			i *= Components;
			Pixels[i+0] = Colour[0] * 255;
			Pixels[i+1] = Colour[1] * 255;
			Pixels[i+2] = Colour[2] * 255;
			Pixels[i+3] = 255;
		}
		
		//	filter out times we're not gonna render before we loop
		function TimeIsVisible(Time)
		{
			const x = Math.floor(ViewTimeToPx * (Time-this.ViewTimeMin));
			return x>=0 && x<Width;
		}
		Times = Times.filter(TimeIsVisible.bind(this));
		
		//	write all the data
		for ( let u=0;	u<Uniforms.length;	u++ )
		{
			const Uniform = Uniforms[u];
			//let LastValidTime = null;
			let LastCellData = null;
			let LastX = null;
			//for ( let t=TimeMin;	t<TimeMax;	t++ )
			for ( let ti=0;	ti<Times.length;	ti++)
			{
				const t = Times[ti];
				let sx = Math.floor(ViewTimeToPx * (t-this.ViewTimeMin));
				const ex = sx+1;
				if ( ex < 0 )		continue;
				if ( sx > Width )	break;
				
				let Colour = [0,0,0];	//	default colour (never gets used now?)
				
				
				let CellData = null;
				if ( Data.hasOwnProperty(t) )
					if ( Data[t].hasOwnProperty(Uniform) )
						CellData = Data[t][Uniform];
				
				if ( CellData === null && this.SmearData )
					CellData = LastCellData;
				
				//	dont draw no-data
				if ( CellData === null )
					continue;
				
				if ( Number.isInteger(CellData) )
					Colour = CellData;
				else if ( typeof CellData === 'number' ) //	isFloat
					Colour = Math.floor(CellData);
				
				if ( Data.GetDataColour && CellData !== null )
				{
					const DataColour = Data.GetDataColour(Uniforms[u],CellData);
					Colour = (DataColour === undefined) ? Colour : DataColour;
				}
				
				//	if 4th element of colour has been returned, it's the height
				let Heightf = (Array.isArray(Colour) && Colour.length >= 4) ? Colour[3] : 1.0;
				let Height = Math.floor(Heightf * this.TrackHeight);
				
				if ( this.SmearData && LastX )
					sx = LastX;
				
				const ey = (u+1) * this.TrackHeight;
				const sy = ey - Height;

				for ( let y=sy;	y<ey;	y++ )
				{
					for (let x = sx;x <= ex;x++)
					{
						Write(x,y,Colour);
					}
				}
				LastCellData = CellData;
				LastX = ex;
			}
		}
		
		this.ViewImage.WritePixels(Width,Height,Pixels,Format);
		this.ImageMap.SetImage(this.ViewImage);
	}
	
	OnMouseScroll(x,y,Button,Scroll)
	{
		//	zoom
		if ( this.TrackLatest )
		{
			if ( this.ViewTimeToPx !== null )
			{
				this.ViewTimeToPx += Scroll[1] * 0.20;
				this.ViewTimeToPx = Math.max( 0.001, this.ViewTimeToPx );
			}
		}
		else
		{
			//	scroll time
			if ( this.ViewTimeMin !== null && this.ViewTimeToPx !== null )
			{
				const ScrollPages = 1/20;
				const ScrollPixels = 200 * ScrollPages;
				const ScrollTime = ScrollPixels * this.ViewTimeToPx;
				const ScrollDelta = Math.max( -2, Math.min(2,(Scroll[1] * 10)) );
				this.ViewTimeMin += ScrollDelta * ScrollTime;
			}
			Pop.Debug(`view: ${this.ViewTimeToPx}`);
		}
		this.Redraw();
		Pop.Debug(`Scroll ${x},${y} ${Button},${Scroll}`);
	}
}



