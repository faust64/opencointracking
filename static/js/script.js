function allowDrop(ev) { ev.preventDefault(); }
function drag(ev) { ev.dataTransfer.setData("text", ev.target.id); }
function drop(ev) {
    ev.preventDefault();
    var d = document.getElementById('droppable');
    d.style.position = 'absolute';
    d.style.left = ev.clientX + 'px';
    d.style.top = ev.clientY + 'px';
}

function deconfigureEmailAddress() {
    var usure = confirm('Drop address from our records?');
    if (usure === true) { post('/dropemail', { }); }
}

function disable2fa() {
    var code = prompt('Type in a valid 2FA or backup code to disable 2FA:');
    if (code.length > 5) {
	post('/disable2fa', { confirm2fa: code });
    } else { alert('PIN looks too short'); }
}
function confirm2fa() {
    var code = prompt('Type in a valid code to enable 2FA:');
    if (code.length > 5) {
	post('/confirm2fa', { confirm2fa: code });
    } else { alert('PIN looks too short'); }
}

function dropTrade(id) {
    var usure = confirm('Drop trade ID#' + id + ' from your records? This can not be un-done');
    if (usure === true) { post('/dropcoins', { tradeId: id }); }
}

function enterSubmits(wherefrom) {
    if (event.key === 'Enter') {
	if (wherefrom === 'update-password') {
	    updatePassword();
	}
    }
}

function getFirstWeekdayMonth(month, year) { return new Date(year + "-" + month + "-01").getDay(); }
function getDaysInMonth(month, year) { return new Date(year, month, 0).getDate(); }
function getOffset(el) {
    var _x = 0;
    var _y = 0;
    while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}

function hideForm() {
    hideDatePicker();
    var form = document.getElementById('overlay');
    if (form) { form.style.visibility = 'hidden'; }
}

function hideDatePicker() {
    var form = document.getElementById('datepicker');
    if (form) { form.style.display = 'none'; }
}

function updateDatePicker(hour, min, sec) {
    var currentDate = document.getElementById('timepicker-value');
    if (currentDate) {
	var theDate = currentDate.innerHTML.split(':');
	if (hour !== undefined) { theDate[0] = hour; }
	if (min !== undefined) { theDate[1] = (min < 10 ? '0' + min : min); }
	if (sec !== undefined) { theDate[2] = (sec < 10 ? '0' + sec : sec); }
	currentDate.innerHTML = theDate.join(':');
    }
}

function updateForm() {
    var tradetype = document.getElementById('tradetype');
    var threearray = document.getElementById('trade-exchange');
    var twoarray = document.getElementById('trade-movement');
    var onearray = document.getElementById('trade-stolen');
    var optlabelone = document.getElementById('trade-opt-label1');
    var optlabeltoo = document.getElementById('trade-opt-label2');
    var mainlabel = altlabel = thirdlabel = undefined;
    var optone = 'Exchange', opttoo = 'Trade Group';
    if (tradetype.selectedIndex === 0) {
	mainlabel = 'Buy';
	altlabel = 'Sell';
	thirdlabel = 'Trading Fee';
	threearray.style.display = 'table';
	twoarray.style.display = 'none';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 1) {
	mainlabel = 'Deposit';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 2) {
	mainlabel = 'Income';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 3) {
	mainlabel = 'Mining';
	altlabel = 'Mining Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 4) {
	mainlabel = 'Gift / Tip';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 5) {
	mainlabel = 'Withdrawal';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 6) {
	mainlabel = 'Spend';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 7) {
	mainlabel = 'Donation';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 8) {
	mainlabel = 'Gift';
	altlabel = 'Transaction Fee';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    } else if (tradetype.selectedIndex === 9) {
	mainlabel = 'Stolen';
	threearray.style.display = 'none';
	twoarray.style.display = 'none';
	onearray.style.display = 'table';
    } else if (tradetype.selectedIndex === 10) {
	mainlabel = 'Lost';
	threearray.style.display = 'none';
	twoarray.style.display = 'none';
	onearray.style.display = 'table';
    } else if (tradetype.selectedIndex === 11) {
	mainlabel = 'Transferred Amount';
	altlabel = 'Transaction Fee';
	optone = 'Exchange (outgoing)';
	opttoo = 'Exchange (incoming)';
	threearray.style.display = 'none';
	twoarray.style.display = 'table';
	onearray.style.display = 'none';
    }
    if (thirdlabel !== undefined) {
	var legend1 = document.getElementById('buy-legend');
	var legend2 = document.getElementById('sold-legend');
	var legend3 = document.getElementById('feed-legend');
	legend1.innerHTML = mainlabel;
	legend2.innerHTML = altlabel;
	legend3.innerHTML = thirdlabel;
    } else if (altlabel !== undefined) {
	var legend1 = document.getElementById('trade-principal-legend');
	var legend2 = document.getElementById('trade-fee-legend');
	legend1.innerHTML = mainlabel;
	legend2.innerHTML = altlabel;
    } else if (mainlabel !== undefined) {
	var legend = document.getElementById('single-legend');
	legend.innerHTML = mainlabel;
    }
    optlabelone.innerHTML = optone + ':';
    optlabeltoo.innerHTML = opttoo + ':';
}

function updatePassword() {
    var currentPass = document.getElementById('old-password');
    var newPass = document.getElementById('new-password');
    var confirmPass = document.getElementById('confirm-password');

    if (newPass === undefined || currentPass === undefined || confirmPass === undefined) {
	alert('invalid input');
    } else if (newPass.value === confirmPass.value) {
	post('/update-password', { oldPassword: currentPass.value, newPassword: newPass.value, confirmPassword: confirmPass.value });
    } else { alert('New Password value does not match that of Confirm Password'); }
}

function load() {
    var form = document.getElementById('overlay');
    if (form) { window.onkeyup = function () { if (event.keyCode == 27) { hideForm(); } }; }
}

function exportAs(path, format) {
    let exportFmt = format || 'pdf';
    let exportPath = path || '/entercoins';
    post(exportPath, { exportFmt: exportFmt }, 'get');
}

function post(path, params, method) {
    method = method || 'post';

    var my = document.createElement('form');
    my.setAttribute('method', method);
    my.setAttribute('action', path);
    for (var key in params) {
        if (params.hasOwnProperty(key)) {
            var hiddenField = document.createElement('input');
            hiddenField.setAttribute('type', 'hidden');
            hiddenField.setAttribute('name', key);
            hiddenField.setAttribute('value', params[key]);
            my.appendChild(hiddenField);
        }
    }
    document.body.appendChild(my);
    my.submit();
}

function setDefaultCurrency(wherefrom) {
    var selector = document.getElementById('pick-currency-' + wherefrom);
    var retTo = '/dashboard';
    if (wherefrom === 'settings') { retTo = '/settings'; }
    if (wherefrom === 'allfees') { retTo = '/fees'; }
    if (wherefrom === 'tradeanalysis') { retTo = '/tradeanalysis'; }
    if (wherefrom === 'bbbd' || wherefrom === 'bbcbd' || wherefrom === 'mbc' || wherefrom === 'tv') { retTo = '/stats'; }
    if (wherefrom === 'cc') { retTo: '/coincharts'; }
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post('/set-display-currency', { displayCurrency: selector[i].value, retTo: retTo });
	    }
	}
    }
}

function setDefaultFilter(wherefrom) {
    var selector = document.getElementById('pick-graphsrc-' + wherefrom);
    var retTo = '/dashboard';
    if (wherefrom === 'bbcbd' || wherefrom === 'mbc') { retTo = '/stats'; }
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post('/set-graph-filter', { filter: selector[i].value, retTo: retTo });
	    }
	}
    }
}

function setDefaultTrendItv(wherefrom) {
    var selector = document.getElementById('pick-graphitv-' + wherefrom);
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post('/set-trend-interval', { interval: selector[i].value, retTo: '/dashboard' });
	    }
	}
    }
}

function setDefaultPageLimit(wherefrom) {
    let retTo = wherefrom || '/entercoins';
    var selector = document.getElementById('pick-pagelimit')
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post('/set-page-limit', { pageLimit: selector[i].value, retTo: retTo });
	    }
	}
    }
}

function setDefaultWatch(wherefrom) {
    var selector = document.getElementById('pick-graphwatch-' + wherefrom);
    var retTo = '/dashboard';
    if (wherefrom === 'bbbd' || wherefrom === 'tv') { retTo = '/stats'; }
    if (wherefrom === 'cc') { retTo: '/coincharts'; }
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post('/set-graph-scale', { scale: selector[i].value, retTo: retTo });
	    }
	}
    }
}

function setGraphSource(wherefrom) {
    var selector = document.getElementById('pick-graph-' + wherefrom);
    var retTo = '/coincharts';
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post(retTo + '/' + selector[i].value, { }, 'get');
	    }
	}
    }
}

function setPage(wherefrom) {
    var postTo = wherefrom || '/entercoins';
    var selector = document.getElementById('pageselect');
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post(postTo + '?offset=' + selector[i].value, {}, 'get');
	    }
	}
    }
}

function setTimeZone(wherefrom) {
    var selector = document.getElementById('pick-timezone-' + wherefrom);
    var retTo = '/settings';
    if (selector !== undefined) {
	for (let i = 0; i < selector.length; i++) {
	    if (selector[i].selected) {
		post('/set-timezone', { tzName: selector[i].value, retTo: retTo });
	    }
	}
    }
}

function showForm() {
    var form = document.getElementById('overlay');
    if (form) { form.style.visibility = 'visible'; }
    var dateiput = document.getElementById('tradetime');
    dateiput.value = new Date();
    updateForm();
}

function showDatePicker() {
    var form = document.getElementById('datepicker');
    if (form) { form.style.display = 'block'; }
}

function submitTrade() {
    var tradetime = document.getElementById('tradetime');
    var tradetypelabel, tradetypeidx = document.getElementById('tradetype').selectedIndex;
    var lossvalue = document.getElementById('loss-volume');
    var losscurrency = document.getElementById('loss-currency');
    var tradevalue = document.getElementById('exchange-buy-volume');
    var tradecurrency = document.getElementById('exchange-buy-currency');
    var tradefee = document.getElementById('exchange-fee-volume');
    var tradefeecurrency = document.getElementById('exchange-fee-currency');
    var buyvalue = document.getElementById('trade-buy-volume');
    var buycurrency = document.getElementById('trade-buy-currency');
    var buypaid = document.getElementById('trade-sell-volume');
    var buypaidcurrency = document.getElementById('trade-sell-currency');
    var buyfee = document.getElementById('trade-fee-volume');
    var buyfeecurrency = document.getElementById('trade-fee-currency');
    var labelone = document.getElementById('trade-opt1');
    var labeltoo = document.getElementById('trade-opt2');
    var labelcomment = document.getElementById('trade-comment');
    var postOpts = {};
    if (tradetypeidx === 0) {
	tradetypelabel = 'Trade';
	postOpts.value = buyvalue.value;
	postOpts.currency = buycurrency.value;
	postOpts.paid = buypaid.value;
	postOpts.paidcurrency = buypaidcurrency.value;
	postOpts.feed = buyfee.value;
	postOpts.feedcurrency = buyfeecurrency.value;
    } else if (tradetypeidx === 1) {
	tradetypelabel = 'Deposit';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 2) {
	tradetypelabel = 'Income';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 3) {
	tradetypelabel = 'Mining';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 4) {
	tradetypelabel = 'Gifted';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 5) {
	tradetypelabel = 'Withdrawal';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 6) {
	tradetypelabel = 'Spend';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 7) {
	tradetypelabel = 'Donation';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 8) {
	tradetypelabel = 'Gift';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else if (tradetypeidx === 9) {
	tradetypelabel = 'Stolen';
	postOpts.value = lossvalue.value;
	postOpts.currency = lossvaluecurrency.value;
    } else if (tradetypeidx === 10) {
	tradetypelabel = 'Lost';
	postOpts.value = lossvalue.value;
	postOpts.currency = lossvaluecurrency.value;
    } else if (tradetypeidx === 11) {
	tradetypelabel = 'Transfert';
	postOpts.value = tradevalue.value;
	postOpts.currency = tradecurrency.value;
	postOpts.feed = tradefee.value;
	postOpts.feedcurrency = tradefeecurrency.value;
    } else {
	console.log('unrecognized operation');
	return;
    }
    if (labelone.value !== undefined && labelone.value !== "") {
	postOpts.wallet = labelone.value;
    }
    if (labeltoo.value !== undefined && labeltoo.value !== "") {
	postOpts.groups = labeltoo.value;
    }
    if (labelcomment.value !== undefined && labelcomment.value !== "") {
	postOpts.comment = labelcomment.value;
    }
    postOpts.operation = tradetypelabel;
    postOpts.timestamp = Math.round(new Date(tradetime.value).getTime() / 1000);
    post('/entercoins', postOpts);
}
