import * as Popover from '@radix-ui/react-popover';
import { EmbeddedChat, type FleetGraphChatDocumentType } from './EmbeddedChat';
import { cn } from '@/lib/cn';

interface FleetGraphChatPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentType: FleetGraphChatDocumentType;
  memoryScope?: {
    workspaceId: string;
    userId: string;
  } | null;
}

export function FleetGraphChatPopover({
  open,
  onOpenChange,
  documentId,
  documentType,
  memoryScope,
}: FleetGraphChatPopoverProps) {
  return (
    <Popover.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'pointer-events-auto inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background',
            open
              ? 'border-accent/50 bg-accent-soft text-foreground shadow-accent/10'
              : 'border-border bg-background/95 text-foreground hover:border-accent/40 hover:bg-border/60 hover:text-accent-fg'
          )}
          aria-expanded={open}
          aria-controls="fleetgraph-chat-panel"
        >
          <FleetGraphChatIcon />
          <span>Ask FleetGraph</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="bottom"
          sideOffset={10}
          collisionPadding={16}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            'fleetgraph-chat-popover-content z-50 overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-black/50 ring-1 ring-white/10',
            'h-[min(580px,calc(100vh-7rem))] w-[min(390px,calc(100vw-2rem))]',
            'focus:outline-none'
          )}
        >
          <EmbeddedChat
            documentId={documentId}
            documentType={documentType}
            memoryScope={memoryScope}
            className="h-full w-full border-0"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FleetGraphChatIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h8m-8 4h5m8-2a8 8 0 11-14.32-4.91A8 8 0 0121 12z" />
    </svg>
  );
}
