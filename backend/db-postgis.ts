/*
 * DB Postgis function file
 */

// Imports
const Pool = require('pg').Pool;
import dotenv from 'dotenv';

import { logMsgType } from './types';
import { writeIntoLog } from './log';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.DB_POSTGIS_MODULE_NAME, type, msg)
}

// Postgis DB instant
const db_postgis = new Pool({
    user: process.env.DB_POSTGIS_USER,
    host: process.env.DB_POSTGIS_HOST ?? 'ben-db-postgis',
    database: process.env.DB_POSTGIS_DATABASE,
    password: process.env.DB_POSTGIS_PASSWORD,
    port: 5432,
    connectionTimeoutMillis: 1000,
    max: 20
});

// Postgis DB error handle function
db_postgis.on('error', function(error: string) {
    log('info', `Connected clients: ${db_postgis.totalCount}, Idle clients: ${db_postgis.idleCount}`);
    log('error', error);
})

// Function for DB connection create
export async function connectToDB() {
    try {
        let client = await db_postgis.connect();
        client.release(true);
        return true;
    } catch(error) {
        log('error', JSON.stringify(error));
        return false;
    }
}
