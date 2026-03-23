/*
 * KORDIS SOAP server data source handling
 */

import dotenv from 'dotenv';
import * as soap from "soap";

import { dbRecordToSave, logMsgType } from '../types.js';
import { saveStatistic, writeIntoLog } from '../log';
import { saveRecords } from '../db-postgis';

// Module variables
let client: soap.Client | undefined = undefined;
let fetchInterval: NodeJS.Timeout | null = null;
let downloading: boolean = false;
const vehiclePositionsStatsName = 'vehiclePositions';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_FETCH_MODULE_KORDIS_NAME, type, msg)
}

// Get data and store them intro DB in custom interval for every endpoint
export async function startFetchingAndStoringKordisData(): Promise<void> {
    // First test attempt
    if (!(await createSOAPClient()) || !(await getAndProcessVehiclePositionsData())) {
        log('error', 'Failed to start download KORDIS data');
        return;
    }

    log('success', 'KORDIS fetch is running');
    
    // Set regular downloading for vehicle positions data every 10 seconds
    fetchInterval = setInterval(async () => {
        await getAndProcessVehiclePositionsData();
    }, 10 * 1000);
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

// Get and process vehicle position data
async function getAndProcessVehiclePositionsData(): Promise<boolean> {
    if (!downloading) {
        downloading = true;
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

// Download records from OpenWeather source
async function downloadVehiclePositionsData(): Promise <{success: boolean, records: any[]}> {
    return new Promise(async (resolve) => {
        if (!client || !client.KORDISService?.BasicHttpBinding_ITrafficState?.GetTrafficState) {
            return {success: false, records: []};
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
