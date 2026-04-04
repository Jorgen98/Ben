/*
 * NextBike data source handling
 */

import dotenv from 'dotenv';
import https from 'https';

import { dbRecordToSave, logMsgType } from '../types.js';
import { saveStatistic, writeIntoLog } from '../log';
import { saveRecords } from '../db-postgis';

// Module variables
let fetchInterval: NodeJS.Timeout | null = null;
let downloading: boolean = false;
const nextBikeStatsName = 'nextBike';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_FETCH_MODULE_NEXTBIKE_NAME, type, msg)
}

// Get data and store them intro DB in 5 minutes interval
export async function startFetchingAndStoringNextBikeData(): Promise<void> {
    // First test attempt
    if (!(await getAndProcessData())) {
        log('error', 'Failed to start download NextBike data');
        return;
    }

    log('success', 'NextBike fetch is running');
    
    // Set regular downloading
    fetchInterval = setInterval(async () => {
        await getAndProcessData();
    }, 5 * 60 * 1000);
}

// Stop fetching data
export function stopFetchingNextBikeData(): void {
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
        const inputRecords = await downloadData(0);

        // If the fetching of records was successful, store records into DB
        if (inputRecords.success) {
            saveStatistic(nextBikeStatsName, 'successFetches', 1, 'add');

            // Prepare records
            const recordsToSave: dbRecordToSave[] = inputRecords.records
            // Remove damaged records
            .filter((record) => {
                try {
                    return typeof(parseInt(record.uid)) === 'number' &&
                        typeof(parseFloat(record.lat)) === 'number' &&
                        typeof(parseFloat(record.lng)) === 'number' &&
                        JSON.stringify(record);
                } catch (error) {
                    return false;
                };
            })
            // Remap records
            .map((record) => {
                return {
                    // As general key is set station ID
                    key: record.uid.toString(),
                    // Station geometry
                    geometry: {
                        lat: parseFloat(record.lat),
                        lng: parseFloat(record.lng)
                    },
                    // Record itself
                    data: JSON.stringify(record)
                }
            });

            // Store records into DB
            const dbSavingState = await saveRecords(nextBikeStatsName, recordsToSave);
            saveStatistic(nextBikeStatsName, 'downloadedRecords', inputRecords.records.length, 'add');
            saveStatistic(nextBikeStatsName, 'lastFetchedRecords', inputRecords.records.length, 'set');
            downloading = false;

            return dbSavingState;
        // There was records downloading error
        } else {
            saveStatistic(nextBikeStatsName, 'failedFetches', 1, 'add');
            downloading = false;
            return false;
        }
    } else {
        return true;
    }
}

// Download records from NextBike source
async function downloadData(downloadAttempt: number): Promise <{records: any[], success: boolean}> {
    return new Promise(async (resolve) => {
        // HTTPS request
        https
        // On success data download
        .get({
            hostname: "api.nextbike.net",
            path: "/maps/nextbike-live.json?city=660",
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

                    // Check if we get exactly Brno Data
                    if (parsedData === undefined || parsedData.countries === undefined ||
                        parsedData.countries.length != 1 || parsedData.countries[0].cities === undefined ||
                        parsedData.countries[0].cities.length != 1 || parsedData.countries[0].cities[0].places === undefined ||
                        parsedData.countries[0].cities[0].places.length < 1) {
                        resolve({records: [], success: false});
                    } else {
                        resolve({records: parsedData.countries[0].cities[0].places, success: true});
                    }
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
                resolve(await downloadData(downloadAttempt + 1));
            } else {
                resolve({records: [], success: false});
            }
        });
    });
}
