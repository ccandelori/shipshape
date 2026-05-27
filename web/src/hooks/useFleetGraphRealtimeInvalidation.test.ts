import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { fleetGraphKeys } from './useFleetGraphQuery';
import { invalidateFleetGraphFindingsFromRealtime } from './useFleetGraphRealtimeInvalidation';

describe('invalidateFleetGraphFindingsFromRealtime', () => {
  it('invalidates every FleetGraph findings list when a finding update arrives', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateFleetGraphFindingsFromRealtime(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: fleetGraphKeys.findings() });
  });
});
