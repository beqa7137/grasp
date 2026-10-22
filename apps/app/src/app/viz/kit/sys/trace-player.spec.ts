import { shares } from './trace-player';

describe('shares', () => {
  it('places each mark at its share of the length along the path', () => {
    expect(
      shares(
        [
          [0, 0],
          [30, 0],
          [30, 10],
          [30, 40],
        ],
        [0, 1, 3],
      ),
    ).toEqual([0, 30 / 70, 1]);
  });
});
