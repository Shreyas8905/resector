// Static export of the frontend into desktop/build/frontend.
// Sets NEXT_PUBLIC_API_URL to "" (same-origin: the backend serves the pages) on purpose:
// a process env var beats frontend/.env.local, so your dev URL is not baked in.
import { spawnSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..", "..", "frontend");
const out = resolve(here, "..", "build", "frontend");

const r = spawnSync("npm", ["run", "build"], {
  cwd: frontend,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_API_URL: "", DESKTOP_BUILD: "1" },
});
if (r.status !== 0) process.exit(r.status ?? 1);

const exported = join(frontend, "out");
if (!existsSync(exported)) {
  console.error("frontend/out was not produced. Is next.config.ts the desktop-aware version?");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(exported, out, { recursive: true });
console.log(`Frontend ready: ${out}`);
