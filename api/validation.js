const Joi = require('joi');
const Promise = require('bluebird');
const logger = require('wraplog')('command-validation');
const helpers = require('../lib/helpers.js');

const isAmountNumeric = Joi.number().min(0.00000001);
const isAmountString = Joi.string().min(1).regex(/^(?:\+)[0-9]*\.*[0-9]*$/);
const is2FACode = Joi.string().regex(/^[0-9]+$/);
const isEmail = Joi.string().email();
const isExchangeOp = Joi.any().valid('Deposit', 'Income', 'Mining', 'Gifted', 'Withdrawal', 'Spend', 'Donation', 'Gift', 'Transfert');
const isExportFormat = Joi.any().valid('pdf', 'csv');
const isGraphFilter = Joi.any().valid('all', 'crypto', 'fiat');
const isGraphInterval = Joi.any().valid('14d', '30d', '90d', '365d', 'all');
const isLimitNumeric = Joi.number().integer();
const isLimitString = Joi.any().valid('0', '25', '50', '100', '100', '500', '1000');
const isMagic = Joi.any().valid('mintberrycrunch');
const isNumericId = Joi.number().integer().min(1);
const isOffset = Joi.number().integer().min(0);
const isPassword = Joi.string().min(6);
const isSingleOp = Joi.any().valid('Stolen', 'Lost');
const isStringId = Joi.string().min(1).regex(/^[0-9]*$/);
const isTimestampNumeric = Joi.number().min(0);
const isTimestampString = Joi.string().min(1).regex(/^(?:\+)[0-9]*$/);
const isTradeOp = Joi.any().valid('Trade');
const isTrendInterval = Joi.any().valid('1h', '24h', '7d', '30d');
const isUndefined = Joi.any();
const isUnset = Joi.string().allow('');
const isUriString = Joi.string().regex(/^\/.*/);
const isUsername = Joi.string().regex(/^[a-zA-Z0-9-_]+$/);
let cryptoCurrencies = [], fiatCurrencies = [], tzdata = [],
    cryptoRegexp = '', fiatRegexp = '', tzRegexp = '';

for (let i = 0; i < helpers.genericTimeZones().length; i++) {
    let item = helpers.genericTimeZones()[i];
    tzdata.push(item.value);
}
tzRegexp = "^(" + tzdata.join('|') + ")$";
const isAmount = Joi.alternatives().try(isAmountNumeric, isAmountString, isUnset);
const isDBId = Joi.alternatives().try(isStringId, isNumericId);
const isLimit = Joi.alternatives().try(isLimitNumeric, isLimitString);
const isTimeZone = Joi.string().regex(new RegExp(tzRegexp));
const isTrade = Joi.alternatives().try(isTradeOp, isExchangeOp, isSingleOp);
const isTradeTime = Joi.alternatives().try(isTimestampNumeric, isTimestampString);

/*
const is2FAConfirmation = Joi.string().regex(/^[0-9a-f]+$/);
const isBool = Joi.boolean();
*/

module.exports = ((currencies) => {
	logger.info('found ' + currencies.getCurrencies().length + ' currencies initializing input validation');
	for (let i = 0; i < currencies.getCurrencies().length; i++) {
	    let item = currencies.getCurrencies()[i];
	    if (item.isfiat === false) {
		logger.debug('got crypto ' + item.tag);
		cryptoCurrencies.push(item.tag)
	    } else {
		logger.debug('got fiat ' + item.tag);
		fiatCurrencies.push(item.tag)
	    }
	}
	cryptoRegexp = "^(" + cryptoCurrencies.join('|') + ")$";
	fiatRegexp = "^(" + fiatCurrencies.join('|') + ")$";
	const isCryptoCurrency = Joi.string().regex(new RegExp(cryptoRegexp));
	const isFiatCurrency = Joi.string().regex(new RegExp(fiatRegexp));
	const isCurrency = Joi.alternatives().try(isFiatCurrency, isCryptoCurrency);

	const validRequests = {
		'calculator': { coin: isCurrency, dest: isCurrency },
		'coincharts': { coin: isCryptoCurrency },
		'confirm-2fa': { confirm2fa: is2FACode },
		'confirm-email': Joi.alternatives().try(Joi.object({ }),
						        Joi.object({ forceResend: isMagic })),
		'confirm-email-post': { confirmEmail: is2FACode },
		'dashboard': { },
		'dropcoins': { tradeId: isNumericId },
		'loginget': { },
		'loginpost': { username: isUsername, password: isPassword },
		'loginpost2fa': { username: isUsername, password: isPassword, twofa: is2FACode },
		'post-coins': Joi.alternatives().try(Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, comment: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, comment: isUnset, groups: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, comment: isUnset, groups: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, comment: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, groups: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, groups: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency, wallet: isUnset }),
						    Joi.object({ operation: isTradeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, paid: isAmount, paidcurrency: isCurrency }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, comment: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, comment: isUnset, groups: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, comment: isUnset, groups: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, comment: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, groups: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, groups: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, wallet: isUnset }),
						    Joi.object({ operation: isExchangeOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, feed: isAmount, feedcurrency: isCurrency, }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, comment: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, comment: isUnset, groups: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, comment: isUnset, groups: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, comment: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, groups: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, groups: isUnset, wallet: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency, wallet: isUnset }),
						    Joi.object({ operation: isSingleOp, timestamp: isTradeTime, value: isAmount, currency: isCurrency })),
		'registerget': { },
		'registerpost': Joi.alternatives().try(Joi.object({ username: isUsername, password: isPassword, passwordConfirm: isPassword, email: isEmail }),
						    Joi.object({ username: isUsername, password: isPassword, passwordConfirm: isPassword })),
		'set-display-currency': { displayCurrency: isOffset, retTo: isUriString },
		'set-graph-filter': { filter: isGraphFilter, retTo: isUriString },
		'set-graph-scale': { scale: isGraphInterval, retTo: isUriString },
		'set-page-limit': { pageLimit: isLimit, retTo: isUriString },
		'set-trend-interval': { interval: isTrendInterval, retTo: isUriString },
		'set-timezone': { tzName: isTimeZone, retTo: isUriString },
		'settings': { },
		'trades': Joi.alternatives().try(Joi.object({ }),
						    Joi.object({ exportFmt: isExportFormat }),
						    Joi.object({ offset: isOffset }),
						    Joi.object({ limit: isLimit, offset: isOffset }),
						    Joi.object({ limit: isLimit })),
		'update-password': { oldPassword: isPassword, newPassword: isPassword, confirmPassword: isPassword }
	    };

	return {
		cmdValidation: (req, res, routeId, skipSession) => {
			return new Promise((resolve, reject) => {
				let params = Object.assign(req.params, req.body, req.query);

				let schema = validRequests[routeId] || { everyoneknows: Joi.string().regex(/^itsbutters$/) };
				if (process.env.DEBUG) {
				    logger.info('validating request on ' + req.path);
				    logger.info(params);
				}
				if (skipSession !== true) {
				    if (req.session.userid === undefined) { reject({ code: 401, msg: 'missing session' }); }
				}

				Joi.validate(params, schema, { abortEarly: true, presence: 'required' }, (err, val) => {
					params.actualHost = req.headers.host;
					params.actualIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
					if (err) { reject(err); }
					else { resolve(params); }
				    });
			    });
		    }
	    };
    });
