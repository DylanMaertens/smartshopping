const { createAppConfig } = require('./config/build-config.cjs');

module.exports = ({ config }) => {
  const fs = require('node:fs');
  const path = require('node:path').join(__dirname, '.local-api.json');
  const localApiUrl = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')).apiBaseUrl : undefined;
  return createAppConfig(config, process.env, localApiUrl);
};
