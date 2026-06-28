# Deploying to BeamUp

BeamUp is Stremio's free, community-run PaaS for addons (Dokku under the hood, so a
**persistent process** — our durable Supabase cache works regardless, but a long-running
host keeps cold-starts rare). This deploys to the **public** service.

## Repo readiness (already done)

- `Procfile` → `web: node server.js` so BeamUp runs the addon, not the dormant Next app.
- `package.json`: `heroku-postbuild` no-op (suppresses an unwanted `next build`) and
  `engines.node >= 20` (we rely on global `fetch`).
- `server.js` already honours the injected `PORT`.
- Manifest `logo`/`background` and the landing page come from `ADDON_BASE_URL` (set it in step 4).

## Prerequisites

- Node 20+, a GitHub account, and your **SSH key added to GitHub** (BeamUp auths via it —
  already set up from the sensitivity addon).
- Everything committed and pushed — BeamUp deploys committed code.

## Steps

1. **Install the CLI:** `npm install -g beamup-cli`
2. **Configure once:** `beamup config`
   - Host: `a.baby-beamup.club`
   - Your GitHub username
3. **Deploy:** from the repo root, run `beamup`
   - First run adds a git remote and deploys. Later updates: `git push beamup main:master`
     (BeamUp's branch is `master`; force `+main:master` after any history rewrite, and a NEW
     commit SHA is needed to trigger a rebuild).
   - Note the **slug** and **URL** it prints — the app lands at roughly
     `https://<slug>.baby-beamup.club`, so the manifest is
     `https://<slug>.baby-beamup.club/manifest.json`.
   - Confirm the slug with `git remote -v` (it's in the beamup remote URL).
4. **Set the env vars** (secrets — never commit these). The addon needs:
   - `TMDB_READ_TOKEN` (or `TMDB_API_KEY`)
   - `SUPABASE_URL`, `SUPABASE_KEY` (the **anon/publishable** key, not service_role)
   - `ADDON_BASE_URL=https://<slug>.baby-beamup.club`

   Set each var in its **own** call — BeamUp's `config:set` silently keeps only the first
   when several are passed at once:
   ```
   ssh dokku@a.baby-beamup.club config:set <slug> TMDB_READ_TOKEN=...
   ssh dokku@a.baby-beamup.club config:set <slug> SUPABASE_URL=https://obmgtoznzsxrokqupreq.supabase.co
   ssh dokku@a.baby-beamup.club config:set <slug> SUPABASE_KEY=sb_publishable_...
   ssh dokku@a.baby-beamup.club config:set <slug> ADDON_BASE_URL=https://<slug>.baby-beamup.club
   ```
   Values come from your local `.env.local`. Env changes apply only after the full
   `beamup-trigger-swarm-sync` finishes (minutes) — wait for it before testing.
5. **Redeploy if needed** so the app picks up the env (`git push beamup main:master`, or `beamup`).
6. **Test:**
   - Open `https://<slug>.baby-beamup.club/` (landing) and `.../manifest.json` in a browser.
   - Install in Stremio via the manifest URL (or the landing page's **Install** button).
   - In Discover, pick a year on **Time Machine — Films/TV** and confirm titles render and
     play through your existing stream addons; check the **This Week, Years Ago** row.

## Notes (carried from the sensitivity addon)

- BeamUp hard-codes a 4h cache on `/manifest.json` (and Cloudflare edge-caches it), so manifest
  changes (logo, version, `ADDON_BASE_URL`) can take hours to propagate; `?cb=<rnd>` reads origin.
- `config:show` / `ps:restart` / `ps:rebuild` are unsupported on BeamUp — redeploy via git push.
- Host-agnostic: if you outgrow BeamUp or want a custom domain, Render/Railway run
  `node server.js` unchanged (set the same env vars there).
