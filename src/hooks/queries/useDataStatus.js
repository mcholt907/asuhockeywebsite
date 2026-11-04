import { useQuery } from '@tanstack/react-query';
import { getDataStatus } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useDataStatus = (enabled = true) => useQuery({
  queryKey: queryKeys.dataStatus,
  queryFn: getDataStatus,
  enabled,
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: 'always',
});
