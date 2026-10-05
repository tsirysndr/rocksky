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
    let contents = config.modResults.contents.replace(
      /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    if (!contents.includes('proguard-android-optimize.txt')) {
      throw new Error('Cannot configure release optimization: Android ProGuard declaration changed.');
    }
    // ExoPlayer opens the bundled media-session FLAC with openRawResourceFd.
    // That API cannot read compressed APK entries (FLAC is not in AAPT's
    // default no-compress list), so keep this audio resource seekable.
    const mediaResources = "androidResources { noCompress += ['flac'] }";
    if (!contents.includes(mediaResources)) {
      if (!/android\s*\{/.test(contents)) {
        throw new Error('Cannot configure audio resources: Android Gradle block changed.');
      }
      contents = contents.replace(/android\s*\{/, `android {\n    ${mediaResources}`);
    }
    const releaseRules = 'rootProject.file("../native/android-release.pro")';
    if (!contents.includes(releaseRules)) {
      const rulesDeclaration = /("proguard-rules\.pro"|'proguard-rules\.pro')/;
      if (!rulesDeclaration.test(contents)) {
        throw new Error('Cannot configure release keep rules: Android ProGuard declaration changed.');
      }
      contents = contents.replace(rulesDeclaration, `$1, ${releaseRules}`);
    }
    config.modResults.contents = contents;
    return config;
  });
};
