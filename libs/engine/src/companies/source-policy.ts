/**
 * How the monthly refresh may recheck a publisher's pages: `automated` only where the terms allow scripted access;
 * `manual` pages are opened one at a time, as a reader would, and never fetched by a script.
 */
export type SourceAccess = 'manual' | 'automated';

export interface Publisher {
  name: string;
  hosts: readonly string[];
  access: SourceAccess;
  /** The terms that decided `access`. */
  terms: string;
}

export const PUBLISHERS = {
  geeksforgeeks: {
    name: 'GeeksforGeeks',
    hosts: ['www.geeksforgeeks.org'],
    access: 'manual',
    terms: 'https://www.geeksforgeeks.org/legal/terms-and-conditions/',
  },
  roundz: { name: 'Roundz Newsletter', hosts: ['roundz.substack.com'], access: 'manual', terms: 'https://substack.com/tos' },
  taro: { name: 'Taro', hosts: ['www.jointaro.com'], access: 'manual', terms: 'https://www.jointaro.com/terms/' },
} as const satisfies Record<string, Publisher>;

export type PublisherId = keyof typeof PUBLISHERS;

/**
 * Never a source, whatever the page says: their terms forbid collection or use by a competing product, the content is
 * gated, or the data derives from paid company tags (GitHub's company-wise lists). Every entry matches its subdomains;
 * one ending in `.*` matches its name as any label of the host, so every top-level domain, IDN ones included.
 */
export const DENIED_HOSTS = [
  'leetcode.com',
  'leetcode.cn',
  'glassdoor.*',
  'teamblind.com',
  '1point3acres.com',
  'reddit.com',
  'redd.it',
  'aced.io',
  'tryexponent.com',
  'hellointerview.com',
  'interviewing.io',
  'prachub.com',
  'github.com',
  'githubusercontent.com',
] as const;

const parse = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** A fully qualified name's trailing dot names the same host, so it must not slip past the list. */
const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/\.$/, '');

const matches = (host: string, entry: string) =>
  entry.endsWith('.*') ? host.split('.').includes(entry.slice(0, -2)) : host === entry || host.endsWith(`.${entry}`);

export const hostDenied = (url: string): boolean => {
  const parsed = parse(url);
  return !parsed || DENIED_HOSTS.some((entry) => matches(hostOf(parsed), entry));
};

/** Why a source may not be cited for `publisher`, or null when the policy allows it. */
export function sourceRefusal(url: string, publisher: PublisherId): string | null {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== 'https:') return 'not an https URL';
  if (parsed.username || parsed.password) return 'carries user info';
  if (parsed.port) return 'names a port';
  if (parsed.href !== url) return `not in canonical form (${parsed.href})`;
  const host = hostOf(parsed);
  if (hostDenied(url)) return `${host} is denied by the source policy`;
  if (!(PUBLISHERS[publisher]?.hosts as readonly string[] | undefined)?.includes(parsed.hostname))
    return `${host} is not a host of ${publisher}`;
  return null;
}
