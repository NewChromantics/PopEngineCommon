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
Pop.Websocket.Client = function(ServerAddress)
{
	this.OnConnectPromises = new Pop.PromiseQueue();
	this.OnMessagePromises = new Pop.PromiseQueue();
	
	this.WaitForConnect = async function()
	{
		return this.OnConnectPromises.Allocate();
	}
	
	this.WaitForMessage = async function()
	{
		return this.OnMessagePromises.Allocate();
	}
	
	this.OnConnected = function(Event)
	{
		this.OnConnectPromises.Resolve(Event);
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
		this.OnMessagePromises.Resolve(Data);
	}
	
	this.Send = function(Message)
	{
		if ( !this.Socket )
			throw "Todo: Socket not created. Create a promise on connection to send this message";

		this.Socket.send( Message );
	}
	
	//	create a socket
	//	we don't handle reconnecting, assume user is using Pop.Websocket.Connect
	//	and when connect or message throws, this is discarded and it connects again
	this.Socket = new WebSocket('ws://' + ServerAddress);
	this.Socket.onopen = this.OnConnected.bind(this);
	this.Socket.onerror = this.OnError.bind(this);
	this.Socket.onclose = this.OnDisconnected.bind(this);
}

//	asynchronously returns a websocket client once it connects
Pop.Websocket.Connect = async function(ServerAddress)
{
	const Socket = new Pop.Websocket.Client(ServerAddress);
	await Socket.WaitForConnect();
	return Socket;
}
