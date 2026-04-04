CREATE SEQUENCE records_uid_seq;

CREATE TABLE records (
    record_type TEXT NOT NULL,
    record_uid BIGINT NOT NULL DEFAULT nextval('records_uid_seq'),
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY,
    data JSONB NOT NULL,
    PRIMARY KEY (record_type, record_uid)
) PARTITION BY LIST (record_type);

CREATE TABLE records_vehicle_positions PARTITION OF records FOR VALUES IN ('vehiclePositions');

CREATE TABLE records_next_bike PARTITION OF records FOR VALUES IN ('nextBike');

CREATE TABLE records_open_weather PARTITION OF records FOR VALUES IN ('openWeather');

CREATE TABLE records_system_stats PARTITION OF records FOR VALUES IN ('systemStats');

CREATE TABLE IF NOT EXISTS statistics (uid SERIAL PRIMARY KEY, timestamp TIMESTAMPTZ NOT NULL, data JSONB NOT NULL);
