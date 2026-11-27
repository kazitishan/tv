import { useEffect } from 'react';

// Text fields on the home screen open the phone remote's keyboard, like the ones
// on websites (electron/text-focus.preload.cjs does that for sites).
//
// - Focus: reports when a text field gets or loses focus, and when an already
//   focused one is clicked (to bring the keyboard back after Done).
// - Hover: reports when the pointer is over a text field, or over an element
//   marked `data-opens-keyboard` (a button that opens a form with a focused
//   field). Phones only show their keyboard for a focus() inside a tap, so the
//   remote opens it during the tap when it knows the tap will need it.

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

const isTextField = (el) => {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(el.type);
  if (el.tagName === 'TEXTAREA') return true;
  return Boolean(el.isContentEditable);
};

const opensKeyboard = (el) =>
  isTextField(el) ||
  isTextField(el?.closest?.('label')?.control) ||
  Boolean(el?.closest?.('[data-opens-keyboard]:not(:disabled)'));

export default function usePhoneKeyboard() {
  useEffect(() => {
    const tv = window.tv;
    if (!tv?.reportTextFocus) return;

    let focused = null; // the text field the phone keyboard is for
    let hovering = false;
    let pointer = null; // last pointer position, to check again after the page changes

    const updateFocus = () => {
      const el = document.activeElement;
      const next = isTextField(el) ? el : null;
      if (next === focused) return;
      focused = next;
      tv.reportTextFocus(Boolean(next));
    };
    const setHovering = (over) => {
      if (over === hovering) return;
      hovering = over;
      tv.reportTextHover(over);
    };

    // After the event, so moving between two fields doesn't report "lost" in between.
    const onFocusChange = () => setTimeout(updateFocus);
    let clickedFocused = false;
    const onMouseDown = (e) => {
      clickedFocused = Boolean(focused) && e.composedPath().includes(focused);
    };
    const onClick = () => {
      if (clickedFocused && focused) tv.reportTextFocus(true);
      clickedFocused = false;
      // A click often changes what's under the pointer (a form opens) without a mousemove.
      setTimeout(() => {
        updateFocus();
        if (pointer) setHovering(opensKeyboard(document.elementFromPoint(pointer.x, pointer.y)));
      });
    };
    const onMouseMove = (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      setHovering(opensKeyboard(e.target));
    };

    document.addEventListener('focusin', onFocusChange, true);
    document.addEventListener('focusout', onFocusChange, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('mousemove', onMouseMove, true);
    return () => {
      document.removeEventListener('focusin', onFocusChange, true);
      document.removeEventListener('focusout', onFocusChange, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      if (focused) tv.reportTextFocus(false);
      if (hovering) tv.reportTextHover(false);
    };
  }, []);
}
