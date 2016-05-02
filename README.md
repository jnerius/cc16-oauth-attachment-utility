ServiceNow Attachment Demo Utility
==============================

This is a command line utility written in Node.js to demonstrate the capabilities of OAuth and the ServiceNow REST Attachment API at CreatorCon 2016. 

The core functionality of this app is intentionally centralized in snattach.js (vs. building out modules) to make it easier to demonstrate the functionality. 

#Prerequisites

* [Node.js](https://nodejs.org) installed
* A [ServiceNow](https://developer.servicenow.com) instance (Geneva or later)

## Installing

     $ git clone https://github.com/jnerius/cc16-oauth-attachment-utility.git
     $ cd cc16-oauth-attachment-utility
     $ npm install

## Configuration

### config.js

Update the `config.instanceURL` variable to point at your ServiceNow instance. 

	config.instanceURL = 'https://<instance>.service-now.com/';

## Usage

### Logging in using OAuth

Issue the following command and then follow the prompts to provide the requested values: Username, Password, OAuth Client ID, OAuth Client Secret

	$ snattach login oauth

### Manually refreshing OAuth Access Token

	$ snattach login oauth refresh

### Retrieve a list of attachments for a record

	$ snattach list <table> <record_sys_id>
	
### Download an attachment

	$ snattach download <attachment_sys_id>
