const _ = require("lodash");
const UUID = require("./UUID.js");
const Edge = require("./Edge.js");
const EventEmitter = require("events").EventEmitter;

class Vertex extends EventEmitter
{
	constructor(opt)
	{
		super();

		opt = _.defaultsDeep(opt, {
			ID: UUID({ Weak: true }),
			Edges: []
		});

		this.ID = opt.ID;
		this.Edges = opt.Edges;
	}

	GetAdjacent()
	{
		const adjacent = [];

		_.each(this.Edges, (edge) =>
		{
			if(!edge.Directed)
			{
				adjacent.push(edge.GetOppositeVertexFrom(this));
			}
			else if(edge.Directed && edge.From.ID === this.ID)
			{
				adjacent.push(edge.To);
			}
		});

		return adjacent;
	}

	GetPrecedent()
	{
		const precedent = [];

		_.each(this.Edges, (edge) =>
		{
			if(!edge.Directed)
			{
				precedent.push(edge.GetOppositeVertexFrom(this));
			}
			else if(edge.Directed && edge.To.ID === this.ID)
			{
				precedent.push(edge.From);
			}
		});

		return precedent;
	}

	AddEdgeTo(vertex, opt)
	{
		opt = _.defaultsDeep(opt, {
			From: this,
			To: vertex // User has to fill this in.
			// Other properties default from Edge.
		});

		const edge = new Edge(opt);

		this.Edges.push(edge);
		vertex.Edges.push(edge);

		return edge;
	}

	GetEdgeBetween(vertex)
	{
		let result = null;

		_.each(this.Edges, (edge) =>
		{
			if(edge.HasVertex(vertex))
			{
				result = edge;
				return false; // break
			}

			return true; // continue
		});

		return result;
	}

	HasEdgeBetween(vertex)
	{
		return this.GetEdgeBetween(vertex) !== null;
	}

	HasEdge(target_edge)
	{
		let found = false;

		_.each(this.Edges, (edge) =>
		{
			if(_.isEqual(edge, target_edge))
			{
				found = true;
				return false; // break
			}

			return true; // continue
		});

		return found;
	}

	RemoveEdge(target_edge, dont_recurse)
	{
		_.remove(this.Edges, (edge) =>
		{
			if(!dont_recurse)
			{
				edge.GetOppositeVertexFrom(this).RemoveEdge(target_edge, true);
			}

			return _.isEqual(edge, target_edge);
		});
	}

	RemoveEdgesBetween(vertex, dont_recurse)
	{
		_.remove(this.Edges, (edge) =>
		{
			if(!dont_recurse)
			{
				edge.GetOppositeVertexFrom(this).RemoveEdgesBetween(this, true);
			}
			return edge.HasVertex(vertex);
		});
	}

	Serialize()
	{
		return this.ID;
	}

	Sort()
	{
		this.Edges = _.sortBy(this.Edges, edge => edge.SortIdentifier);
	}

	Indegree()
	{
		let degree = 0;

		_.each(this.Edges, (edge) =>
		{
			if(!edge.Directed)
			{
				degree++;
			}
			else if(edge.Directed && edge.To.ID === this.ID)
			{
				degree++;
			}
		});

		return degree;
	}

	Outdegree()
	{
		let degree = 0;

		_.each(this.Edges, (edge) =>
		{
			if(!edge.Directed)
			{
				degree++;
			}
			else if(edge.Directed && edge.From.ID === this.ID)
			{
				degree++;
			}
		});

		return degree;
	}
}

module.exports = Vertex;
