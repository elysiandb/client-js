# ---------------------------------------------------------
# ElysianDB JS Client - Makefile
# ---------------------------------------------------------

PACKAGE_NAME=@elysiandbjs/client

# ----------- COMMANDS ------------------------------------

build:
	@echo "Building TypeScript project..."
	npm run build
	@echo "Build completed."

test:
	npm test

# Needs the servers of scripts/start-test-servers.sh
test-integration:
	npm run test:integration:local

# Bumps the version (VERSION=patch, minor, major or x.y.z) and pushes the tag:
# the Release workflow then publishes the package to npm with provenance.
VERSION ?= patch

release:
	@test -z "$$(git status --porcelain)" || { echo "The working tree is not clean"; exit 1; }
	@test "$$(git rev-parse --abbrev-ref HEAD)" = main || { echo "Releases are made from main"; exit 1; }
	npm version $(VERSION)
	git push --follow-tags
