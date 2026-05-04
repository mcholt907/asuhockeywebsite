import { useQuery } from '@tanstack/react-query';
import { getStandings } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useStandings = () =>
  useQuery({
    queryKey: queryKeys.standings,
    queryFn: getStandings,
  });
