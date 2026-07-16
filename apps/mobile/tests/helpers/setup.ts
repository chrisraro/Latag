jest.mock("expo-crypto", () => ({ randomUUID: () => require("node:crypto").randomUUID() }));
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(async () => "id-" + Math.random()),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  AndroidImportance: { MAX: 7 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
jest.mock("expo-media-library/legacy", () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  createAssetAsync: jest.fn(async (uri: string) => ({ id: "asset-" + uri, uri })),
  getAlbumAsync: jest.fn(async () => null),
  createAlbumAsync: jest.fn(async (name: string) => ({ id: "album-1", title: name })),
  addAssetsToAlbumAsync: jest.fn(async () => true),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
