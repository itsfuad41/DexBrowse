// Google / Firebase keys. Written into app-config.json at build time from CI
// secrets (see scripts/write-config.js); environment variables win for local runs.
const fs = require('fs');
const path = require('path');

let file = {};
try {
  file = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8'));
} catch (_) {
  file = {};
}

const pick = (key, env) => process.env[env] || file[key] || '';

module.exports = {
  googleClientId: pick('googleClientId', 'DEXBROWSE_GOOGLE_CLIENT_ID'),
  googleClientSecret: pick('googleClientSecret', 'DEXBROWSE_GOOGLE_CLIENT_SECRET'),
  firebaseApiKey: pick('firebaseApiKey', 'DEXBROWSE_FIREBASE_API_KEY'),
  firebaseProjectId: pick('firebaseProjectId', 'DEXBROWSE_FIREBASE_PROJECT_ID')
};
