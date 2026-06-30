import { useEffect, useState } from 'react';
import { callSnabbbApi } from './snabbbApi';

export function useWallet(odooPartnerId: number) {
  const [balance, setBalance] = useState<{ snabbb: number; game: number } | null>(null);

  useEffect(() => {
    callSnabbbApi<{ snabbb_balance: number; game_balance: number }>(
      `/snabbb/api/wallet?partner_id=${odooPartnerId}`
    ).then(data => {
      setBalance({ snabbb: data.snabbb_balance, game: data.game_balance });
    });
  }, [odooPartnerId]);

  return balance;
}