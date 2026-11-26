// Illini Scheduler's HTTP API on Supabase Edge Functions. The code is in api/ (docs/BACKEND.md):
// `cd api && npm run bundle` writes bundle.js next to this file, and .github/workflows/api.yml deploys both.
export { default } from "./bundle.js";
