const Promise = require('bluebird');
const db = require('./whateverql.js')();
const logger = require('./logger.js')('reduce-records');

module.exports = {
	listOldPoints: (someid) => {
		    let current = Math.round(new Date().getTime() / 1000);
		    let downLimit = current - (31 * 86400);
		    let upLimit = current - (15 * 86400);
		    db.read(someid !== undefined ? `SELECT id FROM currencies WHERE ID = ${someid} AND isfiat = 0` : `SELECT id FROM currencies WHERE isfiat = 0`)
			.then((currencies) => {
				let async = [];
				for (let i = 0; i < currencies.length; i++) {
				    async.push(new Promise((resolve, reject) => {
						db.read(`SELECT * FROM rates WHERE id = ${currencies[i].id} AND timestamp > ${downLimit} AND timestamp < ${upLimit} ORDER BY timestamp ASC`, 'none')
						    .then((records) => {
							    let lastDrop = downLimit + 1, tasks = [];
							    let processDate = maxusdrate = maxeurrate = maxbtcrate = 0;
							    logger.info(`found ${records.length} entries for currency ${currencies[i].id}`);
							    for (let k = 0; k < records.length; k++) {
								let isDate = new Date(records[k].timestamp * 1000);
								if (processDate === 0) { processDate = isDate; }
								if (processDate.getFullYear() !== isDate.getFullYear() ||
								    processDate.getMonth() !== isDate.getMonth() ||
								    processDate.getDate() !== isDate.getDate()) {
									let lastStamp = records[k - 1].timestamp + 1;
									logger.info(`DELETE FROM rates WHERE id = ${currencies[i].id} AND timestamp < ${lastStamp} AND timestamp > ${lastDrop}`)
									logger.info(`INSERT INTO rates VALUES (${currencies[i].id}, ${maxbtcrate}, ${maxusdrate}, ${maxeurrate}, ${lastStamp})`);
									processDate = isDate;
									lastDrop = lastStamp;
									maxbtcrate = maxusdrate = maxeurrate = 0;
								}
								if (records[k].usdrate > maxusdrate) { maxusdrate = records[k].usdrate; }
								if (records[k].eurrate > maxeurrate) { maxeurrate = records[k].eurrate; }
								if (records[k].btcrate > maxbtcrate) { maxbtcrate = records[k].btcrate; }
							    }
							    return Promise.all(tasks);
							})
						    .then(() => {
							    logger.info(`done processing currency ${currencies[i].id} ${i}`);
							    resolve(true);
							})
						    .catch((e) => {
							    logger.error(`failed processing ${currencies[i].id}`);
							    logger.error(e);
							    reject(e);
							});
					}));
				}
				return Promise.all(async);
			    })
			.then(() => {
				logger.info(`done reducing ${downLimit}-${upLimit}`);
			    })
			.catch((e) => {
				logger.error(`failed reducing ${downLimit}-${upLimit}`);
			    });
	    },
	dropOldPoints: (someid) => {
		    let current = Math.round(new Date().getTime() / 1000);
		    let downLimit = current - (31 * 86400);
		    let upLimit = current - (15 * 86400);
		    db.read(someid !== undefined ? `SELECT id FROM currencies WHERE ID = ${someid} AND isfiat = 0` : `SELECT id FROM currencies WHERE isfiat = 0`)
			.then((currencies) => {
				let async = [];
				for (let i = 0; i < currencies.length; i++) {
				    async.push(new Promise ((resolve, reject) => {
						db.read(`SELECT * FROM rates WHERE id = ${currencies[i].id} AND timestamp > ${downLimit} AND timestamp < ${upLimit} ORDER BY timestamp ASC`, 'none')
						    .then((records) => {
							    let lastDrop = downLimit + 1, tasks = [];
							    let processDate = maxusdrate = maxeurrate = maxbtcrate = 0;
							    for (let k = 0; k < records.length; k++) {
								let isDate = new Date(records[k].timestamp * 1000);
								if (processDate === 0) { processDate = isDate; }
								if (processDate.getFullYear() !== isDate.getFullYear() ||
								    processDate.getMonth() !== isDate.getMonth() ||
								    processDate.getDate() !== isDate.getDate()) {
									let lastStamp = records[k - 1].timestamp + 1;
									tasks.push(new Promise ((res, rej) => {
										    let myid = currencies[i].id, mybtcrate = maxbtcrate, myusdrate = maxusdrate, myeurrate = maxeurrate, mystamp = lastStamp, ndate = processDate;
										    db.write(`DELETE FROM rates WHERE id = ${myid} AND timestamp < ${lastStamp} AND timestamp > ${lastDrop}`)
											.then(() => db.write(`INSERT INTO rates VALUES (${myid}, ${mybtcrate}, ${myusdrate}, ${myeurrate}, ${lastStamp})`))
											.then(() => {
												logger.info(ndate.getFullYear()+'/'+(ndate.getMonth()+1)+'/'+ndate.getDate(), 'reduced to', mybtcrate, myusdrate, myeurrate, lastStamp);
												res(true);
											    })
											.catch((e) => {
												logger.error('failed', ndate.getFullYear()+'/'+(ndate.getMonth()+1)+'/'+ndate.getDate(), 'with', mybtcrate, myusdrate, myeurrate, lastStamp);
												logger.error(e);
												rej(e);
											    });
									    }));
									processDate = isDate;
									lastDrop = lastStamp;
									maxbtcrate = maxusdrate = maxeurrate = 0;
								}
								if (records[k].usdrate > maxusdrate) { maxusdrate = records[k].usdrate; }
								if (records[k].eurrate > maxeurrate) { maxeurrate = records[k].eurrate; }
								if (records[k].btcrate > maxbtcrate) { maxbtcrate = records[k].btcrate; }
							    }
							    return Promise.all(tasks);
							})
						    .then(() => {
							    logger.info(`done processing currency ${currencies[i].id}`);
							    resolve(true);
							})
						    .catch((e) => {
							    logger.error(`failed processing ${currencies[i].id}`);
							    logger.error(e);
							    reject(e);
							});
					}));
				}
				return Promise.all(async);
			    })
			.then(() => {
				logger.info(`done reducing ${downLimit}-${upLimit}`);
			    })
			.catch((e) => {
				logger.error(`failed reducing ${downLimit}-${upLimit}`);
			    });
	    }
    };
