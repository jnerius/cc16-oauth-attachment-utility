#!/usr/bin/env node

var fs      = require('fs');
var path    = require('path');
var util    = require('util');
var mime    = require('mime');
var cmdln   = require('cmdln');
var rest    = require('restler');
var config  = require('./config.js');
var program = require('commander');
var OAuth2  = require('oauth').OAuth2;

var credentials = {
    clientID:     config.clientID,
    clientSecret: config.clientSecret,
    site:         config.instanceURL,
    tokenPath:    '/oauth_token.do'
};

var oauth   = require('./sn_api/oauth.js')(credentials);


var oauth2 = require('simple-oauth2')(credentials);
var token;

/*
oauth2.client.getToken({}, function saveToken(error, result) {
    if (error) { console.log('Access Token Error', error.message); }
    token = oauth2.accessToken.create(result);
    console.log('Token', token.token.access_token);
});
*/

var ServiceNow = rest.service(function(u, p) {
    this.tokenPath = '/oauth_token.do';
    this.defaults.username = u;
    this.defaults.password = p;

    /*
    var token; 

    var oauth2 = new OAuth2(config.clientID, 
        config.clientSecret,
        config.instanceURL, 
        null, 
        '/oauth_token.do', 
        null);

    oauth2.getOAuthAccessToken('', {
        'grant_type': 'password',
        'username': config.username,
        'password': config.password
    }, function(e, access_token, refresh_token, results) {
        console.log('e: ', e);
        console.log('bearer: ', access_token);
        console.log('refresh: ', refresh_token);
        console.log('results: ', results);
        token = access_token;
    }).then(function() {
        console.log('token out of the callback: ', token);
    });
    */
}, {
    baseURL: config.instanceURL
}, {
    uploadAttachment: function(filename, data, contentType, table, record) {
        return this.post(config.instanceURL + '/api/now/attachment/file', {
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

    test: function() {
        console.log('in test method');
    },

    authOAuth: function(clientID, clientSecret, tokenPath) {
        return this.post(config.instanceURL + this.tokenPath, {
            query: {
                grant_type: 'password',
                client_id: clientID,
                client_secret: clientSecret, 
                username: this.defaults.username, 
                password: this.defaults.password
            }
        });
    },
});

sn = new ServiceNow(config.username, config.password);

program
    .version('0.0.1')
    .option('-i, --instance [instance]', 'Instance prefix, eg. \'empjnerius\'')
    .option('-u, --user [username]',     'Log in using this username')
    .option('-p, --pass [password]',     'Log in using this password');

program
    .command('authenticate <type>')
    .description('configure authentication')
    .action(function(type) {
        console.log('authentication type: ', type);
    });
    
program
    .command('upload <file> <table> <record>')
    .description('upload a file and associate it with a specific record')
    .action(function(file, table, record) {
        console.log('upload: file =', file, ', table =', table, ', record = ', record);
        
        fs.readFile(file, function(err, data) {
            sn.uploadAttachment(path.basename(file), data, mime.lookup(file), table, record).on('complete', function(data) {
                console.log('File uploaded successfully');
                console.log('  file url:', data.result.download_link);
                console.log('  attachment id:', data.result.sys_id);
            });;
            /*
            rest.post(config.instanceURL + '/api/now/attachment/file', {
                username: config.username,
                password: config.password,
                headers: {
                    'Content-Type': mime.lookup(file)
                },
                query: {
                    table_name: table,
                    table_sys_id: record,
                    file_name: path.basename(file)
                }, 
                data: data
            }).on('complete', function(data) {
                console.log('File uploaded successfully');
                console.log('  file url:', data.result.download_link);
                console.log('  attachment id:', data.result.sys_id);
            });
            */
            
            
        });
    });
     
program
    .command('list <table> <record>')
    .description('list all attachments related to the specified table/record')
    .action(function(table, record) {
        console.log('table:', table, 'record:', record);
        
        rest.get(config.instanceURL + '/api/now/attachment', {
            username: config.username, 
            password: config.password,
            query: {
                table_name: table,
                table_sys_id: record
            }
        }).on('complete', function(data) {
            if (data instanceof Error) {
                console.log('Error: ', data.message);
            } else {
                data.result.forEach(function(attachment) {
                    console.log('name:', attachment.file_name, 'type:', attachment.content_type, 'size:', attachment.size_bytes); 
                });
                
                //console.log(data);
            }
        }); 
    });
       
program
    .command('download <attachment_sys_id> [location]')
    .description('download the attachment associated with the given attachment sys_id')
    .action(function(attachment) {
        console.log('download...'); 
    });
    
program.parse(process.argv);
    