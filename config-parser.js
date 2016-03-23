var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var Compiler = require('solidity-compiler');
var SHA3Hash = require('sha3').SHA3Hash;

function parse(file, cb) {
  var compiler = new Compiler();
  
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
        // if (!_.startsWith(account.source, './')) {
        //   if (account.source.charAt(0) == '/')
        //     account.source = '.' + account.source;
        //   else
        //     account.source = './' + account.source;
        // }
        compiler.compile(account.source, function(err, compiled) {
          if (err) return cb(err);
          if (compiled.length !== 1)
            return cb('File specified in source property of ethereum.json should contain only one contract');
          account.runCode = compiled[0];
          cb();
        });
      } else cb();
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

module.exports = {
  parse: parse
};