import { useQuery } from '@tanstack/react-query';
import { getAlumni } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useAlumni = () =>
  useQuery({
    queryKey: queryKeys.alumni,
    queryFn: getAlumni,
  });
