import { useQuery } from '@tanstack/react-query';
import { getTransfers } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useTransfers = () =>
  useQuery({
    queryKey: queryKeys.transfers,
    queryFn: getTransfers,
  });
