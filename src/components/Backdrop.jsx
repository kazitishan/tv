/** Full-screen ambient glow that cross-fades to the active image's colours. */
export default function Backdrop({ images, activeIndex }) {
  return (
    <>
      <div className="absolute -inset-[15%] z-0" aria-hidden>
        {images.map((src, i) => (
          <div
            key={src}
            className={`absolute inset-0 bg-cover bg-center blur-[100px] saturate-150 transition-opacity duration-900 ${i === activeIndex ? 'opacity-60' : 'opacity-0'}`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}
      </div>

      {/* Darkens the bottom so cards and text stay readable */}
      <div
        className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,transparent_0%,rgba(0,0,0,0.35)_70%),linear-gradient(to_bottom,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.55)_50%,rgba(0,0,0,0.9)_100%)]"
        aria-hidden
      />
    </>
  );
}
