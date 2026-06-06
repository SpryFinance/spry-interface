// @spry/subgraph - the Spry subgraph data layer.
//
// Typed GraphQL queries (brief section 13) + a thin fetch client for the
// Spry-specific fields/entities. Every indexed pool is already a Spry pool, so
// subgraph-fed views need no hook filtering. Values arrive as strings; render
// fees via @spry/fee helpers. Execution still prices through the V4Quoter, not
// the subgraph (the subgraph is for history/aggregates/analytics).

export * from './client';
export * from './queries';
export * from './types';
export * from './api';
