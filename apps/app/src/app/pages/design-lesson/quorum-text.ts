import { fontMeasure, type Part as StagePart, type RoleSpec } from './stage-text';

/** The stage's type roles, as `quorum-widget.component.scss` sets them. */
export type Role = 'label' | 'cap' | 'capB' | 'small' | 'smallB' | 'mono' | 'name' | 'nameS' | 'head' | 'pill';

const ROLES: Record<Role, RoleSpec> = {
  label: { font: 'w600', size: 11, track: 0.12, upper: true },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
  mono: { font: 'mono', size: 11 },
  name: { font: 'mono', size: 15 },
  nameS: { font: 'mono', size: 13 },
  head: { font: 'mono', size: 17 },
  pill: { font: 'w600', size: 13 },
};

const TEXT = fontMeasure(ROLES);

export const roleSize = TEXT.size;
/** A text's width in px, rounded up a pixel, as the stage draws it in `role`. */
export const tw = TEXT.tw;
export type Part = StagePart<Role>;
export const partsWidth = TEXT.partsWidth;
/** Breaks `text` at spaces into lines no wider than `width`; a single word wider than it keeps its own line. */
export const wrap = (text: string, role: Role, width: number) => TEXT.wrap(text, role, width);
