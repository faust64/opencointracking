# OpenCoinTracking

Reverse-engineering CoinTracking.info. While their service is undoubtfully
the best, I can't convince myself a lifetime/limitless subscription is worth
the price they're asking.

On the other hand, I could use figuring out the specifics of what goes on,
under the hood. This project is pretty much a work in progress, prefer using
CoinTracking original service.

Note that when a trade record includes a fee, then we would assume the values
traded do not count that fee - contrarily to CoinTracking, which is confusing
IMHO.

Other inconsistencies would most likely be relateed to poor arithmetics, feel
free to point them out or contribute fixes, ...

Currently based on SQLite. MySQL & Postgres support shouldn't be much
complicated, Cassandra support would be more painful, as auto-incrementing
numeric IDs won't be easy nor recommended, ...

## Env vars inventory - and their defaults, if any

```
CIRCLECI
DEBUG
BIND_ADDR || '127.0.0.1'
BIND_PORT || 8080
API_SESSION_SECRET || 'opencointracking'
API_SESSION_TTL || 10800
AIRBRAKE_ID
AIRBRAKE_KEY
CT_HOSTNAME || 'localhost'
CT_PORT
CT_PROTO || env === 'production' ? 'https' : 'http'
MAIL_FROM || 'root@localhost'
MAIL_REPLYTO || 'noreply@localhost'
MIN_PWLEN || 6
NODE_ENV
PAGINATION_MIN || 100
PDFGEN_DIR || './tmp'
QUEUE_DB || 0
QUEUE_HOST || '127.0.0.1'
QUEUE_PORT || 6379
SMTP_HOST || '127.0.0.1'
SMTP_PASS
SMTP_SSL
SMTP_USER
SYSLOG_FACILITY || 'local6'
SYSLOG_PROTO || 'unix'
SYSLOG_UNIX_SOCKET
SYSLOG_PROXY || 'localhost'
SYSLOG_PORT || 514

#sqlite
DB_CONNECTOR || 'sqlite'
DB_DATABASE || './ct.sqlite'

#mysql, postgres & cassandra DB_CONNECTOR:
#DB_DATABASE || 'opencointracking'
#DB_HOST || '127.0.0.1'
#DB_USER
#DB_PASS

#mysql, postgres
#DB_PORT

#postgres
#DB_SSL

#cassandra
#CQLSH_VERSION
#DB_READ_CONSISTENCY || 'one'
#DB_WRITE_CONSISTENCY || 'one'
```

## DB init

Using SQlite:

```
$ cat db/sqlite.init | sqlite3 /path/to/my/database.sqlite
```

Note: prior import, feel free to edit currencies definitions, including
those you'll want to track and dropping those you won't need.

Having imported initial dump, you'll want to populate the rates tables with
some history:

```
$ ./utils/populate_crypto_rates
```

Note the previous command requires having installed node dependencies
(`npm install`).

## Workers

Service is based on a `background` worker:
 * refreshing crypto-currencies rates every 5 minutes
 * refreshing FIAT rates every hour
 * purging older records, such as we would keep only one rate per currency
   per day, when records are over 30 days old.

Interface based on a `front` worker.

Check processes do start with:

```
node workers/background.js 
node workers/front.js 
```

Having `pm2` installed globally, you may use

```
$ pm2 start ./workers/background.js --name background -i 1 \
    --output /path/to/logs/bg.log --error /path/to/logs/bg.err
$ pm2 start ./workers/front.js --name front -i 4 \
    --output /path/to/logs/front.log --error /path/to/logs/front.err
$ pm2 save
```

## FIXMEs

 * email verification
 * stats
   - buy/spent volumes by day in preferredCurrency graph missing
 * current balances
   - 30days trend column for each currency
   - pagination on coins (currently shows all)
 * trades / trade prices
   - pagination
 * daily balance
   - pagination (currently shows last month)
 * balance by currency
   - chart.js bug? last plot not graphed, addressed adding fake plot?
   - chart bars width mismatch in a same graph? why?
   - chart barts still missing ...
   - pagination per coin, sort per balance held
   - render by year/month/day
 * balance by exchange
   - pagination on exchanges (currently shows all)
 * fees
   - pagination on trades & on exchanges, somehow (currently shows all)
 * doubleentry
   - pagination on trades (currently shows all)
 * gains
   - it's complicated ...
   - pagination scrolling through realized/unrealized gains & coins (currently shows all)
 * tradeanalysis
   - allow filtering on exchange and/or trade group
   - preferredCurrency mistakenly filters trades, should instead be used converting all values
 * speed up pages rendering time: cache arrays pre-formatting/paging into redis
   and/or consider some kind of client-side/server-less paging/sotring?
 * should not request for 2fa code more than once every (user-defined-interval-defaults-to-24h)
 * pdf export consistently fails, regardless of the library I try, ...
 * sql schema missing defaults & not nulls
 * packaging
 * docs
