/**
 * Bundles the real SAAF policy modules into docs/saaf-guard.js for GitHub Pages.
 *
 *   node docs/playground/build.mjs
 *
 * Output is a browser IIFE exposing a global `SAAF`. It is committed so the
 * Pages site needs no build step in CI.
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];

/**
 * esbuild does not apply resolveExtensions to paths returned from onResolve,
 * so find the concrete file ourselves.
 */
function resolveFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = path.join(base, "index" + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** src/lib/hash.ts imports node:crypto; substitute a verified pure-JS SHA-256. */
const aliasPlugin = {
  name: "saaf-browser-alias",
  setup(b) {
    b.onResolve({ filter: /^node:crypto$/ }, () => ({
      path: path.join(here, "sha256-browser.js"),
    }));
    b.onResolve({ filter: /^@\// }, (args) => {
      const resolved = resolveFile(path.join(root, "src", args.path.slice(2)));
      if (!resolved) return { errors: [{ text: `cannot resolve ${args.path}` }] };
      return { path: resolved };
    });
  },
};

await build({
  entryPoints: [path.join(here, "entry.ts")],
  outfile: path.join(root, "docs", "saaf-guard.js"),
  bundle: true,
  format: "iife",
  globalName: "SAAF",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  plugins: [aliasPlugin],
  logLevel: "info",
});
