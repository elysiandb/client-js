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

# Tags the version of package.json on an up-to-date main and pushes the tag:
# the Release workflow then publishes the package to npm with provenance.
# The version itself is set in a pull request (npm version x.y.z --no-git-tag-version).
TAG = v$(shell node -p 'require("./package.json").version')

release:
	@test -z "$$(git status --porcelain)" || { echo "The working tree is not clean"; exit 1; }
	@test "$$(git rev-parse --abbrev-ref HEAD)" = main || { echo "Releases are made from main"; exit 1; }
	git pull --ff-only
	git tag $(TAG)
	git push origin $(TAG)
