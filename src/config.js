const fs = require('node:fs');
const path = require('node:path');
const filename = path.join(__dirname, '..', '.env');
if (fs.existsSync(filename)) {
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const found = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!found || Object.hasOwn(process.env, found[1])) continue;
    const raw = found[2].replace(/\s+#.*$/, '');
    process.env[found[1]] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  }
}
const CAMPUS = Object.freeze({
  name: 'Richfield Pretoria Campus',
  address: '291 Helen Joseph Street, Pretoria, 0001',
  lat: Number(process.env.CAMPUS_LAT ?? -25.746467),
  lng: Number(process.env.CAMPUS_LNG ?? 28.19252),
  coordinateNote: 'Campus reference pin from a public business listing; approximate. Confirm against surveyed campus entrance coordinates before high-precision use.'
});
const RADIUS = 1000;
const CATEGORIES = Object.freeze([
  { id:'food', label:'Food & coffee', icon:'🍔' },
  { id:'groceries', label:'Groceries', icon:'🛒' },
  { id:'health', label:'Health & pharmacy', icon:'💊' },
  { id:'printing', label:'Printing & stationery', icon:'🖨️' },
  { id:'study', label:'Libraries & study', icon:'📚' },
  { id:'banking', label:'Banks & ATMs', icon:'🏧' },
  { id:'grooming', label:'Barbers & salons', icon:'✂️' },
  { id:'transport', label:'Transport', icon:'🚌' },
  { id:'fun', label:'Entertainment', icon:'🎭' }
]);
module.exports = { CAMPUS, RADIUS, CATEGORIES };
