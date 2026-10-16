/** Query parameters as the router gives them: a key given more than once arrives as a list. */
export type UrlParams = Readonly<Record<string, string | readonly string[] | null | undefined>>;

/** A parameter's text, a repeated key's values joined, so `?q=a&q=b` never reaches a string method as a list. */
export const paramText = (params: UrlParams, key: string, separator: string): string => {
  const value = params[key];
  return typeof value === 'string' ? value : value ? value.join(separator) : '';
};

/** The values of a comma-list parameter, from every occurrence of its key. */
export const paramValues = (params: UrlParams, key: string): ReadonlySet<string> => new Set(paramText(params, key, ',').split(','));
