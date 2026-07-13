import Toast from "react-native-toast-message";

export function showSuccess(message: string): void {
  Toast.show({ type: "success", text1: message });
}

export function showError(message: string): void {
  Toast.show({ type: "error", text1: message });
}
