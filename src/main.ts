import './ui/styles.css';
import { Calculator } from './calculator/calculator';
import { bindDesktopKeys } from './ui/desktopKeys';
import { tick } from './ui/haptics';
import { buildCalculator, flashKey } from './ui/keyboard';
import { LcdView } from './ui/lcd';

const calc = new Calculator();
const lcd = new LcdView();

const press = (key: Parameters<Calculator['press']>[0], fromTouch: boolean) => {
  if (fromTouch && calc.state.prefs.haptics) tick();
  calc.press(key);
};

const root = buildCalculator(lcd.element, (key) => press(key, true));
document.getElementById('app')!.append(root);

const redraw = () => lcd.show(calc.render(), calc.state.settings.contrast);
calc.onChange(redraw);
redraw();

bindDesktopKeys((key) => {
  flashKey(root, key);
  press(key, false);
});

// iOS: Doppeltipp- und Pinch-Zoom unterbinden.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Zustand sichern, wenn die App in den Hintergrund geht.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') calc.persist();
});
