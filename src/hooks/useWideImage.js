import { useEffect, useState } from 'react';
import { makeWideImage } from '../utils/wideImage.js';

/** Returns a wide (5:3) version of a square image, or null while it's being generated. */
export function useWideImage(src, bg) {
  const [wide, setWide] = useState(null);

  useEffect(() => {
    let alive = true;
    makeWideImage(src, bg).then((url) => alive && setWide(url));
    return () => {
      alive = false;
    };
  }, [src, bg]);

  return wide;
}
