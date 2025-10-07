# Verification checklist — security/env-and-lint-fixes

Follow these steps after pulling the `security/env-and-lint-fixes` branch to verify changes and finish the manual rotation.

## 1) Rotate Supabase keys (MANDATORY)
- In the Supabase dashboard: revoke the old publishable key and create a new client key (rotate both project and keys if you suspect exposure).
- Update the key in your Hosting/CI secrets (Vercel/Netlify/etc): `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Locally: create a `.env` file (not committed) with values from the new keys. Example `.env` content is in `env.example`.

## 2) Local quick start
1. Install deps: `npm ci`
2. Start dev server: `npm run dev`
3. Open the app at the address shown by Vite (default http://localhost:8080).

## 3) Core manual test flows (smoke tests)
Perform these with a test user account.

- Authentication
  - Visit `/auth` and sign up a test user. Verify email flow if enabled.
  - Sign in and verify the dashboard page loads and user details appear.
  - Sign out and confirm redirect to `/auth`.

- Students
  - Go to `/students` and add a new student. Verify success toast appears and student appears in list.
  - Edit the student and confirm updates persist.
  - Delete the student and confirm removal.

- Payments / Fee folders
  - Create a payment (or use existing sample data). Confirm fee folders or related DB triggers ran (see toast success messages).
  - Verify remaining fees page updates accordingly.

- Reports & Dashboard
  - Open `/reports` and `/dashboard` pages; confirm charts and summary data load.

## 4) Lint / Build checks
- Run lint: `npm run lint` (there may still be warnings/errors outside the files we touched). We fixed top items in `CurrencyContext`, `useAuth`, and `Students`.
- Build: `npm run build` — ensure it completes. If you see the chunk-size warning, it's informational.

## 5) PR / Merge checklist
- Ensure CI has the new `VITE_*` secrets (so builds succeed on merge).
- After merge, verify production deployment uses rotated keys.

## Notes
- I updated the Supabase client to read env vars and added `env.example`. I redacted the local `.env` in the working tree, but you must rotate the key in Supabase because history may still include the old key.
