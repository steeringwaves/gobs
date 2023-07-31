# gobs

![workflow](https://github.com/steeringwaves/gobs/actions/workflows/test.yml/badge.svg)

Parallel project runner with built in git integrations using user defined configuration files.

Why does this exist? I work on a lot of different git repos at the same time and and got tired of having so many terminal windows open to checkout branches, fetch, clone, run common scripts, etc... Hence the name `gobs`

## use cases

- Keeping up to date git repos with a single command
- Creating/Checking out a common git branch across several repos
- Seeing what changes existing across several git repos
- Running commands across several folders

## roadmap

- [x] Specify configuration file via arugment `--config`
- [x] Specify configuration file via environment varialbe `GOBS_CONFIG`
- [x] Automatically search for configuration file recurisvely upwards looking for a file named `.gobs.yml`
- [x] Allow multi-root configurations
- [x] Allow filtering by groups `--group` eg `"test"` or even `"test || (home && 3dprinting)"
- [x] Allow filtering by out project(s) by name `--without`
- [x] Allow specifying a single project by name `--project`
- [x] Allow `run` to run command that is present in all projects
- [x] Allow `foreach <command>` to run a specified shell command in all projects
- [x] Configuration templating with handlebars
- [x] Parallel execution option (right now it's on by default with `--no-parallel`)
- [x] Specify projects that have no git repo
- [x] Specify batches (directed graphs) that execute multiple commands across multiple projects using a directed graph to take full advantage to parallel processing (users can specify upstream or downstream steps)
- [ ] Should we make the parallel execution option off by default and just use `-j` like `make`?
- [ ] Allow overrides for uses that are always used from `.gobs/config.yml` (no color, global variables, etc...)
- [x] `describe` should generate a manifest of all projects and include the current commit hash, if any files have changed and optionally any tags
- [ ] `describe` manifest should include an optional last log message
- [ ] Integration tests using docker
- [x] Allow vars to be specified on the command line, which is super useful for things like (armv7l, x86_64, armhf etc...)
- [ ] Auto generate vscode workspaces with one or more groups, and allow a workspace template to be specified
- [ ] What if someone points more than one project at a path? Should be detect this somehow?
- [ ] Tab completion will be tricky since a configuration path must be specified (possible if they use an env variable though)
- [ ] Allow digraph commands to point to another file that defines them (include paths could be weird)
- [ ] Allow project definitions to point to another file that defines them (include paths could be weird)
- [ ] Allow option parsing via env variables (especially for specifying the configuration file)
- [ ] Allow git project to specify a default branch name to checkout initially (eg legacy/next etc...)

## things not on the roadmap

- [ ] Support for every possible version of git (maybe we could get at least check the current version and see if it's > some version?)
- [ ] Replacing build systems like make - if you want to run a few commands that's fine but ideally this tool just calls `make` or insert build tool here

## commands

### string

`string` renders the configuration to either yaml/json for use with other applications

## issues

- [ ] Groups don't make sense for digraph commands
- [ ] We have a keyword for a group named `all` so this would prevent a user from using a group named this, also our templates allow linking to projects but that syntax uses `*` instead. Using `*` on the command line is a pain because you have to specify it as '*' or else shell expansion will bite you
- [ ] Templating commands that are run on the shell will break if you try to specify a shell variable such as `"cd ${HOME} && pwd"` however `"cd $HOME && pwd"` or `"cd \"${env.HOME}\" && pwd"` or `home=$(echo $HOME) && cd $home && pwd` will be fine
- [ ] This shells out to run commands - there could be some strange quote escaping going on preventing some commands from working
- [ ] Windows/Mac is completely untested

## digraph (directed graph) logic when running commands

- [x] Specify if a project is upstream/downstream
- [x] Digraph steps must have unique id's to prevent the vertices from looping
- [x] Digraph steps must point to a valid project name
- [x] Digraph steps can call out one or more project defined commands as well as one or more exec shell commands

## templating configs

Using `eval` is a pretty nasty hack, but allows for some nifty dynamic configurations using env variables.

Here is a snipped showing how the eval is executed:

```js
eval("function run(self, app, env, vars){return `" + str + "`;} run(compileWith.self, compileWith.app, compileWith.env, compileWith.vars)")
```

- `${env.HOME}`
- `${app.config_dir}` the directory of the specified configuration file
- `${self.name}` only valid inside a project but self refers to the current project value

add more details on internal variables...

## templates

Templates use the handlebars syntax and *NOT* the eval syntax. I know this may be confusing...

Templates can point to all projects using the keyword '*', but they can also point to an array of projects

Templates also get passed

- `env`
- `app`
- `self`
- `projects`
- `project` (assuming this template points to one or more projects)

Example:

```yaml
templates:
- name: active
  file: "${app.config_dir}/workspace.hbs"
  dest: "${vars.personal_workspace}/active.code-workspace"
  chmod: "0644"
  tools:
    paths:
      clangd: /usr/bin/clangd
      node: "${vars.home_path}/.local/bin/node"
- name: gotidy
  file: "${app.config_dir}/tidy.hbs"
  # don't do this for our example
  # dest: "${project.path}/tidy.sh"
  chmod: "0755"
  projects: "*"
  example_dest: "${project.path}/tidy.sh"

```

## integration tests

- [ ] Use docker-compose to perform a real world test spin up a container hosting a git server and another running gobs
- [ ] Verify repos can be cloned if they don't exist
- [ ] Verify new branches can be created/pushed
- [ ] Verify changes can be commited
- [ ] Verify changes can be detected
- [ ] Verify tags can be pushed
- [ ] Verify describe produces the correct output
- [ ] Verify branch can be checked out by name/hash/tag/tag regex

## changes

- [ ] command should be more structured eg {name:..., exec:...}
