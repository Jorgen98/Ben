/*
 * DB Postgres function file
 */

const Pool = require('pg').Pool;
const dotenv = require('dotenv');

const logService = require('./log.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.DB_POSTGRES_MODULE_NAME, type, msg)
}

// Postgres DB instant
const db_postgres = new Pool({
    user: process.env.DB_POSTGRES_USER,
    host: process.env.DB_POSTGRES_HOST,
    database: process.env.DB_POSTGRES_DATABASE,
    password: process.env.DB_POSTGRES_PASSWORD,
    port: 5432,
    connectionTimeoutMillis: 1000,
    max: 20
});

// Postgres DB error handle function
db_postgres.on('error', function(error) {
    log('info', `Connected clients: ${db_postgres.totalCount}, Idle clients: ${db_postgres.idleCount}`);
    log('error', error);
})

// Function for DB connection create
async function connectToDB() {
    try {
        let client = await db_postgres.connect();
        client.release(true);
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

async function actualRecordNum() {
    try {
        let acNumber = await db_postgres.query('SELECT COUNT(id) FROM records');
        return parseInt(acNumber.rows[0].count);
    } catch(error) {
        log('error', error);
        return 0;
    }
}


async function insertData(records) {
    const values = [];
    const placeholders = records
      .map((r, i) => {
        const base = i * 3;
        values.push(r.date, r.lineid, JSON.stringify(r.data));
        return `($${base + 1}, $${base + 2}, $${base + 3}::jsonb)`;
      })
      .join(',');

    const query = `INSERT INTO records (record_date, line_id, data) VALUES ${placeholders};`;

    if (query === '') {
        return true;
    }

    try {
        await db_postgres.query(query, values);
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

async function removeOldData() {
    try {
        await db_postgres.query("DELETE FROM records WHERE record_date < NOW() - INTERVAL '2 days'");
        return true;
    } catch(error) {
        log('error', error);
        return false;
    }
}

async function getData(objectId, lineId, from, to) {
    try {
        const result = await db_postgres.query(`
            SELECT * FROM (SELECT * FROM records ORDER BY id) T WHERE id >= $1 AND line_id = $2 AND record_date BETWEEN $3 AND $4 LIMIT 10000`,
            [objectId, lineId, from, to]
        );
        return result.rows;
    } catch(error) {
        log('error', error);
        return [];
    }
}

module.exports = { connectToDB, actualRecordNum, insertData, removeOldData, getData }