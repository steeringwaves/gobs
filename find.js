const path = require("path");
const fs = require("fs");

class Find {
	static async Up(name, dirname) {
		if (!dirname) {
			dirname = process.cwd();
		}

		const filename = path.join(dirname, name);

		try {
			const stat = await fs.promises.stat(filename);
			if (stat.isDirectory()) {
				throw new Error(`${filename} is a directory`);
			}
		} catch (error) {
			if ("/" === dirname) {
				throw new Error(`Unable to find ${name}`);
			}

			return Find.Up(name, path.resolve(dirname, ".."));
		}

		return filename;
	}
}

module.exports = Find;
