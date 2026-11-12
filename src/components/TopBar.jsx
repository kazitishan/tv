import Clock from './Clock.jsx';
import RemoteStatus from './RemoteStatus.jsx';

// Icon paths, matching the phone remote's buttons.
const ICONS = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  back: <path d="M15 18l-6-6 6-6" />,
  forward: <path d="M9 18l6-6-6-6" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5" />
      <path d="M20 3.5v5h-5" />
    </>
  ),
  stop: <path d="M6 6l12 12M18 6 6 18" />,
  gear: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

/** A round icon button for the top bar. */
function NavButton({ icon, label, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="app-no-drag grid size-9 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:text-white/25 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[icon]}
      </svg>
    </button>
  );
}

/**
 * Window top bar (also the drag region). While an app is open in-window it
 * shows browser-style Home / Back / Forward / Refresh buttons and the app's
 * name; the in-app page sits just below it.
 * Its height must match TOP_BAR_HEIGHT in electron/main.cjs.
 */
export default function TopBar({
  openAppName,
  onHome,
  navState,
  onNavigate,
  remoteConnected,
  onShowRemote,
  onShowUpdates,
}) {
  return (
    <header className="app-drag relative z-1 flex h-14 shrink-0 items-center justify-between pr-14 pl-24">
      <div className="flex items-center gap-1">
        {openAppName && (
          <>
            <NavButton icon="home" label="Home" onClick={onHome} />
            {/* Back stays enabled: on the site's first page it returns home, like the remote. */}
            <NavButton icon="back" label="Back" onClick={() => onNavigate('back')} />
            <NavButton
              icon="forward"
              label="Forward"
              onClick={() => onNavigate('forward')}
              disabled={!navState.canGoForward}
            />
            {navState.loading ? (
              <NavButton icon="stop" label="Stop loading" onClick={() => onNavigate('stop')} />
            ) : (
              <NavButton icon="refresh" label="Reload" onClick={() => onNavigate('refresh')} />
            )}
            <span className="ml-3 text-[15px] font-semibold text-white/90">{openAppName}</span>
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
        {/* Update check (home screen only, like the phone button). */}
        {onShowUpdates && !openAppName && <NavButton icon="gear" label="Check for updates" onClick={onShowUpdates} />}
      </div>
    </header>
  );
}
