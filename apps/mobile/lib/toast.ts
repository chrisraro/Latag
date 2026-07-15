import Toast from "react-native-toast-message";

type ToastOptions = { onPress?: () => void };

export function showSuccess(message: string, opts?: ToastOptions): void {
  Toast.show({ type: "success", text1: message, onPress: opts?.onPress });
}

export function showError(message: string, opts?: ToastOptions): void {
  Toast.show({ type: "error", text1: message, onPress: opts?.onPress });
}
