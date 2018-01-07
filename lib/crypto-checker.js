const Promise = require('bluebird');
const db = require('./whateverql.js')();
const request = require('request');
const requestAsync = Promise.promisify(request);
const logger = require('wraplog')('crypto-checker');

const backcrawlFrom = 'https://min-api.cryptocompare.com/data/pricehistorical?';

module.exports = {
	getDay: (year, month, day, currency) => {
		let timestamp = Math.round(new Date(year, month - 1, day, 0, 0, 0, 0).getTime() / 1000);
		let leftName = '', btcId = eurId = usdId = 0;
		db.read(`SELECT id, tag, name FROM currencies WHERE id = ${currency} OR tag = 'EUR' OR tag = 'USD' OR tag = 'BTC'`)
		    .then((currencies) => {
			    if (currencies !== undefined) {
				for (let i = 0; i < currencies.length; i++) {
				    if (currencies[i].tag === 'BTC') { btcId = currencies[i].id; }
				    else if (currencies[i].tag === 'USD') { usdId = currencies[i].id; }
				    else if (currencies[i].tag === 'EUR') { eurId = currencies[i].id; }
				    if (currencies[i].id === currency) { leftName = currencies[i].tag; }
				}
			    }
			    if (leftName === '' || btcId === 0 || eurId === 0 || usdId === 0) { throw new Error('requested currencies not found in DB'); }
			    let btcRate = usdRate = eurRate = 1, cap = trend = 0;
			    logger.debug(`backcrawling ${leftName} rates on ${timestamp} (${year}/${month}/${day}`);
			    return requestAsync({ url: `${backcrawlFrom}fsym=${leftName}&tsyms=BTC,USD,EUR&ts=${timestamp}` })
				.then((resp) => {
					logger.debug(resp);
					if (resp.body !== undefined) {
					    let body = JSON.parse(resp.body);
					    for (key in body) {
						if (key === leftName) {
						    for (dkey in body[key]) {
							if (dkey === 'BTC') {
							    btcRate = body[key][dkey];
							} else if (dkey === 'USD') {
							    usdRate = body[key][dkey];
							} else if (dkey === 'EUR') {
							    eurRate = body[key][dkey];
							}
						    }
						}
					    }
					}
					if ((btcRate === 1 && usdRate === 1) || (btcRate === 1 && eurRate === 1) || (usdRate === 1 && eurRate === 1)) {
					    throw new Error('something looks wrong in response ...');
					}
					logger.debug(`currency ${leftName} to EUR/USD/BTC => ${eurRate}/${usdRate}/${btcRate} on ${timestamp}`);
					return db.write(`INSERT INTO rates VALUES (${currency}, ${btcRate}, ${usdRate}, ${eurRate}, ${timestamp})`);
				    })
				.then(() => { logger.info(`added ${leftName} rates on ${timestamp} (${year}/${month}/${day})`); })
				.catch((e) => {
					logger.error(`failed crawling ${leftName} to EUR/USD/BTC => ${eurRate}/${usdRate}/${btcRate} on ${timestamp}`);
					logger.error(e);
				    });
			})
		    .catch((e) => {
			    logger.error(`failed backcrawling CRYPTO ${currency}`);
			    logger.error(e);
			});
	    },
	refresh: (mark) => {
		let usdRate, eurRate, btcRate, curId, timestamp, volume24, cap;
		if (mark !== undefined) { timestamp = mark; }
		else { timestamp = Math.round(Date.now() / 1000); }
		db.read("SELECT id, name FROM currencies WHERE isfiat = 0")
		    .then((currencies) => {
			    let tasks = [];
			    for (let i = 0; i < currencies.length; i++) {
				let name = currencies[i].name;
				tasks.push(new Promise((resolve, reject) => {
					logger.info(`processing CRYPTO rates from coinmarketcap.com - base: ${name}`);
					requestAsync({ url: "https://api.coinmarketcap.com/v1/ticker/" + name + "/?convert=EUR" })
					    .then((resp) => {
						    let rslt = JSON.parse(resp.body);
						    curId = currencies[i].id;
						    btcRate = rslt[0].price_btc;
						    eurRate = rslt[0].price_eur;
						    usdRate = rslt[0].price_usd;
						    cap = rslt[0].market_cap_eur;
						    volume24 = rslt[0]['24h_volume_eur'];
						    return db.write(`INSERT INTO rates VALUES (${curId}, ${btcRate}, ${usdRate}, ${eurRate}, ${timestamp})`);
						})
					    .then(() => {
						    return db.write(`UPDATE currencies SET usdrate = ${usdRate}, eurrate = ${eurRate}, eurcap = ${cap}, eurvolume24 = ${volume24} WHERE id = ${curId}`);
						})
					    .then(() => {
						    logger.info(`done processing CRYPTO rates from coinmarketcap.com - base: ${name}`);
						    resolve(true);
						})
					    .catch((e) => {
						    logger.error(`Failed querying coinmarketcap for ${name} rates`);
						    logger.error(e);
						    resolve(false);
						});
				    }));
			    }
			    Promise.all(tasks)
				.then(() => {
					logger.info(`done refreshing CRYPTO ${timestamp}`);
				    })
				.catch((e) => {
					logger.error(`failed refreshing CRYPTO ${timestamp}`);
					logger.error(e);
				    });
			})
		    .catch((e) => {
			    logger.error('failed querying database');
			    logger.error(e);
			});
	    }
    };
