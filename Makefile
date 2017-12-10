PREFIX = /
BIN_DIR = $(PREFIX)/usr/bin
DOC_DIR = $(PREFIX)/usr/share/doc/cointracking
ETC_DIR = $(PREFIX)/etc
LIB_DIR = $(PREFIX)/var/lib/cointracking
MAN_DIR = $(PREFIX)/usr/share/man/man8
SHARE_DIR = $(PREFIX)/usr/share/cointracking

shrinkpack:
	if ! test -d node_modules; then \
	    npm install; \
	fi
	if ! test -x /usr/local/bin/shrinkpack -o -x /usr/bin/shrinkpack; then \
	    npm install -g shrinkpack; \
	    npm install -g shrinkwrap; \
	fi
	if npm shrinkwrap --dev; then \
	    shrinkpack -c || shrinkpack; \
	    git status || true; \
	fi

shrinkwrap: shrinkpack

rewrap:
	rm -fr node_modules node_shrinkwrap npm-shrinkwrap.json
	make shrinkpack

dbinit:
	if test "$$DB_CONNECTOR" = cassandra; then \
	    test -f db/cassandra.init || return 0; \
	    test "$$CASSANDRA_HOST" || return 0; \
	    if test "$$CQLSH_VERSION"; then \
		grep -vE '^(#|$$)' db/cassandra.init | cqlsh --cqlversion=$$CQLSH_VERSION $$CASSANDRA_HOST; \
	    else \
		grep -vE '^(#|$$)' db/cassandra.init | cqlsh $$CASSANDRA_HOST; \
	    fi
	    if test -x ./db/updateCassandra; then \
		if ! ./db/updateCassandra; then \
		    exit 1; \
		fi; \
	    fi; \
	else \
	    test -f db/sqlite.init || return 0; \
	    test -z "$$CT_SQLITE_DBFILE" && CT_SQLITE_DBFILE=./sqlite; \
	    if test -s "$$CT_SQLITE_DBFILE"; then \
		mv "$$CT_SQLITE_DBFILE" "$$CT_SQLITE_DBFILE.old"; \
	    fi
	    cat db/sqlite.init | sqlite3 "$$CT_SQLITE_DBFILE";
	    if test -x ./db/updateSqlite; then \
		if ! ./db/updateSqlite; then \
		    exit 1; \
		fi; \
	    fi; \
	fi

dbinittest: dbinit
	if test "$$DB_CONNECTOR" = cassandra; then \
	    test -f db/cassandra.test || return 0; \
	    test "$$CASSANDRA_HOST" || return 0; \
	    if test "$$CQLSH_VERSION"; then \
		grep -v '^(#|$$)' db/cassandra.test | cqlsh --cqlversion=$$CQLSH_VERSION $$CASSANDRA_HOST; \
	    else \
		grep -v '^(#|$$)' db/cassandra.test | cqlsh $$CASSANDRA_HOST; \
	    fi; \
	else \
	    test -f db/sqlite.test || return 0; \
	    test -z "$$CT_SQLITE_DBFILE" && CT_SQLITE_DBFILE=./sqlite; \
	    if ! test -s "$$CT_SQLITE_DBFILE"; then \
		echo "database missing" >&2; \
		exit 1; \
	    fi; \
	    cat db/sqlite.test | sqlite3 "$$CT_SQLITE_DBFILE"; \
	fi

install:
	test -d $(DOC_DIR) || mkdir -p $(DOC_DIR)
	for potentialDoc in API.md README.md QUICKSTART.md; \
	    do \
		test -s $$potentialDoc || continue; \
		install -c -m 0644 $$potentialDoc $(DOC_DIR)/$$potentialDoc; \
	    done
	for d in api db lib templates static/img static/css static/js workers node_shrinkwrap; \
	    do \
		test -d $(SHARE_DIR)/$$d || mkdir -p $(SHARE_DIR)/$$d; \
	    done
	find api lib templates static/img static/css static/js workers node_shrinkwrap -type f | while read file; \
	    do \
		install -c -m 0644 $$file $(SHARE_DIR)/$$file; \
	    done
	find db -type f | while read file; \
	    do \
		if echo $$file | grep -E '\.(migrate|sh)$$' >/dev/null; then \
		    install -c -m 0755 $$file $(SHARE_DIR)/$$file; \
		else \
		    install -c -m 0644 $$file $(SHARE_DIR)/$$file; \
		fi; \
	    done
	for file in revision package.json npm-shrinkwrap.json; \
	    do \
		test -f $$file || continue; \
		install -c -m 0644 $$file $(SHARE_DIR)/$$file; \
	    done
	test -d $(LIB_DIR) || mkdir -p $(LIB_DIR)
	test -d $(BIN_DIR) || mkdir -p $(BIN_DIR)
	install -c -m 0755 samples.d/control $(BIN_DIR)/occ
	install -c -m 0755 samples.d/pm2.cron $(ETC_DIR)/cron.weekly/pm2-update

build:
	@/bin/echo nothing to be done

favicon:
	if ! test -s static/img/logo-icon.png; then \
	    echo "please install initial logo as static/img/logo-icon.png"; >&2 \
	    exit 1; \
	fi
	for size in 16 32 57 60 64 70 72 76 96 114 120 128 144 150 152 160 180 196 256 310; \
	    do \
		convert static/img/logo-icon.png -resize "$${size}x$$size" static/img/icon$$size.png; \
	    done
	for size in 16 32 48 64; \
	    do \
		convert static/img/logo-icon.png -resize "$${size}x$$size" static/img/icon$$size.ico; \
	    done
	for size in 128 256; \
	    do \
		convert static/img/logo-icon.png -resize "$${size}x$$size" static/img/logo$$size.png; \
	    done
	chmod 644 static/img/logo*png static/img/icon*png static/img/icon*ico
	find static/img -type f -name 'logo*' -o -name 'icon*'

sourceismissing:
	for dep in node_shrinkwrap/*; \
	do \
	    if ! grep "source-is-missing $$dep" debian/source.lintian-overrides >/dev/null; then \
		echo "cointracking source: source-is-missing $$dep" >>debian/source.lintian-overrides; \
	    fi; \
	done

clean:
	if test -s .gitignore; then \
	    grep -vE '^(#|$$)' .gitignore | while read line; \
		do \
		    rm -fr ./$$line; \
		done; \
	fi
	rm -fr *log

reset:
	git reset; \
	for item in api *.md *.yml *.json .gitignore db debian lib LICENSE Makefile node_shrinkwrap samples.d static templates tests workers; \
	do \
	    rm -fr $$item; \
	    git checkout -- $$item; \
	done

createdebsource:
	LANG=C debuild -S -sa

createdebbin:
	LANG=C dpkg-buildpackage -us -uc

createinitialarchive: clean sourceismissing
	if test -d .git; then \
	    case "`git branch | awk '/^\*/{print $$2}'`" in \
		master|production|oldbear-prod)	suffix=		;; \
		oldbear-preprod|preprod)	suffix=rc	;; \
		staging)			suffix=beta	;; \
		*)				suffix=alpha	;; \
	    esac; \
	else \
	    suffix=; \
	fi; \
	git rev-parse HEAD >revision 2>/dev/null || echo alpha >revision; \
	rm -fr .git .gitignore .gitrelease circle.yml db/*PoC samples.d/diags samples.d/screens debian/cointracking debian/cointracking.debhelper.log; \
	sed -i "s|(\([0-9]*\.[0-9]*\.[0-9]*-\)\([0-9]*\)) unstable;|(\1$${suffix}\2) unstable;|" debian/changelog
	version=`awk '/^cointracking/{print $$2;exit}' debian/changelog | sed -e 's|^[^0-9]*\([0-9]*\.[0-9]*\.[0-9]*\)-.*|\1|'`; \
	( cd .. ; tar -czf cointracking_$$version.orig.tar.gz cointracking )

processestest:
	for proc in front background; \
	do \
	    if ! pm2 show $$proc 2>&1 | grep online >/dev/null; then \
		echo $$proc is dead; \
		test "$$CIRCLECI" && pm2 show $$proc; \
		exit 1; \
	    elif ! pm2 show $$proc 2>&1 | grep -E ' restarts .* 0 ' >/dev/null; then \
		echo $$proc is restarting; \
		test "$$CIRCLECI" && pm2 show $$proc; \
		exit 1; \
	    fi; \
	done
	echo "all processes healthy"

pingtest:
	if ! curl http://127.0.0.1:8080/ping | grep '^OK$$'; then \
	    echo front ping failed; \
	    exit 1; \
	fi

test: processestest pingtest
	echo OK

release:
ifeq ($(GITHUB_USER),)
	@/bin/echo "CRITICAL: missing GITHUB_USER env var" >&2;
	@exit 1;
else
    ifeq ($(GITHUB_TOKEN),)
	@/bin/echo "CRITICAL: missing GITHUB_TOKEN env var" >&2;
	@exit 1;
    else
        ifeq (, $(shell which debuild))
	@/bin/echo "CRITICAL: missing debuild, can not build debian packages" >&2;
	@exit 1;
        else
	branch=`test -d .git && git branch | awk '/^\*/{print $$2}'`; \
	test -z "$$branch" && branch=master; \
	if ! git pull; then \
	    echo "CRITICAL: failed pulling from GitHub" >&2; \
	    exit 1; \
	elif ! git push -u origin $$branch; then \
	    echo "CRITICAL: failed pushing to GitHub" >&2; \
	    exit 1; \
	elif ! ./.gitrelease; then \
	    exit $$?; \
	fi
        endif
    endif
endif

all: build
