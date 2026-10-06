const baseConfig = require('./app.json');
const { createAppConfig } = require('./config/build-config.cjs');

module.exports = () => {
  const fs = require('node:fs');
  const path = require('node:path').join(__dirname, '.local-api.json');
  const localApiUrl = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')).apiBaseUrl : undefined;
  return createAppConfig(baseConfig.expo, process.env, localApiUrl);
};
