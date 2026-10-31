// Writes app-config.json from environment variables so the keys are baked
// into the installer at build time and never committed.
const fs = require('fs');
const path = require('path');

const config = {
  googleClientId: process.env.DEXBROWSE_GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.DEXBROWSE_GOOGLE_CLIENT_SECRET || '',
  firebaseApiKey: process.env.DEXBROWSE_FIREBASE_API_KEY || '',
  firebaseProjectId: process.env.DEXBROWSE_FIREBASE_PROJECT_ID || ''
};

const target = path.join(__dirname, '..', 'app-config.json');
// Do not clobber a local config with empty values.
if (!fs.existsSync(target) || Object.values(config).some(Boolean)) {
  fs.writeFileSync(target, JSON.stringify(config, null, 2));
}
console.log('Google sync configured:', Object.values(config).every(Boolean));
