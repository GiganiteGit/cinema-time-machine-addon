// Local dev / self-host server for the Cinema Time Machine addon.
// Run:  npm run addon         (= node --env-file=.env.local server.js)
//
// We wrap the SDK's getRouter() in Express (rather than serveHTTP) so a config
// page / config-in-URL middleware can be slotted in later (plan §5), same shape
// as the sensitivity addon. MVP has no config, so Phase 1 stays minimal.
//
// NOTE: this project's Express is v5 (sensitivity used v4). Routes here are kept
// to plain string paths, which are v5-safe; the SDK router compiles its own
// routes internally with its bundled Express, so its param patterns are fine.
'use strict';

const path = require('path');
const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./src/addon');

const port = Number(process.env.PORT) || 7000;
const app = express();
app.disable('x-powered-by');

// Static assets (logo/background land in Phase 5). Harmless while empty.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// The SDK router: serves /manifest.json and the catalog resource.
// (express.static above already serves the landing page at / plus the assets.)
app.use(getRouter(addonInterface));

app.listen(port, () => {
  const base = `http://127.0.0.1:${port}`;
  console.log(`Cinema Time Machine addon listening on ${base}`);
  console.log(`  Landing:  ${base}/`);
  console.log(`  Manifest: ${base}/manifest.json`);
});
