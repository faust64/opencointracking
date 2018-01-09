let dbConfig = { driver: 'sqlite' }, queueConfig = { driver: 'redis' };
if (process.env.DB_CONNECTOR !== undefined) {
    dbConfig.driver = process.env.DB_CONNECTOR;
}
if (process.env.QUEUE_CONNECTOR !== undefined) {
    queueConfig.driver = process.env.QUEUE_CONNECTOR;
}
if (dbConfig.driver === 'sqlite') {
    dbConfig.database = process.env.DB_DATABASE || './ct.sqlite';
} else if (dbConfig.driver === 'cassandra') {
    dbConfig.database = process.env.DB_DATABASE || 'cointracking';
    dbConfig.host = process.env.DB_HOST || '127.0.0.1';
    if (process.env.DB_PASS !== undefined) { dbConfig.password = process.env.DB_PASS; }
    if (process.env.DB_USER !== undefined) { dbConfig.username = process.env.DB_USER; }
    dbConfig.readConsistency = process.env.DB_READ_CONSISTENCY || 'one';
    dbConfig.writeConsistency = process.env.DB_WRITE_CONSISTENCY || 'one';
} else if (dbConfig.driver === 'mysql') {
    dbConfig.database = process.env.DB_DATABASE || 'cointracking';
    dbConfig.host = process.env.DB_HOST || '127.0.0.1';
    dbConfig.port = process.env.DB_PORT || 3306;
    if (process.env.DB_PASS !== undefined) { dbConfig.password = process.env.DB_PASS; }
    if (process.env.DB_USER !== undefined) { dbConfig.username = process.env.DB_USER; }
} else if (dbConfig.driver === 'postgresql') {
    dbConfig.database = process.env.DB_DATABASE || 'cointracking';
    dbConfig.host = process.env.DB_HOST || '127.0.0.1';
    dbConfig.port = process.env.DB_PORT || 5432;
    if (process.env.DB_PASS !== undefined) { dbConfig.password = process.env.DB_PASS; }
    if (process.env.DB_USER !== undefined) { dbConfig.username = process.env.DB_USER; }
    if (process.env.DB_SSL !== undefined) { dbConfig.ssl = true; }
}
if (queueConfig.driver === 'redis') {
    queueConfig.port = process.env.QUEUE_PORT || 6379;
    queueConfig.host = process.env.QUEUE_HOST || '127.0.0.1';
    queueConfig.dbId = process.env.QUEUE_DB || 0;
// else ??
}

module.exports = { db: dbConfig, queue: queueConfig };
