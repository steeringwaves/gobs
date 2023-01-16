/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */

const _ = require("lodash");
const fs = require("fs");
const child_process = require("child_process");

const util = require("util");
const path = require("path");
const colors = require("colors");
const inquirer = require("inquirer");
const { default: PQueue } = require("p-queue");

const os = require("os");

const Timestamp = require("./Lib/Utilities/Timestamp.js");
const GitCommands = require("./gitcommands.js");

const exec = util.promisify(child_process.exec);
const access = util.promisify(fs.access);
// const readFile = util.promisify(fs.readFile);

function fromDir(startPath, filter, callback) {
	//console.log('Starting from dir '+startPath+'/');

	if (!fs.existsSync(startPath)) {
		return;
	}

	const files = fs.readdirSync(startPath);
	for (let i = 0; i < files.length; i++) {
		const filename = path.join(startPath, files[i]);
		const stat = fs.lstatSync(filename);
		if (stat.isDirectory()) {
			fromDir(filename, filter, callback); //recurse
		} else if (filter.test(filename)) {
			callback(filename);
		}
	}
}

class Git {
	constructor(opts) {
		this._opts = _.defaultsDeep(opts, {
			full: false,
			ci: false
		});

		this._log = opts.log;

		this._projects = _.cloneDeep(this._opts.projects.Config.projects);
		this._commands = new GitCommands({ log: this._log });
	}

	get Projects() {
		return this._projects;
	}

	printGitStatus(name, changes) {
		for (let i = 0; i < changes.length; i++) {
			if ("modified" === changes[i].state) {
				process.stdout.write(colors.yellow(`${name}: modified: ${changes[i].path}\n`));
			} else if ("deleted" === changes[i].state) {
				process.stdout.write(colors.red(`${name}: deleted: ${changes[i].path}\n`));
			} else if ("untracked" === changes[i].state) {
				process.stdout.write(colors.green(`${name}: added: ${changes[i].path}\n`));
			}
		}
	}

	async _processHandler(opts, handlerName) {
		opts = _.defaultsDeep(opts, {
			project: undefined
		});

		let projects;

		if (_.isString(opts.project)) {
			if ("*" === opts.project) {
				projects = _.cloneDeep(this._projects);
			} else {
				opts.project = [opts.project];
			}
		}

		if (_.isArray(opts.project)) {
			projects = [];

			for (let i = 0; i < this._projects.length; i++) {
				for (let j = 0; j < opts.project.length; j++) {
					if (opts.project[j] === this._projects[i].name) {
						projects.push(_.cloneDeep(this._projects[i]));
					}
				}
			}
		} else {
			projects = _.cloneDeep(this._projects);
		}

		const args = {
			projects_completed: 0,
			num_projects: projects.length,
			changes: []
		};

		const handler = this[handlerName](opts, args);

		if (opts.disable_parallel) {
			for (let i = 0; i < projects.length; i++) {
				await handler(projects[i]);
				// if(exit_code !== 0)
				// {
				// 	break;
				// }
			}
		} else {
			// projects.forEach(async(project) =>
			// {
			// 	handler(project);
			// });

			try {
				const pqueue = new PQueue({ concurrency: 10 });

				for (let i = 0; i < projects.length; i++) {
					const project = projects[i];

					pqueue
						.add(() => handler(project))
						.catch((err) => {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, err.message, "red");
						});
				}

				await pqueue.onIdle();
				// this._log.Debug("queue", "magenta", `${new Timestamp().Get()}`, "completed queue", "green");
			} catch (err) {
				this._log.Error("queue", "magenta", `${new Timestamp().Get()}`, err.message, "red");
			}
		}
	}

	_statusHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			remote: "origin"
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			let status;

			if (existing.exists && !existing.bare) {
				try {
					status = await this._commands.Status(project, opts.verbose);

					if (status.changes.length > 0) {
						args.changes.push({
							project,
							branch: status.branch,
							changes: status.changes
						});
					}

					if (status.detached) {
						process.stdout.write(colors.blue(`== ${project.name} is detached at ${status.detached} ==\n`));
						if (status.changes.length > 0) {
							this.printGitStatus(project.name, status.changes);
							process.stdout.write("\n");
						}
					} else {
						process.stdout.write(colors.blue(`== ${project.name} is on branch ${status.branch} ==\n`));
						if (status.changes.length > 0) {
							this.printGitStatus(project.name, status.changes);
							process.stdout.write("\n");
						}
					}
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				done(0);
				return;
			}

			this._log.Error(
				`${project.name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				"git repo does not exist locally",
				"red"
			);
			done(1);
		};

		return handler;
	}

	_fetchHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			remote: "origin",
			all: false,
			unshallow: false,
			depth: undefined,
			tags: false
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (existing.exists) {
				try {
					await this._commands.Fetch(
						project,
						opts.remote,
						opts.all,
						opts.unshallow,
						opts.depth,
						opts.tags,
						opts.verbose
					);

					this._log.Debug(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "fetching completed", "green");
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				done(0);
				return;
			}

			this._log.Error(
				`${project.name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				"git repo does not exist locally",
				"red"
			);
			done(1);
		};

		return handler;
	}

	_describeHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			output_file: undefined,
			tags: false
		});

		let exit_code = 0;

		const outputObj = {
			host: {
				name: os.hostname(),
				user: os.userInfo().username,
				os: os.version()
			},
			date: new Date()
		};

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				if (_.isString(opts.output_file) && "" !== opts.output_file) {
					if (_.isString(this._opts.work_dir)) {
						// Change directory to our starting directory
						try {
							process.chdir(this._opts.work_dir);
						} catch (err) {
							console.error(`chdir: ${err}`);
							process.exit(1);
						}
					}

					try {
						fs.writeFileSync(opts.output_file, JSON.stringify(outputObj, null, "\t"));
					} catch (error) {
						if (error) {
							this._log.Error(`describe`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						process.exit(1);
					}
				} else {
					console.log(JSON.stringify(outputObj, null, "\t"));
				}

				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (existing.exists) {
				const describe = {
					name: project.name
				};

				try {
					const status = await this._commands.Status(project, opts.verbose);
					describe.branch = status.branch;
					describe.changes = _.map(status.changes, (c) => ({
						State: c.state,
						Path: c.path
					}));
					describe.detached = status.detached;
				} catch (error) {
					describe.branch = undefined;
				}

				try {
					describe.hash = await this._commands.CurrentHash(project, opts.verbose);
				} catch (error) {
					describe.hash = undefined;
				}

				if (opts.tags) {
					try {
						describe.tags = await this._commands.Tags(project, describe.hash, opts.verbose);
					} catch (error) {
						describe.tags = undefined;
					}
				}

				if (!outputObj.projects) {
					outputObj.projects = [];
				}

				outputObj.projects.push(describe);

				let msg = `on branch ${describe.branch} with hash ${describe.hash}`;

				if (describe.changes && describe.changes.length > 0) {
					msg += ` with changes to ${describe.changes.length} files`;
				}

				if (opts.tags) {
					if (describe.tags && describe.tags.length > 0) {
						msg += ` with tags`;
						describe.tags.forEach((tag) => {
							msg += ` ${tag}`;
						});
					}
				}

				this._log.Info(`${project.name}`, "magenta", `${new Timestamp().Get()}`, msg, "yellow");

				done(0);
				return;
			}

			this._log.Error(
				`${project.name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				"git repo does not exist locally",
				"red"
			);
			done(1);
		};

		return handler;
	}

	_commitHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			remote: "origin",
			no_verify: false
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				const choices = [];

				args.changes.forEach((projectChange) => {
					choices.push(
						new inquirer.Separator(`${projectChange.project.name} is on branch ${projectChange.branch}`)
					);

					projectChange.changes.forEach((change) => {
						if ("modified" === change.state) {
							choices.push({
								name: colors.yellow(`modified: ${change.path}`),
								value: {
									project: projectChange.project,
									file: change.path
								}
							});
						} else if ("deleted" === change.state) {
							choices.push({
								name: colors.red(`deleted: ${change.path}`),
								value: {
									project: projectChange.project,
									file: change.path
								}
							});
						} else if ("untracked" === change.state) {
							choices.push({
								name: colors.green(`added: ${change.path}`),
								value: {
									project: projectChange.project,
									file: change.path
								}
							});
						}
					});
				});

				inquirer
					.prompt({
						type: "checkbox",
						name: "add",
						message: "What changes do you want to commit?",
						pageSize: 24,
						loop: false,
						choices
					})
					.then((answers) => {
						if (answers.add.length > 0) {
							inquirer
								.prompt({
									type: "input",
									name: "message",
									message: "Enter your commit message:"
								})
								.then(async (message) => {
									if (message.message.length > 0) {
										const projectsNamesWithChanges = [];
										const projectsWithChanges = [];

										answers.add.forEach((add) => {
											if (-1 === projectsNamesWithChanges.indexOf(add.project.name)) {
												projectsNamesWithChanges.push(add.project.name);
												projectsWithChanges.push(add.project);
											}
										});

										for (let i = 0; i < answers.add.length; i++) {
											const add = answers.add[i];
											const project = add.project;

											try {
												/* eslint-disable-next-line no-await-in-loop */
												await this._commands.Add(project, add.file, opts.verbose);
											} catch (error) {
												if (error) {
													this._log.Error(
														`${project.name}`,
														"magenta",
														`${new Timestamp().Get()}`,
														error.message,
														"red"
													);
												}
											}
										}

										const commit_opts = {
											message
										};

										for (let i = 0; i < projectsWithChanges.length; i++) {
											const project = projectsWithChanges[i];

											try {
												/* eslint-disable-next-line no-await-in-loop */
												await this._commands.Commit(project, commit_opts, opts.verbose);
											} catch (error) {
												if (error) {
													this._log.Error(
														`${project.name}`,
														"magenta",
														`${new Timestamp().Get()}`,
														error.message,
														"red"
													);
												}
											}
										}

										for (let i = 0; i < projectsWithChanges.length; i++) {
											const project = projectsWithChanges[i];

											try {
												/* eslint-disable-next-line no-await-in-loop */
												await this._commands.Push(project, { remote: opts.remote }, opts.verbose);
											} catch (error) {
												if (error) {
													this._log.Error(
														`${project.name}`,
														"magenta",
														`${new Timestamp().Get()}`,
														error.message,
														"red"
													);
												}
											}
										}
									}
								});
						}
					});
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (!existing.exists) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"git repo does not exist locally",
					"red"
				);
				done(1);
				return;
			}

			if (existing.bare) {
				this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "git repo is bare", "red");
				done(1);
				return;
			}

			let status;

			try {
				status = await this._commands.Status(project, opts.verbose);

				if (status.changes.length > 0) {
					args.changes.push({
						project,
						branch: status.branch,
						changes: status.changes
					});
				}

				if (status.detached) {
					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`is detached at ${status.detached}`,
						"yellow"
					);
				} else {
					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`is on branch ${status.branch}`,
						"yellow"
					);
				}

				done(0);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
				done(1);
			}
		};

		return handler;
	}

	_tagHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			name: undefined,
			delete: undefined,
			annotate: undefined,
			force: undefined,
			message: undefined,
			sign: undefined,
			local_user: undefined,
			list: undefined
		});

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (!existing.exists) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"git repo does not exist locally",
					"red"
				);
				done(1);
				return;
			}

			try {
				await this._commands.Tag(project, opts, opts.verbose);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
				done(1);
				return;
			}

			done(0);
		};

		return handler;
	}

	_pushHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			all: undefined,
			dry_run: undefined,
			tags: undefined,
			force: undefined,
			repo: undefined,
			set_upstream: undefined,
			remote: "origin"
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (!existing.exists) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"git repo does not exist locally",
					"red"
				);
				done(1);
				return;
			}

			try {
				await this._commands.Push(project, opts, opts.verbose);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
			}

			done(0);
		};

		return handler;
	}

	_migrateHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			remote: "origin"
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			try {
				await this._commands.Migrate(project, opts);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
			}

			done(0);
		};

		return handler;
	}

	_cloneHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			remote: "origin",
			bare: false,
			mirror: false,
			depth: null,
			branch: null,
			manifest: null
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		let projects_completed = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			projects_completed++;

			if (projects_completed === this._projects.length) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (existing.exists) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"git repo already exists locally, cannot clone",
					"red"
				);
				done(1);
				return;
			}

			const clone_opts = {
				remote: opts.remote
			};

			if (opts.mirror) {
				clone_opts.mirror = true;
			} else {
				clone_opts.bare = opts.bare;
				clone_opts.branch = opts.branch;
				clone_opts.depth = opts.depth;

				if (opts.manifest && opts.manifest.projects) {
					opts.manifest.projects.forEach((p) => {
						if (p.name !== project.name) {
							return;
						}

						// we are using a manifest
						clone_opts.hash = p.hash;
						clone_opts.branch = null;
						clone_opts.tag = null;
					});
				}
			}

			try {
				await this._commands.Clone(project, clone_opts, opts.verbose);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
				done(1);
				return;
			}

			done(0);
		};

		return handler;
	}

	_pullHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			remote: "origin",
			full_clone: false,
			depth: null
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		let projects_completed = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			projects_completed++;

			if (projects_completed === this._projects.length) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (!existing.exists) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"git repo already does not exist locally, cannot pull",
					"red"
				);
				done(1);
				return;
			}

			if (existing.bare) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"existing git repo is bare, cannot pull",
					"red"
				);
				done(1);
				return;
			}

			let depth = "";
			let bare = false;
			let fullClone = false;

			if (existing.bare) {
				bare = true;
			} else {
				if (opts.depth !== null) {
					depth = opts.depth;
				}
			}

			if (!bare) {
				if (opts.full_clone) {
					fullClone = true;
				}
			}

			try {
				const status = await this._commands.Status(project, opts.verbose, opts.verbose);

				if (status.detached) {
					this._log.Error(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`is detached at ${status.detached}`,
						"red"
					);
					done(1);
					return;
				}

				this._log.Info(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`is on branch ${status.branch}`,
					"yellow"
				);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
				done(1);
				return;
			}

			try {
				await this._commands.Pull(project, opts.remote, fullClone, bare, depth, opts.verbose);
			} catch (error) {
				done(1);
				return;
			}

			done(0);
		};

		return handler;
	}

	_syncHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			tag: null,
			latest_tag_regex: null,
			remote: "origin",
			bare: false,
			mirror: false,
			depth: null,
			branch: null,
			push: null,
			full_clone: false,
			force_reset: false,
			without_lfs: false,
			manifest: null
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		let projects_completed = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			projects_completed++;

			if (projects_completed === this._projects.length) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			let existing = await this._commands.ExistingType(project);

			if (opts.mirror) {
				if (existing.exists) {
					this._log.Error(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						"git repo already exists locally, cannot mirror",
						"red"
					);
					done(1);
					return;
				}

				try {
					await this._commands.Clone(
						project,
						{
							remote: opts.remote,
							mirror: true
						},
						opts.verbose
					);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				done(0);
				return;
			}

			let hash = "";
			let branch = "";
			let depth = "";
			let bare = false;
			let fullClone = false;
			let forceReset = false;

			if (existing.exists && existing.bare && false === opts.bare && 1 !== opts.depth) {
				try {
					// unshallow
					await this._commands.Fetch(project, opts.remote, fullClone, true, "", false, opts.verbose);
					bare = false;
					depth = "";
				} catch (error) {
					done(1);
					return;
				}

				existing = await this._commands.ExistingType(project);
			}

			if ((existing.exists && existing.bare) || true === opts.bare) {
				bare = true;
			} else {
				if (opts.depth !== null) {
					depth = opts.depth;
				}
			}

			if (opts.branch !== null) {
				branch = opts.branch;
			}

			if (!bare && "" === branch) {
				if (opts.full_clone) {
					fullClone = true;
				}
			}

			if (!bare && !fullClone) {
				// Only allow a reset if we are doing a normal pull
				forceReset = opts.force_reset;
			}

			let status;

			if (existing.exists && !existing.bare) {
				try {
					status = await this._commands.Status(project, opts.verbose, opts.verbose);

					if (status.changes.length > 0) {
						args.changes.push({
							project,
							branch: status.branch,
							changes: status.changes
						});
					}

					if (status.detached) {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`is detached at ${status.detached}`,
							"yellow"
						);
					} else {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`is on branch ${status.branch}`,
							"yellow"
						);
					}
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}
			}

			if (opts.manifest && opts.manifest.projects) {
				opts.manifest.projects.forEach((p) => {
					if (p.name !== project.name) {
						return;
					}

					// we are using a manifest
					hash = p.hash;
					branch = "";
					opts.branch = null;
					opts.tag = null;
				});
			}

			if (!existing.exists) {
				try {
					const clone_opts = {
						remote: opts.remote,
						bare
					};

					if (hash !== "") {
						clone_opts.hash = hash;
					}

					if (branch !== "") {
						clone_opts.branch = branch;
					}

					if (depth !== "") {
						clone_opts.depth = depth;
					}

					await this._commands.Clone(project, clone_opts, opts.verbose);
				} catch (error) {
					done(1);
					return;
				}

				if (!existing.bare) {
					if (!opts.without_lfs && opts.full_clone && !this._opts.ci) {
						try {
							await this._commands.LFSFetch(project, { all: true }, opts.verbose);
						} catch (error) {
							if (error) {
								if (error.LFS) {
									// oh well
								} else {
									this._log.Error(
										`${project.name}`,
										"magenta",
										`${new Timestamp().Get()}`,
										error.message,
										"red"
									);
								}
							}
						}

						try {
							await this._commands.LFSPull(project, {}, opts.verbose);
						} catch (error) {
							done(1);
							return;
						}
					}
				}
			}

			// Attempt to update the remote URL.
			await this._commands.UpdateRemoteURL(project, opts.verbose);

			if (true === forceReset) {
				try {
					await this._commands.ResetHard(project, opts.verbose);
				} catch (error) {
					done(1);
					return;
				}
			}

			try {
				let fetch_depth;
				if (!bare) {
					fetch_depth = depth;
				}
				await this._commands.Fetch(project, opts.remote, fullClone, false, fetch_depth, false, opts.verbose);
			} catch (error) {
				done(1);
				return;
			}

			let current_branch = "";

			if (false === bare) {
				/* Check current branch, and switch to the desired one if specified */
				try {
					current_branch = await this._commands.CurrentBranch(project, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				if (fullClone) {
					let remotes;
					try {
						remotes = await this._commands.RemoteBranches(project, opts.remote, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					remotes.forEach(async (remote) => {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`tracking remote branch ${remote.branch}`,
							"green"
						);

						let local_exists = false;

						try {
							local_exists = await this._commands.LocalBranchExists(project, remote.branch, opts.verbose);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}

						if (!local_exists) {
							try {
								await this.this._commands.TrackRemoteBranch(
									project,
									remote.remote,
									remote.branch,
									opts.verbose
								);
							} catch (error) {
								if (error) {
									this._log.Error(
										`${project.name}`,
										"magenta",
										`${new Timestamp().Get()}`,
										error.message,
										"red"
									);
								}
								done(1);
							}
						}
					});
				} else if (hash !== "") {
					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`on branch ${current_branch}, checking out commit hash ${hash}`,
						"yellow"
					);

					try {
						await this._commands.CheckoutLocalBranch(project, hash, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}
				} else if (branch !== "") {
					if (current_branch !== branch) {
						// We need to change branches
						let local_exists = false;
						let remote_exists = false;
						let is_shallow = false;

						// Check if our current git repo is a shallow clone
						try {
							is_shallow = await this._commands.RepoIsShallow(project, opts.verbose);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}

						if (is_shallow) {
							// Our current repo is a shallow clone - we need to change that
							this._log.Info(
								`${project.name}`,
								"magenta",
								`${new Timestamp().Get()}`,
								"repo is shallow clone, getting all remote branches",
								"yellow"
							);

							try {
								await this._commands.RemoteSetBranchesToAll(project, opts.remote, opts.verbose);
							} catch (error) {
								if (error) {
									this._log.Error(
										`${project.name}`,
										"magenta",
										`${new Timestamp().Get()}`,
										error.message,
										"red"
									);
								}
								done(1);
								return;
							}
						}

						try {
							local_exists = await this._commands.LocalBranchExists(project, branch, opts.verbose);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}

						try {
							remote_exists = await this._commands.RemoteBranchExists(
								project,
								opts.remote,
								branch,
								opts.verbose
							);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}

						if (local_exists) {
							this._log.Info(
								`${project.name}`,
								"magenta",
								`${new Timestamp().Get()}`,
								`on branch ${current_branch}, switching to local branch ${branch}`,
								"yellow"
							);

							try {
								await this._commands.CheckoutLocalBranch(project, branch, opts.verbose);
							} catch (error) {
								if (error) {
									this._log.Error(
										`${project.name}`,
										"magenta",
										`${new Timestamp().Get()}`,
										error.message,
										"red"
									);
								}
								done(1);
								return;
							}
						} else if (remote_exists) {
							this._log.Info(
								`${project.name}`,
								"magenta",
								`${new Timestamp().Get()}`,
								`on branch ${current_branch}, switching to remote branch ${branch}`,
								"yellow"
							);

							try {
								await this._commands.CheckoutRemoteBranch(project, opts.remote, branch, opts.verbose);
							} catch (error) {
								if (error) {
									this._log.Error(
										`${project.name}`,
										"magenta",
										`${new Timestamp().Get()}`,
										error.message,
										"red"
									);
								}
								done(1);
								return;
							}
						} else {
							this._log.Info(
								`${project.name}`,
								"magenta",
								`${new Timestamp().Get()}`,
								`no local or remote branch exists for ${branch}`,
								"yellow"
							);
						}
					} else {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`is on branch ${current_branch}`,
							"yellow"
						);
					}
				} else if (opts.tag) {
					try {
						await this._commands.Fetch(project, opts.remote, false, false, "", true, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
					}

					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`checking out tag ${opts.tag}`,
						"yellow"
					);

					try {
						await this._commands.CheckoutLocalBranch(project, opts.tag, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					// set out state to be detached
					if (!status) {
						status = {};
					}

					status.detached = opts.tag;
				} else if (opts.latest_tag_regex) {
					try {
						await this._commands.Fetch(project, opts.remote, false, false, "", true, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
					}

					let tag;
					try {
						tag = await this._commands.FindLatestTag(project, opts.latest_tag_regex, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`checking out latest matching tag ${tag}`,
						"yellow"
					);

					try {
						await this._commands.CheckoutLocalBranch(project, tag, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					// set out state to be detached
					if (!status) {
						status = {};
					}

					status.detached = tag;
				}
			}

			// TODO fetch again?
			try {
				let fetch_depth;
				if (!bare) {
					fetch_depth = depth;
				}
				await this._commands.Fetch(project, opts.remote, fullClone, false, fetch_depth, false, opts.verbose);
			} catch (error) {
				done(1);
				return;
			}

			if (!existing.bare && !(status && status.detached)) {
				// Can't pull bare repos or detached state repos
				try {
					await this._commands.Pull(project, opts.remote, fullClone, bare, depth, opts.verbose);
				} catch (error) {
					done(1);
					return;
				}

				if (!opts.without_lfs && opts.full_clone && !this._opts.ci) {
					try {
						await this._commands.LFSFetch(project, { all: true }, opts.verbose);
					} catch (error) {
						if (error) {
							if (error.LFS) {
								// oh well
							} else {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
						}
					}

					try {
						await this._commands.LFSPull(project, {}, opts.verbose);
					} catch (error) {
						done(1);
						return;
					}
				}
			}

			done(0);
		};

		return handler;
	}

	_checkoutHandler(opts) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			tag: null,
			latest_tag_regex: null,
			remote: "origin",
			bare: false,
			mirror: false,
			depth: null,
			branch: null,
			push: null,
			full_clone: false,
			force_reset: false,
			without_lfs: false,
			manifest: null
		});

		if (!_.isString(opts.remote)) {
			opts.remote = "origin";
		} else if ("" === opts.remote) {
			opts.remote = "origin";
		}

		let exit_code = 0;

		let projects_completed = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			projects_completed++;

			if (projects_completed === this._projects.length) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			if (!project.git) {
				// not a git repo
				done(0);
				return;
			}

			const existing = await this._commands.ExistingType(project);

			if (!existing.exists) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					"git repo does not exist locally",
					"red"
				);
				done(1);
				return;
			}

			if (existing.bare) {
				this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "git repo is bare", "red");
				done(1);
				return;
			}

			// Attempt to update the remote URL.
			await this._commands.UpdateRemoteURL(project, opts.verbose);

			let status;

			try {
				await this._commands.Fetch(project, opts.remote, true, false, opts.depth, false, opts.verbose);

				status = await this._commands.Status(project, opts.verbose, opts.verbose);

				if (status.detached) {
					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`is detached at ${status.detached}`,
						"yellow"
					);
				} else {
					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`is on branch ${status.branch}`,
						"yellow"
					);
				}
			} catch (error) {
				done(1);
				return;
			}

			let forceReset = false;

			if (
				!_.isString(opts.branch) &&
				!_.isString(opts.hash) &&
				!_.isString(opts.tag) &&
				!_.isString(opts.latest_tag_regex)
			) {
				done(0);
				return;
			}

			// Only allow a reset if we are doing a normal pull
			forceReset = opts.force_reset;

			if (true === forceReset) {
				try {
					await this._commands.ResetHard(project, opts.verbose);
				} catch (error) {
					done(1);
					return;
				}
			}

			let current_branch = "";

			/* Check current branch, and switch to the desired one if specified */
			try {
				current_branch = await this._commands.CurrentBranch(project, opts.verbose);
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
				done(1);
				return;
			}

			if (opts.hash !== "") {
				this._log.Info(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`on branch ${current_branch}, checking out commit hash ${opts.hash}`,
					"yellow"
				);

				try {
					await this._commands.CheckoutLocalBranch(project, opts.hash, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}
			} else if (opts.branch !== "") {
				if (current_branch !== opts.branch) {
					// We need to change branches
					let local_exists = false;
					let remote_exists = false;
					let is_shallow = false;

					// Check if our current git repo is a shallow clone
					try {
						is_shallow = await this._commands.RepoIsShallow(project, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					if (is_shallow) {
						// Our current repo is a shallow clone - we need to change that
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							"repo is shallow clone, getting all remote branches",
							"yellow"
						);

						try {
							await this._commands.RemoteSetBranchesToAll(project, opts.remote, opts.verbose);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}
					}

					try {
						local_exists = await this._commands.LocalBranchExists(project, opts.branch, opts.verbose);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					try {
						remote_exists = await this._commands.RemoteBranchExists(
							project,
							opts.remote,
							opts.branch,
							opts.verbose
						);
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}

					if (local_exists) {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`on branch ${current_branch}, switching to local branch ${opts.branch}`,
							"yellow"
						);

						try {
							await this._commands.CheckoutLocalBranch(project, opts.branch, opts.verbose);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}
					} else if (remote_exists) {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`on branch ${current_branch}, switching to remote branch ${opts.branch}`,
							"yellow"
						);

						try {
							await this._commands.CheckoutRemoteBranch(project, opts.remote, opts.branch, opts.verbose);
						} catch (error) {
							if (error) {
								this._log.Error(
									`${project.name}`,
									"magenta",
									`${new Timestamp().Get()}`,
									error.message,
									"red"
								);
							}
							done(1);
							return;
						}
					} else {
						this._log.Info(
							`${project.name}`,
							"magenta",
							`${new Timestamp().Get()}`,
							`no local or remote branch exists for ${opts.branch}`,
							"yellow"
						);
					}
				} else {
					this._log.Info(
						`${project.name}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`is on branch ${current_branch}`,
						"yellow"
					);
				}
			} else if (opts.tag) {
				this._log.Info(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`checking out tag ${opts.tag}`,
					"yellow"
				);

				try {
					await this._commands.CheckoutLocalBranch(project, opts.tag, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				// set out state to be detached
				if (!status) {
					status = {};
				}

				status.detached = opts.tag;
			} else if (opts.latest_tag_regex) {
				try {
					await this._commands.Fetch(project, opts.remote, false, false, "", true, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
				}

				let tag;
				try {
					tag = await this._commands.FindLatestTag(project, opts.latest_tag_regex, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				this._log.Info(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`checking out latest matching tag ${tag}`,
					"yellow"
				);

				try {
					await this._commands.CheckoutLocalBranch(project, tag, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				// set out state to be detached
				if (!status) {
					status = {};
				}

				status.detached = tag;
			}

			// TODO fetch again?
			try {
				await this._commands.Fetch(project, opts.remote, true, false, opts.depth, false, opts.verbose);
			} catch (error) {
				done(1);
				return;
			}

			done(0);
		};

		return handler;
	}

	_forEachHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			verbose: this._opts.verbose,
			command: "pwd"
		});

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				process.exit(exit_code);
			}
		};

		const handler = async (project) => {
			let exists = false;
			if (!project.git) {
				// not a git repo
				try {
					await access(project.path, fs.constants.R_OK);
					exists = true;
				} catch (error) {
					exists = false;
				}
			} else {
				const existing = await this._commands.ExistingType(project);
				exists = existing.exists;
			}

			if (exists) {
				try {
					await this._commands.ExecCommand(project, opts.command, opts.verbose);

					// this._log.Debug(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "exec completed", "green");
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
					done(1);
					return;
				}

				done(0);
				return;
			}

			this._log.Error(
				`${project.name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				`${project.path} does not exist`,
				"red"
			);
			done(1);
		};

		return handler;
	}

	_runHandler(opts, args) {
		opts = _.defaultsDeep(opts, {
			no_exit: false,
			verbose: this._opts.verbose,
			command: undefined,
			exec: undefined
		});

		let exit_code = 0;

		const done = (code) => {
			if (code !== 0) {
				exit_code = 1;
			}

			args.projects_completed++;

			if (args.projects_completed === args.num_projects) {
				if (true === opts.no_exit) {
					return;
				}
				process.exit(exit_code);
			}
		};

		if (_.isString(opts.command)) {
			opts.command = [opts.command];
		} else if (!_.isArray(opts.command)) {
			opts.command = [];
		}

		if (_.isString(opts.exec)) {
			opts.exec = [opts.exec];
		} else if (!_.isArray(opts.exec)) {
			opts.exec = [];
		}

		const handler = async (project) => {
			const commands = [];

			if (project) {
				for (let i = 0; i < opts.command.length; i++) {
					if (_.isObject(project.commands)) {
						if (project.commands[opts.command[i]]) {
							if (_.isString(project.commands[opts.command[i]])) {
								commands.push(project.commands[opts.command[i]]);
							}

							if (_.isArray(project.commands[opts.command[i]])) {
								commands.push(...project.commands[opts.command[i]]);
							}
						}
					}
				}
			}

			for (let i = 0; i < opts.exec.length; i++) {
				if (_.isString(opts.exec[i])) {
					commands.push(opts.exec[i]);
				}
			}

			if (0 === commands.length) {
				done(0);
				return;
			}

			let exists = false;
			if (!project) {
				// just create a dummy one
				exists = true;
				project = {
					name: "",
					path: "./"
				};
			} else if (!project.git) {
				// not a git repo
				try {
					await access(project.path, fs.constants.R_OK);
					exists = true;
				} catch (error) {
					exists = false;
				}
			} else {
				const existing = await this._commands.ExistingType(project);
				exists = existing.exists;
			}

			if (exists) {
				for (let i = 0; i < commands.length; i++) {
					try {
						await this._commands.ExecCommand(project, commands[i], opts.verbose);

						// this._log.Debug(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "exec completed", "green");
					} catch (error) {
						if (error) {
							this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
						}
						done(1);
						return;
					}
					// TODO support array of exec commands per command
				}

				done(0);
				return;
			}

			this._log.Error(
				`${project.name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				`${project.path} does not exist`,
				"red"
			);
			done(1);
		};

		return handler;
	}

	async Status(opts) {
		return this._processHandler(opts, "_statusHandler");
	}

	async Fetch(opts) {
		return this._processHandler(opts, "_fetchHandler");
	}

	async Describe(opts) {
		return this._processHandler(opts, "_describeHandler");
	}

	async Commit(opts) {
		return this._processHandler(opts, "_commitHandler");
	}

	async Tag(opts) {
		return this._processHandler(opts, "_tagHandler");
	}

	async Push(opts) {
		return this._processHandler(opts, "_pushHandler");
	}

	async Migrate(opts) {
		return this._processHandler(opts, "_migrateHandler");
	}

	async Pull(opts) {
		return this._processHandler(opts, "_pullHandler");
	}

	async Clone(opts) {
		return this._processHandler(opts, "_cloneHandler");
	}

	async Sync(opts) {
		return this._processHandler(opts, "_syncHandler");
	}

	async ForEach(opts) {
		return this._processHandler(opts, "_forEachHandler");
	}

	async Run(opts) {
		return this._processHandler(opts, "_runHandler");
	}
}

module.exports = Git;
