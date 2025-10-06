/*
 * Fetch server Main File
 */

const express = require('express');
const dotenv = require('dotenv');
const app = express();
const cron = require('node-cron');

const logService = require('./log.js');
const wsService = require('./websocket.js');
const dbPostgis = require('./db-postgis.js');
const nextBikeService = require('./nextbike.js');

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
    if (await dbPostgis.connectToDB()) {
        log('success', 'Connected to DB');
        wsService.createWs();
    } else {
        log('error', 'Error while establishing DB connection');
    }await nextBikeService.getData();
})

// Regular job functions
// Websocket reconnect job
cron.schedule('0 * * * *', async () => {
    wsService.recreateWs();
    await(dbPostgis.removeOldDelayRecordsData());
    log('info', `Actual number of record in db: ${await dbPostgis.actualDelayRecordsNum()}`);
});
// Nextbike data fetch
cron.schedule('*/10 * * * *', async () => {
    await nextBikeService.getData();
    log('info', "NextBike data has been saved");
});
