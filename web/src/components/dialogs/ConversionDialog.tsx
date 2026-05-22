import * as Dialog from '@radix-ui/react-dialog';

export interface ConversionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConvert: () => void;
  sourceType: 'issue' | 'project';
  title: string;
  isConverting?: boolean;
}

export function ConversionDialog({ isOpen, onClose, onConvert, sourceType, title, isConverting }: ConversionDialogProps) {
  if (!isOpen) return null;

  const targetType = sourceType === 'issue' ? 'project' : 'issue';
  const actionLabel = sourceType === 'issue' ? 'Promote to Project' : 'Convert to Issue';

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConverting) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg focus:outline-none"
          onEscapeKeyDown={(e) => {
            if (isConverting) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (isConverting) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (isConverting) e.preventDefault();
          }}
        >
          <Dialog.Title className="mb-4 text-lg font-semibold text-foreground">
            {actionLabel}
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-foreground">
            Convert <strong>"{title}"</strong> from {sourceType} to {targetType}?
          </Dialog.Description>
          <div className="mb-4 rounded bg-amber-500/10 border border-amber-500/30 p-3">
            <p className="text-sm text-amber-300 font-medium mb-2">What will happen:</p>
            <ul className="text-xs text-muted space-y-1">
              <li>• A new {targetType} will be created with the same title and content</li>
              <li>• The original {sourceType} will be archived</li>
              <li>• Links to the old {sourceType} will redirect to the new {targetType}</li>
              {sourceType === 'issue' && (
                <li>• Issue properties (state, priority, assignee) will be reset</li>
              )}
              {sourceType === 'project' && (
                <>
                  <li>• Project properties (ICE scores, owner) will be reset</li>
                  <li>• Child issues will be orphaned (unlinked from project)</li>
                </>
              )}
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isConverting}
              className="rounded px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConvert}
              disabled={isConverting}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isConverting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Converting...
                </>
              ) : (
                actionLabel
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
