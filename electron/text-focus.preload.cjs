// Preload for in-app websites. Tells the main process when a text field on the
// page gets or loses focus, so the phone remote can open and close its keyboard.
// Exposes nothing to the page: it runs in its own isolated world (sandboxed,
// context isolation) and only listens to focus and click events.
const { ipcRenderer } = require('electron');

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** The focused element, looking inside shadow roots (web components). */
const deepActiveElement = () => {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
};

const isTextField = (el) => {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(el.type); // el.type is 'text' when unknown
  if (el.tagName === 'TEXTAREA') return true;
  return Boolean(el.isContentEditable);
};

let focused = null; // the text field the phone keyboard is for
const report = (open) => ipcRenderer.send('text-focus', open);

// Sends `true` each time a (different) text field gets focus, so the phone
// starts fresh, and `false` when focus leaves text fields.
const update = () => {
  const el = deepActiveElement();
  const next = isTextField(el) ? el : null;
  if (next === focused) return;
  focused = next;
  report(Boolean(next));
};

// After the event, so moving between two fields doesn't report "lost" in between.
document.addEventListener('focusin', () => setTimeout(update), true);
document.addEventListener('focusout', () => setTimeout(update), true);

// Clicking a field that already has focus (after the phone keyboard was closed
// with Done) opens the keyboard again.
let clickedFocusedField = false;
window.addEventListener('mousedown', (e) => {
  clickedFocusedField = Boolean(focused) && e.composedPath().includes(focused);
}, true);
window.addEventListener('click', () => {
  if (clickedFocusedField && focused) report(true);
  clickedFocusedField = false;
  // Clicking away from a field doesn't always fire focusout (e.g. while the
  // window isn't focused), so check again.
  setTimeout(update);
}, true);

// Whether the pointer is over a text field (or its label). The phone remote uses
// this to open its keyboard during the tap itself: phones only show the keyboard
// for a focus() inside a tap, and the focus report above arrives too late.
let hovering = false;
const setHovering = (over) => {
  if (over === hovering) return;
  hovering = over;
  ipcRenderer.send('text-hover', over);
};
const isTextFieldTarget = (el) => isTextField(el) || isTextField(el?.closest?.('label')?.control);
window.addEventListener('mousemove', (e) => setHovering(isTextFieldTarget(e.composedPath()[0])), true);

window.addEventListener('pagehide', () => {
  if (focused) report(false);
  focused = null;
  setHovering(false);
});
