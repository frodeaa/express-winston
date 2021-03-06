// Copyright (c) 2012-2014 Heapsource.com and Contributors - http://www.heapsource.com
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
var winston = require('winston');

function isKey(value) {
    const type = typeof value;
    return type == 'number' || type == 'boolean' || value == null;
}

function pathAsArray(path) {
    return Array.isArray(path)?
        path : isKey(path) ? [path] : path.split(".");
}

function getBase(object, path) {
    path = pathAsArray(path);

    let index = 0
    const length = path.length

    while (object != null && index < length) {
      object = object[path[index++]];
    }
    return (index && index == length) ? object : undefined;
}

function baseSet(object, path, value) {
    if (typeof object !== 'object') {
        return object;
    }

    path = pathAsArray(path);
    path.reduce((prev, cur, index) => {
        prev[cur] = prev[cur] || {};
        if (index === path.length -1) {
            prev[cur] = value;
        }
        return prev[cur];
    }, object);
    return object;
}

function isFunction(value) {
    return typeof value === 'function';
}

function get(object, path, defaultValue) {
    const result = object == null ? undefined : getBase(object, path);
    return result === undefined ? defaultValue : result;
}

function set(object, path, value) {
    return object == null? value : baseSet(object, path, value);

}

/**
 * A default list of properties in the request object that are allowed to be logged.
 * These properties will be safely included in the meta of the log.
 * 'body' is not included in this list because it can contains passwords and stuff that are sensitive for logging.
 * TODO: Include 'body' and get the defaultRequestFilter to filter the inner properties like 'password' or 'password_confirmation', etc. Pull requests anyone?
 * @type {Array}
 */
exports.requestWhitelist = ['url', 'headers', 'method', 'httpVersion', 'originalUrl', 'query'];

/**
 * A default list of properties in the request body that are allowed to be logged.
 * This will normally be empty here, since it should be done at the route level.
 * @type {Array}
 */
exports.bodyWhitelist = [];

/**
 * A default list of properties in the request body that are not allowed to be logged.
 * @type {Array}
 */
exports.bodyBlacklist = [];

/**
 * A default list of properties in the response object that are allowed to be logged.
 * These properties will be safely included in the meta of the log.
 * @type {Array}
 */
exports.responseWhitelist = ['statusCode'];

/**
 * A list of request routes that will be skipped instead of being logged. This would be useful if routes for health checks or pings would otherwise pollute
 * your log files.
 * @type {Array}
 */
exports.ignoredRoutes = [];

/**
 * A default function to filter the properties of the req object.
 * @param req
 * @param propName
 * @return {*}
 */
exports.defaultRequestFilter = function (req, propName) {
    return get(req, propName);
};

/**
 * A default list of headers in the request object that are not allowed to be logged.
 * @type {Array}
 */
exports.defaultHeaderBlacklist = [];

/**
 * A default function to filter the properties of the res object.
 * @param res
 * @param propName
 * @return {*}
 */
exports.defaultResponseFilter = function (res, propName) {
    return get(res, propName);
};

/**
 * A default function to decide whether skip logging of particular request. Doesn't skip anything (i.e. log all requests).
 * @return always false
 */
exports.defaultSkip = function () {
    return false;
};

/**
 * The property of the metadata of the log entry that the filtered HTTP request is stored in (default 'req')
 * @type {string}
 */
exports.requestField = 'req';

/**
 * The property of the metadata of the log entry that the filtered HTTP response is stored in (default 'res')
 * @type {string}
 */
exports.responseField = 'res';

function filterObject(originalObj, whiteList, headerBlacklist, initialFilter) {

    var obj = {};
    var fieldsSet = false;

    [].concat(whiteList).forEach(function (propName) {
        var value = initialFilter(originalObj, propName);
        if(typeof (value) !== 'undefined') {
            set(obj, propName, value);
            fieldsSet = true;
            if (propName === 'headers') {
                [].concat(headerBlacklist).forEach(function (headerName) {
                    var lowerCaseHeaderName = headerName ? headerName.toLowerCase() : null;
                    if (obj[propName].hasOwnProperty(lowerCaseHeaderName)) {
                        delete obj[propName][lowerCaseHeaderName];
                    }
                });
            }
        }
    });

    return fieldsSet ? obj : undefined;
}

//
// ### function errorLogger(options)
// #### @options {Object} options to initialize the middleware.
//

exports.errorLogger = function errorLogger(options) {

    ensureValidOptions(options);

    options.requestWhitelist = options.requestWhitelist || exports.requestWhitelist;
    options.requestFilter = options.requestFilter || exports.defaultRequestFilter;
    options.headerBlacklist = options.headerBlacklist || exports.defaultHeaderBlacklist;
    options.winstonInstance = options.winstonInstance || (winston.createLogger({
        transports: options.transports,
        format: options.format
    }));
    options.msgFormat = options.msgFormat || function(req, res, err) {
        return 'middlewareError';
    };
    options.baseMeta = options.baseMeta || {};
    options.metaField = options.metaField === null || options.metaField === 'null' ? null : options.metaField || 'meta';
    options.level = options.level || 'error';
    options.dynamicMeta = options.dynamicMeta || function (req, res, err) { return null; };
    const exceptionHandler = new winston.ExceptionHandler(options.winstonInstance);
    options.exceptionToMeta = options.exceptionToMeta || exceptionHandler.getAllInfo.bind(exceptionHandler);
    options.blacklistedMetaFields = options.blacklistedMetaFields || [];
    options.skip = options.skip || exports.defaultSkip;
    options.requestField = options.requestField === null || options.requestField === 'null' ? null : options.requestField || exports.requestField;

    return function (err, req, res, next) {
        // Let winston gather all the error data
        const meta = options.exceptionToMeta(err);
        var exceptionMeta = Object.keys(meta).filter(function(key) {
            return options.blacklistedMetaFields.indexOf(key) < 0;
        }).reduce(function (prev, cur) {
            prev[cur] = meta[cur];
            return prev;
        }, {});

        if (options.meta !== false) {
            if (options.requestField !== null) {
                exceptionMeta[options.requestField] = filterObject(req, options.requestWhitelist, options.headerBlacklist, options.requestFilter);
            }

            if (options.dynamicMeta) {
                var dynamicMeta = options.dynamicMeta(req, res, err);
                exceptionMeta = Object.assign(exceptionMeta, dynamicMeta);
            }
        }

        if (options.metaField) {
            var fields;
            if (Array.isArray(options.metaField)) {
                fields = options.metaField;
            } else {
                fields = options.metaField.split('.');
            }
            fields.reverse().forEach(field => {
                var newMeta = {};
                newMeta[field] = exceptionMeta;
                exceptionMeta = newMeta;
            });
        }

        exceptionMeta = Object.assign(exceptionMeta, options.baseMeta);

        var level = isFunction(options.level) ? options.level(req, res, err) : options.level;

        if (!options.skip(req, res, err)) {
            // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
            options.winstonInstance.log(Object.assign(exceptionMeta, {
                level,
                message: options.msgFormat(req, res, err),
            }));
        }

        next(err);
    };
};

function levelFromStatus(options) {
    return function (req, res) {
        var level = '';
        if (res.statusCode >= 100) { level = options.statusLevels.success || 'info'; }
        if (res.statusCode >= 400) { level = options.statusLevels.warn || 'warn'; }
        if (res.statusCode >= 500) { level = options.statusLevels.error || 'error'; }
        return level;
    };
}

//
// ### function logger(options)
// #### @options {Object} options to initialize the middleware.
//
exports.logger = function logger(options) {

    ensureValidOptions(options);
    ensureValidLoggerOptions(options);

    options.requestWhitelist = options.requestWhitelist || exports.requestWhitelist;
    options.bodyWhitelist = options.bodyWhitelist || exports.bodyWhitelist;
    options.bodyBlacklist = options.bodyBlacklist || exports.bodyBlacklist;
    options.headerBlacklist = options.headerBlacklist || exports.defaultHeaderBlacklist;
    options.responseWhitelist = options.responseWhitelist || exports.responseWhitelist;
    options.requestFilter = options.requestFilter || exports.defaultRequestFilter;
    options.responseFilter = options.responseFilter || exports.defaultResponseFilter;
    options.ignoredRoutes = options.ignoredRoutes || exports.ignoredRoutes;
    options.winstonInstance = options.winstonInstance || (winston.createLogger({
        transports: options.transports,
        format: options.format
    }));
    options.statusLevels = options.statusLevels || false;
    options.level = options.statusLevels ? levelFromStatus(options) : (options.level || 'info');
    options.msgFormat = options.msgFormat || function(req, res) {
        return 'HTTP ' + req.method + ' ' + req.url;
    };
    options.baseMeta = options.baseMeta || {};
    options.metaField = options.metaField === null || options.metaField === 'null' ? null : options.metaField || 'meta';
    options.ignoreRoute = options.ignoreRoute || function () { return false; };
    options.skip = options.skip || exports.defaultSkip;
    options.dynamicMeta = options.dynamicMeta || function (req, res) { return null; };
    options.requestField = options.requestField === null || options.requestField === 'null' ? null : options.requestField || exports.requestField;
    options.responseField = options.responseField === null || options.responseField === 'null' ? null : options.responseField || exports.responseField;

    return function (req, res, next) {
        var currentUrl = req.originalUrl || req.url;
        if (currentUrl && options.ignoredRoutes.indexOf(currentUrl) > -1) return next();
        if (options.ignoreRoute(req, res)) return next();

        req._startTime = (new Date);

        req._routeWhitelists = {
            req: [],
            res: [],
            body: []
        };

        req._routeBlacklists = {
            body: []
        };

        // Manage to get information from the response too, just like Connect.logger does:
        var end = res.end;
        res.end = function (chunk, encoding) {
            res.responseTime = (new Date) - req._startTime;

            res.end = end;
            res.end(chunk, encoding);

            req.url = req.originalUrl || req.url;

            var meta = {};

            if (options.meta !== false) {
                var logData = {};

                if (options.requestField !== null) {
                    var requestWhitelist = options.requestWhitelist.concat(req._routeWhitelists.req || []);
                    var filteredRequest = filterObject(req, requestWhitelist, options.headerBlacklist, options.requestFilter);

                    var bodyWhitelist = [
                        ...new Set([
                            ...options.bodyWhitelist,
                            ...(req._routeWhitelists.body || [])
                        ])
                    ];
                    var blacklist = [
                        ...new Set([
                            ...options.bodyBlacklist,
                            ...(req._routeBlacklists.body || [])
                        ])
                    ];

                    var filteredBody = null;

                    if (req.body !== undefined) {
                        if (blacklist.length > 0 && bodyWhitelist.length === 0) {
                            var whitelist = Object.keys(req.body).filter(function(key) {
                                return !blacklist.includes(key);
                            });
                            filteredBody = filterObject(req.body, whitelist, options.headerBlacklist, options.requestFilter);
                        } else if (
                            requestWhitelist.indexOf('body') !== -1 &&
                            bodyWhitelist.length === 0 &&
                            blacklist.length === 0
                        ) {
                            filteredBody = filterObject(req.body, Object.keys(req.body), options.headerBlacklist, options.requestFilter);
                        } else {
                            filteredBody = filterObject(req.body, bodyWhitelist, options.headerBlacklist, options.requestFilter);
                        }
                    }

                    if (filteredRequest) {
                        if (filteredBody) {
                            filteredRequest.body = filteredBody;
                        } else {
                            delete filteredRequest.body;
                        }
                    }

                    logData[options.requestField] = filteredRequest;
                }

                var responseWhitelist = options.responseWhitelist.concat(req._routeWhitelists.res || []);
                if (responseWhitelist.indexOf('body') > -1) {
                    if (chunk) {
                        var isJson = (res.getHeader('content-type')
                            && res.getHeader('content-type').indexOf('json') >= 0);
                        const body = chunk.toString();
                        res.body = bodyToString(body, isJson);
                    }
                }

                if (options.responseField !== null) {
                    var filteredResponse = filterObject(res, responseWhitelist, options.headerBlacklist, options.responseFilter);
                    if (filteredResponse) {
                        if (options.requestField === options.responseField) {
                            logData[options.requestField] = Object.assign(filteredRequest, filteredResponse);
                        } else {
                            logData[options.responseField] = filteredResponse;
                        }
                    }
                }

                if (!responseWhitelist.includes('responseTime')) {
                    logData.responseTime = res.responseTime;
                }

                if (options.dynamicMeta) {
                    var dynamicMeta = options.dynamicMeta(req, res);
                    logData = Object.assign(logData, dynamicMeta);
                }

                meta = Object.assign(meta, logData);
            }

            if (options.metaField) {
                var fields;
                if (Array.isArray(options.metaField)) {
                    fields = options.metaField;
                } else {
                    fields = options.metaField.split('.');
                }
                fields.reverse().forEach(field => {
                    var newMeta = {};
                    newMeta[field] = meta;
                    meta = newMeta;
                });
            }

            meta = Object.assign(meta, options.baseMeta);

            var msg = options.msgFormat(req, Object.assign({}, res));

            // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
            if (!options.skip(req, res)) {
                var level = isFunction(options.level) ? options.level(req, res) : options.level;
                options.winstonInstance.log(Object.assign(meta, { level, message: msg }));
            }
        };

        next();
    };
};

function safeJSONParse(string) {
    try {
        return JSON.parse(string);
    } catch (e) {
        return undefined;
    }
}

function bodyToString(body, isJSON) {
    var stringBody = body && body.toString();
    if (isJSON) {
        return (safeJSONParse(body) || stringBody);
    }
    return stringBody;
}

function ensureValidOptions(options) {
    if (!options) throw new Error('options are required by express-winston middleware');
    if (!((options.transports && (options.transports.length > 0)) || options.winstonInstance))
        throw new Error('transports or a winstonInstance are required by express-winston middleware');

    if (options.dynamicMeta && !isFunction(options.dynamicMeta)) {
        throw new Error('`dynamicMeta` express-winston option should be a function');
    }
}

function ensureValidLoggerOptions(options) {
    if (options.ignoreRoute && !isFunction(options.ignoreRoute)) {
        throw new Error('`ignoreRoute` express-winston option should be a function');
    }
}
