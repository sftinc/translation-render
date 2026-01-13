# Auth Layer for Origin Access

## Summary

Create a separate authorization layer that checks if a profile can access an origin before running queries. This makes data queries profile-agnostic while maintaining security through origin validation in mutations.

## Why

| Current State | Proposed State |
|---------------|----------------|
| Auth checks embedded in queries via CTEs and JOINs | New `canAccessOrigin(profileId, originId)` function in `packages/db` |
| Queries take `profileId` as parameter | Queries no longer need `profileId` parameter |
| Translation mutations use INSERT...ON CONFLICT (upsert) | All mutations are UPDATE-only with origin validation |
| EditModal has misleading prop name (`originId` receives segment/path ID) | Split into SegmentEditModal + PathEditModal with correct prop names |
| Silent success pattern | Silent success preserved (no "Access denied" errors that leak existence) |

### Design Decisions

| Concern | Resolution |
|---------|------------|
| Silent success | Preserve - return `{ success: true }` when access denied to prevent resource enumeration |
| TOCTOU race | Accept - permission changes are rare, window is milliseconds |
| Query count | Pass `originId` from client (known from URL), reducing 3 queries to 2 |
| Package boundary | Put `canAccessOrigin` in `packages/db/src/dashboard.ts` |
| getOriginsWithStats | Keep profileId - it's a listing query where profile filtering is the point |
| Origin-segment binding | Validate segment/path belongs to claimed origin in mutation query |
| Mutation type | UPDATE only - users never create segments/paths through www app |

---

## Phase 1: Add Auth Function to DB Package

**Goal:** Create the authorization check function in the shared DB layer

- [ ] Add `canAccessOrigin` function to `packages/db/src/dashboard.ts`
- [ ] Export from `packages/db/src/index.ts`

### Details

1. `packages/db/src/dashboard.ts` - add function:
```typescript
export async function canAccessOrigin(profileId: number, originId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM origin o
     JOIN account_profile ap ON ap.account_id = o.account_id
     WHERE o.id = $1 AND ap.profile_id = $2
     LIMIT 1`,
    [originId, profileId]
  )
  return (result.rowCount ?? 0) > 0
}
```

2. `packages/db/src/index.ts` - add to exports

---

## Phase 2: Simplify DB Queries

**Goal:** Remove profile auth from queries, add origin validation, change to UPDATE-only

- [ ] Update `updateSegmentTranslation` - remove CTE auth, change INSERT→UPDATE, add originId param
- [ ] Update `updatePathTranslation` - remove CTE auth, change INSERT→UPDATE, add originId param
- [ ] Update `markSegmentReviewed` - remove profile auth, add originId param
- [ ] Update `markPathReviewed` - remove profile auth, add originId param
- [ ] Update `getOriginById` - remove account_profile JOIN, remove profileId param

### Details

1. `packages/db/src/dashboard.ts` - new signatures:
```typescript
updateSegmentTranslation(originId: number, originSegmentId: number, lang: string, translatedText: string)
updatePathTranslation(originId: number, originPathId: number, lang: string, translatedPath: string)
markSegmentReviewed(originId: number, originSegmentId: number, lang: string)
markPathReviewed(originId: number, originPathId: number, lang: string)
getOriginById(originId: number)  // No profileId
```

2. Example query patterns:
```sql
-- updateSegmentTranslation
UPDATE translated_segment ts
SET translated_text = $4, updated_at = NOW()
FROM origin_segment os
WHERE ts.origin_segment_id = $2
  AND ts.lang = $3
  AND os.id = ts.origin_segment_id
  AND os.origin_id = $1

-- updatePathTranslation
UPDATE translated_path tp
SET translated_path = $4, updated_at = NOW()
FROM origin_path op
WHERE tp.origin_path_id = $2
  AND tp.lang = $3
  AND op.id = tp.origin_path_id
  AND op.origin_id = $1

-- markSegmentReviewed
UPDATE translated_segment ts
SET reviewed_at = NOW(), updated_at = NOW()
FROM origin_segment os
WHERE ts.origin_segment_id = $2
  AND ts.lang = $3
  AND os.id = ts.origin_segment_id
  AND os.origin_id = $1

-- markPathReviewed
UPDATE translated_path tp
SET reviewed_at = NOW(), updated_at = NOW()
FROM origin_path op
WHERE tp.origin_path_id = $2
  AND tp.lang = $3
  AND op.id = tp.origin_path_id
  AND op.origin_id = $1
```

3. `getOriginsWithStats` - **keep profileId** (listing query where profile filtering is the point)

---

## Phase 3: Update Server Actions

**Goal:** Check access before calling queries, receive originId from client

- [ ] Import `canAccessOrigin` from `@pantolingo/db`
- [ ] Update `saveSegmentTranslation` signature and add auth check
- [ ] Update `savePathTranslation` signature and add auth check
- [ ] Update `reviewSegment` signature and add auth check
- [ ] Update `reviewPath` signature and add auth check

### Details

1. `apps/www/src/actions/translations.ts` - new signatures:
```typescript
saveSegmentTranslation(originId: number, originSegmentId: number, lang: string, text: string)
savePathTranslation(originId: number, originPathId: number, lang: string, text: string)
reviewSegment(originId: number, originSegmentId: number, lang: string)
reviewPath(originId: number, originPathId: number, lang: string)
```

2. Pattern for all actions:
```typescript
export async function saveSegmentTranslation(
  originId: number,
  originSegmentId: number,
  lang: string,
  text: string
) {
  const profileId = await requireProfileId()

  if (!await canAccessOrigin(profileId, originId)) {
    return { success: true }  // Silent success - don't leak existence
  }

  return updateSegmentTranslation(originId, originSegmentId, lang, text)
}
```

---

## Phase 4: Split EditModal Components

**Goal:** Fix prop naming, thread originId correctly

- [ ] Create `apps/www/src/components/dashboard/SegmentEditModal.tsx`
- [ ] Create `apps/www/src/components/dashboard/PathEditModal.tsx`
- [ ] Delete `apps/www/src/components/dashboard/EditModal.tsx`
- [ ] Update `SegmentTable.tsx` to use SegmentEditModal and receive originId prop
- [ ] Update `PathTable.tsx` to use PathEditModal and receive originId prop

### Details

1. `SegmentEditModal.tsx` props:
```typescript
interface SegmentEditModalProps {
  isOpen: boolean
  onClose: () => void
  originId: number           // From page URL params
  originSegmentId: number    // The segment being edited
  originalText: string
  translatedText: string | null
  isReviewed: boolean
  targetLang: string
  onUpdate?: () => void
}
```

2. `PathEditModal.tsx` props:
```typescript
interface PathEditModalProps {
  isOpen: boolean
  onClose: () => void
  originId: number           // From page URL params
  originPathId: number       // The path being edited
  originalPath: string
  translatedPath: string | null
  isReviewed: boolean
  targetLang: string
  onUpdate?: () => void
}
```

3. Threading originId:
```
Page (has originId from URL)
  → SegmentTable (receives originId as prop)
    → SegmentEditModal (receives originId + originSegmentId)
      → saveSegmentTranslation(originId, originSegmentId, lang, text)

Page (has originId from URL)
  → PathTable (receives originId as prop)
    → PathEditModal (receives originId + originPathId)
      → savePathTranslation(originId, originPathId, lang, text)
```

---

## Phase 5: Update Dashboard Pages

**Goal:** Use auth check for read operations, pass originId to components

- [ ] Update `apps/www/src/app/(dashboard)/dashboard/origin/[id]/page.tsx`
- [ ] Update `apps/www/src/app/(dashboard)/dashboard/origin/[id]/lang/[langCd]/page.tsx`

### Details

1. Both pages - add auth check and pass originId:
```typescript
const session = await auth()
const originId = parseInt(params.id)

if (!await canAccessOrigin(session.user.profileId, originId)) {
  notFound()
}

const origin = await getOriginById(originId)  // No profileId needed

// Pass originId to tables
<SegmentTable segments={segmentData.items} targetLang={langCd} originId={originId} />
<PathTable paths={pathData.items} targetLang={langCd} originId={originId} />
```

---

## Verification

1. Edit a segment you have access to → should succeed
2. Call action with wrong originId (one you have access to, but segment belongs elsewhere) → silent success, no mutation
3. Call action with originId you don't have access to → silent success, no mutation
4. Visit origin URL you don't have access to → 404
5. Dashboard lists only origins you have access to (unchanged)
