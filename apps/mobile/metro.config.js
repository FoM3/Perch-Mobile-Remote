const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// EXPO_USE_METRO_WORKSPACE_ROOT=1 (see .env) makes the Metro server root the
// workspace root so the hoisted node_modules resolve and the release entry does
// not escape the project. watchFolders + nodeModulesPaths back that up.
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
