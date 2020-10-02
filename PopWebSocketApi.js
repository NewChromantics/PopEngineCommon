Pop.Websocket = {};


function GetWebsocketError(Event)
{
	if ( Event.reason && Event.reason.length )
		return Event.reason;
	
	if ( Event.code )
	{
		return "Websocket Code [" + Event.code + "]";
	}
	
	return "Websocket Error";
}



//	wrapper for websocket
Pop.Websocket.Client = class
{
	constructor(Hostname,Port=80)
	{
		this.OnConnectPromises = new Pop.PromiseQueue('WebsocketClient Connects');
		this.OnMessagePromises = new Pop.PromiseQueue('WebsocketClient Messages');
	
		//	because we need messages to stay in order, but blobs(binary) needs to be async processed
		//	we need to keep the data in order and process the data seperately on a thread
		this.PendingMessageData = new Pop.PromiseQueue('WebsocketClient PendingMessages');
		
		this.ProcessPendingMessageDataThread().catch(this.OnError.bind(this));
						
		//	create a socket
		//	we don't handle reconnecting, assume user is using Pop.Websocket.Connect
		//	and when connect or message throws, this is discarded and it connects again

		//	parse hostname in case something odd is put in
		//	native doesnt support this!
		//	ws://hello:port
		const Pattern = '^(ws:\/\/|wss:\/\/)?([^:]+)(:([0-9]+))?$';
		const Parts = Hostname.split(new RegExp(Pattern));

		//	if no match (array of 1==original), just continue as before
		if (Parts.length > 1)
		{
			let [Prefix,Protocol,NewHostname,ColonAndPort,NewPort,Suffic] = Parts;
			//	this will be undefined if we just have ws://
			if (NewHostname !== undefined)
			{
				const OldHostname = Hostname;
				//	fill defaults where not present
				Protocol = Protocol || '';
				Port = NewPort || Port;
				Hostname = `${Protocol}${NewHostname}`;
				Pop.Debug(`Parsed websocket address ${OldHostname} to Hostname=${Hostname} Port=${Port}`);
			}
		}

		let ServerAddress = `${Hostname}:${Port}`;
		if (!ServerAddress.startsWith('ws://') && !ServerAddress.startsWith('wss://'))
			ServerAddress = 'ws://' + ServerAddress;
		this.Socket = new WebSocket(ServerAddress);
		this.Socket.onopen = this.OnConnected.bind(this);
		this.Socket.onerror = this.OnError.bind(this);
		this.Socket.onclose = this.OnDisconnected.bind(this);
		this.Socket.onmessage = this.OnMessage.bind(this);
	}
	
	async WaitForConnect()
	{
		return this.OnConnectPromises.WaitForNext();
	}
	
	async WaitForMessage()
	{
		return this.OnMessagePromises.WaitForNext();
	}
	
	OnConnected(Event)
	{
		this.OnConnectPromises.Push(Event);
	}
	
	OnError(Event)
	{
		const Error = GetWebsocketError(Event);
		//	gr: on connection error, error gets invoked first, with no useful info
		//		so lets keep them seperate so error only matters to messages
		//this.OnConnectPromises.Reject(Error);
		this.OnMessagePromises.Reject(Error);
	}
	
	OnDisconnected(Event)
	{
		//	OnError is just for messages, but in case that doesnt get triggered,
		//	clear messages too
		const Error = GetWebsocketError(Event);
		this.OnConnectPromises.Reject(Error);
		this.OnMessagePromises.Reject(Error);
	}
	
	OnMessage(Event)
	{
		const Data = Event.data;
		const Packet = {};
		Packet.Peer = this.GetPeers()[0];
		Packet.Data = Data;
		Packet.RecieveTime = Pop.GetTimeNowMs();

		//	gr: doing immediate string, and async blob->array buffer means
		//		one is queued immediately, and one is not, so data gets out of order
		this.PendingMessageData.Push(Packet);
	}
	
	async ProcessPendingMessageDataThread()
	{
		while ( this.PendingMessageData )
		{
			const Packet = await this.PendingMessageData.WaitForNext();
			
			//	if we get a blob, convert to array (no blobs in normal API)
			//	but we do it here, to make sure we keep messages in order
			if ( Packet.Data instanceof Blob )
			{
				const DataArrayBuffer = await Packet.Data.arrayBuffer();
				const DataArray = new Uint8Array(DataArrayBuffer);
				Packet.Data = DataArray;
			}
			//	else if ! string throw "Unhandled type of websocket message; " + Data + " (" + (typeof Data) + ")";
			
			this.OnMessagePromises.Push(Packet);
		}
	}
	
	GetPeers()
	{
		//	this should only return once connected
		return ['Server'];
	}
	
	Send(Peer,Message)
	{
		if ( !this.Socket )
			throw "Todo: Socket not created. Create a promise on connection to send this message";

		if ( Message === undefined )
			throw "Websocket.Client.Send(Peer,undefined) (no message) possible old API usage";
		
		this.Socket.send( Message );
	}
	
}

//	asynchronously returns a websocket client once it connects
Pop.Websocket.Connect = async function(Hostname,Port=80)
{
	const Socket = new Pop.Websocket.Client(Hostname,Port);
	await Socket.WaitForConnect();
	return Socket;
}
