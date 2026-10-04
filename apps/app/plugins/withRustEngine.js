const { withGradleProperties } = require('@expo/config-plugins');

// Match the APK/AAB architectures to the Rust libraries we actually compile.
module.exports = config => withGradleProperties(config, config => {
  config.modResults = config.modResults.filter(item => !(item.type === 'property' && item.key === 'reactNativeArchitectures'));
  config.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a,x86_64' });
  return config;
});
