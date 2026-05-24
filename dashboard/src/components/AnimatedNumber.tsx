import { useEffect, useRef, useState } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';

interface Props {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  suffix?: string;
}

export function AnimatedNumber({ value, decimals = 0, duration = 1.4, className, suffix }: Props) {
  const motion = useMotionValue(0);
  const rounded = useTransform(motion, (v) => v.toFixed(decimals));
  const [display, setDisplay] = useState('0');
  const startedRef = useRef(false);

  useEffect(() => {
    const controls = animate(motion, value, { duration, ease: [0.16, 1, 0.3, 1] });
    const unsub = rounded.on('change', (v) => setDisplay(v));
    startedRef.current = true;
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, duration, motion, rounded]);

  return (
    <span className={className}>
      {display}
      {suffix}
    </span>
  );
}
