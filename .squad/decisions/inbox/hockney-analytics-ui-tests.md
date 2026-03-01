# Decision: Shared Analytics UI Tests in Portal Project

**Date:** 2025-02-28  
**Author:** Hockney (Tester)  
**Status:** Implemented  

## Context

The shared analytics UI components (`AnalyticsSummary`, `AnalyticsPage`, `TimeseriesCharts`, `ModelBreakdown`, `TenantSelector`) are in `shared/analytics/` but need unit tests. The `shared/` directory has no `package.json` or vitest config.

## Decision

**Place tests in `portal/src/components/__tests__/shared-*.test.tsx` instead of `shared/`.**

Rationale:
- Portal already has vitest config, test-setup, and all testing dependencies
- Portal has `@shared` alias configured pointing to `../shared`
- Shared components import dependencies (recharts) that are only in portal's node_modules
- No need to duplicate test infrastructure in shared directory

## Implementation

1. **Test file naming:** `shared-ComponentName.test.tsx` pattern distinguishes them from portal-specific component tests
2. **Import pattern:** `import Component from '@shared/analytics/Component'`
3. **Recharts resolution:** Added explicit resolve.alias in `portal/vitest.config.ts` mapping `recharts` to portal's node_modules so Vite can resolve it when processing shared files
4. **Global mock:** Added recharts mock in `portal/src/test-setup.ts` to avoid repetition in individual test files

## Results

- 38 tests covering all 5 shared analytics components
- 100% passing
- Clean separation: `shared-*.test.tsx` prefix makes it obvious these test shared components
- No dependency duplication
- No vitest config duplication

## Implications

- Future shared component tests should follow this pattern
- If shared/ ever becomes a standalone package, tests can be moved at that time
- Recharts mock is now globally available for all portal tests (no side effects on existing tests)

## Learnings

- Vite cannot resolve imports from parent directories without explicit aliases
- Global mocks in test-setup.ts are processed before individual test files
- Testing components from a parent directory requires resolve config to map their dependencies

## Team Consensus

✅ Approved by Hockney (implementation complete)
