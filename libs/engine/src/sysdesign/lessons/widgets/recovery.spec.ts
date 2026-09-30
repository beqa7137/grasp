import { describe, expect, it } from 'vitest';
import { recovery } from './recovery.js';

const db = { sizeGB: 2000, restoreGBPerMin: 10, archiveEverySec: 60, replaySpeed: 10, lagSec: 5 };

describe('recovery', () => {
  it('loses up to a day with nightly backups, a minute with log archiving, and seconds with a standby', () => {
    expect(recovery('nightly', 'hardware', db)).toMatchObject({ recovers: true, rpoSec: 86_400, rtoMin: 200 });
    expect(recovery('pitr', 'hardware', db)).toMatchObject({ recovers: true, rpoSec: 60, rtoMin: 344 });
    expect(recovery('standby', 'hardware', db)).toMatchObject({ recovers: true, rpoSec: 5, rtoMin: 1 });
  });

  it('cannot undo a bad delete with a standby, which copies it, but point-in-time recovery stops just before it', () => {
    expect(recovery('standby', 'delete', db).recovers).toBe(false);
    expect(recovery('pitr', 'delete', db)).toMatchObject({ recovers: true, rpoSec: 0 });
  });
});
