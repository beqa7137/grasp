import { parseClockTime, upcomingTimes } from './reminder-times';

describe('reminder times', () => {
  it('parses 24-hour clock times and rejects anything else', () => {
    expect(parseClockTime('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseClockTime('23:59')).toEqual({ hour: 23, minute: 59 });
    for (const bad of ['24:00', '7:05', '12:60', '', 'noon']) expect(parseClockTime(bad)).toBeNull();
  });

  it('starts today when the time is still ahead, tomorrow otherwise', () => {
    const morning = new Date(2026, 8, 23, 8, 0);
    expect(upcomingTimes(morning, '19:00', 3).map((d) => [d.getDate(), d.getHours()])).toEqual([
      [23, 19],
      [24, 19],
      [25, 19],
    ]);
    const evening = new Date(2026, 8, 23, 19, 0, 30);
    expect(upcomingTimes(evening, '19:00', 2).map((d) => d.getDate())).toEqual([24, 25]);
  });

  it('keeps the local clock time across month ends', () => {
    const times = upcomingTimes(new Date(2026, 9, 30, 12, 0), '08:30', 4);
    expect(times.map((d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`)).toEqual([
      '10/31 8:30',
      '11/1 8:30',
      '11/2 8:30',
      '11/3 8:30',
    ]);
  });
});
