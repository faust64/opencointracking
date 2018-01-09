const Promise = require('bluebird');
const apiRouter = require('../api/router.js');
const bodyParser = require('body-parser');
const config = require('../config.js');
const db = require('someql')(config.db);
const exec = require('child_process').exec;
const express = require('express');
const execAsync = Promise.promisify(exec);
const http = require('http');
const listenAddr = process.env.BIND_ADDR || '127.0.0.1';
const listenPort = process.env.BIND_PORT || 8080;
const logger = require('wraplog')('opencointracking');
const app = express();
const currencies = require('../lib/currencies.js')(db);
const session = require('express-session');
const redisStore = require('connect-redis')(session);
const redisBackend = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || 6379;
app.use(session({
    	//cookie: { secure: (process.env.NODE_ENV === 'production' || process.env.CT_PROTO === 'https') },
	resave: false,
	saveUninitialized: false,
	secret: process.env.API_SESSION_SECRET || 'opencointracking',
	store: new redisStore({
		host: redisBackend,
		port: redisPort,
		db: process.env.REDIS_DBID || 0,
		prefix: 'cointracksess:',
		ttl: process.env.API_SESSION_TTL || 10800,
		logErrors: logger.error
	    })
    }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') {
    try {
	const compression = require('compression');
	app.use(compression());
    } catch(e) { logger.info('could not enable compression, despite environ not being set to production'); }
    try { app.use('/static', express.static('static')); }
    catch(e) { logger.info('could not serve static assets'); }
}
app.set('trust proxy', 1);
const httpServer = http.createServer(app);
execAsync('sleep 1')
    .then(() => {
	    logger.info('building runtime cache');
	    currencies.refreshCurrencies();
	    return execAsync('sleep 1');
	})
    .then(() => {
	    apiRouter(app, db, currencies, logger);
	    httpServer.listen(listenPort, listenAddr, (err, res) => {
		    if (err) {
			logger.error('failed starting http server');
			process.exit(1);
		    }
		    logger.info('listening on ' + listenAddr + ':' + listenPort);
		    if (process.env.AIRBRAKE_ID !== undefined && process.env.AIRBRAKE_KEY !== undefined) {
			try {
			    let airbrake = require('airbrake').createClient(process.env.AIRBRAKE_ID, process.env.AIRBRAKE_KEY);
			    airbrake.handleExceptions();
			} catch(e) { logger.info('WARNING: failed initializing airbrake'); }
		    }
		});
	})
    .catch((e) => {
	    logger.error('go to sleep');
	    logger.error(e);
	    process.exit(1);
	})
