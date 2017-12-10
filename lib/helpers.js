const fs = require('fs');
const pf = require('parse-to-float');

module.exports = {
	approximateLast: (itv) => {
		let time = Date.now();
		if (itv === undefined) {
		    modifier = 24 * 360 * 1000;
		} else if (itv === '1h') {
		    modifier = 360 * 1000;
		} else if (itv === '7d') {
		    modifier = 7 * 24 * 360 * 1000;
		} else if (itv === '30d') {
		    modifier = 30 * 24 * 360 * 1000;
		} else {
		    modifier = 24 * 360 * 1000;
		}
		return Math.round((time - modifier) / 1000);
	    },
	approximateTime: (precision) => {
		let now = Date.now();
		let narrow = new Date(now), circa, c;
		if (precision === undefined || precision === 'minute') {
		    circa = new Date(narrow.getFullYear(), narrow.getMonth(), narrow.getDate(), narrow.getHours(), narrow.getMinutes(), 0);
		} else if (precision === 'halfhour') {
		    c = narrow.getMinutes() >= 30 ? 30 : 0;
		    circa = new Date(narrow.getFullYear(), narrow.getMonth(), narrow.getDate(), narrow.getHours(), c, 0);
		} else if (precision === 'hour') {
		    circa = new Date(narrow.getFullYear(), narrow.getMonth(), narrow.getDate(), narrow.getHours(), 0, 0);
		} else if (precision === 'midday') {
		    c = narrow.getHours() >= 12 ? 12 : 0;
		    circa = new Date(narrow.getFullYear(), narrow.getMonth(), narrow.getDate(), c, 0, 0);
		} else if (precision === 'day') {
		    circa = new Date(narrow.getFullYear(), narrow.getMonth(), narrow.getDate(), 0, 0, 0);
		}
		return Math.round(circa.getTime() / 1000);
	    },
	capitalize: (str) => {
		let ary = str.split(' '), ret = '';
		for (let i = 0; i < ary.length; i++) {
		    if (i > 0) { ret += ' '; }
		    ret += ary[i].charAt(0).toUpperCase() + ary[i].slice(1);
		}
		return ret;
	    },
	genericColors: () => {
		return [
		    { body: 'rgba(255, 99, 132, 0.2)', border: 'rgba(255,99,132,1)' },
		    { body: 'rgba(54, 162, 235, 0.2)', border: 'rgba(54, 162, 235, 1)' },
		    { body: 'rgba(255, 206, 86, 0.2)', border: 'rgba(255, 206, 86, 1)' },
		    { body: 'rgba(75, 192, 192, 0.2)', border: 'rgba(75, 192, 192, 1)' },
		    { body: 'rgba(153, 102, 255, 0.2)', border: 'rgba(153, 102, 255, 1)' },
		    { body: 'rgba(255, 159, 64, 0.2)', border: 'rgba(255, 159, 64, 1)' }
		];
	    },
	genericLimits: () => {
	    return [
		    { value: 0, label: 'All' },
		    { value: 25, label: '25' },
		    { value: 50, label: '50' },
		    { value: 100, label: '100' },
		    { value: 500, label: '500' },
		    { value: 1000, label: '1000' }
		];
	    },
	genericTimeZones: () => {
		return [
		    { value: 'Pacific/Midway', toGMT: -660, label: '(GMT-11:00) Midway Island, Samoa' },
		    { value: 'America/Adak', toGMT: -600, label: '(GMT-10:00) Hawaii-Aleutian' },
		    { value: 'Etc/GMT+10', toGMT: -600, label: '(GMT-10:00) Hawaii' },
		    { value: 'Pacific/Marquesas', toGMT: -570, label: '(GMT-09:30) Marquesas Islands' },
		    { value: 'Pacific/Gambier', toGMT: -540, label: '(GMT-09:00) Gambier Islands' },
		    { value: 'America/Anchorage', toGMT: -540, label: '(GMT-09:00) Alaska' },
		    { value: 'America/Ensenada', toGMT: -480, label: '(GMT-08:00) Tijuana, Baja California' },
		    { value: 'Etc/GMT+8', toGMT: -480, label: '(GMT-08:00) Pitcairn Islands' },
		    { value: 'America/Los_Angeles', toGMT: -480, label: '(GMT-08:00) Pacific Time (US &amp; Canada)' },
		    { value: 'America/Denver', toGMT: -420, label: '(GMT-07:00) Mountain Time (US &amp; Canada)' },
		    { value: 'America/Chihuahua', toGMT: -420, label: '(GMT-07:00) Chihuahua, La Paz, Mazatlan' },
		    { value: 'America/Dawson_Creek', toGMT: -420, label: '(GMT-07:00) Arizona' },
		    { value: 'America/Belize', toGMT: -360, label: '(GMT-06:00) Saskatchewan, Central America' },
		    { value: 'America/Cancun', toGMT: -360, label: '(GMT-06:00) Guadalajara, Mexico City, Monterrey' },
		    { value: 'Chile/EasterIsland', toGMT: -360, label: '(GMT-06:00) Easter Island' },
		    { value: 'America/Chicago', toGMT: -360, label: '(GMT-06:00) Central Time (US &amp; Canada)' },
		    { value: 'America/New_York', toGMT: -300, label: '(GMT-05:00) Eastern Time (US &amp; Canada)' },
		    { value: 'America/Havana', toGMT: -300, label: '(GMT-05:00) Cuba' },
		    { value: 'America/Bogota', toGMT: -300, label: '(GMT-05:00) Bogota, Lima, Quito, Rio Branco' },
		    { value: 'America/Caracas', toGMT: -270, label: '(GMT-04:30) Caracas' },
		    { value: 'America/Santiago', toGMT: -240, label: '(GMT-04:00) Santiago' },
		    { value: 'America/La_Paz', toGMT: -240, label: '(GMT-04:00) La Paz' },
		    { value: 'Atlantic/Stanley', toGMT: -240, label: '(GMT-04:00) Faukland Islands' },
		    { value: 'America/Campo_Grande', toGMT: -240, label: '(GMT-04:00) Brazil' },
		    { value: 'America/Goose_Bay', toGMT: -240, label: '(GMT-04:00) Atlantic Time (Goose Bay)' },
		    { value: 'America/Glace_Bay', toGMT: -240, label: '(GMT-04:00) Atlantic Time (Canada)' },
		    { value: 'America/St_Johns', toGMT: -150, label: '(GMT-03:30) Newfoundland' },
		    { value: 'America/Araguaina', toGMT: -180, label: '(GMT-03:00) UTC-3' },
		    { value: 'America/Montevideo', toGMT: -180, label: '(GMT-03:00) Montevideo' },
		    { value: 'America/Miquelon', toGMT: -180, label: '(GMT-03:00) Miquelon, St. Pierre' },
		    { value: 'America/Godthab', toGMT: -180, label: '(GMT-03:00) Greenland' },
		    { value: 'America/Argentina/Buenos_Aires', toGMT: -180, label: '(GMT-03:00) Buenos Aires' },
		    { value: 'America/Sao_Paulo', toGMT: -180, label: '(GMT-03:00) Brasilia' },
		    { value: 'America/Noronha', toGMT: -120, label: '(GMT-02:00) Mid-Atlantic' },
		    { value: 'Atlantic/Cape_Verde', toGMT: -60, label: '(GMT-01:00) Cape Verde Is.' },
		    { value: 'Atlantic/Azores', toGMT: -60, label: '(GMT-01:00) Azores' },
		    { value: 'UTC', toGMT: 0, label: 'Coordinated Universal Time' },
		    { value: 'Europe/Belfast', toGMT: 0, label: 'Greenwich Mean Time : Belfast' },
		    { value: 'Europe/Dublin', toGMT: 0, label: 'Greenwich Mean Time : Dublin' },
		    { value: 'Europe/Lisbon', toGMT: 0, label: 'Greenwich Mean Time : Lisbon' },
		    { value: 'Europe/London', toGMT: 0, label: 'Greenwich Mean Time : London' },
		    { value: 'Africa/Abidjan', toGMT: 0, label: 'Monrovia, Reykjavik' },
		    { value: 'Europe/Amsterdam', toGMT: 60, label: '(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna' },
		    { value: 'Europe/Belgrade', toGMT: 60, label: '(GMT+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague' },
		    { value: 'Europe/Brussels', toGMT: 60, label: '(GMT+01:00) Brussels, Copenhagen, Madrid, Paris' },
		    { value: 'Africa/Algiers', toGMT: 60, label: '(GMT+01:00) West Central Africa' },
		    { value: 'Africa/Windhoek', toGMT: 60, label: '(GMT+01:00) Windhoek' },
		    { value: 'Asia/Beirut', toGMT: 120, label: '(GMT+02:00) Beirut' },
		    { value: 'Africa/Cairo', toGMT: 120, label: '(GMT+02:00) Cairo' },
		    { value: 'Asia/Gaza', toGMT: 120, label: '(GMT+02:00) Gaza' },
		    { value: 'Africa/Blantyre', toGMT: 120, label: '(GMT+02:00) Harare, Pretoria' },
		    { value: 'Asia/Jerusalem', toGMT: 120, label: '(GMT+02:00) Jerusalem' },
		    { value: 'Europe/Minsk', toGMT: 120, label: '(GMT+02:00) Minsk' },
		    { value: 'Asia/Damascus', toGMT: 120, label: '(GMT+02:00) Syria' },
		    { value: 'Europe/Moscow', toGMT: 180, label: '(GMT+03:00) Moscow, St. Petersburg, Volgograd' },
		    { value: 'Africa/Addis_Ababa', toGMT: 180, label: '(GMT+03:00) Nairobi' },
		    { value: 'Asia/Tehran', toGMT: 180, label: '(GMT+03:30) Tehran' },
		    { value: 'Asia/Dubai', toGMT: 240, label: '(GMT+04:00) Abu Dhabi, Muscat' },
		    { value: 'Asia/Yerevan', toGMT: 240, label: '(GMT+04:00) Yerevan' },
		    { value: 'Asia/Kabul', toGMT: 270, label: '(GMT+04:30) Kabul' },
		    { value: 'Asia/Yekaterinburg', toGMT: 300, label: '(GMT+05:00) Ekaterinburg' },
		    { value: 'Asia/Tashkent', toGMT: 300, label: '(GMT+05:00) Tashkent' },
		    { value: 'Asia/Kolkata', toGMT: 330, label: '(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
		    { value: 'Asia/Katmandu', toGMT: 345, label: '(GMT+05:45) Kathmandu' },
		    { value: 'Asia/Dhaka', toGMT: 360, label: '(GMT+06:00) Astana, Dhaka' },
		    { value: 'Asia/Novosibirsk', toGMT: 360, label: '(GMT+06:00) Novosibirsk' },
		    { value: 'Asia/Rangoon', toGMT: 390, label: '(GMT+06:30) Yangon (Rangoon)' },
		    { value: 'Asia/Bangkok', toGMT: 420, label: '(GMT+07:00) Bangkok, Hanoi, Jakarta' },
		    { value: 'Asia/Krasnoyarsk', toGMT: 420, label: '(GMT+07:00) Krasnoyarsk' },
		    { value: 'Asia/Hong_Kong', toGMT: 480, label: '(GMT+08:00) Beijing, Chongqing, Hong Kong, Urumqi' },
		    { value: 'Asia/Irkutsk', toGMT: 480, label: '(GMT+08:00) Irkutsk, Ulaan Bataar' },
		    { value: 'Australia/Perth', toGMT: 480, label: '(GMT+08:00) Perth' },
		    { value: 'Australia/Eucla', toGMT: 525, label: '(GMT+08:45) Eucla' },
		    { value: 'Asia/Tokyo', toGMT: 540, label: '(GMT+09:00) Osaka, Sapporo, Tokyo' },
		    { value: 'Asia/Seoul', toGMT: 540, label: '(GMT+09:00) Seoul' },
		    { value: 'Asia/Yakutsk', toGMT: 540, label: '(GMT+09:00) Yakutsk' },
		    { value: 'Australia/Adelaide', toGMT: 570, label: '(GMT+09:30) Adelaide' },
		    { value: 'Australia/Darwin', toGMT: 570, label: '(GMT+09:30) Darwin' },
		    { value: 'Australia/Brisbane', toGMT: 600, label: '(GMT+10:00) Brisbane' },
		    { value: 'Australia/Hobart', toGMT: 600, label: '(GMT+10:00) Sydney, Melbourne, Hobart' },
		    { value: 'Asia/Vladivostok', toGMT: 600, label: '(GMT+10:00) Vladivostok' },
		    { value: 'Australia/Lord_Howe', toGMT: 630, label: '(GMT+10:30) Lord Howe Island' },
		    { value: 'Etc/GMT-11', toGMT: 660, label: '(GMT+11:00) Solomon Is., New Caledonia' },
		    { value: 'Asia/Magadan', toGMT: 660, label: '(GMT+11:00) Magadan' },
		    { value: 'Pacific/Norfolk', toGMT: 690, label: '(GMT+11:30) Norfolk Island' },
		    { value: 'Asia/Anadyr', toGMT: 720, label: '(GMT+12:00) Anadyr, Kamchatka' },
		    { value: 'Pacific/Auckland', toGMT: 720, label: '(GMT+12:00) Auckland, Wellington' },
		    { value: 'Etc/GMT-12', toGMT: 720, label: '(GMT+12:00) Fiji, Kamchatka, Marshall Is.' },
		    { value: 'Pacific/Chatham', toGMT: 765, label: '(GMT+12:45) Chatham Islands' },
		    { value: 'Pacific/Tongatapu', toGMT: 780, label: "(GMT+13:00) Nuku'alofa" },
		    { value: 'Pacific/Kiritimati', toGMT: 840, label: '(GMT+14:00) Kiritimati' }
		];
	    },
	getTrend: (left, right) => {
		if (left === 0) { return 0; }
		else if (left > right) { return pf((1 - (left / right)) * -100, 3); }
		return pf((1 - (right / left)) * 100, 3);
		//?? return pf((left - right) * 100 / Math.abs(left), 3);
	    },
	loadDirectory: (dirPath, target) => {
		fs.readdirSync(dirPath).forEach((file) => {
			if (file.match(/\w+\.j2$/)) {
			    target[file.replace(/\.j2/, '')] = fs.readFileSync(dirPath + '/' + file).toString();
			}
		    });
	    },
	randomNumber: (low, high) => {
		if (low > 1) { return Math.round(Math.random() * ((high || 1000) - (low || 1)) + (low || 1)); }
	        return Math.random() * ((high || 1000) - (low || 1)) + (low || 1);
	    },
	renderAmount: (amount) => {
		if (amount === undefined) { return; }
		let modulo = amount.toString().split('.');
		if (modulo[1] !== undefined) {
		    return modulo[0].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + '.' + modulo[1];
		} else {
		    return modulo[0].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}
	    },
	renderCurrency: (currency) => {
		let ary = currency.split(/[ -]/), ret = '';
		for (let i = 0; i < ary.length; i++) {
		    if (i > 0) { ret += ' '; }
		    ret += ary[i].charAt(0).toUpperCase() + ary[i].slice(1);
		}
		return ret;
	    },
	renderGainClass: (gain) => {
		if (gain === 0) { return 'grey'; }
		else if (gain > 0) { return 'green'; }
		return 'red';
	    },
	renderDate: (timestamp) => {
		if (timestamp !== undefined) {
		    return new Date(timestamp).toISOString().replace(/T/, ' ').replace(/\..+/, '');
		} else {
		    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
		}
	    },
	renderDateAgo: (timestamp) => {
		if (timestamp !== undefined) {
		    return Math.round(Math.abs((new Date().getTime() - new Date(timestamp).getTime()) / (24*60*60*1000)));
		} else { return 0; }
	    },
	renderDateDay: (timestamp) => {
		if (timestamp !== undefined) {
		    return new Date(timestamp).toDateString();
		} else {
		    return new Date().toDateString();
		}
	    },
	renderDateMonth: (year, month) => {
		let monthNames = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
		if (month === undefined) {
		    let render = new Date(year);
		    month = render.getMonth();
		    year = render.getFullYear();
		} else { month--; }
		month = monthNames[month];
		return `${month}, ${year}`;
	    },
	renderTrend: (score) => {
		if (score >= 0) { return `+${score}%`; }
		else { return `${score}%`; }
	    },
	renderTrendClass: (score) => {
		if (score > 0) { return 'green'; }
		else { return 'red'; }
	    },
	renderTradeClass: (type) => {
		if ([ 'Withdrawal', 'Loss', 'Stolen', 'Sell', 'Gift', 'Donation', 'Spend', 'Lost' ].indexOf(type) >= 0) {
		    return 'red';
		} else { return 'green'; }
	    },
	renderYYMMDDHHMMSSDate: (year, month, day, hour, min, sec) => {
		let date = new Date();
		let ryear = year || date.getFullYear();
		let rmonth = month || date.getMonth();
		let rday = day || date.getDay();
		let rhour = hour || date.getHours();
		let rmin = min || date.getMinutes();
		let rsec = sec || date.getSeconds();
		return new Date(ryear, rmonth, rday, rhour, rmin, rsec).toISOString().replace(/T/, ' ').replace(/\..+/, '');
	    }
    };
