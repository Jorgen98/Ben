run:
	docker compose --env-file ./env/.env up ben-proxy-server ben-be-fetch ben-be-api ben-db-postgis --build
prod:
	docker compose --env-file ./env/.env up ben-proxy-server ben-be-fetch ben-be-api ben-db-postgis --build -d
stop:
	docker container stop ben-be-api ben-proxy-server ben-be-fetch ben-db-postgis