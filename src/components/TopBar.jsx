import { useRef } from 'react';
import Clock from './Clock.jsx';
import Icon from './Icon.jsx';
import RemoteStatus from './RemoteStatus.jsx';
import SettingsMenu from './SettingsMenu.jsx';

/** A round icon button for the top bar (`icon` is a file in src/icons/; same icons as the phone remote). */
function NavButton({ icon, label, onClick, disabled = false, ref, ...rest }) {
  return (
    <button
      ref={ref}
      {...rest}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="app-no-drag grid size-9 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:text-white/25 disabled:hover:bg-transparent"
    >
      <Icon name={icon} />
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
  onShowAbout,
  onShowUpdates,
  onQuit,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
}) {
  const gearRef = useRef(null);
  const showGear = (onShowAbout || onShowUpdates || onQuit) && !openAppName;
  return (
    // Raised above the card grid (also z-1, later in the page) while the menu is open.
    <header className={`app-drag relative flex ${menuOpen ? 'z-20' : 'z-1'} h-14 shrink-0 items-center justify-between pr-14 pl-24`}>
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
            <Icon name="phone" />
          </button>
        )}
        <Clock />
        {/* Settings menu: update check and Quit (home screen only, like the phone button). */}
        {showGear && (
          <div className="relative">
            <NavButton
              ref={gearRef}
              icon="gear"
              label="Settings"
              onClick={onToggleMenu}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            />
            {menuOpen && (
              <SettingsMenu
                anchorRef={gearRef}
                onClose={onCloseMenu}
                onAbout={onShowAbout}
                onCheckForUpdates={onShowUpdates}
                onQuit={onQuit}
              />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
