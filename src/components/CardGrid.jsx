import { useEffect, useRef, useState } from 'react';
import Card from './Card.jsx';

/**
 * Grid of Cards with remote-style arrow-key navigation.
 * The parent owns which card is focused so other parts of the screen can react to it.
 */
export default function CardGrid({ items, focusedIndex, onFocusChange, onSelect }) {
  const [pressedIndex, setPressedIndex] = useState(null);
  const gridRef = useRef(null);
  const cardRefs = useRef([]);

  // Keep real DOM focus in sync so Enter/Space activate the focused card.
  useEffect(() => {
    const el = cardRefs.current[focusedIndex];
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [focusedIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const cols = getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length;
      const last = items.length - 1;
      const i = focusedIndex;
      let next;
      if (e.key === 'ArrowRight') next = Math.min(i + 1, last);
      else if (e.key === 'ArrowLeft') next = Math.max(i - 1, 0);
      else if (e.key === 'ArrowDown') next = i + cols <= last ? i + cols : i;
      else if (e.key === 'ArrowUp') next = i - cols >= 0 ? i - cols : i;
      else return;
      e.preventDefault();
      if (next !== i) onFocusChange(next);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, focusedIndex, onFocusChange]);

  const select = (i) => {
    setPressedIndex(i);
    setTimeout(() => setPressedIndex(null), 500);
    onSelect(items[i]);
  };

  return (
    <main
      ref={gridRef}
      className="relative z-1 grid grid-cols-4 gap-x-8 gap-y-13 px-14 pt-6 pb-18 xl:grid-cols-6 xl:gap-x-10 xl:gap-y-14 xl:px-20 xl:pt-7 xl:pb-21"
    >
      {items.map((item, i) => (
        <Card
          key={item.name}
          ref={(el) => (cardRefs.current[i] = el)}
          name={item.name}
          image={item.img}
          bg={item.bg}
          focused={i === focusedIndex}
          pressed={i === pressedIndex}
          onFocus={() => onFocusChange(i)}
          onSelect={() => select(i)}
        />
      ))}
    </main>
  );
}
