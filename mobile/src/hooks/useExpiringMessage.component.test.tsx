import { act, renderHook } from '@testing-library/react-native';
import { useExpiringMessage } from './useExpiringMessage';

it('expires after 2.5 seconds from the latest occurrence, including identical messages', () => {
  jest.useFakeTimers();
  try {
    const { result, unmount } = renderHook(() => useExpiringMessage());
    act(() => result.current[1]('Pain ajouté'));
    act(() => jest.advanceTimersByTime(2000));
    act(() => result.current[1]('Pain ajouté'));
    act(() => jest.advanceTimersByTime(2499));
    expect(result.current[0]).toBe('Pain ajouté');
    act(() => jest.advanceTimersByTime(1));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]('Lait ajouté'));
    const lateResult = result.current[1];
    unmount();
    lateResult('Réponse tardive');
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
