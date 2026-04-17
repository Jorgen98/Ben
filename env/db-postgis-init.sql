CREATE TABLE vehiclePositions (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY,
    data JSONB NOT NULL
);
CREATE INDEX vehiclePositions_idx ON vehiclePositions(id, timestamp);
CREATE INDEX vehiclePositions_idx_2 ON vehiclePositions(id, key, timestamp);

CREATE TABLE nextBike (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY,
    data JSONB NOT NULL
);
CREATE INDEX nextBike_idx ON nextBike(id, timestamp);

CREATE TABLE openWeather (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY,
    data JSONB NOT NULL
);
CREATE INDEX openWeather_idx ON openWeather(id, timestamp);

CREATE TABLE systemStats (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY,
    data JSONB NOT NULL
);
CREATE INDEX systemStats_idx ON systemStats(id, timestamp);

CREATE TABLE lineTweets (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY,
    data JSONB NOT NULL
);
CREATE INDEX lineTweets_idx ON lineTweets(id, timestamp);

CREATE TABLE IF NOT EXISTS statistics (uid SERIAL PRIMARY KEY, timestamp TIMESTAMPTZ NOT NULL, data JSONB NOT NULL);
