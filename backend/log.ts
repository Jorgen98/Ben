/*
 * Log service function file
 */

import dotenv from 'dotenv';
import { dataSourceStats, logMsgType } from './types';
import { getRecordsNum, getStatistics, saveStatistics } from './db-postgis';

// .env file include
dotenv.config();

// Fetch service stats object
let stats: { [data_source: string]: dataSourceStats } = {};
// Usage of API keys stats
const apiKeysStatsLabel = "apiKeysUsage";
let apiKeysStats: { [key: string]: number } = {};

// Default terminal color
const defColor = "\x1b[37m";

// Module settings
const modules = [
    {
        name: process.env.BE_FETCH_MODULE_NAME,
        label: process.env.BE_FETCH_MODULE_LABEL,
        color: "\x1b[33m"
    },
    {
        name: process.env.BE_FETCH_MODULE_NEXTBIKE_NAME,
        label: process.env.BE_FETCH_MODULE_LABEL,
        color: "\x1b[33m"
    },
    {
        name: process.env.BE_API_MODULE_NAME,
        label: process.env.BE_API_MODULE_LABEL,
        color: "\x1b[35m"
    },
    {
        name: process.env.DB_POSTGIS_MODULE_NAME,
        label: process.env.DB_POSTGIS_MODULE_LABEL,
        color: "\x1b[36m"
    },
]

// Function for writing intro log
export function writeIntoLog(sourceModuleName: string | undefined, type: logMsgType, message: string) {
    const date = new Date();

    let terColor = defColor;
    let header = "";
    let msgToDisplay = "";

    switch (type) {
        case 'success': terColor = "\x1b[92m"; header = "SUCCESS"; break;
        case 'warning': terColor = "\x1b[33m"; header = "WARNING"; break;
        case 'error': terColor = "\x1b[91m"; header = "ERROR"; break;
        case 'info': terColor = defColor; header = "INFO"; break;
        default: return;
    }

    const sourceModule = modules.find((module) => { return module.name === sourceModuleName});

    if (sourceModule === undefined) {
        msgToDisplay = `${defColor}${date.toLocaleString('en')}${terColor} ${header}\t${defColor}UNKNOWN SERVICE ${message}`;
    } else {
        msgToDisplay = `${defColor}${date.toLocaleString('en')}${terColor} ${header}\t${sourceModule.color}${sourceModule.label}${defColor} ${message}`;
    }

    console.log(msgToDisplay);
}

// Function for fetch service working statistics save
export async function saveStatistic(source: string, parameter: 'successFetches' | 'failedFetches' | 'downloadedRecords' | 'lastFetchedRecords', value: number, operation: 'add' | 'set') {
    // Init new record statistics
    if (!stats[source]) {
        stats[source] = {
            lastRecordTimeStamp: new Date(),
            successFetches: 0,
            failedFetches: 0,
            downloadedRecords: 0,
            lastFetchedRecords: 0,
            databaseRecords: 0
        }
    }

    if (operation === 'add') {
        stats[source][parameter] += value;
    } else {
        stats[source][parameter] = value;
    }

    stats[source].lastRecordTimeStamp = new Date();
}

// Function for API key usage record
export function newAPIUsage(apiKeyIdx: string) {
    if (!apiKeysStats[apiKeyIdx]) {
        apiKeysStats[apiKeyIdx] = 1;
    } else {
        apiKeysStats[apiKeyIdx] += 1;
    }
}

// Put API key usage intro console
export function printAPIKeysUsage() {
    writeIntoLog(process.env.BE_API_MODULE_NAME, 'info', `Usage of API keys: ${JSON.stringify(apiKeysStats, null, 4)}`);
}

// Function for creating new stats snapshot in DB
export async function saveStatisticsIntoDB(): Promise<void> {
    let actualStatistics = (await getStatistics(1))[0]?.data ?? {};

    for (const key in stats) {
        actualStatistics[key] = stats[key];
        actualStatistics[key]['databaseRecords'] = await getRecordsNum(key);
    }

    // Save statistics into DB
    await saveStatistics(actualStatistics);
}
