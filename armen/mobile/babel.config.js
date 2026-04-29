module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 / worklets — must be the LAST plugin per upstream docs.
    plugins: ['react-native-worklets/plugin'],
  };
};
