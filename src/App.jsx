import { useState } from 'react';
import { apps } from './apps.js';
import Backdrop from './components/Backdrop.jsx';
import CardGrid from './components/CardGrid.jsx';
import Clock from './components/Clock.jsx';
import Hero from './components/Hero.jsx';

const backdropImages = apps.map((app) => app.image);

export default function App() {
  const [focused, setFocused] = useState(0);
  const current = apps[focused];

  // main process hands http(s) links opened this way to the default browser
  const openApp = (app) => window.open(app.url, '_blank');

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Backdrop images={backdropImages} activeIndex={focused} />

      <header className="app-drag relative z-1 flex h-14 shrink-0 items-center justify-end px-14">
        <Clock />
      </header>

      <Hero title={current.name} subtitle={current.tagline} />

      <CardGrid items={apps} focusedIndex={focused} onFocusChange={setFocused} onSelect={openApp} />
    </div>
  );
}
