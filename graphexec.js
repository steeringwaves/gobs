/* eslint-disable no-await-in-loop */
/* eslint-disable no-loop-func */

const _ = require("lodash");
const Git = require("./git.js");
const Graph = require("./Lib/Graphing/Graph.js");
const Vertex = require("./Lib/Graphing/Vertex.js");

const Timestamp = require("./Lib/Utilities/Timestamp.js");

// TODO unique color per project
class GraphExec {
	constructor(opts) {
		this._opts = _.defaultsDeep(opts, {});
		this._log = opts.log;

		this._git = new Git(this._opts);
	}

	async _directedExec(projects, projects_topo) {
		// setTimeout(() =>
		// {
		// 	console.log("done!");
		// }, 10000);

		const errors = [];

		_.each(projects_topo, (current_service_vertex) => {
			const current_project = _.find(projects.Projects, { id: current_service_vertex.ID });
			const upstream_vertices = current_service_vertex.GetPrecedent();

			const started = [];
			// console.log("Current:", current_project.id, "has upstreams:", _.map(upstream_vertices, _.property("ID")));

			const check_dependencies = (startedDeps, dependencies) => {
				const started_ids = _.map(startedDeps, _.property("ID"));
				const dependencies_ids = _.map(dependencies, _.property("ID"));

				if (_.isEqual(started_ids.sort(), dependencies_ids.sort())) {
					if (0 !== errors.length) {
						current_service_vertex.emit("done");
						return;
					}

					this._git
						.Run({
							project: current_project.project,
							no_exit: true,
							command: current_project.command,
							exec: current_project.exec
						})
						.then(() => {
							current_service_vertex.emit("done");
						})
						.catch((err) => {
							// TODO throw
							errors.push(err);
							current_service_vertex.emit("done");
						});
				}
			};

			// NOTE: Here be dragons. Needed or else some will be ignored.
			current_service_vertex.setMaxListeners(0);

			_.each(upstream_vertices, (upstream_vertex) => {
				// console.log(upstream_vertex.ID, "calling once");
				upstream_vertex.once("done", () => {
					started.push(upstream_vertex);
					check_dependencies(started, upstream_vertices);
				});
			});

			// In case we have no dependencies.
			check_dependencies(started, upstream_vertices);
		});

		const leaves = projects.Graph.GetLeaves();

		const p = () =>
			new Promise((resolve, reject) => {
				let aborted = false;
				const leaf_nodes = [];
				const started_leaf_nodes = [];

				_.each(leaves, (leaf) => {
					// console.log("each", leaf);
					leaf.once("done", () => {
						if (errors.length !== 0) {
							aborted = true;
							reject(errors[0]);
							return;
						}

						started_leaf_nodes.push(leaf);

						//this._log.Logger.Debug("Leaf started: ", leaf.ID, `(${started_leaf_nodes.length} of ${leaf_nodes.length})`);
						// console.log("Remaining leaves: ", _.map(_.difference(leaf_nodes, started_leaf_nodes), remain => remain.ID));

						if (!aborted && 0 === _.difference(leaf_nodes, started_leaf_nodes).length) {
							resolve();
						}
					});

					leaf_nodes.push(leaf);
				});
			});

		await p();
	}

	async ExecAll(name) {
		return new Promise(async (resolve, reject) => {
			const start = new Date();

			let projects;
			const graph = this._opts.projects.GetDiGraph(name);

			if (!_.isArray(graph)) {
				reject(new Error(`could not find graph ${name}`));
			}

			try {
				projects = this.CompileSteps(graph);
			} catch (error) {
				if (error) {
					if (error.message) {
						this._log.Error(null, null, null, error.message, "red");
					}
				}
				reject(error);
				return;
			}

			for (let i = 0; i < projects.length; i++) {
				const current_project = _.find(graph, { id: projects[i] });

				try {
					await this._git.Run({
						project: current_project.project,
						no_exit: true,
						command: current_project.command,
						exec: current_project.exec
					});
				} catch (error) {
					reject(error);
					return;
				}
			}

			const end = new Date();
			const elapsed = (end - start) / 1000;
			this._log.Info(
				null,
				null,
				`${new Timestamp().Get()}`,
				`Completed batch ${name} in ${elapsed.toFixed(3)} seconds`,
				"green"
			);

			resolve();
		});
	}

	async ParallelExecAll(name) {
		return new Promise(async (resolve, reject) => {
			const start = new Date();

			let projects;
			const graph = this._opts.projects.GetDiGraph(name);

			try {
				projects = this.CompileGraph(graph);
			} catch (error) {
				if (error) {
					if (error.message) {
						this._log.Error(null, null, null, error.message, "red");
					}
				}
				reject();
				return;
			}

			let projects_topo;

			if (projects.Graph) {
				try {
					projects_topo = projects.Graph.TopologicalSort();
				} catch (error) {
					projects_topo = undefined;

					if (error) {
						if (error.message) {
							this._log.Debug(
								"TopologicalSort()",
								"magenta",
								`${new Timestamp().Get()}`,
								`${error.message}. Proceeding with sequential execution`,
								"red"
							);
						}
					}
				}
			}

			if (!projects_topo) {
				await this.ExecAll(name);
				return;
			}

			try {
				await this._directedExec(projects, projects_topo);
			} catch (error) {
				if (error) {
					if (error.message) {
						this._log.Error(null, null, null, error.message, "red");
					}
				}
				reject(error);
				return;
			}

			const end = new Date();
			const elapsed = (end - start) / 1000;
			this._log.Info(
				null,
				null,
				`${new Timestamp().Get()}`,
				`Completed batch ${name} in ${elapsed.toFixed(3)} seconds`,
				"green"
			);

			resolve();
		});
	}

	CompileSteps(list) {
		if (list.length < 1) {
			return [];
		}

		const g = new Graph();
		const vertices = {};

		list.forEach((item) => {
			if (_.isString(item.id)) {
				vertices[item.id] = new Vertex({ ID: item.id });
			}
		});

		list.forEach((item) => {
			if (_.isObject(vertices[item.id])) {
				if (_.isString(item.upstream)) {
					item.upstream = [item.upstream];
				}

				if (_.isArray(item.upstream)) {
					for (let i = 0; i < item.upstream.length; i++) {
						if (_.isObject(vertices[item.upstream[i]])) {
							vertices[item.upstream[i]].AddEdgeTo(vertices[item.id]);
						}
					}
				}

				if (_.isString(item.downstream)) {
					item.downstream = [item.downstream];
				}

				if (_.isArray(item.downstream)) {
					for (let i = 0; i < item.downstream.length; i++) {
						if (_.isObject(vertices[item.downstream[i]])) {
							vertices[item.id].AddEdgeTo(vertices[item.downstream[i]]);
						}
					}
				}
			}
		});

		if (list.length <= 1) {
			return [list[0].id];
		}

		list.forEach((proj) => {
			g.AddVertex(vertices[proj.id]);
		});

		g.SetAllDirected(true);

		// See https://en.wikipedia.org/wiki/Topological_sorting#Examples

		const sorted = g.TopologicalSort();

		const sorted_ids = _.map(sorted, _.property("ID"));

		// sorted.forEach((item) =>
		// {
		// 	console.log(vertice.ID, g.GetLeaves());
		// });

		// console.log(g.GetRoots());
		// console.log(g.GetLeaves());

		// console.log(sorted_ids);
		return sorted_ids;
	}

	CompileGraph(list) {
		const g = new Graph();
		const vertices = {};

		list.forEach((item) => {
			if (_.isString(item.id)) {
				vertices[item.id] = new Vertex({ ID: item.id });
			}
		});

		list.forEach((item) => {
			if (_.isObject(vertices[item.id])) {
				if (_.isString(item.upstream)) {
					item.upstream = [item.upstream];
				}

				if (_.isArray(item.upstream)) {
					for (let i = 0; i < item.upstream.length; i++) {
						if (_.isObject(vertices[item.upstream[i]])) {
							vertices[item.upstream[i]].AddEdgeTo(vertices[item.id]);
						}
					}
				}

				if (_.isString(item.downstream)) {
					item.downstream = [item.downstream];
				}

				if (_.isArray(item.downstream)) {
					for (let i = 0; i < item.downstream.length; i++) {
						if (_.isObject(vertices[item.downstream[i]])) {
							vertices[item.id].AddEdgeTo(vertices[item.downstream[i]]);
						}
					}
				}
			}
		});

		if (list.length <= 1) {
			return {
				Graph: null,
				Projects: [list[0]]
			};
		}

		list.forEach((item) => {
			g.AddVertex(vertices[item.id]);
		});

		g.SetAllDirected(true);

		// See https://en.wikipedia.org/wiki/Topological_sorting#Examples

		return {
			Graph: g,
			Projects: list
		};
	}
}

module.exports = GraphExec;
