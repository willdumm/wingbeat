/**
 * The app's Expo config (docs/mobile-app-plan.md, "The app itself").
 *
 * Every native module the plan uses is configured here from the first binary, so later
 * features ship as OTA updates ("Versions and compatibility"). Background location and the
 * presence module wait for phase 8, a planned native release.
 */
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Wingbeat',
  slug: 'wingbeat',
  owner: 'dummsoftware',
  version: '0.1.0',
  scheme: 'wingbeat',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/ab9f03ef-a562-4cd9-963b-478efc25f9b7',
  },
  extra: {
    eas: { projectId: 'ab9f03ef-a562-4cd9-963b-478efc25f9b7' },
  },
  ios: {
    bundleIdentifier: 'dev.dummthings.wingbeat',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'dev.dummthings.wingbeat',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    ['expo-secure-store', { faceIDPermission: false }],
    'expo-sqlite',
    'expo-web-browser',
    'expo-background-task',
    'expo-notifications',
    [
      'expo-camera',
      {
        cameraPermission: 'Wingbeat uses the camera to scan the QR code that adds an account.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Wingbeat shows your position on the map.',
        locationAlwaysAndWhenInUsePermission: 'Wingbeat shows your position on the map.',
        locationAlwaysPermission: 'Wingbeat shows your position on the map.',
        locationFullAccuracyPermission: false,
        motionUsagePermission: false,
      },
    ],
    '@maplibre/maplibre-react-native',
    '@sentry/react-native',
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
