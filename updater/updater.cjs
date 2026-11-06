'use strict';
// Runs in CEP's separate Node context. No remote page or user-supplied URL is loaded.
const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const REPOSITORY = '3miMaximvs/lazy-motion';
const BUNDLE = 'dev.lazyapps.motion';
const LIMIT = 20 * 1024 * 1024;

function version(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Version de release invalide.');
  const parts = value.split('.').map(Number);
  if (parts.some(n => !Number.isSafeInteger(n))) throw new Error('Version de release invalide.');
  return parts;
}
function newer(a, b) {
  const x = version(a), y = version(b);
  for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
  return false;
}
function remote(value, api = false) {
  const u = new URL(value);
  const hosts = api ? ['api.github.com'] : ['github.com', 'release-assets.githubusercontent.com'];
  if (u.protocol !== 'https:' || !hosts.includes(u.hostname) || u.username || u.password || u.port || u.hash) throw new Error('Adresse de téléchargement refusée.');
  return u;
}
function download(url, limit, api = false, redirects = 0) {
  return new Promise((resolve, reject) => {
    let req;
    const deadline = setTimeout(() => req?.destroy(new Error('Le téléchargement a expiré. Réessaie.')), 90000);
    const finish = (error, data) => { clearTimeout(deadline); error ? reject(error) : resolve(data); };
    try {
      const u = remote(url, api);
      // CEP's patched HTTPS API supports the two-argument options form.
      // Its URL/options/callback overload can treat the options as a listener.
      req = https.get({ protocol:u.protocol, hostname:u.hostname, path:u.pathname+u.search, headers: { 'User-Agent': 'Lazy-Motion-Updater', 'Accept': api ? 'application/vnd.github+json' : 'application/octet-stream' } }, res => {
        if ([301,302,303,307,308].includes(res.statusCode)) {
          res.resume(); clearTimeout(deadline);
          if (api || redirects >= 5 || !res.headers.location) return reject(new Error('Redirection refusée.'));
          download(new URL(res.headers.location, u).href, limit, false, redirects + 1).then(resolve, reject); return;
        }
        if (res.statusCode !== 200) { res.resume(); finish(new Error(res.statusCode === 404 ? 'Aucune release disponible pour le moment.' : res.statusCode === 403 || res.statusCode === 429 ? 'GitHub limite les recherches. Réessaie plus tard.' : `GitHub ne répond pas (${res.statusCode}).`)); return; }
        if (Number(res.headers['content-length']) > limit) { res.destroy(); finish(new Error('Téléchargement trop volumineux.')); return; }
        const chunks = []; let size = 0;
        res.on('data', chunk => { size += chunk.length; if (size > limit) res.destroy(new Error('Téléchargement trop volumineux.')); else chunks.push(chunk); });
        res.on('error', error => finish(error));
        res.on('end', () => finish(null, Buffer.concat(chunks)));
      });
      req.setTimeout(20000, () => req.destroy(new Error('Connexion interrompue. Réessaie.')));
      req.on('error', error => finish(error));
    } catch (error) { finish(error); }
  });
}
function releaseInfo(data, current) {
  if (data.draft || data.prerelease || !/^v/.test(data.tag_name)) throw new Error('Release stable introuvable.');
  const next = data.tag_name.slice(1); version(next); version(current);
  const name = `lazy-motion-${next}.zip`;
  const asset = data.assets?.find(a => a.name === name);
  if (!asset || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > LIMIT || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error('Release incomplète : archive vérifiable introuvable.');
  const expected = `https://github.com/${REPOSITORY}/releases/download/v${next}/${name}`;
  if (asset.browser_download_url !== expected) throw new Error('Origine de la release refusée.');
  return { version: next, available: newer(next, current), url: expected, sha256: asset.digest.slice(7), size: asset.size, notes: String(data.body || '').slice(0,5000) };
}
async function noLinks(target) {
  const absolute = path.resolve(target);
  let cursor = path.parse(absolute).root;
  for (const component of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Un lien occupe le dossier d’installation.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function validateBundle(root, expectedVersion) {
  const info = JSON.parse(await fs.readFile(path.join(root, 'build-info.json'), 'utf8'));
  const manifest = await fs.readFile(path.join(root, 'CSXS/manifest.xml'), 'utf8');
  if (info.version !== expectedVersion || !manifest.includes(`ExtensionBundleId="${BUNDLE}"`) || !manifest.includes(`ExtensionBundleVersion="${expectedVersion}"`)) throw new Error('Le contenu ne correspond pas à la release.');
  for (const file of ['index.html','panel.js','styles.css','host/main.jsx','updater.cjs','update/extract.ps1']) {
    if (!(await fs.lstat(path.join(root, file))).isFile()) throw new Error('Archive incomplète.');
  }
}
function createUpdater(options = {}) {
  const root = path.resolve(options.root || __dirname);
  const expected = path.resolve(options.expected || path.join(process.env.APPDATA || '', 'Adobe/CEP/extensions', BUNDLE));
  // Staging and backups stay on the same volume, outside Adobe's extension discovery folder.
  const storage = path.resolve(options.storage || path.join(path.dirname(path.dirname(expected)), '.lazy-motion-updates'));
  const request = options.request || download;
  const move = options.move || fs.rename;
  const extract = options.extract || (async (zip, destination) => {
    if (process.platform !== 'win32') throw new Error('La mise à jour intégrée est disponible sur Windows.');
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    await exec(ps, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'update/extract.ps1'),'-Archive',zip,'-Destination',destination], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  });
  let busy = false;
  async function currentVersion() { return JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8')).version; }
  async function check() {
    const data = JSON.parse((await request(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, 1024 * 1024, true)).toString('utf8'));
    return releaseInfo(data, await currentVersion());
  }
  async function install(wanted) {
    if (busy) throw new Error('Une mise à jour est déjà en cours.');
    busy = true;
    let backup, moved = false;
    try {
      if (root.toLowerCase() !== expected.toLowerCase() || path.basename(root) !== BUNDLE) throw new Error('Installe d’abord Lazy Motion dans son dossier Adobe habituel.');
      await noLinks(root); await noLinks(storage);
      const info = await check();
      if (!info.available || info.version !== wanted) throw new Error('La release a changé. Relance la recherche de mise à jour.');
      const installed = await fs.readFile(path.join(root,'CSXS/manifest.xml'),'utf8');
      if (!installed.includes(`ExtensionBundleId="${BUNDLE}"`)) throw new Error('Installation existante non reconnue.');
      await fs.mkdir(storage, { recursive: true });
      const id = crypto.randomBytes(12).toString('hex');
      const job = path.join(storage, `update-${id}`);
      await fs.mkdir(job);
      const zip = path.join(job,'release.zip');
      const bytes = await request(info.url, LIMIT);
      if (bytes.length !== info.size || crypto.createHash('sha256').update(bytes).digest('hex') !== info.sha256) throw new Error('L’archive reçue est corrompue. Aucune modification effectuée.');
      await fs.writeFile(zip, bytes, { flag: 'wx' });
      const unpacked = path.join(job,'unpacked');
      await extract(zip, unpacked);
      const stage = path.join(unpacked, BUNDLE);
      await validateBundle(stage, info.version);
      backup = path.join(job,'previous');
      await move(root, backup); moved = true;
      await move(stage, root); moved = false;
      await fs.writeFile(path.join(job,'result.json'), JSON.stringify({ version: info.version, installedAt: new Date().toISOString(), backup }, null, 2)).catch(() => {});
      return { version: info.version, backup };
    } catch (error) {
      if (moved) {
        try { await move(backup, root); }
        catch { throw new Error('Mise à jour interrompue. La version précédente est conservée dans le dossier de sauvegarde Lazy Motion.'); }
      }
      if (['EPERM','EACCES','EBUSY'].includes(error.code)) throw new Error('Windows bloque le remplacement du panneau. Ferme ses autres fenêtres et réessaie. La version précédente est conservée.');
      throw error;
    } finally { busy = false; }
  }
  return { check, install };
}
module.exports = { createUpdater, version, newer, releaseInfo, remote, noLinks, validateBundle };
