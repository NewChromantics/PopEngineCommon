
//	this window is supposed to monitor the state of the
//	file requests, caches, loading etc 
//	its designed for the needs of the WebAPI, but really
//	the system of caching & hot reloading is generic,
//	we should have a layer on top of the raw filesystem access
//	as well as the asset layer on top of that
export default class FileMonitorWindow
{
	constructor(WindowRect=[0,0,200,400],FileCache=Pop.WebApi.FileCache)
	{
		this.FileCache = FileCache;
		this.Window = new Pop.Gui.Window("FileMonitor",WindowRect);
		this.FilterTextBox = new Pop.Gui.TextBox(this.Window,[2,2,"100%",20])
		this.TableGui = new Pop.Gui.Table(this.Window,[4,24,"100%","100%"])

		let Filter = Pop.GetExeArguments().FileMonitor;
		if (Filter === false || Filter === true)
			Filter = null;
		this.FilterString = Filter || null;
		this.FilterTextBox.SetLabel('Filter');
		this.FilterTextBox.OnChanged = this.OnFilterChanged.bind(this);
		this.FilterTextBox.SetValue(this.FilterString);
		
		this.SizeMb = true;

		this.UpdateLoop();
		this.OnChanged();
	}

	SetMinimised()
	{
		this.Window.SetMinimised(...arguments);
	}

	async UpdateLoop()
	{
		while (true)
		{
			const ChangedFile = await this.FileCache.WaitForFileChange();
			const ChangedFilename = ChangedFile.Filename;
			//Pop.Debug(`File changed ${ChangedFilename}`);
			this.OnChanged(ChangedFilename);
		}
	}

	OnFilterChanged(NewFilter)
	{
		this.FilterString = NewFilter;

		//	validate filter
		if (this.FilterString.length == 0)
			this.FilterString = null;

		this.OnChanged();
	}

	OnChanged()
	{
		function FilterRow(Row)
		{
			if (this.FilterString === null)
				return true;

			const FilterLower = this.FilterString.toLowerCase();
			const FilenameLower = ('' +Row.Filename).toLowerCase();
			const TypeLower = ('' +Row.Type).toLowerCase();
			const SizeLower = (''+Row.Size).toLowerCase();
			
			if (FilenameLower.includes(FilterLower))
				return true;
			if (TypeLower.includes(FilterLower))
				return true;
			if (SizeLower.includes(FilterLower))
				return true;

			return false;
		}


		//	update display
		//	generate NxN table of labels
		const Table = [];
		const Push = function (Filename,Type,Size,LoadingPercent,Style=undefined,InsertAtTopOfArray=null)
		{
			const SizeBytes = Size;

			if (Number.isInteger(Size))
			{
				if (this.SizeMb)
				{
					const mb = Size / 1024 / 1024;
					Size = `${mb.toFixed(2)} mb`;
				}
				else
				{
					const kb = Size / 1024;
					Size = `${kb.toFixed(2)} kb`;
				}
			}

			const Row = {};
			Row.Size = Size;
			//Row.LoadingPercent = LoadingPercent;
			Row.Filename = Filename;
			Row.Type = Type;
			Row.SizeBytes = SizeBytes;
			Row.Style = Style;
			
			if (InsertAtTopOfArray)
				InsertAtTopOfArray.unshift(Row);
			else
				Table.push(Row);

		}.bind(this);

		

		//	todo: retain an order (ideally of age)
		for (let [Filename,Contents] of Object.entries(this.FileCache.Cache))
		{
			const FileMeta = this.FileCache.GetMeta(Filename);
			//	gr: null === object, so handle special case
			let Type = (Contents===null) ? 'null' : typeof Contents;
			let Size = undefined;
			let Style = {};

			if (Contents === false)
			{
				Type = 'Failed to load';
				Style.backgroundColor = 'red';
			}
			else if (Array.isArray(Contents))
			{
				Size = Contents.length;
				Type = 'Array';
			}
			else if (typeof Contents == 'string')
			{
				Size = Contents.length;
			}
			else if ( Contents === null )	//	gr: typeof null == 'object' so below .constructor line will error
			{
				//	if contents are null, we're downloading in chunks and haven't assembled yet
				//	we could assemble here, but then we're going to cause a drain...
				if ( FileMeta.ContentChunks )
				{
					Size = FileMeta.PendingContentsSize;
					Type = 'Streaming Chunks';
					/*
					//	fill in missing data
					const FirstChunk = FileMeta.ContentChunks[0];
					if ( FirstChunk )
					{
						//	always u8 array I think
						Type = FirstChunk.constructor.name;
					}
					*/
				}
			}
			else if (typeof Contents == 'object' && Contents.constructor)
			{
				Type = Contents.constructor.name;
				//	is a typed array
				if (Contents.BYTES_PER_ELEMENT !== undefined)
				{
					//	gr: should this be Contents.byteLength
					Size = (Contents.length / Contents.BYTES_PER_ELEMENT);
				}

				if (Contents instanceof Pop.Image)
				{
					const w = Contents.GetWidth();
					const h = Contents.GetHeight();
					const Format = Contents.GetFormat();
					Type = 'Pop.Image';
					Size = `${w}x${h} ${Format}`;
				}
			}
			
			//	calc loading %
			let LoadingPercent = undefined;
			if ( Number.isInteger(Size) )
			{
				const TotalSize = FileMeta.Size;
				//	if undefined, we don't have a known size, or is not streaming
				if ( Number.isInteger(TotalSize) )
					LoadingPercent = Math.floor((Size / TotalSize)*100);
				//else
				//	LoadingPercent = 100;
				//	set css style for loading %
			}
			
			Style.LoadingPercent = LoadingPercent;

			Push(Filename,Type,Size,LoadingPercent,Style);
		}

		const FilteredTable = Table.filter(FilterRow.bind(this));

		//	add a total/stats entry for the filtered rows
		{
			function AddSize(Total,Cell)
			{
				Total += Number.isInteger(Cell.SizeBytes) ? Cell.SizeBytes : 0;
				return Total;
			}
			const Summary = `Total ${FilteredTable.length}/${Table.length}`;
			const TotalSize = FilteredTable.reduce(AddSize,0);
			const Type = '';
			const Style = {};
			Style['font-style'] = 'italic';
			const InsertAt0 = true;
			const LoadingPercent = null;
			Push(Summary,Type,TotalSize,LoadingPercent,Style,FilteredTable);
		}
		

		this.TableGui.SetValue(FilteredTable);
	}
}


