import { useEffect, useState } from 'react';
import { apps } from './apps.js';
import Backdrop from './components/Backdrop.jsx';
import CardGrid from './components/CardGrid.jsx';
import Hero from './components/Hero.jsx';
import TopBar from './components/TopBar.jsx';

const backdropImages = apps.map((app) => app.image);

// Exposed by electron/preload.cjs; undefined when running in a plain browser.
const tv = window.tv;

export default function App() {
  const [focused, setFocused] = useState(0);
  const [openAppName, setOpenAppName] = useState(null);
  const current = apps[focused];

  // The main process tells us when the in-app page closes (Home button or Esc).
  useEffect(() => tv?.onInAppClosed(() => setOpenAppName(null)), []);

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

      <TopBar openAppName={openAppName} onHome={() => tv?.closeInApp()} />

      <Hero title={current.name} subtitle={current.tagline} />

      <CardGrid items={apps} focusedIndex={focused} onFocusChange={setFocused} onSelect={openApp} />
    </div>
  );
}
