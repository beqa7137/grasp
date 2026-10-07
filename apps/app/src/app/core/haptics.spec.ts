import { hapticsFor } from './haptics';

function fakeApi(calls: string[]) {
  const record = (name: string) => async () => void calls.push(name);
  return {
    impact: record('impact'),
    notification: record('notification'),
    selectionStart: record('selectionStart'),
    selectionChanged: record('selectionChanged'),
    selectionEnd: record('selectionEnd'),
  };
}

describe('haptics', () => {
  it('runs a selection from its start to its end on a device', async () => {
    const calls: string[] = [];
    const haptic = hapticsFor(true, fakeApi(calls));
    await haptic.selectStart();
    await haptic.select();
    await haptic.selectEnd();
    expect(calls).toEqual(['selectionStart', 'selectionChanged', 'selectionEnd']);
  });

  it('does nothing on the web', () => {
    const calls: string[] = [];
    const haptic = hapticsFor(false, fakeApi(calls));
    for (const feedback of Object.values(haptic)) expect(feedback()).toBe(false);
    expect(calls).toEqual([]);
  });
});
