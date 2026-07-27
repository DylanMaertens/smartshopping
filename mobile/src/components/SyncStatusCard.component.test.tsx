import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SyncStatusCard } from './SyncStatusCard';

describe('SyncStatusCard', () => {
  it('affiche la connectivité, les changements et déclenche une sync manuelle', () => {
    const onSync = jest.fn();
    const screen = render(
      <SyncStatusCard
        lastSyncAt={0}
        message="Modifications locales en attente."
        networkState={{ isConnected: true, isInternetReachable: true }}
        onSync={onSync}
        pendingCount={2}
        phase="idle"
      />,
    );

    screen.getByText('● En ligne');
    screen.getByText('2 changements en attente.');
    screen.getByText('Dernière synchronisation : jamais');
    fireEvent.press(screen.getByText('Synchroniser maintenant'));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('désactive le bouton pendant une synchronisation', () => {
    const onSync = jest.fn();
    const screen = render(
      <SyncStatusCard
        lastSyncAt={1}
        message="Synchronisation…"
        networkState={{ isConnected: false, isInternetReachable: false }}
        onSync={onSync}
        pendingCount={1}
        phase="syncing"
      />,
    );

    screen.getByText('● Hors ligne');
    fireEvent.press(screen.getByRole('button'));
    expect(onSync).not.toHaveBeenCalled();
  });
});
