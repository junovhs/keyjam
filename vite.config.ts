import { defineConfig } from 'vitest/config';
import { dopedocs } from 'dopedocs/vite';
import { docs } from './src/docs-content';

// The optional SUPABASE_* variables let a deployment point at a different
// project than the shared one in src/state/supabase.ts. Empty means "use the
// shared project"; only a full pair overrides it.

// dopedocs builds every absolute URL in the static docs (canonical, og:url,
// JSON-LD ids, sitemap, llms.txt) from entity.url. Vercel sets
// VERCEL_PROJECT_PRODUCTION_URL on every build to the shortest production
// domain, so attaching a domain later changes the output with no edit here;
// a local build falls back to the document's own value.
const deployedHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteUrl = deployedHost ? `https://${deployedHost}` : docs.entity.url;

export default defineConfig({
  plugins: [
    // A real page per section at /docs/<id>, plus sitemap, robots and
    // llms.txt, from the same source as the in-app panel.
    dopedocs({
      docs: { ...docs, entity: { ...docs.entity, url: siteUrl } },
      entityType: 'SoftwareApplication',
      stylesheet: [true, '/docs-theme.css'],
      // The docs title is a sentence ("…A gentler approach."), so the default
      // "{title}" wording reads badly; name the manual instead.
      fullManualNote: {
        section: 'This page is one part of the KeyJam manual. The complete manual is a single page, short enough to read in one go: {link}',
        index: 'This page is the whole KeyJam manual: every section, about {words} words. It is short enough to read in one go.',
      },
    }),
  ],
  build: { outDir: 'dist', target: 'es2022' },
  define: {
    __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL ?? ''),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY ?? ''),
  },
  test: { environment: 'node' },
});
