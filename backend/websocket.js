/*
 * Websocket connection handling
 */

const dotenv = require('dotenv');
const WebSocket = require('ws');

const logService = require('./log.js');
const dbPostgres = require('./db-postgres.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_FETCH_MODULE_NAME, type, msg)
}

let ws = undefined;
let reconnectTimeout = null;
let records = [];

function createWs() {
    if (ws !== undefined) {
        stopWs();
    }
    ws = new WebSocket(process.env.BE_FETCH_MODULE_WS_URL);

    ws.on("open", () => {
        log('success', 'Websocket connection has been established');
    });

    ws.on("message", async (data) => {
        try {
            records.push(JSON.parse(data.toString()).attributes);
        } catch(err) {}

        if (records.length > 1000) {
            let recordsToSave = JSON.parse(JSON.stringify(records));
            recordsToSave = recordsToSave.map((record) => {
                return {
                    date: new Date(record.lastupdate),
                    lineid: record.lineid,
                    data: record
                }
            })
            records = [];
            await dbPostgres.insertData(recordsToSave);
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

function recreateWs() {
    stopWs();
    createWs();
}

function stopWs() {
    ws.close(1000, "Normal shutdown");
}

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