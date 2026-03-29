/*
 * Redis communication client
 */

import Redis from "ioredis";
import dotenv from 'dotenv';
import { logMsgType } from "./types";
import { writeIntoLog } from "./log";

// .env file include
dotenv.config();

// Help function for log writing
function log(type: logMsgType, msg: string) {
    writeIntoLog(process.env.BE_REDIS_NAME, type, msg)
}

const redisUrl = process.env.BE_REDIS_URL || "";

// Publisher connection
export const publisher = new Redis(redisUrl, {
    retryStrategy: (times) => {
        if (times > 0) {
            return null;
        }
        // Retry after a delay (ms)
        return Math.min(times * 50, 2000);
    }
});
publisher.on("error", (error) => log('error', error.message) );

// Subscriber connection
export const subscriber = new Redis(redisUrl, {
    retryStrategy: (times) => {
        if (times > 0) {
            return null;
        }
        // Retry after a delay (ms)
        return Math.min(times * 50, 2000);
    }
});
subscriber.on("error", (error) => log('error', error.message) );
