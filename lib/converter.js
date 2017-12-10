const Promise = require('bluebird');
const helpers = require('./helpers.js');
const logger = require('../lib/logger.js')('currency-conversion');
const pf = require('parse-to-float');

module.exports = ((db) => {
	return {
		getAt: (value, sourceId, destId, time) => {
			return new Promise((resolve, reject) => {
				let rates = { leftB: 0, rightB: 0, leftE: 0, rightE: 0, leftU: 0, rightU: 0 };
				db.read(`SELECT * FROM rates WHERE id = ${sourceId} AND timestamp >= ${time} ORDER BY timestamp ASC LIMIT 1`)
				    .then((srcRate) => {
					    if (srcRate[0] !== undefined && srcRate[0].btcrate !== undefined) {
						rates.leftB = srcRate[0].btcrate;
						rates.leftE = srcRate[0].eurrate;
						rates.leftU = srcRate[0].usdrate;
					    } else { return db.read(`SELECT * FROM rates WHERE id = ${sourceId} ORDER BY timestamp DESC LIMIT 1`); }
					    return [];
					})
				    .then((srcRate) => {
					    if (srcRate[0] !== undefined && srcRate[0].btcrate !== undefined) {
						rates.leftB = srcRate[0].btcrate;
						rates.leftE = srcRate[0].eurrate;
						rates.leftU = srcRate[0].usdrate;
					    }
					    return db.read(`SELECT * FROM rates WHERE id = ${destId} AND timestamp >= ${time} ORDER BY timestamp ASC LIMIT 1`)
					})
				    .then((dstRate) => {
					    if (dstRate[0] !== undefined && dstRate[0].btcrate !== undefined) {
						rates.rightB = dstRate[0].btcrate;
						rates.rightE = dstRate[0].eurrate;
						rates.rightU = dstRate[0].usdrate;
					    } else { return db.read(`SELECT * FROM rates WHERE id = ${destId} ORDER BY timestamp DESC LIMIT 1`); }
					    return [];
					})
				    .then((dstRate) => {
					    if (dstRate[0] !== undefined && dstRate[0].btcrate !== undefined) {
						rates.rightB = dstRate[0].btcrate;
						rates.rightE = dstRate[0].eurrate;
						rates.rightU = dstRate[0].usdrate;
					    }
					    if (rates.rightB !== 0 && rates.leftB !== 0) {
						logger.debug(`converting value (BTC) with source rate ${rates.leftB} and dest rate ${rates.rightB} around ${time}`);
						resolve(pf(value * rates.leftB / rates.rightB, 8));
					    } else if (rates.rightE !== 0 && rates.leftE !== 0) {
						logger.debug(`converting value (EUR) with source rate ${rates.leftE} and dest rate ${rates.rightE} around ${time}`);
						resolve(pf(value * rates.leftE / rates.rightE, 8));
					    } else if (rates.rightU !== 0 && rates.leftU !== 0) {
						logger.debug(`converting value (USD) with source rate ${rates.leftU} and dest rate ${rates.rightU} around ${time}`);
						resolve(pf(value * rates.leftU / rates.rightU, 8));
					    } else {
						logger.error(`failed converting with input ${value} / ${sourceId} / ${destId} / ${time}`);
						logger.error("missing DB records?");
						reject();
					    }
					})
				    .catch((e) => {
					    logger.error(`failed converting with input ${value} / ${sourceId} / ${destId} / ${time}`);
					    logger.error(e);
					    reject();
					});
			    });
		    },
		getLast: (value, sourceId, destId) => {
			return new Promise((resolve, reject) => {
				let rates = { leftB: 0, rightB: 0, leftE: 0, rightE: 0, leftU: 0, rightU: 0 };
				db.read(`SELECT * FROM rates WHERE id = ${sourceId} ORDER BY timestamp DESC LIMIT 1`)
				    .then((srcRate) => {
					    if (srcRate[0] !== undefined && srcRate[0].btcrate !== undefined) {
						rates.leftB = srcRate[0].btcrate;
						rates.leftE = srcRate[0].eurrate;
						rates.leftU = srcRate[0].usdrate;
					    }
					    return db.read(`SELECT * FROM rates WHERE id = ${destId} ORDER BY timestamp DESC LIMIT 1`)
					})
				    .then((dstRate) => {
					    if (dstRate[0] !== undefined && dstRate[0].btcrate !== undefined) {
						rates.rightB = dstRate[0].btcrate;
						rates.rightE = dstRate[0].eurrate;
						rates.rightU = dstRate[0].usdrate;
					    }
					    if (rates.rightB !== 0 && rates.leftB !== 0) {
						logger.debug(`converting value (BTC) with source rate ${rates.leftB} and dest rate ${rates.rightB}`);
						resolve(pf(value * rates.leftB / rates.rightB, 8));
					    } else if (rates.rightE !== 0 && rates.leftE !== 0) {
						logger.debug(`converting value (EUR) with source rate ${rates.leftE} and dest rate ${rates.rightE}`);
						resolve(pf(value * rates.leftE / rates.rightE, 8));
					    } else if (rates.rightU !== 0 && rates.leftU !== 0) {
						logger.debug(`converting value (USD) with source rate ${rates.leftU} and dest rate ${rates.rightU}`);
						resolve(pf(value * rates.leftU / rates.rightU, 8));
					    } else {
						logger.error(`failed converting with input ${value} / ${sourceId} / ${destId}`);
						logger.error("missing DB records?");
						reject();
					    }
					})
				    .catch((e) => {
					    logger.error(`failed converting with input ${value} / ${sourceId} / ${destId}`);
					    logger.error(e);
					    reject();
					});
			    });
		    },
		getTrend: (curId, interval) => {
			return new Promise((resolve, reject) => {
				let trends = { leftB: 0, rightB: 0, leftE: 0, rightE: 0, leftU: 0, rightU: 0 };
				db.read(`SELECT * FROM rates WHERE id = ${curId} ORDER BY timestamp DESC LIMIT 1`)
				    .then((srcRate) => {
					    if (srcRate[0] !== undefined && srcRate[0].btcrate !== undefined) {
						trends.leftB = srcRate[0].btcrate;
						trends.leftE = srcRate[0].eurrate;
						trends.leftU = srcRate[0].usdrate;
					    }
					    return db.read(`SELECT * FROM rates WHERE id = ${curId} AND timestamp < ` + helpers.approximateLast(interval) + " ORDER BY timestamp DESC LIMIT 1")
					})
				    .then((dstRate) => {
					    if (dstRate[0] !== undefined && dstRate[0].btcrate !== undefined) {
						trends.rightB = dstRate[0].btcrate;
						trends.rightE = dstRate[0].eurrate;
						trends.rightU = dstRate[0].usdrate;
					    }
					    if (trends.rightB !== 0 && trends.leftB !== 0) {
						resolve(trends);
					    } else if (trends.rightE !== 0 && trends.leftE !== 0) {
						resolve(trends);
					    } else if (trends.rightU !== 0 && trends.leftU !== 0) {
						resolve(trends);
					    } else {
						logger.error(`failed resolving trend with input ${curId} / ${interval}`);
						logger.error("missing DB records?");
						reject();
					    }
					})
				    .catch((e) => {
					    logger.error(`failed resolving trend with input ${curId} / ${interval}`);
					    logger.error(e);
					    reject();
					});
			    });
		    }
	    };
    });
