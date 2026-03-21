CREATE TABLE IF NOT EXISTS records (record_type TEXT NOT NULL, record_uid INT NOT NULL, object_id INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL, geometry GEOMETRY, data JSONB NOT NULL, PRIMARY KEY (record_type, record_uid));
CREATE INDEX idx_records ON records (record_type);
CREATE INDEX idx_geometry ON records USING GIST (geometry);

CREATE OR REPLACE FUNCTION set_record_uid_per_type() RETURNS trigger AS $$
DECLARE
  seq text;
BEGIN
    seq := 'seq_' || NEW.record_type;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I.%I', 'public', seq);
    NEW.record_uid := nextval(format('%I.%I', 'public', seq));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_set_record_uid BEFORE INSERT ON records FOR EACH ROW EXECUTE FUNCTION set_record_uid_per_type();

CREATE TABLE IF NOT EXISTS statistics (uid SERIAL PRIMARY KEY, timestamp TIMESTAMPTZ NOT NULL, data JSONB NOT NULL);
