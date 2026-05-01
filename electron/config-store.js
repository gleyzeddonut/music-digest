const path = require('path');
const fs = require('fs');

// _configPath is null in production (uses Electron userData).
// Tests override it via _setConfigPath().
let _configPath = null;

function getConfigPath() {
  if (_configPath) return _configPath;
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'config.json');
}

function _setConfigPath(p) {
  _configPath = p;
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

function getConfig(key) {
  const val = readAll()[key];
  return val !== undefined ? val : null;
}

function setConfig(key, value) {
  const p = getConfigPath();
  const data = readAll();
  if (value === null || value === undefined) {
    delete data[key];
  } else {
    data[key] = value;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

module.exports = { getConfig, setConfig, _setConfigPath };
