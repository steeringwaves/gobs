/* eslint-disable no-bitwise,no-mixed-operators */
const crypto = require("crypto");

// Generates v4 UUID's (random-seeded) per RFC4122
// Based on https://www.npmjs.com/package/uui://www.npmjs.com/package/uuid

const byteToHex = [];

function bytesToUUID(buffer)
{
	if(0 === byteToHex.length)
	{
		for(let j = 0; j < 256; j++)
		{
			byteToHex[j] = (j + 0x100).toString(16).substr(1);
		}
	}

	// Join used for memory issue caused by concatenation:
	// https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
	let i = 0;
	return([
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		"-",
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		"-",
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		"-",
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		"-",
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]],
		byteToHex[buffer[i++]]
	]).join("");
}

module.exports = function(options)
{
	options = options || {};

	if(options.Weak)
	{
		// Adapted from: https://stackoverflow.com/a/2117523
		return("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").replace(/[xy]/g, (c) =>
		{
			const r = Math.random() * 16 | 0;
			let v = null;

			if("x" === c)
			{
				v = r;
			}
			else
			{
				v = (r & 0x3 | 0x8);
			}

			return v.toString(16);
		});
	}

	const seed = crypto.randomBytes(16);

	seed[6] = (seed[6] & 0x0f) | 0x40;
	seed[8] = (seed[8] & 0x3f) | 0x80;

	return bytesToUUID(seed);
};
