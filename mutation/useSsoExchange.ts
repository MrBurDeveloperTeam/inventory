import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';

export const useSsoExchange = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.get('/sso/exchange');
      return data;
    },
  });
};