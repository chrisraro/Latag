jest.mock("expo-crypto", () => ({ randomUUID: () => require("node:crypto").randomUUID() }));
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(async () => "id-" + Math.random()),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 7 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
