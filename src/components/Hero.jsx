/** Large title + tagline for the currently focused platform. */
export default function Hero({ title, subtitle }) {
  // Keys re-mount the text so the entrance animation replays on every change.
  return (
    <section className="relative z-1 flex min-h-30 flex-1 flex-col justify-end px-14 pb-6 xl:px-20 xl:pb-7">
      <h1
        key={title}
        className="animate-rise text-[clamp(44px,6vw,84px)] leading-[1.05] font-bold tracking-[-0.025em] [text-shadow:0_4px_30px_rgba(0,0,0,0.35)]"
      >
        {title}
      </h1>
      <p
        key={`${title}-sub`}
        className="mt-2.5 animate-rise text-[clamp(16px,1.6vw,22px)] font-medium text-white/60 [animation-delay:50ms]"
      >
        {subtitle}
      </p>
    </section>
  );
}
