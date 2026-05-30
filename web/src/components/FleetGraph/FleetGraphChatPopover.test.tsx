import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FleetGraphChatPopover } from './FleetGraphChatPopover';

describe('FleetGraphChatPopover', () => {
  it('opens FleetGraph chat from the pill without replacing the trigger', async () => {
    render(<FleetGraphChatPopoverHarness />);

    const trigger = screen.getByRole('button', { name: 'Ask FleetGraph' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('FleetGraph chat')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(await screen.findByLabelText('FleetGraph chat')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close FleetGraph chat' })).toBeInTheDocument();
  });

  it('collapses back to the pill from the chat close button', async () => {
    render(<FleetGraphChatPopoverHarness />);

    const trigger = screen.getByRole('button', { name: 'Ask FleetGraph' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: 'Close FleetGraph chat' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('FleetGraph chat')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

function FleetGraphChatPopoverHarness() {
  const [open, setOpen] = useState(false);

  return (
    <FleetGraphChatPopover
      open={open}
      onOpenChange={setOpen}
      documentId="issue-1"
      documentType="issue"
      memoryScope={{ workspaceId: 'workspace-1', userId: 'user-1' }}
    />
  );
}
