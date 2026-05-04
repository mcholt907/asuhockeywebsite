import { useQuery } from '@tanstack/react-query';
import { getNews } from '../../services/api';
import { queryKeys } from './queryKeys';

export const useNews = () =>
  useQuery({
    queryKey: queryKeys.news,
    queryFn: getNews,
  });
