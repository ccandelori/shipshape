import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import {
  NavigationRailIcon,
  getNavigationRailAttentionCount,
} from './NavigationRailIcon';

function renderRailIcon(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      {ui}
    </TooltipProvider>
  );
}

describe('NavigationRailIcon', () => {
  it('shows a numbered attention badge and exposes the count to assistive tech', () => {
    const handleClick = vi.fn();

    renderRailIcon(
      <NavigationRailIcon
        icon={<span aria-hidden="true">FG</span>}
        label="FleetGraph"
        active={false}
        onClick={handleClick}
        badgeCount={12}
        badgeDescription="items need attention"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'FleetGraph, 12 items need attention' }));

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('caps large numeric badges without hiding the underlying action', () => {
    renderRailIcon(
      <NavigationRailIcon
        icon={<span aria-hidden="true">FG</span>}
        label="FleetGraph"
        active={true}
        onClick={vi.fn()}
        badgeCount={128}
        badgeDescription="items need attention"
      />
    );

    expect(screen.getByRole('button', { name: 'FleetGraph, 99+ items need attention' })).toBeInTheDocument();
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('can still render a dot-only badge for binary status signals', () => {
    renderRailIcon(
      <NavigationRailIcon
        icon={<span aria-hidden="true">Team</span>}
        label="Teams"
        active={false}
        onClick={vi.fn()}
        showBadge={true}
      />
    );

    expect(screen.getByRole('button', { name: 'Teams' })).toBeInTheDocument();
    expect(screen.getByTestId('navigation-rail-dot-badge')).toBeInTheDocument();
  });
});

describe('getNavigationRailAttentionCount', () => {
  it('counts actionable FleetGraph findings across open, pending-review, and approved states', () => {
    expect(getNavigationRailAttentionCount({
      open: 2,
      pending_review: 3,
      approved: 5,
      executed: 7,
      rejected: 11,
      dismissed: 13,
      snoozed: 17,
      expired: 19,
    })).toBe(10);
  });
});
