/*
 * BE API Main File
 */

const express = require('express');
const dotenv = require('dotenv');
const app = express();
const cors = require('cors');

const logService = require('./log.js');
const dbPostgis = require('./db-postgis.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_API_MODULE_NAME, type, msg)
}

// CORS setup
app.use(cors());

// Function for API Token verification and request handling
async function verifyToken(req, res, next) {
    const token = process.env.BE_API_MODULE_TOKEN;
  
    if (process.env.API_KEY === 'true' && req.headers['authorization'] !== token) {
        log('info', 'Attempt with false API Token verification');
        res.send(false);
        return;
    }

    let url = req.originalUrl.split(/[?\/]/);
    let idx = 0;
    while (idx < url.length) {
        if (url[idx] == '') {
            url.splice(idx, 1);
        } else {
            idx++;
        }
    }

    if (url.length < 1 || url[0] !== 'ben' || (url[1] !== 'delayRecords' && url[1] !== 'nextbike')) {
        res.send(false);
    // Handle delay records API calls
    } else if (url[0] === 'ben' && url[1] === 'delayRecords') {
        try {
            const objectId = parseInt(req.query.object_id);
            const lineId = req.query.line_id;
            const from = new Date(parseInt(req.query.from));
            const to = new Date(parseInt(req.query.to));
            if ((objectId || objectId === 0) && lineId && from && to) {
                res.send((await dbPostgis.getDelayRecordsData(objectId, lineId, from, to)).map((record) => {
                    record.data.objectid = record.id;
                    return record.data;
                }))
            } else {
                res.send([]);
            }
            return;
        } catch(err) {
            log('error', err);
            res.send(false);
            return;
        }
    // Handle nextBike API calls
    } else if (url[0] === 'ben' && url[1] === 'nextbike') {
        try {
            let from = new Date(parseInt(req.query.from ?? 0));
            let to = new Date(parseInt(req.query.to ?? 0));
            let uid = parseInt(req.query.station_uid ?? null);
            let position = JSON.parse(req.query.position);
            let limit = JSON.parse(req.query.limit ?? null);

            if (Math.abs(from - to) > 24 * 60 * 60 * 1000) {
                to = new Date(from.valueOf() + 24 * 60 * 60 * 1000);
            }

            if (limit === null || limit > 10) {
                limit = 10;
            }

            if (from && to && url[2] === 'places') {
                res.send(await dbPostgis.getNextBikePlaces(from, to));
            } else if (from && to && uid !== null && url[2] === 'records') {
                res.send(await dbPostgis.getNextBikeRecords(uid, from, to));
            } else if (from && to && position.length === 2 && url[2] === 'placesAround') {
                res.send(await dbPostgis.getNextBikePlacesAround(position, from, to , limit));
            } else {
                res.send([]);
            }
            return;
        } catch(err) {
            log('error', err);
            res.send(false);
            return;
        }
    } else {
        res.send(false);
    }
}

// Try to run processing service
let server = app.listen(7001, async () => {
    log('success', 'API service is running');
})

// Try to connect to DB
server.on('listening', async () => {
    if (await dbPostgis.connectToDB()) {
        log('success', 'Connected to DB');
    } else {
        log('error', 'Error while establishing DB connection');
    }
})

// API Token activation
app.use(verifyToken);
