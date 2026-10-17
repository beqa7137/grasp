import { pathOf, tabOf } from '../ui/cross-link.directive';

/** A section of the desktop rail (REDESIGN.md 2.6): one per tab, with its hub's segments as sub-items. */
export interface RailSection {
  tab: string;
  label: string;
  icon: string;
  subs: readonly RailLink[];
}

export interface RailLink {
  label: string;
  href: string;
}

export interface RailUtility extends RailLink {
  icon: string;
}

export const RAIL_SECTIONS: readonly RailSection[] = [
  { tab: 'today', label: 'Today', icon: 'today-outline', subs: [] },
  {
    tab: 'coding',
    label: 'Coding',
    icon: 'code-slash-outline',
    subs: [
      { label: 'Skill map', href: '/coding' },
      { label: 'Problems', href: '/coding/problems' },
      { label: 'Visualizers', href: '/coding/visualizers' },
    ],
  },
  {
    tab: 'design',
    label: 'Design',
    icon: 'git-network-outline',
    subs: [
      { label: 'Topics', href: '/design' },
      { label: 'Missions', href: '/design/missions' },
      { label: 'Cases', href: '/design/cases' },
    ],
  },
  {
    tab: 'behavioral',
    label: 'Behavioral',
    icon: 'people-outline',
    subs: [
      { label: 'Competencies', href: '/behavioral' },
      { label: 'Questions', href: '/behavioral/questions' },
      { label: 'Stories', href: '/behavioral/stories' },
    ],
  },
  { tab: 'mock', label: 'Mock', icon: 'chatbubbles-outline', subs: [] },
];

/** Pages of the Today stack opened from the rail; at most one of them is ever on that stack. */
export const RAIL_UTILITIES: readonly RailUtility[] = [
  { label: 'Study plan', href: '/today/plan', icon: 'document-text-outline' },
  { label: 'Progress', href: '/today/progress', icon: 'progress-glyph' },
  { label: 'Settings', href: '/today/settings', icon: 'settings-outline' },
];

export const isUtility = (path: string) => RAIL_UTILITIES.some((u) => u.href === path);

export interface RailCurrent {
  /** The href of the sub-item or utility whose page is shown, which takes `aria-current="page"`. */
  item: string | null;
  /** The section item's `aria-current`: "page" on the section's own page, "true" anywhere else in the section. */
  section: { tab: string; current: 'page' | 'true' } | null;
}

/**
 * Which rail items are current (REDESIGN.md 2.6). At most one item is the page: a sub-item wins over its section, since
 * both link to the hub's root. Any other page in a section (a case study, or a sub-item's page) marks its section "true".
 * A utility page marks itself only: it lives in the Today stack but is not Today.
 */
export function railCurrent(url: string): RailCurrent {
  const path = pathOf(url);
  if (isUtility(path)) return { item: path, section: null };
  const tab = tabOf(path);
  const section = RAIL_SECTIONS.find((s) => s.tab === tab);
  if (!section) return { item: null, section: null };
  const item = section.subs.find((s) => s.href === path)?.href ?? null;
  return { item, section: { tab, current: !item && path === `/${tab}` ? 'page' : 'true' } };
}
