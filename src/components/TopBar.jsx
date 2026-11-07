import Clock from './Clock.jsx';

/**
 * Window top bar (also the drag region). While an app is open in-window it
 * shows a Home button and the app's name; the in-app page sits just below it.
 * Its height must match TOP_BAR_HEIGHT in electron/main.cjs.
 */
export default function TopBar({ openAppName, onHome }) {
  return (
    <header className="app-drag relative z-1 flex h-14 shrink-0 items-center justify-between pr-14 pl-24">
      <div className="flex items-center gap-4">
        {openAppName && (
          <>
            <button
              onClick={onHome}
              className="app-no-drag flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 py-1.5 pr-4 pl-3 text-[15px] font-medium text-white/90 transition-colors hover:bg-white/20"
            >
              <span aria-hidden className="text-lg leading-none">‹</span>
              Home
            </button>
            <span className="text-[15px] font-semibold text-white/90">{openAppName}</span>
            <span className="text-[13px] text-white/40">Esc to go back</span>
          </>
        )}
      </div>
      <Clock />
    </header>
  );
}
