#!/usr/bin/env node

var fs      = require('fs');
var path    = require('path');
var util    = require('util');
var cmdln   = require('cmdln');
var rest    = require('restler');
var config  = require('./config.js');
var program = require('commander');

program
    .version('0.0.1')
    .option('-i, --instance [instance]', 'Instance prefix, eg. \'empjnerius\'')
    .option('-u, --user [username]',     'Log in using this username')
    .option('-p, --pass [password]',     'Log in using this password');
    
program
    .command('upload <file> <table> <record>')
    .description('upload a file and associate it with a specific record')
    .action(function(file, table, record) {
        console.log('upload: env =', env, ', options =', options);
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
    