CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, record_date TIMESTAMP NOT NULL, line_id INT NOT NULL, data JSONB NOT NULL);
CREATE INDEX idx ON records (id, record_date);
