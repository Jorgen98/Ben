/*
 * BE API Main File
 */

// Imports
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cron from 'node-cron';

const app = express();
const requireAPIKey = JSON.parse(process.env.API_KEY ?? 'true');

import { newAPIUsage, printAPIKeysUsage, writeIntoLog } from './log';
import { logMsgType } from './types';
import { connectToDB, getRecords, getStatistics } from './db-postgis';

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
    let tokens: string[] = [];
    try {
        tokens = JSON.parse((process.env.BE_API_MODULE_TOKENS ?? []) as string);
    } catch(error) {}

    if (requireAPIKey) {
        const tokenIdx = tokens.findIndex((token: string) => { return token === req.headers['authorization']});

        if (tokenIdx === -1) {
            log('info', 'Attempt with false API Token verification');
            res.status(401);
            res.send();
            return;
        } else {
            newAPIUsage(tokenIdx.toString());
        }
    }

    // Remove API prefix
    req.url = req.url.slice(8);
    next();
}

// Try to run processing service
let server = app.listen(7001, async () => {
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

// API endpoints

// Ben Fetch service stats
app.get('/stats', async (req, res) => {
    const stats = ((await getStatistics(1))[0] ?? {}) as any;
    delete stats.uid;

    res.status(200);
    res.send(stats);
})

// NextBike records
app.get('/records/:endpoint', async (req, res) => {
    let dateStart: Date, dateEnd: Date, objectId: number | null,
        recordUidStart: number | null, recordUidEnd: number | null,
        point: {lat: number, lng: number} | null, limit: number,
        fields: string[];

    if (!req.params.endpoint) {
        res.status(400);
        res.send();
    }

    // Process query parameters
    // Date period start
    if (req.query.dateFrom) {
        try {
            dateStart = new Date(req.query.dateFrom as string);
        } catch(error) {
            dateStart = new Date(0);
        }
        if (isNaN(dateStart.valueOf())) {
            dateStart = new Date(0);
        }
    } else {
        dateStart = new Date(0);
    }

    // Date period end
    if (req.query.dateTo) {
        try {
            dateEnd = new Date(req.query.dateTo as string);
        } catch(error) {
            dateEnd = new Date();
        }
        if (isNaN(dateEnd.valueOf())) {
            dateEnd = new Date();
        }
    } else {
        dateEnd = new Date();
    }

    // Record object id
    if (req.query.objectId) {
        try {
            objectId = parseInt(req.query.objectId as string);
        } catch(error) {
            objectId = null;
        }
        if (isNaN(objectId as number)) {
            objectId = null;
        }
    } else {
        objectId = null;
    }
    
    // Record UID start
    if (req.query.uidFrom) {
        try {
            recordUidStart = parseInt(req.query.uidFrom as string);
        } catch(error) {
            recordUidStart = null;
        }
        if (isNaN(recordUidStart as number)) {
            recordUidStart = null;
        }
    } else {
        recordUidStart = null;
    }

    // Record UID end
    if (req.query.uidTo) {
        try {
            recordUidEnd = parseInt(req.query.uidTo as string);
        } catch(error) {
            recordUidEnd = null;
        }
        if (isNaN(recordUidEnd as number)) {
            recordUidEnd = null;
        }
    } else {
        recordUidEnd = null;
    }

    // Geographical coords
    if (req.query.point) {
        try {
            point = JSON.parse(req.query.point as string);
        } catch(error) {
            point = null;
        }
        if (point?.lat && point?.lng) {
            try {
                const lat = parseFloat(point.lat.toString());
                const lng = parseFloat(point.lat.toString());

                if (isNaN(lat) || isNaN(lng)) {
                    point = null;
                }
            } catch(error) {
                point = null;
            }
        } else {
            point = null;
        }
    } else {
        point = null;
    }

    // Records count limit
    if (req.query.limit) {
        try {
            limit = parseInt(req.query.limit as string);
            if (isNaN(limit)) {
                limit = 20000;
            }
            limit = Math.abs(limit);

            // On one request can be returned only 20000 records
            if (limit > 20000) {
                limit = 20000;
            }
        } catch(error) {
            limit = 20000;
        }
    } else {
        limit = 20000;
    }

    // Records require fields
    if (req.query.fields) {
        try {
            fields = JSON.parse(req.query.fields as string);
        } catch(error) {
            fields = [];
        }
    } else {
        fields = [];
    }

    res.status(200);
    res.send(await getRecords(req.params.endpoint, dateStart, dateEnd, objectId, recordUidStart, recordUidEnd, point, limit, fields));
})

// Print API key usage intro console
cron.schedule('*/60 * * * *', async () => {
    printAPIKeysUsage()
});
