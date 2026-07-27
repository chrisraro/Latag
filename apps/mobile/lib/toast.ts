import Toast from "react-native-toast-message";

type ToastOptions = { onPress?: () => void; sticky?: boolean };

function show(type: "success" | "error", message: string, opts?: ToastOptions): void {
  const handler = opts?.onPress;
  // Fires at most once, and always dismisses. These handlers are undo actions
  // ("Sold — tap to undo", "Publishing — tap to undo"), and running one twice
  // means two rows in the publish queue and two confirmations for a single
  // gesture. Previously only `sticky` toasts dismissed on tap, which left the
  // four-second undo window fully re-tappable. The flag is per-call, so the
  // next toast starts armed.
  let fired = false;
  const onPress = handler
    ? () => {
        if (fired) return;
        fired = true;
        handler();
        Toast.hide();
      }
    : undefined;
  Toast.show({ type, text1: message, onPress, autoHide: !opts?.sticky });
}

export function showSuccess(message: string, opts?: ToastOptions): void {
  show("success", message, opts);
}

export function showError(message: string, opts?: ToastOptions): void {
  show("error", message, opts);
}
