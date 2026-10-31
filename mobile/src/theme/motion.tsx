import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, type ViewProps } from 'react-native';

// Fail closed until the system preference is known. One listener for the app,
// not one per article. A late initial query must not override a newer event.
type MotionStatus = 'checking' | 'enabled' | 'reduced' | 'unavailable';
const ReducedMotion = createContext<MotionStatus>('checking');
export function MotionProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<MotionStatus>('checking');
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = () => {
      const current = ++revision;
      void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
        if (active && revision === current) setStatus(value ? 'reduced' : 'enabled');
      }).catch(() => { if (active && revision === current) setStatus('unavailable'); });
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      revision++;
      if (active) setStatus(value ? 'reduced' : 'enabled');
    });
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    refresh();
    return () => { active = false; subscription.remove(); foreground.remove(); };
  }, []);
  return <ReducedMotion.Provider value={status}>{children}</ReducedMotion.Provider>;
}
export const useMotionStatus = () => useContext(ReducedMotion);
export const useReducedMotion = () => useMotionStatus() !== 'enabled';

export function useMotionValue(target: number, duration: number, replayKey?: string | number | boolean) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(!reduced && replayKey !== undefined ? 0.25 : target)).current;
  useEffect(() => {
    value.stopAnimation();
    if (reduced) { value.setValue(target); return; }
    if (replayKey !== undefined) value.setValue(0.25);
    const animation = Animated.timing(value, {
      toValue: target, duration, easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [value, reduced, target, duration, replayKey]);
  return value;
}

// No key/remount, layout animation, delayed action, or outgoing screen kept alive:
// camera/microphone stop immediately and drafts, scroll and focus stay owned by
// their existing components. The modal's opaque background is never faded.
export function MotionView({ replayKey = 'enter', style, ...props }: ViewProps & {
  replayKey?: string | number | boolean;
}) {
  const opacity = useMotionValue(1, 280, replayKey);
  const reduced = useReducedMotion();
  return <Animated.View {...props} style={[style, { opacity: reduced ? 1 : opacity }]} />;
}
