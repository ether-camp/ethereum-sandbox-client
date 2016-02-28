# Ethereum Sandbox Client

Example:
```js
var Sandbox = require('ethereum-sandbox-client');
var sandbox = new Sandbox('http://something.on.my.ether.camp:8555');

sandbox.start(function(err, sandbox) {
  if (err) return console.error(err);
  console.log('sandbox started: ' + sandbox.id);
  sandbox.stop(function(err) {
    if (err) console.error(err);
    else console.log('sandbox stopped');
  });
});
```