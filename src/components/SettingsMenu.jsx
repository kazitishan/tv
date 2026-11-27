import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

const ITEM =
  'flex w-full cursor-pointer items-center justify-between gap-6 rounded-xl px-4 py-2.5 text-left text-[15px] font-medium text-white/90 outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10';

/**
 * The gear button's dropdown: "About", "Check for updates" and "Quit". Closes on Esc,
 * a click outside it (`anchorRef`, the gear button, is ignored so it can toggle
 * the menu itself) or picking an item. Up/Down move between items.
 */
export default function SettingsMenu({ anchorRef, onClose, onAbout, onCheckForUpdates, onQuit }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const items = () => [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    items()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        anchorRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next]?.focus();
      }
    };
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [anchorRef, onClose]);

  const pick = (action) => () => {
    onClose();
    action();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Settings"
      className="app-no-drag absolute top-full right-0 mt-1 min-w-52 animate-fade rounded-2xl bg-neutral-900/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl"
    >
      {onAbout && (
        <button role="menuitem" onClick={pick(onAbout)} className={ITEM}>
          About
        </button>
      )}
      {onCheckForUpdates && (
        <button role="menuitem" onClick={pick(onCheckForUpdates)} className={ITEM}>
          Check for updates
        </button>
      )}
      {onQuit && (
        <button role="menuitem" onClick={pick(onQuit)} className={ITEM}>
          Quit
          <Icon name="power" className="size-[18px] text-white/60" />
        </button>
      )}
    </div>
  );
}
