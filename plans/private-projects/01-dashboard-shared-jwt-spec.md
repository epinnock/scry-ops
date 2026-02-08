# Dashboard Implementation Spec — Shared JWT (Private Projects)

## Overview

Implement session cookie sharing and visibility toggle for private projects.

**Estimated Effort**: 3-4 days

---

## Changes Required

### 1. Session Cookie on Parent Domain

#### Current State
Dashboard uses Firebase client-side auth. No server-side session cookie.

#### Target State
After login, create a Firebase session cookie on `.scrymore.com` so the CDN can validate it.

#### Implementation

##### 1.1 Create Session Endpoint

**File**: `app/api/auth/session/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRY_DAYS = 5;
const SESSION_EXPIRY_MS = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    
    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }
    
    const auth = getAdminAuth();
    
    // Verify the ID token first
    await auth.verifyIdToken(idToken);
    
    // Create session cookie
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });
    
    // Set cookie on parent domain
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_EXPIRY_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: getCookieDomain(),
      path: '/',
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/session] Error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 401 });
  }
}

function getCookieDomain(): string | undefined {
  // In production, set on parent domain
  // In development, don't set domain (localhost doesn't support subdomains)
  if (process.env.NODE_ENV === 'production') {
    return '.scrymore.com';
  }
  return undefined;
}
```

##### 1.2 Create Logout Endpoint

**File**: `app/api/auth/logout/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = '__session';

export async function POST() {
  const cookieStore = await cookies();
  
  // Clear the session cookie
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.scrymore.com' : undefined,
    path: '/',
  });
  
  return NextResponse.json({ success: true });
}
```

##### 1.3 Update Auth Flow

**File**: `lib/firebase-provider.tsx` (or wherever auth state is managed)

```typescript
// After successful Firebase sign-in
async function onAuthStateChanged(user: User | null) {
  if (user) {
    // Get ID token and create session cookie
    const idToken = await user.getIdToken();
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  }
}

// On sign-out
async function signOut() {
  await firebaseSignOut(auth);
  await fetch('/api/auth/logout', { method: 'POST' });
}
```

---

### 2. Visibility Toggle UI

#### 2.1 Update Project Types

**File**: `lib/types/project.types.ts`

```typescript
export type ProjectVisibility = 'public' | 'private';

export interface Project {
  // ... existing fields
  visibility: ProjectVisibility;
}

// Default for new projects
export const DEFAULT_VISIBILITY: ProjectVisibility = 'public';
```

#### 2.2 Update Project Settings Component

**File**: `components/project-detail/ProjectSettings.tsx`

Add a visibility toggle section:

```tsx
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Globe } from 'lucide-react';

interface VisibilityToggleProps {
  projectId: string;
  visibility: ProjectVisibility;
  onVisibilityChange: (visibility: ProjectVisibility) => void;
  isOwnerOrAdmin: boolean;
}

function VisibilityToggle({ 
  projectId, 
  visibility, 
  onVisibilityChange,
  isOwnerOrAdmin 
}: VisibilityToggleProps) {
  const isPrivate = visibility === 'private';
  
  const handleToggle = async (checked: boolean) => {
    const newVisibility = checked ? 'private' : 'public';
    
    try {
      await updateProjectVisibility(projectId, newVisibility);
      onVisibilityChange(newVisibility);
    } catch (error) {
      console.error('Failed to update visibility:', error);
      // Show error toast
    }
  };
  
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        {isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
        <span>{isPrivate ? 'Private' : 'Public'}</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="visibility-toggle" className="text-base">
            Private Project
          </Label>
          <p className="text-sm text-muted-foreground">
            {isPrivate 
              ? 'Only project members can view Storybook and coverage reports'
              : 'Anyone with the link can view Storybook and coverage reports'
            }
          </p>
        </div>
        <Switch
          id="visibility-toggle"
          checked={isPrivate}
          onCheckedChange={handleToggle}
        />
      </div>
      
      {isPrivate && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Viewers must be logged in and added as project members to access this project.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

#### 2.3 Update Project Card

**File**: `components/project-card/ProjectCard.tsx`

Add visibility badge:

```tsx
import { Lock, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function VisibilityBadge({ visibility }: { visibility: ProjectVisibility }) {
  if (visibility === 'private') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="h-3 w-3" />
        Private
      </Badge>
    );
  }
  return null; // Don't show badge for public (default)
}
```

---

### 3. API Updates

#### 3.1 Update Project Endpoint

**File**: `app/api/projects/[id]/route.ts`

Add visibility to PATCH handler:

```typescript
// In PATCH handler
const allowedFields = ['name', 'description', 'visibility', /* ... */];

// Validate visibility
if (body.visibility && !['public', 'private'].includes(body.visibility)) {
  return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 });
}

// Check permission for visibility change
if (body.visibility !== undefined) {
  const member = await projectService.getMember(projectId, uid);
  if (!member || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Only owners and admins can change visibility' }, { status: 403 });
  }
}
```

#### 3.2 Update Project Service

**File**: `lib/services/project.service.ts`

```typescript
async updateVisibility(projectId: string, visibility: ProjectVisibility): Promise<void> {
  const projectRef = doc(this.db, 'projects', projectId);
  await updateDoc(projectRef, { 
    visibility,
    updatedAt: serverTimestamp(),
  });
}
```

---

### 4. Firestore Schema Update

#### 4.1 Add Visibility Field

Update existing projects to have default visibility:

```typescript
// Migration script or Firestore function
async function migrateProjectVisibility() {
  const projectsRef = collection(db, 'projects');
  const snapshot = await getDocs(projectsRef);
  
  const batch = writeBatch(db);
  
  snapshot.docs.forEach((doc) => {
    if (doc.data().visibility === undefined) {
      batch.update(doc.ref, { visibility: 'public' });
    }
  });
  
  await batch.commit();
}
```

#### 4.2 Update Firestore Rules

**File**: `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      // Allow read if public OR user is a member
      allow read: if resource.data.visibility == 'public' 
                  || request.auth.uid in resource.data.memberIds;
      
      // Allow visibility update only for owner/admin
      allow update: if request.auth.uid in resource.data.memberIds
                    && (
                      !request.resource.data.diff(resource.data).affectedKeys().hasAny(['visibility'])
                      || isOwnerOrAdmin(projectId, request.auth.uid)
                    );
    }
  }
}
```

---

## Testing

### Test Files to Create

| File | Description |
|------|-------------|
| `app/api/auth/session/__tests__/route.test.ts` | Session endpoint tests |
| `app/api/auth/logout/__tests__/route.test.ts` | Logout endpoint tests |
| `lib/hooks/__tests__/useVisibility.test.ts` | React Query hooks tests |
| `components/project-detail/__tests__/VisibilityToggle.test.tsx` | Component tests |

---

### 1. API Route Tests — Session Endpoint

**File**: `app/api/auth/session/__tests__/route.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase Admin
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
  })),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: vi.fn(),
  })),
}));

import { POST } from '../route';
import { getAdminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

describe('POST /api/auth/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if idToken is missing', async () => {
    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toBe('Missing idToken');
  });

  it('returns 401 if idToken is invalid', async () => {
    const mockAuth = getAdminAuth();
    (mockAuth.verifyIdToken as any).mockRejectedValue(new Error('Invalid token'));

    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'invalid-token' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('creates session cookie with correct options in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const mockAuth = getAdminAuth();
    (mockAuth.verifyIdToken as any).mockResolvedValue({ uid: 'user-123' });
    (mockAuth.createSessionCookie as any).mockResolvedValue('session-cookie-value');

    const mockCookieStore = { set: vi.fn() };
    (cookies as any).mockResolvedValue(mockCookieStore);

    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'valid-token' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      '__session',
      'session-cookie-value',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: '.scrymore.com',
        path: '/',
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('does not set domain in development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const mockAuth = getAdminAuth();
    (mockAuth.verifyIdToken as any).mockResolvedValue({ uid: 'user-123' });
    (mockAuth.createSessionCookie as any).mockResolvedValue('session-cookie-value');

    const mockCookieStore = { set: vi.fn() };
    (cookies as any).mockResolvedValue(mockCookieStore);

    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'valid-token' }),
    });

    await POST(request);

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      '__session',
      'session-cookie-value',
      expect.objectContaining({
        domain: undefined,
      })
    );

    process.env.NODE_ENV = originalEnv;
  });
});
```

---

### 2. API Route Tests — Logout Endpoint

**File**: `app/api/auth/logout/__tests__/route.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: vi.fn(),
  })),
}));

import { POST } from '../route';
import { cookies } from 'next/headers';

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears session cookie with maxAge 0', async () => {
    const mockCookieStore = { set: vi.fn() };
    (cookies as any).mockResolvedValue(mockCookieStore);

    const response = await POST();
    expect(response.status).toBe(200);

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      '__session',
      '',
      expect.objectContaining({
        maxAge: 0,
        httpOnly: true,
        path: '/',
      })
    );
  });

  it('returns success response', async () => {
    const mockCookieStore = { set: vi.fn() };
    (cookies as any).mockResolvedValue(mockCookieStore);

    const response = await POST();
    const data = await response.json();

    expect(data.success).toBe(true);
  });
});
```

---

### 3. API Route Tests — Visibility Update

**File**: `app/api/projects/[id]/__tests__/visibility.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase-admin');

import { PATCH } from '../route';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';

describe('PATCH /api/projects/[id] - visibility', () => {
  const mockProject = {
    id: 'project-123',
    name: 'Test Project',
    ownerId: 'owner-123',
    memberIds: ['owner-123', 'admin-123'],
    visibility: 'public',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock auth
    (getAdminAuth as any).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'owner-123' }),
    });

    // Mock Firestore
    const mockDoc = {
      exists: true,
      data: () => mockProject,
    };
    
    (getAdminFirestore as any).mockReturnValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc),
          update: vi.fn().mockResolvedValue({}),
        }),
      }),
    });
  });

  it('returns 400 for invalid visibility value', async () => {
    const request = new Request('http://localhost/api/projects/project-123', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-token',
      },
      body: JSON.stringify({ visibility: 'invalid' }),
    });

    const response = await PATCH(request, { params: { id: 'project-123' } });
    expect(response.status).toBe(400);
  });

  it('returns 403 if non-owner/admin tries to change visibility', async () => {
    (getAdminAuth as any).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'viewer-123' }),
    });

    const request = new Request('http://localhost/api/projects/project-123', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-token',
      },
      body: JSON.stringify({ visibility: 'private' }),
    });

    const response = await PATCH(request, { params: { id: 'project-123' } });
    expect(response.status).toBe(403);
  });

  it('allows owner to change visibility to private', async () => {
    const request = new Request('http://localhost/api/projects/project-123', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-token',
      },
      body: JSON.stringify({ visibility: 'private' }),
    });

    const response = await PATCH(request, { params: { id: 'project-123' } });
    expect(response.status).toBe(200);
  });

  it('allows admin to change visibility to public', async () => {
    (getAdminAuth as any).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'admin-123' }),
    });

    const request = new Request('http://localhost/api/projects/project-123', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-token',
      },
      body: JSON.stringify({ visibility: 'public' }),
    });

    const response = await PATCH(request, { params: { id: 'project-123' } });
    expect(response.status).toBe(200);
  });
});
```

---

### 4. React Query Hooks Tests

**File**: `lib/hooks/__tests__/useVisibility.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateVisibility } from '../useVisibility';

// Mock Firebase client
vi.mock('@/lib/firebase-client', () => ({
  getClientAuth: vi.fn(() => ({
    currentUser: {
      uid: 'user-123',
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
    },
  })),
}));

// Mock fetch
global.fetch = vi.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useUpdateVisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates visibility successfully', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ visibility: 'private' }),
    });

    const { result } = renderHook(
      () => useUpdateVisibility('project-123'),
      { wrapper: createWrapper() }
    );

    result.current.mutate('private');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/project-123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visibility: 'private' }),
      })
    );
  });

  it('handles update error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    });

    const { result } = renderHook(
      () => useUpdateVisibility('project-123'),
      { wrapper: createWrapper() }
    );

    result.current.mutate('private');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

---

### 5. Component Tests

**File**: `components/project-detail/__tests__/VisibilityToggle.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisibilityToggle } from '../VisibilityToggle';

describe('VisibilityToggle', () => {
  const defaultProps = {
    projectId: 'project-123',
    visibility: 'public' as const,
    onVisibilityChange: vi.fn(),
    isOwnerOrAdmin: true,
  };

  it('renders switch for owner/admin', () => {
    render(<VisibilityToggle {...defaultProps} />);
    
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText('Private Project')).toBeInTheDocument();
  });

  it('renders read-only view for non-owner/admin', () => {
    render(<VisibilityToggle {...defaultProps} isOwnerOrAdmin={false} />);
    
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('shows private badge when visibility is private', () => {
    render(<VisibilityToggle {...defaultProps} visibility="private" isOwnerOrAdmin={false} />);
    
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('shows alert when project is private', () => {
    render(<VisibilityToggle {...defaultProps} visibility="private" />);
    
    expect(screen.getByText(/Viewers must be logged in/)).toBeInTheDocument();
  });

  it('calls onVisibilityChange when toggled', async () => {
    const onVisibilityChange = vi.fn();
    render(<VisibilityToggle {...defaultProps} onVisibilityChange={onVisibilityChange} />);
    
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    
    // Note: In real test, would need to mock the API call
    // and wait for the mutation to complete
  });
});
```

---

### 6. Integration Tests

**File**: `tests/integration/private-projects.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Private Projects Integration', () => {
  // These tests require a running Firebase emulator
  // Run with: firebase emulators:start

  describe('Session Cookie Flow', () => {
    it('creates session cookie on login', async () => {
      // 1. Sign in with Firebase client
      // 2. Call /api/auth/session with ID token
      // 3. Verify cookie is set
    });

    it('clears session cookie on logout', async () => {
      // 1. Call /api/auth/logout
      // 2. Verify cookie is cleared
    });
  });

  describe('Visibility Change Flow', () => {
    it('owner can change visibility to private', async () => {
      // 1. Create project as owner
      // 2. PATCH visibility to private
      // 3. Verify Firestore document updated
    });

    it('non-member cannot read private project', async () => {
      // 1. Create private project
      // 2. Try to read as non-member
      // 3. Verify 403 response
    });
  });
});
```

---

### 7. Manual Testing Checklist

#### Session Cookie Tests

- [ ] Login on dashboard.scrymore.com
- [ ] Open DevTools → Application → Cookies
- [ ] Verify `__session` cookie exists with domain `.scrymore.com`
- [ ] Navigate to view.scrymore.com
- [ ] Verify `__session` cookie is sent in request headers
- [ ] Logout on dashboard
- [ ] Verify `__session` cookie is cleared

#### Visibility Toggle Tests

- [ ] Navigate to project settings as owner
- [ ] Toggle visibility to private
- [ ] Verify toggle state persists after page refresh
- [ ] Verify private badge appears on project card
- [ ] Navigate to project settings as viewer
- [ ] Verify toggle is read-only

#### Access Control Tests

- [ ] Set project to private
- [ ] Open Storybook link in incognito window
- [ ] Verify 401 Unauthorized response
- [ ] Login in incognito window
- [ ] Verify Storybook loads for project member
- [ ] Verify 403 Forbidden for non-member

---

### Running Tests

```bash
# Run all dashboard tests
cd scry-developer-dashboard
pnpm test

# Run specific test file
pnpm test app/api/auth/session/__tests__/route.test.ts

# Run with coverage
pnpm test --coverage

# Run in watch mode
pnpm test --watch
```

---

### Test Coverage Goals

| Component | Target |
|-----------|--------|
| Session API routes | 90%+ |
| Visibility API routes | 90%+ |
| React hooks | 85%+ |
| UI components | 75%+ |

---

## Environment Variables

```bash
# No new env vars required for dashboard
# Cookie domain is derived from NODE_ENV
```

---

## Rollout Checklist

- [ ] Create `/api/auth/session` endpoint
- [ ] Create `/api/auth/logout` endpoint
- [ ] Update auth flow to create session cookie on login
- [ ] Update auth flow to clear session cookie on logout
- [ ] Add `visibility` field to Project type
- [ ] Add visibility toggle to Project Settings
- [ ] Add visibility badge to Project Card
- [ ] Update project PATCH endpoint for visibility
- [ ] Update Firestore rules
- [ ] Run migration for existing projects (set default visibility)
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Deploy to staging
- [ ] Verify cookie is set on `.scrymore.com` in staging
- [ ] Deploy to production

---

## Dependencies

- Firebase Admin SDK (already installed)
- No new npm packages required

---

## Files Changed

| File | Change |
|------|--------|
| `app/api/auth/session/route.ts` | New |
| `app/api/auth/logout/route.ts` | New |
| `lib/firebase-provider.tsx` | Update auth flow |
| `lib/types/project.types.ts` | Add visibility type |
| `components/project-detail/ProjectSettings.tsx` | Add visibility toggle |
| `components/project-card/ProjectCard.tsx` | Add visibility badge |
| `app/api/projects/[id]/route.ts` | Handle visibility in PATCH |
| `lib/services/project.service.ts` | Add updateVisibility method |
| `firestore.rules` | Add visibility rules |
