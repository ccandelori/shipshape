import * as Dialog from '@radix-ui/react-dialog';
import { FindingsInbox } from './FindingsInbox';

interface FleetGraphInboxModalProps {
  open: boolean;
  onClose: () => void;
}

export function FleetGraphInboxModal({ open, onClose }: FleetGraphInboxModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] flex h-[80vh] w-[min(960px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl focus:outline-none"
          onEscapeKeyDown={onClose}
        >
          <Dialog.Title className="sr-only">FleetGraph Inbox</Dialog.Title>
          <Dialog.Description className="sr-only">
            Review FleetGraph findings and approve, reject, dismiss, or snooze recommended actions.
          </Dialog.Description>
          <div className="flex items-center justify-end border-b border-border px-4 py-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-border hover:text-foreground"
                aria-label="Close FleetGraph inbox"
              >
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1">
            <FindingsInbox />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
