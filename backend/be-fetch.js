/*
 * Fetch server Main File
 */

const express = require('express');
const dotenv = require('dotenv');
const app = express();
const cron = require('node-cron');

const logService = require('./log.js');
const wsService = require('./websocket.js');
const dbPostgres = require('./db-postgres.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_FETCH_MODULE_NAME, type, msg)
}

// Try to run fetch service
const server = app.listen(null, async () => {
    log('success', 'Fetch service is running');
})

// Try to connect to DB
server.on('listening', async () => {
    if (await dbPostgres.connectToDB()) {
        log('success', 'Connected to DB');
        wsService.createWs();
    } else {
        log('error', 'Error while establishing DB connection');
    }
})

// Regular job functions
// Websocket reconnect job
cron.schedule('0 * * * *', async () => {
    wsService.recreateWs();
    await(dbPostgres.removeOldData());
    log('info', `Actual number of record in db: ${await dbPostgres.actualRecordNum()}`);
});
