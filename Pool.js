export default class Pool
{
	constructor(AllocItem,OnWarning)
	{
		this.AllocItem = AllocItem;
		this.UsedItems = [];
		this.FreeItems = [];
		this.OnWarning = OnWarning || function(){};
	}
	
	Alloc()
	{
		//	add a new item if we know there's none availible
		if ( !this.FreeItems.length )
		{
			const NewItem = this.AllocItem();
			this.FreeItems.push(NewItem);
		}
		
		const Item = this.FreeItems.shift();
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
			this.OnWarning(`Releasing item ${Item} back into pool, but missing from Used Items list`);
		this.UsedItems = this.UsedItems.filter( i => i != Item );
		this.FreeItems.push( Item );
	}
}

