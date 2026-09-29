import { edgePath } from './edge-path';

const SIZE = { w: 132, h: 70 };

describe('design board edges', () => {
  it('curves from the right side to the left side when the target is to the right', () => {
    expect(edgePath({ x: 100, y: 240 }, { x: 300, y: 240 }, SIZE, 480)).toBe('M 166 240 C 206 240, 194 240, 234 240');
  });

  it('joins facing top and bottom when the target is in the same column', () => {
    expect(edgePath({ x: 790, y: 240 }, { x: 790, y: 100 }, SIZE, 480)).toBe('M 790 205 C 790 170, 790 170, 790 135');
    expect(edgePath({ x: 790, y: 100 }, { x: 800, y: 240 }, SIZE, 480)).toMatch(/^M 790 135 C 790 170, 800 170, 800 205$/);
  });

  it('loops under both nodes when the target is to the left, staying on the board', () => {
    expect(edgePath({ x: 790, y: 240 }, { x: 370, y: 240 }, SIZE, 480)).toBe('M 790 275 C 790 325, 370 325, 370 275');
    expect(edgePath({ x: 790, y: 380 }, { x: 370, y: 400 }, SIZE, 480)).toBe('M 790 415 C 790 480, 370 480, 370 435');
  });
});
