import type { ReactNode } from 'react';
import type { FleetGraphLifecycleCounts } from '@/hooks/useFleetGraphQuery';
import { cn } from '@/lib/cn';
import { Tooltip } from './ui/Tooltip';

interface NavigationRailIconProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  showBadge?: boolean;
  badgeCount?: number;
  badgeDescription?: string;
}

export function NavigationRailIcon({
  icon,
  label,
  active,
  onClick,
  showBadge,
  badgeCount,
  badgeDescription,
}: NavigationRailIconProps) {
  const hasNumberBadge = badgeCount !== undefined && badgeCount > 0;
  const hasDotBadge = showBadge === true && !hasNumberBadge;
  const formattedBadgeCount = hasNumberBadge ? formatNavigationRailBadgeCount(badgeCount) : null;
  const accessibleLabel = hasNumberBadge
    ? `${label}, ${formattedBadgeCount} ${badgeDescription ?? 'items need attention'}`
    : label;

  return (
    <Tooltip content={accessibleLabel} side="right">
      <button
        onClick={onClick}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-border text-foreground' : 'text-muted hover:bg-border/50 hover:text-foreground'
        )}
        aria-label={accessibleLabel}
      >
        {icon}
        {hasNumberBadge && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm ring-2 ring-background">
            {formattedBadgeCount}
          </span>
        )}
        {hasDotBadge && (
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500"
            data-testid="navigation-rail-dot-badge"
          />
        )}
      </button>
    </Tooltip>
  );
}

export function getNavigationRailAttentionCount(
  counts: FleetGraphLifecycleCounts | null | undefined
): number {
  return (counts?.open ?? 0) + (counts?.pending_review ?? 0) + (counts?.approved ?? 0);
}

function formatNavigationRailBadgeCount(count: number): string {
  if (count > 99) {
    return '99+';
  }

  return String(count);
}
