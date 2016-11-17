/*
 * Ethereum Sandbox Client
 * Copyright (C) 2016  <ether.camp> ALL RIGHTS RESERVED  (http://ether.camp)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License version 3 for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var url = require('url');
var _ = require('lodash');
var async = require('async');
var request = require('request');
var Web3 = require('web3');
var web3Utils = require('web3/lib/utils/utils');
var SandboxContainer = require('ethereum-sandbox');
var configParser = require('./config-parser');

function Sandbox(rootUrl) {
  if (rootUrl.charAt(rootUrl.length - 1) != '/') rootUrl = rootUrl + '/';
  this.rootUrl = rootUrl + 'sandbox/';
}

Sandbox.prototype.start = function(config, specificSolc, cb) {
  if (_.isFunction(config)) {
    cb = config;
    config = 'ethereum.json';
  }
  
  async.series([
    this.parseConfig.bind(this, config, specificSolc),
    this.connectOrRun.bind(this),
    this.startSandbox.bind(this)
  ], cb);
};

Sandbox.prototype.parseConfig = function(path, specificSolc, cb) {
  configParser.parse(path, specificSolc, (function(err, config) {
    if (err) return cb(err);
    this.config = config;
    cb();
  }).bind(this));
};

Sandbox.prototype.connectOrRun = function(cb) {
  request(this.rootUrl, (function(err, response, body) {
    if (err) {
      if (err.code == 'ECONNREFUSED' && err.address == '127.0.0.1') {
        this.run((function(err) {
          if (err) cb(err);
          else createWeb3.call(this, cb);
        }).bind(this));
      } else return cb(err);
    } else {
      var notSandboxMsg = 'There is a service running on ' + this.rootUrl + ' which is not Sandbox.';
      try {
        var parsed = JSON.parse(body);
      } catch (e) {
        return cb(notSandboxMsg);
      }
      if (!_.isArray(parsed)) return cb(notSandboxMsg);
      
      createWeb3.call(this, cb);
    }
    
    function createWeb3(cb) {
      this.web3 = new Web3();
      extend(this.web3);
      cb();
    }
  }).bind(this));
};

Sandbox.prototype.run = function(cb) {
  var port = url.parse(this.rootUrl).port || 80;
  SandboxContainer.startDetached(port, cb);
};

Sandbox.prototype.startSandbox = function(cb) {
  var accounts = _(this.config.env.accounts)
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

  async.series([
    create.bind(this),
    this.web3.sandbox.setBlock.bind(this.web3.sandbox, this.config.env.block),
    this.web3.sandbox.createAccounts.bind(this.web3.sandbox, this.config.env.accounts),
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
};

Sandbox.prototype.stop = function(cb) {
  request.del(this.rootUrl + this.id, (function(err, res) {
    if (err) cb(err);
    else cb(res.statusCode == 200 ? null : 'Could not stop the sandbox: ' + res.statusCode);
  }).bind(this));
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
      }),
      new web3._extend.Method({
        name: 'stopMiner',
        call: 'sandbox_stopMiner',
        params: 0
      }),
      new web3._extend.Method({
        name: 'startMiner',
        call: 'sandbox_startMiner',
        params: 0
      }),
      new web3._extend.Method({
        name: 'mine',
        call: 'sandbox_mine',
        params: 1,
        inputFormatter: [ web3Utils.toHex ]
      }),
      new web3._extend.Method({
        name: 'setTimestamp',
        call: 'sandbox_setTimestamp',
        params: 2,
        inputFormatter: [ web3Utils.toHex, null ]
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
