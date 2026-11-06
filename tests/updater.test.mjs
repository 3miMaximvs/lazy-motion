import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Script,createContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {zipFixture} from './zip-fixture.mjs';
const require=createRequire(import.meta.url);
const {newer,version,releaseInfo,remote,createUpdater}=require('../updater/updater.cjs');
const exec=promisify(execFile);
test('all shipped PowerShell scripts parse as UTF-8',{skip:process.platform!=='win32'},async()=>{
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; foreach($file in @('scripts/install.ps1','scripts/package.ps1','updater/extract.ps1')) { $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText((Join-Path (Get-Location) $file)),[ref]$tokens,[ref]$errors); if($errors.Count) { throw ($file + ': ' + ($errors | Out-String)) } }"],{windowsHide:true});
});
const bundle='dev.lazyapps.motion';
const makeRelease=bytes=>({tag_name:'v0.2.0',draft:false,prerelease:false,body:'Une amélioration.',assets:[{name:'lazy-motion-0.2.0.zip',state:'uploaded',size:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),browser_download_url:'https://github.com/3miMaximvs/lazy-motion/releases/download/v0.2.0/lazy-motion-0.2.0.zip'}]});
async function fixture(t) {
  const base=path.resolve('artifacts');await fs.mkdir(base,{recursive:true});const temp=await fs.mkdtemp(path.join(base,'updater-test-'));
  t.after(async()=>{if(path.dirname(temp)!==base)throw new Error('Cleanup path refused');await fs.rm(temp,{recursive:true,force:true});});
  const root=path.join(temp,'extensions',bundle), storage=path.join(temp,'updates');
  await fs.mkdir(path.join(root,'CSXS'),{recursive:true});await fs.mkdir(path.join(root,'update'));
  await fs.writeFile(path.join(root,'build-info.json'),JSON.stringify({version:'0.1.0'}));
  await fs.writeFile(path.join(root,'CSXS/manifest.xml'),`<ExtensionManifest ExtensionBundleId="${bundle}" ExtensionBundleVersion="0.1.0"/>`);
  await fs.writeFile(path.join(root,'old.txt'),'previous release');await fs.copyFile('updater/extract.ps1',path.join(root,'update/extract.ps1'));
  const files={'build-info.json':JSON.stringify({version:'0.2.0'}),'CSXS/manifest.xml':`<ExtensionManifest ExtensionBundleId="${bundle}" ExtensionBundleVersion="0.2.0"/>`,'index.html':'html','panel.js':'new panel','styles.css':'css','host/main.jsx':'host','updater.cjs':'updater','update/extract.ps1':'extract'};
  const zip=zipFixture(Object.entries(files).map(([name,content])=>({name:`${bundle}/${name}`,content})));
  const release=makeRelease(zip);
  const request=async(url)=>url.endsWith('/latest')?Buffer.from(JSON.stringify(release)):zip;
  return {temp,root,storage,zip,release,request,options:{root,expected:root,storage,request}};
}
test('update versions compare numerically and reject ambiguous tags',()=>{
  assert.equal(newer('0.10.0','0.2.0'),true);assert.equal(newer('0.2.0','0.2.0'),false);assert.equal(newer('0.1.9','0.2.0'),false);
  for(const bad of ['v0.2.0','0.2','01.2.0','0.2.0-beta.1','0.2.0/../../x'])assert.throws(()=>version(bad));
});
test('only the expected public release asset with a GitHub SHA256 digest is accepted',()=>{
  const good=makeRelease(Buffer.from('zip'));assert.equal(releaseInfo(good,'0.1.0').available,true);
  for(const mutate of [r=>{r.prerelease=true},r=>{r.assets[0].digest=null},r=>{r.assets[0].browser_download_url='https://example.com/update.zip'},r=>{r.assets[0].size=30*1024*1024},r=>{r.tag_name='v../bad'}]){
    const copy=structuredClone(good);mutate(copy);assert.throws(()=>releaseInfo(copy,'0.1.0'));
  }
});
test('downloads forbid HTTP, credentials, unexpected hosts and ports',()=>{
  for(const url of ['http://github.com/x','https://evil.test/x','https://github.com.evil.test/x','https://user:pass@github.com/x','https://github.com:444/x','file:///C:/x'])assert.throws(()=>remote(url));
  assert.equal(remote('https://release-assets.githubusercontent.com/file').protocol,'https:');
});
test('release checks work with the two-argument HTTPS interface supplied by CEP',async t=>{
  const f=await fixture(t), exported={exports:{}};let calls=0;
  const cepHttps={get(options,listener){
    assert.equal(typeof listener,'function');assert.equal(options.hostname,'api.github.com');assert.equal(options.path,'/repos/3miMaximvs/lazy-motion/releases/latest');calls++;
    const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);
    const response=Readable.from([Buffer.from(JSON.stringify(f.release))]);response.statusCode=200;response.headers={};
    queueMicrotask(()=>listener(response));return req;
  }};
  const context=createContext({module:exported,require:name=>name==='node:https'?cepHttps:require(name),__dirname:path.resolve('updater'),process,Buffer,setTimeout,clearTimeout});
  new Script(await fs.readFile('updater/updater.cjs','utf8')).runInContext(context);
  const result=await exported.exports.createUpdater({root:f.root,expected:f.root,storage:f.storage}).check();
  assert.equal(result.available,true);assert.equal(calls,1);
});
test('a corrupt download leaves the current installation untouched',async t=>{
  const f=await fixture(t);const updater=createUpdater({...f.options,request:async url=>url.endsWith('/latest')?f.request(url):Buffer.from('corrupt')});
  await assert.rejects(updater.install('0.2.0'),/corrompue/);assert.equal(await fs.readFile(path.join(f.root,'old.txt'),'utf8'),'previous release');
});
test('stale requests and an unexpected install location cannot replace files',async t=>{
  const f=await fixture(t);await assert.rejects(createUpdater(f.options).install('0.3.0'),/changé/);
  await assert.rejects(createUpdater({...f.options,expected:path.join(f.temp,'other')}).install('0.2.0'),/habituel/);
  assert.equal(await fs.readFile(path.join(f.root,'old.txt'),'utf8'),'previous release');
});
test('a junction in the install path is rejected before downloading',async t=>{
  const f=await fixture(t);const link=path.join(f.temp,'linked');await fs.symlink(path.dirname(f.root),link,process.platform==='win32'?'junction':'dir');
  const root=path.join(link,bundle);await assert.rejects(createUpdater({...f.options,root,expected:root}).install('0.2.0'),/lien/);
});
test('real ZIP extraction installs the new bundle and retains the previous version', {skip:process.platform!=='win32'}, async t=>{
  const f=await fixture(t);const updater=createUpdater(f.options);assert.equal((await updater.check()).version,'0.2.0');
  const result=await updater.install('0.2.0');assert.equal(await fs.readFile(path.join(f.root,'panel.js'),'utf8'),'new panel');
  assert.equal(await fs.readFile(path.join(result.backup,'old.txt'),'utf8'),'previous release');assert.equal((await updater.check()).available,false);
});
test('incomplete bundles fail validation before touching the existing panel',async t=>{
  const f=await fixture(t);const updater=createUpdater({...f.options,extract:async(_zip,destination)=>{
    const next=path.join(destination,bundle);await fs.mkdir(path.join(next,'CSXS'),{recursive:true});await fs.writeFile(path.join(next,'build-info.json'),JSON.stringify({version:'0.2.0'}));await fs.writeFile(path.join(next,'CSXS/manifest.xml'),`<ExtensionManifest ExtensionBundleId="${bundle}" ExtensionBundleVersion="0.2.0"/>`);
  }});
  await assert.rejects(updater.install('0.2.0'));assert.equal(await fs.readFile(path.join(f.root,'old.txt'),'utf8'),'previous release');
});
test('a failed replacement restores the complete previous installation',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t);let moves=0;
  const updater=createUpdater({...f.options,move:async(from,to)=>{moves++;if(moves===2)throw Object.assign(new Error('locked'),{code:'EBUSY'});await fs.rename(from,to);}});
  await assert.rejects(updater.install('0.2.0'),/version précédente est conservée/);
  assert.equal(moves,3);assert.equal(await fs.readFile(path.join(f.root,'old.txt'),'utf8'),'previous release');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'build-info.json'),'utf8')).version,'0.1.0');
});
test('ZIP extraction refuses traversal, duplicate names, alternate streams and symlinks',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t);
  const badEntries=[{name:`${bundle}/../../escape.txt`},{name:`${bundle}/file.txt:evil`},{name:`${bundle}/CON.txt`},{name:`${bundle}/file`,attributes:0xa1ff0000},[{name:`${bundle}/file`},{name:`${bundle}/FILE`}]];
  for(let i=0;i<badEntries.length;i++) {
    const zip=path.join(f.temp,`bad-${i}.zip`), destination=path.join(f.temp,`bad-${i}`);await fs.writeFile(zip,zipFixture([badEntries[i]].flat()));
    await assert.rejects(exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('updater/extract.ps1'),'-Archive',zip,'-Destination',destination],{windowsHide:true}));
    await assert.rejects(fs.stat(destination),{code:'ENOENT'});
  }
});
