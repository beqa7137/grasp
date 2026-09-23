import type { CapacitorConfig } from '@capacitor/cli';

const release = process.env['GRASP_RELEASE'] === '1';

const config: CapacitorConfig = {
  appId: 'dev.grasp.app',
  appName: 'Grasp',
  webDir: 'dist/app/browser',
  backgroundColor: '#0b0d12',
  ios: { contentInset: 'always' },
  // Dev builds talk to a local http API; release builds should use an https API.
  server: release ? undefined : { androidScheme: 'http', cleartext: true },
};

export default config;
