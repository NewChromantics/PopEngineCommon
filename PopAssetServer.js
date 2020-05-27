
Pop.AssetServer = class
{
	constructor(WebsocketPorts)
	{
		this.CurrentPort = null;
		this.Ports = Array.isArray(WebsocketPorts) ? WebsocketPorts : [WebsocketPorts];

		this.ListenDirectories = [];
		this.FileMonitor = new Pop.FileMonitor();
		this.ChangedQueue = new Pop.PromiseQueue();

		this.WebsocketLoop().then(Pop.Debug).catch(Pop.Debug);
		this.FileWatchLoop().then(Pop.Debug).catch(Pop.Debug);
	}

	ListenToDirectory(Directory)
	{
		this.ListenDirectories.push(Directory);
		this.FileMonitor.Add(Directory);
	}

	TouchAllFiles()
	{
		//	get all files in directories we're watching
		function ListFiles(Directory)
		{
			function ListFile(Filename)
			{
				this.ChangedQueue.Push(Filename);
			}
			const Filenames = Pop.EnumDirectory(Directory);
			Filenames.forEach(ListFile.bind(this));
		}
		this.ListenDirectories.forEach(ListFiles.bind(this));
	}
	
	async FileWatchLoop()
	{
		while (true)
		{
			const ChangedFile = await this.FileMonitor.WaitForChange();
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
			if ( Message.Command == 'TouchAll' )
				this.TouchAllFiles();
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
		//	grab file... as what!? always send binary?
		const Contents = Pop.LoadFileAsString(Message.Filename);
		SendReply(Contents);
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
				SendLoop.bind(this)().then(Pop.Debug).catch(Pop.Debug);

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



