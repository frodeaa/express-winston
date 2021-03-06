// Not actually used for tests. Used to test the `index.d.ts` typescript definition matches known examples

import expressWinston = require('..');
import * as winston from 'winston';
import express = require('express');
import { Format } from 'logform';

const app = express();

// Logger with all options
app.use(expressWinston.logger({
    baseMeta: { foo: 'foo', nested: { bar: 'baz' } },
    bodyBlacklist: ['foo'],
    bodyWhitelist: ['bar'],
    dynamicMeta: (req, res, err) => ({ foo: 'bar' }),
    format: new Format(),
    ignoreRoute: (req, res) => true,
    ignoredRoutes: ['foo'],
    level: (req, res) => 'level',
    meta: true,
    metaField: 'metaField',
    msgFormat: (req, res) => 'msg',
    requestFilter: (req, prop) => req[prop],
    requestWhitelist: ['foo', 'bar'],
    skip: (req, res) => false,
    statusLevels: ({ error: 'error', success: 'success', warn: 'warn' }),
    transports: [
        new winston.transports.Console({})
    ]
}));

// Logger with minimum options (transport)
app.use(expressWinston.logger({
    transports: [
        new winston.transports.Console({})
    ],
}));

const logger = winston.createLogger();

// Logger with minimum options (winstonInstance)
app.use(expressWinston.logger({
    winstonInstance: logger,
}));

// Error Logger with all options
app.use(expressWinston.errorLogger({
    baseMeta: { foo: 'foo', nested: { bar: 'baz' } },
    dynamicMeta: (req, res, err) => ({ foo: 'bar' }),
    exceptionToMeta: function(error){return {}; },
    format: new Format(),
    level: (req, res) => 'level',
    meta: true,
    metaField: 'metaField',
    requestField: 'requestField',
    responseField: 'responseField',
    msgFormat: (req, res, err) => 'msg',
    requestFilter: (req, prop) => true,
    requestWhitelist: ['foo', 'bar'],
    headerBlacklist: ['foo', 'bar'],
    blacklistedMetaFields: ['foo', 'bar'],
    skip: (req, res) => false,
    transports: [
        new winston.transports.Console({})
    ]
}));

// Error Logger with min options (transports)
app.use(expressWinston.errorLogger({
    transports: [
        new winston.transports.Console({})
    ],
}));

// Error Logger with min options (winstonInstance)
app.use(expressWinston.errorLogger({
    winstonInstance: logger,
}));

// Request and error logger with function type msgFormat
app.use(expressWinston.logger({
    msgFormat: (req, res) => `HTTP ${req.method} ${req.url} - ${res.statusCode}`,
    transports: [
        new winston.transports.Console({})
    ],
}));

app.use(expressWinston.errorLogger({
    msgFormat: (req, res, err) => `HTTP ${req.method} ${req.url} - ${res.statusCode} - ${err.message}`,
    winstonInstance: logger,
}));

expressWinston.bodyBlacklist.push('potato');
expressWinston.bodyWhitelist.push('apple');
expressWinston.defaultRequestFilter = (req: expressWinston.FilterRequest, prop: string) => req[prop];
expressWinston.defaultResponseFilter = (res: expressWinston.FilterResponse, prop: string) => res[prop];
expressWinston.defaultSkip = () => true;
expressWinston.ignoredRoutes.push('/ignored');
expressWinston.responseWhitelist.push('body');

const router = express.Router();

router.post('/user/register', (req, res, next) => {
    const expressWinstonReq = req as expressWinston.ExpressWinstonRequest;
    expressWinstonReq._routeWhitelists.body = ['username', 'email', 'age'];
    expressWinstonReq._routeWhitelists.req = ['userId'];
    expressWinstonReq._routeWhitelists.res = ['_headers'];
});
