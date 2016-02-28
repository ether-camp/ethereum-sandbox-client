# Solidity Compiler

Helps to compile Solidity files from js-code. Uses solc underneath.

```
var Compiler = require('solidity-compiler');
var compiler = new Compiler('path/to/contracts/dir');
compiler.compile('some-contract.sol', function(err, compiled) {
  // compiled is solc output
});
```