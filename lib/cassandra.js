const Promise = require('bluebird');
const drv = require('cassandra-driver');
const logger = require('./logger.js')('cassandra-handler');
const readPolicy = process.env.CASSANDRA_READ_CONSISTENCY || 'one';
const writePolicy = process.env.CASSANDRA_WRITE_CONSISTENCY || 'one';

function resolveConsistency(str) {
    if (str === 'any' || str === 'ANY') {
	return drv.types.consistencies.any;
    } else if (str === 'one' || str === 'ONE') {
	return drv.types.consistencies.one;
    } else if (str === 'two' || str === 'TWO') {
	return drv.types.consistencies.two;
    } else if (str === 'three' || str === 'THREE') {
	return drv.types.consistencies.three;
    } else if (str === 'quorum' || str === 'QUORUM') {
	return drv.types.consistencies.quorum;
    } else if (str === 'all' || str === 'ALL') {
	return drv.types.consistencies.all;
    } else if (str === 'localQuorum' || str === 'LOCAL_QUORUM') {
	return drv.types.consistencies.localQuorum;
    } else if (str === 'eachQuorum' || str === 'EACHL_QUORUM') {
	return drv.types.consistencies.eachQuorum;
    } else if (str === 'serial' || str === 'SERIAL') {
	return drv.types.consistencies.serial;
    } else if (str === 'localSerial' || str === 'LOCAL_SERIAL') {
	return drv.types.consistencies.localSerial;
    } else if (str === 'localOne' || str === 'LOCAL_ONE') {
	return drv.types.consistencies.localOne;
    } else {
	return drv.types.consistencies.one;
    }
}

module.exports = (cassandraOptions) => {
	if (cassandraOptions === undefined) {
	    cassandraOptions = {
		    contactPoints: (process.env.CASSANDRA_HOST ? process.env.CASSANDRA_HOST.split(' ') : ['127.0.0.1']),
		    keyspace: process.env.CASSANDRA_KEYSPACE || 'opencointracking'
		};
	    if (process.env.CASSANDRA_AUTH_USER && process.env.CASSANDRA_AUTH_PASS) {
		cassandraOptions.authProvider = new drv.auth.PlainTextAuthProvider(process.env.CASSANDRA_AUTH_USER, process.env.CASSANDRA_AUTH_PASS);
	    }
	}
	try {
	    this._db = new drv.Client(cassandraOptions);
	} catch(e) {
	    logger.error(e);
	    process.exit(1);
	}
	const readConsistency = (str) => {
		const policy = resolveConsistency(readPolicy);
		return { consistency: policy };
	    };

	const writeConsistency = (str) => {
		const policy = resolveConsistency(writePolicy);
		return { consistency: policy };
	    };

	let self = this;
	return {
		write: function(qry) {
		    return new Promise((resolve, reject) => {
			    logger.debug(qry);
			    self._db.execute(qry, [], writeConsistency(writePolicy))
				.then((resp) => { resolve(true); })
				.catch((e) => {
					logger.error(e);
					reject('failed writing to database');
				    });
			});
		    },
	       read: function(qry, limit, offset) {
			return new Promise((resolve, reject) => {
				let mylimit = limit || process.env.PAGINATION_MIN || 100;
				if (qry.indexOf(' LIMIT ') < 0 && mylimit !== 'none') {
				    qry += " LIMIT " + mylimit;
				}
				logger.debug(qry);
				self._db.execute(qry, [], readConsistency(readPolicy))
				    .then((resp) => {
					    if (resp.rows !== undefined && resp.rows.length >= 0) {
						resolve(resp.rows);
					    } else {
						logger.error('malformatted response object from db');
						logger.error(resp.rows);
						reject('malformatted response object from db');
					    }
					})
				    .catch((e) => {
					    logger.error(e);
					    reject('failed writing to database');
					});
			});
		   }
	    };
    };
