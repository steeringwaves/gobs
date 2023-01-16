const _ = require("lodash");
const Vertex = require("./Vertex.js");
const Edge = require("./Edge.js");

// Inspired by https://github.com/datavis-tech/graph-data-structure
class Graph
{
	constructor(opt)
	{
		opt = _.defaultsDeep(opt, { Vertices: {} });

		this.Vertices = opt.Vertices;
	}

	AddVertex(vertex)
	{
		if(!this.Vertices[vertex.ID])
		{
			this.Vertices[vertex.ID] = vertex;
		}
		else
		{
			throw new Error(`A vertex with ID ${vertex.ID} already exists in the graph`);
		}
	}

	RemoveVertex(target_vertex)
	{
		if(this.Vertices[target_vertex.ID])
		{
			delete this.Vertices[target_vertex.ID];
		}
		else
		{
			throw new Error("Vertex with ID does not exist in the graph");
		}
	}

	HasEdge(target_edge)
	{
		let found = false;

		_.each(this.Vertices, (vertex) =>
		{
			if(vertex.HasEdge(target_edge))
			{
				found = true;
				return false; // break
			}

			return true; // continue
		});

		return found;
	}

	GetEdgeBetween(left, right)
	{
		let found = null;

		_.each(this.Vertices, (vertex) =>
		{
			if(vertex.ID === left.ID)
			{
				const test = vertex.GetEdgeBetween(right);
				if(test !== null)
				{
					found = test;
					return false; // break
				}
			}
			else if(vertex.ID === right.ID)
			{
				const test = vertex.GetEdgeBetween(left);
				if(test !== null)
				{
					found = test;
					return false; // break
				}
			}

			return true; // continue
		});

		return found;
	}

	HasEdgeBetween(left, right)
	{
		return this.GetEdgeBetween(left, right) !== null;
	}

	GetVertexFromID(id)
	{
		return this.Vertices[id];
	}

	HasVertex(target_vertex)
	{
		if(this.GetVertexFromID(target_vertex.ID))
		{
			return true;
		}

		return false;
	}

	IsDirected()
	{
		let is_directed = false;

		_.each(this.Vertices, (vertex) =>
		{
			_.each(vertex.Edges, (edge) =>
			{
				if(edge.Directed)
				{
					is_directed = true;
					return false; // break
				}

				return true; // continue
			});

			if(is_directed)
			{
				return false; // break
			}

			return true; // continue
		});

		return is_directed;
	}

	SetAllDirected(directed)
	{
		_.each(this.Vertices, (vertex) =>
		{
			_.each(vertex.Edges, (edge) =>
			{
				edge.Directed = directed;
			});
		});
	}

	// Inspired by https://github.com/datavis-tech/graph-data-structure/blob/master/index.ts#L178
	// This is the popular CLRS Depth First Search, an industry gold standard.
	DepthFirstSearch(opt)
	{
		opt = _.defaultsDeep(opt, {
			Sources: null,
			IncludeSources: true,
			AllowCycle: true,
			IsDirected: this.IsDirected(),
			TopologicalSorting: false
		});

		if(null === opt.Sources)
		{
			opt.Sources = this.Vertices;
		}

		if(opt.TopologicalSorting && !opt.IsDirected)
		{
			throw new Error("Topological sorting on an undirected graph is not meaningfull");
		}

		//console.log("dfs: begin:", {
		//Sources: _.keys(opt.Sources),
		//IncludeSources: opt.IncludeSources,
		//AllowCycle: opt.AllowCycle,
		//IsDirected: opt.IsDirected,
		//TopologicalSorting: opt.TopologicalSorting
		//});

		const visited = {};
		const visiting = {};
		const list = [];

		const dfs_visit = (vertex, parent) =>
		{
			//console.log(`dfs_visit: visiting: ${vertex.ID} ${parent ? `(from ${parent.ID})` : ""} (visited: ${visited[vertex.ID]}, visiting: ${visiting[vertex.ID]})`);
			// Cycle detection, very helpful chart: https://walkccc.me/CLRS/Chap22/22.3/
			if(opt.IsDirected)
			{
				if(visiting[vertex.ID] && !opt.AllowCycle) // && opt.IsDirected)
				{
					throw new Error(`Cycle exists from ${vertex.ID} to ${parent.ID}`);
				}
			}
			else
			{
				// 15:11 <cherim_> Every time you consider an edge that leads to an already visited vertex which is not your parent in the DFS tree you find a cycle
				if(visited[vertex.ID] && !opt.AllowCycle)
				{
					throw new Error(`Cycle exists from ${vertex.ID} to ${parent.ID}`);
				}
			}

			if(!visited[vertex.ID])
			{
				visiting[vertex.ID] = true;
				visited[vertex.ID] = true;

				_.each(vertex.GetAdjacent(), (adj) =>
				{
					//console.log(`${vertex.ID} has adjacent: ${adj.ID}`);
					if(opt.IsDirected)
					{
						dfs_visit(adj, vertex);
					}
					else
					{
						if((parent && adj.ID !== parent.ID) || !parent)
						{
							dfs_visit(adj, vertex);
						}
					}
				});

				visiting[vertex.ID] = false;
				list.push(vertex);
			}
		};

		if(opt.IncludeSources)
		{
			_.each(opt.Sources, (source) =>
			{
				if(!visited[source.ID])
				{
					//console.log(`dfs_visit: starting from source: ${source.ID}`);
					dfs_visit(source);
				}
			});
		}
		else
		{
			_.each(opt.Sources, (source) =>
			{
				visited[source.ID] = true;
			});

			_.each(opt.Sources, (source) =>
			{
				_.each(source.GetAdjacent(), (adj) =>
				{
					if(!visited[source.ID])
					{
						//console.log(`dfs_visit: starting from source: ${source.ID}`);
						dfs_visit(adj);
					}
				});
			});
		}

		return list;
	}

	HasCycle(opt)
	{
		opt = _.defaultsDeep(opt, { IncludeSources: true });

		opt.AllowCycle = false;

		try
		{
			this.DepthFirstSearch(opt);
		}
		catch(err)
		{
			if(err.message && err.message.indexOf("Cycle exists") >= 0)
			{
				return true;
			}

			throw err;
		}

		return false;
	}

	TopologicalSort(opt)
	{
		opt = _.defaultsDeep(opt, { TopologicalSorting: true });

		return this.DepthFirstSearch(opt).reverse();
	}

	GetLeaves()
	{
		const leaves = [];
		const is_directed = this.IsDirected();

		_.each(this.Vertices, (vertex) =>
		{
			if(is_directed)
			{
				if(0 === vertex.Outdegree() && vertex.Indegree() >= 1)
				{
					leaves.push(vertex);
				}
			}
			else
			{
				if(1 === vertex.Indegree())
				{
					leaves.push(vertex);
				}
			}
		});

		return leaves;
	}

	GetRoots()
	{
		const roots = [];
		if(!this.IsDirected())
		{
			throw new Error("Finding roots of an undirected graph is not meaningfull");
		}

		_.each(this.Vertices, (vertex) =>
		{
			if(0 === vertex.Indegree())
			{
				roots.push(vertex);
			}
		});

		return roots;
	}

	Sort()
	{
		_.each(this.Vertices, (vertex) =>
		{
			vertex.Sort();
		});

		// Not needed in a hashtable.
		//this.Vertices = _.sortBy(this.Vertices, vertex => vertex.ID);
	}

	_prune()
	{
		const edges_to_remove = [];

		_.each(this.Vertices, (vertex) =>
		{
			_.each(vertex.Edges, (edge) =>
			{
				const opp = edge.GetOppositeVertexFrom(vertex);

				if(!this.HasVertex(opp))
				{
					edges_to_remove.push(edge);
				}
			});
		});

		_.each(this.Vertices, (vertex) =>
		{
			_.each(edges_to_remove, (edge) =>
			{
				try
				{
					vertex.RemoveEdge(edge);
				}
				catch(err)
				{
					throw err;
				}
			});
		});
	}

	FragmentFrom(vertices)
	{
		// Create a new graph with only the desired vertices.
		// NOTE: This hack here eliminates the need to override this function in extended classes.
		const g = new (Object.getPrototypeOf(this).constructor)();

		_.each(vertices, (vertex) =>
		{
			g.AddVertex(_.cloneDeep(vertex));
		});

		// Prune edges with missing vertices.
		g._prune();

		return g;
	}

	MinimumSpanningTree()
	{
		// TODO: https://en.wikipedia.org/wiki/Minimum_spanning_tree
		// Prim’s algorithm runs faster in dense graphs.
		// Kruskal’s algorithm runs faster in sparse graphs.
		// Do a smart V vs. E detection and select one of the two?
	}

	MinimumBottleneckSpanningTree()
	{
		// TODO: https://en.wikipedia.org/wiki/Minimum_bottleneck_spanning_tree
	}

	Serialize()
	{
		const graph = {
			Vertices: [],
			Edges: []
		};

		_.each(this.Vertices, (vertex) =>
		{
			graph.Vertices.push(vertex.Serialize());

			_.each(vertex.Edges, (edge) =>
			{
				graph.Edges.push(edge.Serialize());
			});
		});

		graph.Edges = _.uniqWith(graph.Edges, _.isEqual);
		graph.Vertices.sort();

		return graph;
	}

	static Deserialize(obj)
	{
		const vertices = {};
		_.each(obj.Vertices, (vertex_id) =>
		{
			vertices[vertex_id] = new Vertex({ ID: vertex_id });
		});

		const edges = [];
		_.each(obj.Edges, (edge) =>
		{
			const edge_options = _.cloneDeep(edge);
			edge_options.From = vertices[edge_options.From];
			edge_options.To = vertices[edge_options.To];
			// Directed is defaulted in.

			edges.push(new Edge(edge_options));
		});

		_.each(edges, (edge) =>
		{
			_.each(vertices, (vertex) =>
			{
				if(edge.From.ID === vertex.ID || edge.To.ID === vertex.ID)
				{
					vertex.Edges.push(edge);
				}
			});
		});

		return new Graph({ Vertices: vertices });
	}
}

module.exports = Graph;
