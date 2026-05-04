import { useQuery } from '@tanstack/react-query';
import { getRoster } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useRoster = () =>
  useQuery({
    queryKey: queryKeys.roster,
    queryFn: getRoster,
  });
