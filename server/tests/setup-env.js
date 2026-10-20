// Loaded with `node --import` BEFORE any test file, so every module sees NODE_ENV=test.
// That switches the app to MONGODB_URI_TEST and activates the test-database guard in config/env.js.
process.env.NODE_ENV = 'test';
