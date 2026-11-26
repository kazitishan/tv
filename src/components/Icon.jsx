// Every UI icon lives in src/icons/ as an SVG file, shared with the phone
// remote. They're inlined at build time (not loaded with <img>) so they take
// the text colour (`currentColor`), like the hover and disabled states need.
const ICONS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true })
  ).map(([file, svg]) => [file.match(/([^/]+)\.svg$/)[1], svg])
);

/** An icon from src/icons/ by file name (without .svg), sized by `className`. */
export default function Icon({ name, className = 'size-5' }) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 [&>svg]:size-full ${className}`}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
