import { useQuery } from '@tanstack/react-query';
import { getRecruits } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useRecruits = () =>
  useQuery({
    queryKey: queryKeys.recruits,
    queryFn: getRecruits,
  });
