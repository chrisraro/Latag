// lib/supabase.ts calls createClient at module scope, which throws
// "supabaseUrl is required" the moment any test imports a screen that reaches
// it. Jest does not load .env, so any suite touching the shop tab failed to
// load. These are inert placeholders — no test performs a real network call.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

jest.mock("expo-crypto", () => ({
  randomUUID: () => require("node:crypto").randomUUID(),
  getRandomBytes: (n: number) => new Uint8Array(require("node:crypto").randomBytes(n)),
}));
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
  deleteAssetsAsync: jest.fn(async () => true),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
