import { useQuery } from '@tanstack/react-query';
import { getStats } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useStats = () =>
  useQuery({
    queryKey: queryKeys.stats,
    queryFn: getStats,
  });
