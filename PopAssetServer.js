
Pop.AssetServer = class
{
	constructor(WebsocketPorts)
	{
		this.CurrentPort = null;
		this.Ports = Array.isArray(WebsocketPorts) ? WebsocketPorts : [WebsocketPorts];

		this.ListenDirectories = [];
		this.FileMonitor = new Pop.FileMonitor();
		this.ChangedQueue = new Pop.PromiseQueue();	//	queue of filename (or filenames) everytime a file changes

		this.WebsocketLoop().then(Pop.Debug).catch(Pop.Warning);
		this.FileWatchLoop().then(Pop.Debug).catch(Pop.Warning);
	}
	
	FilterFilename(Filename)
	{
		//	todo: Pop.GetOsFilenames (I think there's been a need for this before)
		if ( Filename.endsWith('.DS_Store') )
			return false;
		if (Filename.startsWith('.git'))
			return false;
		if (Filename.includes('/.git'))
			return false;

		return true;
	}

	ListenToDirectory(Directory)
	{
		this.ListenDirectories.push(Directory);
		this.FileMonitor.Add(Directory);
	}

	OnRequestListFiles()
	{
		//	get all files in directories we're watching
		function ListFiles(Directory)
		{
			//	lets send a big group of the filenames
			let Filenames = Pop.GetFilenames(Directory);
			Filenames = Filenames.filter(this.FilterFilename);
			Pop.Debug(`Filenames in ${Directory}; ${Filenames}`);
			this.ChangedQueue.Push(Filenames);
		}
		this.ListenDirectories.forEach(ListFiles.bind(this));
	}
	
	async FileWatchLoop()
	{
		while (true)
		{
			const ChangedFile = await this.FileMonitor.WaitForChange();
			if ( !this.FilterFilename(ChangedFile) )
			{
				Pop.Debug(`ChangedFile ${ChangedFile} ignored`);
				continue;
			}
			Pop.Debug(`ChangedFile ${ChangedFile}`);
			
			this.ChangedQueue.Push(ChangedFile);
		}
	}

	GetNextPort()
	{
		if (this.CurrentPort === null)
			this.CurrentPort = 0;
		else
			this.CurrentPort++;

		const Port = this.Ports[this.CurrentPort % this.Ports.length];
		return Port;
	}

	OnMessage(Packet,SendReply)
	{
		//	check for meta or file requests and send stuff back
		Pop.Debug(`Got Message ${Packet.Data}`);
		
		try
		{
			const Message = JSON.parse(Packet.Data);
			if ( Message.Command == 'RequestList' )
				this.OnRequestListFiles();
			else if ( Message.Command == 'RequestFile' )
				this.OnRequestFile(Message,SendReply);
			else
				throw `Unhandled Command ${Message.Command}`;
		}
		catch(e)
		{
			const Reply = {};
			Reply.Error = e;
			SendReply( JSON.stringify(Reply) );
			Pop.Debug(`Error with incoming message ${JSON.stringify(Packet)}; ${e}`);
		}
	}

	OnRequestFile(Message,SendReply)
	{
		//	client is requesting a file from one of our listening directories!
		function GetListenFilename(ListenDirectory)
		{
			return ListenDirectory + '/' + Message.Filename;
		}
		const ListenFilenames = this.ListenDirectories.map(GetListenFilename);
		
		//	todo: find last-modified in case there's a clash
		for ( let Path of ListenFilenames )
		{
			if ( !Pop.FileExists(Path) )
				continue;
			
			//	get the file as binary, then insert simple meta json at the start
			//	this way, binary packets are always independent files and independent
			//	meta so OOO packets are okay (client can handle encoding)
			const FileContents = Pop.LoadFileAsArrayBuffer(Path);
			const Meta = {};
			Meta.Filename = Message.Filename;
			const MetaJsonBin = Pop.StringToBytes(JSON.stringify(Meta));
			
			//	concat
			const Contents = new Uint8Array( MetaJsonBin.length + FileContents.length );
			Contents.set( MetaJsonBin, 0 );
			Contents.set( FileContents, MetaJsonBin.length );
			//const ContentsStr = Pop.BytesToString(Contents);
			//Pop.Debug(`New contents ${ContentsStr}`);
			
			SendReply(Contents);
			return;
		}

		//	todo: specifically throw a "file not found Message.Filename" response so caller can forget about the file?
		throw `Requested file (${Message.Filename}) failed to load from options; ${ListenFilenames}`;
	}
	
	async WebsocketLoop()
	{
		while (true)
		{
			try
			{
				const Port = this.GetNextPort();
				let Socket = new Pop.Websocket.Server(Port);

				function SendToPeers(Packet)
				{
					const Peers = Socket.GetPeers();
					function Send(Peer)
					{
						Socket.Send(Peer,Packet);
					}
					Peers.forEach(Send);
				}

				async function SendLoop()
				{
					while (Socket)//	is open? some flag to say this is still active
					{
						const ChangedFile = await this.ChangedQueue.WaitForNext();
						let ChangedMeta = {};
						ChangedMeta.Command = 'FileChanged';
						ChangedMeta.Filename = ChangedFile;
						ChangedMeta = JSON.stringify(ChangedMeta);
						SendToPeers(ChangedMeta);
					}
				}
				SendLoop.bind(this)().then(Pop.Debug).catch(Pop.Warning);

				while (Socket)
				{
					const Message = await Socket.WaitForMessage();
					this.OnMessage(Message,SendToPeers);
				}
			}
			catch (e)
			{
				Pop.Debug(`Pop.AssetServer error ${e}`);
				await Pop.Yield(200);
			}
		}
	}
}



