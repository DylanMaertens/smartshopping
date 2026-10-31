import React from 'react';
import { AccessibilityInfo, Animated, AppState, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MotionProvider, MotionView, useReducedMotion } from './motion';
import { Pressable } from './ui';

jest.mock('@/services/storage/personalSettings', () => ({
  THEME_STORAGE_KEY: 'appearance.theme.v1',
  PersonalSettings: { getString: jest.fn(), setString: jest.fn() },
}));

let change: (value: boolean) => void;
const remove = jest.fn();
const stop = jest.fn();
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    change = listener as (value: boolean) => void;
    return { remove };
  });
  jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it('animates a page change without remounting its content, then stops for reduced motion', async () => {
  const unmounted = jest.fn();
  function Content() { React.useEffect(() => unmounted, []); return <Text>Brouillon conservé</Text>; }
  const tree = (page: string) => <MotionProvider><MotionView replayKey={page}><Content /></MotionView></MotionProvider>;
  const screen = render(tree('produit'));
  await act(async () => {});
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    duration: 280, useNativeDriver: true, isInteraction: false,
  }));
  jest.mocked(Animated.timing).mockClear();
  screen.rerender(tree('dictée'));
  expect(Animated.timing).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  act(() => change(true));
  expect(stop).toHaveBeenCalled();
  jest.mocked(Animated.timing).mockClear();
  screen.rerender(tree('scanner'));
  expect(Animated.timing).not.toHaveBeenCalled();
  screen.unmount();
  expect(remove).toHaveBeenCalled();
});

it('keeps a newer accessibility event when the initial query resolves late', async () => {
  let resolve!: (value: boolean) => void;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise((done) => { resolve = done; }));
  function Preference() { return <Text>{useReducedMotion() ? 'réduit' : 'animé'}</Text>; }
  const screen = render(<MotionProvider><Preference /></MotionProvider>);
  expect(screen.getByText('réduit')).toBeTruthy();
  act(() => change(true));
  await act(async () => resolve(false));
  expect(screen.getByText('réduit')).toBeTruthy();
});

it('does not delay actions or lose press handlers, roles and disabled behavior', async () => {
  const press = jest.fn(), pressIn = jest.fn(), pressOut = jest.fn();
  const tree = (disabled = false) => <MotionProvider><Pressable accessibilityRole="checkbox"
    accessibilityState={{ checked: false }} accessibilityLabel="Cocher"
    disabled={disabled} onPress={press} onPressIn={pressIn} onPressOut={pressOut}
    style={({ pressed }) => ({ borderWidth: pressed ? 2 : 1 })}><Text>Article</Text></Pressable></MotionProvider>;
  const screen = render(tree());
  await act(async () => {});
  const button = screen.getByRole('checkbox');
  fireEvent(button, 'pressIn', {});
  fireEvent.press(button);
  expect(press).toHaveBeenCalledTimes(1);
  expect(pressIn).toHaveBeenCalledTimes(1);
  fireEvent(button, 'pressOut', {});
  expect(pressOut).toHaveBeenCalledTimes(1);
  screen.rerender(tree(true));
  fireEvent.press(screen.getByRole('checkbox'));
  expect(press).toHaveBeenCalledTimes(1);
});

it('keeps animations disabled when reading the system preference fails', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error('unavailable'));
  render(<MotionProvider><MotionView><Text>Visible</Text></MotionView></MotionProvider>);
  await act(async () => {});
  expect(Animated.timing).not.toHaveBeenCalled();
});

it('refreshes the system preference when returning from Android settings', async () => {
  let foreground!: (value: string) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    foreground = callback as (value: string) => void;
    return { remove: jest.fn() };
  });
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(true).mockResolvedValue(false);
  function Preference() { return <Text>{useReducedMotion() ? 'réduit' : 'animé'}</Text>; }
  const screen = render(<MotionProvider><Preference /></MotionProvider>);
  await act(async () => {});
  screen.getByText('réduit');
  await act(async () => foreground('active'));
  screen.getByText('animé');
});
