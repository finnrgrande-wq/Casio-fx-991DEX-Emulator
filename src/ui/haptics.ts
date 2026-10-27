// Leichtes Tastenfeedback. iOS-Safari kennt navigator.vibrate nicht; ab iOS 18 löst das Umschalten
// eines <input type="checkbox" switch> aber einen System-Haptik-Tick aus. Beides ist „best effort“.

let toggle: HTMLLabelElement | undefined;

function ensureSwitch(): HTMLLabelElement {
  if (toggle) return toggle;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.append(input);
  document.body.append(label);
  toggle = label;
  return label;
}

export function tick(): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
      return;
    }
    ensureSwitch().click();
  } catch {
    // Kein Feedback verfügbar – die visuelle Tastenanimation bleibt.
  }
}
