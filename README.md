# Ben

A server for collecting, integrating, and storing transportation data for the South Moravian Region. Data retrieval is secured using an API key. Each data source is accessible via a single endpoint with the same parameters. Time stamps are saved in local timezone.

### Server Statistics

`GET new-ben/stats`

**Description**

Returns a JSON object containing downloading and DB statistics.

**Request Parameters**

None

### Data sources
The maximum number of returned records for one request is 10 000.

**Nextbike**

`GET new-ben/records/nextBike`
`Fetching time: Every 5 minutes`

The **Nextbike API endpoint** collect data from the web service interface provided by Nextbike. It consists information such as:

- Available bikes at each station
- Station locations and IDs
- Bike availability and status

Every record is simple JSON, which represent state of one station in particular time.

**KORDIS Vehicle Positions**

`GET new-ben/records/vehiclePositions`
`WSS new-ben/ws/vehiclePositions`
`Fetching time: Every 10 seconds`

The **KORDIS Vehicle Positions** collect data from the internal KORDIS DB. Every record is simple JSON, which represent state of one vehicle in the Integrated transport system of South Moravian Region in particular time. Every state consists from information like:

- Position of the vehicle
- Actual line, route and delay
- Vehicle status

**OpenWeather**

`GET new-ben/records/openWeather`
`Fetching time: Every 10 minutes`

The **OpenWeather API endpoint** refers to the web service interface provided by OpenWeather. It consists information such as:

- Current weather conditions (temperature, wind, humidity, etc.)

Every record is simple JSON, which represent state of one measurement position in particular time.

### General record query params

**Description**  

Returns records filtered by various query parameters such as date range, key, uid range, location, and selected data fields. Key parameter can be used to filter only group of records, f.e. only records from one station. Key parameter is connected with exactly one record property. In case of `nextBike` records it is stationID, in case of `vehiclePositions` it is lineID and in case of `openWeather` it is measurement stationID. If required, every record contain `ben` prop, which can be used for futher filtration in the other queries.

| Name | Type | Required | Description |
| ---------- | -------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `dateFrom` | string (ISO 8601)    | No       | Start date for filtering records                                                          |
| `dateTo`   | string (ISO 8601)    | No       | End date for filtering records                                                            |
| `key`      | string               | No       | Identifier of the group of records                                                        |
| `uidFrom`  | number               | No       | Start of record ID range                                                                  |
| `uidTo`    | number               | No       | End of record ID range                                                                    |
| `point`    | object (JSON string) | No       | Geographic point `{ lat, lng }`, the geographically closes records will be returned first |
| `limit`    | number               | No       | Maximum number of records returned                                                        |
| `fields`   | array (JSON string)  | No       | List of fields to include in response                                                     |

**Example**

`GET /new-ben/records/nextBike?dateFrom=2026-03-22T23:09:07.403Z&dateTo=2026-03-23T17:19:49.367Z&objectId=600454605&uidFrom=2&uidTo=2&point={"lat":49.177498,"lng":16.604521}&limit=20&fields=["ben","name","bikes","lat","lng"]`

## Usage

1. Create `env/.env` file, example is located in `env/.example.env` directory.
3. In the `env/.env` file, set the `DB_POSTGIS_PASSWORD`, `BE_FETCH_MODULE_OPENWEATHER_TOKEN`, `BE_FETCH_MODULE_OPENWEATHER_PLACES` and `BE_API_MODULE_TOKENS` variables.
4. The tool can be run in 4 modes:
-  `make walter-prod` - Special mode without port expose
-  `make prod` - Classical mode with :80 port expose
5. After build and startup, the server runs on `http://your_url/ben`
6. Server can be stopped by `make stop`

## License

This project is licensed under GPL-3.0.
