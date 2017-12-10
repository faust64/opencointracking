const pf = require('parse-to-float');

class Balances {
    constructor (iput) {
	this._currencies = [];
	this._balances = [];
	if (iput !== undefined && iput.balances !== undefined && iput.currencies !== undefined) {
	    this._currencies = new Array(iput.balances);
	    this._balances = new Array(iput.currencies);
	}
    }

    clone() {
	return { currencies: this._currencies, balances: this._balances };
    }

    exchangeHasBalance(currencyId, exchange) {
	for (let i = 0; i < this._balances.length; i++) {
	    if (this._balances[i].name === exchange) {
		if (this._balances[i].wallets['cur-' + currencyId] !== undefined) {
		    return true;
		} else { return false; }
	    }
	}
	return false;
    }

    getCurrencyBalanceByExchange(currencyId, exchange) {
	for (let i = 0; i < this._balances.length; i++) {
	    if (this._balances[i].name === exchange) {
		if (this._balances[i].wallets['cur-' + currencyId] !== undefined) {
		    return this._balances[i].wallets['cur-' + currencyId];
		} else { return 0; }
	    }
	}
	return 0;
    }

    getBalanceByCurrency(currencyId) {
	let ret = 0;
	for (let i = 0; i < this._balances.length; i++) {
	    if (this._balances[i].wallets['cur-' + currencyId] !== undefined) {
		ret += parseFloat(this._balances[i].wallets['cur-' + currencyId]);
	    }
	}
	return ret;
    }

    getBalanceByExchange(exchange) {
	for (let i = 0; i < this._balances.length; i++) {
	    if (this._balances[i].name === exchange) {
		return this._balances[i].wallets;
	    }
	}
	return null;
    }

    getExchanges() {
	let ret = [];
	for (let i = 0; i < this._balances.length; i++) {
	    ret.push(this._balances[i].name);
	}
	return ret;
    }

    getHeldCurrencies() {
	return this._currencies;
    }

    editBalance(exchange, currencyId, value) {
	let i = 0;
	if (this._currencies.indexOf(currencyId) < 0) {
	    this._currencies.push(currencyId);
	}
	for (; i < this._balances.length; i++) {
	    if (this._balances[i].name === exchange) {
		if (this._balances[i].wallets['cur-' + currencyId] !== undefined) {
		    this._balances[i].wallets['cur-' + currencyId] = pf(this._balances[i].wallets['cur-' + currencyId], 8) + pf(value, 8);
		} else {
		    this._balances[i].wallets['cur-' + currencyId] = pf(value, 8);
		}
		//console.log('edit ' + exchange +':' + currencyId + ' holds ' + this._balances[i].wallets['cur-' + currencyId] + ' ( => ' + value + ' )');
		break;
	    }
	}
	if (i >= this._balances.length) {
	    let wlt = [];
	    wlt['cur-' + currencyId] = pf(value, 8);
	    this._balances.push({ name: exchange, wallets: wlt });
	    //console.log('add ' + exchange +':' + currencyId + ' holds ' + this._balances[i].wallets['cur-' + currencyId] + ' ( => ' + value + ' )');
	}
    }
}

module.exports = Balances;
