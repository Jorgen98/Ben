/*
 * Nextbike data handling
 */

const dotenv = require('dotenv');
const https = require('https');

const logService = require('./log.js');
const dbPostgis = require('./db-postgis.js');

// .env file include
dotenv.config();

// Help function for log writing
function log(type, msg) {
    logService.write(process.env.BE_FETCH_MODULE_NAME, type, msg)
}

// Get data and store them intro DB
async function getData() {
    const inputData = await downloadData(0);

    if (inputData.length > 0) {
        await dbPostgis.insertNextBikeData(inputData);
    }
}

// Download data
async function downloadData(attempt) {
    return new Promise(async (resolve) => {
        https.get({
            hostname: "api.nextbike.net",
            path: "/maps/nextbike-live.json?city=660",
        }, async res => {
            let { statusCode } = res;
            let contentType = res.headers['content-type'];

            if (statusCode !== 200) {
                log('error', 'Wrong response status code');
                resolve([]);
                return;
            } else if (!/^application\/json/.test(contentType)) {
                log('error', 'Invalid response content type');
                resolve([]);
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';

            res.on('data', (chunk) => {
                rawData += chunk;
            });

            res.on('end', async () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData === undefined || parsedData.countries === undefined ||
                        parsedData.countries.length != 1 || parsedData.countries[0].cities === undefined ||
                        parsedData.countries[0].cities.length != 1 || parsedData.countries[0].cities[0].places === undefined ||
                        parsedData.countries[0].cities[0].places.length < 1) {
                        resolve([]);
                    } else {
                        resolve(parsedData.countries[0].cities[0].places);
                    }
                } catch (e) {
                    resolve([]);
                }
            });
        })
        .on('error', async error => {
            log('error', error);
            if (attempt < 5) {
                resolve(await downloadData(attempt + 1));
            } else {
                resolve([]);
            }
        });
    });
}

// Get external API key
async function getAPIKey() {
    return new Promise(async (resolve) => {
        https.get({
            hostname: "webview.nextbike.net",
            path: "/getAPIKey.json"
        }, async res => {
            let { statusCode } = res;
            let contentType = res.headers['content-type'];

            if (statusCode !== 200) {
                log('error', 'Wrong response status code');
                resolve(undefined);
                return;
            } else if (!/^application\/json/.test(contentType)) {
                log('error', 'Invalid response content type');
                resolve(undefined);
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';

            res.on('data', (chunk) => {
                rawData += chunk;
            });

            res.on('end', async () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    resolve(parsedData['apiKey']);
                } catch (e) {
                    resolve(undefined);
                }
            });
        })
        .on('error', async error => {
            log('error', error);
            resolve(undefined);
        });
    });
}

module.exports = { getData }