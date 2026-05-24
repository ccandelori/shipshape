import { Check, X, Minus } from 'lucide-react';
import clsx from 'clsx';
import type { CheckStatus } from '../data/types';

interface Props {
  status: CheckStatus;
  size?: 'sm' | 'md';
  label?: string;
}

export function StatusPill({ status, size = 'sm', label }: Props) {
  const classes = clsx(
    'pill',
    status === 'pass' && 'pill-pass',
    status === 'fail' && 'pill-fail',
    status === 'skip' && 'pill-skip',
    size === 'md' && 'text-sm px-3.5 py-1.5'
  );
  const Icon = status === 'pass' ? Check : status === 'fail' ? X : Minus;
  const iconSize = size === 'md' ? 13 : 11;
  return (
    <span className={classes}>
      <Icon size={iconSize} strokeWidth={3} />
      {label ?? (status === 'pass' ? 'Pass' : status === 'fail' ? 'Fail' : 'Skip')}
    </span>
  );
}
