import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeDiff, executeSync, formatSummary, resetDomainCache } from './sync.js';
import type { YamlConfig, ShortioLink, LinkDiff } from './types.js';
import { MANAGED_TAG } from './types.js';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@short.io/client-node', () => ({
  listDomains: vi.fn(),
  listLinks: vi.fn(),
  createLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
}));

import {
  listDomains,
  listLinks,
  createLink,
  updateLink,
  deleteLink,
} from '@short.io/client-node';

const mockListDomains = vi.mocked(listDomains);
const mockListLinks = vi.mocked(listLinks);
const mockCreateLink = vi.mocked(createLink);
const mockUpdateLink = vi.mocked(updateLink);
const mockDeleteLink = vi.mocked(deleteLink);

const mockRequest = new Request('https://api.short.io');
const mockResponse = new Response();

function successResult<T>(data: T) {
  return {
    data,
    error: undefined,
    request: mockRequest,
    response: mockResponse,
  };
}

function errorResult<T>(error: T) {
  return {
    data: undefined,
    error,
    request: mockRequest,
    response: mockResponse,
  };
}

/** Configure mocks so fetchAllLinks returns the provided ShortioLink[] for any domain */
function setupMockLinks(existingLinks: ShortioLink[]): void {
  mockListDomains.mockResolvedValue(successResult(
    // Derive unique domains from provided links
    [...new Set(existingLinks.map(l => l.domain))].map(hostname => ({
      id: existingLinks.find(l => l.domain === hostname)!.domainId,
      hostname,
      unicodeHostname: hostname,
      state: 'configured' as const,
      createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false,
      linkType: 'random' as const, cloaking: false, hideVisitorIp: false,
      enableAI: false, httpsLevel: 'none' as const, httpsLinks: false,
      clientStorage: {}, caseSensitive: false, incrementCounter: '',
      robots: 'allow' as const, exportEnabled: false,
      enableConversionTracking: false, qrScanTracking: false, isFavorite: false,
    }))
  ));

  mockListLinks.mockResolvedValue(successResult({
    count: existingLinks.length,
    links: existingLinks.map(l => ({
      idString: l.id,
      id: l.id,
      originalURL: l.originalURL,
      path: l.path,
      title: l.title,
      tags: l.tags,
      shortURL: '',
      secureShortURL: '',
    })),
  }));
}

function makeConfig(domain: string, links: Record<string, { url: string; title?: string; tags?: string[] }>): YamlConfig {
  return {
    documents: [{ domain, links }],
  };
}

describe('computeDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDomainCache();
  });

  it('identifies links to create', async () => {
    const config = makeConfig('short.io', {
      'new-link': { url: 'https://example.com' },
    });
    setupMockLinks([]);
    // Need to provide a domain for listDomains since there are no existing links
    mockListDomains.mockResolvedValue(successResult([
      { id: 1, hostname: 'short.io', unicodeHostname: 'short.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
    ]));
    const diff = await computeDiff(config);

    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCreate[0].slug).toBe('new-link');
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });

  it('identifies links to delete only if managed', async () => {
    const config = makeConfig('short.io', {
      'keep-link': { url: 'https://keep.com' },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://keep.com', path: 'keep-link', domain: 'short.io', domainId: 1 },
      { id: '2', originalURL: 'https://old.com', path: 'old-link', domain: 'short.io', domainId: 1, tags: [MANAGED_TAG] },
      { id: '3', originalURL: 'https://unmanaged.com', path: 'unmanaged-link', domain: 'short.io', domainId: 1 },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    // Only the managed link should be deleted, unmanaged link is ignored
    expect(diff.toDelete).toHaveLength(1);
    expect(diff.toDelete[0].path).toBe('old-link');
  });

  it('identifies links to update when URL changes', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://new-url.com' },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://old-url.com', path: 'my-link', domain: 'short.io', domainId: 1 },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].yaml.url).toBe('https://new-url.com');
    expect(diff.toDelete).toHaveLength(0);
  });

  it('identifies links to update when title changes', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com', title: 'New Title' },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, title: 'Old Title' },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].yaml.title).toBe('New Title');
  });

  it('identifies links to update when title is removed', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com' },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, title: 'Old Title' },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].yaml.title).toBeUndefined();
  });

  it('identifies links to update when tags change', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com', tags: ['new-tag'] },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, tags: ['old-tag'] },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].yaml.tags).toEqual(['new-tag']);
  });

  it('identifies links to update when tags are removed', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com' },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, tags: ['old-tag'] },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].yaml.tags).toBeUndefined();
  });

  it('does not flag update when link is unchanged', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com', title: 'Same Title', tags: ['tag1'] },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, title: 'Same Title', tags: ['tag1'] },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });

  it('treats undefined and empty string title as equivalent', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com' },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, title: '' },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toUpdate).toHaveLength(0);
  });

  it('handles tag order differences correctly', async () => {
    const config = makeConfig('short.io', {
      'my-link': { url: 'https://example.com', tags: ['b', 'a'] },
    });
    const existingLinks: ShortioLink[] = [
      { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, tags: ['a', 'b'] },
    ];
    setupMockLinks(existingLinks);
    const diff = await computeDiff(config);

    expect(diff.toUpdate).toHaveLength(0);
  });

  it('handles multiple documents', async () => {
    const config: YamlConfig = {
      documents: [
        { domain: 'first.io', links: { 'link1': { url: 'https://first.com' } } },
        { domain: 'second.io', links: { 'link2': { url: 'https://second.com' } } },
      ],
    };
    mockListDomains.mockResolvedValue(successResult([
      { id: 1, hostname: 'first.io', unicodeHostname: 'first.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
      { id: 2, hostname: 'second.io', unicodeHostname: 'second.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
    ]));
    mockListLinks.mockResolvedValue(successResult({
      count: 0,
      links: [],
    }));
    const diff = await computeDiff(config);

    expect(diff.toCreate).toHaveLength(2);
    expect(diff.toCreate.map(l => l.domain)).toContain('first.io');
    expect(diff.toCreate.map(l => l.domain)).toContain('second.io');
  });
});

describe('executeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDomainCache();
    mockCreateLink.mockResolvedValue(successResult({
      idString: 'new', id: 'new', originalURL: '', path: '', shortURL: '', secureShortURL: '',
    }));
    mockUpdateLink.mockResolvedValue(successResult({
      idString: '1', id: '1', originalURL: '', path: '', shortURL: '', secureShortURL: '',
    }));
    mockDeleteLink.mockResolvedValue(successResult({ success: true }));
  });

  it('creates links with managed tag', async () => {
    const diff: LinkDiff = {
      toCreate: [{ slug: 'new-link', url: 'https://example.com', domain: 'short.io' }],
      toUpdate: [],
      toDelete: [],
    };
    const result = await executeSync(diff, false);

    expect(mockCreateLink).toHaveBeenCalledWith({
      body: expect.objectContaining({
        originalURL: 'https://example.com',
        domain: 'short.io',
        path: 'new-link',
        tags: [MANAGED_TAG],
      }),
    });
    expect(result.created).toBe(1);
  });

  it('updates links adding managed tag when title/tags removed', async () => {
    const diff: LinkDiff = {
      toCreate: [],
      toUpdate: [{
        yaml: { slug: 'my-link', url: 'https://example.com', domain: 'short.io' },
        existing: { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, title: 'Old', tags: ['old'] },
      }],
      toDelete: [],
    };
    const result = await executeSync(diff, false);

    expect(mockUpdateLink).toHaveBeenCalledWith({
      path: { linkId: '1' },
      body: expect.objectContaining({
        originalURL: 'https://example.com',
        tags: [MANAGED_TAG],
      }),
    });
    expect(result.updated).toBe(1);
  });

  it('updates links preserving title/tags and adding managed tag', async () => {
    const diff: LinkDiff = {
      toCreate: [],
      toUpdate: [{
        yaml: { slug: 'my-link', url: 'https://example.com', domain: 'short.io', title: 'New Title', tags: ['new'] },
        existing: { id: '1', originalURL: 'https://example.com', path: 'my-link', domain: 'short.io', domainId: 1, title: 'Old', tags: ['old'] },
      }],
      toDelete: [],
    };
    const result = await executeSync(diff, false);

    expect(mockUpdateLink).toHaveBeenCalledWith({
      path: { linkId: '1' },
      body: expect.objectContaining({
        originalURL: 'https://example.com',
        title: 'New Title',
        tags: ['new', MANAGED_TAG],
      }),
    });
    expect(result.updated).toBe(1);
  });

  it('deletes links', async () => {
    const diff: LinkDiff = {
      toCreate: [],
      toUpdate: [],
      toDelete: [{ id: '1', originalURL: 'https://old.com', path: 'old-link', domain: 'short.io', domainId: 1 }],
    };
    const result = await executeSync(diff, false);

    expect(mockDeleteLink).toHaveBeenCalledWith({
      path: { link_id: '1' },
    });
    expect(result.deleted).toBe(1);
  });

  it('does not make changes in dry run mode', async () => {
    const diff: LinkDiff = {
      toCreate: [{ slug: 'new-link', url: 'https://example.com', domain: 'short.io' }],
      toUpdate: [{
        yaml: { slug: 'my-link', url: 'https://new.com', domain: 'short.io' },
        existing: { id: '1', originalURL: 'https://old.com', path: 'my-link', domain: 'short.io', domainId: 1 },
      }],
      toDelete: [{ id: '2', originalURL: 'https://delete.com', path: 'old-link', domain: 'short.io', domainId: 1 }],
    };
    const result = await executeSync(diff, true);

    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(mockUpdateLink).not.toHaveBeenCalled();
    expect(mockDeleteLink).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.deleted).toBe(1);
  });

  it('handles create errors gracefully', async () => {
    const diff: LinkDiff = {
      toCreate: [{ slug: 'new-link', url: 'https://example.com', domain: 'short.io' }],
      toUpdate: [],
      toDelete: [],
    };
    mockCreateLink.mockResolvedValue(errorResult({ message: 'API Error', statusCode: 500 }));
    const result = await executeSync(diff, false);

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Failed to create');
  });
});

describe('formatSummary', () => {
  it('formats normal sync summary', () => {
    const result = {
      created: 5,
      updated: 3,
      deleted: 2,
      errors: [],
    };
    const summary = formatSummary(result, false);

    expect(summary).toContain('Sync completed');
    expect(summary).toContain('Created: 5');
    expect(summary).toContain('Updated: 3');
    expect(summary).toContain('Deleted: 2');
    expect(summary).not.toContain('DRY RUN');
  });

  it('formats dry run summary', () => {
    const result = {
      created: 1,
      updated: 1,
      deleted: 1,
      errors: [],
    };
    const summary = formatSummary(result, true);

    expect(summary).toContain('[DRY RUN]');
  });

  it('includes error count when present', () => {
    const result = {
      created: 1,
      updated: 0,
      deleted: 0,
      errors: ['Error 1', 'Error 2'],
    };
    const summary = formatSummary(result, false);

    expect(summary).toContain('Errors: 2');
  });
});
