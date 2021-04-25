export default class Pool
{
	constructor(Name,AllocItem,OnWarning,PopFromFreeList)
	{
		if ( typeof Name != 'string' )
			throw `New constructor for pool, first argument should be name, not ${Name}`;
		this.Name = Name;
		
		if ( !OnWarning )
			OnWarning = function(){};
		
		if ( !PopFromFreeList )
		{
			PopFromFreeList = function(){	throw `implement default find best free`;	};
		}
		
		this.AllocItem = AllocItem;
		this.UsedItems = [];
		this.FreeItems = [];
		this.OnWarning = OnWarning;
		this.PopFromFreeList = PopFromFreeList;
	}
	
	Alloc()
	{
		//	see if there are any best-match free items
		//	if there isn't one, allocate.
		//	this lets us filter & add new pool items based on arguments
		//	gr: I was getting what seems like a race condition
		//		the match happend, return index 1
		//		another matched happened, returned index 0, spliced
		//		then index1 was spliced (splicing 2)
		//		was I running something from another thread/module's event loop?
		let Popped = this.PopFromFreeList(this.FreeItems,...arguments);
		if ( Popped === undefined )
			throw `B) Pool ${this.Name} FindBestFree() should not return undefined. return false if no match`;

		if ( Popped )
		{
			this.UsedItems.push(Popped);
			return Popped;
		}

		const NewItem = this.AllocItem(...arguments);
		this.UsedItems.push(NewItem);
		this.DebugPoolSize();
		return NewItem;
	}
	
	Release(Item)
	{
		//	remove from used queue
		const UsedIndex = this.UsedItems.indexOf(Item);
		if ( UsedIndex < 0 )
		{
			const Name = Item.Name ? `(.Name=${Item.Name})` : '';
			this.OnWarning(`B) Pool ${this.Name} Releasing item ${Item}${Name} back into pool, but missing from Used Items list`);
			this.DebugPoolSize();
			return;
		}
		
		const Name = Item.Name ? `(.Name=${Item.Name})` : '';
		this.OnWarning(`B) Pool ${this.Name} Released item ${Item}${Name} back into pool.`);
		
		this.UsedItems = this.UsedItems.filter( i => i != Item );
		this.FreeItems.push( Item );
	}
	
	DebugPoolSize()
	{
		this.OnWarning(`B) Pool ${this.Name} size now x${this.UsedItems.length} Used, x${this.FreeItems.length} free`);
	}
}

