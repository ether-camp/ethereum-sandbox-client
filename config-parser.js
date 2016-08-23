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

var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var solc = require('solc');
var SHA3Hash = require('sha3').SHA3Hash;

function parse(file, cb) {
  async.waterfall([
    read.bind(null, file),
    adjustValues,
    calcPrivateKeys
  ], cb);
  
  function read(file, cb) {
    fs.readFile(file, function(err, content) {
      if (err) return cb(err);
      try {
        var config = JSON.parse(content);
      } catch(e) {
        return cb('Could not parse ethereum.json: ' + e.message);
      }
      cb(null, config);
    });
  }
  function adjustValues(config, cb) {
    if (config.hasOwnProperty('plugins') && !_.isPlainObject(config.plugins)) {
      return cb('Field plugins has to be a map in ethereum.json');
    }
    
    if (!config.hasOwnProperty('env') || !config.env.hasOwnProperty('accounts') ||
        Object.keys(config.env).length === 0) {
      return cb('Please, add initial account(s) to ethereum.json');
    }
    
    try {
      adjustBlock();
    } catch (e) {
      return cb(e);
    }

    async.forEachOf(config.env.accounts, adjustAccount, _.partial(cb, _, config));

    function adjustBlock() {
      if (config.env.hasOwnProperty('block')) {
        var block = config.env.block;
        if (block.hasOwnProperty('coinbase')) {
          try {
            block.coinbase = parseAddress(block.coinbase);
          } catch (e) {
            throw 'Could not parse block.address: ' + e;
          }
        }
        
        _.each(
          ['difficulty', 'gasLimit', 'gasPrice'],
          function(field) {
            if (block.hasOwnProperty(field)) {
              try {
                block[field] = value(block[field]);
              } catch (e) {
                throw 'Could not parse block.' + field + ': ' + e;
              }
            }
          }
        );
      }
    }
    function adjustAccount(account, address, cb) {
      try {
        parseAddress(address);
        
        if (account.hasOwnProperty('name') && typeof account.name != 'string')
          throw 'Account name must be a string';
        
        _.each(['balance', 'nonce'], function(field) {
          if (account.hasOwnProperty(field)) {
            try {
              account[field] = value(account[field]);
            } catch (e) {
              throw 'Could not parse account.' + field + ': ' + e;
            }
          }
        });
        if (account.hasOwnProperty('storage')) {
          account.storage = _(account.storage).map(function(val, key) {
            try {
              var parsedKey = value(key);
            } catch (e) {
              throw 'Could not parse key of storage entry: ' + e;
            }
            try {
              return [parsedKey, value(val)];
            } catch (e) {
              throw 'Could not parse value of storage entry: ' + e;
            }
          }).fromPairs().value();
        }
      } catch (e) {
        return cb(e);
      }
      if (account.hasOwnProperty('source')) {
        var input = {};
        input[account.source] = fs.readFileSync(account.source).toString();
        var output = solc.compile({ sources: input }, 1, function(path) {
          try {
            return fs.readFileSync(path);
          } catch (e) {
            return { error: e };
          }
        });
        if (output.errors) return cb(output.errors);
        
        var compiled = findNotAbstractContracts(output.sources)
          .map(function(name) {
            return {
              name: name,
              binary: output.contracts[name].bytecode,
              abi: JSON.parse(output.contracts[name].interface)
            };
          });

        if (compiled.length !== 1)
          return cb('File specified in source property of ethereum.json should contain only one contract to deploy');
        account.runCode = compiled[0];
      }
      
      cb();
    }
    function value(val) {
      var type = typeof val;
      var res;
      if (type === 'number') {
        res = '0x' + val.toString(16);
      } else if (type === 'string') {
        if (val.indexOf('0x') === 0) {
          res = val;
        } else if (/^\d+$/.test(val)) {
          res = '0x' + parseInt(val, 10).toString(16);
        } else {
          throw '"' + val + '" is not a decimal number (use 0x prefix for hexadecimal numbers)';
        }
      } else {
        throw 'Value should be either number or string';
      }
      return res;
    }
    function parseAddress(val) {
      if (typeof val !== 'string' || !val.match(/^0x[\dabcdef]{40}$/))
        throw 'Address should be a string with 0x prefix and 40 characters';
      return val;
    }
  }
  function calcPrivateKeys(config, cb) {
    try {
      _.each(config.env.accounts, function(account) {
        if (account.hasOwnProperty('pkey')) {
          if (typeof account.pkey != 'string') {
            throw 'Private key should be a hexadecimal hash (64 symbols) or a string';                            }
          if (!account.pkey.match(/^0x[\dabcdef]{64}$/)) {
            account.pkey = sha3(account.pkey);
          }
        }
      });
    } catch (e) {
      return cb(e);
    }
    cb(null, config);
  }
}

function sha3(str) {
  var hash = new SHA3Hash(256);
  hash.update(str);
  return '0x' + hash.digest('hex');
}

function findNotAbstractContracts(sources) {
  return _(sources)
    .pickBy(function(value, key) { return _.endsWith(key, '.sol') })
    .map(function(source) {
      return _(extractContracts(source.AST))
        .filter({ abstract: false })
        .map('name')
        .value();
    })
    .flatten()
    .value();
  
  function extractContracts(node) {
    var contracts = _(node.children)
          .map(extractContracts)
          .flatten()
          .value();
    if (node.name === 'Contract') {
      contracts.push({
        name: node.attributes.name,
        abstract: isAbstract(node)
      });
    }
    return contracts;
  }
  
  function isAbstract(node) {
    return node.attributes.name === 'abstract' ||
      // solc <= 0.2.0
      _.filter(node.children, {
        name: 'Identifier',
        attributes: { value: 'abstract' }
      }).length != 0 ||
      // solc > 0.2.0
      _.filter(node.children, {
        name: 'UserDefinedTypeName',
        attributes: { name: 'abstract' }
      }).length != 0;
  }
}

module.exports = {
  parse: parse
};