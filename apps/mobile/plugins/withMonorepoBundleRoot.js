const { withAppBuildGradle } = require("@expo/config-plugins");

// pnpm monorepo: point Gradle's react { root } at the workspace root so export:embed resolves the hoisted JS entry.
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
