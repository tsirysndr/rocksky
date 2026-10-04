const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

module.exports = config => {
  config = withGradleProperties(config, config => {
    const properties = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
    };
    config.modResults = config.modResults.filter(item =>
      !(item.type === 'property' && Object.hasOwn(properties, item.key)));
    for (const [key, value] of Object.entries(properties)) {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
  return withAppBuildGradle(config, config => {
    // Expo's default proguard-android.txt disables optimization. Use the
    // optimizing rules as well as enabling R8 shrinking and obfuscation.
    const contents = config.modResults.contents.replace(
      /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    if (!contents.includes('proguard-android-optimize.txt')) {
      throw new Error('Cannot configure release optimization: Android ProGuard declaration changed.');
    }
    config.modResults.contents = contents;
    return config;
  });
};
