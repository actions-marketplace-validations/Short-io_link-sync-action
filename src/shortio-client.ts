import type {
  ShortioLink,
  ShortioCreateLink,
  ShortioUpdateLink,
  ShortioDomain,
} from './types.js';

const BASE_URL = 'https://api.short.io';

export class ShortioApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ShortioApiError';
  }
}

export class ShortioClient {
  private apiKey: string;
  private domainCache: Map<string, number> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new ShortioApiError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return response.json() as Promise<T>;
  }

  async getDomains(): Promise<ShortioDomain[]> {
    const response = await this.request<ShortioDomain[]>('/api/domains');
    for (const domain of response) {
      this.domainCache.set(domain.hostname, domain.id);
    }
    return response;
  }

  async getDomainId(hostname: string): Promise<number> {
    if (this.domainCache.has(hostname)) {
      return this.domainCache.get(hostname)!;
    }
    await this.getDomains();
    const id = this.domainCache.get(hostname);
    if (!id) {
      throw new ShortioApiError(`Domain not found: ${hostname}`, 404);
    }
    return id;
  }

  async getLinks(domain: string): Promise<ShortioLink[]> {
    const domainId = await this.getDomainId(domain);
    const links: ShortioLink[] = [];
    let beforeId: string | undefined;

    while (true) {
      const params = new URLSearchParams({ domain_id: String(domainId), limit: '150' });
      if (beforeId) {
        params.set('beforeId', beforeId);
      }

      const response = await this.request<{ links: ShortioLink[] }>(
        `/api/links?${params.toString()}`
      );

      if (response.links.length === 0) {
        break;
      }

      for (const link of response.links) {
        links.push({
          id: link.id,
          originalURL: link.originalURL,
          path: link.path,
          domain: domain,
          domainId: domainId,
          title: link.title,
          tags: link.tags,
        });
      }

      if (response.links.length < 150) {
        break;
      }

      beforeId = response.links[response.links.length - 1].id;
    }

    return links;
  }

  async createLink(link: ShortioCreateLink): Promise<ShortioLink> {
    const response = await this.request<ShortioLink>('/links', {
      method: 'POST',
      body: JSON.stringify({
        originalURL: link.originalURL,
        domain: link.domain,
        path: link.path,
        title: link.title,
        tags: link.tags,
      }),
    });
    return response;
  }

  async createLinksBulk(links: ShortioCreateLink[]): Promise<ShortioLink[]> {
    if (links.length === 0) return [];

    const results: ShortioLink[] = [];
    const batchSize = 1000;

    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize);
      const response = await this.request<ShortioLink[]>('/links/bulk', {
        method: 'POST',
        body: JSON.stringify(
          batch.map((link) => ({
            originalURL: link.originalURL,
            domain: link.domain,
            path: link.path,
            title: link.title,
            tags: link.tags,
          }))
        ),
      });
      results.push(...response);
    }

    return results;
  }

  async updateLink(linkId: string, update: ShortioUpdateLink): Promise<ShortioLink> {
    const response = await this.request<ShortioLink>(`/links/${linkId}`, {
      method: 'POST',
      body: JSON.stringify(update),
    });
    return response;
  }

  async deleteLink(linkId: string): Promise<void> {
    await this.request(`/links/${linkId}`, {
      method: 'DELETE',
    });
  }

  async deleteLinksBulk(linkIds: string[]): Promise<void> {
    if (linkIds.length === 0) return;

    const batchSize = 150;

    for (let i = 0; i < linkIds.length; i += batchSize) {
      const batch = linkIds.slice(i, i + batchSize);
      await this.request('/links/delete_bulk', {
        method: 'DELETE',
        body: JSON.stringify({ link_ids: batch }),
      });
    }
  }
}
