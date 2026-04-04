/*
 * OpenWeather data source handling
 */

import dotenv from 'dotenv';
import https from 'https';

import { dbRecordToSave, logMsgType } from '../types.js';
import { saveStatistic, writeIntoLog } from '../log';
import { saveRecords } from '../db-postgis';

// Module variables
let fetchInterval: NodeJS.Timeout | null = null;
let downloading: boolean = false;
const openWeatherStatsName = 'openWeather';
const apiToken = process.env.BE_FETCH_MODULE_OPENWEATHER_TOKEN;
const positions: {name: string, lat: number, lng: number}[] = JSON.parse(process.env.BE_FETCH_MODULE_OPENWEATHER_PLACES as string ?? '[]');

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_FETCH_MODULE_OPENWEATHER_NAME, type, msg)
}

// Get data and store them intro DB in 10 minutes interval
export async function startFetchingAndStoringOpenWeatherData(): Promise<void> {
    // First test attempt
    if (!(await getAndProcessData()) || !apiToken || positions.length < 1) {
        log('error', 'Failed to start download OpenWeather data');
        return;
    }

    log('success', 'OpenWeather fetch is running');
    
    // Set regular downloading
    fetchInterval = setInterval(async () => {
        await getAndProcessData();
    }, 10 * 60 * 1000);
}

// Stop fetching data
export function stopFetchingOpenWeatherData(): void {
    if (fetchInterval !== null) {
        clearInterval(fetchInterval);
        fetchInterval = null;
    }
}

// Get and process data
async function getAndProcessData(): Promise<boolean> {
    if (!downloading) {
        downloading = true;
        // Get data
        const inputRecords = {success: false, records: []};
        for (const [idx, position] of positions.entries()) {
            if (position.lat && position.lng) {
                let positionRecords = await downloadData(0, idx, position.lat, position.lng);
                inputRecords.records = inputRecords.records.concat(positionRecords.records as any);
                inputRecords.success = positionRecords.success;
            }
        }

        // If the fetching of records was successful, store records into DB
        if (inputRecords.success) {
            saveStatistic(openWeatherStatsName, 'successFetches', 1, 'add');

            // Prepare records
            const recordsToSave: dbRecordToSave[] = inputRecords.records
            // Remove damaged records
            .filter((record: any) => {
                try {
                    return typeof(parseFloat(record.data.coord.lat)) === 'number' &&
                        typeof(parseFloat(record.data.coord.lon)) === 'number' &&
                        JSON.stringify(record);
                } catch (error) {
                    return false;
                };
            })
            // Remap records
            .map((record: any) => {
                return {
                    // As general key is set position of measurement
                    key: record.positionId.toString(),
                    // Position geometry
                    geometry: {
                        lat: parseFloat(record.data.coord.lat),
                        lng: parseFloat(record.data.coord.lon)
                    },
                    // Record itself
                    data: JSON.stringify(record.data)
                }
            });

            // Store records into DB
            const dbSavingState = await saveRecords(openWeatherStatsName, recordsToSave);
            saveStatistic(openWeatherStatsName, 'downloadedRecords', inputRecords.records.length, 'add');
            saveStatistic(openWeatherStatsName, 'lastFetchedRecords', inputRecords.records.length, 'set');
            downloading = false;

            return dbSavingState;
        // There was records downloading error
        } else {
            saveStatistic(openWeatherStatsName, 'failedFetches', 1, 'add');
            downloading = false;
            return false;
        }
    } else {
        return true;
    }
}

// Download records from OpenWeather source
async function downloadData(downloadAttempt: number, positionId: number, lat: number, lng: number): Promise <{records: {positionId: number, data: any}[], success: boolean}> {
    return new Promise(async (resolve) => {
        // HTTPS request
        https
        // On success data download
        .get({
            hostname: "api.openweathermap.org",
            path: `/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiToken}`
        }, async res => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];

            if (statusCode !== 200) {
                log('error', 'Wrong response status code');
                resolve({records: [], success: false});
                return;
            } else if (!contentType || !/^application\/json/.test(contentType)) {
                log('error', 'Invalid response content type');
                resolve({records: [], success: false});
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';

            // Collect data chunks
            res.on('data', (chunk) => {
                rawData += chunk;
            });

            // Process full response
            res.on('end', async () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    resolve({records: [{positionId: positionId, data: parsedData}], success: true});
                } catch (e) {
                    resolve({records: [], success: false});
                }
            });
        })
        // Handling records download error
        .on('error', async error => {
            log('error', error.message);

            // On one session, there is 5 attempts to download data
            if (downloadAttempt < 5) {
                resolve(await downloadData(downloadAttempt + 1, positionId, lat, lng));
            } else {
                resolve({records: [], success: false});
            }
        });
    });
}
