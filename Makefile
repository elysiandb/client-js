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
	@echo "Checking version before publish..."
	@if git diff --name-only | grep -q package.json; then \
		echo "Warning: package.json modified but not committed."; \
	fi

	@echo "Publishing $(PACKAGE_NAME) to npm..."
	npm publish --access public

	@echo ""
	@echo "------------------------------------------"
	@echo "Published successfully!"
	@echo "Install with:"
	@echo "  npm install $(PACKAGE_NAME)"
	@echo "------------------------------------------"
