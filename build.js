const { build } = require("esbuild");

build({
	entryPoints: ["bin/gobs"],
	bundle: true,
	platform: "node",
	target: "node12",
	outfile: "dist/gobs"
}).catch(() => process.exit(1));
