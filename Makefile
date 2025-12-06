# ---------------------------------------------------------
# ElysianDB JS Client - Makefile
# ---------------------------------------------------------

PACKAGE_NAME=@elysiandbjs/client

NPM_USER := $(shell npm whoami 2>/dev/null)

# ----------- COMMANDS ------------------------------------

build:
	@echo "Building TypeScript project..."
	npm run build
	@echo "Build completed."

login:
	@if [ -z "$(NPM_USER)" ]; then \
		echo "You are not logged in to npm. Logging in..."; \
		npm login; \
	else \
		echo "Already logged in as: $(NPM_USER)"; \
	fi

publish: build login
	npm version patch
	npm run build
	npm publish --access public
	git push --follow-tags
