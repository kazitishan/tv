import { useEffect, useState } from 'react';
import apps from './data/apps.json';
import Backdrop from './components/Backdrop.jsx';
import CardGrid from './components/CardGrid.jsx';
import Hero from './components/Hero.jsx';
import RemotePrompt from './components/RemotePrompt.jsx';
import TopBar from './components/TopBar.jsx';

const backdropImages = apps.map((app) => app.img);

// Exposed by electron/preload.cjs; undefined when running in a plain browser.
const tv = window.tv;

export default function App() {
  const [focused, setFocused] = useState(0);
  const [openAppName, setOpenAppName] = useState(null);
  const [remoteConnected, setRemoteConnected] = useState(false);
  // The phone remote QR code popup. Opens on startup only if no phone is connected
  // (the home screen also restarts on Refresh, while a phone may be connected).
  const [showRemotePrompt, setShowRemotePrompt] = useState(false);
  const current = apps[focused];

  // The main process tells us when the in-app page closes (Home button or the remote's Home/Back).
  useEffect(() => tv?.onInAppClosed(() => setOpenAppName(null)), []);

  useEffect(() => {
    if (!tv?.getRemoteStatus) return;
    let alive = true;
    tv.getRemoteStatus().then((status) => {
      if (!alive) return;
      setRemoteConnected(status.connected);
      if (!status.connected) setShowRemotePrompt(true);
    });
    const unsubscribe = tv.onRemoteStatus((status) => {
      setRemoteConnected(status.connected);
      if (status.connected) setShowRemotePrompt(false); // QR code no longer needed
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const openApp = (app) => {
    if (tv) {
      tv.openInApp(app.url);
      setOpenAppName(app.name);
    } else {
      // not running inside Electron (e.g. a plain browser tab)
      window.open(app.url, '_blank');
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Backdrop images={backdropImages} activeIndex={focused} />

      <TopBar
        openAppName={openAppName}
        onHome={() => tv?.closeInApp()}
        remoteConnected={remoteConnected}
        onShowRemote={tv?.getRemoteInfo ? () => setShowRemotePrompt(true) : null}
      />

      <Hero title={current.name} subtitle={current.tagline} />

      <CardGrid
        items={apps}
        focusedIndex={focused}
        onFocusChange={setFocused}
        onSelect={openApp}
        active={!showRemotePrompt}
      />

      {showRemotePrompt && <RemotePrompt onClose={() => setShowRemotePrompt(false)} />}
    </div>
  );
}
