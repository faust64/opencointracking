const logger = require('wraplog')('currencies-index');
const schedule = require('node-schedule');

module.exports = (db) => {
	this._currencies = [];
	const refreshCurrencies = () => {
		db.read("SELECT * FROM currencies")
		    .then((last) => {
			    let newCurrencies = [];
			    for (let i = 0; i < last.length; i++) {
				newCurrencies.push({ id: last[i].id, tag: last[i].tag, name: last[i].name, symbol: last[i].symbol, usdrate: last[i].usdrate, eurrate: last[i].eurrate, isfiat: last[i].isfiat === 1 });
			    }
			    self._currencies = newCurrencies;
			    logger.info('loaded ' + self._currencies.length + ' currencies');
			})
		    .catch((e) => {
			    logger.error('failed loading currencies');
			    logger.error(e);
			});
	    };
	let self = this;

	schedule.scheduleJob('*/20 * * * *', refreshCurrencies);

	return {
		getCurrencies: () => {
			return self._currencies;
		    },
		getCurrency: (id) => {
			for (let i = 0; i < self._currencies.length; i++) {
			    if (self._currencies[i].id === id) {
				return self._currencies[i];
			    }
			}
			return null;
		    },
		getCurrencyAt: (id) => {
			return self._currencies[id] || null;
		    },
		getIndex: (tag) => {
			for (let i = 0; i < self._currencies.length; i++) {
			    if (self._currencies[i].tag === tag) {
				return self._currencies[i].id;
			    }
			}
			return null;
		    },
		refreshCurrencies: () => {
			return refreshCurrencies();
		    }
	    };
    };
