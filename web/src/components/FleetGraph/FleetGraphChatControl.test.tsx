import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FleetGraphChatControl } from './FleetGraphChatControl';

describe('FleetGraphChatControl', () => {
  it('anchors the chat pill in the editor overlay without blocking editor clicks', () => {
    render(
      <FleetGraphChatControl
        open={false}
        onOpenChange={() => {}}
        documentId="issue-1"
        documentType="issue"
        memoryScope={{ workspaceId: 'workspace-1', userId: 'user-1' }}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Ask FleetGraph' });
    const overlay = screen.getByTestId('fleetgraph-chat-editor-overlay');

    expect(overlay).toHaveClass('pointer-events-none');
    expect(overlay).toHaveClass('sticky');
    expect(overlay).toHaveClass('justify-end');
    expect(trigger).toHaveClass('pointer-events-auto');
  });

  it('opens the existing popover chat from the editor overlay seam', async () => {
    render(<FleetGraphChatControlHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask FleetGraph' }));

    expect(await screen.findByLabelText('FleetGraph chat')).toBeInTheDocument();
  });
});

function FleetGraphChatControlHarness() {
  const [open, setOpen] = useState(false);

  return (
    <FleetGraphChatControl
      open={open}
      onOpenChange={setOpen}
      documentId="sprint-1"
      documentType="sprint"
      memoryScope={{ workspaceId: 'workspace-1', userId: 'user-1' }}
    />
  );
}
