const { withAppBuildGradle } = require("@expo/config-plugins");

// pnpm monorepo: point react { root } at the workspace root (four levels up from
// android/app) so export:embed resolves the hoisted JS entry. The workspace-root
// app.json's extra.router.root then redirects expo-router back to apps/mobile/app.
const withMonorepoBundleRoot = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes('root = file("../../../..")')) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(\/\/ root = file\("\.\.\/\.\.\/"\))/,
      '$1\n    root = file("../../../..")',
    );
    return cfg;
  });

module.exports = withMonorepoBundleRoot;
