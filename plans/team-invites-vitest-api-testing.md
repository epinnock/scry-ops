# Team Invites Vitest API Testing Plan

This plan focuses on **Vitest + API mocking** to validate the invitation routes without any external dependencies or GitHub OAuth.

## Goal

Test the Next.js API routes directly and mock `verifyIdToken` to simulate different GitHub users and email claims. This provides millisecond-fast tests for all edge cases.

## Scope

**Target routes**
- `POST /api/projects/[id]/invites`
- `GET /api/projects/[id]/invites`
- `DELETE /api/projects/[id]/invites/[inviteId]`
- `GET /api/invites/[inviteId]`
- `POST /api/invites/[inviteId]/accept`

**Out of scope**
- UI tests
- Real OAuth flows
- Firebase emulators

## Test Strategy

### 1. Mock Firebase Admin SDK

Pattern matches the existing tests in [`visibility.test.ts`](scry-developer-dashboard/app/api/projects/[id]/__tests__/visibility.test.ts:1).

```ts
vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: vi.fn(),
  verifyIdToken: vi.fn(),
}));
```

### 2. Create Route Unit Tests

**Test location**
- `scry-developer-dashboard/app/api/projects/[id]/invites/__tests__/route.test.ts`
- `scry-developer-dashboard/app/api/projects/[id]/invites/[inviteId]/__tests__/route.test.ts`
- `scry-developer-dashboard/app/api/invites/[inviteId]/__tests__/route.test.ts`
- `scry-developer-dashboard/app/api/invites/[inviteId]/accept/__tests__/route.test.ts`

Each test should import the route handler functions (GET, POST, DELETE) and pass a `Request` with headers and body to validate behavior.

### 3. Mock Firestore Behaviors

Use lightweight mock objects for:
- `collection().doc().get()`
- `collection().where().get()`
- `batch().set()` / `batch().update()` / `batch().commit()`

Example pattern
```ts
(getAdminFirestore as any).mockReturnValue({
  collection: vi.fn().mockReturnValue({
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue(mockDoc),
      set: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      collection: vi.fn().mockReturnValue(mockSubCollection),
    }),
    where: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockQuerySnapshot),
        }),
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockQuerySnapshot),
        }),
      }),
      limit: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(mockQuerySnapshot),
      }),
    }),
  }),
  batch: vi.fn().mockReturnValue({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue({}),
  }),
});
```

## Test Cases

### A. `POST /api/projects/[id]/invites`
- **401** when missing `Authorization` header
- **404** when project does not exist
- **403** when user lacks `canManageMembers`
- **400** when email or role is missing
- **400** when user already a member
- **400** when pending invite already exists
- **200** when invite created successfully

### B. `GET /api/projects/[id]/invites`
- **401** when unauthorized
- **404** when project does not exist
- **403** when user not a project member
- **200** returns list of invites

### C. `DELETE /api/projects/[id]/invites/[inviteId]`
- **401** when unauthorized
- **404** when project does not exist
- **403** when user lacks `canManageMembers`
- **404** when invite does not exist
- **400** when invite does not belong to project
- **200** when invite deleted

### D. `GET /api/invites/[inviteId]`
- **404** when invite not found
- **200** returns invite public details

### E. `POST /api/invites/[inviteId]/accept`
- **401** when unauthorized
- **404** when invite does not exist
- **400** when invite already accepted/declined
- **400** when invite expired
- **403** when email mismatch
- **200** when acceptance succeeds and membership is created

## Implementation Steps

1. Add the test files listed in the **Test location** section.
2. Create shared test utilities for mock Firestore objects (optional but recommended).
3. Implement the test cases above using mocked `verifyIdToken` claims.
4. Run `pnpm test` in `scry-developer-dashboard/` locally to confirm.

## Expected Outcome

- Fast, deterministic tests running in GitHub Actions.
- No dependency on real GitHub OAuth.
- Full coverage of invite validation edge cases.
