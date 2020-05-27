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
Pop.Websocket.Client = function(Hostname,Port=80)
{
	this.OnConnectPromises = new Pop.PromiseQueue();
	this.OnMessagePromises = new Pop.PromiseQueue();
	
	this.WaitForConnect = async function()
	{
		return this.OnConnectPromises.WaitForNext();
	}
	
	this.WaitForMessage = async function()
	{
		return this.OnMessagePromises.WaitForNext();
	}
	
	this.OnConnected = function(Event)
	{
		this.OnConnectPromises.Push(Event);
	}
	
	this.OnError = function(Event)
	{
		const Error = GetWebsocketError(Event);
		//	gr: on connection error, error gets invoked first, with no useful info
		//		so lets keep them seperate so error only matters to messages
		//this.OnConnectPromises.Reject(Error);
		this.OnMessagePromises.Reject(Error);
	}
	
	this.OnDisconnected = function(Event)
	{
		//	OnError is just for messages, but in case that doesnt get triggered,
		//	clear messages too
		const Error = GetWebsocketError(Event);
		this.OnConnectPromises.Reject(Error);
		this.OnMessagePromises.Reject(Error);
	}
	
	this.OnMessage = function(Event)
	{
		const Data = Event.data;
		const Packet = {};
		Packet.Peer = this.GetPeers()[0];
		Packet.Data = null;

		//	if we get a blob, convert to array (no blobs in normal API)
		if ( typeof Data == 'string' )
		{
			Packet.Data = Data;
			this.OnMessagePromises.Push(Packet);
			return;
		}
		
		if ( Data instanceof Blob )
		{
			const ConvertData = async function()
			{
				const DataArrayBuffer = await Data.arrayBuffer();
				const DataArray = new Uint8Array(DataArrayBuffer);
				Packet.Data = DataArray;
				this.OnMessagePromises.Push( Packet );
			}.bind(this);
			
			ConvertData().then().catch( this.OnError.bind(this) );
			return;
		}
		
		throw "Unhandled type of websocket message; " + Data + " (" + (typeof Data) + ")";
	}
	
	this.GetPeers = function()
	{
		//	this should only return once connected
		return ['Server'];
	}
	
	this.Send = function(Peer,Message)
	{
		if ( !this.Socket )
			throw "Todo: Socket not created. Create a promise on connection to send this message";

		if ( Message === undefined )
			throw "Websocket.Client.Send(Peer,undefined) (no message) possible old API usage";
		
		this.Socket.send( Message );
	}
	
	//	create a socket
	//	we don't handle reconnecting, assume user is using Pop.Websocket.Connect
	//	and when connect or message throws, this is discarded and it connects again
	let ServerAddress = `${Hostname}:${Port}`;
	if (!ServerAddress.startsWith('ws://') && !ServerAddress.startsWith('wss://'))
		ServerAddress = 'ws://' + ServerAddress;
	this.Socket = new WebSocket(ServerAddress);
	this.Socket.onopen = this.OnConnected.bind(this);
	this.Socket.onerror = this.OnError.bind(this);
	this.Socket.onclose = this.OnDisconnected.bind(this);
	this.Socket.onmessage = this.OnMessage.bind(this);
}

//	asynchronously returns a websocket client once it connects
Pop.Websocket.Connect = async function(Hostname,Port=80)
{
	const Socket = new Pop.Websocket.Client(Hostname,Port);
	await Socket.WaitForConnect();
	return Socket;
}
