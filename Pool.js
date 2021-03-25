export default class Pool
{
	constructor(AllocItem,OnWarning,FindBestFree)
	{
		if ( !OnWarning )
			OnWarning = function(){};
		
		if ( !FindBestFree )
			FindBestFree = function(){	return 0;	};
		
		this.AllocItem = AllocItem;
		this.UsedItems = [];
		this.FreeItems = [];
		this.OnWarning = OnWarning;
		this.FindBestFree = FindBestFree;
	}
	
	Alloc()
	{
		//	see if there are any best-match free items
		//	if there isn't one, allocate.
		//	this lets us filter & add new pool items based on arguments
		let BestFreeIndex = this.FindBestFree(this.FreeItems,...arguments);
		if ( BestFreeIndex === undefined )
			throw `Pool FindBestFree() should not return undefined`;

		//	add a new item if we know there's none availible
		if ( BestFreeIndex < 0 || BestFreeIndex === false || BestFreeIndex === null )
		{
			const NewItem = this.AllocItem(...arguments);
			this.FreeItems.push(NewItem);
			BestFreeIndex = this.FreeItems.length-1;
		}

		//	splice returns array of cut items
		const Item = this.FreeItems.splice(BestFreeIndex,1)[0];
		if ( Item === undefined )
			throw `No free items to allocate from`;
		this.UsedItems.push(Item);
		
		return Item;
	}
	
	Release(Item)
	{
		//	remove from used queue
		const UsedIndex = this.UsedItems.indexOf(Item);
		if ( UsedIndex < 0 )
		{
			this.OnWarning(`Releasing item ${Item} back into pool, but missing from Used Items list`);
			return;
		}
		this.UsedItems = this.UsedItems.filter( i => i != Item );
		this.FreeItems.push( Item );
	}
}

