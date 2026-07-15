import Toast from "react-native-toast-message";

type ToastOptions = { onPress?: () => void; sticky?: boolean };

function show(type: "success" | "error", message: string, opts?: ToastOptions): void {
  const onPress = opts?.sticky && opts.onPress
    ? () => {
        opts.onPress?.();
        Toast.hide();
      }
    : opts?.onPress;
  Toast.show({ type, text1: message, onPress, autoHide: !opts?.sticky });
}

export function showSuccess(message: string, opts?: ToastOptions): void {
  show("success", message, opts);
}

export function showError(message: string, opts?: ToastOptions): void {
  show("error", message, opts);
}
