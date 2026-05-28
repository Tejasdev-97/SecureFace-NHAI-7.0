const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 */
const config = {
  resolver: {
    // Allow importing .tflite and .bin model files as assets
    assetExts: ['bin', 'tflite', 'db', 'png', 'jpg', 'jpeg', 'gif', 'svg'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
