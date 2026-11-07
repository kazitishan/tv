import { useEffect, useState } from 'react';

const formatTime = () =>
  new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');

export default function Clock() {
  const [time, setTime] = useState(formatTime);

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="text-[22px] font-medium text-white/85 tabular-nums">{time}</span>;
}
