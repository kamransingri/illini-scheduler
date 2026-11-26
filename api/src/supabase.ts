// The API as a Supabase Edge Function named `api` (docs/BACKEND.md). `npm run bundle` builds this file and everything
// it imports into one file, supabase/functions/api/bundle.js, which supabase/functions/api/index.ts serves. Supabase
// puts the function's name in front of every path (/api/v1/terms) and sets SUPABASE_URL to the project's address.
import { createApi, liveSource } from "./index";
import { memoryLimiter } from "./limit";

declare const Deno: { env: { get(name: string): string | undefined } } | undefined;
const env = (name: string) => (typeof Deno === "undefined" ? undefined : Deno.env.get(name));
const project = env("SUPABASE_URL");

export default createApi(() => liveSource(env("DATA_URL")), {
  basePath: "/api",
  publicUrl: project ? `${project.replace(/\/+$/, "")}/functions/v1/api` : undefined,
  limit: memoryLimiter(),
});
