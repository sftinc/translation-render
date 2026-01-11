# Add Translation Style Column

## Task

Add `style` column to store translation style preference per host.

## Why

The SEGMENT_PROMPT now supports three translation styles:
- `literal` - Word-for-word, formal register
- `balanced` - Accurate with natural phrasing (default)
- `natural` - Fluent, idiomatic, conversational

Currently hardcoded to `'balanced'`. Customers should be able to configure per-host.

## Affected Tables

| Table | Column | Type | Default |
|-------|--------|------|---------|
| `host` | `style` | `VARCHAR(10)` | `'balanced'` |

## Migration SQL

```sql
-- Add style column with default
ALTER TABLE host
ADD COLUMN style VARCHAR(10) NOT NULL DEFAULT 'balanced'
CHECK (style IN ('literal', 'balanced', 'natural'));
```

## Code Changes After Migration

1. Update `getHostConfig()` in [host.ts](../packages/db/src/host.ts) to return `style`
2. Update `HostConfig` type to include `style`
3. Pass `hostConfig.style` through translate pipeline in [index.ts](../apps/translate/src/index.ts)
4. Add style selector to dashboard host settings

## Limitations

**Cache behavior:** Existing cached translations will NOT update when a customer changes their style preference. Style changes only affect new translations. This is an accepted limitation.

## Dependencies

- SEGMENT_PROMPT must be updated first (done)
- Function signatures must accept style parameter (done)
