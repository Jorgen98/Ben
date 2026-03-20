/*
 * BE API Main File
 */

// Imports
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

const app = express();
const requireAPIKey = JSON.parse(process.env.API_KEY ?? 'true');

import { writeIntoLog } from './log';
import { logMsgType } from './types';
import { connectToDB } from './db-postgis';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_API_MODULE_NAME, type, msg)
}

// CORS setup
app.use(cors());

// Function for API Token verification and request handling
async function verifyToken(req: Request, res: Response, next: NextFunction) {
    const token = process.env.BE_API_MODULE_TOKEN;
  
    if (requireAPIKey === 'true' && req.headers['authorization'] !== token) {
        log('info', 'Attempt with false API Token verification');
        res.send(false);
        return;
    }

    res.send(true);
}

// Try to run processing service
let server = app.listen(7001, async () => {console.log(requireAPIKey)
    log('success', 'API service is running');
})

// Try to connect to DB
server.on('listening', async () => {
    if (await connectToDB()) {
        log('success', 'Connected to DB');
    } else {
        log('error', 'Error while establishing DB connection');
    }
})

// API Token activation
app.use(verifyToken);
