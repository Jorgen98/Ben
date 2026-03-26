/*
 * DB Postgis function file
 */

// Imports
const Pool = require('pg').Pool;
import dotenv from 'dotenv';

import { dataSourceStats, dbRecordToSave, logMsgType } from './types';
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
    host: process.env.DB_POSTGIS_HOST ?? 'new-ben-db-postgis',
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

// Function for DB connection creation
export async function connectToDB() {
    try {
        const client = await db_postgis.connect();
        client.release(true);
        return true;
    } catch(error) {
        log('error', JSON.stringify(error));
        return false;
    }
}

// Store records into DB
export async function saveRecords(recordType: string, records: dbRecordToSave[]): Promise<boolean> {
    if (records.length < 1) {
        return true;
    }

    // Construct DB query
    const queryValues: string[] = [];
    const queryPlaceholders = records.map((record, index) => {
        const base = index * 5;
        queryValues.push(recordType, record.key, record.geometry.lat.toString(), record.geometry.lng.toString(), record.data);
        return `(current_timestamp, $${base + 1}, $${base + 2}, ST_SetSRID(ST_MakePoint($${base + 3},$${base + 4}), 4326), $${base + 5}::jsonb)`;
    }).join(',');
    const query = `INSERT INTO records (timestamp, record_type, key, geometry, data) VALUES ${queryPlaceholders};`;

    // Store records
    try {
        await db_postgis.query(query, queryValues);
        return true;
    } catch(error) {
        log('error', error as string);
        return false;
    }
}

// Get records from DB
export async function getRecords(recordType: string, dateStart: Date, dateEnd: Date, key: string | null,
    recordUidStart: number | null, recordUidEnd: number | null, point: {lat: number, lng: number} | null, limit: number, fields: string[]) {
    try {
        let query = `SELECT * FROM (SELECT * FROM records WHERE record_type = $1`;
        let queryValues: (string | number | Date)[] = [recordType];

        if (key !== null) {
            queryValues.push(key);
            query += ` AND key = $${queryValues.length}`;
        }

        if (recordUidStart !== null) {
            queryValues.push(recordUidStart);
            query += ` AND record_uid >= $${queryValues.length}`;
        }

        if (recordUidEnd !== null) {
            queryValues.push(recordUidEnd);
            query += ` AND record_uid <= $${queryValues.length}`;
        }

        if (point !== null) {
            queryValues.push(point.lat);
            queryValues.push(point.lng);
            query += ` ORDER BY ST_DistanceSphere(geometry, ST_MakePoint($${queryValues.length - 1}, $${queryValues.length}))`;
        }

        queryValues.push(dateStart, dateEnd);
        query += `) T WHERE timestamp BETWEEN $${queryValues.length - 1} AND $${queryValues.length}`;

        queryValues.push(limit);
        query += ` LIMIT $${queryValues.length}`;

        // Get records from DB
        let records = await db_postgis.query(query, queryValues);

        // Prepare records before sending to client
        records = records.rows.map((record: {[key: string]: any}) => {
            record.data['ben'] = {
                timestamp: record.timestamp,
                record_uid: record.record_uid,
                key: record.key
            }
            delete record.record_type, record.timestamp, record.record_uid, record.key, record.geometry;

            return record.data;
        });

        // Return only required record fields if selected
        if (fields.length > 0) {
            records = records
            .map((record: {[key: string]: any}) => {
                let newRecord: {[key: string]: any} = {};
                for (const key of fields) {
                    if (record[key] || record[key] === 0) {
                        newRecord[key] = record[key];
                    }
                }

                return newRecord;
            })
            // And remove empty objects
            .filter((record: {[key: string]: any}) => { return Object.keys(record).length > 0 });
        }
        return records;
    } catch(error) {
        log('error', error as string);
        return [];
    }
}

// Store fetch service statistics into DB
export async function saveStatistics(statistics: { [data_source: string]: dataSourceStats }): Promise<boolean> {
    try {
        await db_postgis.query(`INSERT INTO statistics (timestamp, data) VALUES (current_timestamp, $1);`, [statistics]);
        return true;
    } catch(error) {
        log('error', error as string);
        return false;
    }
}

// Get statistics from DB
export async function getStatistics(limit: number = Infinity): Promise<{uid: number, timestamp: Date, data: { [data_source: string]: dataSourceStats }}[]> {
    try {
        if (limit === Infinity) {
            return (await db_postgis.query(`SELECT * FROM statistics ORDER BY uid DESC;`))?.rows ?? [];
        } else {
            return (await db_postgis.query(`SELECT * FROM statistics ORDER BY uid DESC LIMIT $1;`, [limit]))?.rows ?? [];
        }
    } catch(error) {
        log('error', error as string);
        return [];
    }
}

// Count actual number of records in DB
export async function getRecordsNum(recordType: string): Promise<number> {
    try {
        return (parseInt((await db_postgis.query(`SELECT COUNT(*) FROM records WHERE record_type = $1;`, [recordType]))?.rows[0]?.count)) ?? 0;
    } catch(error) {
        log('error', error as string);
        return 0;
    }
}
