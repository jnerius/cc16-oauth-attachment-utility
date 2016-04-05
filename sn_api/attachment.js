module.exports = Attachment;

function Attachment(snInstanceURL, snCookie, options) {
    this.snInstanceURL = snInstanceURL;
    this.snCookie = snCookie;
    this.options = options;
}

Attachment.prototype.getAttachmentsForRecord = function(table, numberOrID, cb) {
    var request = require('request');
    request.debug = this.options.verbose;
    
    request({
        baseUrl: this.snInstanceURL,
        method: 'GET',
        uri: '/api/now/attachment', 
        json: true,
        headers: {
            'Cookie': this.snCookie
        }
    }, function(err, response, body) {
        cb(err, response, body); 
    });
}