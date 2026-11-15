# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `@workerstack/utils/lru-cache`: `LruCache`, a size-bound LRU cache with a soft TTL, an optional hard TTL for stale-while-revalidate (`getWithMeta`), and `setAt` for a copy read earlier from another tier.
- `@workerstack/utils/tiered-cache`: `TieredCache`, a memory, KV and source cache on one TTL preset (`CACHE_PRESETS`), with background revalidation, a per-request bypass (`asksBypass`) and a trace for `Cache-Status` and `Age`.
