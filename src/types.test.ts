import { describe, it, expect } from 'vitest';
import { getLinkKey, getLinksArray } from './types.js';
import type { YamlConfig } from './types.js';

describe('getLinkKey', () => {
  it('creates correct key from domain and slug', () => {
    expect(getLinkKey('example.com', 'my-slug')).toBe('example.com/my-slug');
  });

  it('handles empty slug', () => {
    expect(getLinkKey('example.com', '')).toBe('example.com/');
  });

  it('handles special characters', () => {
    expect(getLinkKey('sub.domain.com', 'path/to/resource')).toBe('sub.domain.com/path/to/resource');
  });
});

describe('getLinksArray', () => {
  it('converts map to array with slugs', () => {
    const config: YamlConfig = {
      links: {
        'link-a': { url: 'https://a.com', domain: 'short.io' },
        'link-b': { url: 'https://b.com', domain: 'short.io', title: 'Link B' },
      },
    };
    const links = getLinksArray(config);
    expect(links).toHaveLength(2);
    expect(links).toContainEqual({
      slug: 'link-a',
      url: 'https://a.com',
      domain: 'short.io',
      title: undefined,
      tags: undefined,
    });
    expect(links).toContainEqual({
      slug: 'link-b',
      url: 'https://b.com',
      domain: 'short.io',
      title: 'Link B',
      tags: undefined,
    });
  });

  it('returns empty array for empty links', () => {
    const config: YamlConfig = { links: {} };
    const links = getLinksArray(config);
    expect(links).toEqual([]);
  });

  it('preserves tags', () => {
    const config: YamlConfig = {
      links: {
        'tagged-link': {
          url: 'https://example.com',
          domain: 'short.io',
          tags: ['tag1', 'tag2'],
        },
      },
    };
    const links = getLinksArray(config);
    expect(links[0].tags).toEqual(['tag1', 'tag2']);
  });

  it('applies top-level domain when link domain is not specified', () => {
    const config: YamlConfig = {
      domain: 'default.io',
      links: {
        'link-a': { url: 'https://a.com' },
        'link-b': { url: 'https://b.com' },
      },
    };
    const links = getLinksArray(config);
    expect(links).toHaveLength(2);
    expect(links[0].domain).toBe('default.io');
    expect(links[1].domain).toBe('default.io');
  });

  it('allows per-link domain to override top-level domain', () => {
    const config: YamlConfig = {
      domain: 'default.io',
      links: {
        'link-a': { url: 'https://a.com' },
        'link-b': { url: 'https://b.com', domain: 'custom.io' },
      },
    };
    const links = getLinksArray(config);
    expect(links).toHaveLength(2);
    const linkA = links.find(l => l.slug === 'link-a');
    const linkB = links.find(l => l.slug === 'link-b');
    expect(linkA?.domain).toBe('default.io');
    expect(linkB?.domain).toBe('custom.io');
  });
});
