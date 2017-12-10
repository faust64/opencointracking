const cryptoChecker = require('../lib/crypto-checker.js');
const fiatChecker = require('../lib/fiat-checker.js');
const helpers = require('../lib/helpers.js');
const reduceRecords = require('../lib/reduce.js');
const schedule = require('node-schedule');

schedule.scheduleJob('0 * * * *', () => {
	fiatChecker.refresh(helpers.approximateTime('hour'));
    });

schedule.scheduleJob('*/5 * * * *', () => {
	cryptoChecker.refresh(helpers.approximateTime('minute'));
    });

schedule.scheduleJob('42 12 8,18,28 * *', () => {
	reduceRecords.dropOldPoints();
    });
