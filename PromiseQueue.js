//	chrome having trouble with cyclical import
//import Pop from './PopEngine.js'

//	create a promise function with the Resolve & Reject functions attached so we can call them
export function CreatePromise()
{
	let Callbacks = {};
	let PromiseHandler = function (Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	Prom.Resolve = Callbacks.Resolve;
	Prom.Reject = Callbacks.Reject;
	return Prom;
}



//	a promise queue that manages multiple listeners
//	gr: this is getting out of sync with the cyclic-fixing-copy in WebApi. Make it seperate!
export default class PromiseQueue
{
	constructor(DebugName='UnnamedPromiseQueue',QueueWarningSize=100,Warning)
	{
		this.Warning = Warning || function(){};
		this.QueueWarningSize = QueueWarningSize;
		this.Name = DebugName;
		//	pending promises
		this.Promises = [];
		//	values we've yet to resolve (each is array capturing arguments from push()
		this.PendingValues = [];
	}

	async WaitForNext()
	{
		const Promise = this.Allocate();
		
		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending();
		
		return Promise;
	}

	//	this waits for next resolve, but when it flushes, it returns LAST entry and clears the rest; LIFO (kinda, last in, only out)
	async WaitForLatest(OnSkipped)
	{
		const Promise = this.Allocate();

		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending(true,OnSkipped);

		return Promise;
	}
	
	//	filter non-reject values in the queue
	FilterPending(Filter)
	{
		//	fifo!
		function DoFilter(Pending)
		{
			//	is a rejection, keep it
			if ( !Pending.ResolveValues )
				return true;
			const Keep = Filter( Pending.ResolveValues[0] );
			return Keep;
		}
		const Kept = this.PendingValues.filter( DoFilter );
		this.PendingValues = Kept;
	}

	ClearQueue(OnDropped)
	{
		//	delete values, losing data!
		const DroppedValues = this.PendingValues;
		this.PendingValues = [];
		
		//	callback for every item we've gotten rid of
		if ( OnDropped )
		{
			function OnDroppedPending(Pending)
			{
				const Value = (Pending.ResolveValues||Pending.RejectValues)[0];
				OnDropped( Value );
			}
			DroppedValues.forEach(OnDroppedPending);
		}	
	}
	
	//	allocate a promise, maybe deprecate this for the API WaitForNext() that makes more sense for a caller
	Allocate()
	{
		const NewPromise = CreatePromise();
		this.Promises.push( NewPromise );
		return NewPromise;
	}
	
	//	put this value in the queue, if its not already there (todo; option to choose oldest or newest position)
	PushUnique(Value)
	{
		const Args = Array.from(arguments);
		function IsMatch(PendingValue)
		{
			//	all arguments are now .PendingValues=[] or .RejectionValues=[]
			//	we are only comparing PendingValues, lets allow rejections to pile up as
			//	PushUnique wont be rejections. The Reject() code should have a RejectUnique() if this becomes the case
			if (!PendingValue.hasOwnProperty('ResolveValues'))
				return false;

			const a = PendingValue.ResolveValues;
			const b = Args;
			if ( a.length != b.length )	return false;
			for ( let i=0;	i<a.length;	i++ )
				if ( a[i] != b[i] )
					return false;
			return true;
		}
		//	skip adding if existing match
		if ( this.PendingValues.some(IsMatch) )
		{
			//this.Warning(`Skipping non-unique ${Args}`);
			return;
		}
		this.Push(...Args);
	}
	
	Push()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.ResolveValues = Args;
		
		if ( Args.length > 1 )
			this.Warning(`PromiseQueue (${this.Name}).Push(${Args}) with multiple args; What is this case? We should reduce to 1 arg`);
		
		this.PendingValues.push( Value );
		
		if ( this.PendingValues.length > this.QueueWarningSize )
			this.Warning(`This (${this.Name}) promise queue has ${this.PendingValues.length} pending values and ${this.Promises.length} pending promises`,this);
		
		this.FlushPending();
	}
	
	PeekLatest()
	{
		if ( !this.PendingValues.length )
			return undefined;
		const Latest = this.PendingValues[this.PendingValues.length-1];
		
		//	latest is a rejection... what should we do?
		if ( !Latest.ResolveValues )
			return undefined;
		
		//	multiple args can be passed in, as normally this goes to a Resolve
		//	gr: but promises onyl resolve to one value... so what's the case when we have multiple args?...
		
		return Latest.ResolveValues[0];
	}
	
	GetQueueSize()
	{
		return this.PendingValues.length;
	}
	
	HasPending()
	{
		return this.PendingValues.length > 0;
	}
	
	FlushPending(FlushLatestAndClear=false,OnDropped)
	{
		//	if there are promises and data's waiting, we can flush next
		if ( this.Promises.length == 0 )
			return;
		if ( this.PendingValues.length == 0 )
			return;
		
		//	flush 0 (FIFO)
		//	we pre-pop as we want all listeners to get the same value
		if (FlushLatestAndClear && this.PendingValues.length > 1)
		{
			this.Warning(`Promise queue FlushLatest dropping ${this.PendingValues.length - 1} elements`);
		}
		
		let Value0;
		if ( FlushLatestAndClear )
		{
			const Cut = this.PendingValues.splice(0,this.PendingValues.length);
			Value0 = Cut.pop();
			if ( OnDropped )
				Cut.forEach( v => OnDropped( (v.ResolveValues||v.RejectValues)[0] ) );
		}
		else
		{
			Value0 = this.PendingValues.shift();
		}
		const HandlePromise = function(Promise)
		{
			if ( Value0.RejectionValues )
				Promise.Reject( ...Value0.RejectionValues );
			else
				Promise.Resolve( ...Value0.ResolveValues );
		}
		
		//	pop array incase handling results in more promises, so we avoid infinite loop
		const Promises = this.Promises.splice(0);
		//	need to try/catch here otherwise some will be lost
		Promises.forEach( HandlePromise );
	}
	
	Resolve()
	{
		throw "PromiseQueue.Resolve() has been deprecated for Push() to enforce the pattern that we're handling a queue of values";
	}
	
	//	reject all the current promises
	Reject()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.RejectionValues = Args;
		this.PendingValues.push(Value);
		this.FlushPending();
	}
}

