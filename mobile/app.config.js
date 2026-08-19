const baseConfig = require('./app.json');

module.exports = () => {
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...baseConfig.expo,
    extra: projectId ? { eas: { projectId } } : undefined,
  };
};
