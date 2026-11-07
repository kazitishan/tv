import Clock from './Clock.jsx';
import RemoteStatus from './RemoteStatus.jsx';

/**
 * Window top bar (also the drag region). While an app is open in-window it
 * shows a Home button and the app's name; the in-app page sits just below it.
 * Its height must match TOP_BAR_HEIGHT in electron/main.cjs.
 */
export default function TopBar({ openAppName, onHome, remoteConnected, onShowRemote }) {
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
      <div className="flex items-center gap-5">
        {/* Green dot while a phone is connected; otherwise a button that shows the
            QR code again (home screen only; a website would cover the popup). */}
        {remoteConnected && <RemoteStatus />}
        {!remoteConnected && onShowRemote && !openAppName && (
          <button
            onClick={onShowRemote}
            aria-label="Connect phone remote"
            title="Connect phone remote"
            className="app-no-drag grid size-9 cursor-pointer place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
              <path d="M11 18h2" />
            </svg>
          </button>
        )}
        <Clock />
      </div>
    </header>
  );
}
