---
name: Clerk post-login redirect
description: How to redirect users after sign-in with Clerk in this app
---

`afterSignInUrl` and `afterSignUpUrl` are NOT valid props on `<ClerkProvider>` in @clerk/react v5+. TypeScript will error with "Property does not exist".

**Why:** These props were removed/renamed in newer Clerk SDK versions. The ClerkProvider only accepts `signInUrl`, `signUpUrl`, and `afterSignOutUrl`.

**How to apply:** For post-sign-in routing, rely on the `HomeRedirect` component pattern — it checks `<Show when="signed-in">` and does `<Redirect to="/chat" />`. After Clerk completes sign-in and calls `routerPush("/")`, Wouter renders `HomeRedirect` which redirects signed-in users to `/chat`.
