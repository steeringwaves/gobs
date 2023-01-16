/* eslint-disable no-await-in-loop */
/* eslint-disable no-loop-func */

const _ = require("lodash");

const colors = require("colors");
const Timestamp = require("./Lib/Utilities/Timestamp.js");

class Log {
	constructor(opts) {
		this._opts = _.defaultsDeep(opts, {
			NoColor: false,
			RawOutput: false
		});
	}

	_log(writer, name, nameColor, timestamp, message, messageColor) {
		let leader;

		if (!timestamp) {
			timestamp = `${new Timestamp().Get()}`;
		}

		if (name) {
			if (this._opts.NoColor) {
				leader = `${timestamp} [${name}]: `;
			} else {
				leader = colors.blue(`${timestamp} `) + colors[nameColor](`[${name}]: `);
			}
		} else {
			if (this._opts.NoColor) {
				leader = `${timestamp}: `;
			} else {
				leader = colors.blue(`${timestamp}: `);
			}
		}

		if ("string" !== typeof message) {
			if (this._opts.RawOutput) {
				writer(`${typeof message}\n`);
			} else {
				writer(`${leader}${colors[messageColor](typeof message)}\n`);
			}
			return;
		}

		const lines = message.split("\n");

		for (let i = 0; i < lines.length; i++) {
			if ("" === lines[i]) {
				continue;
			}

			if (this._opts.RawOutput) {
				writer(`${lines[i]}\n`);
			} else {
				if (this._opts.NoColor) {
					writer(`${leader}${lines[i]}\n`);
				} else {
					writer(`${leader}${colors[messageColor](lines[i])}\n`);
				}
			}
		}
	}

	Log(name, nameColor, timestamp, message, messageColor) {
		return this._log(
			(s) => {
				process.stdout.write(s);
			},
			name,
			nameColor,
			timestamp,
			message,
			messageColor
		);
	}

	Info(name, nameColor, timestamp, message, messageColor) {
		return this._log(
			(s) => {
				process.stdout.write(s);
			},
			name,
			nameColor,
			timestamp,
			message,
			messageColor
		);
	}

	Debug(name, nameColor, timestamp, message, messageColor) {
		return this._log(
			(s) => {
				process.stdout.write(s);
			},
			name,
			nameColor,
			timestamp,
			message,
			messageColor
		);
	}

	Error(name, nameColor, timestamp, message, messageColor) {
		return this._log(
			(s) => {
				process.stderr.write(s);
			},
			name,
			nameColor,
			timestamp,
			message,
			messageColor
		);
	}
}

module.exports = Log;
