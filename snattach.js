#!/usr/bin/env node

var fs      = require('fs');
var path    = require('path');
var util    = require('util');
var mime    = require('mime');
var rest    = require('restler');
var config  = require('./config.js');
var program = require('commander');
var OAuth2  = require('oauth').OAuth2;
var prompt  = require('prompt');

var debug = true;

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
        case 401: console.log('Try refreshing the OAuth Token');
    }
}

var ServiceNow = rest.service(function(options) {
    this.tokenPath = '/oauth_token.do';
    this.defaults = options; 
}, {
    baseURL: config.instanceURL
}, {
    uploadAttachment: function(filename, data, contentType, table, record) {
        return this.post('/api/now/attachment/file', {
            headers: {
                'Content-Type': contentType
            },
            query: {
                table_name: table,
                table_sys_id: record,
                file_name: path.basename(filename)
            }, 
            data: data 
        });
    }, 

    downloadAttachment: function(attachmentSysId) {
        return this.get('/api/now/attachment/' + attachmentSysId + '/file'); 
    },

    listAttachmentsForRecord: function(table, record) {
        return this.get('/api/now/attachment', {
            query: {
                table_name: table,
                table_sys_id: record
            }
        }); 
    },
});

sn = new ServiceNow({
    accessToken: auth.accessToken
});

program
    .version('0.0.1')
    .option('-i, --instance [instance]', 'Instance prefix, eg. \'empjnerius\'')
    .option('-u, --user [username]',     'Log in using this username')
    .option('-p, --pass [password]',     'Log in using this password');

/**
 * Login command
 *
 * Allows us to log in to the ServiceNow instance using Basic auth or OAuth 2
 */
program
    .command('login <type> [subcommand]')
    .description('configure authentication')
    .action(function(type, subcommand) {

        if (type == 'oauth') {
            /**
             * Get a Refresh Token
             */
            if (subcommand == 'refresh') {
                console.log('Attempting to get a fresh Access Token...');
                var oauth2 = new OAuth2(auth.clientID, 
                    auth.clientSecret,
                    config.instanceURL, 
                    null, 
                    '/oauth_token.do', 
                    null);

                oauth2.getOAuthAccessToken(auth.refreshToken, {
                    'grant_type': 'refresh_token',
                }, function(e, access_token, refresh_token, results) {
                    console.log('e->', e);
                    console.log('access_token->', access_token);
                    console.log('refresh_token->', refresh_token);
                    console.log('results->', results);

                    auth.accessToken  = access_token;
                    auth.refreshToken = refresh_token;

                    saveAuthState(auth, function(err) {
                        if (err) process.exit();
                    });
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
                }, function(e, access_token, refresh_token, results) {
                    if (debug) console.log('results: ', results);

                    auth.accessToken  = access_token;
                    auth.refreshToken = refresh_token;

                    saveAuthState(auth, function(err) {
                        if (err) process.exit();
                    });
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
            console.log("Resetting auth data...");

            auth.clientID     = '';
            auth.clientSecret = '';
            auth.accessToken  = '';
            auth.refreshToken = '';
            auth.cookie       = '';
            auth.username     = '';
            auth.password     = '';

            saveAuthState(auth, function(){}); 
        } else {
            console.log('authentication type not supported');
        }
    });
    
program
    .command('upload <file> <table> <record>')
    .description('upload a file and associate it with a specific record')
    .action(function(file, table, record) {
        console.log('upload: file =', file, ', table =', table, ', record = ', record);
        
        fs.readFile(file, function(err, data) {
            sn.uploadAttachment(path.basename(file), data, mime.lookup(file), table, record).on('success', function(data) {
                console.log('File uploaded successfully');
                console.log('  file url:', data.result.download_link);
                console.log('  attachment id:', data.result.sys_id);
            }).on('fail', function(data) {
                console.log('Upload failed...');
                console.log(data);
            });
        });
    });
     
program
    .command('list <table> <record>')
    .description('list all attachments related to the specified table/record')
    .action(function(table, record) {
        console.log('table:', table, 'record:', record);

        sn.listAttachmentsForRecord(table, record).on('success', function(data) {
            if (data instanceof Error) {
                console.log('Error retrieving attachment list:', data);
            } else {
                data.result.forEach(function(attachment) {
                    console.log('name:', attachment.file_name, 'type:', attachment.content_type, 'size:', attachment.size_bytes); 
                });
            }
        }).on('fail', function(data) {
            console.log('Listing attachments failed...');
            console.log(data);
        });
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
    