/*
 * KORDIS SOAP server data source handling
 */

import dotenv from 'dotenv';
import * as soap from "soap";

import { dbRecordToSave, logMsgType, redisChannel } from '../types';
import { saveStatistic, writeIntoLog } from '../log';
import { saveRecords } from '../db-postgis';
import { publisher } from '../redis';

// Module variables
let client: soap.Client | undefined = undefined;
let fetchInterval: NodeJS.Timeout | null = null;
let downloading: boolean = false;
export const vehiclePositionsStatsName = 'vehiclePositions';
export const systemStatisticsStatsName = 'systemStats';
export const lineTweetsStatsName = 'lineTweets';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_FETCH_MODULE_KORDIS_NAME, type, msg)
}

// Get data and store them intro DB in custom interval for every endpoint
export async function startFetchingAndStoringKordisData(): Promise<void> {
    // First test attempt
    if (!(await firstRun())) {
        log('error', 'Failed to start download KORDIS data');
        return;
    }
    

    log('success', 'KORDIS fetch is running');

    // Set regular downloading for vehicle positions data every 10 seconds
    fetchInterval = setInterval(async () => {
        await getAndProcessVehiclePositionsData();
    }, 10 * 1000);

    // Set regular downloading for system statistics and line tweets data every 5 minutes
    fetchInterval = setInterval(async () => {
        await getAndProcessSystemStatisticsData();
        await getAndProcessLinesTweetsData();
    }, 5 * 60 * 1000);
}

async function firstRun(): Promise<boolean> {
    if (!(await createSOAPClient())) {
        return false;
    }
    if (!(await getAndProcessVehiclePositionsData())) {
        return false;
    }
    if (!(await getAndProcessSystemStatisticsData())) {
        return false;
    }
    if (!(await getAndProcessLinesTweetsData())) {
        return false;
    }
    return true;
}

// Stop fetching data
export function stopFetchingKordisData(): void {
    if (fetchInterval !== null) {
        clearInterval(fetchInterval);
        fetchInterval = null;
    }
}

// Function for SOAP client creation
async function createSOAPClient(): Promise<boolean> {
    if (!client) {
        return new Promise((resolve) => {
            soap.createClient("http://kordis.idsjmk.cz:8000/Traffic/?wsdl", (error, soapClient) => {
                if (error) {
                    log('error', error);
                    resolve(false);
                    return;
                }

                client = soapClient;
                log('info', 'SOAP client initialized');

                resolve(true);
            });
        });
    } else {
        return true;
    }
}

// Endpoint 1. - Vehicle positions
// Get and process vehicle position data
async function getAndProcessVehiclePositionsData(): Promise<boolean> {
    if (!downloading) {
        downloading = true;

        // Get traffic management texts
        const mgTexts = await downloadTrafficManagementTexts();
        // Get data
        const inputRecords = await downloadVehiclePositionsData();

        // If the fetching of records was successful, store records into DB
        if (inputRecords.success) {
            saveStatistic(vehiclePositionsStatsName, 'successFetches', 1, 'add');

            // Prepare records
            const recordsToSave: dbRecordToSave[] = inputRecords.records
            // Remove damaged records
            .filter((record: any) => {
                try {
                    return typeof(parseFloat(record.Latitude)) === 'number' &&
                        typeof(parseFloat(record.Longitude)) === 'number' &&
                        typeof(parseFloat(record.LineID)) === 'number' &&
                        JSON.stringify(record);
                } catch (error) {
                    return false;
                };
            })
            // Remap records
            .map((record: any) => {
                // Add traffic management text related to vehicle if any exists
                if (mgTexts.success) {
                    const idx = mgTexts.records.findIndex((text) => { return text.CarNum === record.CarNum });
                    if (idx !== -1) {
                        record['TMFlagText'] = mgTexts.records[idx]['TMFlagText'];
                    } else {
                        record['TMFlagText'] = "";
                    }
                }

                return {
                    // As general key is set line ID
                    key: record.LineID,
                    // Vehicle geometry
                    geometry: {
                        lat: parseFloat(record.Latitude),
                        lng: parseFloat(record.Longitude)
                    },
                    // Record itself
                    data: JSON.stringify(record)
                }
            });

            // Store records into DB
            const dbSavingState = await saveRecords(vehiclePositionsStatsName, recordsToSave);
            saveStatistic(vehiclePositionsStatsName, 'downloadedRecords', inputRecords.records.length, 'add');
            saveStatistic(vehiclePositionsStatsName, 'lastFetchedRecords', inputRecords.records.length, 'set');
            downloading = false;

            // Send data to API container to publish via websocket
            try {
                await publisher.publish(redisChannel, JSON.stringify({ type: vehiclePositionsStatsName, data: recordsToSave }));
            } catch (error) {}

            return dbSavingState;
        // There was records downloading error
        } else {
            saveStatistic(vehiclePositionsStatsName, 'failedFetches', 1, 'add');
            downloading = false;
            return false;
        }
    } else {
        return true;
    }
}

// Download records from source
async function downloadVehiclePositionsData(): Promise <{success: boolean, records: any[]}> {
    return new Promise(async (resolve) => {
        if (!client || !client.KORDISService?.BasicHttpBinding_ITrafficState?.GetTrafficState) {
            resolve({success: false, records: []});
            return;
        }

        // SOAP request
        client.KORDISService.BasicHttpBinding_ITrafficState.GetTrafficState({}, async (error: string, result: any) => {
            if (error) {
                log('error', error);
                resolve({success: false, records: []});
                return;
            }

            // Try to parse records
            let recordsToSave = [];
            try {
                recordsToSave = JSON.parse(JSON.stringify(result.GetTrafficStateResult.ItemList['TrafficStateResp.Entry']));
                resolve({success: true, records: recordsToSave});
            } catch(error) {
                resolve({success: false, records: []});
                return;
            }
        });
    });
}

// Download traffic messages
async function downloadTrafficManagementTexts(): Promise <{success: boolean, records: any[]}> {
    return new Promise(async (resolve) => {
        if (!client || !client.KORDISService?.BasicHttpBinding_ITrafficState?.GetTrafficManagementText) {
            resolve({success: false, records: []});
            return;
        }

        // SOAP request
        client.KORDISService.BasicHttpBinding_ITrafficState.GetTrafficManagementText({}, async (error: string, result: any) => {
            if (error) {
                log('error', error);
                resolve({success: false, records: []});
                return;
            }

            // Try to parse records
            try {
                const texts = JSON.parse((JSON.stringify(result.GetTrafficManagementTextResult.TMTextL['TMTextResp.Entry'])));
                resolve({success: true, records: texts});
            } catch(error) {
                resolve({success: false, records: []});
                return;
            }
        });
    });
}

// Endpoint 2. - System statistics
// Get and process actual IDS JMK state
async function getAndProcessSystemStatisticsData(): Promise<boolean> {
    if (!downloading) {
        downloading = true;
        // Get data
        const inputRecords = await downloadSystemStatisticsData();

        // If the fetching of records was successful, store records into DB
        if (inputRecords.success) {
            saveStatistic(systemStatisticsStatsName, 'successFetches', 1, 'add');

            // Prepare records
            const recordsToSave: dbRecordToSave[] = inputRecords.records
            // Remap records
            .map((record: any) => {
                return {
                    // General key does not exists
                    key: "0",
                    // Statistics do not have position
                    geometry: {
                        lat: 0,
                        lng: 0
                    },
                    // Record itself
                    data: JSON.stringify(record)
                }
            });

            // Store records into DB
            const dbSavingState = await saveRecords(systemStatisticsStatsName, recordsToSave);
            saveStatistic(systemStatisticsStatsName, 'downloadedRecords', inputRecords.records.length, 'add');
            saveStatistic(systemStatisticsStatsName, 'lastFetchedRecords', inputRecords.records.length, 'set');
            downloading = false;

            return dbSavingState;
        // There was records downloading error
        } else {
            saveStatistic(systemStatisticsStatsName, 'failedFetches', 1, 'add');
            downloading = false;
            return false;
        }
    } else {
        return true;
    }
}

// Download records from source
async function downloadSystemStatisticsData(): Promise <{success: boolean, records: any[]}> {
    return new Promise(async (resolve) => {
        if (!client || !client.KORDISService?.BasicHttpBinding_IActualTrafficPerformance?.GetActualTrafficPerformance) {
            resolve({success: false, records: []});
            return;
        }

        // SOAP request
        client.KORDISService.BasicHttpBinding_IActualTrafficPerformance.GetActualTrafficPerformance({}, async (error: string, result: any) => {
            if (error) {
                log('error', error);
                resolve({success: false, records: []});
                return;
            }

            // Try to parse records
            try {
                const stats = JSON.parse((JSON.stringify(result.GetActualTrafficPerformanceResult)));
                resolve({success: true, records: [stats]});
            } catch(error) {
                resolve({success: false, records: []});
                return;
            }
        });
    });
}

// Endpoint 3. - Lines tweets
// Line tweets - information about errors during service
async function getAndProcessLinesTweetsData(): Promise<boolean> {
    if (!downloading) {
        downloading = true;
        // Get data
        const inputRecords = await downloadLinesTweetsData();
        // If the fetching of records was successful, store records into DB
        if (inputRecords.success) {
            saveStatistic(lineTweetsStatsName, 'successFetches', 1, 'add');

            // Prepare records
            const recordsToSave: dbRecordToSave[] = inputRecords.records
            // Remap records
            .map((record: any) => {
                return {
                    // As general key is set record ID
                    key: record.ID,
                    // Tweet does not have position
                    geometry: {
                        lat: 0,
                        lng: 0
                    },
                    // Record itself
                    data: JSON.stringify(record)
                }
            });

            // Store records into DB
            const dbSavingState = await saveRecords(lineTweetsStatsName, recordsToSave);
            saveStatistic(lineTweetsStatsName, 'downloadedRecords', inputRecords.records.length, 'add');
            saveStatistic(lineTweetsStatsName, 'lastFetchedRecords', inputRecords.records.length, 'set');
            downloading = false;

            return dbSavingState;
        // There was records downloading error
        } else {
            saveStatistic(lineTweetsStatsName, 'failedFetches', 1, 'add');
            downloading = false;
            return false;
        }
    } else {
        return true;
    }
}

// Download records from source
async function downloadLinesTweetsData(): Promise <{success: boolean, records: any[]}> {
    return new Promise(async (resolve) => {
        if (!client || !client.KORDISService?.BasicHttpBinding_ITweetsOnLines?.GetTweets) {
            resolve({success: false, records: []});
            return;
        }

        // SOAP request
        client.KORDISService.BasicHttpBinding_ITweetsOnLines.GetTweets({}, async (error: string, result: any) => {
            if (error) {
                log('error', error);
                resolve({success: false, records: []});
                return;
            }
            // Try to parse records
            try {
                const tweets = JSON.parse((JSON.stringify(result.GetTweetsResult?.['TweetsOnLinesResp'])));
                resolve({success: true, records: tweets});
            } catch(error) {
                resolve({success: false, records: []});
                return;
            }
        });
    });
}
