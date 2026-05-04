import { useQuery } from '@tanstack/react-query';
import { getSchedule } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useSchedule = () =>
  useQuery({
    queryKey: queryKeys.schedule,
    queryFn: getSchedule,
  });
