walter-run:
	docker compose --env-file ./env/.env -f docker-compose.yml -f docker-compose.walter-prod.yml up --build
walter-prod:
	docker compose --env-file ./env/.env -f docker-compose.yml -f docker-compose.walter-prod.yml up --build -d
run:
	docker compose --env-file ./env/.env -f docker-compose.yml -f docker-compose.prod.yml up --build
prod:
	docker compose --env-file ./env/.env -f docker-compose.yml -f docker-compose.prod.yml up --build -d
stop:
	docker container stop ben-be-api ben-proxy-server ben-be-fetch ben-db-postgis
