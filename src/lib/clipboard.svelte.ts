// Copie dans le presse-papiers, effacé automatiquement après 30 s.
export const toast = $state({ text: '', id: 0 });
const CLEAR_AFTER = 30_000;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(text: string) {
  toast.text = text;
  toast.id++;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.text = ''), 2500);
}

export async function copy(value: string, label: string, secret = false) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    return notify('Copie impossible');
  }
  clearTimeout(clearTimer);
  if (secret) {
    notify(`${label} copié · effacé dans 30 s`);
    clearTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), CLEAR_AFTER);
  } else notify(`${label} copié`);
}

export function clearClipboardNow() {
  if (clearTimer) navigator.clipboard.writeText('').catch(() => {});
  clearTimeout(clearTimer);
  clearTimer = undefined;
}
