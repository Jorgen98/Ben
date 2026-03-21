/*
 * Fetch server Main File
 */

// Imports
import express from 'express';
import dotenv from 'dotenv';
import cron from 'node-cron';

const app = express();

import { saveStatisticsIntoDB, writeIntoLog } from './log';
import { logMsgType } from './types';
import { connectToDB } from './db-postgis';
import { startFetchingAndStoringNextBikeData, stopFetchingNextBikeData } from './data-sources/nextbike';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_FETCH_MODULE_NAME, type, msg)
}

// Try to run fetch service
const server = app.listen(null, async () => {
    log('success', 'Fetch service is running');
})

// On server startup
server.on('listening', async () => {
    if (await connectToDB()) {
        log('success', 'Connected to DB');
    } else {
        log('error', 'Error while establishing DB connection');
        return;
    }

    // Start fetching NextBike records
    await startFetchingAndStoringNextBikeData();
    await saveStatisticsIntoDB();
})

// Save fetch statistics
cron.schedule('*/1 * * * *', async () => {
    await saveStatisticsIntoDB();
});

// On server shutdown
server.on('close', () => {
    stopFetchingNextBikeData();
})
