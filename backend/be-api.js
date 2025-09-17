/*
 * BE API Main File
 */

const express = require('express');
const dotenv = require('dotenv');
const app = express();
const cors = require('cors');

const logService = require('./log.js');
const dbPostgres = require('./db-postgres.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_API_MODULE_NAME, type, msg)
}

// CORS setup
app.use(cors());

// Function for API Token verification
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

    if (url.length < 1 || url[0] !== 'ben' || url[1] !== 'records') {
        res.send(false);
    } else {
        try {
            const objectId = parseInt(req.query.object_id);
            const lineId = req.query.line_id;
            const from = new Date(parseInt(req.query.from));
            const to = new Date(parseInt(req.query.to));
            if (objectId && lineId && from && to) {
                res.send((await dbPostgres.getData(objectId, lineId, from, to)).map((record) => {
                    record.data.objectid = record.id; return record.data;
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
    }
}

// Try to run processing service
let server = app.listen(7001, async () => {
    log('success', 'API service is running');
})

// Try to connect to DB
server.on('listening', async () => {
    if (await dbPostgres.connectToDB()) {
        log('success', 'Connected to DB');
    } else {
        log('error', 'Error while establishing DB connection');
    }
})

// API Token activation
app.use(verifyToken);