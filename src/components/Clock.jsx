import { useEffect, useState } from 'react';

// "Sun Nov 8 2:48 PM" (in the system's language and 12/24-hour setting).
const formatter = new Intl.DateTimeFormat([], {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const formatDateTime = () => formatter.format(new Date()).replace(/,/g, '');

export default function Clock() {
  const [text, setText] = useState(formatDateTime);

  useEffect(() => {
    const id = setInterval(() => setText(formatDateTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="text-[18px] font-medium whitespace-nowrap text-white/85 tabular-nums">{text}</span>;
}
