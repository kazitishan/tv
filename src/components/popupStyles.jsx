// Shared by the gear menu's popups (UpdatePopup, AboutPopup).

export const PRIMARY =
  'w-full cursor-pointer rounded-2xl bg-white px-5 py-3.5 text-[16px] font-semibold text-black outline-none transition-colors hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white';
export const SECONDARY =
  'w-full cursor-pointer rounded-2xl bg-white/10 px-5 py-3.5 text-[16px] font-semibold text-white/90 outline-none transition-colors hover:bg-white/20 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/10';

/** `className` sets the size and ring width; `dark` is for use on a white button. */
export function Spinner({ className = 'size-9 border-[3px]', dark = false }) {
  const colors = dark ? 'border-black/15 border-t-black/70' : 'border-white/15 border-t-white/80';
  return <span aria-hidden className={`block animate-spin rounded-full ${colors} ${className}`} />;
}
