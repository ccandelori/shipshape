import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { invalidateFleetGraphFindings } from './useFleetGraphQuery';
import { useRealtimeEvent } from './useRealtimeEvents';

export async function invalidateFleetGraphFindingsFromRealtime(
  queryClient: QueryClient
): Promise<void> {
  await invalidateFleetGraphFindings(queryClient);
}

export function useFleetGraphRealtimeInvalidation(): void {
  const queryClient = useQueryClient();
  const handleFleetGraphFindingUpdated = useCallback(() => {
    void invalidateFleetGraphFindingsFromRealtime(queryClient);
  }, [queryClient]);

  useRealtimeEvent('fleetgraph:finding_updated', handleFleetGraphFindingUpdated);
}
