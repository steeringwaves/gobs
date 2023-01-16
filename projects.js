#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */

const _ = require("lodash");
const fs = require("fs");
// const path = require("path");
const util = require("util");

const Handlebars = require("handlebars");
const GraphExec = require("./graphexec.js");

// const exec = util.promisify(child_process.exec);
// const access = util.promisify(fs.access);
const readFile = util.promisify(fs.readFile);
// const access = util.promisify(fs.access);

class Projects {
	constructor(opts, cfg) {
		this._opts = opts;
		this._config = _.cloneDeep(cfg);

		// override any config vars with those specified on the cli
		Object.keys(opts.vars).forEach((argVar) => {
			this._config.vars[argVar] = opts.vars[argVar];
		});

		const compileWith = { self: opts };
		compileWith.env = _.cloneDeep(process.env);
		compileWith.app = _.cloneDeep(this._opts);
		compileWith.vars = _.cloneDeep(this._config.vars);
		if (compileWith.vars) {
			compileWith.vars.projects = undefined;
		}

		this._config.vars = this._templateObject(_.cloneDeep(this._config.vars), compileWith);
	}

	get Config() {
		return this._config;
	}

	_templateObject(incoming, compileWith) {
		const template = (obj, templateWith) => {
			if (_.isString(obj)) {
				const str = _.clone(obj);

				// yea i know it's not pretty but it makes for some pretty powerful config directives
				try {
					obj = eval(
						`function run(self, app, env, vars, project){return \`${str}\`;} run(compileWith.self, compileWith.app, compileWith.env, compileWith.vars, compileWith.project)`
					);
				} catch (error) {
					throw new Error(`failed to eval ${obj}: ${error.message}`);
				}
				return obj;
			}

			if (_.isArray(obj)) {
				for (let i = 0; i < obj.length; i++) {
					obj[i] = template(obj[i], templateWith);
				}
				return obj;
			}

			if (_.isObject(obj)) {
				Object.keys(obj).forEach((key) => {
					obj[key] = template(obj[key], templateWith);
				});
			}

			return obj;
		};

		return template(incoming, compileWith);
	}

	_includeProject(project, groups, withProjects, withoutProjects) {
		if (_.isString(withProjects)) {
			withProjects = [withProjects];
		}

		if (_.isArray(withProjects)) {
			if (withProjects.includes(project.name)) {
				return true;
			}
		}

		if (_.isString(withoutProjects)) {
			withoutProjects = [withoutProjects];
		}

		if (_.isArray(withoutProjects)) {
			if (withoutProjects.includes(project.name)) {
				return false;
			}
		}

		if (_.isString(groups)) {
			// crazy logic to allow users to specify multiple groups eg `a && (b || c)`
			// use a regex to catch parenthesis '()' and signs '&&' and or pipes '||' and ignore whitespace
			// sub out any stringlike values for true/false bools if the project/group is found
			const re = new RegExp(/([()|&\s]+)/, "g");
			let expression = "";

			groups.split(re).forEach((lookup) => {
				if (0 === lookup.length) {
					return;
				}

				if (lookup.match(re)) {
					expression += lookup;
				} else if (groups === project.name) {
					expression += `true`;
				} else if (project.groups.includes(lookup)) {
					expression += `true`;
				} else {
					expression += `false`;
				}
			});

			let ok;
			try {
				ok = eval(expression);
			} catch (error) {
				ok = false;
			}

			return ok;

			// drop this in favor of the crazy regex hack above if you don't like the use of eval
			// if(group === project.name) {
			// 	return true;
			// }
			// if (project.Group.includes(group)) {
			// 	return true;
			// }
		}

		if (_.isArray(groups)) {
			for (let i = 0; i < groups.length; i++) {
				if (groups[i] === project.name) {
					return true;
				}
				if (project.groups.includes(groups[i])) {
					return true;
				}
			}
		}

		return false;
	}

	async Load(opts) {
		const result = {
			groups: ["all"],
			names: [],
			paths: [],
			projects: [],
			templates: []
		};

		opts = _.defaultsDeep(opts, {
			groups: ["all"],
			without: []
		});

		if (_.isString(opts.without)) {
			opts.without = [opts.without];
		} else if (!_.isArray(opts.without)) {
			opts.without = [];
		}

		const projects = _.cloneDeep(this._config);

		projects.projects.forEach((project) => {
			try {
				const compileWith = { self: _.cloneDeep(project) };
				compileWith.env = _.cloneDeep(process.env);
				compileWith.app = _.cloneDeep(this._opts);
				compileWith.vars = _.cloneDeep(this._config.vars);
				if (compileWith.vars) {
					compileWith.vars.projects = undefined;
				}

				project = this._templateObject(_.cloneDeep(project), compileWith);
			} catch (err) {
				throw new Error(`failed to template configuration: ${err.message}`);
			}

			project.groups.push("all"); // add the "all" group to every project

			if (!this._includeProject(project, opts.groups, undefined, opts.without)) {
				return;
			}

			result.projects.push(project);
			result.names.push(project.name);
			result.paths.push(project.path);

			for (let i = 0; i < project.groups.length; i++) {
				if (-1 === result.groups.indexOf(project.groups[i])) {
					result.groups.push(project.groups[i]);
				}
			}
		});

		const templates = _.cloneDeep(this._config.templates);

		if (_.isArray(templates)) {
			// templates will be configured on the fly
			result.templates = templates;
		}

		if (_.isObject(this._config.digraphs)) {
			result.digraph_names = Object.keys(this._config.digraphs);
			// don't render digraph configs until we need them
			// result.digraph_names.forEach((name) => {
			// 	this._config.digraphs[name] = this.GetDiGraph(name);
			// })

			result.digraphs = _.cloneDeep(this._config.digraphs); // TODO better name
		}

		// console.log(JSON.stringify(result, null, "\t"))
		result.vars = this._config.vars;
		this._config = result;

		return result;
	}

	async ExecDiGraph(opts) {
		opts = _.defaultsDeep(opts, {
			verbose: false,
			command: "",
			disable_parallel: false
		});

		const graphOpts = _.cloneDeep(this._opts);
		graphOpts.verbose = opts.verbose;
		graphOpts.disable_parallel = opts.disable_parallel;
		graphOpts.projects = this;
		const graphExec = new GraphExec(graphOpts);

		if (opts.disable_parallel) {
			await graphExec.ExecAll(opts.command);
		} else {
			await graphExec.ParallelExecAll(opts.command);
		}
	}

	GetDiGraph(graphName) {
		if (!this._config.digraphs || !this._config.digraphs[graphName]) {
			throw new Error(`digraph ${graphName} not found`);
		}

		let compiledDigraph;

		try {
			const compileWith = { self: _.cloneDeep(this._config.digraphs[graphName]) };
			compileWith.env = _.cloneDeep(process.env);
			compileWith.app = _.cloneDeep(this._opts);
			compileWith.vars = _.cloneDeep(this._config.vars);
			if (compileWith.vars) {
				compileWith.vars.projects = undefined;
			}

			compiledDigraph = this._templateObject(_.cloneDeep(this._config.digraphs[graphName]), compileWith);
		} catch (err) {
			throw new Error(`failed to template digraph ${graphName}: ${err.message}`);
		}

		const ids = compiledDigraph.map((digraph) => {
			if (!_.isString(digraph.id) || "" === digraph.id) {
				throw new Error(`digraph ${graphName} step has missing id`);
			}

			if (!_.isString(digraph.project) || "" === digraph.project) {
				throw new Error(`digraph ${graphName} step has missing project`);
			}

			// we can't do this because if they specify a different group
			// maybe digraph commands should ignore the group option completely?
			// if (!_.find(result.projects, { name: digraph.project} )) {
			// 	throw new Error(`digraph ${name} step has project ${digraph.project} that cannot be found`);
			// }

			return digraph.id;
		});

		const duplicates = _(ids)
			.groupBy()
			.pickBy((x) => x.length > 1)
			.keys()
			.value();

		if (duplicates.length > 0) {
			throw new Error(`digraph ${graphName} has duplicate ids ${duplicates.join(" and ")}`);
		}

		return compiledDigraph;
	}

	List() {
		return _.cloneDeep(this._config.projects);
	}

	async Template(opts) {
		opts = _.defaultsDeep(opts, {
			output: undefined,
			verbose: false,
			template: "all",
			disable_parallel: false
		});

		if ("all" === opts.template) {
			opts.template = this._config.templates.map((v) => v.name);
		}

		if (_.isString(opts.template)) {
			opts.template = [opts.template];
		}

		await this.Load();

		for (let i = 0; i < opts.template.length; i++) {
			const template = _.find(this._config.templates, { name: opts.template[i] });
			if (!template) {
				throw new Error(`unable to find template ${opts.template[i]}`);
			}

			let templateForProjects = [""];

			if (_.isString(template.projects)) {
				if ("*" === template.projects) {
					templateForProjects = this._config.projects.map((v) => v.name);
				} else {
					templateForProjects = [template.projects];
				}
			} else if (_.isArray(template.projects)) {
				templateForProjects = template.projects;
			}

			for (let j = 0; j < templateForProjects.length; j++) {
				let compiledTemplate;
				let compileWith;
				try {
					compileWith = { self: _.cloneDeep(template) };
					compileWith.env = _.cloneDeep(process.env);
					compileWith.app = _.cloneDeep(this._opts);
					compileWith.vars = _.cloneDeep(this._config.vars);

					if (templateForProjects[j] !== "") {
						compileWith.project = _.find(this._config.projects, { name: templateForProjects[j] });
						if (!compileWith.project) {
							throw new Error(
								`unable to render template ${opts.template[i]}: cannot find project ${templateForProjects[j]}`
							);
						}
					}

					compiledTemplate = this._templateObject(_.cloneDeep(template), compileWith);
					compileWith.self = _.cloneDeep(compiledTemplate);
					compileWith.projects = _.cloneDeep(this._config.projects);
				} catch (err) {
					throw new Error(`failed to template configuration ${template.name}: ${err.message}`);
				}

				if (typeof compiledTemplate.file !== "string") {
					throw new Error(`no template file for ${compiledTemplate.name} specified`);
				}

				try {
					fs.accessSync(compiledTemplate.file, fs.constants.R_OK);
				} catch (error) {
					throw new Error(`template ${compiledTemplate.name} failed to access ${compiledTemplate.file}`);
				}

				const contents = (await readFile(compiledTemplate.file)).toString();

				const tmpl = Handlebars.compile(contents);
				const rendered = tmpl(compileWith);

				if (!opts.dry_run && _.isString(compiledTemplate.dest)) {
					try {
						await fs.promises.writeFile(compiledTemplate.dest, rendered);

						let perms = "0644";
						if (_.isString(compiledTemplate.chmod)) {
							perms = compiledTemplate.chmod;
						}
						fs.chmodSync(compiledTemplate.dest, perms);
					} catch (error) {
						throw new Error(`failed to create ${compiledTemplate.dest}: ${error.message}`);
					}
					continue;
				}

				process.stdout.write(`${rendered}\n`);
			}
		}
	}
}

module.exports = Projects;
