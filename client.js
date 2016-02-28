var _ = require('lodash');
var async = require('async');
var request = require('request');
var Web3 = require('web3');
var configParser = require('./config-parser');

function Sandbox(rootUrl) {
  if (rootUrl.charAt(rootUrl.length - 1) != '/') rootUrl = rootUrl + '/';
  this.rootUrl = rootUrl + 'sandbox/';
}

Sandbox.prototype.start = function(config, cb) {
  if (_.isFunction(config)) {
    cb = config;
    config = 'ethereum.json';
  }
  
  configParser.parse(config, (function(err, config) {
    if (err) return cb(err);
    
    var accounts = _(config.env.accounts)
      .toPairs()
      .filter(function(account) {
        return account[1].hasOwnProperty('pkey');
      })
      .reduce(function(result, account) {
        result[account[0]] = {
          pkey: account[1].pkey,
          'default': account[1]['default']
        };
        return result;
      }, {});
  
    this.web3 = new Web3();
    extend(this.web3);
  
    async.series([
      create.bind(this),
      this.web3.sandbox.setBlock.bind(this.web3.sandbox, config.env.block),
      this.web3.sandbox.createAccounts.bind(this.web3.sandbox, config.env.accounts),
      this.web3.sandbox.addAccounts.bind(this.web3.sandbox, accounts),
      setDefaultAccount.bind(this),
    ], (function(err) {
      cb(err, this);
    }).bind(this));
  
    function create(cb) {
      
      request.post({ url: this.rootUrl, json: true }, (function(err, res, reply) {
        if (err) return cb(err);
        this.id = reply.id;
        this.web3.setProvider(new Web3.providers.HttpProvider(this.rootUrl + reply.id));
        cb();
      }).bind(this));
    }
    
    function setDefaultAccount(cb) {
      this.web3.sandbox.defaultAccount((function(err, address) {
        if (err) cb(err);
        else {
          this.web3.eth.defaultAccount = address;
          cb();
        }
      }).bind(this));
    }
  }).bind(this));
};

Sandbox.prototype.stop = function(cb) {
  request.del(this.rootUrl + this.id, function(err, res) {
    if (err) cb(err);
    else cb(res.statusCode === 200 ? null : 'Response status ' + res.statusCode, null);
  });
};

function extend(web3) {
  web3._extend({
    property: 'sandbox',
    methods: [
      new web3._extend.Method({
        name: 'createAccounts',
        call: 'sandbox_createAccounts',
        params: 1
      }),
      new web3._extend.Method({
        name: 'addAccounts',
        call: 'sandbox_addAccounts',
        params: 1
      }),
      new web3._extend.Method({
        name: 'setBlock',
        call: 'sandbox_setBlock',
        params: 1
      }),
      new web3._extend.Method({
        name: 'defaultAccount',
        call: 'sandbox_defaultAccount',
        params: 0
      }),
      new web3._extend.Method({
        name: 'accounts',
        call: 'sandbox_accounts',
        params: 1
      }),
      new web3._extend.Method({
        name: 'runTx',
        call: 'sandbox_runTx',
        params: 1
      }),
      new web3._extend.Method({
        name: 'contracts',
        call: 'sandbox_contracts',
        params: 0
      }),
      new web3._extend.Method({
        name: 'transactions',
        call: 'sandbox_transactions',
        params: 0
      }),
      new web3._extend.Method({
        name: 'receipt',
        call: 'sandbox_receipt',
        params: 1
      })
    ],
    properties: [
      new web3._extend.Property({
        name: 'id',
        getter: 'sandbox_id'
      })
    ]
  });
}

module.exports = Sandbox;