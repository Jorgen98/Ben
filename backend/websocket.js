/*
 * Websocket connection handling
 */

const dotenv = require('dotenv');
const WebSocket = require('ws');

const logService = require('./log.js');
const dbPostgis = require('./db-postgis.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_FETCH_MODULE_NAME, type, msg)
}

let ws = undefined;
let reconnectTimeout = null;
let records = [];

// Open websocket connection and try to store data while listening
function createWs() {
    if (ws !== undefined) {
        stopWs();
    }

    // Data Brno websocket
    ws = new WebSocket(process.env.BE_FETCH_MODULE_WS_URL);

    ws.on("open", () => {
        log('success', 'Websocket connection has been established');
    });

    // Fetch data
    ws.on("message", async (data) => {
        try {
            records.push(JSON.parse(data.toString()).attributes);
        } catch(err) {}

        // Store data batch intro DB
        if (records.length > 1000) {
            let recordsToSave = JSON.parse(JSON.stringify(records));
            recordsToSave = recordsToSave.map((record) => {
                // Mapping from new WSS
                record['id'] = record['ID'];
                delete record['ID'];
                record['lf'] = record['LF'];
                delete record['LF'];
                delete record['IDC'];
                delete record['IDB'];
                record['lat'] = record['Lat'];
                delete record['Lat'];
                record['lng'] = record['Lng'];
                delete record['Lng'];
                record['delay'] = record['Delay'];
                delete record['Delay'];
                record['ltype'] = record['LType'];
                delete record['LType'];
                record['vtype'] = record['VType'];
                delete record['VType'];
                record['course'] = record['Course'];
                delete record['Course'];
                record['lineid'] = record['LineID'];
                delete record['LineID'];
                record['bearing'] = record['Bearing'];
                delete record['Bearing'];
                record['routeid'] = record['RouteID'];
                delete record['RouteID'];
                record['linename'] = record['LineName'];
                delete record['LineName'];
                record['isinactive'] = record['IsInactive'];
                delete record['IsInactive'];
                record['laststopid'] = record['LastStopID'];
                delete record['LastStopID'];
                record['finalstopid'] = record['FinalStopID'];
                delete record['FinalStopID'];
                record['lastupdate'] = record['TimeUpdated'];
                delete record['TimeUpdated'];
                return {
                    date: new Date(record.lastupdate),
                    lineid: record.lineid,
                    data: record
                }
            })
            records = [];
            await dbPostgis.insertDelayRecordsData(recordsToSave);
        }
    });

    ws.on("close", () => {
        log('success', 'Websocket connection has been closed');
    });

    ws.on("error", (error) => {
        log('error', error);
        tryToReconnect();
    });
}

// Open and close websocket
function recreateWs() {
    stopWs();
    createWs();
}

// Close websocket connection
function stopWs() {
    ws.close(1000, "Normal shutdown");
}

// Try to reconnect to websocket on failure
function tryToReconnect() {
    if (reconnectTimeout) {
        return;
    }
    log('info', 'Trying to reconnect to websocket server');

    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        stopWs();
    }, 60000);
}

module.exports = { createWs, stopWs, recreateWs }