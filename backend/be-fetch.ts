/*
 * Fetch server Main File
 */

// Imports
import express from 'express';
import dotenv from 'dotenv';

const app = express();

import { writeIntoLog } from './log';
import { logMsgType } from './types';
import { connectToDB } from './db-postgis';

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

// Try to connect to DB
server.on('listening', async () => {
    if (await connectToDB()) {
        log('success', 'Connected to DB');
    } else {
        log('error', 'Error while establishing DB connection');
    }
})
