import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export const NATIVE_PLATFORM = new InjectionToken<boolean>('native platform', { factory: () => Capacitor.isNativePlatform() });
