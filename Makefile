.PHONY: deploy-dev deploy-prod deploy check test db-migrate-dev db-migrate-prod

deploy-dev:
	npx wrangler deploy

deploy-prod:
	npx wrangler deploy --env production

deploy:
	@if [ "$(ENV)" = "dev" ]; then $(MAKE) deploy-dev; \
	elif [ "$(ENV)" = "prod" ]; then $(MAKE) deploy-prod; \
	else echo "Usage: make deploy ENV=dev|prod"; exit 1; fi

check:
	npx tsc --noEmit

test:
	npx vitest run

db-migrate-dev:
	npx wrangler d1 migrations apply tickmcp-dev

db-migrate-prod:
	npx wrangler d1 migrations apply tickmcp-prod --env production
