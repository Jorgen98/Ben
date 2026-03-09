/*
 * KORDIS connection handling
 */

const dotenv = require('dotenv');
const soap = require("soap");

const logService = require('./log.js');
const dbPostgis = require('./db-postgis.js');

const WSDL_URL = "http://kordis.idsjmk.cz:8000/Traffic/?wsdl";
let client;
let pollingInterval;
let logInterval;
let downloading = false;
let successAttempts = 0;
let failedAttempts = 0;

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_FETCH_MODULE_NAME, type, msg)
}

// Create SOAP client
function createClient() {
    return new Promise((resolve) => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        if (logInterval) {
            clearInterval(logInterval);
            logInterval = null;
        }

        soap.createClient(WSDL_URL, (err, soapClient) => {
            if (err) {
                log('error', err);
                resolve(false);
                return;
            }

            client = soapClient;
            log('info', 'SOAP client initialized');

            downloadData();

            resolve(true);
        })
    })
}

// Download data from SOAP API
async function downloadData() {
    pollingInterval = setInterval(async () => {
        if (client !== undefined && !downloading) {
            
            downloading = true;
            client.KORDISService.BasicHttpBinding_ITrafficState.GetTrafficState({}, async (err, result) => {
                if (err) {
                    log('error', err);
                    downloading = false;
                    failedAttempts++;
                    return;
                }

                let recordsToSave = JSON.parse(JSON.stringify(result.GetTrafficStateResult.ItemList['TrafficStateResp.Entry']));
                recordsToSave = recordsToSave.map((record) => {
                    // Data mapping
                    record['carnum'] = parseInt(record['CarNum']);
                    delete record['CarNum'];
                    record['lat'] = record['Latitude'];
                    delete record['Latitude'];
                    record['lng'] = record['Longitude'];
                    delete record['Longitude'];
                    record['delay'] = record['DelayInMins'];
                    delete record['DelayInMins'];
                    record['lineid'] = parseInt(record['LineID']);
                    delete record['LineID'];
                    record['bearing'] = parseInt(record['Azimut']);
                    delete record['Azimut'];
                    record['routeid'] = parseInt(record['RouteID']);
                    delete record['RouteID'];
                    record['linename'] = record['LineName'];
                    delete record['LineName'];
                    record['isinactive'] = record['State'] === '0' ? 'false' : 'true';
                    delete record['State'];
                    record['laststopid'] = parseInt(record['LastStopID']);
                    delete record['LastStopID'];
                    record['finalstopid'] = parseInt(record['FinalStopID']);
                    delete record['FinalStopID'];
                    record['finalstopname'] = record['FinalStopName'];
                    delete record['FinalStopName'];
                    record['isbarrierless'] = record['IsBarrierLess'];
                    delete record['IsBarrierLess'];
                    record['lastupdate'] = (new Date()).valueOf();
                    delete record['DepartureDT'];
                    delete record['OCFinalStopID'];
                    delete record['OCFinalStopName'];
                    delete record['OCLineID'];
                    delete record['OCLineName'];
                    delete record['OCRouteID'];
                    delete record['ServiceID'];
                    delete record['VhcBCarNum'];
                    delete record['LastPostID'];
                    return {
                        date: new Date(record.lastupdate),
                        lineid: record.lineid,
                        data: record
                    }
                })

                await dbPostgis.insertDelayRecordsData(recordsToSave);
                successAttempts++;
                downloading = false;
            });
        }
    }, 10000);

    logInterval = setInterval(async () => {
        log('info', `Delay records success rate: ${Math.floor(successAttempts / (successAttempts + failedAttempts) * 100)}%`);
    }, 60 * 6 * 10000);
}

module.exports = { createClient }