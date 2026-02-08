# Task 4.1: Support Google OAuth Login

## Overview

Add Google as a second OAuth provider alongside existing GitHub authentication. Firebase Auth already supports Google OAuth natively - it just needs to be enabled in Firebase Console and the UI updated to show both sign-in options.

**Time Estimate:** 60 min
**Target Repo:** `scry-developer-dashboard`
**Agent Tools Required:** Code + Firebase Console (browser) + local dev for testing
**Dependencies:** None (but avoid conflicting with Task 1.4 PostHog changes to layout.tsx)

---

## Risk Assessment

| Risk ID | Risk | Likelihood | Impact | Severity |
|---------|------|------------|--------|----------|
| GA-001 | Existing user profiles break with Google provider data | Medium | High | High |
| GA-002 | AuthGuard checks GitHub-specific fields (e.g., GitHub username) | Medium | Medium | Medium |
| GA-003 | Google OAuth popup blocked by browser | Low | Medium | Low |
| GA-004 | Firebase Console configuration done incorrectly | Low | High | Medium |

**Mitigation:**
- GA-001: Google provides `displayName`, `email`, `photoURL` like GitHub. Ensure no GitHub-specific fields are required.
- GA-002: Audit AuthGuard, user profile components, and any code checking `user.providerData` for GitHub-specific logic.
- GA-003: Offer both popup and redirect sign-in methods. Default to redirect on mobile.
- GA-004: Document the exact Console steps with screenshots.

---

## File-by-file Plan

### Step 0: Firebase Console Setup (Browser Required)

1. Go to Firebase Console > scry-dev-dashboard project
2. Navigate to Authentication > Sign-in methods
3. Click "Add new provider" > Google
4. Enable Google sign-in
5. Set the project support email
6. Save
7. Repeat for the staging project (scry-dev-dashboard-stage)

**Document these steps for reproducibility.**

### 1. Create Auth Helper for Google Sign-In

**File:** `scry-developer-dashboard/lib/auth-helpers.ts` (or wherever `signInWithGithub` lives)

Add Google sign-in function:

```typescript
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  // Add scopes if needed
  provider.addScope('profile');
  provider.addScope('email');

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    // If popup blocked, fall back to redirect
    if (error.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
    }
    throw error;
  }
}
```

### 2. Update Login UI

**File:** `scry-developer-dashboard/components/github-signin/GithubSignIn.tsx`

Add Google sign-in button alongside GitHub. Consider renaming the component/directory to something more general like `auth-signin/`:

```tsx
import { signInWithGoogle } from '@/lib/auth-helpers';

// Add Google button:
<Button
  variant="outline"
  onClick={handleGoogleSignIn}
  className="w-full"
>
  <svg>...</svg> {/* Google icon */}
  Sign in with Google
</Button>

// Keep existing GitHub button:
<Button
  variant="outline"
  onClick={handleGithubSignIn}
  className="w-full"
>
  <Github className="mr-2 h-4 w-4" />
  Sign in with GitHub
</Button>
```

Add a divider between the two options:
```tsx
<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background px-2 text-muted-foreground">Or</span>
  </div>
</div>
```

### 3. Audit Auth-Dependent Code

**Files to check:**
- `lib/auth-guard.tsx` - Ensure it only checks `user` existence, not provider
- `lib/firebase-provider.tsx` - Ensure user context works with both providers
- Any components displaying user profile (displayName, avatar, etc.)
- Any API routes that extract GitHub-specific tokens for GitHub API calls

**Key concern:** If any feature requires a GitHub token (e.g., creating GitHub issues, accessing repos), those features should gracefully degrade for Google-authenticated users with a message like "Connect your GitHub account to access this feature."

### 4. Update User Profile Display

**File:** Wherever user profile is shown (sidebar, header, settings)

Ensure it handles both providers:
```typescript
// Instead of assuming GitHub avatar:
const avatar = user.photoURL; // Works for both Google and GitHub
const name = user.displayName; // Works for both
```

### 5. Add Tests

Test both sign-in flows work independently and that user session is correctly established regardless of provider.

---

## Reference Files

| File | Purpose |
|------|---------|
| `scry-developer-dashboard/components/github-signin/GithubSignIn.tsx` | Current login UI |
| `scry-developer-dashboard/lib/auth-helpers.ts` | signInWithGithub() function |
| `scry-developer-dashboard/lib/firebase-provider.tsx` | Auth context |
| `scry-developer-dashboard/lib/auth-guard.tsx` | Route protection |

---

## Verification

1. Google sign-in button appears on login page
2. Clicking Google sign-in opens OAuth popup
3. Successful Google login redirects to dashboard
4. User profile shows Google display name and avatar
5. Sign-out works for Google-authenticated users
6. GitHub sign-in continues to work unchanged
7. AuthGuard protects routes for both provider types
8. Features requiring GitHub token show appropriate message for Google users
