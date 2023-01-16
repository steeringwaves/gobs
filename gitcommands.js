/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */

const _ = require("lodash");
const fs = require("fs");
const child_process = require("child_process");

const util = require("util");
const path = require("path");

const Timestamp = require("./Lib/Utilities/Timestamp.js");

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

class GitCommands {
	constructor(opts) {
		this._opts = _.defaultsDeep(opts, {
			log: undefined
		});

		// throw if undefined

		this._log = opts.log;
	}

	FindLFSObjects(project) {
		return new Promise((resolve, reject) => {
			const files = [];
			fromDir(path.join(`${path.normalize(project.path)}`, "/.git/lfs/objects/"), /[a-f0-9]{64}$/, (filename) => {
				files.push(filename);
			});

			for (let i = 0; i < files.length; i++) {
				files[i] = path.basename(files[i]);
			}
			resolve(files);
		});
	}

	filterGitOutput(verbose, name, stdout) {
		if ("string" !== typeof stdout) {
			// console.log(typeof(stdout));
			return;
		}

		const lines = stdout.split("\n");

		for (let i = 0; i < lines.length; i++) {
			if ("" === lines[i]) {
				continue;
			}

			if (!verbose) {
				if ("Already up to date." === lines[i]) {
					continue;
				}
			}

			this._log.Debug(`${name}`, "magenta", `${new Timestamp().Get()}`, lines[i], "green");
		}
	}

	_getProjectRemote(project, remote_name) {
		if (!project.git.remotes) {
			return undefined;
		}

		if (!project.git.remotes[remote_name]) {
			return undefined;
		}

		return project.git.remotes[remote_name];
	}

	async ExecCommand(project, command, verbose) {
		return new Promise((resolve, reject) => {
			const cmd = `cd "${path.normalize(project.path)}/" && ${command}`;

			const child = child_process.spawn("/bin/sh", ["-c", cmd]);

			child.stdout.on("data", (data) => {
				const lines = data.toString().split("\n");

				for (let i = 0; i < lines.length; i++) {
					if ("" === lines[i]) {
						continue;
					}

					this._log.Debug(`${project.name} ${command}`, "magenta", `${new Timestamp().Get()}`, lines[i], "green");
				}
			});

			child.stderr.on("data", (data) => {
				this._log.Error(`${project.name} ${command}`, "magenta", `${new Timestamp().Get()}`, data.toString(), "red");
			});

			child.on("exit", async (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} ${command}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async Fetch(project, remote_name, all, unshallow, depth, tags, verbose) {
		return new Promise((resolve, reject) => {
			let opt = "";

			if (all) {
				opt += " --all";
			}

			if (tags) {
				opt += " --tags";
			}

			if (unshallow) {
				opt += " --unshallow";
			} else if ("string" === typeof depth && depth !== "") {
				opt += ` --depth ${depth}`;
			}

			let cmd = `cd "${path.normalize(project.path)}/" && git fetch${opt}`;

			if (!all) {
				cmd += ` && git fetch${opt} ${remote_name}`;
			}

			const child = child_process.spawn("/bin/sh", ["-c", cmd]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				const message = data.toString();

				if (message.indexOf("X11 forwarding request failed on channel") < 0) {
					this._log.Error(
						`${project.name} git fetch${opt}`,
						"magenta",
						`${new Timestamp().Get()}`,
						message,
						"red"
					);
				}
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git fetch${opt}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async FetchRemoteBranch(project, remote_name, branch, verbose) {
		return new Promise((resolve, reject) => {
			const cmd = `cd "${path.normalize(project.path)}/" && git fetch ${remote_name} ${branch}`;

			const child = child_process.spawn("/bin/sh", ["-c", cmd]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git fetch ${remote_name} ${branch}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git fetch ${remote_name} ${branch}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async ResetHard(project, verbose) {
		return new Promise((resolve, reject) => {
			const cmd = `cd "${path.normalize(project.path)}/" && git reset --hard`;

			const child = child_process.spawn("/bin/sh", ["-c", cmd]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git reset --hard`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git reset --hard`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	// Fetch git lfs files for just the currently-checked-out branch or commit (Ex: 20
	// GB of data). This downloads the files into your `.git/lfs` dir but does NOT
	// update them in your working file system for the branch or commit you have
	// currently checked-out.
	async LFSFetch(project, opts, verbose) {
		return new Promise((resolve, reject) => {
			let response;
			let opt = "";

			if (opts.all) {
				// Fetch git lfs files for ALL remote branches (Ex: 1000 GB of data), downloading
				// all files into your `.git/lfs` directory.
				opt += " --all";
			}

			const child = child_process.spawn("/bin/sh", [
				"-c",
				`cd "${path.normalize(project.path)}/" && git lfs fetch${opt}`
			]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				const lines = data.toString().split("\n");
				lines.forEach((line) => {
					if (line.indexOf("] Not Found: ") > 0) {
						const regex = /[a-f0-9]{64}/gm;
						const matches = regex.exec(line);
						if (null !== matches) {
							if (!response) {
								response = { lfs: { missing_objects: [] } };
							}

							response.lfs.missing_objects.push(matches[0]);
						}
					}
				});
				this._log.Error(
					`${project.name} git lfs fetch${opt}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git lfs fetch${opt}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject(response);
					return;
				}

				resolve(response);
			});
		});
	}

	// Fetch and check out in one step. This one command is the equivalent of these 2
	// commands:
	//       git lfs fetch
	//       git lfs checkout
	async LFSPull(project, opts, verbose) {
		return new Promise((resolve, reject) => {
			const child = child_process.spawn("/bin/sh", ["-c", `cd "${path.normalize(project.path)}/" && git lfs pull`]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git lfs pull`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git lfs pull`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async LFSPush(project, opts, verbose) {
		return new Promise((resolve, reject) => {
			let opt = "";

			if (opts.remote) {
				opt += ` ${opts.remote}`;
			}

			if (opts.all) {
				opt += " --all";
			} else if (opts.object_id) {
				opt += ` --object-id ${opts.object_id}`;
			}

			const child = child_process.spawn("/bin/sh", [
				"-c",
				`cd "${path.normalize(project.path)}/" && git lfs push${opt}`
			]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git lfs push${opt}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git lfs push${opt}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async Pull(project, remote_name, all, bare, depth, verbose) {
		return new Promise((resolve, reject) => {
			let opt = "";

			if (all) {
				opt += " --all";
			}

			if (!bare) {
				if ("string" === typeof depth && depth !== "") {
					opt += ` --depth ${depth}`;
				}
			}

			if (!all) {
				opt += ` ${remote_name}`;
			}

			const child = child_process.spawn("/bin/sh", ["-c", `cd "${path.normalize(project.path)}/" && git pull${opt}`]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				const message = data.toString();

				if (message.indexOf("X11 forwarding request failed on channel") < 0) {
					this._log.Error(`${project.name} git pull${opt}`, "magenta", `${new Timestamp().Get()}`, message, "red");
				}
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git pull${opt}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async PullRemoteBranch(project, remote_name, branch, verbose) {
		return new Promise((resolve, reject) => {
			const child = child_process.spawn("/bin/sh", [
				"-c",
				`cd "${path.normalize(project.path)}/" && git pull ${remote_name} ${branch}`
			]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git pull ${remote_name} ${branch}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git pull ${remote_name} ${branch}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async Status(project, verbose) {
		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git status`);
		const changes = [];
		let branch = "";
		let detached;

		if (stderr !== "") {
			this._log.Error(`${project.name} git status`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Info(`${project.name} git status`, "magenta", `${new Timestamp().Get()}`, stdout, "green");
			return {
				branch,
				changes
			};
		}

		const lines = stdout.split("\n");

		let state = "";

		for (let i = 0; i < lines.length; i++) {
			if (0 === lines[i].indexOf("HEAD detached at ")) {
				detached = lines[i].replace("HEAD detached at ", "");
				continue;
			}

			if (0 === lines[i].indexOf("On branch ")) {
				branch = lines[i].slice(10, lines[i].length);
				continue;
			}

			if ("Changes not staged for commit:" === lines[i]) {
				state = "modified";
			} else if ("Untracked files:" === lines[i]) {
				state = "untracked";
			}

			if ("modified" === state) {
				const temp = lines[i].split(/[\s]+/).filter(Boolean);

				if (2 === temp.length) {
					if ("modified:" === temp[0]) {
						changes.push({
							state,
							path: temp[1]
						});
					} else if ("deleted:" === temp[0]) {
						changes.push({
							state,
							path: temp[1]
						});
					}
				}
			} else if ("untracked" === state) {
				const temp = lines[i].split(/[\s]+/).filter(Boolean);

				if (1 === temp.length) {
					changes.push({
						state,
						path: temp[0]
					});
				}
			}
		}

		return {
			branch,
			changes,
			detached
		};
	}

	async Clone(project, opts, verbose) {
		return new Promise((resolve, reject) => {
			let clone_opts = "";

			const remote = this._getProjectRemote(project, opts.remote);
			if (!remote) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`no defined remote named ${opts.remote}`,
					"red"
				);
				reject();
				return;
			}

			if (opts.mirror) {
				clone_opts += " --mirror";
			} else {
				if (opts.branch) {
					clone_opts += ` --branch ${opts.branch}`;
				}

				if (opts.bare) {
					clone_opts += " --bare ";
				} else {
					if (opts.depth) {
						clone_opts += ` --depth ${opts.depth}`;
					}
				}
			}

			let cmd = `git clone ${clone_opts} ${remote.url} ${project.path}`;

			if (opts.hash) {
				cmd += ` && git reset --hard ${opts.hash}`;
			}

			const child = child_process.spawn("/bin/sh", ["-c", cmd]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git clone ${clone_opts} ${remote.url} ${project.path}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", async (code) => {
				if (code !== 0) {
					if (opts.branch) {
						// try again without a branch
						try {
							await this.Clone(
								project,
								{
									remote: opts.remote,
									bare: opts.bare,
									depth: opts.depth
								},
								verbose
							);
							resolve();
						} catch (err) {
							this._log.Error(
								`${project.name} git clone ${clone_opts} ${remote.url} ${project.path}`,
								"magenta",
								`${new Timestamp().Get()}`,
								`exited with code ${code}`,
								"red"
							);
							reject();
						}
						return;
					}
					this._log.Error(
						`${project.name} git clone ${clone_opts} ${remote.url} ${project.path}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async CurrentHash(project, verbose) {
		let current = "";

		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git rev-parse HEAD`);

		if (stderr !== "") {
			this._log.Error(`${project.name} git rev-parse HEAD`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Debug(`${project.name} git rev-parse HEAD`, "magenta", `${new Timestamp().Get()}`, stdout, "green");
		}

		const lines = stdout.split("\n");

		if (lines.length > 0) {
			current = lines[0];
		}

		return current;
	}

	async Tags(project, matches_hash, verbose) {
		const tags = [];

		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git show-ref --tags -d`);

		if (stderr !== "") {
			this._log.Error(`${project.name} git show-ref --tags -d`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git show-ref --tags -d`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		const lines = stdout.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const fields = lines[i].split(" ", 2);

			if (fields.length !== 2 || (_.isString(matches_hash) && matches_hash !== fields[0])) {
				continue;
			}

			tags.push(fields[1].replace(/^refs\/tags\//, ""));
		}

		return tags;
	}

	async CurrentBranch(project, verbose) {
		let current_branch = "";

		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git branch --show-current`);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git branch --show-current`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git branch --show-current`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		const lines = stdout.split("\n");

		if (lines.length > 0) {
			current_branch = lines[0];
		}

		return current_branch;
	}

	async RemoteURL(project, remote_name, verbose) {
		let current_url = "";

		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git remote get-url ${remote_name}`);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git remote get-url ${remote_name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git remote get-url ${remote_name}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		const lines = stdout.split("\n");

		if (lines.length > 0) {
			current_url = lines[0];
		}

		return current_url;
	}

	async RepoIsShallow(project, verbose) {
		const { stdout, stderr } = await exec(
			`cd "${path.normalize(project.path)}/" &&  git rev-parse --is-shallow-repository`
		);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git rev-parse --is-shallow-repository`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git rev-parse --is-shallow-repository`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		if (stdout.indexOf("true") >= 0) {
			return true;
		}

		return false;
	}

	async RemoteSetBranchesToAll(project, remote_name, verbose) {
		const { stdout, stderr } = await exec(
			`cd "${path.normalize(project.path)}/" &&  git remote set-branches ${remote_name} '*'`
		);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git remote set-branches ${remote_name} '*'`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git remote set-branches ${remote_name} '*'`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		return true;
	}

	async LocalBranchExists(project, branch, verbose) {
		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git branch --list ${branch}`);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git branch --list ${branch}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git branch --list ${branch}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		if (stdout.length >= branch.length) {
			return true;
		}

		return false;
	}

	async LocalBranches(project, verbose) {
		return new Promise((resolve, reject) => {
			const child = child_process.spawn("/bin/sh", ["-c", `cd "${path.normalize(project.path)}/" && git branch`]);
			const branches = [];

			child.stdout.on("data", (data) => {
				if (verbose) {
					this._log.Debug(`${project.name} git branch`, "magenta", `${new Timestamp().Get()}`, data, "green");
					return;
				}

				const txt = data.toString();
				const lines = txt.split("\n");

				lines.forEach((line) => {
					const words = line.split(" ").filter((s) => s);
					if (words.length < 1) {
						return;
					}

					if ("*" === words[0]) {
						branches.push(words[1]);
					} else {
						branches.push(words[0]);
					}
				});
			});

			child.stderr.on("data", (data) => {
				this._log.Error(`${project.name} git branch`, "magenta", `${new Timestamp().Get()}`, data, "red");
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git branch`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve(branches);
			});
		});
	}

	//git branch --all | grep '^\s*remotes' | egrep --invert-match '(:?HEAD|master)$'
	//git branch --track "${branch##*/}" "$branch"
	async RemoteBranches(project, remote_name, verbose) {
		return new Promise((resolve, reject) => {
			const child = child_process.spawn("/bin/sh", [
				"-c",
				`cd "${path.normalize(project.path)}/" && git branch --all`
			]);
			const remotes = [];

			child.stdout.on("data", (data) => {
				if (verbose) {
					this._log.Debug(
						`${project.name} git branch --all`,
						"magenta",
						`${new Timestamp().Get()}`,
						data,
						"green"
					);
					return;
				}

				const txt = data.toString();
				const lines = txt.split("\n");

				lines.forEach((line) => {
					const words = line.split(" ").filter((s) => s);
					if (words.length < 1) {
						return;
					}

					if (`remotes/${remote_name}/HEAD` === words[0]) {
						const branch = words[2].replace(`${remote_name}/`, "");
						remotes.push({
							remote: `remotes/${remote_name}/${branch}`,
							branch
						});
					} else if (0 === words[0].indexOf(`remotes/${remote_name}/`)) {
						const branch = words[0].replace(`remotes/${remote_name}/`, "");
						remotes.push({
							remote: words[0],
							branch
						});
					}
				});
			});

			child.stderr.on("data", (data) => {
				this._log.Error(`${project.name} git branch --all`, "magenta", `${new Timestamp().Get()}`, data, "red");
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git branch --all`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve(remotes);
			});
		});
	}

	async TagExists(project, tag, verbose) {
		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git tag --list ${tag}`);

		if (stderr !== "") {
			this._log.Error(`${project.name} git tag --list ${tag}`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Debug(`${project.name} git tag --list ${tag}`, "magenta", `${new Timestamp().Get()}`, stdout, "green");
		}

		if (stdout.length >= tag.length) {
			return true;
		}

		return false;
	}

	// WARNING DO NOT USE git tag --list --sort=-committerdate (it is broken on alpine)
	async FindLatestTag(project, search, verbose) {
		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git tag --sort=committerdate`);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git tag --sort=committerdate`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git tag --sort=committerdate`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		let tag;

		const lines = stdout.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const regex = new RegExp(`${search}`, "gm");
			let m;
			while ((m = regex.exec(lines[i])) !== null) {
				// This is necessary to avoid infinite loops with zero-width matches
				if (m.index === regex.lastIndex) {
					regex.lastIndex++;
				}

				if (m.length > 0) {
					// always use since newest tags are output last
					tag = lines[i];
				}
			}
		}

		if (tag) {
			return tag;
		}

		throw new Error("Tag not found");
	}

	async UpdateRemoteURL(project, verbose) {
		for (const remote in project.git.remotes) {
			let current_url;
			try {
				current_url = await this.RemoteURL(project, remote, verbose);
			} catch (error) {
				current_url = undefined;
			}
			const new_url = `${project.git.remotes[remote].url}`;

			if (!current_url) {
				this._log.Debug(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`adding new remote ${remote} ${new_url}`,
					"yellow"
				);
				const { stdout, stderr } = await exec(
					`cd "${path.normalize(project.path)}/" && git remote add ${remote} ${project.git.remotes[remote].url}`
				);

				if (stderr !== "") {
					this._log.Error(
						`${project.name} git remote add ${remote} ${project.git.remotes[remote].url}`,
						"magenta",
						`${new Timestamp().Get()}`,
						stderr,
						"red"
					);
				}

				if (verbose) {
					this._log.Debug(
						`${project.name} git remote add ${remote} ${project.git.remotes[remote].url}`,
						"magenta",
						`${new Timestamp().Get()}`,
						stdout,
						"green"
					);
				}
			} else if (current_url !== new_url) {
				this._log.Debug(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`updating remote from ${current_url} to ${new_url}`,
					"yellow"
				);
				const { stdout, stderr } = await exec(
					`cd "${path.normalize(project.path)}/" && git remote set-url ${remote} ${
						project.git.remotes[remote].url
					}`
				);

				if (stderr !== "") {
					this._log.Error(
						`${project.name} git remote set-url ${remote} ${project.git.remotes[remote].url}`,
						"magenta",
						`${new Timestamp().Get()}`,
						stderr,
						"red"
					);
				}

				if (verbose) {
					this._log.Debug(
						`${project.name} git remote set-url ${remote} ${project.git.remotes[remote].url}`,
						"magenta",
						`${new Timestamp().Get()}`,
						stdout,
						"green"
					);
				}
			}
		}
	}

	async RemoteBranchExists(project, remote_name, branch, verbose) {
		const { stdout, stderr } = await exec(
			`cd "${path.normalize(project.path)}/" && git ls-remote --head ${remote_name} ${branch}`
		);

		if (stderr !== "") {
			if (stderr.indexOf("X11 forwarding request failed on channel") < 0) {
				this._log.Error(
					`${project.name} git ls-remote --head ${remote_name} ${branch}`,
					"magenta",
					`${new Timestamp().Get()}`,
					stderr,
					"red"
				);
			}
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git ls-remote --head ${remote_name} ${branch}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		if (stdout.length >= branch.length) {
			return true;
		}

		return false;
	}

	async CheckoutLocalBranch(project, branch, verbose) {
		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git checkout ${branch}`);

		if (stderr !== "") {
			this._log.Error(`${project.name} git checkout ${branch}`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git checkout ${branch}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		return {
			stdout,
			stderr
		};
	}

	async TrackRemoteBranch(project, remote, branch, verbose) {
		const { stdout, stderr } = await exec(
			`cd "${path.normalize(project.path)}/" && git branch --track ${branch} ${remote}`
		);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git branch --track ${branch} ${remote}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git branch --track ${branch} ${remote}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		return {
			stdout,
			stderr
		};
	}

	async CheckoutRemoteBranch(project, remote_name, branch, verbose) {
		const { stdout, stderr } = await exec(
			`cd "${path.normalize(project.path)}/" && git checkout --track ${remote_name}/${branch}`
		);

		if (stderr !== "") {
			this._log.Error(
				`${project.name} git checkout --track ${remote_name}/${branch}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stderr,
				"red"
			);
		}

		if (verbose) {
			this._log.Debug(
				`${project.name} git checkout --track ${remote_name}/${branch}`,
				"magenta",
				`${new Timestamp().Get()}`,
				stdout,
				"green"
			);
		}

		return {
			stdout,
			stderr
		};
	}

	async Add(project, file, verbose) {
		const { stdout, stderr } = await exec(`cd "${path.normalize(project.path)}/" && git add ${file}`);

		if (stderr !== "") {
			this._log.Error(`${project.name} git add ${file}`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Debug(`${project.name} git add ${file}`, "magenta", `${new Timestamp().Get()}`, stdout, "green");
		}
	}

	async Commit(project, opts, verbose) {
		let commit_opts = "";

		if (opts.no_verify) {
			commit_opts += " --no-verify";
		}

		const { stdout, stderr } = await exec(
			`cd "${path.normalize(project.path)}/" && git commit -m "${opts.message}"${commit_opts}`
		);

		if (stderr !== "") {
			this._log.Error(`${project.name} git commit`, "magenta", `${new Timestamp().Get()}`, stderr, "red");
		}

		if (verbose) {
			this._log.Debug(`${project.name} git commit`, "magenta", `${new Timestamp().Get()}`, stdout, "green");
		}
	}

	async Push(project, opts, verbose) {
		return new Promise((resolve, reject) => {
			let push_opts = "";

			const remote = this._getProjectRemote(project, opts.remote);
			if (!remote) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`no remote exists for ${opts.remote}`,
					"red"
				);
				reject();
				return;
			}

			if (remote.read_only) {
				this._log.Error(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`remote ${opts.remote} is read only`,
					"red"
				);
				reject();
				return;
			}

			if (opts.dry_run) {
				push_opts += " --dry-run";
			}

			if (opts.mirror) {
				push_opts += ` ${opts.remote} --mirror`;
			} else if (opts.all) {
				push_opts += `  ${opts.remote} --all`;
			}

			if (opts.tags) {
				push_opts += " --tags";
			}

			if (opts.force) {
				push_opts += " --force";
			}

			if (_.isString(opts.repo)) {
				if ("" !== opts.repo) {
					push_opts += ` --repo=${opts.repo}`;
				}
			}

			if (_.isString(opts.set_upstream)) {
				if ("" !== opts.set_upstream) {
					push_opts += ` --set-upstream ${opts.set_upstream}`;
				}
			}

			if (verbose) {
				this._log.Debug(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`cd "${path.normalize(project.path)}/" && git push${push_opts}`,
					"green"
				);
			}
			const child = child_process.spawn("/bin/sh", [
				"-c",
				`cd "${path.normalize(project.path)}/" && git push${push_opts}`
			]);

			child.stdout.on("data", (data) => {
				if (verbose) {
					this._log.Debug(
						`${project.name} git push${push_opts}`,
						"magenta",
						`${new Timestamp().Get()}`,
						data,
						"green"
					);
					return;
				}

				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git push${push_opts}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git push${push_opts}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async Tag(project, opts, verbose) {
		return new Promise((resolve, reject) => {
			let tag_opts = "";

			if (_.isString(opts.list)) {
				tag_opts = " --list";

				if (_.isString(opts.list)) {
					if ("" !== opts.list) {
						tag_opts += ` ${opts.list}`;
					}
				}
			} else if (opts.delete) {
				if (!_.isString(opts.name) || "" === opts.name) {
					throw new Error("invalid tag");
				}

				tag_opts = ` --delete ${opts.name}`;
			} else if (opts.annotate) {
				if (!_.isString(opts.name) || "" === opts.name) {
					throw new Error("invalid tag");
				}

				tag_opts = ` --annotate ${opts.name}`;

				if (opts.message) {
					tag_opts += ` --message "${opts.message}"`;
				}

				if (opts.force) {
					tag_opts += " --force";
				}
			} else if (opts.sign) {
				if (!_.isString(opts.name) || "" === opts.name) {
					throw new Error("invalid tag");
				}

				tag_opts = ` --sign ${opts.name}`;

				if (opts.force) {
					tag_opts += " --force";
				}
			} else if (opts.local_user) {
				if (!_.isString(opts.name) || "" === opts.name) {
					throw new Error("invalid tag");
				}

				tag_opts = ` --local-user ${opts.local_user} ${opts.name}`;

				if (opts.force) {
					tag_opts += " --force";
				}
			} else {
				if (!_.isString(opts.name) || "" === opts.name) {
					throw new Error("invalid tag");
				}

				tag_opts = ` ${opts.name}`;

				if (opts.force) {
					tag_opts += " --force";
				}
			}

			const child = child_process.spawn("/bin/sh", [
				"-c",
				`cd "${path.normalize(project.path)}/" && git tag${tag_opts}`
			]);

			child.stdout.on("data", (data) => {
				this.filterGitOutput(verbose, project.name, data.toString());
			});

			child.stderr.on("data", (data) => {
				this._log.Error(
					`${project.name} git tag${tag_opts}`,
					"magenta",
					`${new Timestamp().Get()}`,
					data.toString(),
					"red"
				);
			});

			child.on("exit", (code) => {
				if (code !== 0) {
					this._log.Error(
						`${project.name} git tag${tag_opts}`,
						"magenta",
						`${new Timestamp().Get()}`,
						`exited with code ${code}`,
						"red"
					);
					reject();
					return;
				}

				resolve();
			});
		});
	}

	async ExistingType(project) {
		let exists = false;
		let is_bare = false;

		try {
			await access(`${path.normalize(project.path)}/HEAD`, fs.constants.R_OK);
			exists = true;
			is_bare = true;
		} catch (error) {
			exists = false;
		}

		if (false === exists) {
			try {
				await access(`${path.normalize(project.path)}/.git/`, fs.constants.R_OK);
				exists = true;
			} catch (error) {
				exists = false;
			}
		}

		return { exists, bare: is_bare };
	}

	async Migrate(project, opts) {
		if (!project.git.remotes) {
			// not a git repo
			return 0;
		}

		const existing = await this.ExistingType(project);

		if (!existing.exists) {
			this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "repo does not exist locally", "red");
			return 1;
		}

		// Attempt to update the remote URL.
		try {
			await this.UpdateRemoteURL(project, opts.verbose);
		} catch (error) {
			return 1;
		}

		if (!existing.bare) {
			try {
				const result = await this.Status(project, opts.verbose, opts.verbose);

				if (result.changes.length > 0) {
					throw new Error(
						`Sorry I can't migrate your repo, you have the following changes ${JSON.stringify(result.changes)}`
					);
				}
			} catch (error) {
				if (error) {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
				return 1;
			}
		}

		try {
			await this.Fetch(project, opts.remote, true, false, "", false, opts.verbose);
		} catch (error) {
			if (error) {
				this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
			}
		}

		let missing_objects;

		try {
			await this.LFSFetch(project, { all: true }, opts.verbose);
		} catch (error) {
			if (error) {
				if (error.lfs) {
					missing_objects = error.lfs.missing_objects;
				} else {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
			}
		}

		let local_lfs_objects;
		try {
			local_lfs_objects = await this.FindLFSObjects(project);
		} catch (error) {
			if (error) {
				if (error.lfs) {
					missing_objects = error.lfs.missing_objects;
				} else {
					this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
				}
			}
		}

		this._log.Debug(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "starting queue", "green");
		try {
			const handler = async (lfs_opts) => {
				this._log.Info(
					`${project.name}`,
					"magenta",
					`${new Timestamp().Get()}`,
					`attempting to push LFS object ${lfs_opts.object_id}`,
					"yellow"
				);

				try {
					await this.LFSPush(project, lfs_opts, opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
				}
			};

			const pqueue = new PQueue({ concurrency: 10 });

			for (let i = 0; i < local_lfs_objects.length; i++) {
				const lfs_opts = {
					remote: opts.remote,
					object_id: local_lfs_objects[i]
				};

				pqueue
					.add(() => handler(lfs_opts))
					.catch((err) => {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, err.message, "red");
					});
			}

			await pqueue.onIdle();
			this._log.Debug(`${project.name}`, "magenta", `${new Timestamp().Get()}`, "completed queue", "green");
		} catch (err) {
			this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, err.message, "red");
		}

		if (missing_objects) {
			for (let i = 0; i < missing_objects.length; i++) {
				// this._log.Info(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, `attempting to push missing LFS object ${missing_objects[i]}`, "yellow");
				// const lfs_opts = {
				// 	remote: opts.remote,
				// 	object_id: missing_objects[i]
				// };
				// try
				// {
				// 	await this.LFSPush(project, lfs_opts, opts.verbose);
				// }
				// catch(error)
				// {
				// 	if(error)
				// 	{
				// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
				// 	}
				// }
			}
		}

		if (!existing.bare) {
			for (const remote in project.git.remotes) {
				try {
					await this.Pull(project, remote, true, false, "", opts.verbose);
				} catch (error) {
					if (error) {
						this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
					}
				}
			}
		}

		// todo, need to go through and "track" all branches on remote

		try {
			const remote = this._getProjectRemote(project, opts.remote);
			if (!remote) {
				throw new Error(`no remote exists for ${opts.remote}`);
			}

			await this.Push(
				project,
				{
					all: true,
					remote: opts.remote,
					repo: remote.url
				},
				opts.verbose
			);
		} catch (error) {
			if (error) {
				this._log.Error(`${project.name}`, "magenta", `${new Timestamp().Get()}`, error.message, "red");
			}
		}

		// TODO this just hangs...
		// try
		// {
		// 	await this.LFSPush(project, {
		// 		all: true,
		// 		remote: opts.remote
		// 	}, opts.verbose);
		// }
		// catch(error)
		// {
		// 	if(error)
		// 	{
		// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 	}
		// }

		// let branch = "";

		// /* Check current branch*/
		// try
		// {
		// 	branch = await this.CurrentBranch(project, opts.verbose);
		// }
		// catch(error)
		// {
		// 	if(error)
		// 	{
		// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 	}
		// 	return(1);
		// }

		// try
		// {
		// 	await this.FetchRemoteBranch(project, opts.remote, branch, opts.verbose);
		// }
		// catch(error)
		// {
		// 	if(error)
		// 	{
		// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 	}
		// }

		// try
		// {
		// 	await this.PullRemoteBranch(project, opts.remote, branch, opts.verbose);
		// }
		// catch(error)
		// {
		// 	if(error)
		// 	{
		// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 	}
		// }

		// let branches = [];

		// try
		// {
		// 	branches = await this.LocalBranches(project, opts.verbose);
		// }
		// catch(error)
		// {
		// 	if(error)
		// 	{
		// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 	}
		// 	return(1);
		// }

		// // TODO this doesn't pull all remote branches first....

		// let remote_branches = [];

		// for(const remote in project.git.remotes)
		// {
		// 	try
		// 	{
		// 		await this.Fetch(project, remote, true, false, "", opts.verbose);
		// 	}
		// 	catch(error)
		// 	{
		// 		if(error)
		// 		{
		// 			this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 		}
		// 		return(1);
		// 	}

		// 	try
		// 	{
		// 		let tmp = await this.RemoteBranches(project, remote, opts.verbose);
		// 		tmp.forEach((branch) => {
		// 			remote_branches.push(branch);
		// 		});
		// 	}
		// 	catch(error)
		// 	{
		// 		if(error)
		// 		{
		// 			this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 		}
		// 	}
		// }

		// // get remote_branches
		// // console.log(remote_branches);

		// for(let i = 0; i < branches.length; i++)
		// {
		// 	let found = false;

		// 	if(remote_branches)
		// 	{
		// 		for(let j = 0; j < remote_branches.length; j++)
		// 		{
		// 			if(remote_branches[j].branch === branches[i])
		// 			{
		// 				if(remote_branches[j].Remote !== "")
		// 				{
		// 					found = true;
		// 				}
		// 				break;
		// 			}
		// 		}
		// 	}
		// 	else
		// 	{
		// 		// oh well try anyway
		// 		found = true;
		// 	}

		// 	if(!found)
		// 	{
		// 		this._log.Info(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, `skipping local branch ${branches[i]}`, "yellow");
		// 		continue;
		// 	}
		// 	this._log.Info(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, `switching to local branch ${branches[i]}`, "yellow");

		// 	try
		// 	{
		// 		await this.CheckoutLocalBranch(project, branches[i], opts.verbose);
		// 	}
		// 	catch(error)
		// 	{
		// 		if(error)
		// 		{
		// 			this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 		}
		// 		continue;
		// 	}

		// 	try
		// 	{
		// 		await this.FetchRemoteBranch(project, opts.remote, branches[i], opts.verbose);
		// 	}
		// 	catch(error)
		// 	{
		// 		if(error)
		// 		{
		// 			this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 		}
		// 	}

		// 	try
		// 	{
		// 		await this.PullRemoteBranch(project, opts.remote, branches[i], opts.verbose);
		// 	}
		// 	catch(error)
		// 	{
		// 		if(error)
		// 		{
		// 			this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 		}
		// 	}

		// 	try
		// 	{
		// 		await this.Push(project, { all: true, remote: opts.remote, set_upstream: `${opts.remote} ${branches[i]}` }, opts.verbose);
		// 	}
		// 	catch(error)
		// 	{
		// 		if(error)
		// 		{
		// 			this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 		}
		// 	}
		// }

		// this._log.Info(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, `switching back to local branch ${branch}`, "yellow");

		// try
		// {
		// 	await this.CheckoutLocalBranch(project, branch, opts.verbose);
		// }
		// catch(error)
		// {
		// 	if(error)
		// 	{
		// 		this._log.Error(`${project.name}`, "magenta", `${(new Timestamp()).Get()}`, error.message, "red");
		// 	}
		// 	return(1);
		// }

		return 0;
	}
}

module.exports = GitCommands;
