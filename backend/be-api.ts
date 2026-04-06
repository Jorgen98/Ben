/*
 * BE API Main File
 */

// Imports
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cron from 'node-cron';
import { WebSocketServer } from "ws";

const app = express();
const requireAPIKey = JSON.parse(process.env.API_KEY ?? 'true');
const maxNumberOfRecords = 50000;

import { newAPIUsage, printAPIKeysUsage, writeIntoLog } from './log';
import { logMsgType, redisChannel } from './types';
import { connectToDB, getRecords, getStatistics } from './db-postgis';
import { subscriber } from './redis';
import { vehiclePositionsStatsName } from './data-sources/kordis';

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_API_MODULE_NAME, type, msg)
}

// CORS setup
app.use(cors());

// API verification function
function isTokenValid(providedToken: string): boolean {
    let tokens: string[] = [];
    try {
        tokens = JSON.parse((process.env.BE_API_MODULE_TOKENS ?? []) as string);
    } catch(error) {}

    if (requireAPIKey) {
        const tokenIdx = tokens.findIndex((token: string) => { return token === providedToken});

        if (tokenIdx === -1) {
            log('info', 'Attempt with false API Token verification');
            return false;
        } else {
            newAPIUsage(tokenIdx.toString());
        }
    }

    return true;
}

// Function for API Token verification and request handling
async function verifyToken(req: Request, res: Response, next: NextFunction) {
    if (!(isTokenValid(req.headers['authorization'] ?? ''))) {
        res.status(401);
        res.send();
        return;
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
    let dateStart: Date, dateEnd: Date, key: string | null,
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
    if (req.query.key) {
        if (req.query.key === '') {
            key = null;
        } else {
            key = req.query.key as string;
        }
    } else {
        key = null;
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
                limit = maxNumberOfRecords;
            }
            limit = Math.abs(limit);

            // On one request can be returned only default max num of records
            if (limit > maxNumberOfRecords) {
                limit = maxNumberOfRecords;
            }
        } catch(error) {
            limit = maxNumberOfRecords;
        }
    } else {
        limit = maxNumberOfRecords;
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
    res.send(await getRecords(req.params.endpoint, dateStart, dateEnd, key, recordUidStart, recordUidEnd, point, limit, fields));
})

// Print API key usage intro console
cron.schedule('0 * * * *', async () => {
    printAPIKeysUsage()
});


// Web socket endpoints handling
// WSS Vehicle position server
const wssVP = new WebSocketServer({ server, path: `/ben/ws/${vehiclePositionsStatsName}` });
let wsVP: undefined | any = undefined;
wssVP.on("connection", (ws, request) => {
    if (!(isTokenValid(request.headers['authorization'] ?? ''))) {
        ws.close(1008, "Unauthorized");
        return;
    }

    wsVP = ws;
});

// Subscribe to messages
subscriber.subscribe(redisChannel, (error) => {
    if (error) {
        log('error', error.message);
    }
});

// Send messages to connected wss clients after module from fetch service calls publisher function
subscriber.on("message", async (channel, message) => {
    try {
        const data = JSON.parse(message);
        
        // Vehicle positions socket
        if (data.type === vehiclePositionsStatsName) {
            if (wsVP !== undefined) {
                wssVP.clients.forEach((client:any) => {
                    if (client.readyState === WebSocket.OPEN) {
                        for (const record of data.data) {
                            client.send(record.data);
                        }
                    }
                });
            }
        }
    } catch (error: any) {
        log('error', error.toString());
    }
});
