// Turns a square icon into a wide 5:3 tile image by extending its own edge
// colours outward, so the logo sits on a seamless background.
const cache = new Map();

// Pass `bg` to use a solid colour instead (for logos that touch the icon edges).
export function makeWideImage(src, bg, w = 750, h = 450) {
  const key = `${src}|${bg ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const side = (w - h) / 2;
      const band = Math.max(2, Math.round(img.naturalWidth * 0.02));

      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      } else {
        // Stretch a thin band from each edge across the empty sides, softened.
        ctx.filter = 'blur(8px)';
        ctx.drawImage(img, 1, 0, band, img.naturalHeight, -20, -20, side + 40, h + 40);
        ctx.drawImage(img, img.naturalWidth - band - 1, 0, band, img.naturalHeight, w - side - 20, -20, side + 40, h + 40);
        ctx.filter = 'none';
      }

      ctx.drawImage(img, side, 0, h, h);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
  cache.set(key, p);
  return p;
}
