
Pop.AssetServer = class
{
	constructor(WebsocketPorts)
	{
		this.CurrentPort = null;
		this.Ports = Array.isArray(WebsocketPorts) ? WebsocketPorts : [WebsocketPorts];

		this.FileMonitor = new Pop.FileMonitor();
		this.FileWatchLoop().then(Pop.Debug).catch(Pop.Debug);
		this.ChangedQueue = new Pop.PromiseQueue();
	}

	ListenToDirectory(Directory)
	{
		this.FileMonitor.Add(Directory);
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

	OnMessage(Message,SendReply)
	{
		//	check for meta or file requests and send stuff back
		Pop.Debug(`Got Message ${Message}`);
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
						ChangedMeta.Filename = ChangedFile;
						ChangedMeta = JSON.stringify(ChangedMeta);
						SendToPeers(ChangedMeta);
					}
				}
				SendLoop().then(Pop.Debug).catch(Pop.Debug);

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



