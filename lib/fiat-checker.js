const Promise = require('bluebird');
const config = require('../config.js');
const db = require('someql')(config.db);
const request = require('request');
const requestAsync = Promise.promisify(request);
const logger = require('wraplog')('fiat-checker');

module.exports = {
	backcrawl: function(date) {
		requestAsync({ url: 'https://api.fixer.io/' + date })
		    //FIXME
	    },
	refresh: function(mark) {
		let usdRate, eurRate, curId, timestamp;
		if (mark !== undefined) { timestamp = mark; }
		else { timestamp = Math.round(Date.now() / 1000); }
		requestAsync({ url: 'https://api.fixer.io/latest' })
		    .then((resp) => {
			    let list = JSON.parse(resp.body);
			    let base = list.base;
			    let tasks = [];
			    logger.info(`processing FIAT rates from fixer.io - base: ${base}`);
			    tasks.push(new Promise((resolve, reject) => {
					db.read(`SELECT id FROM currencies WHERE tag = "${base}"`)
					    .then((r) => {
						    if (r.length > 0) {
							let curId = r[0].id, eurRate, usdRate;
							if (base === 'EUR') {
							    eurRate = 1
							    usdRate = list.rates['USD'];
							} else if (base === 'GBP') {
							    let gbpRate = list.rates[k];
							    eurRate = list.rates['EUR'];
							    usdRate = list.rates['USD'];
							} else {
							    usdRate = 1;
							    eurRate = list.rates['EUR'];
							}
							db.write(`INSERT INTO rates VALUES (${curId}, 0, ${usdRate}, ${eurRate}, ${timestamp})`)
							    .then(() => {
								    return db.write(`UPDATE currencies SET usdrate = ${usdRate}, eurrate = ${eurRate} where id = ${curId}`);
								})
							    .then(() => {
								    logger.info(`done processing FIAT rates from fixer.io - base: ${base}`);
								    resolve(true);
								})
							    .catch((e) => {
								    logger.error('failed updating DB');
								    logger.error(e);
								    reject('failed updating DB');
								});
						    } else { reject('reference missing'); }
						})
					    .catch((e) => {
						    logger.error('failed querying database');
						    logger.error(e);
						    reject('failed querying database');
						});
				    }));
			    Object.keys(list.rates).forEach((k) => {
				    tasks.push(new Promise((resolve, reject) => {
						db.read(`SELECT id FROM currencies WHERE tag = "${k}"`)
							.then((r) => {
								if (base === 'EUR') {
								    eurRate = list.rates[k];
								    usdRate = parseFloat(eurRate * list.rates['USD']).toPrecision(6);
								} else if (base === 'GBP') {
								    let gbpRate = list.rates[k];
								    eurRate = parseFloat(gbpRate * list.rates['EUR']).toPrecision(6);
								    usdRate = parseFloat(gbpRate * list.rates['USD']).toPrecision(6);
								} else {
								    usdRate = list.rates[k];
								    eurRate = parseFloat(usdRate * list.rates['EUR']).toPrecision(6);
								}
								if (r.length > 0) {
								    let curId = r[0].id;
								    db.write(`INSERT INTO rates VALUES (${curId}, 0, ${usdRate}, ${eurRate}, ${timestamp})`)
									.then(() => {
										return db.write(`UPDATE currencies SET usdrate = ${usdRate}, eurrate = ${eurRate} where id = ${curId}`);
									    })
									.then(() => {
										logger.info(`done processing FIAT rates from fixer.io - currency: ${k}`);
										resolve(true);
									    })
									.catch((e) => {
										logger.error('failed updating DB');
										logger.error(e);
										reject('failed updating DB');
									    });
								} else {
								    logger.info(`ignoring refresh for ${k}`);
								    resolve(true);
								}
							    })
							.catch((e) => {
								logger.error('failed querying database');
								logger.error(e);
								reject('failed querying database');
							    });
					}));
				});
			    Promise.all(tasks)
				.then(() => {
					logger.info(`done refreshing FIAT ${timestamp}`);
				    })
				.catch((e) => {
					logger.error(`failed refreshing FIAT ${timestamp}`);
					logger.error(e);
				    });
			})
		    .catch((e) => {
			    logger.error('failed querying fixer.io');
			    logger.error(e);
			});
	    }
    };
