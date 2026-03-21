/*
 * Main Types file
 */

// Console log msg type
export type logMsgType = 'success' | 'warning' | 'error' | 'info';

// DB record object
export type dbRecordToSave = {
    object_id: number,
    geometry: {lat: number, lng: number}
    data: string
};

// Data source stats
export type dataSourceStats = {
    lastRecordTimeStamp: Date,
    successFetches: number,
    failedFetches: number,
    downloadedRecords: number,
    lastFetchedRecords: number,
    databaseRecords: number
};
