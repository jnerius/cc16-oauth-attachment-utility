#!/usr/bin/env node

var fs      = require('fs');
var logger  = require('winston');
var path    = require('path');
var mime    = require('mime');
var rest    = require('restler');
var config  = require('./config.js');
var program = require('commander');
var OAuth2  = require('oauth').OAuth2;
var prompt  = require('prompt');
var Table   = require('cli-table');

logger.cli();
logger.level = 'debug';

// Pull in our saved auth details
var auth = require('./auth.json');

/**
 * Saves the current state of the auth object into a JSON file
 */
function saveAuthState(auth, cb) {
    fs.writeFile("auth.json", JSON.stringify(auth, null, 4), 'utf-8', function(err) {
        if (err) {
            console.log('Error saving auth data:', err);
            cb(err);
        } else {
            cb();
        }
    })
}

function onAPIError(data, response) {
    console.log('Request failed with status code', response.statusCode, '-', response.statusMessage);
    console.log(data);
    switch(response.statusCode) {
        case 401: logger.warn('Try refreshing the OAuth Token');
    }
}

var ServiceNow = rest.service(function(options) {
    this.tokenPath = '/oauth_token.do';
    this.defaults = options; 
}, {
    baseURL: config.instanceURL
}, {
    getSysIdForTask: function(taskNumber) {
        return this.doRequest('get', '/api/now/table/task', {
            query: {
                number: taskNumber,
                sysparm_fields: 'sys_id'
            }
        });
    }, 

    uploadAttachment: function(filename, data, contentType, table, record) {
        return this.doRequest('post', '/api/now/attachment/file', {
            headers: {
                'Content-Type': contentType
            },
            query: {
                table_name:   table,
                table_sys_id: record,
                file_name:    path.basename(filename)
            }, 
            data: data 
        });
    }, 

    downloadAttachment: function(attachmentSysId) {
        return this.doRequest('get', '/api/now/attachment/' + attachmentSysId + '/file'); 
    },

    listAttachmentsForRecord: function(table, record) {
        return this.doRequest('get', '/api/now/attachment', {
            query: {
                table_name: table,
                table_sys_id: record
            }
        }); 
    },

    doRequest: function(method, url, options) {
        var self = this;
        var req = this[method](url, options);

        // If we encounter a 401, the access token most likely expired
        req.on('401', function(data, response) {
            // Refresh the token
            self._refreshToken(function(err, access_token, refresh_token, results) {
                if (!err && access_token != '') {
                    // We have a new access token, so we'll set it and retry the request
                    req.options.accessToken = access_token;
                    req.retry();
                } else {
                    logger.error('Could not get a new access token');
                }
            })
        });

        return req;
    },

    /**
     * Get a new Access Token using our Refresh Token
     */
    _refreshToken: function(callback) {
        logger.info('Getting a fresh Access Token...');
        var oauth2 = new OAuth2(auth.clientID, 
                auth.clientSecret,
                config.instanceURL, 
                null, 
                '/oauth_token.do', 
                null);

        // Get a new access token by passing in the refreshToken saved earlier
        // Notice that it is not necessary to transmit username/password when using a refresh token. 
        oauth2.getOAuthAccessToken(auth.refreshToken, {
            'grant_type': 'refresh_token',
        }, function(err, access_token, refresh_token, results) {
            if (!err) {
                logger.info('Fresh token acquired');
                auth.accessToken  = access_token;
                auth.refreshToken = refresh_token;

                // Save the updated token(s) to auth.json
                saveAuthState(auth, function(err) {
                    if (err) process.exit();
                });

                callback(null, access_token, refresh_token, results);
            } else {
                logger.error('Error encountered trying to retrieve a fresh token');
                logger.debug(err);
                callback(err, null, null, results); 
            }

            logger.debug(results);
        });
    },

    _isSysId: function(str) {
        return (str.match(/[0-9a-f]{32}/) != null);
    }
});

// Initialize ServiceNow Restler Service Object
sn = new ServiceNow({
    accessToken: auth.accessToken
});

// Set up the CLI
program
    .version('0.0.1');

/**
 * Login command - Allows us to log in to the ServiceNow instance using Basic Auth or OAuth 2
 */
program
    .command('login <type> [subcommand]')
    .description('configure authentication')
    .action(function(type, subcommand) {

        if (type == 'oauth') {
            // subcommand will only contain a value if a refresh is desired
            if (subcommand == 'refresh') {
                logger.debug('Attempting to get a fresh Access Token...');

                // Prepare a new OAuth2 instance using our stored Client ID/Secret
                var oauth2 = new OAuth2(auth.clientID, 
                    auth.clientSecret,
                    config.instanceURL, 
                    null, 
                    '/oauth_token.do', 
                    null);

                // Issue the request to get a new Access Token. We must pass in our refresh token
                oauth2.getOAuthAccessToken(auth.refreshToken, {
                    'grant_type': 'refresh_token',
                }, function(err, access_token, refresh_token, results) {
                    if (!err) {
                        logger.info('Fresh token acquired');
                        auth.accessToken  = access_token;
                        auth.refreshToken = refresh_token;

                        // Save the updated token(s) to auth.json
                        saveAuthState(auth, function(err) {
                            if (err) process.exit();
                        });
                    } else {
                        logger.error('Error encountered trying to retrieve a fresh token');
                        logger.debug(err);
                    }

                    logger.debug(results);
                });

                // Stop execution now
                return;
            }

            // No subcommand, so let's assume we're trying to get a token from scratch
            var oauthSchema = {
                properties: {
                    username: { description: 'ServiceNow Username'},
                    password: { description: 'ServiceNow Password',  hidden: true }
                }
            };

            if (!auth.clientID) 
                oauthSchema.properties.clientID = { description: 'OAuth Client ID'};

            if (!auth.clientSecret)
                oauthSchema.properties.clientSecret = { description: 'OAuth Client Secret', hidden: true };

            prompt.start();
            prompt.get(oauthSchema, function(err, result) {

                // Update the stored clientID and clientSecret if they were provided
                if (result.clientID) 
                    auth.clientID = result.clientID;

                if (result.clientSecret) 
                    auth.clientSecret = result.clientSecret;

                // Now let's get a token. First, a bit of setup. 
                var oauth2 = new OAuth2(auth.clientID, 
                    auth.clientSecret,
                    config.instanceURL, 
                    null, 
                    '/oauth_token.do', 
                    null);

                // And now, the actual call. 
                oauth2.getOAuthAccessToken('', {
                    'grant_type': 'password',
                    'username': result.username,
                    'password': result.password
                }, function(err, access_token, refresh_token, results) {
                    logger.debug('Results: ', results);

                    if (!err && access_token != undefined && refresh_token != undefined) {
                        logger.info('Retrieved Access Token and Refresh Token')
                        auth.accessToken  = access_token;
                        auth.refreshToken = refresh_token;
                        saveAuthState(auth, function(err) {
                            logger.info('Saving to auth.json...');
                            if (err) logger.error('Could not save auth info:', err);
                            process.exit();
                        });
                    } else {
                        logger.error('Error encountered trying to retrieve a token');
                        logger.debug(err);
                    }
                });
            });

        } else if (type == 'basic') {
            var basicAuthSchema = {
                properties: {
                    username: { description: 'ServiceNow Username'},
                    password: { description: 'ServiceNow Password',  hidden: true }
                }
            };

            prompt.start();
            prompt.get(basicAuthSchema, function(err, result) {
                auth.username = result.username;
                auth.password = result.password; 

                saveAuthState(auth, function(err) {
                    if (err) process.exit(); 
                });
            });
        } else if (type == 'reset') {
            logger.info("Resetting auth data...");

            auth.clientID     = '';
            auth.clientSecret = '';
            auth.accessToken  = '';
            auth.refreshToken = '';
            auth.cookie       = '';
            auth.username     = '';
            auth.password     = '';

            saveAuthState(auth, function(){}); 
        } else {
            logger.error('Authentication type not supported');
        }
    });

/**
 * Upload command - Upload a file and associate it with a specific table/record
 */
program
    .command('upload <file> <table> <record>')
    .description('upload a file and associate it with a specific record')
    .action(function(file, table, record) {
        logger.debug('Upload details: file = ' + file + ', table = ' + table + ', record = ' + record);
        
        fs.readFile(file, function(err, data) {
            sn.uploadAttachment(path.basename(file), data, mime.lookup(file), table, record).on('success', function(data) {
                logger.info('File uploaded successfully');
                logger.info('  File URL:',      data.result.download_link);
                logger.info('  Attachment ID:', data.result.sys_id);
            }).on('fail', onAPIError);
        });
    });

/**
 * List command - List all attachments associated with the specified table/record
 */
program
    .command('list <table> <record>')
    .description('list all attachments related to the specified table/record')
    .action(function(table, record) {
        logger.debug('table:', table, 'record:', record);

        var tabOutput = new Table({
            head: ['Attachment SysID', 'File Name', 'File Type', 'Size']
        });

        sn.listAttachmentsForRecord(table, record).on('success', function(data) {
            data.result.forEach(function(att) {
                // logger.info('name:', attachment.file_name, 'type:', attachment.content_type, 'size:', attachment.size_bytes); 
                tabOutput.push([att.sys_id, att.file_name, att.content_type, att.size_bytes]);
            });

            console.log(tabOutput.toString());

            if (data.result.length == 0) {
                logger.info('No attachments found for the specified record');
            }
        }).on('fail', onAPIError);
    });
       
program
    .command('download <attachment_sys_id> [location]')
    .description('download the attachment associated with the given attachment sys_id')
    .action(function(attachment, location) {
        sn.downloadAttachment(attachment).on('success', function(data, response) {
            // Get info about the attachment from x-attachment-metadata response header
            var meta  = JSON.parse(response.headers['x-attachment-metadata']);
            var fName = meta.file_name;
            var table = meta.table_name;
            var sysId = meta.table_sys_id;

            // If a location has been specified, join it with the filename
            var file = location ? path.join(location, fName) : fName; 

            // Save the actual file
            fs.writeFile(file, response.raw, function(err) {
                if (err) {
                    return console.log(err);
                }

                console.log('Downloaded file \'' + file + '\' from record ' + table + '.' + sysId)
            });
        }).on('fail', onAPIError);
    });
    
program.parse(process.argv);
    