export interface YamlLink {
  slug: string;
  url: string;
  domain: string;
  title?: string;
  tags?: string[];
}

export interface YamlConfig {
  links: YamlLink[];
}

export interface ShortioLink {
  id: string;
  originalURL: string;
  path: string;
  domain: string;
  domainId: number;
  title?: string;
  tags?: string[];
}

export interface ShortioCreateLink {
  originalURL: string;
  domain: string;
  path: string;
  title?: string;
  tags?: string[];
}

export interface ShortioUpdateLink {
  originalURL?: string;
  path?: string;
  title?: string;
  tags?: string[];
}

export interface ShortioDomain {
  id: number;
  hostname: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface LinkDiff {
  toCreate: YamlLink[];
  toUpdate: Array<{ yaml: YamlLink; existing: ShortioLink }>;
  toDelete: ShortioLink[];
}

export type LinkKey = string;

export function getLinkKey(domain: string, slug: string): LinkKey {
  return `${domain}/${slug}`;
}
