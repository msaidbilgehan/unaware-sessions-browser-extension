const fs = require('fs');
const path = require('path');

function flatToNested(flat) {
  const nested = {};

  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current = nested;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];

    // If value is an object, merge it
    if (typeof value === 'object' && value !== null) {
      if (!current[lastPart]) {
        current[lastPart] = {};
      }
      Object.assign(current[lastPart], value);
    } else {
      current[lastPart] = value;
    }
  }

  return nested;
}

function processFile(filePath) {
  console.log(`Processing ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(content);
  const nested = flatToNested(json);
  fs.writeFileSync(filePath, JSON.stringify(nested, null, 2) + '\n', 'utf8');
  console.log(`✓ ${filePath} converted to nested structure`);
}

const enPath = path.join(__dirname, 'src/shared/i18n/en.json');
const zhPath = path.join(__dirname, 'src/shared/i18n/zh.json');

processFile(enPath);
processFile(zhPath);

console.log('\n✓ All translation files converted!');
