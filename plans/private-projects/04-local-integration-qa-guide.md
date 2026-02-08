# Private Projects — Local Integration & QA Guide

This guide covers manual integration validation for the private projects feature, including local development setup, Wrangler testing, and remote staging/production QA.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Wrangler Local Testing](#wrangler-local-testing)
4. [Remote Staging QA](#remote-staging-qa)
5. [Production Validation](#production-validation)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

```bash
# Verify installations
node --version      # v18+ required
pnpm --version      # v8+ recommended
wrangler --version  # v3+ required
firebase --version  # For emulator (optional)
```

### Required Accounts & Access

- [ ] Cloudflare account with Workers access
- [ ] Firebase project with Firestore enabled
- [ ] Google Cloud service account (for Option B auth)
- [ ] Access to staging and production environments

### Environment Files

Ensure you have the following environment files configured:

```bash
# Dashboard
scry-developer-dashboard/.env.local

# CDN Service
scry-cdn-service/.dev.vars  # Local secrets for Wrangler
```

---

## Local Development Setup

### 1. Dashboard Setup

```bash
cd scry-developer-dashboard

# Install dependencies
pnpm install

# Copy environment template
cp .env.local.example .env.local

# Configure environment variables
# Edit .env.local with your Firebase config
```

**Required `.env.local` variables:**

```bash
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id

# Firebase Admin (for session cookies)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 2. CDN Service Setup

```bash
cd scry-cdn-service

# Install dependencies
pnpm install

# Create local secrets file
touch .dev.vars
```

**Required `.dev.vars` variables:**

```bash
# Firebase Project ID
FIREBASE_PROJECT_ID=your-project-id

# Service Account (for Firestore access)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Start Local Services

**Terminal 1 — Dashboard:**

```bash
cd scry-developer-dashboard
pnpm dev
# Runs on http://localhost:3000
```

**Terminal 2 — CDN Worker (Wrangler):**

```bash
cd scry-cdn-service
pnpm dev
# Runs on http://localhost:8787
```

---

## Wrangler Local Testing

### Test 1: Public Project Access

```bash
# 1. Create a test project in Firestore with visibility: 'public'
# 2. Upload a test Storybook to R2

# 3. Access without authentication
curl -v http://localhost:8787/test-project/v1/index.html

# Expected: 200 OK with HTML content
```

### Test 2: Private Project — No Cookie

```bash
# 1. Create a test project in Firestore with visibility: 'private'

# 2. Access without session cookie
curl -v http://localhost:8787/private-project/v1/index.html

# Expected: 401 Unauthorized
```

### Test 3: Private Project — Invalid Cookie

```bash
# Access with invalid session cookie
curl -v http://localhost:8787/private-project/v1/index.html \
  -H "Cookie: __session=invalid-jwt-token"

# Expected: 401 Unauthorized
```

### Test 4: Private Project — Valid Cookie (Non-Member)

```bash
# 1. Login to dashboard and get session cookie
# 2. Create a private project where you're NOT a member

# Access with valid cookie but not a member
curl -v http://localhost:8787/other-private-project/v1/index.html \
  -H "Cookie: __session=<your-valid-session-cookie>"

# Expected: 403 Forbidden
```

### Test 5: Private Project — Valid Cookie (Member)

```bash
# 1. Login to dashboard and get session cookie
# 2. Access a private project where you ARE a member

curl -v http://localhost:8787/my-private-project/v1/index.html \
  -H "Cookie: __session=<your-valid-session-cookie>"

# Expected: 200 OK with HTML content
```

### Getting Session Cookie for Testing

1. Open dashboard at `http://localhost:3000`
2. Login with your account
3. Open DevTools → Application → Cookies
4. Copy the `__session` cookie value

---

## Remote Staging QA

### Deploy to Staging

```bash
# Deploy CDN Worker to staging
cd scry-cdn-service
wrangler deploy --env staging

# Deploy Dashboard to staging (Vercel)
cd scry-developer-dashboard
vercel --env preview
```

### Staging Test Checklist

#### Session Cookie Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Cookie created on login | Login on staging dashboard | `__session` cookie with domain `.scrymore.com` |
| Cookie sent to CDN | Access view.staging.scrymore.com | Cookie in request headers |
| Cookie cleared on logout | Logout from dashboard | `__session` cookie removed |

#### Visibility Toggle Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Toggle to private | Settings → Toggle private | Project shows 🔒 badge |
| Toggle to public | Settings → Toggle public | Badge removed |
| Persist on refresh | Refresh page | Toggle state preserved |
| Non-admin view | Login as viewer | Toggle is read-only |

#### Access Control Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Public project | Access without login | Content loads |
| Private project (no auth) | Access in incognito | 401 Unauthorized |
| Private project (non-member) | Login as non-member | 403 Forbidden |
| Private project (member) | Login as member | Content loads |

### Staging URLs

```
Dashboard: https://dashboard.staging.scrymore.com
CDN:       https://view.staging.scrymore.com
```

---

## Production Validation

### Pre-Production Checklist

- [ ] All staging tests pass
- [ ] Service account secrets configured in production
- [ ] Firestore rules deployed
- [ ] Rollback plan documented

### Deploy to Production

```bash
# Deploy CDN Worker to production
cd scry-cdn-service
wrangler deploy --env production

# Deploy Dashboard to production (Vercel)
cd scry-developer-dashboard
vercel --prod
```

### Production Smoke Tests

Run these tests immediately after deployment:

```bash
# 1. Verify public project still works
curl -I https://view.scrymore.com/known-public-project/v1/index.html
# Expected: 200 OK

# 2. Verify private project requires auth
curl -I https://view.scrymore.com/known-private-project/v1/index.html
# Expected: 401 Unauthorized

# 3. Verify health endpoint
curl https://view.scrymore.com/health
# Expected: 200 OK
```

### Production Test Checklist

| Test | Priority | Status |
|------|----------|--------|
| Public projects accessible | P0 | ⬜ |
| Private projects return 401 without auth | P0 | ⬜ |
| Login creates session cookie | P0 | ⬜ |
| Private projects accessible after login | P0 | ⬜ |
| Visibility toggle works | P1 | ⬜ |
| Non-members get 403 | P1 | ⬜ |
| Logout clears cookie | P2 | ⬜ |

---

## Troubleshooting

### Common Issues

#### 1. Session Cookie Not Set

**Symptom:** `__session` cookie not appearing after login

**Checks:**
```bash
# Verify cookie domain in response headers
curl -v https://dashboard.scrymore.com/api/auth/session \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"idToken":"..."}'

# Look for: Set-Cookie: __session=...; Domain=.scrymore.com
```

**Solutions:**
- Ensure `NODE_ENV=production` in dashboard
- Verify Firebase Admin SDK credentials
- Check for CORS issues

#### 2. CDN Returns 500 Error

**Symptom:** Private project access returns 500 instead of 401/403

**Checks:**
```bash
# Check Wrangler logs
wrangler tail --env staging

# Look for: [AUTH] or [VISIBILITY] error messages
```

**Solutions:**
- Verify `FIREBASE_PROJECT_ID` is set
- Check service account credentials
- Verify Firestore is accessible

#### 3. JWT Validation Fails

**Symptom:** Valid session cookie returns 401

**Checks:**
```bash
# Decode JWT to inspect claims
echo "<session-cookie>" | cut -d. -f2 | base64 -d | jq

# Verify issuer matches: https://session.firebase.google.com/<project-id>
```

**Solutions:**
- Ensure `FIREBASE_PROJECT_ID` matches JWT issuer
- Check if session cookie has expired
- Verify Google public keys are accessible

#### 4. Visibility Cache Stale

**Symptom:** Visibility change not reflected immediately

**Expected:** Changes should reflect within 60 seconds (cache TTL)

**Solutions:**
- Wait for cache expiration
- Clear KV cache manually if needed:
  ```bash
  wrangler kv:key delete --namespace-id=<id> "visibility:<project-id>"
  ```

### Debug Logging

Enable verbose logging in Wrangler:

```bash
# View real-time logs
wrangler tail --env staging --format pretty

# Filter for auth logs
wrangler tail --env staging | grep "\[AUTH\]"
```

### Rollback Procedure

If issues are detected in production:

```bash
# Rollback CDN Worker
wrangler rollback --env production

# Rollback Dashboard (Vercel)
vercel rollback
```

---

## Test Data Setup

### Create Test Projects in Firestore

```javascript
// Run in Firebase Console or via Admin SDK

// Public project
await db.collection('projects').doc('test-public').set({
  name: 'Test Public Project',
  visibility: 'public',
  memberIds: ['user-123'],
  ownerId: 'user-123',
});

// Private project
await db.collection('projects').doc('test-private').set({
  name: 'Test Private Project',
  visibility: 'private',
  memberIds: ['user-123', 'user-456'],
  ownerId: 'user-123',
});
```

### Upload Test Storybook

```bash
# Create minimal test content
mkdir -p test-storybook
echo "<html><body>Test Storybook</body></html>" > test-storybook/index.html

# Zip and upload to R2
zip -r test-storybook.zip test-storybook/
wrangler r2 object put scry-uploads/test-public/v1/storybook.zip --file test-storybook.zip
wrangler r2 object put scry-uploads/test-private/v1/storybook.zip --file test-storybook.zip
```

---

## QA Sign-Off

### Sign-Off Checklist

| Environment | Tester | Date | Status |
|-------------|--------|------|--------|
| Local | | | ⬜ |
| Staging | | | ⬜ |
| Production | | | ⬜ |

### Approval

- [ ] All P0 tests pass
- [ ] All P1 tests pass
- [ ] No regressions in existing functionality
- [ ] Performance within acceptable limits (<100ms latency impact)

**Approved by:** _______________  
**Date:** _______________
