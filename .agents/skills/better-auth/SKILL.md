---
name: better-auth
description: Master authentication skill for Better Auth in TypeScript/JavaScript applications (Next.js, React, Node, Express, Hono, Astro, SvelteKit). Covers server/client configuration, database adapters (Prisma, Drizzle, MongoDB), OAuth providers, session handling, 2FA, multi-tenant organizations, rate limiting, and security hardening. Use whenever the user asks to implement authentication, login, signup, OAuth, sessions, or configure Better Auth.
license: MIT
compatibility: Google Antigravity, Next.js, Node.js, TypeScript
metadata:
  version: "1.0"
  framework: Better Auth
---

# Better Auth — Complete Authentication Suite

Comprehensive guide and orchestration for implementing authentication using [Better Auth](https://better-auth.com).

---

## 🚀 Key Modules Included in this Workspace

- [`create-auth`](file:///d:/Proyectos/vivoweb/.agents/skills/create-auth/SKILL.md) — Scaffold and implement authentication flows, framework detection, and route handlers.
- [`better-auth-best-practices`](file:///d:/Proyectos/vivoweb/.agents/skills/better-auth-best-practices/SKILL.md) — Server & client setup, env vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), database adapter wiring.
- [`better-auth-security-best-practices`](file:///d:/Proyectos/vivoweb/.agents/skills/better-auth-security-best-practices/SKILL.md) — CSRF protection, trusted origins, cookie encryption, rate limiting, and session security.
- [`email-and-password-best-practices`](file:///d:/Proyectos/vivoweb/.agents/skills/email-and-password-best-practices/SKILL.md) — Email verification, password reset flows, secure password hashing.
- [`two-factor-authentication-best-practices`](file:///d:/Proyectos/vivoweb/.agents/skills/two-factor-authentication-best-practices/SKILL.md) — TOTP, SMS/email OTP, backup codes, 2FA sign-in flow.
- [`organization-best-practices`](file:///d:/Proyectos/vivoweb/.agents/skills/organization-best-practices/SKILL.md) — Multi-tenancy, team management, custom roles, and RBAC permissions.

---

## ⚡ Quick Setup Pattern (Next.js App Router)

### 1. Server Configuration (`auth.ts` or `lib/auth.ts`)
```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

### 2. Route Handler (`app/api/auth/[...all]/route.ts`)
```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### 3. Client Instance (`lib/auth-client.ts`)
```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});
```
