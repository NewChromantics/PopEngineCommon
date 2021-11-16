Pop.WebRtc = {};

Pop.WebRtc.IceServers = 
[
'stun.l.google.com:19302'
];

function GetWebRtcConfiguration()
{
	const Configuration = {};
	Configuration.iceServers = Pop.WebRtc.IceServers.map(IceServerToConfiguration);
	return Configuration;
}

function IceServerToConfiguration(IceServerAddress)
{
	const Entry = {};
	Entry.urls = `stun:${IceServerAddress}`;
	return Entry;
}


class WebRtcChannel_t
{
	constructor(Connection,Name,OnMessage,OnClosed)
	{
		this.Name = Name;
		this.OnMessage = OnMessage;
		this.OnClosed = OnClosed;
		
		//	buffer up messages that caller tries to send before we're open
		this.PendingSends = [];	

		this.Channel = Connection.createDataChannel(Name);
		this.Channel.onopen = this.OnOpen.bind(this);
		this.Channel.onclose = this.OnClose.bind(this);
		this.Channel.onmessage = OnMessage;
	}
	
	OnOpen(Event)
	{
		Pop.Debug(`Channel ${this.Name} opened`);
	}
	
	OnClose(Event)
	{
		this.OnClosed(this);
	}
	
	Send(Data)
	{
		//	flush pending sends, made simple by just adding new message to list
		this.PendingSends.push(Data);
		
		if ( this.Channel.readyState != 'open' )
		{
			Pop.Debug(`Channel readystate is ${this.Channel.readyState}`);
			return;
		}
		
		const PoppedSends = this.PendingSends.splice(0,this.PendingSends.length);
		for ( let SendData of PoppedSends )
		{
			this.Channel.send(SendData);
		}
	}
}


Pop.WebRtc.Server = class
{
	constructor()
	{
		this.Connection = new RTCPeerConnection( GetWebRtcConfiguration() );
		this.Connection.onicecandidate = this.OnIceCandidate.bind(this);
		
		this.HasAddressPromise = Pop.CreatePromise();
		this.HasConnectedPeerPromise = Pop.CreatePromise();
		
		this.Address = {};
		this.Address.Sdp = null;	//	connection info for protocol
		this.Address.OfferDescription = null;	//	sdp is in here
		this.Address.IceCandidateStrings = [];	//	possible routing candidates
		
		this.MessageQueue = new Pop.PromiseQueue(`WebRtc server message queue`);
		
		this.Channels = {};
		this.Channels['Data'] = null;
		this.CreateChannels();
	}
	
	//	gr: this is only required in WebRtc, see if there's a nicer way to not need this
	//		we need to notify of the answer (which includes the SDP)
	//		but we dont NEED the ice candidiate to connect local-local
	async AddClient(Address)
	{
		for ( let ic=0;	ic<Address.IceCandidateStrings.length;	ic++ )
		{
			const IceCandidateString = Address.IceCandidateStrings[ic];
			const IceCandidate = JSON.parse(IceCandidateString);
			try
			{
				if ( !this.Connection.remoteDescription )
					throw `Cannot add ice candidiate until remote description has been set/processed`;
				const Addded = await this.Connection.addIceCandidate(IceCandidate);
				Pop.Debug(`Added client ice candidate to server`);
			}
			catch(e)
			{
				Pop.Warning(`Error client ice candidate to server ${e}`);
			}
		}

		//	gr:we get an exception if we already have one set
		if ( this.Connection.remoteDescription )
		{
			//Pop.Warning(`connection already has a remote descrption, ignoring new one in addclient()`);
			return;
		}
		const ClientDescription = new RTCSessionDescription(Address.AnswerDescription);
		try
		{
			const Result = await this.Connection.setRemoteDescription(ClientDescription);
			Pop.Debug(`Server SetRemote`);
			//	how do we know?
			Pop.Debug(`Server set remote result;`,Result);
		}
		catch(e)
		{
			Pop.Warning(`Server set remote error;`,e);
			this.HasConnectedPeerPromise.Reject(e);
			throw e;
		}	
		//	now we have a remote description, we should be connected...
	}
	
	OnChannelMessage(Message,Channel)
	{
		const Packet = {};
		Packet.Peer = null;
		Packet.Data = Message.data;
		Packet.Channel = Channel;
		Packet.RecieveTime = Pop.GetTimeNowMs();

		this.MessageQueue.Push(Packet);
		//Pop.Debug(`Server OnChannelMessage`,...arguments);
	}
			
	OnChannelClosed(Channel)
	{
		Pop.Debug(`Server OnChannelClosed`,...arguments);
	}
	
	async CreateChannels()
	{
		//	gr: have to create streams and channels before creating offer (description) to get ice candidate callback
		const ChannelNames = Object.keys(this.Channels);
		for ( let ChannelName of ChannelNames )
		{
			const OnMessage = this.OnChannelMessage.bind(this);
			const OnClosed = this.OnChannelClosed.bind(this);
			const Channel = new WebRtcChannel_t(this.Connection,ChannelName,OnMessage,OnClosed);
			this.Channels[ChannelName] = Channel;
		}
		
		//	now we have all channels& streams, we create the description+sdp
		const OfferDescription = await this.Connection.createOffer();
		this.Address.OfferDescription = OfferDescription;
		this.Address.Sdp = this.Address.OfferDescription.sdp;
		await this.Connection.setLocalDescription( this.Address.OfferDescription );
		Pop.Debug(`Server setLocal`);
		this.OnAddressChanged();		
	}
	
	async WaitForConnect()
	{
		return this.HasAddressPromise;
	}
	
	async WaitForNewPeer()
	{
		return this.HasConnectedPeerPromise;
	}
	
	async WaitForMessage()
	{
		return this.MessageQueue.WaitForNext();
	}
	
	GetAddress()
	{
		return this.Address;
	}
	
	OnIceCandidate(Event)
	{
		//	update "address"
		const Candidate = Event.candidate;
		if ( !Candidate )
		{
			Pop.Debug(`Server got ${Candidate} candidate`);
			return;
		}
		const CandidateJson = Candidate.toJSON();
		const CandidateString = JSON.stringify(CandidateJson);
		this.Address.IceCandidateStrings.push(CandidateString);
		this.OnAddressChanged();
	}
	
	OnAddressChanged()
	{
		//	do we have everything we need to be considered listening?
		//	gr: I think as a minimum we just need SDP
		if ( !this.Address.Sdp )
		{
			Pop.Warning(`OnAddressChanged, waiting for SDP`);
			return;
		}
		//	docs say we don't need an ice candidate, but...
		//	it won't connect without...
		if ( !this.Address.IceCandidateStrings.length )
		{
			Pop.Warning(`OnAddressChanged, waiting for ice candidate`);
			return;
		}
		this.HasAddressPromise.Resolve();
	}
	
	GetPeers()
	{
		return [null];
	}
	
	Send(Peer,Data,ChannelName='Data')
	{
		if ( Peer != this.GetPeers()[0] )
			throw `Send(Peer=${Peer}) peer expected=${this.GetPeers()[0]}`;
		if ( !this.Channels.hasOwnProperty(ChannelName) )
			throw `Server has no channel named ${ChannelName}`;
			
		const Channel = this.Channels[ChannelName];
		Channel.Send(Data);
	}
};

Pop.WebRtc.Client = class
{
	//	RemoteAddress here is ice candidate & offer-description
	constructor(RemoteAddress)
	{
		this.MessageQueue = new Pop.PromiseQueue(`webrtc client message queue`);
		
		this.Address = {};
		this.Address.IceCandidateStrings = [];
		this.Address.AnswerDescription = null;
		this.HasAddressPromise = Pop.CreatePromise();
		
		this.Channels = {};	//	Channel['Name']
		
		this.Connection = new RTCPeerConnection( GetWebRtcConfiguration() );
		this.Connection.onicecandidate = this.OnIceCandidate.bind(this);
		this.Connection.ondatachannel = this.OnFoundDataChannel.bind(this);
		this.ConnectedPromise = this.Connect(RemoteAddress);
	}
	
	
	async Connect(Address)
	{
		//	set the description&sdp of "server"
		const OfferDescription = new RTCSessionDescription(Address.OfferDescription);
		await this.Connection.setRemoteDescription(OfferDescription);
		Pop.Debug(`Client SetRemote`);
		
		
		//	now we've set description(offer), we can make an answer
		const AnswerDescription = await this.Connection.createAnswer();
		await this.Connection.setLocalDescription( AnswerDescription );
		Pop.Debug(`Client setLocal`);
		
		
		
		//	add all possible candidates (async, hence here)
		//forEach ( let IceCandidate of Address.IceCandidateStrings )
		for ( let i=0;	i<Address.IceCandidateStrings.length;	i++ )
		{
			const IceCandidateString = Address.IceCandidateStrings[i];
			const IceCandidate = JSON.parse(IceCandidateString);
			try
			{
				const AddedIce = await this.Connection.addIceCandidate(IceCandidate);
				Pop.Debug(`Client added ice candidate`);
			}
			catch(e)
			{
				Pop.Warning(`Client failed to add ice candidiate; ${e}`);
			}
		}
		
		
		this.Address.AnswerDescription = AnswerDescription;
		this.OnAddressChanged();
	}
	
	GetAddress()
	{
		return this.Address;
	}
	
	OnIceCandidate(Event)
	{
		//	update "address"
		const Candidate = Event.candidate;
		if ( !Candidate )
		{
			Pop.Debug(`Server got ${Candidate} candidate`);
			return;
		}
		const CandidateJson = Candidate.toJSON();
		const CandidateString = JSON.stringify(CandidateJson);
		this.Address.IceCandidateStrings.push(CandidateString);
		this.OnAddressChanged();
	}
	
	async WaitForAddress()
	{
		return this.HasAddressPromise;
	}
	
	OnConnectError(Error)
	{
		this.ConnectedPromise.Reject(Error);
	}
	
	OnFoundDataChannel(Event)
	{
		const Channel = Event.channel;
		Pop.Debug(`OnFoundChannel`,Channel);
		const ChannelName = 'Data';
		this.Channels[ChannelName] = Channel;
		
		function OnMessage(Event)
		{
			//Pop.Debug(`Client got message`,Event);
			const Packet = {};
			Packet.Peer = null;
			Packet.Data = Event.data;
			this.MessageQueue.Push(Packet);
		}
		
		Channel.onmessage = OnMessage.bind(this);
		Channel.onopen = e => console.log(`Client channel open`,e);
		Channel.onclose = e => console.log(`Client channel close`,e);
	}
	
	async WaitForConnect()
	{
		return this.ConnectedPromise;
	}
	
	async WaitForMessage()
	{
		//	wait for connection first, if we've lost connection
		//	it will reject
		await this.ConnectedPromise;
		return this.MessageQueue.WaitForNext();
	}
	
	OnAddressChanged()
	{
		Pop.Debug(`client address changed`);
		//	gr: at least in a local-local, it SEEMS we don't need an ice candidate
		//		this may be different once we get onto the internet
		this.HasAddressPromise.Resolve( this.Address );
	}
	
	GetPeers()
	{
		return [null];
	}
	
	//	peer is not needed, but fits api of other sockets
	Send(Peer,Data,ChannelName='Data')
	{
		if ( Peer != this.GetPeers()[0] )
			throw `Send(Peer=${Peer}) peer expected=${this.GetPeers()[0]}`;
	
		if ( !this.Channels.hasOwnProperty(ChannelName) )
		{
			//throw `No channel named ${ChannelName}; ${Object.keys(this.Channels)}`;
			Pop.Debug(`No channel named ${ChannelName}; ${Object.keys(this.Channels)}`);
			return;
		}
			
		const Channel = this.Channels[ChannelName];
		Channel.send(Data);
	}
};

