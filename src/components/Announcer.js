import { useEffect, useRef, useState } from 'react';
import { subscribeAnnouncements } from '../services/announcer';

// 屏幕上不显示，只给读屏用的两个实时区域。整个应用挂一次（main.jsx）。
export default function Announcer() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timers = useRef([]);

  useEffect(() => {
    const unsubscribe = subscribeAnnouncements(({ text, assertive: isAssertive }) => {
      const setter = isAssertive ? setAssertive : setPolite;
      // 先清空再写入，让重复的同一句话也能再次被读出来
      setter('');
      const id = setTimeout(() => setter(text), 60);
      timers.current.push(id);
    });
    return () => {
      unsubscribe();
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}
