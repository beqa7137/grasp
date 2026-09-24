/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';

const release = process.env['GRASP_RELEASE'] === '1';

const config: CapacitorConfig = {
  appId: 'dev.grasp.app',
  appName: 'Grasp',
  webDir: 'dist/app/browser',
  backgroundColor: '#0b0d12',
  // Dev builds talk to a local http API; release builds should use an https API.
  server: release ? undefined : { androidScheme: 'http', cleartext: true },
  plugins: {
    LocalNotifications: {
      // android/app/src/main/res/drawable/ic_stat_grasp.xml; Android draws status-bar icons as white silhouettes.
      smallIcon: 'ic_stat_grasp',
      iconColor: '#9D8CFF',
    },
  },
};

export default config;
