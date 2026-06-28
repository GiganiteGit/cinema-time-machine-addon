// Wire the manifest + handlers into an addon interface.
'use strict';

const { addonBuilder } = require('stremio-addon-sdk');
const manifest = require('./manifest');
const catalogHandler = require('./handlers/catalog');

const builder = new addonBuilder(manifest);
builder.defineCatalogHandler(catalogHandler);

module.exports = builder.getInterface();
