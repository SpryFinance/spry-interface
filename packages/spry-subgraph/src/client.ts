// A thin GraphQL-over-fetch client for the Spry subgraph.
//
// Returns `data` whenever the response includes it (GraphQL partial-data
// semantics: a subgraph with indexing warnings can still answer schema/_meta
// queries with data alongside an `errors` array). Throws only when there is no
// data, surfacing the error messages (e.g. "indexing_error").

import { requireSpryConfig } from '@spry/config';

export interface GraphQLError {
  message: string;
}

export interface GraphClientOptions {
  /** Injected fetch (defaults to the global). Pass a fake in tests. */
  fetchFn?: typeof fetch;
  /** Extra headers (e.g. auth) merged into the request. */
  headers?: Record<string, string>;
}

export interface SpryGraphClient {
  url: string;
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

export function createSpryGraphClient(url: string, opts: GraphClientOptions = {}): SpryGraphClient {
  const doFetch = opts.fetchFn ?? globalThis.fetch;
  if (!doFetch) throw new Error('no fetch available; pass opts.fetchFn');

  return {
    url,
    async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
      const json = (await res.json()) as { data?: T | null; errors?: GraphQLError[] };
      if (json.data === undefined || json.data === null) {
        const reason = json.errors?.map((e) => e.message).join('; ') || 'no data returned';
        throw new Error(`subgraph error: ${reason}`);
      }
      return json.data;
    },
  };
}

/**
 * Create a client for a chain's configured subgraph endpoint. Throws if the
 * chain has no `subgraphUrl` set.
 */
export function createSpryGraphClientForChain(chainId: number, opts?: GraphClientOptions): SpryGraphClient {
  const config = requireSpryConfig(chainId);
  if (!config.subgraphUrl) {
    throw new Error(`no subgraph endpoint configured for chainId ${chainId}`);
  }
  return createSpryGraphClient(config.subgraphUrl, opts);
}
