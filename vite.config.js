import { defineConfig } from "vite";
import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    {
      name: "offline-pack",
      closeBundle() {
        for (const p of ["assets", "icons", "manifest.webmanifest"])
          cpSync(p, join("dist", p), { recursive: true });
        const walk = (d) =>
          readdirSync(d, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
          );
        const html = readFileSync("dist/index.html", "utf8").replace(
          /href="[^"]*manifest-[^"]*\.webmanifest"/,
          'href="./manifest.webmanifest"',
        );
        writeFileSync("dist/index.html", html);
        const files = walk("dist").filter((p) => !p.endsWith("sw.js"));
        const version = createHash("sha256");
        files.forEach((f) => version.update(readFileSync(f)));
        const urls = ["./", ...files.map((f) => "./" + f.slice(5))];
        writeFileSync(
          "dist/sw.js",
          `const CACHE='pocket-forest-${version.digest("hex").slice(0, 12)}';const FILES=${JSON.stringify(urls)};
 self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
 self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pocket-forest-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
 self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const response=await cache.match(event.request);if(response)return response;try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return cache.match('./index.html');throw error;}}));});`,
        );
      },
    },
  ],
});
