'use strict';
const $ = (id) => document.getElementById(id);
let hasProfiles = false;

function show(name, message, isErr) {
  for (const s of ['login', 'create', 'recover']) $('s-' + s).hidden = s !== name;
  $('msg').textContent = message || '';
  $('msg').className = isErr ? 'err' : '';
  const first = { login: 'pass', create: 'c-name', recover: 'r-phrase' }[name];
  setTimeout(() => $(first).focus(), 30);
}

async function unlock() {
  const value = $('pass').value;
  if (!value) { show('login', 'Enter a passcode', true); return; }
  const r = await launcher.unlock(value);
  $('pass').value = '';
  if (!r.ok) show('login', r.error, true);
  else if (r.data.guest) show('login', 'Opening…');
  else if (r.data.opened) show('login', 'Opening…');
  else show('login', r.data.message, true);
}

async function create() {
  const r = await launcher.create({ name: $('c-name').value, passcode: $('c-pass').value, recovery: $('c-rec').value });
  if (!r.ok) { $('msg').textContent = r.error; $('msg').className = 'err'; return; }
  for (const id of ['c-name', 'c-pass', 'c-rec']) $(id).value = '';
  if (r.data.opened) { $('msg').textContent = 'Opening…'; return; }
  hasProfiles = true;
  show('login', r.data.message);
}

async function recover() {
  const r = await launcher.recover({ phrase: $('r-phrase').value, passcode: $('r-pass').value });
  if (!r.ok) { $('msg').textContent = r.error; $('msg').className = 'err'; return; }
  $('msg').textContent = 'Opening…';
}

$('open').addEventListener('click', unlock);
$('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
$('to-create').addEventListener('click', () => { $('create-title').textContent = 'Add profile'; show('create'); });
$('create-back').addEventListener('click', () => show(hasProfiles ? 'login' : 'create'));
$('create').addEventListener('click', create);
$('to-recover').addEventListener('click', () => show('recover'));
$('recover-back').addEventListener('click', () => show('login'));
$('recover').addEventListener('click', recover);
for (const id of ['c-name', 'c-pass', 'c-rec']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
for (const id of ['r-phrase', 'r-pass']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') recover(); });

function bindShow(box, ids) {
  $(box).addEventListener('change', () => { for (const id of ids) $(id).type = $(box).checked ? 'text' : 'password'; });
}
bindShow('c-show', ['c-pass', 'c-rec']);
bindShow('r-show', ['r-phrase', 'r-pass']);
$('pass').addEventListener('dblclick', () => { $('pass').type = $('pass').type === 'password' ? 'text' : 'password'; });

(async () => {
  const r = await launcher.state();
  hasProfiles = !!(r.ok && r.data.hasProfiles);
  if (hasProfiles) show('login');
  else { $('create-title').textContent = 'Create your browser profile'; $('create-back').hidden = true; show('create'); }
})();
