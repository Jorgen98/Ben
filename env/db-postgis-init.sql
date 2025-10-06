CREATE EXTENSION IF NOT EXISTS postgis CASCADE;
CREATE TABLE IF NOT EXISTS delay_records (id SERIAL PRIMARY KEY, record_date TIMESTAMPTZ NOT NULL, line_id INT NOT NULL, data JSONB NOT NULL);
CREATE INDEX delay_idx ON delay_records (id, record_date);

CREATE TABLE IF NOT EXISTS nextbike (id SERIAL PRIMARY KEY, station_uid INT NOT NULL, record_date TIMESTAMPTZ NOT NULL, geom GEOMETRY, data JSONB NOT NULL);
CREATE INDEX nextbike_idx ON nextbike (station_uid, record_date);
