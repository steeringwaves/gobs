const _ = require("lodash");

class Edge
{
	constructor(opt)
	{
		opt = _.defaultsDeep(opt, {
			From: null,
			To: null,
			Directed: false,
			Weight: 1
		});

		if(!opt.From || !opt.To)
		{
			throw new Error(`Cannot construct an edge without two vertices (from ${opt.From} to ${opt.To})`);
		}

		this.From = opt.From;
		this.To = opt.To;
		this.Directed = opt.Directed;
		this.Weight = opt.Weight;
	}

	get SortIdentifier()
	{
		return`${this.Weight}${this.From.ID}${this.To.ID}${this.Directed}`;
	}

	HasVertex(vertex)
	{
		if(this.From && this.From.ID === vertex.ID)
		{
			return true;
		}

		if(this.To && this.To.ID === vertex.ID)
		{
			return true;
		}

		return false;
	}

	GetOppositeVertexFrom(vertex)
	{
		if(this.From && this.From.ID !== vertex.ID)
		{
			return this.From;
		}

		return this.To;
	}

	Serialize()
	{
		return{
			From: this.From.ID,
			To: this.To.ID,
			Directed: this.Directed,
			Weight: this.Weight
		};
	}
}

module.exports = Edge;
