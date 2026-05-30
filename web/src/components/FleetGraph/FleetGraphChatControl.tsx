import { FleetGraphChatPopover } from './FleetGraphChatPopover';
import type { FleetGraphChatDocumentType } from './EmbeddedChat';

interface FleetGraphChatControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentType: FleetGraphChatDocumentType;
  memoryScope: {
    workspaceId: string;
    userId: string;
  } | null;
}

export function FleetGraphChatControl({
  open,
  onOpenChange,
  documentId,
  documentType,
  memoryScope,
}: FleetGraphChatControlProps) {
  return (
    <div
      className="pointer-events-none sticky top-0 z-20 -mb-10 flex justify-end px-6 pt-5"
      data-testid="fleetgraph-chat-editor-overlay"
    >
      <FleetGraphChatPopover
        open={open}
        onOpenChange={onOpenChange}
        documentId={documentId}
        documentType={documentType}
        memoryScope={memoryScope}
      />
    </div>
  );
}
