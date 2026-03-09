test-run:
	docker compose --env-file ./env/.env -f docker-compose.yml docker-compose.test-prod.yml up --build
test-prod:
	docker compose --env-file ./env/.env -f docker-compose.yml docker-compose.test-prod.yml up --build -d
run:
	docker compose --env-file ./env/.env -f docker-compose.yml docker-compose.prod.yml up --build
prod:
	docker compose --env-file ./env/.env -f docker-compose.yml docker-compose.prod.yml up --build -d
stop:
	docker container stop ben-be-api ben-proxy-server ben-be-fetch ben-db-postgis
