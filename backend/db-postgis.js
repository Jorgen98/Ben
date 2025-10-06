/*
 * DB Postgis function file
 */

const Pool = require('pg').Pool;
const dotenv = require('dotenv');

const logService = require('./log.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.DB_POSTGIS_MODULE_NAME, type, msg)
}

// Postgis DB instant
const db_postgis = new Pool({
    user: process.env.DB_POSTGIS_USER,
    host: process.env.DB_POSTGIS_HOST,
    database: process.env.DB_POSTGIS_DATABASE,
    password: process.env.DB_POSTGIS_PASSWORD,
    port: 5432,
    connectionTimeoutMillis: 1000,
    max: 20
});

// Postgis DB error handle function
db_postgis.on('error', function(error) {
    log('info', `Connected clients: ${db_postgis.totalCount}, Idle clients: ${db_postgis.idleCount}`);
    log('error', error);
})

// Function for DB connection create
async function connectToDB() {
    try {
        let client = await db_postgis.connect();
        client.release(true);
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

// Get actual delay records number
async function actualDelayRecordsNum() {
    try {
        let acNumber = await db_postgis.query('SELECT COUNT(id) FROM delay_records');
        return parseInt(acNumber.rows[0].count);
    } catch(error) {
        log('error', error);
        return 0;
    }
}

// Store delay records into DB
async function insertDelayRecordsData(records) {
    const values = [];
    const placeholders = records
      .map((r, i) => {
        const base = i * 3;
        values.push(r.date, r.lineid, JSON.stringify(r.data));
        return `($${base + 1}, $${base + 2}, $${base + 3}::jsonb)`;
      })
      .join(',');

    const query = `INSERT INTO delay_records (record_date, line_id, data) VALUES ${placeholders};`;

    if (query === '') {
        return true;
    }

    try {
        await db_postgis.query(query, values);
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

// Remove old delay records
async function removeOldDelayRecordsData() {
    try {
        await db_postgis.query("DELETE FROM delay_records WHERE record_date < NOW() - INTERVAL '2 days'");
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

// Get delay records data
async function getDelayRecordsData(objectId, lineId, from, to) {
    try {
        const result = await db_postgis.query(`
            SELECT * FROM (SELECT * FROM delay_records ORDER BY id) T WHERE id > $1 AND line_id = $2 AND record_date BETWEEN $3 AND $4 LIMIT 10000`,
            [objectId, lineId, from, to]
        );
        return result.rows;
    } catch(error) {
        log('error', error);
        return [];
    }
}

// Store next bike records into DB
async function insertNextBikeData(records) {
    const values = [];

    const placeholders = records
      .map((r, i) => {
        const base = i * 4;
        const lat = r.lat;
        const lng = r.lng;
        const uid = r.uid;

        delete r.uid;
        delete r.lng;
        delete r.lat;
        delete r.bike_numbers;

        values.push(uid, lat, lng, JSON.stringify(r));
        return `(current_timestamp, $${base + 1}, ST_SetSRID(ST_MakePoint($${base + 2},$${base + 3}), 4326), $${base + 4}::jsonb)`;
      })
      .join(',');
    const query = `INSERT INTO nextbike (record_date, station_uid, geom, data) VALUES ${placeholders};`;
    if (query === '') {
        return true;
    }

    try {
        await db_postgis.query(query, values);
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

// Get next bike places
async function getNextBikePlaces(from, to) {
    try {
        const result = await db_postgis.query(`
            SELECT DISTINCT station_uid, ST_AsGeoJSON(geom) FROM nextbike WHERE record_date BETWEEN $1 AND $2 ORDER BY station_uid`,
            [from, to]
        );

        return result.rows.map((item) => { return {station_uid: item.station_uid, position: JSON.parse(item.st_asgeojson).coordinates} });
    } catch(error) {
        log('error', error);
        return [];
    }
}

// Get next bike place records
async function getNextBikeRecords(uid, from, to) {
    try {
        const result = await db_postgis.query(`
            SELECT record_date, data FROM nextbike WHERE station_uid = $1 AND record_date BETWEEN $2 AND $3`,
            [uid, from, to]
        );
        let resultData = {};

        for (const record of result.rows) {
            resultData[record.record_date.valueOf()] = record.data;
        }
        return resultData;
    } catch(error) {
        log('error', error);
        return [];
    }
}

// Get next bike places around position
async function getNextBikePlacesAround(position, from, to, limit) {
    try {
        const result = await db_postgis.query(`
        SELECT DISTINCT * FROM (SELECT station_uid, ST_AsGeoJSON(geom) FROM nextbike
        WHERE ST_DistanceSphere(geom, ST_MakePoint($1, $2)) <= 20000 AND record_date BETWEEN $3 AND $4
        ORDER BY ST_DistanceSphere(geom, ST_MakePoint($1, $2))) LIMIT $5`,
        [position[0], position[1], from, to, limit]);

        return result.rows.map((item) => { return {station_uid: item.station_uid, position: JSON.parse(item.st_asgeojson).coordinates} });
    } catch(error) {
        log('error', error);
        return [];
    }
}

module.exports = { connectToDB, actualDelayRecordsNum, insertDelayRecordsData,
    removeOldDelayRecordsData, getDelayRecordsData, insertNextBikeData,
    getNextBikePlaces, getNextBikeRecords, getNextBikePlacesAround }