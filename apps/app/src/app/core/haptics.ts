import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

export const haptic = {
  tap: () => native && Haptics.impact({ style: ImpactStyle.Light }),
  success: () => native && Haptics.notification({ type: NotificationType.Success }),
  error: () => native && Haptics.notification({ type: NotificationType.Error }),
};
