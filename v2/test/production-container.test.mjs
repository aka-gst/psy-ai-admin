import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const v2Root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(v2Root, "..");

test("production build context contains every local dependency of the server entrypoint", () => {
  const config = JSON.parse(execFileSync("docker", [
    "compose",
    "-f",
    "docker-compose.production.yml",
    "config",
    "--format",
    "json",
    "--no-env-resolution",
  ], { cwd: v2Root, encoding: "utf8" }));

  const context = resolve(config.services["psy-admin-booking"].build.context);
  const source = readFileSync(resolve(repoRoot, "v2/server.mjs"), "utf8");
  const imports = [...source.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((match) => match[1]);
  const outside = imports
    .map((specifier) => resolve(repoRoot, "v2", specifier))
    .filter((dependency) => dependency !== context && !dependency.startsWith(`${context}${sep}`));

  if (outside.length) {
    throw new Error(`production build context excludes local dependencies:\n${outside.join("\n")}`);
  }
});
