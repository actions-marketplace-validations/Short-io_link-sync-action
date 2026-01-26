import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShortioClient, ShortioApiError } from './shortio-client.js';

vi.mock('@short.io/client-node', () => ({
  setApiKey: vi.fn(),
  listDomains: vi.fn(),
  listLinks: vi.fn(),
  createLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
}));

import {
  setApiKey,
  listDomains,
  listLinks,
  createLink,
  updateLink,
  deleteLink,
} from '@short.io/client-node';

const mockSetApiKey = vi.mocked(setApiKey);
const mockListDomains = vi.mocked(listDomains);
const mockListLinks = vi.mocked(listLinks);
const mockCreateLink = vi.mocked(createLink);
const mockUpdateLink = vi.mocked(updateLink);
const mockDeleteLink = vi.mocked(deleteLink);

// Helper to create mock request/response for SDK results
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

describe('ShortioClient', () => {
  let client: ShortioClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ShortioClient('test-api-key');
  });

  it('sets API key on construction', () => {
    expect(mockSetApiKey).toHaveBeenCalledWith('test-api-key');
  });

  describe('getDomains', () => {
    it('fetches domains and caches them', async () => {
      mockListDomains.mockResolvedValueOnce(successResult([
        { id: 1, hostname: 'short.io', unicodeHostname: 'short.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
        { id: 2, hostname: 'example.link', unicodeHostname: 'example.link', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
      ]));

      const result = await client.getDomains();

      expect(result).toEqual([
        { id: 1, hostname: 'short.io' },
        { id: 2, hostname: 'example.link' },
      ]);
      expect(mockListDomains).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDomainId', () => {
    it('returns cached domain id', async () => {
      mockListDomains.mockResolvedValueOnce(successResult([
        { id: 123, hostname: 'short.io', unicodeHostname: 'short.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
      ]));

      const id = await client.getDomainId('short.io');
      expect(id).toBe(123);

      // Second call should use cache
      const id2 = await client.getDomainId('short.io');
      expect(id2).toBe(123);
      expect(mockListDomains).toHaveBeenCalledTimes(1);
    });

    it('throws error for unknown domain', async () => {
      mockListDomains.mockResolvedValueOnce(successResult([
        { id: 1, hostname: 'other.io', unicodeHostname: 'other.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
      ]));

      await expect(client.getDomainId('unknown.io')).rejects.toThrow('Domain not found');
    });
  });

  describe('getLinks', () => {
    it('fetches links for domain', async () => {
      mockListDomains.mockResolvedValueOnce(successResult([
        { id: 1, hostname: 'short.io', unicodeHostname: 'short.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
      ]));
      mockListLinks.mockResolvedValueOnce(successResult({
        count: 1,
        links: [
          { idString: 'link1', id: 'link1', originalURL: 'https://example.com', path: 'test', title: 'Test', tags: ['tag1'], shortURL: '', secureShortURL: '' },
        ],
      }));

      const links = await client.getLinks('short.io');

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        id: 'link1',
        originalURL: 'https://example.com',
        path: 'test',
        domain: 'short.io',
        domainId: 1,
        title: 'Test',
        tags: ['tag1'],
      });
    });

    it('handles pagination', async () => {
      mockListDomains.mockResolvedValueOnce(successResult([
        { id: 1, hostname: 'short.io', unicodeHostname: 'short.io', state: 'configured' as const, createdAt: '', updatedAt: '', hasFavicon: false, hideReferer: false, linkType: 'random' as const, cloaking: false, hideVisitorIp: false, enableAI: false, httpsLevel: 'none' as const, httpsLinks: false, clientStorage: {}, caseSensitive: false, incrementCounter: '', robots: 'allow' as const, exportEnabled: false, enableConversionTracking: false, qrScanTracking: false, isFavorite: false },
      ]));
      mockListLinks
        .mockResolvedValueOnce(successResult({
          count: 151,
          links: Array(150).fill(null).map((_, i) => ({
            idString: `link${i}`,
            id: `link${i}`,
            originalURL: `https://example${i}.com`,
            path: `path${i}`,
            shortURL: '',
            secureShortURL: '',
          })),
          nextPageToken: 'token123',
        }))
        .mockResolvedValueOnce(successResult({
          count: 151,
          links: [
            { idString: 'link150', id: 'link150', originalURL: 'https://example150.com', path: 'path150', shortURL: '', secureShortURL: '' },
          ],
        }));

      const links = await client.getLinks('short.io');
      expect(links).toHaveLength(151);
    });
  });

  describe('createLink', () => {
    it('creates a link', async () => {
      mockCreateLink.mockResolvedValueOnce(successResult({
        idString: 'new-link',
        id: 'new-link',
        originalURL: 'https://example.com',
        path: 'my-path',
        shortURL: '',
        secureShortURL: '',
        DomainId: 1,
      }));

      const result = await client.createLink({
        originalURL: 'https://example.com',
        domain: 'short.io',
        path: 'my-path',
        title: 'My Title',
        tags: ['tag1'],
      });

      expect(result.id).toBe('new-link');
      expect(mockCreateLink).toHaveBeenCalledWith({
        body: {
          originalURL: 'https://example.com',
          domain: 'short.io',
          path: 'my-path',
          title: 'My Title',
          tags: ['tag1'],
        },
      });
    });
  });

  describe('updateLink', () => {
    it('updates a link', async () => {
      mockUpdateLink.mockResolvedValueOnce(successResult({
        idString: '1',
        id: '1',
        originalURL: 'https://new-url.com',
        path: 'test',
        title: 'New Title',
        tags: ['new-tag'],
        shortURL: '',
        secureShortURL: '',
      }));

      await client.updateLink('1', {
        originalURL: 'https://new-url.com',
        title: 'New Title',
        tags: ['new-tag'],
      });

      expect(mockUpdateLink).toHaveBeenCalledWith({
        path: { linkId: '1' },
        body: {
          originalURL: 'https://new-url.com',
          title: 'New Title',
          tags: ['new-tag'],
        },
      });
    });

    it('sends empty values to clear title/tags', async () => {
      mockUpdateLink.mockResolvedValueOnce(successResult({
        idString: '1',
        id: '1',
        originalURL: 'https://example.com',
        path: 'test',
        title: '',
        tags: [],
        shortURL: '',
        secureShortURL: '',
      }));

      await client.updateLink('1', {
        originalURL: 'https://example.com',
        title: '',
        tags: [],
      });

      expect(mockUpdateLink).toHaveBeenCalledWith({
        path: { linkId: '1' },
        body: {
          originalURL: 'https://example.com',
          title: '',
          tags: [],
        },
      });
    });
  });

  describe('deleteLink', () => {
    it('deletes a link', async () => {
      mockDeleteLink.mockResolvedValueOnce(successResult({ success: true }));

      await client.deleteLink('1');

      expect(mockDeleteLink).toHaveBeenCalledWith({
        path: { link_id: '1' },
      });
    });
  });

  describe('error handling', () => {
    it('throws ShortioApiError on API error', async () => {
      mockListDomains.mockResolvedValueOnce(errorResult({ error: 'Unauthorized' }));

      await expect(client.getDomains()).rejects.toThrow(ShortioApiError);
    });

    it('throws ShortioApiError on createLink error', async () => {
      mockCreateLink.mockResolvedValueOnce(errorResult({ message: 'Link already exists', statusCode: 409 }));

      await expect(client.createLink({
        originalURL: 'https://example.com',
        domain: 'short.io',
        path: 'existing',
      })).rejects.toThrow('Failed to create link: Link already exists');
    });
  });
});
