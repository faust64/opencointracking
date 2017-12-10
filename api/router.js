const Mustache = require('mustache');
const Promise = require('bluebird');
const balances = require('../lib/balances.js');
const crypto = require('crypto');
const fs = require('fs');
const helpers = require('../lib/helpers.js');
const pf = require('parse-to-float');
const pdf = require('nodepdf'); //FIXME: ain't that dirty?
const pdfPath = process.env.PDFGEN_DIR || './tmp';
const pmxProbe = require('pmx').probe();

const getProbe = pmxProbe.meter({ name: 'GET per minute', sample: 60 });
const postProbe = pmxProbe.meter({ name: 'POST per minute', sample: 60 });
let tag = 'alpha', templates = [];

module.exports = (app, db, currencies, logger) => {
	this._check = require('./validation.js')(currencies);
	this._convert = require('../lib/converter.js')(db);
	let self = this;
	if (fs.exists('./revision')) {
	    try { tag = fs.readFileSync('./revision'); }
	    catch (e) { logger.info('failed reading revision, assuming alpha'); tag = 'alpha'; }
	}
	try { helpers.loadDirectory('./templates', templates); }
	catch (e) { logger.error('failed loading templates - browser accesses denied'); }

	const logError = (msg, e) => {
		logger.error(msg);
		if (e !== undefined) {
		    logger.error(e);
		}
	    };
	const servePage = (handler, page, substs, code) => {
		let returnCode = code || 200;
		let substitutions = substs || {};
		let template = page || 'teaser';
		let output;
		try { output = Mustache.render(templates[page], substitutions); }
		catch(e) {
		    if (e.code !== undefined) {
			substitutions.errorCode = e.code;
			substitutions.trace = e.msg || '';
		    } else {
			substitutions.errorCode = 500;
			substitutions.trace = e.toString();
		    }
		    returnCode = substitutions.errorCode;
		    logError('rendering error', e);
		    output = Mustache.render(templates['error'], substitutions);
		}
		if (returnCode !== 200) { handler.status(returnCode).send(output); }
		else { handler.send(output); }
	    };
	const servePdf = (handler, page, substs) => {
		let returnCode = 200;
		let substitutions = substs || {};
		let template = page || 'teaser';
		let output, doc;
		try {
		    output = Mustache.render(templates[page], substitutions);
		    doc = new pdf(null, `${pdfPath}/${page}.pdf`, {
				'content': output,
				'viewportSize': { 'width': 2880, 'height': 1440 },
				'paperSize': {
					'pageFormat': 'A4',
					'orientation': 'portrait',
					'margin': { 'top': '2cm' },
					'header': { 'height': '1cm', 'contents': 'HEADER {currentPage} / {pages}' },
					'footer': { 'height': '2cm', 'contents': 'FOOTER {currentPage} / {pages}' },
				    },
				'outputQuality': '98'
			    });
		} catch (e) {
		    if (e.code !== undefined) {
			substitutions.errorCode = e.code;
			substitutions.trace = e.msg || '';
		    } else {
			substitutions.errorCode = 500;
			substitutions.trace = e.toString();
		    }
		    returnCode = substitutions.errorCode;
		    logError('rendering error', e);
		    output = Mustache.render(templates['error'], substitutions);
		}
		if (returnCode !== 200) { handler.status(returnCode).send(output); }
		else {
		    doc.on('error', (e) => {
			    substitutions.errorCode = 500;
			    substitutions.trace = e.toString();
			    logError('rendering error', e);
			    output = Mustache.render(templates['error'], substitutions);
			    handler.status(500).send(output);
			});
		    doc.on('done', (outputFile) => {
			    try {
				let buffer = fs.readFileSync(outputFile);
				fs.unlinkSync(outputFile);
				handler.setHeader('Content-disposition', `attachment; filename=${page}.pdf`);
				handler.setHeader('Content-type', 'application/pdf');
				handler.send(buffer);
			    } catch (e) {
				substitutions.errorCode = 500;
				substitutions.trace = e.toString();
				logError('rendering error', e);
				output = Mustache.render(templates['error'], substitutions);
				handler.status(500).send(output);
			    }
			});
		}
	    };
	const serverError = (res, opts, e) => {
		logger.error(e);
		if (e.code !== undefined) {
		    if (e.msg === 'missing session') { res.redirect('/login'); return; }
		    opts.errorCode = e.code;
		    opts.trace = e.msg || '';
		} else { opts.errorCode = 500; opts.trace = e.toString(); }
		servePage(res, 'error', opts);
	    };

	app.get('/', (req, res) => {
		getProbe.mark();
		res.redirect('/dashboard');
	    });
	app.get('/ping', (req, res) => {
		getProbe.mark();
		res.send('OK');
	    });

	app.get('/balancebycurrency', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Balance By Currency', preferredCurrencyIndex: 1, balances: [], currencies: [] };
		let data = [], timeflt = 'month', btcIndex = 0, cprecision = 8;
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.read(`SELECT preferredcurrency, timezone FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				opts.preferredTimeZone = userPrefs[0].timezone;
			    }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === 'BTC') { btcIndex = item.id; }
				if (item.id === opts.preferredCurrencyIndex) {
				    opts.preferredCurrency = item.tag;
				    opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				    if (item.isfiat === true) { cprecision = 2; }
				} else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp DESC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [], k;
			    for (let i = 0; i < userTrades.length; i++) {
				if (userTrades[i].type === 'Withdrawal' || userTrades[i].type === 'Deposit') { continue; }
				let leftC = rightC = left = right = 0;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				if (left !== '' && left !== 0 && leftC !== 0) {
				    for (k = 0; k < data.length; k++) { if (data[k].curid === leftC) { break ; } }
				    let addobj = { time: userTrades[i].timestamp, type: 'buy', value: left };
				    if (k === data.length) { data.push({ curid: leftC, ops: [ addobj ] }); }
				    else { data[k].ops.push(addobj); }
				}
				if (right !== '' && right !== 0 && rightC !== 0) {
				    for (k = 0; k < data.length; k++) { if (data[k].curid === rightC) { break ; } }
				    let addobj = { time: userTrades[i].timestamp, type: 'sell', value: right };
				    if (k === data.length) { data.push({ curid: rightC, ops: [ addobj ] }); }
				    else { data[k].ops.push(addobj); }
				}
			    }
			    for (let i = 0; i < data.length; i++) {
				for (k = 0; k < data[i].ops.length; k++) {
				    let update = data[i].ops[k];
				    if (data[i].curid !== opts.preferredCurrencyIndex) {
					async.push(this._convert.getAt(update.value, data[i].curid, opts.preferredCurrencyIndex, update.time)
						    .then((price) => { update.custvalue = pf(price, 8); })
						    .catch((e) => { logError('failed processing some currency', e); }));
				    } else { update.custvalue = update.value; }
				}
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [], cyear = cmonth = cday = boughtcust = soldcust = bought = sold = tx = rx = 0, oddeven;
			    for (let i = 0; i < data.length; i++) {
				graphDate = graphStamp = cyear = cmonth = cday = tx = rx = 0;
				let item = currencies.getCurrency(data[i].curid);
				opts.balances.push({ name: helpers.capitalize(item.name), tag: item.tag, groupped: [] });
				let buys = [], sells = [];
				let update = opts.balances[opts.balances.length - 1];
				for (let k = 0; k < data[i].ops.length; k++) {
				    let current = new Date(data[i].ops[k].time * 1000);
				    if (current.getFullYear() !== cyear || (timeflt !== 'year' && current.getMonth() + 1 !== cmonth) || (timeflt !== 'year' && timeflt !== 'month' && current.getDate() !== cday)) {
					if (cyear !== 0) {
					    if (timeflt !== 'year' && timeflt !== 'month') {
						graphStamp = helpers.renderDateDay(cyear, cmonth, cday);
						graphDate = new Date(cyear, cmonth - 1, cday, 0, 0, 0).getTime();
					    } else if (timeflt !== 'year') {
						graphStamp = helpers.renderDateMonth(cyear, cmonth);
						graphDate = new Date(cyear, cmonth - 1, 1, 0, 0, 0).getTime();
					    } else {
						graphStamp = cyear;
						graphDate = new Date(cyear, 0, 1, 0, 0, 0).getTime();
					    }
					    oddeven = update.groupped.length % 2 ? 'odd': 'even';
					    update.groupped.push({
						    at: graphDate, hrat: graphStamp, boughtcust: boughtcust,
						    hrboughtcust: helpers.renderAmount(pf(boughtcust, cprecision)),
						    hrbought: helpers.renderAmount(bought),
						    soldcust: soldcust, tx: tx, rx: rx, sumtx: tx + rx,
						    hrsoldcust: helpers.renderAmount(pf(soldcust, cprecision)),
						    hrsold: helpers.renderAmount(sold), sold: sold,
						    diff: pf(boughtcust - soldcust, 8), oddeven: oddeven,
						    hrdiff: helpers.renderAmount(pf(boughtcust - soldcust, cprecision)),
						    volume: pf(boughtcust + soldcust, 8), bought: bought,
						    hrvolume: helpers.renderAmount(pf(boughtcust + soldcust, cprecision)) });
					}
					if (timeflt === 'year' && cyear !== 0) {
					    cmonth = cday = 1;
					    while (--cyear > current.getFullYear()) {
						graphStamp = cyear;
						graphDate = new Date(cyear, 0, 1, 0, 0, 0).getTime();
						oddeven = update.groupped.length % 2 ? 'odd': 'even';
						update.groupped.push({
						    at: graphDate, hrat: graphStamp, boughtcust: 0, hrboughtcust: helpers.renderAmount(0), hrbought: helpers.renderAmount(0), rx: 0,
						    sumtx: 0, hrsoldcust: helpers.renderAmount(0), hrsold: helpers.renderAmount(0), bought: 0, soldcust: 0, tx: 0,
						    sold: 0, diff: 0, hrdiff: helpers.renderAmount(0), volume: 0, hrvolume: helpers.renderAmount(0) });
					    }
					} else if (timeflt === 'month' && cyear !== 0) {
					    cday = 1;
					    while (cmonth > current.getMonth() + 1 || cyear > current.getFullYear()) {
						if (cmonth <= 1) { cmonth = 12; cyear--; }
						else { cmonth--; }
						if (cmonth == current.getMonth() + 1 && cyear == current.getFullYear()) { break; }
						graphStamp = helpers.renderDateMonth(cyear, cmonth);
						graphDate = new Date(cyear, cmonth - 1, 1, 0, 0, 0).getTime();
						oddeven = update.groupped.length % 2 ? 'odd': 'even';
						update.groupped.push({
						    at: graphDate, hrat: graphStamp, boughtcust: 0, hrboughtcust: helpers.renderAmount(0), hrbought: helpers.renderAmount(0), rx: 0,
						    sumtx: 0, hrsoldcust: helpers.renderAmount(0), hrsold: helpers.renderAmount(0), bought: 0, soldcust: 0, tx: 0,
						    sold: 0, diff: 0, hrdiff: helpers.renderAmount(0), volume: 0, hrvolume: helpers.renderAmount(0) });
					    }
					//} else if (timeflt === 'day' && cyear !== 0) {
					//FIXME: insert rows for days with no trades ...
					} else {
					    cyear = current.getFullYear();
					    if (timeflt !== 'year') {
						cmonth = current.getMonth() + 1;
					    } else { cmonth = 1; }
					    if (timeflt !== 'month' && timeflt !== 'year') {
						cday = current.getDate();
					    } else { cday = 1; }
					}
					boughtcust = soldcust = bought = sold = tx = rx = 0;
				    }
				    if (data[i].ops[k].type === 'buy') {
					bought = pf(bought + data[i].ops[k].value, 8);
					boughtcust = pf(boughtcust + data[i].ops[k].custvalue, 8);
					rx++;
				    } else {
					sold = pf(sold + data[i].ops[k].value, 8);
					soldcust = pf(sold + data[i].ops[k].custvalue, 8);
					tx++;
				    }
				}
				if (cyear !== 0) {
				    if (timeflt !== 'year' && timeflt !== 'month') {
					graphStamp = helpers.renderDateDay(cyear, cmonth, cday);
					graphDate = new Date(cyear, cmonth - 1, cday, 0, 0, 0).getTime();
				    } else if (timeflt !== 'year') {
					graphStamp = helpers.renderDateMonth(cyear, cmonth);
					graphDate = new Date(cyear, cmonth - 1, 1, 0, 0, 0).getTime();
				    } else {
					graphStamp = cyear;
					graphDate = new Date(cyear, 0, 1, 0, 0, 0).getTime();
				    }
				    oddeven = update.groupped.length % 2 ? 'odd': 'even';
				    update.groupped.push({
					    at: graphDate, hrat: graphStamp, boughtcust: boughtcust,
					    hrboughtcust: helpers.renderAmount(pf(boughtcust, cprecision)),
					    hrbought: helpers.renderAmount(bought),
					    soldcust: soldcust, tx: tx, rx: rx, sumtx: tx + rx,
					    hrsoldcust: helpers.renderAmount(pf(soldcust, cprecision)),
					    hrsold: helpers.renderAmount(sold), sold: sold,
					    diff: pf(boughtcust - soldcust, 8), oddeven: oddeven,
					    hrdiff: helpers.renderAmount(pf(boughtcust - soldcust, cprecision)),
					    volume: pf(boughtcust + soldcust, 8), bought: bought,
					    hrvolume: helpers.renderAmount(pf(boughtcust + soldcust, cprecision)) });
				}
			    }
			    for (let i = 0; i < opts.balances.length; i++) {
				let lasttime = txtot = rxtot = totot = pamount = samount = pvalue = svalue = difftot = voltot = 0;
				for (let k = 0; k < opts.balances[i].groupped.length; k++) {
				    let update = opts.balances[i].groupped[k];
				    txtot += update.tx;
				    rxtot += update.rx;
				    totot += update.sumtx;
				    pamount = pf(pamount + update.bought, 8);
				    samount = pf(samount + update.sold, 8);
				    pvalue = pf(pvalue + update.boughtcust, 8);
				    svalue = pf(svalue + update.soldcust, 8);
				    difftot = pf(difftot + update.diff, 8);
				    voltot = pf(voltot + update.volume, 8);
				    lasttime = update.at;
				    async.push(this._convert.getLast(update.boughtcust, opts.preferredCurrencyIndex, btcIndex)
						.then((price) => { update.boughtbtc = pf(price, 8); })
						.catch((e) => { logError('failed processing some currency', e); }));
				    async.push(this._convert.getLast(update.soldcust, opts.preferredCurrencyIndex, btcIndex)
						.then((price) => { update.soldbtc = pf(price, 8); })
						.catch((e) => { logError('failed processing some currency', e); }));
				    async.push(this._convert.getLast(update.diff, opts.preferredCurrencyIndex, btcIndex)
						.then((price) => { update.diffbtc = pf(price, 8); })
						.catch((e) => { logError('failed processing some currency', e); }));
				    async.push(this._convert.getLast(update.volume, opts.preferredCurrencyIndex, btcIndex)
						.then((price) => { update.volumebtc = pf(price, 8); })
						.catch((e) => { logError('failed processing some currency', e); }));
				}
				//WTF / don't ask ...
				opts.balances[i].fixednextdate = lasttime + 86400000;
				opts.balances[i].txtot = txtot;
				opts.balances[i].rxtot = rxtot;
				opts.balances[i].totot = totot;
				opts.balances[i].pamount = helpers.renderAmount(pamount);
				opts.balances[i].samount = helpers.renderAmount(samount);
				opts.balances[i].pvalue = helpers.renderAmount(pf(pvalue, cprecision));
				opts.balances[i].svalue = helpers.renderAmount(pf(svalue, cprecision));
				opts.balances[i].difftot = helpers.renderAmount(pf(difftot, cprecision));
				opts.balances[i].voltot = helpers.renderAmount(pf(voltot, cprecision));
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    for (let i = 0; i < opts.balances.length; i++) {
				let pbtc = sbtc = dbtc = vbtc = 0;
				for (let k = 0; k < opts.balances[i].groupped.length; k++) {
				    pbtc = pf(pbtc + opts.balances[i].groupped[k].boughtbtc, 8);
				    sbtc = pf(sbtc + opts.balances[i].groupped[k].soldbtc, 8);
				    dbtc = pf(dbtc + opts.balances[i].groupped[k].diffbtc, 8);
				    vbtc = pf(vbtc + opts.balances[i].groupped[k].volumebtc, 8);
				    opts.balances[i].groupped[k].hrboughtbtc = helpers.renderAmount(opts.balances[i].groupped[k].boughtbtc);
				    opts.balances[i].groupped[k].hrsoldbtc = helpers.renderAmount(opts.balances[i].groupped[k].soldbtc);
				    opts.balances[i].groupped[k].hrdiffbtc = helpers.renderAmount(opts.balances[i].groupped[k].diffbtc);
				    opts.balances[i].groupped[k].hrvolumebtc = helpers.renderAmount(opts.balances[i].groupped[k].volumebtc);
				}
				opts.balances[i].pvaluebtc = helpers.renderAmount(pbtc);
				opts.balances[i].svaluebtc = helpers.renderAmount(sbtc);
				opts.balances[i].difftotbtc = helpers.renderAmount(dbtc);
				opts.balances[i].voltotbtc = helpers.renderAmount(vbtc);
			    }
			    opts.hrtimeflt = helpers.capitalize(timeflt);
			    logger.debug(opts);
			    servePage(res, 'balancebycurrency', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/balancebyday', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Daily Balance', preferredCurrencyIndex: 1, timebalance: [] };
		let convertedBalances = [], walletHistory = [], wallet = new balances();

		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.read(`SELECT preferredcurrency, timezone FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				opts.preferredTimeZone = userPrefs[0].timezone;
			    }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp ASC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [], ystart = 1970, mstart = 1, dstart = 1, current = new Date();
			    if (opts.preferredBalanceInterval === '30d') {
				ystart = current.getFullYear();
				mstart = current.getMonth();
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === '90d') {
				ystart = current.getFullYear();
				mstart = current.getMonth() - 2;
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === '365d') {
				ystart = current.getFullYear() - 1;
				mstart = current.getMonth() + 1;
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === 'all' && userTrades.length > 0) {
				current = new Date(userTrades[0].timestamp * 1000);
				ystart = current.getFullYear();
				mstart = current.getMonth() + 1;
				dstart = current.getDate();
			    } else { //14d
				ystart = current.getFullYear();
				mstart = current.getMonth() + 1;
				dstart = current.getDate() - 14;
			    }
			    logger.debug('found', ystart, mstart, dstart);
			    for (; mstart <= 0; mstart += 12) { ystart--; }
			    logger.debug('fixed neg month', ystart, mstart, dstart);
			    while (dstart <= 0) {
				if (mstart <= 1) {
				    mstart = 12;
				    ystart--;
				} else { mstart--; }
				dstart += new Date(ystart, mstart - 1, 0).getDate();
			    }
			    logger.debug('processing with', ystart, mstart, dstart);
			    for (let i = 0; i < userTrades.length; i++) {
				let tmp = new Date(userTrades[i].timestamp * 1000);
				let leftC = rightC = feeC = left = right = fee = 0;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				if (left !== '' && left !== 0 && leftC !== 0) {
				    wallet.editBalance(userTrades[i].exchange, leftC, left);
				}
				if (right !== '' && right !== 0 && rightC !== 0) {
				    wallet.editBalance(userTrades[i].exchange, rightC, right * -1);
				}
				if (fee !== '' && fee !== 0 && feeC !== 0) {
				    wallet.editBalance(userTrades[i].exchange, feeC, fee * -1);
				}
				if (tmp.getFullYear() < ystart) { continue; }
				if (tmp.getMonth() + 1 < mstart) { continue; }
				if (tmp.getDate() < dstart) { continue; }
				let current = new Date();
				let ydest = current.getFullYear();
				let mdest = current.getMonth() + 1;
				let ddest = current.getDate();
				if (userTrades[i + 1] !== undefined) {
				    current = new Date(userTrades[i + 1].timestamp * 1000);
				    ydest = current.getFullYear();
				    mdest = current.getMonth() + 1;
				    ddest = current.getDate();
				}
				if (ydest === ystart && mdest === mstart && ddest === dstart) { continue; }
				let tmpBalances = [];
				for (let k = 0; k < wallet.getHeldCurrencies().length; k++) {
				    let processing = wallet.getHeldCurrencies()[k];
				    tmpBalances.push({ curid: processing, volume: pf(wallet.getBalanceByCurrency(processing), 8) });
				}
				logger.debug(`from ${ystart}/${mstart}/${dstart} to ${ydest}/${mdest}/${ddest}`)
				while (ystart <= ydest || mstart <= mdest || dstart <= ddest) {
				    if (ystart === ydest && mstart === mdest && dstart === ddest) { break; }
				    walletHistory.push({ year: ystart, month: mstart, day: dstart, balances: tmpBalances });
				    logger.debug('month', mstart, 'has', new Date(ystart, mstart, 0).getDate(), 'days');
				    if (new Date(ystart, mstart, 0).getDate() === dstart) {
					dstart = 1;
					if (mstart === 12) { ystart++; mstart = 1; }
					else { mstart++; }
				    } else { dstart++; }
				}
			    }
			    let today = new Date();
			    let ytoday = today.getFullYear();
			    let mtoday = today.getMonth() + 1;
			    let dtoday = today.getDate();
			    let last = walletHistory[walletHistory.length - 1];
			    if (last.year !== ytoday || last.month !== mtoday || last.day !== dtoday) {
				let tmpBalances = [];
				for (let i = 0; i < wallet.getHeldCurrencies().length; i++) {
				    let processing = wallet.getHeldCurrencies()[i];
				    tmpBalances.push({ curid: processing, volume: pf(wallet.getBalanceByCurrency(processing), 8) });
				}
				logger.debug(`from ${ystart}/${mstart}/${dstart} to ${ytoday}/${mtoday}/${dtoday}`)
				while (ystart <= ytoday || mstart <= mtoday || dstart <= dtoday) {
				    walletHistory.push({ year: ystart, month: mstart, day: dstart, balances: tmpBalances });
				    logger.debug('month', mstart, 'has', new Date(ystart, mstart, 0).getDate(), 'days');
				    if (ystart === ytoday && mstart === mtoday && dstart === dtoday) { break; }
				    if (new Date(ystart, mstart, 0).getDate() === dstart) {
					dstart = 1;
					if (mstart === 12) { ystart++; mstart = 1; }
					else { mstart++; }
				    } else { dstart++; }
				}
			    }
			    for (let i = 0; i < walletHistory.length; i++) {
				let convertStamp = Math.round(new Date(walletHistory[i].year, walletHistory[i].month - 1, walletHistory[i].day, 0, 0, 0).getTime() / 1000);
				for (let k = 0; k < walletHistory[i].balances.length; k++) {
				    async.push(this._convert.getAt(walletHistory[i].balances[k].volume, walletHistory[i].balances[k].curid, opts.preferredCurrencyIndex, convertStamp)
						.then((price) => {
							if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) {
							    walletHistory[i].balances[k].custvalue = pf(price, 2);
							} else { walletHistory[i].balances[k].custvalue = pf(price, 8); }
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				}
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    for (let i = 1; i < walletHistory.length; i++) {
				for (let k = 0; k < walletHistory[i].balances.length; k++) {
				    for (let l = 0; l < walletHistory[i - 1].balances.length; l++) {
					if (walletHistory[i - 1].balances[l].curid === walletHistory[i].balances[k].curid) {
					    walletHistory[i].balances[k].inttrendday = helpers.getTrend(walletHistory[i - 1].balances[l].custvalue, walletHistory[i].balances[k].custvalue);
					    break ;
					}
				    }
				}
			    }
			    opts.currencycolumns = walletHistory[walletHistory.length - 1].balances.length;
			    opts.currencynames = [];
			    for (let i = 0; i < opts.currencycolumns; i++) { opts.currencynames.push({ name: currencies.getCurrency(walletHistory[walletHistory.length - 1].balances[i].curid).tag }); }
			    for (let i = walletHistory.length - 1; i >= 0; i--) {
				let oddeven = (i % 2) ? 'even' : 'odd', val = spent = 0, curArray = [], k;
				for (k = 0; k < walletHistory[i].balances.length; k++) {
				    if (currencies.getCurrency(walletHistory[i].balances[k].curid).isfiat === true) {
					spent = pf(spent + walletHistory[i].balances[k].custvalue, 2);
				    } else { val = pf(val + walletHistory[i].balances[k].custvalue, 2); }
				    let tval = walletHistory[i].balances[k].inttrendday !== undefined ? helpers.renderTrend(walletHistory[i].balances[k].inttrendday) : '';
				    let tclass = walletHistory[i].balances[k].inttrendday !== undefined ? helpers.renderTrendClass(walletHistory[i].balances[k].inttrendday) : 'hidden';
				    curArray.push({
					    name: currencies.getCurrency(walletHistory[i].balances[k].curid).tag,
					    held: helpers.renderAmount(walletHistory[i].balances[k].volume),
					    cust: helpers.renderAmount(walletHistory[i].balances[k].custvalue),
					    trend: tval, trendclass: tclass, sfx: opts.preferredCurrency
					});
				}
				while (k++ < opts.currencycolumns) { curArray.push({ name: '', held: '', cust: '', trend: '', trendclass: '' }); }
				let roi = pf(val + spent, 2);
				let label = (i === walletHistory.length - 1) ? 'now' :
				    `${walletHistory[i].year}/${walletHistory[i].month}/${walletHistory[i].day}`;
				opts.timebalance.push({ label: label, oddeven: oddeven, intvalue: val, intspent: spent, introi: roi, currencies: curArray });
			    }
			    opts.colwidth = Math.round((800 - 48) / (opts.currencycolumns + 3)); //facepalm?
			    for (let i = 0; i < opts.timebalance.length; i++) {
				opts.timebalance[i].roi = helpers.renderAmount(opts.timebalance[i].introi);
				if (opts.timebalance[i + 1] !== undefined) {
				    opts.timebalance[i].roitrendint = helpers.getTrend(opts.timebalance[i].introi, opts.timebalance[i + 1].introi);
				    opts.timebalance[i].roitrend = helpers.renderTrend(opts.timebalance[i].roitrendint);
				    opts.timebalance[i].roitrendclass = helpers.renderTrendClass(opts.timebalance[i].roitrend);
				} else { opts.timebalance[i].roitrend = ''; opts.timebalance[i].roitrendclass = 'hidden'; }
				opts.timebalance[i].spent = helpers.renderAmount(opts.timebalance[i].intspent);
				if (opts.timebalance[i + 1] !== undefined) {
				    opts.timebalance[i].spenttrendint = helpers.getTrend(opts.timebalance[i].intspent, opts.timebalance[i + 1].intspent);
				    opts.timebalance[i].spenttrend = helpers.renderTrend(opts.timebalance[i].spenttrendint);
				    opts.timebalance[i].spenttrendclass = helpers.renderTrendClass(opts.timebalance[i].spenttrendint);
				} else { opts.timebalance[i].spenttrend = ''; opts.timebalance[i].spenttrendclass = 'hidden'; }
				opts.timebalance[i].value = helpers.renderAmount(opts.timebalance[i].intvalue);
				if (opts.timebalance[i + 1] !== undefined) {
				    opts.timebalance[i].valuetrendint = helpers.getTrend(opts.timebalance[i].intvalue, opts.timebalance[i + 1].intvalue);
				    opts.timebalance[i].valuetrend = helpers.renderTrend(opts.timebalance[i].valuetrendint);
				    opts.timebalance[i].valuetrendclass = helpers.renderTrendClass(opts.timebalance[i].valuetrend);
				} else { opts.timebalance[i].valuetrend = ''; opts.timebalance[i].valuetrendclass = 'hidden'; }
			    }
			    logger.debug(opts);
			    servePage(res, 'balancebyday', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/balancebyexchange', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Balances by Exchange', exchanges: [], currencies: [], preferredCurrencyIndex: 1 };
		let btcIdx = 0, convertedBalances = [];
		let wallet = new balances();
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.read(`SELECT preferredcurrency FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) { opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency; }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag == opts.preferredCurrency) { opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' }); }
				else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp ASC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [];
			    for (let i = 0; i < userTrades.length; i++) {
				let leftC = rightC = feeC = left = right = fee = 0;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				if (left !== '' && left !== 0 && leftC !== 0) { wallet.editBalance(userTrades[i].exchange, leftC, left); }
				if (right !== '' && right !== 0 && rightC !== 0) { wallet.editBalance(userTrades[i].exchange, rightC, right * -1); }
				if (fee !== '' && fee !== 0 && feeC !== 0) { wallet.editBalance(userTrades[i].exchange, feeC, fee * -1); }
			    }
			    for (let i = 0; i < wallet.getExchanges().length; i++) {
				let processing = wallet.getExchanges()[i];
				for (let k = 0; k < opts.currencies.length; k++) {
				    if (currencies.getCurrency(opts.currencies[k].id).tag === 'BTC') { btcIdx = opts.currencies[k].id; }
				    if (wallet.exchangeHasBalance(opts.currencies[k].id, processing) === true) {
					let val = wallet.getCurrencyBalanceByExchange(opts.currencies[k].id, processing)
					convertedBalances.push({ label: processing, held: val, curid: opts.currencies[k].id });
				    }
				}
			    }
			    for (let i = 0; i < convertedBalances.length; i++) {
				async.push(this._convert.getLast(convertedBalances[i].held, convertedBalances[i].curid, btcIdx)
					.then((price) => { convertedBalances[i].heldbtc = price; })
					.catch((e) => { logError('failed processing some currency', e); }));
			    }
			    return Promise.all(async);
			})
		    .then(() => this._convert.getLast(1, btcIdx, opts.preferredCurrencyIndex))
		    .then((convertionRate) => {
			    for (let i = 0; i < wallet.getExchanges().length; i++) {
				let processing = wallet.getExchanges()[i];
				let totalCust = totalBtc = 0, margin = 5, exchangeData = [];
				for (let k = 0; k < convertedBalances.length; k++) {
				    if (convertedBalances[k].label === processing) {
					let curBtc = convertedBalances[k].heldbtc;
					let curCust = pf(curBtc * convertionRate, 8);
					let bodyColor = curCust >= 0 ? 'rgba(0, 0, 255, 0.3)' : 'rgba(255, 0, 0, 0.3)';
					let borderColor = curCust >= 0 ? 'rgba(0, 0, 255, 1)' : 'rgba(255, 0, 0, 1)';
					logger.debug(`${convertedBalances[k].label}:${convertedBalances[k].curid} => ${convertedBalances[k].held} EUR:${curCust} BTC:${convertedBalances[k].heldbtc}`);
					totalBtc = pf(totalBtc + curBtc, 8);
					totalCust = pf(totalCust + curCust, 8);
					//FIXME: value at transaction missing
					if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { curCust = pf(curCust, 2); }
					exchangeData.push({
						amount: helpers.renderAmount(pf(convertedBalances[k].held, 8)),
						bodycolor: bodyColor,
						bordercolor: borderColor,
						intamountcust: curCust,
						amountcust: helpers.renderAmount(curCust),
						amountbtc: helpers.renderAmount(curBtc),
						what: currencies.getCurrency(convertedBalances[k].curid).tag
					    });
				    }
				}
				if (exchangeData.length < 2) { margin = 45; }
				else if (exchangeData.length < 3) { margin = 35; }
				else if (exchangeData.length < 4) { margin = 25; }
				else if (exchangeData.length < 5) { margin = 15; }
				else if (exchangeData.length < 6) { margin = 10; }
				if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { totalCust = pf(totalCust, 2); }
				opts.exchanges.push({
					totalbtc: helpers.renderAmount(totalBtc),
					totalcust: helpers.renderAmount(totalCust),
					label: processing, exdata: exchangeData,
					margin: margin
				    });
			    }
			    logger.debug(opts);
			    servePage(res, 'balancebyexchange', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/calculator/:coin?/:dest?', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Calculator', srccurrencies: [], dstcurrencies: [] };
		let validGraphIntervals = [ { name: '2 weeks', value: '14d' }, { name: '1 month', value: '30d' }, { name: '3 months', value: '90d' }, { name: '1 year', value: '365d' }, { name: 'All', value: 'all' } ];
		let doCoin, toCoin;
		if (req.params.coin === undefined) { req.params.coin = 'BTC'; }
		if (req.params.dest === undefined) { req.params.dest = 'EUR'; }
		this._check.cmdValidation(req, res, 'calculator')
		    .then((params) => {
			    let srcId = dstId = 1;
			    if (params.coin !== undefined) { doCoin = params.coin; }
			    if (params.dest !== undefined) { toCoin = params.dest; }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === doCoin) {
				    srcId = item.id;
				    opts.srccurrencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				} else { opts.srccurrencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
				if (item.tag === toCoin) {
				    dstId = item.id;
				    opts.dstcurrencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				} else { opts.dstcurrencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    return this._convert.getLast(1, srcId, dstId);
			})
		    .then((price) => {
			    opts.price = price;
			    logger.debug(opts);
			    servePage(res, 'calculator', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/coincharts/:coin?', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Coin Charts', currencies: [], graphwhat: [], graphwatch: [], values: [], preferredBalanceInterval: 'all', preferredCurrencyIndex: 1 };
		let validGraphIntervals = [ { name: '2 weeks', value: '14d' }, { name: '1 month', value: '30d' }, { name: '3 months', value: '90d' }, { name: '1 year', value: '365d' }, { name: 'All', value: 'all' } ];
		let doCoin, eurIdx = 0;
		if (req.params.coin === undefined) { req.params.coin = 'BTC'; }
		this._check.cmdValidation(req, res, 'coincharts')
		    .then((params) => {
			    if (params.coin !== undefined) { doCoin = params.coin; }
			    return db.read(`SELECT preferredcurrency, watchitv FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				opts.preferredBalanceInterval = userPrefs[0].watchitv;
			    }
			    if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { cprecision = 2; }
			    for (let i = 0; i < validGraphIntervals.length; i++) {
				if (validGraphIntervals[i].value === opts.preferredBalanceInterval) {
				    opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: ' selected' });
				} else { opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: '' }); }
			    }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === 'EUR') { eurIdx = item.id; }
				if (item.id === opts.preferredCurrencyIndex) {
				    opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				    opts.preferredCurrency = item.tag;
				    opts.hrcustname = helpers.renderCurrency(item.name);
				} else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
				if (item.isfiat === false) {
				    if (item.tag === doCoin) { opts.graphwhat.push({ id: item.id, tag: item.tag, sfx: ' selected' }); }
				    else { opts.graphwhat.push({ id: item.id, tag: item.tag, sfx: '' }); }
				}
			    }
			    return db.read(`SELECT * FROM currencies WHERE tag = '${doCoin}'`);
			})
		    .then((coins) => {
			    if (coins.length <= 0) { throw new Error('No such coin'); }
			    let notBefore = 0;
			    let current = new Date();
			    opts.curhrname = helpers.renderCurrency(coins[0].name);
			    if (opts.preferredBalanceInterval === '14d') {
				notBefore = Math.round(current.getTime() / 1000) - (14 * 86400);
			    } else if (opts.preferredBalanceInterval === '30d') {
				notBefore = Math.round(current.getTime() / 1000) - (30 * 86400);
			    } else if (opts.preferredBalanceInterval === '90d') {
				notBefore = Math.round(current.getTime() / 1000) - (90 * 86400);
			    } else if (opts.preferredBalanceInterval === '365d') {
				notBefore = Math.round(current.getTime() / 1000) - (90 * 86400);
			    }
			    return db.read(`SELECT * FROM rates WHERE id = ${coins[0].id} AND timestamp > ${notBefore} ORDER BY timestamp ASC`, 'none');
			})
		    .then((rates) => {
			    let async = [];
			    let lastDate = 0;
			    for (let i = 0; i < rates.length; i++) {
				let graphDate = new Date(rates[i].timestamp * 1000);
				if (lastDate !== 0) {
				    if (opts.preferredBalanceInterval !== '14d') {
					if (lastDate.getDate() === graphDate.getDate() && lastDate.getMonth() === graphDate.getMonth() && lastDate.getFullYear() === graphDate.getFullYear()) {
					    continue;
					}
				    }
				}
				lastDate = graphDate;
				if (eurIdx !== opts.preferredCurrencyIndex) {
				    opts.values.push({ at: graphDate.getTime(), value: rates[i].eurrate });
				    let update = opts.values[opts.values.length - 1];
				    async.push(this._convert.getAt(1, eurIdx, opts.preferredCurrencyIndex, update.timestamp)
						.then((price) => { update.custvalue = price; })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				} else { opts.values.push({ at: graphDate.getTime(), custvalue: rates[i].eurrate }); }
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    logger.debug(opts);
			    servePage(res, 'coincharts', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });


	app.get('/cointrends', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Coin Trends', currencies: [], preferredCurrencyIndex: 1 };
		let btcIdx = 0, convertedBalances = [], eurIdx, cprecision = 8;
		let wallet = new balances();
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.read(`SELECT preferredcurrency FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) { opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency; }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === 'EUR') { eurIdx = item.id; }
			    }
			    if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { cprecision = 2; }
			    return db.read(`SELECT * FROM currencies WHERE isfiat = 0 ORDER BY eurcap DESC`, 'none');
			})
		    .then((coins) => {
			    let async = [];
			    for (let i = 0; i < coins.length; i++) {
				let oddeven = i % 2 ? 'odd' : 'even';
				let name = helpers.renderCurrency(coins[i].name);
				if (coins[i].tag !== coins[i].symbol) { name += ` (${coins[i].symbol}) `; }
				opts.currencies.push({
				    curid: coins[i].id, name: name, marketcap: coins[i].eurcap, oddeven: oddeven,
				    volume24: coins[i].eurvolume24, cmcname: coins[i].name, tag: coins[i].tag });
			    }
			    for (let i = 0; i < opts.currencies.length; i++) {
				let update = opts.currencies[i];
				async.push(this._convert.getLast(1, update.curid, opts.preferredCurrencyIndex)
					    .then((price) => { update.custprice = helpers.renderAmount(price); })
					    .catch((e) => { logError('failed processing some currency', e); }));
				if (opts.preferredCurrencyIndex !== eurIdx) {
				    async.push(this._convert.getLast(1, eurIdx, opts.preferredCurrencyIndex)
						.then((price) => {
							update.marketcapcust = helpers.renderAmount(pf(update.marketcap * price, cprecision));
							update.volume24cust = helpers.renderAmount(pf(update.volume24 * price, cprecision));
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				} else {
				    update.marketcapcust = helpers.renderAmount(pf(update.marketcap, cprecision));
				    update.volume24cust = helpers.renderAmount(pf(update.volume24, cprecision));
				}
				async.push(this._convert.getTrend(update.curid, '1h')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    update.curtrend1 = helpers.renderTrend(trend);
						    update.trend1color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
				async.push(this._convert.getTrend(update.curid, '24h')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    update.curtrend24 = helpers.renderTrend(trend);
						    update.trend24color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
				async.push(this._convert.getTrend(update.curid, '7d')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    update.curtrend7 = helpers.renderTrend(trend);
						    update.trend7color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
				async.push(this._convert.getTrend(update.curid, '30d')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    update.curtrend30 = helpers.renderTrend(trend);
						    update.trend30color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    logger.debug(opts);
			    servePage(res, 'cointrends', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/currentbalance', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Current Balances', balances: [], currencies: [], preferredCurrencyIndex: 1, preferredTrendInterval: '24h' };
		let convertedBalances = [];
		let validTrendIntervals = [ '1h', '24h', '7d', '30d' ];
		let wallet = new balances();
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.read(`SELECT preferredcurrency, trenditv FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				opts.preferredTrendInterval = userPrefs[0].trenditv;
			    }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag == opts.preferredCurrency) { opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' }); }
				else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp ASC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [];
			    for (let i = 0; i < userTrades.length; i++) {
				let leftC = rightC = feeC = left = right = fee = 0;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				if (left !== '' && left !== 0 && leftC !== 0) { wallet.editBalance(userTrades[i].exchange, leftC, left); }
				if (right !== '' && right !== 0 && rightC !== 0) { wallet.editBalance(userTrades[i].exchange, rightC, right * -1); }
				if (fee !== '' && fee !== 0 && feeC !== 0) { wallet.editBalance(userTrades[i].exchange, feeC, fee * -1); }
			    }
			    wallet.getHeldCurrencies().forEach((processing) => {
				    async.push(this._convert.getLast(1, processing, opts.preferredCurrencyIndex)
						.then((price) => {
							let held = pf(wallet.getBalanceByCurrency(processing), 8);
							let value = pf(held * price, 8);
							opts.balances.push({
								curname: currencies.getCurrency(processing).tag,
								curhrname: helpers.renderCurrency(currencies.getCurrency(processing).name),
								curheld: helpers.renderAmount(held),
								curtype: currencies.getCurrency(processing).isfiat ? 'FIAT' : 'Coin',
								curid: processing, intprice: price, intvalue: value,
								curvalue: helpers.renderAmount(value),
								curprice: helpers.renderAmount(price),
							    });
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				});
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [];
			    wallet.getHeldCurrencies().forEach((processing) => {
				    async.push(this._convert.getTrend(processing, opts.preferredTrendInterval)
						.then((rates) => {
							let trend = 0, trendL, trendR;
							if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
							else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
							else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
							else { logError('failed processing some trend - missing db record'); return; }
							trend = helpers.getTrend(trendR, trendL);
							for (let i = 0; i < opts.balances.length; i++) { if (opts.balances[i].curid === processing) { opts.balances[i].inttrend = trend; break; } }
						    })
						.catch((e) => { logError('failed processing some trend', e); }));
				});
			    return Promise.all(async);
			})
		    .then(() => {
			    let fiatBalance = cryptoHeld = cryptoBalance = cryptoTrendHeld = cryptoTrendBalance = 0;
			    for (let i = 0; i < opts.balances.length; i++) {
				opts.balances[i].color = (i % 2) ? 'even' : 'odd';
				cryptoBalance = pf(cryptoBalance + opts.balances[i].intvalue, 2);
				cryptoTrendBalance = pf(cryptoTrendBalance + opts.balances[i].inttrend, 2);
				if (currencies.getCurrency(opts.balances[i].curid).isfiat === false) {
				    cryptoHeld = pf(cryptoHeld + opts.balances[i].intvalue, 2);
				    cryptoTrendHeld = pf(cryptoTrendHeld + opts.balances[i].inttrend, 2);
				}
			    }
			    let async = [];
			    for (let i = 0; i < wallet.getExchanges().length; i++) {
				let processing = wallet.getExchanges()[i];
				for (let k = 0; k < opts.balances.length; k++) {
				    if (currencies.getCurrency(opts.balances[k].curid).tag === 'BTC') { btcIdx = currencies.getCurrency(opts.balances[k].curid).id; }
				    if (currencies.getCurrency(opts.balances[k].curid).isfiat === true) {
					fiatBalance = pf(fiatBalance + wallet.getCurrencyBalanceByExchange(opts.balances[k].curid, processing), 8);
				    } else {
					if (wallet.getCurrencyBalanceByExchange(opts.balances[k].curid, processing).toString() !== '0') {
					    async.push(this._convert.getLast(wallet.getCurrencyBalanceByExchange(opts.balances[k].curid, processing), opts.balances[k].curid, opts.preferredCurrencyIndex)
							.then((value) => { convertedBalances.push({ label: processing, held: value }) })
							.catch((e) => { logError('failed converting some exchanges balance to preferred currency', e); }));
					}
				    }
				}
			    }
			    //FIXME: trend requires retrieving wallet values at T = (now - trendInterval)
			    //currently, trends are based on wallet composition at trendInterval=0 against prices at trendInterval=preferredTrendInterval
			    opts.totalCoin = cryptoHeld; opts.totalFiat = fiatBalance; opts.totalCrypto = cryptoBalance;
			    opts.totalCoinValue = helpers.renderAmount(cryptoHeld);
			    opts.totalCoin24hTrend = helpers.renderTrend(cryptoTrendHeld);
			    opts.totalCoin24hClass = helpers.renderTrendClass(cryptoTrendHeld);
			    opts.totalFiatValue = helpers.renderAmount(fiatBalance);
			    opts.totalAccountValue = helpers.renderAmount(cryptoBalance);
			    opts.totalAccountValue24hTrend = helpers.renderTrend(cryptoTrendBalance);
			    opts.totalAccountValue24hClass = helpers.renderTrendClass(cryptoTrendBalance);
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [];
			    for (let i = 0; i < opts.balances.length; i++) {
				async.push(this._convert.getTrend(opts.balances[i].curid, '1h')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    opts.balances[i].curtrend1 = helpers.renderTrend(trend);
						    opts.balances[i].trend1color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
				async.push(this._convert.getTrend(opts.balances[i].curid, '24h')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    opts.balances[i].curtrend24 = helpers.renderTrend(trend);
						    opts.balances[i].trend24color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
				async.push(this._convert.getTrend(opts.balances[i].curid, '7d')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    opts.balances[i].curtrend7 = helpers.renderTrend(trend);
						    opts.balances[i].trend7color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
				async.push(this._convert.getTrend(opts.balances[i].curid, '30d')
					    .then((rates) => {
						    let trend = 0, trendL, trendR;
						    if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
						    else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
						    else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
						    else { logError('failed processing some trend - missing db record'); return; }
						    trend = helpers.getTrend(trendR, trendL);
						    opts.balances[i].curtrend30 = helpers.renderTrend(trend);
						    opts.balances[i].trend30color = helpers.renderTrendClass(trend);
						})
					    .catch((e) => { logError('failed processing some trend', e); }));
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [];
			    for (let i = 0; i < opts.balances.length; i++) {
				async.push(this._convert.getLast(1, opts.balances[i].curid, btcIdx)
					.then((price) => {
						opts.balances[i].curbtcintprice = price;
						opts.balances[i].curbtcprice = helpers.renderAmount(price);
					    })
					.catch((e) => { logError('failed processing some currency', e); }));
			    }
			    return Promise.all(async);
			})
		    .then(() => this._convert.getLast(1, opts.preferredCurrencyIndex, btcIdx))
		    .then((convertionRate) => {
			    for (i = 0; i < opts.balances.length; i++) {
				opts.balances[i].curbtcvalue = helpers.renderAmount(pf(opts.balances[i].intvalue * convertionRate, 8));
				opts.balances[i].curheldpct = pf((opts.balances[i].intvalue * 100 / opts.totalCoin), 3);
				if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { opts.balances[i].curvalue = helpers.renderAmount(pf(opts.balances[i].intvalue, 2)); }
			    }
			    opts.totalCoinBTCValue = helpers.renderAmount(pf(opts.totalCoin * convertionRate, 2));
			    opts.totalFiatBTCValue = helpers.renderAmount(pf(opts.totalFiat * convertionRate, 2));
			    opts.totalAccountBTCValue = helpers.renderAmount(pf(opts.totalCrypto * convertionRate, 2));
			    logger.debug(opts);
			    servePage(res, 'currentbalances', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/confirm2fa', (req, res) => {
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Confirm 2FA' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/confirm2fa', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Confirm 2FA' };
		let userInput = '0';
		this._check.cmdValidation(req, res, 'confirm-2fa')
		    .then((params) => {
			    userInput = params.confirm2fa || '0';
			    return db.read(`SELECT twofasecret FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((secret) => {
			    let validObject = { secret: secret[0].twofasecret.toString(), encoding: 'base32', token: userInput };
			    if (require('speakeasy').totp.verify(validObject)) {
				return db.write(`UPDATE users SET twofavalid = 1 WHERE id = ${req.session.userid}`);
			    }
			    throw({ code: 403, msg: '2FA code invalid' });
			})
		    .then(() => res.redirect('/settings'))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/confirmemail', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Confirm Email Address', bubble: 'info', bubblemsg: 'Enter Code', margintop: 12,
		    bottomcell: "<form method='POST' action='/confirmemail'><input type='text' name='confirmEmail' size='10' maxlen='8'/><br/><input type='submit' size='30px' value='Confirm Email' /></form>",
		    maincell: 'A verification code was sent to your address<br/>Please check your messages, and insert it in there:' };
		let sendMessage = confirmcode = sendTo = false;
		this._check.cmdValidation(req, res, 'confirm-email')
		    .then((params) => {
			    sendMessage = params.forceResend || false;
			    return db.read(`SELECT email, emailverified FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((user) => {
			    if (user[0] === undefined || user[0].email === undefined) { throw { code: 500, msg: 'user not found' }; }
			    if (user[0].email.length < 1) { throw { code: 403, msg: 'address not set' }; }
			    if (user[0].emailverified === 1) {
				opts.bubble = 'ok';
				opts.bubblemsg = 'Email Address Verified';
				opts.maincell = 'Your email address is now verified!';
				opts.bottomcell = `<a href='/settings'>Back to Settings</a>`;
				opts.margintop = 6;
				sendMessage = false;
			    } else if (user[0].emailverified === 0) { sendMessage = true; }
			    else { opts.bottomcell += "<br/>Didn't find our email? Even in your SPAMs? Try <a href='/confirmemail?forceResend=mintberrycrunch'>sending it back</a>"; }
			    if (sendMessage !== false) {
				confirmcode = helpers.randomNumber(1000000, 9999999);
				sendTo = user[0].email;
				return db.write(`UPDATE users SET emailverified = ${confirmcode} WHERE id = ${req.session.userid}`);
			    }
			})
		    .then(() => {
			    if (sendTo !== false) { return require('../lib/email.js')(sendTo, 'confirm-email', { confirmcode: confirmcode, username: req.session.username }); }
			})
		    .then(() => {
			    logger.debug(opts);
			    servePage(res, 'confirmemail', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });
	app.post('/confirmemail', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Confirm Email Address' };
		let userInput = false;
		this._check.cmdValidation(req, res, 'confirm-email-post')
		    .then((params) => {
			    userInput = params.confirmEmail || false;
			    return db.read(`SELECT emailverified FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((user) => {
			    if (user[0] === undefined || user[0].emailverified === undefined) { throw { code: 500, msg: 'user not found' }; }
			    if (user[0].emailverified === 1) { throw { code: 403, msg: 'already confirmed' }; }
			    else if (user[0].emailverified.toString() === userInput) {
				return db.write(`UPDATE users SET emailverified = 1 WHERE id = ${req.session.userid}`);
			    } else { throw { code: 403, msg: 'code invalid' }; }
			})
		    .then(() => res.redirect('/confirmemail'))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/dashboard', (req, res) => {
		getProbe.mark();
		let opts = {
		    username: req.session.username || 'undefined', pagetitle: 'Dashboard',
			preferredCurrencyIndex: 1, preferredTrendInterval: '24h',
			preferredBalanceInterval: 'all', bitcoin24hTrend: '',
			ethereum24hTrend: '', litecoin24hTrend: '',
			bitcoin24hClass: helpers.renderTrendClass(0),
			ethereum24hClass: helpers.renderTrendClass(0),
			litecoin24hClass: helpers.renderTrendClass(0),
			balances: [], currencies: [], exchanges: [], timebalance: [],
			graphitv: [], graphopts: [], graphwatch: [], tzdata: []
		    };
		let btcIdx = 0, balancesGraphFilter = 'all', convertedBalances = [], walletHistory = [], validTrendIntervals = [ '1h', '24h', '7d', '30d' ], wallet = new balances();
		let validGraphIntervals = [ { name: '2 weeks', value: '14d' }, { name: '1 month', value: '30d' }, { name: '3 months', value: '90d' }, { name: '1 year', value: '365d' }, { name: 'All', value: 'all' } ];
		let validGraphFilters = [ { name: 'All currencies', value: 'all' }, { name: 'Only FIAT currencies', value: 'fiat' }, { name: 'Only crypto currencies', value: 'crypto' } ];

		this._check.cmdValidation(req, res, 'dashboard')
		    .then((params) => db.read(`SELECT trenditv, watchitv, preferredcurrency, graphwhat, timezone FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				balancesGraphFilter = userPrefs[0].graphwhat;
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				opts.preferredTrendInterval = userPrefs[0].trenditv;
				opts.preferredBalanceInterval = userPrefs[0].watchitv;
				opts.preferredTimeZone = userPrefs[0].timezone;
			    }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === 'BTC') { opts.bitcoinValue = helpers.renderAmount(pf(item.eurrate, 2)); }
				else if (item.tag === 'ETH') { opts.ethereumValue = helpers.renderAmount(pf(item.eurrate, 2)); }
				else if (item.tag === 'LTC') { opts.litecoinValue = helpers.renderAmount(pf(item.eurrate, 2)); }
				if (item.tag == opts.preferredCurrency) {
				    opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				} else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    //FIXME: sort by name
			    //opts.currencies.sort((a, b) => { if (a.name < b.name) { return -1; } else { return 1; } });
			    for (let i = 0; i < validGraphFilters.length; i++) {
				let item = validGraphFilters[i];
				if (item.value === balancesGraphFilter) {
				    opts.graphopts.push({ value: item.value, label: item.name, sfx: ' selected' });
				} else { opts.graphopts.push({ value: item.value, label: item.name, sfx: '' }); }
			    }
			    for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				if (helpers.genericTimeZones()[i].value === opts.preferredTimeZone) {
				    opts.tzdata.push({ value: helpers.genericTimeZones()[i].value, sfx: ' selected', label: helpers.genericTimeZones()[i].label });
				} else { opts.tzdata.push({ value: helpers.genericTimeZones()[i].value, sfx: '', label: helpers.genericTimeZones()[i].label }); }
			    }
			    for (let i = 0; i < validTrendIntervals.length; i++) {
				if (validTrendIntervals[i] === opts.preferredTrendInterval) {
				    opts.graphitv.push({ value: validTrendIntervals[i], sfx: ' selected' });
				} else { opts.graphitv.push({ value: validTrendIntervals[i], sfx: '' }); }
			    }
			    for (let i = 0; i < validGraphIntervals.length; i++) {
				if (validGraphIntervals[i].value === opts.preferredBalanceInterval) {
				    opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: ' selected' });
				} else { opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: '' }); }
			    }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp ASC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [], ystart = 1970, mstart = 1, dstart = 1, current = new Date();
			    if (opts.preferredBalanceInterval === '30d') {
				ystart = current.getFullYear();
				mstart = current.getMonth();
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === '90d') {
				ystart = current.getFullYear();
				mstart = current.getMonth() - 2;
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === '365d') {
				ystart = current.getFullYear() - 1;
				mstart = current.getMonth() + 1;
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === 'all' && userTrades.length > 0) {
				current = new Date(userTrades[0].timestamp * 1000);
				ystart = current.getFullYear();
				mstart = current.getMonth() + 1;
				dstart = current.getDate();
			    } else { //14d
				ystart = current.getFullYear();
				mstart = current.getMonth() + 1;
				dstart = current.getDate() - 14;
			    }
			    logger.debug('found', ystart, mstart, dstart);
			    for (; mstart <= 0; mstart += 12) { ystart--; }
			    logger.debug('fixed neg month', ystart, mstart, dstart);
			    while (dstart <= 0) {
				if (mstart <= 1) {
				    mstart = 12;
				    ystart--;
				} else { mstart--; }
				dstart += new Date(ystart, mstart - 1, 0).getDate();
			    }
			    logger.debug('processing with', ystart, mstart, dstart);
			    for (let i = 0; i < userTrades.length; i++) {
				let tmp = new Date(userTrades[i].timestamp * 1000);
				let leftC = rightC = feeC = left = right = fee = 0;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				if (left !== '' && left !== 0 && leftC !== 0) { wallet.editBalance(userTrades[i].exchange, leftC, left); }
				if (right !== '' && right !== 0 && rightC !== 0) { wallet.editBalance(userTrades[i].exchange, rightC, right * -1); }
				if (fee !== '' && fee !== 0 && feeC !== 0) { wallet.editBalance(userTrades[i].exchange, feeC, fee * -1); }
				if (tmp.getFullYear() < ystart) { continue; }
				if (tmp.getMonth() + 1 < mstart) { continue; }
				if (tmp.getDate() < dstart) { continue; }
				let current = new Date();
				let ydest = current.getFullYear();
				let mdest = current.getMonth() + 1;
				let ddest = current.getDate();
				if (userTrades[i + 1] !== undefined) {
				    current = new Date(userTrades[i + 1].timestamp * 1000);
				    ydest = current.getFullYear();
				    mdest = current.getMonth() + 1;
				    ddest = current.getDate();
				}
				if (ydest === ystart && mdest === mstart && ddest === dstart) { continue; }
				let tmpBalances = [];
				for (let k = 0; k < wallet.getHeldCurrencies().length; k++) {
				    let processing = wallet.getHeldCurrencies()[k];
				    tmpBalances.push({ curid: processing, volume: pf(wallet.getBalanceByCurrency(processing), 8) });
				}
				logger.debug(`from ${ystart}/${mstart}/${dstart} to ${ydest}/${mdest}/${ddest}`)
				while (ystart <= ydest || mstart <= mdest || dstart <= ddest) {
				    if (ystart === ydest && mstart === mdest && dstart === ddest) { break; }
				    walletHistory.push({ year: ystart, month: mstart, day: dstart, balances: tmpBalances });
				    logger.debug('month', mstart, 'has', new Date(ystart, mstart, 0).getDate(), 'days');
				    if (new Date(ystart, mstart, 0).getDate() === dstart) {
					dstart = 1;
					if (mstart === 12) { ystart++; mstart = 1; }
					else { mstart++; }
				    } else { dstart++; }
				}
			    }
			    let today = new Date();
			    let ytoday = today.getFullYear();
			    let mtoday = today.getMonth() + 1;
			    let dtoday = today.getDate();
			    let last = walletHistory[walletHistory.length - 1];
			    if (last.year !== ytoday || last.month !== mtoday || last.day !== dtoday) {
				let tmpBalances = [];
				for (let i = 0; i < wallet.getHeldCurrencies().length; i++) {
				    let processing = wallet.getHeldCurrencies()[i];
				    tmpBalances.push({ curid: processing, volume: pf(wallet.getBalanceByCurrency(processing), 8) });
				}
				logger.debug(`from ${ystart}/${mstart}/${dstart} to ${ytoday}/${mtoday}/${dtoday}`)
				while (ystart <= ytoday || mstart <= mtoday || dstart <= dtoday) {
				    walletHistory.push({ year: ystart, month: mstart, day: dstart, balances: tmpBalances });
				    logger.debug('month', mstart, 'has', new Date(ystart, mstart, 0).getDate(), 'days');
				    if (ystart === ytoday && mstart === mtoday && dstart === dtoday) { break; }
				    if (new Date(ystart, mstart, 0).getDate() === dstart) {
					dstart = 1;
					if (mstart === 12) { ystart++; mstart = 1; }
					else { mstart++; }
				    } else { dstart++; }
				}
			    }
			    if (userTrades[0] !== undefined && userTrades[0].timestamp !== undefined) {
				opts.firstTradeDateComment = helpers.renderDateAgo(userTrades[0].timestamp * 1000);
				if (opts.firstTradeDateComment > 1) {
				    opts.firstTradeDateComment += '&nbsp;days ago';
				} else { opts.firstTradeDateComment += '&nbsp;day ago'; }
				opts.firstTradeDateString = helpers.renderDateDay(userTrades[0].timestamp * 1000);
			    }
			    if (userTrades[userTrades.length - 1] !== undefined && userTrades[userTrades.length - 1].timestamp !== undefined) {
				opts.lastTradeDateComment = helpers.renderDateAgo(userTrades[userTrades.length - 1].timestamp * 1000);
				if (opts.lastTradeDateComment > 1) {
				    opts.lastTradeDateComment += '&nbsp;days ago';
				} else { opts.lastTradeDateComment += '&nbsp;day ago'; }
				opts.lastTradeDateString = helpers.renderDateDay(userTrades[userTrades.length - 1].timestamp * 1000);
			    }
			    opts.totalTradesComment = 'with&nbsp;' + wallet.getHeldCurrencies().length + '&nbsp;coins';
			    opts.totalTradesString = '' + userTrades.length + ' Trades';
			    for (let i = 0; i < walletHistory.length; i++) {
				let convertStamp = Math.round(new Date(walletHistory[i].year, walletHistory[i].month - 1, walletHistory[i].day, 0, 0, 0).getTime() / 1000);
				for (let k = 0; k < walletHistory[i].balances.length; k++) {
				    async.push(this._convert.getAt(walletHistory[i].balances[k].volume, walletHistory[i].balances[k].curid, opts.preferredCurrencyIndex, convertStamp)
						.then((price) => {
							if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) {
							    walletHistory[i].balances[k].custvalue = pf(price, 2);
							} else { walletHistory[i].balances[k].custvalue = pf(price, 8); }
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				}
			    }
			    wallet.getHeldCurrencies().forEach((processing) => {
				    async.push(this._convert.getLast(1, processing, opts.preferredCurrencyIndex)
						.then((price) => {
							let held = pf(wallet.getBalanceByCurrency(processing), 8);
							let value = pf(held * price, 8);
							if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { value = pf(value, 2); }
							opts.balances.push({
								curname: currencies.getCurrency(processing).tag,
								curheld: helpers.renderAmount(held),
								curid: processing, intprice: price, intvalue: value,
								curvalue: helpers.renderAmount(value),
								curprice: helpers.renderAmount(price) });
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				});
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [];
			    wallet.getHeldCurrencies().forEach((processing) => {
				    async.push(this._convert.getTrend(processing, opts.preferredTrendInterval)
						.then((rates) => {
							let trend = 0, trendL, trendR;
							if (rates.rightU !== 0 && rates.leftU !== 0) { trendL = rates.leftU; trendR = rates.rightU; }
							else if (rates.rightE !== 0 && rates.leftE !== 0) { trendL = rates.leftE; trendR = rates.rightE; }
							else if (rates.rightB !== 0 && rates.leftB !== 0) { trendL = rates.leftB; trendR = rates.rightB; }
							else { logError('failed processing some trend - missing db record'); return; }
							trend = helpers.getTrend(trendR, trendL);
							for (let i = 0; i < opts.balances.length; i++) {
							    if (opts.balances[i].curid === processing) {
								opts.balances[i].inttrend = trend;
								opts.balances[i].curtrend = helpers.renderTrend(trend);
								break;
							    }
							}
						    })
						.catch((e) => { logError('failed processing some trend', e); }));
				});
			    for (let i = 0; i < walletHistory.length; i++) {
				let val = spent = 0;
				for (let k = 0; k < walletHistory[i].balances.length; k++) {
				    if (currencies.getCurrency(walletHistory[i].balances[k].curid).isfiat === true) {
					spent = pf(spent + walletHistory[i].balances[k].custvalue, 2);
				    } else { val = pf(val + walletHistory[i].balances[k].custvalue, 2); }
				}
				let roi = pf(val + spent, 2);
				let graphStamp = new Date(walletHistory[i].year, walletHistory[i].month - 1, walletHistory[i].day, 0, 0, 0).getTime();
				opts.timebalance.push({ at: graphStamp, value: val, spent: spent, roi: roi });
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    let fiatBalance = cryptoHeld = cryptoBalance = 0;
			    for (let i = 0; i < opts.balances.length; i++) {
				let colorIdx = i >= helpers.genericColors().length ? i % helpers.genericColors().length : i;
				opts.balances[i].bodycolor = helpers.genericColors()[colorIdx].body;
				opts.balances[i].bordercolor = helpers.genericColors()[colorIdx].border;
				opts.balances[i].trendcolor = (opts.balances[i].inttrend >= 0) ? 'green' : 'red';
				opts.balances[i].color = (i % 2) ? 'even' : 'odd';
				cryptoBalance = pf(cryptoBalance + opts.balances[i].intvalue, 2);
				if (currencies.getCurrency(opts.balances[i].curid).isfiat === false) {
				    cryptoHeld = pf(cryptoHeld + opts.balances[i].intvalue, 2);
				}
				if (currencies.getCurrency(opts.balances[i].curid).tag === 'BTC') {
				    opts.bitcoin24hTrend = helpers.renderTrend(opts.balances[i].inttrend);
				    opts.bitcoin24hClass = helpers.renderTrendClass(opts.balances[i].inttrend);
				} else if (currencies.getCurrency(opts.balances[i].curid).tag === 'ETH') {
				    opts.ethereum24hTrend = helpers.renderTrend(opts.balances[i].inttrend);
				    opts.ethereum24hClass = helpers.renderTrendClass(opts.balances[i].inttrend);
				} else if (currencies.getCurrency(opts.balances[i].curid).tag === 'LTC') {
				    opts.litecoin24hTrend = helpers.renderTrend(opts.balances[i].inttrend);
				    opts.litecoin24hClass = helpers.renderTrendClass(opts.balances[i].inttrend);
				}
			    }
			    let async = [];
			    for (let i = 0; i < wallet.getExchanges().length; i++) {
				let processing = wallet.getExchanges()[i];
				for (let k = 0; k < opts.balances.length; k++) {
				    if (currencies.getCurrency(opts.balances[k].curid).tag === 'BTC') { btcIdx = currencies.getCurrency(opts.balances[k].curid).id; }
				    if (currencies.getCurrency(opts.balances[k].curid).isfiat === true) {
					fiatBalance = pf(fiatBalance + wallet.getCurrencyBalanceByExchange(opts.balances[k].curid, processing), 8);
				    } else {
					if (wallet.getCurrencyBalanceByExchange(opts.balances[k].curid, processing).toString() !== '0') {
					    async.push(this._convert.getLast(wallet.getCurrencyBalanceByExchange(opts.balances[k].curid, processing), opts.balances[k].curid, opts.preferredCurrencyIndex)
							.then((value) => { convertedBalances.push({ label: processing, held: value }) })
							.catch((e) => { logError('failed converting some exchanges balance to preferred currency', e); }));
					}
				    }
				}
			    }
			    opts.totalCoin = cryptoHeld;
			    opts.totalFiat = fiatBalance;
			    opts.totalCrypto = cryptoBalance;
			    opts.totalCoinValue = helpers.renderAmount(cryptoHeld);
			    opts.totalFiatValue = helpers.renderAmount(fiatBalance);
			    opts.totalAccountValue = helpers.renderAmount(cryptoBalance);
			    let compareItem = opts.timebalance[opts.timebalance.length - 1];
			    let compareWith = opts.timebalance[opts.timebalance.length > 2 ? opts.timebalance.length - 2 : 0];
			    if (opts.preferredTrendInterval === '7d') {
				compareWith = opts.timebalance[opts.timebalance.length > 8 ? opts.timebalance.length - 8 : 0];
			    } else if (opts.preferredTrendInterval === '30d') {
				compareWith = opts.timebalance[opts.timebalance.length > 31 ? opts.timebalance.length - 31 : 0];
			    } //else: 1h or 24h, counting trend based on yesterday
			    opts.totalCoinTrend = helpers.getTrend(compareItem.value, compareWith.value);
			    opts.totalAccountTrend = helpers.getTrend(compareItem.roi, compareWith.roi);
			    opts.totalFiatTrend = helpers.getTrend(compareItem.spent, compareWith.spent);
			    return Promise.all(async);
			})
		    .then(() => {
			    let knownExchanges = [];
			    for (let i = 0; i < convertedBalances.length; i++) { if (knownExchanges.indexOf(convertedBalances[i].label) < 0) { knownExchanges.push(convertedBalances[i].label); } }
			    for (let i = 0; i < knownExchanges.length; i++) {
				let balance = 0;
				let colorIdx = i >= helpers.genericColors().length ? i % helpers.genericColors().length : i;
				for (let k = 0; k < convertedBalances.length; k++) {
				    if (convertedBalances[k].label === knownExchanges[i]) { balance = pf(balance + convertedBalances[k].held, 8); }
				}
				logger.debug(`exchange ${knownExchanges[i]} holds ${balance} EUR`);
				opts.exchanges.push({ bodycolor: helpers.genericColors()[colorIdx].body, bordercolor: helpers.genericColors()[colorIdx].border, wallet: knownExchanges[i], intvalue: balance });
			    }
			    return this._convert.getLast(1, opts.preferredCurrencyIndex, btcIdx);
			})
		    .then((convertionRate) => {
			    opts.totalCoinBTCValue = helpers.renderAmount(pf(opts.totalCoin * convertionRate, 2));
			    opts.totalCoin24hTrend = helpers.renderTrend(opts.totalCoinTrend);
			    opts.totalCoin24hClass = helpers.renderTrendClass(opts.totalCoinTrend);
			    opts.totalFiatBTCValue = helpers.renderAmount(pf(opts.totalFiat * convertionRate, 2));
			    opts.totalFiat24hTrend = helpers.renderTrend(opts.totalFiatTrend);
			    opts.totalFiat24hClass = helpers.renderTrendClass(opts.totalFiatTrend);
			    opts.totalAccountBTCValue = helpers.renderAmount(pf(opts.totalCrypto * convertionRate, 2));
			    opts.totalAccountValue24hTrend = helpers.renderTrend(opts.totalAccountTrend);
			    opts.totalAccountValue24hClass = helpers.renderTrendClass(opts.totalAccountTrend);
			    logger.debug(opts);
			    servePage(res, 'dashboard', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/disable2fa', (req, res) => {
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Disable 2FA' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/disable2fa', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Disable 2FA' };
		let userInput = '0';
		this._check.cmdValidation(req, res, 'confirm-2fa')
		    .then((params) => {
			    userInput = params.confirm2FA || '0';
			    return db.read(`SELECT twofasecret FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((secret) => {
			    let validObject = { secret: secret[0].twofasecret.toString(), encoding: 'base32', token: userInput };
			    if (require('speakeasy').totp.verify(validObject)) {
				return db.write(`UPDATE users SET twofavalid = 0, twofasecret = '' WHERE id = ${req.session.userid}`);
			    }
			    throw({ code: 403, msg: '2FA code invalid' });
			})
		    .then(() => res.redirect('/settings'))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/doubleentry', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Trades List', trades: [] };
		let userTz = 0;
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => { return db.read(`SELECT timezone FROM users WHERE id = ${req.session.userid}`); })
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    return db.read(`SELECT id, left, right, fee, lamount, ramount, famount, timestamp, exchange, groups, comment, type FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp DESC`);
			})
		    .then((transactions) => {
			    for (let i = 0, oddeven = 'even'; i < transactions.length; i++) {
				let left = leftc = right = rightc = fee = feec = '';
				if (transactions[i].lamount !== 0 && transactions[i].lamount !== '') {
				    left = helpers.renderAmount(transactions[i].lamount);
				    leftc = currencies.getCurrency(transactions[i].left).tag;
				    let ttype = transactions[i].type === 'Trade' ? 'Buy' : transactions[i].type;
				    opts.trades.push({ id: transactions[i].id, type: `${ttype} (IN)`, currency: leftc,
					    typeclass: helpers.renderTradeClass(transactions[i].type), oddeven: oddeven, amount: left,
					    exchange: transactions[i].exchange, group: transactions[i].groups, comment: transactions[i].comment,
					    timestring: helpers.renderDate((transactions[i].timestamp + (userTz * 60)) * 1000) });
				    oddeven = (oddeven === 'even' ? 'odd' : 'even');
				}
				if (transactions[i].ramount !== 0 && transactions[i].ramount !== '') {
				    right = helpers.renderAmount(transactions[i].ramount);
				    rightc = currencies.getCurrency(transactions[i].right).tag;
				    let ttype = transactions[i].type === 'Trade' ? 'Sell' : transactions[i].type;
				    opts.trades.push({ id: transactions[i].id, type: `${ttype} (OUT)`, currency: rightc,
					    typeclass: helpers.renderTradeClass(transactions[i].type), oddeven: oddeven, amount: right,
					    exchange: transactions[i].exchange, group: transactions[i].groups, comment: transactions[i].comment,
					    timestring: helpers.renderDate((transactions[i].timestamp + (userTz * 60)) * 1000) });
				    oddeven = (oddeven === 'even' ? 'odd' : 'even');
				}
				if (transactions[i].famount !== 0 && transactions[i].famount !== '') {
				    fee = helpers.renderAmount(transactions[i].famount);
				    feec = currencies.getCurrency(transactions[i].fee).tag;
				    opts.trades.push({ id: transactions[i].id, type: `Fee (OUT)`, currency: feec,
					    typeclass: helpers.renderTradeClass('Spend'), oddeven: oddeven, amount: fee,
					    exchange: transactions[i].exchange, group: transactions[i].groups, comment: transactions[i].comment,
					    timestring: helpers.renderDate((transactions[i].timestamp + (userTz * 60)) * 1000) });
				    oddeven = (oddeven === 'even' ? 'odd' : 'even');
				}
			    }
			    logger.debug(opts);
			    servePage(res, 'doubleentry', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/dropcoins', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Drop Coins' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/dropcoins', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Drop Coins' };
		this._check.cmdValidation(req, res, 'dropcoins')
		    .then((params) => {
			    if (params.tradeId !== undefined && params.tradeId >= 1) {
				return db.write(`DELETE FROM trades WHERE id = ${params.tradeId} AND userid = ${req.session.userid}`);
			    } else { throw new Error('invalid transaction ID'); }
			})
		    .then(() => { res.redirect('/entercoins'); })
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/dropemail', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Drop Email' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/dropemail', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Drop Email' };
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.write(`UPDATE users SET email = '', emailverified = 0 WHERE id = ${req.session.userid}`))
		    .then(() => { res.redirect('/settings'); })
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/enable2fa', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Enable 2FA' };
		let secret = false;
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => {
			    secret = require('speakeasy').generateSecret({ length: 16, name: 'OpenCoinTracking', issuer: 'UTGB', 'google_auth_qr': false });
			    return db.write(`UPDATE users SET twofasecret = '${secret.base32}', twofavalid = 0 WHERE id = ${req.session.userid}`);
			})
		    .then(() => {
			    if (secret !== false && secret.otpauth_url !== undefined) {
				return new Promise((resolve, reject) => {
					require('qrcode').toDataURL(secret.otpauth_url, (err, data_url) => {
						    if (err) { reject({ code: 500, msg: 'failed generating QRcode' }); }
						    else { resolve(data_url); }
						});
				    });
			    }
			    throw({ code: 500, msg: 'failed generating 2FA code' });
			})
		    .then((data) => {
			    opts.twofadata = data;
			    logger.debug(opts);
			    servePage(res, '2fa', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/entercoins', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Enter Coins', haspages: [], limitpicker: [], monthpicker: [], trades: [], yearpicker: [] };
		let exportFmt = false, userTz = 0, maxPerPage = 100;
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => { return db.read(`SELECT maxperpage, timezone FROM users WHERE id = ${req.session.userid}`); })
		    .then((userPrefs) => {
			    if (req.query !== undefined && req.query.exportFmt !== undefined) { exportFmt = req.query.exportFmt }
			    if (userPrefs.length > 0) {
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) { userTz = helpers.genericTimeZones()[i].toGMT; }
				}
				maxPerPage = userPrefs[0].maxperpage;
			    }
			    for (let i = 0; i < helpers.genericLimits().length; i++) {
				let item = helpers.genericLimits()[i];
				if (item.value === maxPerPage) { opts.limitpicker.push({ value: item.value, label: item.label, sfx: ' selected' }); }
				else { opts.limitpicker.push({ value: item.value, label: item.label, sfx: '' }); }
			    }
			    return db.read(`SELECT id, left, right, fee, lamount, ramount, famount, timestamp, exchange, groups, comment, type FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp DESC`, 'none')
			})
		    .then((transactions) => {
			    let time = new Date();
			    let monthNames = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
			    for (let i = 0; i < monthNames.length; i++) {
				if (time.getMonth() === i) { opts.monthpicker.push({ value: i, name: monthNames[i], sfx: ' selected' }); }
				else { opts.monthpicker.push({ value: i, name: monthNames[i], sfx: '' }); }
			    }
			    for (let i = 2007; i < time.getFullYear() + 5; i++) {
				if (time.getFullYear() === i) { opts.yearpicker.push({ value: i, sfx: ' selected' }); }
				else { opts.yearpicker.push({ value: i, sfx: '' }); }
			    }
			    for (let i = 0; i < transactions.length; i++) {
				let oddeven = (i % 2) ? 'odd' : 'even',
				    left = leftc = right = rightc = fee = feec = '';
				if (transactions[i].lamount !== 0 && transactions[i].lamount !== '') {
				    left = helpers.renderAmount(transactions[i].lamount);
				    leftc = currencies.getCurrency(transactions[i].left).tag;
				}
				if (transactions[i].ramount !== 0 && transactions[i].ramount !== '') {
				    right = helpers.renderAmount(transactions[i].ramount);
				    rightc = currencies.getCurrency(transactions[i].right).tag;
				}
				if (transactions[i].famount !== 0 && transactions[i].famount !== '') {
				    fee = helpers.renderAmount(transactions[i].famount);
				    feec = currencies.getCurrency(transactions[i].fee).tag;
				}
				opts.trades.push({ id: transactions[i].id, type: transactions[i].type, oddeven: oddeven,
					typeclass: helpers.renderTradeClass(transactions[i].type),
					bought: left, boughtcurrency: leftc, amount: right, currency: rightc, txfee: fee, feecurrency: feec,
					exchange: transactions[i].exchange, group: transactions[i].groups, comment: transactions[i].comment,
					timestring: helpers.renderDate((transactions[i].timestamp + (userTz * 60)) * 1000)
				    });
			    }
			    if (exportFmt === 'csv') {
				logError('FIXME CSV export');
			    } else if (exportFmt === 'pdf') {
				servePdf(res, 'entercoins', opts);
			    } else {
				opts.maxidx = opts.trades.length;
				opts.pageclass = 'pagination';
				opts.nextoffset = 1;
				opts.prevoffset = 1;
				opts.startidx = 1;
				opts.stopidx = opts.maxidx;
				if (req.query.showAll === undefined && maxPerPage !== 0) {
				    let offset = req.query.offset || 1;
				    opts.startidx = (offset - 1) * maxPerPage;
				    opts.stopidx = (opts.startidx + maxPerPage < opts.maxidx) ? opts.startidx + maxPerPage : opts.maxidx;
				    let paginated = opts.trades.slice(opts.startidx, opts.stopidx);
				    opts.startidx++;
				    opts.trades = [];
				    opts.trades = paginated;
				    let total = Math.ceil(opts.maxidx / maxPerPage);
				    for (let i = 0; i < total; i++) {
					if (offset === i) { opts.haspages.push({ value: i + 1, sfx: ' selected' }); }
					else { opts.haspages.push({ value: i + 1, sfx: '' }); }
				    }
				    opts.nextoffset = (offset < total ? offset + 1 : offset);
				    opts.prevoffset = (offset > 1 ? offset - 1 : 1);
				} else { opts.pageclass = 'hidden' }
				logger.debug(opts);
				servePage(res, 'entercoins', opts);
			    }
			})
		    .catch((e) => serverError(res, opts, e));
	    });
	app.post('/entercoins', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Enter Coins' };
		this._check.cmdValidation(req, res, 'post-coins')
		    .then((params) => {
			    let leftC = rightC = feeC = 1,
				query = left = right = fee = '',
				comment = params.comment || '',
				groups = params.groups || '',
				timestamp = params.timestamp,
				wallet = params.wallet || '';
			    if (params.operation === 'Trade') {
				left = params.value; leftC = currencies.getIndex(params.currency);
				right = params.paid; rightC = currencies.getIndex(params.paidcurrency);
				fee = params.feed; feeC = currencies.getIndex(params.feedcurrency);
				query = `INSERT INTO trades (left, right, fee, lamount, ramount, famount, userid, timestamp, exchange, groups, comment, type) VALUES (${leftC}, ${rightC}, ${feeC}, ${left}, ${right}, ${fee}, ${req.session.userid}, ${timestamp}, '${wallet}', '${groups}', '${comment}', 'Trade')`;
			    } else if (['Deposit', 'Income', 'Mining', 'Gifted'].indexOf(params.operation) >= 0) {
				left = params.value; leftC = currencies.getIndex(params.currency);
				fee = params.feed; feeC = currencies.getIndex(params.feedcurrency);
				query = `INSERT INTO trades (left, fee, lamount, famount, userid, timestamp, exchange, groups, comment, type) VALUES (${leftC}, ${feeC}, ${left}, ${fee}, ${req.session.userid}, ${timestamp}, '${wallet}', '${groups}', '${comment}', '${params.operation}')`;
			    } else if (['Withdrawal', 'Spend', 'Donation', 'Gift'].indexOf(params.operation) >= 0) {
				right = params.value; rightC = currencies.getIndex(params.currency);
				fee = params.feed; feeC = currencies.getIndex(params.feedcurrency);
				query = `INSERT INTO trades (right, fee, ramount, famount, userid, timestamp, exchange, groups, comment, type) VALUES (${leftC}, ${feeC}, ${left}, ${fee}, ${req.session.userid}, ${timestamp}, '${wallet}', '${groups}', '${comment}', '${params.operation}')`;
			    } else if (params.operation === 'Transfert') {
				left = params.value; leftC = currencies.getIndex(params.currency);
				fee = params.feed; feeC = currencies.getIndex(params.feedcurrency);
				let reslt = left;
				query = `INSERT INTO trades (right, fee, ramount, famount, userid, timestamp, exchange, comment, type) VALUES (${leftC}, ${feeC}, ${left}, ${fee}, ${req.session.userid}, ${timestamp}, '${wallet}', '${comment}', 'Withdrawal'); `;
				if (feeC === leftC) { reslt = left - fee; }
				query += `INSERT INTO trades (left, lamount, userid, timestamp, exchange, comment, type) VALUES (${leftC}, ${reslt}, ${req.session.userid}, ${timestamp}, '${groups}', '${comment}', 'Deposit')`;
			    } else {
				left = params.value; leftC = currencies.getIndex(params.currency);
				query = `INSERT INTO trades (right, ramount, userid, timestamp, exchange, groups, comment, type) VALUES (${leftC}, ${reslt}, ${req.session.userid}, ${timestamp}, '${wallet}', '${groups}', '${comment}', '${params.operation}')`;
			    }
			    return db.write(query);
			})
		    .then(() => res.redirect('/entercoins'))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/fees', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Fees', currencies: [], feebyexchanges: [], trades: [] };
		let tx = [], btcIndex = 0, userTz = 0;
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => db.read(`SELECT preferredcurrency, timezone FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.id === opts.preferredCurrencyIndex) { opts.preferredCurrency = item.tag; }
				if (item.tag === 'BTC') { btcIndex = item.id }
				if (item.tag == opts.preferredCurrency) { opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' }); }
				else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    return db.read(`SELECT id, left, right, fee, lamount, ramount, famount, timestamp, exchange, groups, comment, type FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp DESC`);
			})
		    .then((transactions) => {
			    let async = [];
			    for (let i = 0; i < transactions.length; i++) {
				let feec = fee = left = leftc = right = rightc = '';
				let timestamp = transactions[i].timestamp;
				if (transactions[i].famount !== 0 && transactions[i].famount !== '') {
				    fee = transactions[i].famount;
				    feec = transactions[i].fee;
				    async.push(this._convert.getAt(fee, feec, opts.preferredCurrencyIndex, transactions[i].timestamp)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].boughtcurrency === tx[k].boughtcurrency && tx[i].bought === tx[k].bought) {
								tx[k].feecustvalue = pf(convert, 8);
								return;
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				    async.push(this._convert.getAt(fee, feec, btcIndex, transactions[i].timestamp)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].boughtcurrency === tx[k].boughtcurrency && tx[i].bought === tx[k].bought) {
								tx[k].feebtcvalue = pf(convert, 8);
								return;
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				    async.push(this._convert.getLast(fee, feec, opts.preferredCurrencyIndex)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].boughtcurrency === tx[k].boughtcurrency && tx[i].bought === tx[k].bought) {
								tx[k].feecustnow = pf(convert, 8);
								return;
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				}
				if (transactions[i].lamount !== 0 && transactions[i].lamount !== '') {
				    left = transactions[i].lamount;
				    leftc = transactions[i].left;
				}
				if (transactions[i].ramount !== 0 && transactions[i].ramount !== '') {
				    right = transactions[i].ramount;
				    rightc = transactions[i].right;
				}
				tx.push({ id: transactions[i].id, type: transactions[i].type, bought: left,
					boughtcurrency: leftc, amount: right, currency: rightc,
					exchange: transactions[i].exchange, fee: fee, feec: feec,
					timestamp: timestamp
				    });
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [], seen = [];
			    for (let i = 0; i < tx.length; i++) {
				let left = leftc = right = rightc = fee = feec = feecustnow = feecustthen = feecustsfx = '';
				let oddeven = (i % 2) ? 'odd' : 'even';
				if (tx[i].bought !== '') {
				    left = helpers.renderAmount(tx[i].bought);
				    leftc = currencies.getCurrency(tx[i].boughtcurrency).tag;
				}
				if (tx[i].amount !== '') {
				    right = helpers.renderAmount(tx[i].amount);
				    rightc = currencies.getCurrency(tx[i].currency).tag;
				}
				if (tx[i].fee !== '') {
				    fee = helpers.renderAmount(tx[i].fee);
				    feec = currencies.getCurrency(tx[i].feec).tag;
				    if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) {
					feecustthen = helpers.renderAmount(pf(tx[i].feecustvalue, 2));
					feecustnow = helpers.renderAmount(pf(tx[i].feecustnow, 2));
				    } else {
					feecustthen = helpers.renderAmount(tx[i].feecustvalue);
					feecustnow = helpers.renderAmount(tx[i].feecustnow);
				    }
				    feecustsfx = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
				}
				logger.debug(`processing transaction ${tx[i].type}:${tx[i].id}:${tx[i].timestamp} left:${left}:${leftc} right:${right}:${rightc} ${fee}/${feecustthen}/${feecustnow} ${feec}`);
				if (seen.indexOf(tx[i].exchange) < 0) { seen.push(tx[i].exchange); }
				opts.trades.push({ id: tx[i].id, type: tx[i].type, oddeven: oddeven,
					typeclass: helpers.renderTradeClass(tx[i].type), fee: fee, feec: feec,
					bought: left, boughtcurrency: leftc, feecustsfx: feecustsfx,
					amount: right, currency: rightc, feecustnow: feecustnow,
					exchange: tx[i].exchange, feecustthen: feecustthen,
					timestring: helpers.renderDate((tx[i].timestamp + (userTz * 60)) * 1000) });
			    }
			    for (let i = 0; i < seen.length; i++) {
				let exFees = [], totalExchange = totalExchangeBtc = 0;
				for (let k = 0; k < opts.currencies.length; k++) {
				    let totalFee = totalCust = totalBtc = 0;
				    for (l = 0; l < tx.length; l++) {
					if (tx[l].exchange === seen[i] && tx[l].feec === opts.currencies[k].id) {
					    totalFee = pf(totalFee + tx[l].fee, 8);
					    totalCust = pf(totalCust + tx[l].feecustvalue, 8);
					    totalBtc = pf(totalBtc + tx[l].feebtcvalue, 8);
					}
				    }
				    if (totalFee !== 0) {
					totalExchange = pf(totalExchange + totalCust, 8);
					totalExchangeBtc = pf(totalExchangeBtc + totalBtc, 8);
					exFees.push({
						btc: helpers.renderAmount(totalBtc), intamount: totalCust,
						currency: currencies.getCurrency(opts.currencies[k].id).tag,
						cust: helpers.renderAmount(totalCust),
						value: helpers.renderAmount(totalFee) });
				    }
				}
				if (exFees.length > 0) {
				    let margin = 5;
				    if (exFees.length < 2) { margin = 55; }
				    else if (exFees.length < 3) { margin = 45; }
				    else if (exFees.length < 4) { margin = 35; }
				    else if (exFees.length < 5) { margin = 25; }
				    else if (exFees.length < 6) { margin = 15; }
				    if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) {
					totalExchange = pf(totalExchange, 2);
				    }
				    opts.feebyexchanges.push({
					    label: seen[i], fees: exFees, margin: margin,
					    totalcust: helpers.renderAmount(totalExchange),
					    totalbtc: helpers.renderAmount(totalExchangeBtc), });
				}
			    }
			    logger.debug(opts);
			    servePage(res, 'fees', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });


	app.get('/gains', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Realized and Unrealized Gains', total: [], realized: [], sell: [], unrealized: [] };
		let trades = [], sells = [], ctotal = [];
		let userTz = 0, cprecision = 8;
		let wallet = new balances();
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => db.read(`SELECT preferredcurrency, timezone FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { cprecision = 2; }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp ASC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [], clist = [];
			    for (let i = 0; i < userTrades.length; i++) {
				if (['Deposit', 'Withdrawal', 'Lost'].indexOf(userTrades[i].type) >= 0) { continue; }
				let leftC = rightC = feeC = left = right = fee = 0;
				let timestamp = userTrades[i].timestamp;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				//if (left !== '' && left !== 0 && leftC !== 0) { wallet.editBalance(userTrades[i].exchange, leftC, left); }
				//if (right !== '' && right !== 0 && rightC !== 0) { wallet.editBalance(userTrades[i].exchange, rightC, right * -1); }
				//if (fee !== '' && fee !== 0 && feeC !== 0) { wallet.editBalance(userTrades[i].exchange, feeC, fee * -1); }
				if (left !== '' && leftC !== 0 && right !== '' && rightC !== 0) {
				    if (currencies.getCurrency(leftC).isfiat === false) { if (clist.indexOf(leftC) < 0) { clist.push(leftC); } }
				    let object = { amount: left, currency: leftC, cost: right, rightc: rightC, timestamp: timestamp };
				    trades.push(object);
				    let update = trades[trades.length - 1];
				    async.push(this._convert.getAt(1, rightC, opts.preferredCurrencyIndex, userTrades[i].timestamp)
						.then((price) => {
							update.costpu = pf((update.cost / update.amount) * price, cprecision);
							update.costcust = pf(update.cost * price, cprecision);
							return this._convert.getLast(1, update.currency, opts.preferredCurrencyIndex);
						    })
						.then((price) => {
							update.pricepu = pf(price, cprecision);
							update.pricechange = helpers.getTrend(update.pricepu, update.costpu);
							update.value = pf(update.amount * price, cprecision);
							update.gain = pf(update.value - update.costcust, cprecision);
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				}
				if (right !== '' && rightC !== 0 && currencies.getCurrency(rightC).isfiat === false) {
				    let holds = [], object = {
					    amount: right, currency: rightC,
					    prices: [], timestamp: userTrades[i].timestamp
					};
				    for (let k = i - 1; k >= 0; k--) {
					if (userTrades[k].left === rightC && userTrades[k].lamount !== '' && userTrades[k].lamount !== 0) {
					    if (userTrades[k].right !== '' && userTrades[k].right !== 0 && userTrades[k].ramount !== 0 && userTrades[k].ramount !== '') {
						holds.push({ currency: userTrades[k].right, spent: userTrades[k].ramount, timestamp: userTrades[k].timestamp, qtt: userTrades[k].lamount });
					    }
					}
				    }
				    sells.push(object);
				    let update = sells[sells.length - 1];
				    for (let k = 0; k < holds.length; k++) {
					if (holds[k].currency === opts.preferredCurrencyIndex) {
					    update.prices.push({ bought: holds[k].qtt, priced: holds[k].spent });
					} else {
					    async.push(this._convert.getAt(holds[k].spent, holds[k].currency, opts.preferredCurrencyIndex, holds[k].timestamp)
						    .then((price) => { update.prices.push({ bought: holds[k].qtt, priced: price }); })
						    .catch((e) => { logError('failed processing some currency', e); }));
					}
				    }
				    if (left !== '' && leftC !== 0) {
					async.push(this._convert.getAt(left, leftC, opts.preferredCurrencyIndex, userTrades[i].timestamp)
						    .then((price) => { update.sold = price; })
						    .catch((e) => { logError('failed processing some currency', e); }));
					async.push(this._convert.getLast(1, rightC, opts.preferredCurrencyIndex)
						    .then((price) => { update.price = price; })
						    .catch((e) => { logError('failed processing some currency', e); }));
				    } else {
					async.push(this._convert.getLast(1, rightC, opts.preferredCurrencyIndex)
						    .then((price) => {
							    update.sold = pf(price * update.amount, 8);
							    update.price = price;
							})
						    .catch((e) => { logError('failed processing some currency', e); }));
				    }
				}
			    }
			    for (let i = 0; i < clist.length; i++) {
				let holds = [], totalBought = totalHeld = totalSold = 0;
				for (let k = 0; k < userTrades.length; k++) {
				    if (userTrades[k].left === clist[i] && userTrades[k].lamount !== '' && userTrades[k].lamount !== 0) {
					if (userTrades[k].ramount !== '' && userTrades[k].ramount !== 0) {
					    holds.push({ currency: userTrades[k].right, spent: userTrades[k].ramount, timestamp: userTrades[k].timestamp });
					}
					totalHeld = pf(totalHeld + userTrades[k].lamount, 8);
					totalBought = pf(totalBought + userTrades[k].lamount, 8);
				    }
				    if (userTrades[k].right === clist[i] && userTrades[k].ramount !== '' && userTrades[k].ramount !== 0) {
					totalHeld = pf(totalHeld - userTrades[k].ramount, 8);
					totalSold = pf(totalSold + userTrades[k].ramount, 8);
				    }
				    if (userTrades[k].fee === clist[i] && userTrades[k].famount !== '' && userTrades[k].famount !== 0) { totalHeld = pf(totalHeld - userTrades[k].famount, 8); }
				}
				ctotal.push({ currency: clist[i], held: totalHeld, bought: totalBought, sold: totalSold, prices: [] });
				let update = ctotal[ctotal.length - 1];
				for (let k = 0; k < holds.length; k++) {
				    async.push(this._convert.getAt(holds[k].spent, holds[k].currency, opts.preferredCurrencyIndex, holds[k].timestamp)
					    .then((price) => { update.prices.push(price); })
					    .catch((e) => { logError('failed processing some currency', e); }));
				}
				async.push(this._convert.getLast(1, clist[i], opts.preferredCurrencyIndex)
					.then((price) => {
						update.price = price;
						update.value = pf(price * update.held, 8);
					    })
					.catch((e) => { logError('failed processing some currency', e); }));
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    let sumBought = sumHeld = sumUgain = sumRgain = 0;
			    for (let i = 0; i < sells.length; i++) {
				let oddeven = (i % 2) ? 'odd' : 'even';
				let cumulatedCostPerUnit = held = 0, tradetype = 'Sell', tradeclass = 'green';
				for (let k = 0; k < sells[i].prices.length; k++) {
				    cumulatedCostPerUnit = pf(cumulatedCostPerUnit + sells[i].prices[k].priced, 8);
				    held = pf(held + sells[i].prices[k].bought, 8);
				}
				cumulatedCostPerUnit = pf(cumulatedCostPerUnit / held, cprecision);
				let cumulatedCost = pf(cumulatedCostPerUnit * sells[i].amount, cprecision);
				let change = helpers.getTrend(sells[i].price, cumulatedCostPerUnit);
				sells[i].gain = pf(sells[i].sold - cumulatedCost, 8);
				if (sells[i].cost === 0) {
				    tradetype = 'Give';
				    tradeclass = 'kindayellow';
				}
				opts.realized.unshift({
					tradetype: tradetype, tradeclass: tradeclass,
					amount: helpers.renderAmount(sells[i].amount),
					currency: currencies.getCurrency(sells[i].currency).tag,
					ccostpu: helpers.renderAmount(cumulatedCostPerUnit),
					pricepu: helpers.renderAmount(pf(sells[i].price, cprecision)),
					change: helpers.renderTrend(change), oddeven: oddeven,
					changeclass: helpers.renderTrendClass(change),
					ccost: helpers.renderAmount(cumulatedCost),
					curid: sells[i].currency, intsold: sells[i].sold,
					sold: helpers.renderAmount(pf(sells[i].sold, cprecision)),
					gain: helpers.renderAmount(pf(sells[i].gain, cprecision)), 
					gainclass: helpers.renderGainClass(sells[i].gain), 
					timestring: helpers.renderDate((sells[i].timestamp + (userTz * 60)) * 1000) });
			    }
			    for (let i = 0; i < ctotal.length; i++) {
				let bought = ugain = rgain = sumSold = 0;
				for (let k = 0; k < ctotal[i].prices.length; k++) { bought = pf(bought + ctotal[i].prices[k], 8); }
				for (let k = 0; k < sells.length; k++) { if (sells[k].currency === ctotal[i].currency) { sumSold = pf(sumSold + sells[k].sold); } }
				let costpu = pf(bought / ctotal[i].bought, cprecision);
				let change = helpers.getTrend(ctotal[i].price, costpu);
				sumBought = pf(sumBought + bought, 8);
				sumHeld = pf(sumHeld + ctotal[i].value, 8);
				for (let k = 0; k < trades.length; k++) {
				    if (trades[k].currency === ctotal[i].currency) { ugain = pf(ugain + trades[k].gain, 8); }
				}
				for (let k = 0; k < sells.length; k++) {
				    if (sells[k].currency === ctotal[i].currency) { rgain = pf(rgain + sells[k].gain, 8); }
				}
				sumRgain = pf(sumRgain + rgain);
				ugain = pf(ugain - rgain, 8);
				sumUgain = pf(sumUgain + ugain, 8);
				opts.total.push({
					held: ctotal[i].held, costpu: helpers.renderAmount(costpu),
					lastprice: helpers.renderAmount(ctotal[i].price),
					currency: currencies.getCurrency(ctotal[i].currency).tag,
					change: helpers.renderTrend(change),
					tradeclass: helpers.renderTrendClass(change),
					cost: helpers.renderAmount(pf(bought - sumSold, cprecision)),
					value: helpers.renderAmount(pf(ctotal[i].value, cprecision)),
					ugain: helpers.renderAmount(pf(ugain, cprecision)),
					ugainclass: helpers.renderGainClass(ugain),
					rgain: helpers.renderAmount(pf(rgain, cprecision)),
					rgainclass: helpers.renderGainClass(rgain) });
			    }
			    let totalchange = helpers.getTrend(sumHeld, sumBought);
			    opts.totalchange = helpers.renderTrend(totalchange);
			    opts.totalchangeclass = helpers.renderTrendClass(totalchange);
			    opts.totalspent = helpers.renderAmount(pf(sumBought, cprecision));
			    opts.totalheld = helpers.renderAmount(pf(sumHeld, cprecision));
			    opts.totalugain = helpers.renderAmount(pf(sumUgain, cprecision));
			    opts.totalugainclass = helpers.renderGainClass(sumUgain);
			    opts.totalrgain = helpers.renderAmount(pf(sumRgain, cprecision));
			    opts.totalrgainclass = helpers.renderGainClass(sumRgain);
			    for (let i = trades.length - 1; i >= 0; i--) {
				let oddeven = (i % 2) ? 'odd' : 'even';
				opts.unrealized.push({
					tradetype: 'Buy', tradeclass: 'green',
					amount: helpers.renderAmount(trades[i].amount),
					currency: currencies.getCurrency(trades[i].currency).tag,
					costpu: helpers.renderAmount(trades[i].costpu),
					pricepu: helpers.renderAmount(trades[i].pricepu),
					change: helpers.renderTrend(trades[i].pricechange),
					changeclass: helpers.renderTrendClass(trades[i].pricechange),
					cost: helpers.renderAmount(trades[i].costcust), oddeven: oddeven,
					value: helpers.renderAmount(trades[i].value),
					gain: helpers.renderAmount(trades[i].gain),
					gainclass: helpers.renderGainClass(trades[i].gain),
					timestring: helpers.renderDate((trades[i].timestamp + (userTz * 60)) * 1000) });
			    }
			    //FIXME: substract realized gains from unrealized ones, somehhow ...
			    logger.debug(opts);
			    servePage(res, 'gains', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/login', (req, res) => {
		getProbe.mark();
		let opts = { pagetitle: 'Log In', twofadata: '', altlabel: 'Login <b>using</b> 2FA code', alturl: '/login2fa' };
		if (req.session.userid !== undefined && req.session.userid !== false) { res.redirect('/dashboard'); }
		this._check.cmdValidation(req, res, 'loginget', true)
		    .then((params) => servePage(res, 'login', opts))
		    .catch((e) => serverError(res, opts, e));
	    });
	app.post('/login', (req, res) => {
		postProbe.mark();
		let opts = { username: 'undefined', pagetitle: 'Log In' };
		let regPassHash = '';
		this._check.cmdValidation(req, res, 'loginpost', true)
		    .then((params) => {
			    opts.username = params.username || false;
			    regPassHash = crypto.createHash('sha256').update(params.password).digest('hex');
			    return db.read(`SELECT * FROM users WHERE username = '${opts.username}'`);
			})
		    .then((gotUser) => {
			    if (gotUser.length !== 1) { throw { code: 404, msg: 'user not found' }; }
			    if (gotUser[0].pwhash !== regPassHash) { throw { code: 401, msg: 'wrong password' }; }
			    if (gotUser[0].twofavalid === 1) { throw { code: 401, msg: '2FA required' }; }
			    req.session.userid = gotUser[0].id || 0;
			    req.session.username = opts.username;
			    req.session.email = gotUser[0].email || '';
			    res.redirect('/dashboard');
			})
		    .catch((e) => serverError(res, opts, e));
	    });
	app.get('/login2fa', (req, res) => {
		getProbe.mark();
		let opts = { pagetitle: 'Log In', twofadata: `<tr><td><span class='forminput'>2FA Code</span></td><td><input type='text' size='10' name='twofa'/></td></tr>`, altlabel: 'Login <b>without</b> 2FA', alturl: '/login' };
		if (req.session.userid !== undefined && req.session.userid !== false) { res.redirect('/dashboard'); }
		this._check.cmdValidation(req, res, 'loginget', true)
		    .then((params) => servePage(res, 'login', opts))
		    .catch((e) => serverError(res, opts, e));
	    });
	app.post('/login2fa', (req, res) => {
		postProbe.mark();
		let opts = { username: 'undefined', pagetitle: 'Log In' };
		let regPassHash = twofa = '';
		this._check.cmdValidation(req, res, 'loginpost2fa', true)
		    .then((params) => {
			    opts.username = params.username || false;
			    twofa = params.twofa || 0;
			    regPassHash = crypto.createHash('sha256').update(params.password).digest('hex');
			    return db.read(`SELECT * FROM users WHERE username = '${opts.username}'`);
			})
		    .then((gotUser) => {
			    if (gotUser.length !== 1) { throw { code: 404, msg: 'user not found' }; }
			    if (gotUser[0].pwhash !== regPassHash) { throw { code: 401, msg: 'wrong password' }; }
			    if (gotUser[0].twofavalid !== 1) { throw { code: 401, msg: '2FA not configured' }; }
			    let validObject = { secret: gotUser[0].twofasecret.toString(), encoding: 'base32', token: twofa };
			    if (require('speakeasy').totp.verify(validObject)) {
				req.session.userid = gotUser[0].id || 0;
				req.session.username = opts.username;
				req.session.email = gotUser[0].email || '';
				res.redirect('/dashboard');
			    } else { throw { code: 401, msg: process.env.DEBUG ? '2FA code invalid' : 'wrong password' }; }
			})
		    .catch((e) => serverError(res, opts, e));
	    });
	app.get('/logout', (req, res) => {
		getProbe.mark();
		try {
		    req.session.userid = false;
		    req.session.username = false;
		    req.session.email = false;
		    req.session.destroy();
		    delete req.session;
		    res.redirect('/login');
		} catch(e) { res.redirect('/login'); }
	    });

	app.get('/register', (req, res) => {
		getProbe.mark();
		let opts = { pagetitle: 'Register Account' };
		this._check.cmdValidation(req, res, 'registerget', true)
		    .then((params) => servePage(res, 'register', opts))
		    .catch((e) => serverError(res, opts, e));
	    });
	app.post('/register', (req, res) => {
		postProbe.mark();
		let opts = { username: 'undefined', pagetitle: 'Register Account', data: 'failure', dataclass: 'red' };
		if (process.env.LOCK_REGISTRATIONS !== undefined) {
		    opts.data = 'registrations disabled';
		    servePage(res, 'registerconfirmation', opts);
		} else {
		    let regEmail = regPassHash = '';
		    this._check.cmdValidation(req, res, 'registerpost', true)
			.then((params) => {
				opts.username = params.username || false;
				if (params.password !== params.passwordConfirm) { throw { code: 403, msg: 'mismatching passwords registering account' }; }
				if (params.password.length < process.env.MIN_PWLEN || 6) { throw { code: 403, msg: 'password input too short' }; }
				regEmail = params.email || '';
				regPassHash = crypto.createHash('sha256').update(params.password).digest('hex');
				return db.read(`SELECT id FROM users WHERE username = '${opts.username}'`);
			    })
			.then((conflicts) => {
				if (confligts.length > 0) { throw { code: 403, msg: 'username already registered' }; }
				return db.write(`INSERT INTO users (username, pwhash, email, preferredCurrency, twofavalid, twofasecret) VALUES ('${opts.username}', '${regPassHash}', '${regEmail}', ${preferredCurrency}, 0, '')`);
			    })
			.then(() => {
				opts.data = 'successfull';
				opts.dataclass = 'green';
				servePage(res, 'registerconfirmation', opts);
			    })
			.catch((e) => servePage(res, 'registerconfirmation', opts));
		}
	    });

	app.get('/set-display-currency', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/set-display-currency', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'set-display-currency')
		    .then((params) => {
			    retTo = params.retTo;
			    if (params.displayCurrency >= currencies.getCurrencies().length || params.displayCurrency <= 0) { throw new Error('not sure we know of that currency'); }
			    return db.write(`UPDATE users SET preferredcurrency = ${params.displayCurrency} WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/set-graph-filter', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/set-graph-filter', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'set-graph-filter')
		    .then((params) => {
			    retTo = params.retTo;
			    let flt = params.filter || 'all';
			    return db.write(`UPDATE users SET graphwhat = '${flt}' WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/set-graph-scale', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/set-graph-scale', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'set-graph-scale')
		    .then((params) => {
			    retTo = params.retTo;
			    let flt = params.scale || 'all';
			    return db.write(`UPDATE users SET watchitv = '${flt}' WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/set-page-limit', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/set-page-limit', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'set-page-limit')
		    .then((params) => {
			    retTo = params.retTo;
			    let limit = params.pageLimit || '100';
			    return db.write(`UPDATE users SET maxperpage = '${limit}' WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/set-timezone', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/set-timezone', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'set-timezone')
		    .then((params) => {
			    retTo = params.retTo;
			    let tzdata = params.tzName || 'UTC';
			    return db.write(`UPDATE users SET timezone = '${tzdata}' WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/set-trend-interval', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/set-trend-interval', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'set-trend-interval')
		    .then((params) => {
			    retTo = params.retTo;
			    let itv = params.interval || '24h';
			    return db.write(`UPDATE users SET trenditv = '${itv}' WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/settings', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings', userAddress: '', emailVerifySetting: '&nbsp;', preferredCurrencyIndex: 1, preferredTrendInterval: '24h', preferredBalanceInterval: 'all', preferredTimeZone: 'UTC' };
		let validGraphIntervals = [ { name: '2 weeks', value: '14d' }, { name: '1 month', value: '30d' }, { name: '3 months', value: '90d' }, { name: '1 year', value: '365d' }, { name: 'All', value: 'all' } ];
		let validTrendIntervals = [ '1h', '24h', '7d', '30d' ];
		opts.currencies = [];
		opts.graphitv = [];
		opts.graphwatch = [];
		opts.tzdata = [];
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => { return db.read(`SELECT email, emailverified, trenditv, watchitv, preferredcurrency, timezone, twofasecret, twofavalid FROM users WHERE id = ${req.session.userid}`); })
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				opts.preferredTrendInterval = userPrefs[0].trenditv;
				opts.preferredBalanceInterval = userPrefs[0].watchitv;
				opts.preferredTimeZone = userPrefs[0].timezone;
				if (userPrefs[0].email !== '' && userPrefs[0].email !== null) {
				    opts.userAddress = userPrefs[0].email;
				    if (userPrefs[0].emailverified !== 1) { opts.emailVerifySetting = `<a href='/confirmemail' class='red'>Confirm <i>${opts.userAddress}</i> is yours</a>`; }
				    else { opts.emailVerifySetting = `<span class='green'>Confirmed</span><br/><a href='#' class='grey' onClick='deconfigureEmailAddress();'>Deconfigure email</a>`; }
				}
				if (userPrefs[0].twofavalid !== 0) { opts.twofasetting = `<a href='#' onClick='disable2fa();' class='red'>Disable 2FA</a>`; }
				else { opts.twofasetting = `<a href='/enable2fa' class='green'>Enable 2FA</a>`; }
			    }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag == opts.preferredCurrency) {
				    opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				} else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				if (helpers.genericTimeZones()[i].value === opts.preferredTimeZone) {
				    opts.tzdata.push({ value: helpers.genericTimeZones()[i].value, sfx: ' selected', label: helpers.genericTimeZones()[i].label });
				} else { opts.tzdata.push({ value: helpers.genericTimeZones()[i].value, sfx: '', label: helpers.genericTimeZones()[i].label }); }
			    }
			    for (let i = 0; i < validTrendIntervals.length; i++) {
				if (validTrendIntervals[i] === opts.preferredTrendInterval) {
				    opts.graphitv.push({ value: validTrendIntervals[i], sfx: ' selected' });
				} else { opts.graphitv.push({ value: validTrendIntervals[i], sfx: '' }); }
			    }
			    for (let i = 0; i < validGraphIntervals.length; i++) {
				if (validGraphIntervals[i].value === opts.preferredBalanceInterval) {
				    opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: ' selected' });
				} else { opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: '' }); }
			    }
			    logger.debug(opts);
			    servePage(res, 'settings', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/summary', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Summary', cbalances: [], fbalances: [], preferredCurrencyIndex: 1 };
		let convertedBalances = [], btcIndex = 0, cprecision = 8, wallet = new balances();
		this._check.cmdValidation(req, res, 'settings')
		    .then((params) => db.read(`SELECT preferredcurrency FROM users WHERE id = ${req.session.userid}`))
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) { opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency; }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === 'BTC') { btcIndex = item.id }
				if (item.id === opts.preferredCurrencyIndex) { opts.preferredCurrency = item.tag; }
			    }
			    cprecision = currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true ? 2 : 8;
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER by timestamp ASC`, 'none');
			})
		    .then((userTrades) => {
			    let async = [];
			    let hasBtcIndex = false;
			    for (let i = 0; i < userTrades.length; i++) {
				let leftC = rightC = feeC = left = right = fee = 0;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				if (hasBtcIndex === false && (left === btcIndex || right === btcIndex || fee === btcIndex)) {
				    hasBtcIndex = true;
				}
				if (left !== '' && left !== 0 && leftC !== 0) { wallet.editBalance(userTrades[i].exchange, leftC, left); }
				if (right !== '' && right !== 0 && rightC !== 0) { wallet.editBalance(userTrades[i].exchange, rightC, right * -1); }
				if (fee !== '' && fee !== 0 && feeC !== 0) { wallet.editBalance(userTrades[i].exchange, feeC, fee * -1); }
			    }
			    wallet.getHeldCurrencies().forEach((processing) => {
				    async.push(this._convert.getLast(1, processing, opts.preferredCurrencyIndex)
						.then((price) => {
							let held = pf(wallet.getBalanceByCurrency(processing), 8);
							let value = pf(held * price, cprecision);
							let obj = { curname: currencies.getCurrency(processing).tag, intvalue: value,
								curheld: helpers.renderAmount(pf(held, cprecision)), curvalue: helpers.renderAmount(value) };
							if (currencies.getCurrency(processing).isfiat === true) { opts.fbalances.push(obj); }
							else { opts.cbalances.push(obj); }
							if (processing === btcIndex) { opts.btcprice = helpers.renderAmount(pf(price, cprecision)); }
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				});
			    if (hasBtcIndex === true) {
				async.push(this._convert.getLast(1, btcIndex, opts.preferredCurrencyIndex)
					    .then((price) => { opts.btcprice = helpers.renderAmount(pf(price, cprecision)); })
					    .catch((e) => { logError('failed processing some currency', e); }));
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    let sumCoin = sumFiat = 0;
			    for (let i = 0; i < opts.cbalances.length; i++) { sumCoin = pf(sumCoin + opts.cbalances[i].intvalue, cprecision); }
			    for (let i = 0; i < opts.fbalances.length; i++) { sumFiat = pf(sumFiat + opts.fbalances[i].intvalue, cprecision); }
			    opts.sumcoin = sumCoin;
			    opts.sumfiat = sumFiat;
			    opts.sumtot = pf(sumCoin + sumFiat, cprecision);
			    servePage(res, 'summary', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });


	app.get('/stats', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Trades Statistics', currencies: [], preferredCurrency: 1,
		    preferredBalanceInterval: 'all', tradevolume: [], graphopts: [], graphwatch: [], balancespie: [], balancesbar: [], timebalance: [], valueall: [] };
		let validGraphIntervals = [ { name: '2 weeks', value: '14d' }, { name: '1 month', value: '30d' }, { name: '3 months', value: '90d' }, { name: '1 year', value: '365d' }, { name: 'All', value: 'all' } ];
		let validGraphFilters = [ { name: 'All currencies', value: 'all' }, { name: 'Only FIAT currencies', value: 'fiat' }, { name: 'Only crypto currencies', value: 'crypto' } ];
		let exportFmt = false, userTz = 0, balancesGraphFilter = 'all', wallet = new balances(), walletHistory = [];
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => {
			    if (req.query !== undefined && req.query.exportFmt !== undefined) { exportFmt = req.query }
			    return db.read(`SELECT graphwhat, preferredcurrency, timezone, watchitv FROM users WHERE id = ${req.session.userid}`); })
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				balancesGraphFilter = userPrefs[0].graphwhat;
				opts.preferredBalanceInterval = userPrefs[0].watchitv;
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    opts.preferredCurrency = currencies.getCurrency(opts.preferredCurrencyIndex).tag;
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag == opts.preferredCurrency) {
				    opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' });
				} else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    for (let i = 0; i < validGraphFilters.length; i++) {
				let item = validGraphFilters[i];
				if (item.value === balancesGraphFilter) {
				    opts.graphopts.push({ value: item.value, label: item.name, sfx: ' selected' });
				} else { opts.graphopts.push({ value: item.value, label: item.name, sfx: '' }); }
			    }
			    for (let i = 0; i < validGraphIntervals.length; i++) {
				if (validGraphIntervals[i].value === opts.preferredBalanceInterval) {
				    opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: ' selected' });
				} else { opts.graphwatch.push({ label: validGraphIntervals[i].name, value: validGraphIntervals[i].value, sfx: '' }); }
			    }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp ASC`);
			})
		    .then((userTrades) => {
			    let async = [], ystart = 1970, mstart = 1, dstart = 1, current = new Date();
			    if (opts.preferredBalanceInterval === '30d') {
				ystart = current.getFullYear();
				mstart = current.getMonth();
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === '90d') {
				ystart = current.getFullYear();
				mstart = current.getMonth() - 2;
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === '365d') {
				ystart = current.getFullYear() - 1;
				mstart = current.getMonth() + 1;
				dstart = current.getDate();
			    } else if (opts.preferredBalanceInterval === 'all' && userTrades.length > 0) {
				current = new Date(userTrades[0].timestamp * 1000);
				ystart = current.getFullYear();
				mstart = current.getMonth() + 1;
				dstart = current.getDate();
			    } else { //14d
				ystart = current.getFullYear();
				mstart = current.getMonth() + 1;
				dstart = current.getDate() - 14;
			    }
			    logger.debug('found', ystart, mstart, dstart);
			    for (; mstart <= 0; mstart += 12) { ystart--; }
			    logger.debug('fixed neg month', ystart, mstart, dstart);
			    while (dstart <= 0) {
				if (mstart <= 1) {
				    mstart = 12;
				    ystart--;
				} else { mstart--; }
				dstart += new Date(ystart, mstart - 1, 0).getDate();
			    }
			    logger.debug('processing with', ystart, mstart, dstart);
			    for (let i = 0; i < userTrades.length; i++) {
				let tmp = new Date(userTrades[i].timestamp * 1000);
				let leftC = rightC = feeC = left = right = fee = 0;
				fee = userTrades[i].famount; feeC = userTrades[i].fee;
				left = userTrades[i].lamount; leftC = userTrades[i].left;
				right = userTrades[i].ramount; rightC = userTrades[i].right;
				if (left !== '' && left !== 0 && leftC !== 0) { wallet.editBalance(userTrades[i].exchange, leftC, left); }
				if (right !== '' && right !== 0 && rightC !== 0) { wallet.editBalance(userTrades[i].exchange, rightC, right * -1); }
				if (fee !== '' && fee !== 0 && feeC !== 0) { wallet.editBalance(userTrades[i].exchange, feeC, fee * -1); }
				if (tmp.getFullYear() < ystart) { continue; }
				if (tmp.getMonth() + 1 < mstart) { continue; }
				if (tmp.getDate() < dstart) { continue; }
				let current = new Date();
				let ydest = current.getFullYear();
				let mdest = current.getMonth() + 1;
				let ddest = current.getDate();
				if (userTrades[i + 1] !== undefined) {
				    current = new Date(userTrades[i + 1].timestamp * 1000);
				    ydest = current.getFullYear();
				    mdest = current.getMonth() + 1;
				    ddest = current.getDate();
				}
				if (ydest === ystart && mdest === mstart && ddest === dstart) { continue; }
				let tmpBalances = [];
				for (let k = 0; k < wallet.getHeldCurrencies().length; k++) {
				    let processing = wallet.getHeldCurrencies()[k];
				    tmpBalances.push({ curid: processing, volume: pf(wallet.getBalanceByCurrency(processing), 8) });
				}
				logger.debug(`from ${ystart}/${mstart}/${dstart} to ${ydest}/${mdest}/${ddest}`)
				while (ystart <= ydest || mstart <= mdest || dstart <= ddest) {
				    if (ystart === ydest && mstart === mdest && dstart === ddest) { break; }
				    walletHistory.push({ year: ystart, month: mstart, day: dstart, balances: tmpBalances });
				    logger.debug('month', mstart, 'has', new Date(ystart, mstart, 0).getDate(), 'days');
				    if (new Date(ystart, mstart, 0).getDate() === dstart) {
					dstart = 1;
					if (mstart === 12) { ystart++; mstart = 1; }
					else { mstart++; }
				    } else { dstart++; }
				}
			    }
			    let today = new Date();
			    let ytoday = today.getFullYear();
			    let mtoday = today.getMonth() + 1;
			    let dtoday = today.getDate();
			    let last = walletHistory[walletHistory.length - 1];
			    if (last.year !== ytoday || last.month !== mtoday || last.day !== dtoday) {
				let tmpBalances = [];
				for (let i = 0; i < wallet.getHeldCurrencies().length; i++) {
				    let processing = wallet.getHeldCurrencies()[i];
				    tmpBalances.push({ curid: processing, volume: pf(wallet.getBalanceByCurrency(processing), 8) });
				}
				logger.debug(`from ${ystart}/${mstart}/${dstart} to ${ytoday}/${mtoday}/${dtoday}`)
				while (ystart <= ytoday || mstart <= mtoday || dstart <= dtoday) {
				    walletHistory.push({ year: ystart, month: mstart, day: dstart, balances: tmpBalances });
				    logger.debug('month', mstart, 'has', new Date(ystart, mstart, 0).getDate(), 'days');
				    if (ystart === ytoday && mstart === mtoday && dstart === dtoday) { break; }
				    if (new Date(ystart, mstart, 0).getDate() === dstart) {
					dstart = 1;
					if (mstart === 12) { ystart++; mstart = 1; }
					else { mstart++; }
				    } else { dstart++; }
				}
			    }
			    if (userTrades[0] !== undefined && userTrades[0].timestamp !== undefined) {
				opts.firstTradeDateComment = helpers.renderDateAgo(userTrades[0].timestamp * 1000);
				if (opts.firstTradeDateComment > 1) {
				    opts.firstTradeDateComment += '&nbsp;days ago';
				} else { opts.firstTradeDateComment += '&nbsp;day ago'; }
				opts.firstTradeDateString = helpers.renderDateDay(userTrades[0].timestamp * 1000);
			    }
			    if (userTrades[userTrades.length - 1] !== undefined && userTrades[userTrades.length - 1].timestamp !== undefined) {
				opts.lastTradeDateComment = helpers.renderDateAgo(userTrades[userTrades.length - 1].timestamp * 1000);
				if (opts.lastTradeDateComment > 1) {
				    opts.lastTradeDateComment += '&nbsp;days ago';
				} else { opts.lastTradeDateComment += '&nbsp;day ago'; }
				opts.lastTradeDateString = helpers.renderDateDay(userTrades[userTrades.length - 1].timestamp * 1000);
			    }
			    for (let i = 0; i < walletHistory.length; i++) {
				let convertStamp = Math.round(new Date(walletHistory[i].year, walletHistory[i].month - 1, walletHistory[i].day, 0, 0, 0).getTime() / 1000);
				for (let k = 0; k < walletHistory[i].balances.length; k++) {
				    async.push(this._convert.getAt(walletHistory[i].balances[k].volume, walletHistory[i].balances[k].curid, opts.preferredCurrencyIndex, convertStamp)
						.then((price) => {
							if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) {
							    walletHistory[i].balances[k].custvalue = pf(price, 2);
							} else { walletHistory[i].balances[k].custvalue = pf(price, 8); }
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				}
			    }
			    wallet.getHeldCurrencies().forEach((processing) => {
				    async.push(this._convert.getLast(1, processing, opts.preferredCurrencyIndex)
						.then((price) => {
							let held = pf(wallet.getBalanceByCurrency(processing), 8);
							let value = pf(held * price, 8);
							if (currencies.getCurrency(opts.preferredCurrencyIndex).isfiat === true) { value = pf(value, 2); }
							if (value > 0) { opts.balancespie.push({ curname: currencies.getCurrency(processing).tag, intvalue: value }); }
							opts.balancesbar.push({ curname: currencies.getCurrency(processing).tag, intvalue: value });
						    })
						.catch((e) => { logError('failed processing some currency', e); }));
				});
			    return Promise.all(async);
			})
		    .then(() => {
			    let async = [];
			    for (let i = 0; i < walletHistory.length; i++) {
				let val = spent = 0, graphStamp = new Date(walletHistory[i].year, walletHistory[i].month - 1, walletHistory[i].day, 0, 0, 0).getTime();
				for (let k = 0; k < walletHistory[i].balances.length; k++) {
				    let l = 0;
				    if (currencies.getCurrency(walletHistory[i].balances[k].curid).isfiat === true) {
					spent = pf(spent + walletHistory[i].balances[k].custvalue, 2);
				    } else { val = pf(val + walletHistory[i].balances[k].custvalue, 2); }
				    for (; l < opts.valueall.length; l++) {
					if (opts.valueall[l].name === currencies.getCurrency(walletHistory[i].balances[k].curid).tag) {
					    opts.valueall[l].values.push({ at: graphStamp, value: walletHistory[i].balances[k].custvalue });
					    break;
					}
				    }
				    if (l === opts.valueall.length) {
					let colorIdx = l >= helpers.genericColors().length ? l % helpers.genericColors().length : l;
					opts.valueall.push({ name: currencies.getCurrency(walletHistory[i].balances[k].curid).tag, maincolor: helpers.genericColors()[colorIdx].body, altcolor: helpers.genericColors()[colorIdx].border, values: [{ at: graphStamp, value: walletHistory[i].balances[k].custvalue }] });
				    }
				}
				let roi = pf(val + spent, 2);
				opts.timebalance.push({ at: graphStamp, value: val, spent: spent, roi: roi });
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    for (let i = 0; i < opts.balancespie.length; i++) {
				let colorIdx = i >= helpers.genericColors().length ? i % helpers.genericColors().length : i;
				opts.balancespie[i].bodycolor = helpers.genericColors()[colorIdx].body;
				opts.balancespie[i].bordercolor = helpers.genericColors()[colorIdx].border;
			    }
			    for (let i = 0; i < opts.balancesbar.length; i++) {
				let colorIdx = i >= helpers.genericColors().length ? i % helpers.genericColors().length : i;
				opts.balancesbar[i].bodycolor = helpers.genericColors()[colorIdx].body;
				opts.balancesbar[i].bordercolor = helpers.genericColors()[colorIdx].border;
			    }
			    //FIXME tradevolumes!
			    servePage(res, 'stats', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/tradeanalysis', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Trades Prices', currencies: [], trades: [] };
		let tx = [], exportFmt = false, userTz = 0;
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => {
			    if (req.query !== undefined && req.query.exportFmt !== undefined) { exportFmt = req.query }
			    return db.read(`SELECT preferredcurrency, timezone FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.id === opts.preferredCurrencyIndex) { opts.preferredCurrency = item.tag; }
				if (item.tag == opts.preferredCurrency) { opts.currencies.push({ id: item.id, tag: item.tag, sfx: ' selected' }); }
				else { opts.currencies.push({ id: item.id, tag: item.tag, sfx: '' }); }
			    }
			    return db.read(`SELECT * FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp DESC`);
			})
		    .then((transactions) => {
			    let async = [];
			    for (let i = 0; i < transactions.length; i++) {
				if (transactions[i].lamount !== '' && transactions[i].lamout !== 0 && transactions[i].ramount !== '' && transactions[i].ramount !== 0) {
				    let tradetype = market = feec = '', amount = fee = feetrend = total = ppu = 0;
				    if (transactions[i].left === opts.preferredCurrencyIndex) {
					tradetype = 'Sell';
					market = currencies.getCurrency(transactions[i].right).tag;
					amount = transactions[i].ramount;
					total = transactions[i].lamount;
					ppu = pf(total / amount, 8);
					if (transactions[i].famount !== '' && transactions[i].famount !== 0 && transactions[i].fee === transactions[i].left) {
					    fee = transactions[i].famount;
					    feec = currencies.getCurrency(transactions[i].fee).tag;
					    if (transactions[i].fee === transactions[i].right) {
						feetrend = pf(fee * 100 / amount, 3);
					    } else if (transactions[i].fee === transactions[i].left) {
						feetrend = pf(fee * 100 / total, 3);
					    } else { feetrend = 0; }
					}
				    } else if (transactions[i].right === opts.preferredCurrencyIndex) {
					tradetype = 'Buy';
					market = currencies.getCurrency(transactions[i].left).tag;
					amount = transactions[i].lamount;
					total = transactions[i].ramount;
					ppu = pf(total / amount, 8);
					if (transactions[i].famount !== '' && transactions[i].famount !== 0 && transactions[i].fee === transactions[i].right) {
					    fee = transactions[i].famount;
					    feec = opts.preferredCurrency;
					    if (transactions[i].fee === transactions[i].right) {
						feetrend = pf(fee * 100 / total, 3);
					    } else if (transactions[i].fee === transactions[i].left) {
						feetrend = pf(fee * 100 / amout, 3);
					    } else { feetrend = 0; }
					}
				    }
				    if (fee === 0) { fee = ''; }
				    else { fee = helpers.renderAmount(fee) + ` ${feec} (${feetrend}%)`; }
				    if (tradetype !== '') {
					let oddeven = opts.trades.length % 2 ? 'even' : 'odd';
					opts.trades.push({
						type: tradetype, typeclass: helpers.renderTradeClass(tradetype), oddeven: oddeven,
						pricepu: helpers.renderAmount(ppu), amount: helpers.renderAmount(amount),
						market: market, total: helpers.renderAmount(total), fee: fee,
						exchange: transactions[i].exchange, group: transactions[i].groups,
						timestring: helpers.renderDate((transactions[i].timestamp + (userTz * 60)) * 1000)
					    });
				    }
				}
			    }
			    servePage(res, 'tradeanalysis', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/tradeprices', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Trades Prices', trades: [] };
		let tx = [], btcIndex = 0, exportFmt = false, userTz = 0;
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => {
			    if (req.query !== undefined && req.query.exportFmt !== undefined) { exportFmt = req.query }
			    return db.read(`SELECT preferredcurrency, timezone FROM users WHERE id = ${req.session.userid}`);
			})
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				opts.preferredCurrencyIndex = userPrefs[0].preferredcurrency;
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    for (let i = 0; i < currencies.getCurrencies().length; i++) {
				let item = currencies.getCurrencyAt(i);
				if (item.tag === 'BTC') { btcIndex = item.id }
				if (item.id === opts.preferredCurrencyIndex) { opts.preferredCurrency = item.tag; }
			    }
			    return db.read(`SELECT id, left, right, fee, lamount, ramount, famount, timestamp, exchange, groups, comment, type FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp DESC`);
			})
		    .then((transactions) => {
			    let async = [];
			    for (let i = 0; i < transactions.length; i++) {
				let left = leftc = right = rightc = '';
				let timestamp = transactions[i].timestamp;
				if (transactions[i].lamount !== 0 && transactions[i].lamount !== '') {
				    left = transactions[i].lamount;
				    leftc = transactions[i].left;
				    async.push(this._convert.getAt(left, leftc, opts.preferredCurrencyIndex, transactions[i].timestamp)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].boughtcurrency === tx[k].boughtcurrency && tx[i].bought === tx[k].bought) {
								tx[k].leftcustvalue = pf(convert, 2);
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				    async.push(this._convert.getAt(left, leftc, btcIndex, transactions[i].timestamp)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].boughtcurrency === tx[k].boughtcurrency && tx[i].bought === tx[k].bought) {
								tx[k].leftbtcvalue = convert;
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				}
				if (transactions[i].ramount !== 0 && transactions[i].ramount !== '') {
				    right = transactions[i].ramount;
				    rightc = transactions[i].right;
				    async.push(this._convert.getAt(right, rightc, opts.preferredCurrencyIndex, transactions[i].timestamp)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].currency === tx[k].currency && tx[i].amount === tx[k].amount) {
								tx[k].rightcustvalue = pf(convert, 2);
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				    async.push(this._convert.getAt(right, rightc, btcIndex, transactions[i].timestamp)
						.then((convert) => {
							for (let k = 0; k < tx.length; k++) {
							    if (tx[k].timestamp === timestamp && tx[i].currency === tx[k].currency && tx[i].amount === tx[k].amount) {
								tx[k].rightbtcvalue = convert;
							    }
							}
						    })
						.catch((e) => { logError('failed converting value to custom currency', e); }));
				}
				tx.push({ id: transactions[i].id, type: transactions[i].type, bought: left,
					boughtcurrency: leftc, amount: right, currency: rightc,
					exchange: transactions[i].exchange, group: transactions[i].groups,
					timestamp: timestamp
				    });
			    }
			    return Promise.all(async);
			})
		    .then(() => {
			    for (let i = 0; i < tx.length; i++) {
				let left = leftc = leftbtc = leftcust = right = rightc = rightbtc = rightcust = spread = '';
				let oddeven = (i % 2) ? 'odd' : 'even';
				let spreadclass = 'green';
				if (tx[i].bought !== '') {
				    left = helpers.renderAmount(tx[i].bought);
				    leftc = currencies.getCurrency(tx[i].boughtcurrency).tag;
				    leftbtc = helpers.renderAmount(tx[i].leftbtcvalue);
				    leftcust = helpers.renderAmount(tx[i].leftcustvalue);
				}
				if (tx[i].amount !== '') {
				    right = helpers.renderAmount(tx[i].amount);
				    rightc = currencies.getCurrency(tx[i].currency).tag;
				    rightbtc = helpers.renderAmount(tx[i].rightbtcvalue);
				    rightcust = helpers.renderAmount(tx[i].rightcustvalue);
				}
				if (tx[i].amount !== '' && tx[i].bought !== '') {
				   if (tx[i].rightcustvalue !== undefined && tx[i].leftcustvalue !== undefined && tx[i].rightcustvalue !== '' && tx[i].leftcustvalue !== '') {
				       spread = helpers.getTrend(tx[i].rightcustvalue, tx[i].leftcustvalue);
				       spreadclass = helpers.renderTrendClass(spread);
				   } else if (tx[i].rightbtcvalue !== undefined && tx[i].leftbtcvalue !== undefined && tx[i].rightbtcvalue !== '' && tx[i].leftbtcvalue !== '') {
				       spread = helpers.getTrend(tx[i].rightbtcvalue, tx[i].leftbtcvalue);
				       spreadclass = helpers.renderTrendClass(spread);
				   }
				   if (spread !== '') { spread = helpers.renderTrend(spread); }
				}
				logger.debug(`processing transaction ${tx[i].type}:${tx[i].id}:${tx[i].timestamp} left:${left}/${leftbtc}/${leftcust} ${leftc} right:${right}/${rightbtc}/${rightcust} ${rightc} spread:${spread}`);
				opts.trades.push({ id: tx[i].id, type: tx[i].type, oddeven: oddeven,
					typeclass: helpers.renderTradeClass(tx[i].type),
					bought: left, boughtcurrency: leftc, boughtbtc: leftbtc,
					boughtcust: leftcust, amount: right, currency: rightc,
					amountbtc: rightbtc, amountcust: rightcust,
					exchange: tx[i].exchange, group: tx[i].group,
					spread: spread, spreadclass: spreadclass,
					timestring: helpers.renderDate((tx[i].timestamp + (userTz * 60)) * 1000) });
			    }
			    if (exportFmt === 'csv') {
				logError('FIXME CSV export');
			    } else if (exportFmt === 'pdf') {
				servePdf(res, 'tradeprices', opts);
			    } else {
				servePage(res, 'tradeprices', opts);
			    }
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/trades', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Trades List' };
		let userTz = 0;
		this._check.cmdValidation(req, res, 'trades')
		    .then((params) => { return db.read(`SELECT timezone FROM users WHERE id = ${req.session.userid}`); })
		    .then((userPrefs) => {
			    if (userPrefs.length > 0) {
				for (let i = 0; i < helpers.genericTimeZones().length; i++) {
				    if (helpers.genericTimeZones()[i].value === userPrefs[0].timezone) {
					userTz = helpers.genericTimeZones()[i].toGMT;
				    }
				}
			    }
			    return db.read(`SELECT id, left, right, fee, lamount, ramount, famount, timestamp, exchange, groups, comment, type FROM trades WHERE userid = ${req.session.userid} ORDER BY timestamp DESC`);
			})
		    .then((transactions) => {
			    opts.trades = [];
			    for (let i = 0; i < transactions.length; i++) {
				let oddeven = (i % 2) ? 'odd' : 'even';
				let left = leftc = right = rightc = fee = feec = '';
				if (transactions[i].lamount !== 0 && transactions[i].lamount !== '') {
				    left = helpers.renderAmount(transactions[i].lamount);
				    leftc = currencies.getCurrency(transactions[i].left).tag;
				}
				if (transactions[i].ramount !== 0 && transactions[i].ramount !== '') {
				    right = helpers.renderAmount(transactions[i].ramount);
				    rightc = currencies.getCurrency(transactions[i].right).tag;
				}
				if (transactions[i].famount !== 0 && transactions[i].famount !== '') {
				    fee = helpers.renderAmount(transactions[i].famount);
				    feec = currencies.getCurrency(transactions[i].fee).tag;
				}
				opts.trades.push({
					id: transactions[i].id, type: transactions[i].type, oddeven: oddeven,
					typeclass: helpers.renderTradeClass(transactions[i].type),
					bought: left, boughtcurrency: leftc, amount: right, currency: rightc, txfee: fee, feecurrency: feec,
					exchange: transactions[i].exchange, group: transactions[i].groups, comment: transactions[i].comment,
					timestring: helpers.renderDate((transactions[i].timestamp + (userTz * 60)) * 1000) });
			    }
			    logger.debug(opts);
			    servePage(res, 'trades', opts);
			})
		    .catch((e) => serverError(res, opts, e));
	    });

	app.get('/update-password', (req, res) => {
		getProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		serverError(res, opts, { code: 405, msg: 'unsupported method' });
	    });
	app.post('/update-password', (req, res) => {
		postProbe.mark();
		let opts = { username: req.session.username || 'undefined', pagetitle: 'Settings' };
		let retTo = '/settings';
		this._check.cmdValidation(req, res, 'update-password')
		    .then((params) => {
			    let eOld = crypto.createHash('sha256').update(params.oldPassword || '').digest('hex'),
				eNew = crypto.createHash('sha256').update(params.newPassword || '').digest('hex'),
				eConf = crypto.createHash('sha256').update(params.confirmPassword || '').digest('hex');
			    if (params.newPassword.length < process.env.MIN_PWLEN || 6) { throw { code: 403, msg: 'password input too short' }; }
			    if (eNew !== eConf) { throw { code: 403, msg: 'new password does not match confirmation field' }; }
			    return db.write(`UPDATE users SET pwhash = '${eNew}' WHERE id = ${req.session.userid}`);
			})
		    .then(() => res.redirect(retTo))
		    .catch((e) => serverError(res, opts, e));
	    });
    };
