# Validation Plan: Team Invitations

This document outlines the strategy for validating the team invitation system, specifically addressing the challenges of testing GitHub-only authentication.

## 1. Testing Strategy Overview

Since the system relies on GitHub OAuth via Firebase, testing with real accounts is difficult (requires multiple GitHub accounts). We will use a multi-layered approach:

1.  **Firebase Auth Emulator (Recommended for Local/CI)**: Use the Firebase Auth Emulator to create "fake" users with specific emails and GitHub provider IDs.
2.  **Manual Verification with "Plus-Addressing"**: Use a single GitHub account with email aliases (e.g., `user+test1@gmail.com`) if GitHub/Firebase allows it.
3.  **API-Level Unit Testing**: Mock the `verifyIdToken` function to simulate different users and email claims.
4.  **UI Component Testing**: Use Vitest/Testing Library to mock the `useInviteDetails` and `useAcceptInvite` hooks.

---

## 2. Approach A: Firebase Auth Emulator (Automated/Local)

The best way to test without real GitHub accounts is the **Firebase Auth Emulator**.

### Setup
1.  Start the emulator: `firebase emulators:start --only auth,firestore,functions`
2.  Create a test user via the Emulator UI or Admin SDK:
    ```typescript
    // Example script to create a fake GitHub user in emulator
    await admin.auth().createUser({
      uid: 'fake-github-user',
      email: 'invitee@example.com',
      displayName: 'Test Invitee',
      providerData: [{
        providerId: 'github.com',
        uid: 'github-12345',
        email: 'invitee@example.com'
      }]
    });
    ```

### Test Cases
- **Success**: Invite `invitee@example.com` -> Log in as fake user -> Accept -> Verify project membership.
- **Email Mismatch**: Invite `wrong@example.com` -> Log in as `invitee@example.com` -> Verify 403 error.
- **Expiration**: Create invite with `expiresAt` in the past -> Verify 400 error.

---

## 3. Approach B: Manual Testing (No New Accounts)

If you don't want to set up emulators, you can use these "tricks":

### 1. The "Self-Invite" Test
1.  Invite your **own** GitHub email address to a project you don't own (or a new project).
2.  This validates the UI flow but doesn't test the "different user" logic perfectly.

### 2. Temporary "Test" Users in Firebase Console
1.  Go to **Firebase Console > Authentication**.
2.  Manually add a user with **Email/Password** (even though the app uses GitHub).
3.  **Crucial**: The API logic checks `decodedToken.email`. If you manually create a user with the invited email, the `accept` endpoint will work because it validates the email claim, regardless of the provider (unless we strictly check `firebase.sign_in_provider == 'github.com'`).
4.  *Note*: Our current implementation validates `userEmail` from the token. To strictly test GitHub, we'd need to ensure the provider is GitHub.

---

## 4. Approach C: API Unit Tests (Mocking)

We can create a test suite in `scry-developer-dashboard/app/api/invites/[inviteId]/accept/__tests__/route.test.ts`.

### Mocking Strategy
```typescript
vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => mockDb,
  verifyIdToken: vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'invitee@example.com',
    name: 'Test User'
  })
}));
```

This allows us to test every edge case (mismatch, expiration, already accepted) without ever touching a real browser or GitHub.

---

## 5. Recommended Validation Steps for You

If you want to verify my changes right now:

1.  **Check UI**: Go to a project you own, click "Invite Member", enter an email, and copy the link.
2.  **Check Public Page**: Open the link in an Incognito window. You should see the project name and "Sign in with GitHub" button.
3.  **Check Security**: 
    *   Invite an email you **don't** own.
    *   Log in with your real GitHub account.
    *   The page should show the **"Email Mismatch"** error state I implemented.
4.  **Check Acceptance**:
    *   Invite your own GitHub email.
    *   Click Accept.
    *   Verify you are redirected to the project and see yourself in the members list.

## 7. Automated Testing in GitHub Actions

To run these tests in GitHub Actions without real GitHub accounts, you have two primary options:

### Option 1: Playwright + Firebase Emulators (E2E)
This is the most robust option. It runs the full app against local emulators.

1.  **Workflow Setup**:
    ```yaml
    - name: Start Firebase Emulators
      run: npx firebase emulators:exec "npm run test:e2e"
    ```
2.  **Bypassing GitHub Login**:
    In your E2E tests, you can use the Firebase Admin SDK (running in the test process) to generate a custom token for a "fake" user and then sign in via `signInWithCustomToken` in the browser.
    ```typescript
    // playwright test
    const customToken = await admin.auth().createCustomToken('fake-user', { email: 'test@example.com' });
    await page.evaluate((token) => {
      return signInWithCustomToken(auth, token);
    }, customToken);
    ```

### Option 2: Vitest + API Mocking (Integration)
This is faster and easier to set up. It tests the Next.js API routes directly.

1.  **Setup**: Use `vitest` to call the route handlers.
2.  **Mocking**: Mock `verifyIdToken` to return a fake user object.
3.  **Example**:
    ```typescript
    // app/api/invites/[id]/accept/__tests__/route.test.ts
    it('should accept valid invitation', async () => {
      mockVerifyIdToken.mockResolvedValue({ email: 'invited@email.com', uid: 'user123' });
      const res = await POST(request, { params: { inviteId: 'valid-id' } });
      expect(res.status).toBe(200);
    });
    ```

### Option 3: GitHub "Test" Accounts (Not Recommended)
GitHub does not provide official "test" accounts for OAuth. Using real accounts in CI is brittle because:
- It requires handling 2FA.
- GitHub may flag the automated logins as suspicious.
- It requires storing real credentials in GitHub Secrets.

**Recommendation**: Use **Option 2** for fast feedback on logic, and **Option 1** for verifying the full UX flow using the Firebase Emulator to simulate the authenticated state.
