import {Lerp,Lerp3} from './Math.js'

/*	this is a generic octree class

a BoundingBox is 
{
	.Min = [x,y,z]
	.Max = [x,y,z]
}

Create the outer/root OctreeNode

then call .SplitRecursive() with a functor which lets 
you decide if a node should split again

*/
export default class OctreeNode
{
	constructor(Parent,BoundingBox,ChildIndex=0)
	{
		this.Parent = Parent;
		this.Children = [];
		this.BoundingBox = BoundingBox;
		this.NoSplitReason = null;
		this.Key = ''+ChildIndex;
	}

	//	generate the full unique key of this node
	GetKey()
	{
		let Key = '';
		if ( this.Parent )
			Key += this.Parent.GetKey();
		Key += this.Key;
		return Key;
	}

	GetCenter()
	{
		return Lerp3( this.BoundingBox.Min, this.BoundingBox.Max, 0.5 );
	}

	GetDepth()
	{
		if ( !this.Parent )
			return 0;
		return this.Parent.GetDepth()+1;
	}

	IsEmptyBox()
	{
		return this.NoSplitReason == 'Empty';
	}

	IsLeaf()
	{
		return this.Children.length == 0;
	}

	//	recursively get all bounding boxes
	EnumBoundingBoxes(EnumBox)
	{
		const LeafType = this.NoSplitReason;
		EnumBox(this.BoundingBox,LeafType);

		for ( let Child of this.Children )
			Child.EnumBoundingBoxes( EnumBox );
	}

	Traverse(EnumDeeper)
	{
		const GoDeeper = EnumDeeper(this);
		if ( GoDeeper )
		{
			for ( let Child of this.Children )
			{
				Child.Traverse(EnumDeeper);
			}
		}
	}

	Split(ShouldSplit)
	{
		const Split = ShouldSplit(this.BoundingBox);
		if ( Split !== true )
		{
			this.NoSplitReason = Split;
			return;
		}

		//	split into 2x2x2
		for ( let x=0;	x<1;	x+=0.5 )
			for ( let y=0;	y<1;	y+=0.5 )
				for ( let z=0;	z<1;	z+=0.5 )
		{
			const Box = [x,y,z];
			const Min = [];
			const Max = [];
			for ( let dim=0;	dim<3;	dim++ )
			{
				Min[dim] = Lerp( this.BoundingBox.Min[dim], this.BoundingBox.Max[dim], Box[dim]+0.0 );
				Max[dim] = Lerp( this.BoundingBox.Min[dim], this.BoundingBox.Max[dim], Box[dim]+0.5 );
			}
			const ChildBoundingBox = {};
			ChildBoundingBox.Min = Min;
			ChildBoundingBox.Max = Max;
			const ChildIndex = this.Children.length;
			const Child = new OctreeNode(this,ChildBoundingBox,ChildIndex);
			this.Children.push(Child);
		}
	}

	async SplitRecursive(ShouldSplit,MaxRecursions)
	{
		//	finished
		if ( MaxRecursions <= 0 )
			return;

		this.Split(ShouldSplit);

		//	continue to children
		for ( let i=0;	i<this.Children.length;	i++ )
		{
			const Child = this.Children[i];
			await Child.SplitRecursive(ShouldSplit,MaxRecursions-1);
		}
	}
}
