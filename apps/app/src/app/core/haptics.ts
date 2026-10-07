import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticsApi = Pick<typeof Haptics, 'impact' | 'notification' | 'selectionStart' | 'selectionChanged' | 'selectionEnd'>;

/**
 * Feedback on iOS and Android only. A selection runs from `selectStart` to `selectEnd`: iOS gives no `select` tick outside
 * one, since its plugin makes the feedback generator in `selectionStart`.
 */
export function hapticsFor(native: boolean, api: HapticsApi) {
  return {
    tap: () => native && api.impact({ style: ImpactStyle.Light }),
    success: () => native && api.notification({ type: NotificationType.Success }),
    error: () => native && api.notification({ type: NotificationType.Error }),
    selectStart: () => native && api.selectionStart(),
    select: () => native && api.selectionChanged(),
    selectEnd: () => native && api.selectionEnd(),
  };
}

export const haptic = hapticsFor(Capacitor.isNativePlatform(), Haptics);
