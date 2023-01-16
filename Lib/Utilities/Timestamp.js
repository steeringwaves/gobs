const _ = require("lodash");

class Timestamp extends Date
{
	constructor(date_string, options)
	{
		if(!_.isUndefined(date_string))
		{
			/* Pass date string to Date() */
			super(date_string);
		}
		else
		{
			super();
		}

		if(!options)
		{
			options = {};
		}

		this._compact = options.Compact || false;
	}

	Get()
	{
		let year;
		if(!this._compact)
		{
			year = this.getFullYear();
		}
		else
		{
			year = this.getFullYear() - 2000;
			if(10 > year)
			{
				year = `0${year}`;
			}
		}

		let month = this.getMonth() + 1;
		if(10 > month)
		{
			month = `0${month}`;
		}

		let day = this.getDate();
		if(10 > day)
		{
			day = `0${day}`;
		}

		let hours = this.getHours();
		if(10 > hours)
		{
			hours = `0${hours}`;
		}

		let minutes = this.getMinutes();
		if(10 > minutes)
		{
			minutes = `0${minutes}`;
		}

		let seconds;
		if(!this._compact)
		{
			seconds =
				(this.getSeconds() + (this.getMilliseconds() / 1000)).toFixed(3);
		}
		else
		{
			seconds = this.getSeconds();
		}

		if(10 > seconds)
		{
			seconds = `0${seconds}`;
		}

		return(`${year}/${month}/${day} ${hours}:${minutes}:${seconds}`);
	}
}

module.exports = Timestamp;
