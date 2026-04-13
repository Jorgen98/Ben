/*
 * DB Postgis function file
 */

// Imports
const Pool = require('pg').Pool;
import dotenv from 'dotenv';

import { dataSourceStats, dbRecordToSave, logMsgType } from './types';
import { writeIntoLog } from './log';
import { lineTweetsStatsName, systemStatisticsStatsName, vehiclePositionsStatsName } from './data-sources/kordis';
import { nextBikeStatsName } from './data-sources/nextbike';
import { openWeatherStatsName } from './data-sources/openweather';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.DB_POSTGIS_MODULE_NAME, type, msg)
}

// Records table names
const recordsTables = new Set([
    vehiclePositionsStatsName,
    systemStatisticsStatsName,
    lineTweetsStatsName,
    nextBikeStatsName,
    openWeatherStatsName
]);

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

    // Check table name
    if (!recordsTables.has(recordType)) {
        return false;
    }

    // Construct DB query
    const queryValues: string[] = [];
    const queryPlaceholders = records.map((record, index) => {
        const base = index * 4;
        queryValues.push(record.key, record.geometry.lat.toString(), record.geometry.lng.toString(), record.data);
        return `(current_timestamp, $${base + 1}, ST_SetSRID(ST_MakePoint($${base + 2},$${base + 3}), 4326), $${base + 4}::jsonb)`;
    }).join(',');
    const query = `INSERT INTO ${recordType} (timestamp, key, geometry, data) VALUES ${queryPlaceholders};`;

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


    // Check table name
    if (!recordsTables.has(recordType)) {
        return [];
    }

    try {
        let query = `SELECT * FROM ${recordType}`;
        let queryValues: (string | number | Date)[] = [];

        queryValues.push(dateStart, dateEnd);
        query += ` WHERE timestamp BETWEEN $${queryValues.length - 1} AND $${queryValues.length}`;

        if (key !== null) {
            queryValues.push(key);
            query += ` AND key = $${queryValues.length}`;
        }

        if (recordUidStart !== null) {
            queryValues.push(recordUidStart);
            query += ` AND id >= $${queryValues.length}`;
        }

        if (recordUidEnd !== null) {
            queryValues.push(recordUidEnd);
            query += ` AND id <= $${queryValues.length}`;
        }

        if (point !== null) {
            queryValues.push(point.lat);
            queryValues.push(point.lng);
            query += ` ORDER BY ST_DistanceSphere(geometry, ST_MakePoint($${queryValues.length - 1}, $${queryValues.length}))`;
        }

        queryValues.push(limit);
        query += ` ${point === null ? "ORDER BY id": ""} LIMIT $${queryValues.length};`;

        // Get records from DB
        let records = await db_postgis.query(query, queryValues);

        // Prepare records before sending to client
        records = records.rows.map((record: {[key: string]: any}) => {
            record.data['ben'] = {
                timestamp: record.timestamp,
                record_uid: parseInt(record.id),
                key: record.key
            }
            delete record.record_type, record.timestamp, record.id, record.key, record.geometry;

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
    // Check table name
    if (!recordsTables.has(recordType)) {
        return 0;
    }

    try {
        return (parseInt((await db_postgis.query(`SELECT COUNT(*) FROM ${recordType};`))?.rows[0]?.count)) ?? 0;
    } catch(error) {
        log('error', error as string);
        return 0;
    }
}
