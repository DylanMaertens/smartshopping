import React, { createContext, useContext, useState } from 'react';
import Constants from 'expo-constants';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
import { allowsPremiumSimulation } from '@/services/premiumPolicy';

export const PREMIUM_SIMULATION_KEY = 'preview.premium-simulation.v1';
const PremiumContext = createContext({ isPremium: false, canSimulate: false,
  setSimulation: (_enabled: boolean) => {}, error: null as string | null });

export function PremiumProvider({ children }: React.PropsWithChildren) {
  const canSimulate = allowsPremiumSimulation(Constants.expoConfig?.extra?.distributionChannel,
    typeof __DEV__ !== 'undefined' && __DEV__);
  const [simulated, setSimulated] = useState(() => {
    if (!canSimulate) return false;
    try { return LocalKeyValueStorage.getString(PREMIUM_SIMULATION_KEY) === 'true'; }
    catch { return false; }
  });
  const [error, setError] = useState<string | null>(null);
  function setSimulation(enabled: boolean) {
    if (!canSimulate) return;
    try { LocalKeyValueStorage.setString(PREMIUM_SIMULATION_KEY, String(enabled)); setSimulated(enabled); setError(null); }
    catch { setError('Impossible d’enregistrer le mode de test. Réessaie.'); }
  }
  // Real, server-verified purchase rights will be connected here later.
  // Never trust a stored simulation flag in a production distribution.
  return <PremiumContext.Provider value={{ isPremium: canSimulate && simulated, canSimulate, setSimulation, error }}>
    {children}
  </PremiumContext.Provider>;
}
export const usePremium = () => useContext(PremiumContext);
