# Task 1.4: Set Up PostHog for Developer Dashboard

## Overview

Add PostHog analytics to the Next.js 14 developer dashboard alongside the existing `@vercel/analytics`. PostHog will provide product analytics, user identification, and event tracking. No PostHog integration exists anywhere in the codebase currently.

**Time Estimate:** 45 min
**Target Repo:** `scry-developer-dashboard`
**Agent Tools Required:** Code + Browser (need browser to create PostHog project and obtain API key)
**Dependencies:** None

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| PH-001 | PostHog script increases page load time | Medium | Low | Low |
| PH-002 | PostHog conflicts with Vercel Analytics | Low | Low | Low |
| PH-003 | User identification exposes PII | Medium | High | High |
| PH-004 | PostHog blocks rendering if CDN is slow | Low | Medium | Low |

**Mitigation:**
- PH-001: PostHog loads asynchronously, minimal impact
- PH-002: Both use different tracking mechanisms, no conflict expected
- PH-003: Only identify with Firebase UID and display name, never email or tokens
- PH-004: Load PostHog lazily with `{ loaded: (posthog) => { ... } }` callback

---

## File-by-file Plan

### 1. Install Dependencies

```bash
cd scry-developer-dashboard
pnpm add posthog-js
```

### 2. Create PostHog Provider Component

**File:** `scry-developer-dashboard/components/posthog-provider/PostHogProvider.tsx` (NEW)

```tsx
'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        capture_pageview: true,
        capture_pageleave: true,
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') posthog.debug();
        },
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
```

### 3. Add Environment Variables

**File:** `scry-developer-dashboard/.env.local.example`

Add:
```
NEXT_PUBLIC_POSTHOG_KEY=phc_your_key_here
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### 4. Add PostHog Provider to Root Layout

**File:** `scry-developer-dashboard/app/layout.tsx`

Add the PostHog provider alongside existing `<Analytics />`:

```tsx
import { PostHogProvider } from '@/components/posthog-provider/PostHogProvider';
// ... existing imports

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <PostHogProvider>
          {/* existing providers and content */}
          {children}
        </PostHogProvider>
        <Analytics /> {/* Keep existing Vercel Analytics */}
      </body>
    </html>
  );
}
```

### 5. Integrate with Firebase Auth for User Identification

**File:** `scry-developer-dashboard/lib/firebase-provider.tsx`

Add PostHog user identification when Firebase auth state changes:

```tsx
import posthog from 'posthog-js';

// In the auth state change handler:
onAuthStateChanged(auth, (user) => {
  if (user) {
    posthog.identify(user.uid, {
      name: user.displayName,
      // Do NOT include email or sensitive data
    });
  } else {
    posthog.reset();
  }
});
```

### 6. Browser Setup Steps (for agent with browser access)

1. Go to https://posthog.com and sign up / log in
2. Create a new project named "scry-developer-dashboard"
3. Select "US Cloud" region
4. Copy the API key (starts with `phc_`)
5. Note the host URL (should be `https://us.i.posthog.com`)
6. Save these values - they'll be set as environment variables in Vercel

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-developer-dashboard/app/layout.tsx` | Root layout to add provider |
| `scry-developer-dashboard/lib/firebase-provider.tsx` | Auth context for user identification |
| `scry-developer-dashboard/.env.local.example` | Environment variable template |

---

## Verification

1. `pnpm dev` starts without errors
2. PostHog initializes in browser dev tools (check `posthog.debug()` output)
3. Page views are captured (visible in PostHog dashboard if key is set)
4. User identification works on login (PostHog identifies with Firebase UID)
5. `posthog.reset()` fires on logout
6. Vercel Analytics continues to work alongside PostHog
7. No PII (email, tokens) is sent to PostHog
