import { useWideImage } from '../hooks/useWideImage.js';

const TILT_DEG = 12;

/**
 * A streaming-service card: the platform's artwork on a tvOS-style tile,
 * with its name shown underneath while focused.
 */
export default function Card({ name, image, bg, focused = false, pressed = false, onFocus, onSelect, ref }) {
  const art = useWideImage(image, bg);

  // Tilt + glare follow the cursor via CSS variables.
  const handleMouseMove = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${(x - 0.5) * TILT_DEG}deg`);
    el.style.setProperty('--rx', `${(0.5 - y) * TILT_DEG}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  };

  const handleMouseLeave = (e) => {
    ['--rx', '--ry', '--gx', '--gy'].forEach((p) => e.currentTarget.style.removeProperty(p));
  };

  return (
    <button
      ref={ref}
      data-focused={focused || undefined}
      data-pressed={pressed || undefined}
      className="group relative block cursor-pointer outline-none perspective-[900px] [--gx:50%] [--gy:0%] [--rx:0deg] [--ry:0deg] data-focused:z-2"
      onFocus={onFocus}
      onMouseEnter={onFocus}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onSelect}
      aria-label={`Open ${name}`}
    >
      {/* Surface: zooms, tilts and lifts when focused */}
      <div
        className="relative aspect-5/3 overflow-hidden rounded-[14px] bg-neutral-900 shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition-[scale,rotate,transform,box-shadow] duration-350 ease-tv will-change-transform group-data-focused:scale-115 group-data-focused:rotate-x-(--rx) group-data-focused:rotate-y-(--ry) group-data-focused:shadow-[0_28px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)] group-data-pressed:animate-press"
      >
        <img
          src={art ?? image}
          alt=""
          draggable={false}
          className={`absolute inset-0 size-full transition-opacity duration-300 ${art ? 'object-cover opacity-100' : 'object-contain opacity-0'}`}
        />

        {/* Specular glare that follows the cursor */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--gx)_var(--gy),rgba(255,255,255,0.32),transparent_55%),linear-gradient(to_bottom,rgba(255,255,255,0.12),transparent_40%)] opacity-0 transition-opacity duration-350 ease-tv group-data-focused:opacity-100" />
      </div>

      <span className="absolute inset-x-0 top-full mt-5 -translate-y-1.5 text-center text-[17px] font-semibold whitespace-nowrap text-white/90 opacity-0 transition duration-300 ease-tv group-data-focused:translate-y-0 group-data-focused:opacity-100">
        {name}
      </span>
    </button>
  );
}
