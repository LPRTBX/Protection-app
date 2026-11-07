/**
 * Builds the REAL Protection app (same sources, same kernel, same configuration) into ONE self-contained HTML fragment for an
 * isolated review preview. Nothing here changes app behaviour: only packaging differs (relative base, one inlined script and
 * stylesheet, the two logo files embedded as data URIs). The output is for review only; it is not the published app.
 *
 *   node scripts/build-review-preview.mjs [outFile]      (default dist/review-preview/review-preview.html)
 *
 * The fragment starts with <title> and <style> and contains no <html>/<head>/<body>, so it can be hosted by a page wrapper.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(path.join(root, "package.json"));
const { build } = require("vite");
const react = require("@vitejs/plugin-react");
const out = path.resolve(process.argv[2] ?? path.join(root, "dist/review-preview/review-preview.html"));
const work = path.join(root, "dist/review-preview/_work");
const SENTINEL = "__REVIEW_BASE__/";

await build({
  configFile: false,
  root,
  base: SENTINEL,
  logLevel: "warn",
  plugins: [(react.default ?? react)()],
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    outDir: work,
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app[extname]" } },
  },
});

const files = readdirSync(work);
const jsFile = files.find((f) => f.endsWith(".js"));
const cssFile = files.find((f) => f.endsWith(".css"));
if (!jsFile || !cssFile) throw new Error(`Expected one script and one stylesheet in ${work}, found: ${files.join(", ")}`);
let js = readFileSync(path.join(work, jsFile), "utf8");
const css = readFileSync(path.join(work, cssFile), "utf8");

// The only runtime assets are the two logos. Drop the sentinel base, then embed each file where its name appears.
js = js.split(SENTINEL).join("");
for (const name of ["jaldo-logo-navy.webp", "jaldo-logo-white.webp"]) {
  const data = readFileSync(path.join(root, "public/brand", name)).toString("base64");
  const uri = `data:image/webp;base64,${data}`;
  if (!js.includes(`brand/${name}`)) throw new Error(`Logo reference brand/${name} not found in the bundle`);
  js = js.split(`brand/${name}`).join(uri);
}
// The app builds each logo path as `${base}brand/<file>`; with the file now a data URI the base prefix must go too.
js = js.replace(/\$\{[A-Za-z_$][\w$]*\}data:image\/webp/g, "data:image/webp");
if (/\}data:image\/webp/.test(js)) throw new Error("A logo data URI is still prefixed by a base expression");
if (js.includes(SENTINEL)) throw new Error("Unreplaced base sentinel left in the bundle");
// A literal closing tag inside inline script would end it early.
const safeJs = js.replace(/<\/script/gi, "<\\/script");

let sha = "unknown";
try { sha = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch { /* not a checkout */ }

const html = `<title>Protection Review Preview</title>
<meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap">
<style>
.review-banner{margin:0;padding:.45rem 1rem;background:#102d39;color:#fff;font:600 13px/1.5 Inter,system-ui,sans-serif}
.review-banner span{font-weight:500;opacity:.92}
${css}
</style>
<p class="review-banner" role="note" data-testid="review-banner">Review preview, not the published app. <span>Built from source commit ${sha}. Fictional data, in this browser tab only; nothing is saved or sent.</span></p>
<div id="root"></div>
<script>
/* Preview wrapper only, not app code. Some hosts serve this page inside a sandboxed srcdoc frame, where following a "#/route"
   link replaces the whole document. Route changes are done in place instead; the app reads location.hash and listens for
   hashchange exactly as it does when published. */
(function () {
  function go(hash) { try { history.pushState(null, "", hash); } catch (e) { location.hash = hash; return; } window.dispatchEvent(new HashChangeEvent("hashchange")); }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null;
    if (!a) return;
    e.preventDefault(); go(a.getAttribute("href"));
  }, true);
  window.addEventListener("popstate", function () { window.dispatchEvent(new HashChangeEvent("hashchange")); });
})();
</script>
<script>${safeJs}</script>
`;
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB, source ${sha})`);
