const winston = require('winston');

class myLogger {
    constructor(role) {
	    const logTransports = [];

	    if (process.env.CIRCLECI) {
		//winston.add(winston.transports.File, { filename: '/home/ubuntu/cointracking/logs/' + role + '.log' });
		logTransports.push(new winston.transports.File({ filename: '/home/ubuntu/cointracking/logs/' + role + '.log' }));
	    } else if (process.env.DEBUG) {
		const syslogOptions = {
		    app_name: role || 'standalone',
		    facility: process.env.SYSLOG_FACILITY || 'local6',
		    humanReadableUnhandledException: true,
		    localhost: false,
		    protocol: process.env.SYSLOG_PROTO || 'unix'
		};

		if (syslogOptions.protocol === 'unix') {
		    if (process.env.SYSLOG_UNIX_SOCKET) {
			syslogOptions.path = process.env.SYSLOG_UNIX_SOCKET;
		    } else if (require('os').platform() === 'darwin') {
			syslogOptions.path = '/var/run/syslog';
		    } else {
			syslogOptions.path = '/dev/log';
		    }
		} else {
		    syslogOptions.host = process.env.SYSLOG_PROXY || 'localhost';
		    syslogOptions.port = process.env.SYSLOG_PORT || 514;
		}
		require('winston-syslog').Syslog;
		//logTransports.push(new winston.transports.Syslog(syslogOptions));
		//winston.remove(winston.transports.Console);
		//winston.add(winston.transports.Console, { colorize: true });
		//winston.add(new winston.transports.Syslog(syslogOptions));
		logTransports.push(new winston.transports.Console({ colorize: true }));
	    } else {
		const syslogOptions = {
		    app_name: role || 'standalone',
		    facility: process.env.SYSLOG_FACILITY || 'local6',
		    humanReadableUnhandledException: true,
		    localhost: false,
		    protocol: process.env.SYSLOG_PROTO || 'unix'
		};

		if (syslogOptions.protocol === 'unix') {
		    if (process.env.SYSLOG_UNIX_SOCKET) {
			syslogOptions.path = process.env.SYSLOG_UNIX_SOCKET;
		    } else if (require('os').platform() === 'darwin') {
			syslogOptions.path = '/var/run/syslog';
		    } else {
			syslogOptions.path = '/dev/log';
		    }
		} else {
		    syslogOptions.host = process.env.SYSLOG_PROXY || 'localhost';
		    syslogOptions.port = process.env.SYSLOG_PORT || 514;
		}
		require('winston-syslog').Syslog;
		logTransports.push(new winston.transports.Syslog(syslogOptions));
		//winston.add(winston.transports.Syslog, syslogOptions);
		//winston.remove(winston.transports.Console);
	    }
	    //this._logger = winston;
	    this._logger = new winston.Logger({ transports: logTransports });
	}

    get logger() {
	return this._logger;
    }
}

module.exports = (logger, role) => new myLogger(logger, role).logger;
