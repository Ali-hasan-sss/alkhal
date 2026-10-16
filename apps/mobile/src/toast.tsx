import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

export type ToastKind = 'error' | 'success';

type ToastFn = (text: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-20);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    opacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(-20, { duration: 180 });
    timer.current = setTimeout(() => setToast(null), 200);
  }, [clearTimer, opacity, translateY]);

  const show = useCallback<ToastFn>(
    (text, kind = 'error') => {
      clearTimer();
      setToast({ text, kind });
      opacity.value = 0;
      translateY.value = -20;
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 200 });
      timer.current = setTimeout(hide, 3800);
    },
    [clearTimer, hide, opacity, translateY],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }, anim]}>
          <Pressable
            onPress={hide}
            style={[styles.toast, toast.kind === 'success' ? styles.ok : styles.err]}
          >
            <Text style={styles.text}>{toast.text}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 200,
    elevation: 200,
  },
  toast: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  err: { backgroundColor: '#fef2f2', borderColor: colors.danger },
  ok: { backgroundColor: '#ecfdf5', borderColor: colors.ok },
  text: {
    color: colors.ink,
    fontWeight: '800',
    textAlign: 'right',
    fontSize: 15,
  },
});
