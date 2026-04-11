const fs = require('fs');
const version = require('../package.json').version;
const file = fs.readFileSync('manifest.json', 'utf8');
fs.writeFileSync(
  'manifest.json',
  file.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)
);
