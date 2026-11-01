// Profile registry. Every profile has its own passcode (like the phone app): typing a passcode
// opens the profile it belongs to, so profiles are never listed to someone who does not know them.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COLORS = ['#FB542B', '#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#64748B'];

function hashSecret(value) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(value), salt, 32);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}
function checkSecret(value, salt, hash) {
  if (!salt || !hash) return false;
  try {
    const a = crypto.scryptSync(String(value), Buffer.from(salt, 'base64'), 32);
    const b = Buffer.from(hash, 'base64');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function createProfiles(rootDir) {
  const file = path.join(rootDir, 'profiles.json');

  function read() {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')).profiles || []; } catch (_) { list = []; }
    if (!list.some((p) => p.id === 'default')) list.unshift({ id: 'default', name: 'Default', color: COLORS[0] });
    return list;
  }
  function write(list) {
    fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ profiles: list }));
  }
  const pub = (p) => p && { id: p.id, name: p.name, color: p.color, hasRecovery: !!p.rhash };
  const claimed = (list) => list.filter((p) => p.hash);

  const hasAny = () => claimed(read()).length > 0;
  const get = (id) => pub(read().find((p) => p.id === id && p.hash));

  function match(passcode) {
    if (!passcode) return null;
    return pub(claimed(read()).find((p) => checkSecret(passcode, p.salt, p.hash)));
  }
  function matchRecovery(phrase) {
    if (!phrase) return null;
    return pub(claimed(read()).find((p) => checkSecret(phrase, p.rsalt, p.rhash)));
  }
  const passcodeTaken = (list, passcode, exceptId) =>
    claimed(list).some((p) => p.id !== exceptId && checkSecret(passcode, p.salt, p.hash));

  function create({ name, passcode, recovery, color }) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new Error('Enter a profile name');
    if (!passcode) throw new Error('Enter a passcode (any length)');
    const list = read();
    if (passcodeTaken(list, passcode)) throw new Error('That passcode is already used by another profile');
    const target = list.find((p) => p.id === 'default' && !p.hash)
      || { id: 'p-' + crypto.randomBytes(5).toString('hex') };
    if (!list.includes(target)) list.push(target);
    Object.assign(target, {
      name: clean,
      color: COLORS.includes(color) ? color : COLORS[claimed(list).length % COLORS.length],
      ...hashSecret(passcode)
    });
    if (recovery) {
      const r = hashSecret(recovery);
      target.rsalt = r.salt;
      target.rhash = r.hash;
    }
    write(list);
    return pub(target);
  }

  function update(id, patch) {
    const list = read();
    const p = list.find((x) => x.id === id && x.hash);
    if (!p) throw new Error('Profile not found');
    if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim().slice(0, 40);
    if (COLORS.includes(patch.color)) p.color = patch.color;
    if (patch.recovery) {
      const r = hashSecret(patch.recovery);
      p.rsalt = r.salt;
      p.rhash = r.hash;
    }
    write(list);
    return pub(p);
  }

  function setPasscode(id, passcode) {
    if (!passcode) throw new Error('Enter a passcode (any length)');
    const list = read();
    const p = list.find((x) => x.id === id && x.hash);
    if (!p) throw new Error('Profile not found');
    if (passcodeTaken(list, passcode, id)) throw new Error('That passcode is already used by another profile');
    Object.assign(p, hashSecret(passcode));
    write(list);
  }

  const verify = (id, passcode) => {
    const p = read().find((x) => x.id === id && x.hash);
    return !!p && checkSecret(passcode, p.salt, p.hash);
  };

  function remove(id) {
    let list = read();
    if (id === 'default') {
      const d = list.find((p) => p.id === 'default');
      for (const k of ['hash', 'salt', 'rhash', 'rsalt']) delete d[k];
      d.name = 'Default';
    } else {
      list = list.filter((p) => p.id !== id);
    }
    write(list);
  }

  // Data folders of profiles that no longer exist (removed while their folder was still open).
  function cleanOrphans() {
    const dir = path.join(rootDir, 'Profiles');
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { return; }
    const keep = new Set(read().map((p) => p.id));
    for (const n of names) {
      if (!keep.has(n)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
    }
  }

  return { COLORS, hasAny, get, match, matchRecovery, create, update, setPasscode, verify, remove, cleanOrphans };
}

module.exports = { createProfiles };
