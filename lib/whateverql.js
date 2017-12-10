const valid = [ 'sqlite', 'cassandra' ];

module.exports = () => {
	let driver = 'sqlite';
	if (process.env.DB_CONNECTOR !== undefined) {
	    if (valid.indexOf(process.env.DB_CONNECTOR) >= 0) {
		driver = process.env.DB_CONNECTOR;
	    }
	}
	if (driver === 'sqlite') {
	    const sqlite = require('./sqlite.js');
	    return sqlite();
	} else if (driver === 'cassandra') {
	    const cassandra = require('./cassandra.js');
	    return cassandra();
	} else {
	    return new Error('unsupported DB driver ' + driver);
	}
    };
