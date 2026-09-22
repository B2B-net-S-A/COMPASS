import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,chmod,rm,lstat,symlink,link,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const original=await readFile(new URL('./install-node-runtime.sh',import.meta.url),'utf8');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const distribution='node-v22.23.0-linux-arm64';

// Exercise the actual shell control flow in a disposable directory. The copy
// rebases immutable paths/pins/UID and substitutes host facts; the shipped CLI
// has no environment/argument bypass. GNU stat/mv and flock get narrow shims on
// macOS. This is neither a real ARM executable nor a real flock concurrency test.
async function fixture({platform='Linux',arch='aarch64',outputVersion='v22.23.0'}={}){
 const root=await mkdtemp(join(tmpdir(),'academy-node-test-')),opt=join(root,'opt'),shims=join(root,'shims');
 await mkdir(opt,{mode:0o755});await mkdir(shims);
 const node=Buffer.from(`#!/bin/sh\nprintf '%s\\n' '${outputVersion}'\n`),license=Buffer.from('Synthetic license\n');
 const source=join(root,'source'),tree=join(source,distribution);
 await mkdir(join(tree,'bin'),{recursive:true});await writeFile(join(tree,'bin/node'),node,{mode:0o755});
 await writeFile(join(tree,'bin/npm'),'must not be installed');await writeFile(join(tree,'LICENSE'),license);
 const archivePath=join(root,'fixture.tar.gz');
 const packed=spawnSync('tar',['-czf',archivePath,'-C',source,distribution],{encoding:'utf8'});assert.equal(packed.status,0,packed.stderr);
 const archive=await readFile(archivePath);
 const shim=async(name,body)=>writeFile(join(shims,name),`#!${process.execPath}\n${body}\n`,{mode:0o755});
 await shim('stat',`const fs=require('node:fs'),a=process.argv.slice(2),s=fs.lstatSync(a.at(-1));const f=a[a.indexOf('-c')+1];const m={u:s.uid,g:s.gid,a:(s.mode&0o7777).toString(8),h:s.nlink,s:s.size};process.stdout.write(f.replace(/%([ugahs])/g,(_,k)=>String(m[k]))+'\\n');`);
 await shim('sha256sum',`const fs=require('node:fs'),crypto=require('node:crypto'),p=process.argv.at(-1);process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')+'  '+p+'\\n');`);
 await shim('flock','process.exit(0);');
 await shim('mv',`const fs=require('node:fs'),a=process.argv.slice(2);if(a[0]!=='-T'||a[1]!=='--'||a.length!==4||fs.existsSync(a[3]))process.exit(1);const mode=fs.statSync(a[2]).mode&0o777;fs.chmodSync(a[2],0o755);fs.renameSync(a[2],a[3]);fs.chmodSync(a[3],mode);`);
 await shim('rm',`const fs=require('node:fs'),path=require('node:path'),p=process.argv.at(-1);if(!p.startsWith(${JSON.stringify(root+'/')}))process.exit(1);function writable(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())return;if(s.isDirectory()){fs.chmodSync(p,0o700);for(const n of fs.readdirSync(p))writable(path.join(p,n));}}writable(p);fs.rmSync(p,{recursive:true,force:true});`);
 await shim('chown',`if(process.argv[2]!=='-R'||process.argv[3]!==${JSON.stringify(process.getuid()+':'+process.getgid())})process.exit(1);`);
 const rebased=original.replaceAll('/opt',opt)
  .replace('safe_directory /;',`safe_directory "${root}";`)
  .replace('readonly required_uid=0 required_gid=0',`readonly required_uid=${process.getuid()} required_gid=${process.getgid()}`)
  .replace('$(uname -s)',platform).replace('$(uname -m)',arch)
  .replace('export PATH=/usr/sbin:/usr/bin:/sbin:/bin',`export PATH="${shims}:${process.env.PATH}"`)
  .replace(/readonly archive_bytes=\d+/,`readonly archive_bytes=${archive.length}`)
  .replace(/readonly archive_sha=[a-f0-9]+/,`readonly archive_sha=${digest(archive)}`)
  .replace(/readonly node_sha=[a-f0-9]+/,`readonly node_sha=${digest(node)}`)
  .replace(/readonly license_sha=[a-f0-9]+/,`readonly license_sha=${digest(license)}`);
 const script=join(root,'installer.sh');await writeFile(script,rebased);
 const run=(args=['-'],input=archive)=>spawnSync('bash',[script,...args],{input,encoding:'utf8',timeout:10000});
 const target=join(opt,'compass-academy-node');
 return {root,opt,target,archive,node,run,staged:join(opt,'compass-academy-node-v22.23.0-linux-arm64.tar.gz'),
  close:async()=>{spawnSync('chmod',['-R','u+w',root]);await rm(root,{recursive:true,force:true});}};
}
const result=run=>{assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);};
const rejected=(run,error)=>{assert.notEqual(run.status,0);assert.equal(JSON.parse(run.stderr).error,error);};

test('ships fixed official pins and Linux/root/architecture guards, with no downloader or package manager',()=>{
 assert.match(original,/readonly archive_sha=0c96aa074abd109e0b5da8d10202a9bbcea9bcf9ddb587b20944f71b8f21f8c8/);
 assert.match(original,/readonly target=\/opt\/compass-academy-node\n/);
 assert.match(original,/readonly archive_bytes=56748954/);
 assert.match(original,/\$\(uname -s\).*Linux.*\$\(uname -m\).*aarch64.*\$\(id -u\)/);
 assert(!/\b(?:curl|wget|apt-get|apt|npm|docker)\s+(?:install|update|upgrade|run|pull|https:)/.test(original));
 assert.equal(spawnSync('bash',['-n'],{input:original,encoding:'utf8'}).status,0);
});
test('installs only node/license/manifest from stdin and repeats without replacing the binary',async()=>{
 const f=await fixture();try{
  assert.equal(result(f.run()).installed,true);
  assert.deepEqual((await readdir(f.target)).sort(),['LICENSE','bin','installed-runtime.txt']);
  assert.deepEqual(await readdir(join(f.target,'bin')),['node']);
  assert.deepEqual(await readFile(join(f.target,'bin/node')),f.node);
  for(const [path,mode]of [[f.target,0o555],[join(f.target,'bin'),0o555],[join(f.target,'bin/node'),0o555],[join(f.target,'LICENSE'),0o444]])assert.equal((await lstat(path)).mode&0o777,mode);
  const first=await lstat(join(f.target,'bin/node'));
  assert.equal(result(f.run()).installed,false);
  assert.equal((await lstat(join(f.target,'bin/node'))).ino,first.ino);
  assert(!(await readdir(f.opt)).some(name=>name.startsWith('.compass-academy-node-install.')&&name!=='.compass-academy-node-install.lock'));
 }finally{await f.close();}
});
test('accepts only the fixed private staged pathname and refuses arbitrary file arguments',async()=>{
 const f=await fixture();try{
  rejected(f.run(['/tmp/other.tar.gz']),'fixed_archive_input_required');
  await writeFile(f.staged,f.archive,{mode:0o600});assert.equal(result(f.run([f.staged],Buffer.alloc(0))).installed,true);
  await chmod(f.staged,0o644);rejected(f.run([f.staged],Buffer.alloc(0)),'unsafe_runtime_file');
 }finally{await f.close();}
});
test('wrong platform or architecture fails before installation',async()=>{
 for(const options of [{platform:'Darwin'},{arch:'x86_64'}]){const f=await fixture(options);try{rejected(f.run(),'linux_arm64_root_required');assert.deepEqual(await readdir(f.opt),[]);}finally{await f.close();}}
});
test('truncated, oversized and corrupt archives fail before creating the target',async()=>{
 const f=await fixture();try{
  rejected(f.run(['-'],f.archive.subarray(0,-1)),'runtime_archive_size_mismatch');
  rejected(f.run(['-'],Buffer.concat([f.archive,Buffer.from('extra')])),'runtime_archive_size_mismatch');
  const corrupted=Buffer.from(f.archive);corrupted[20]^=1;rejected(f.run(['-'],corrupted),'runtime_checksum_mismatch');
  assert(!(await readdir(f.opt)).includes('compass-academy-node'));
 }finally{await f.close();}
});
test('unknown version, changed binary and unexpected files are never overwritten',async()=>{
 for(const mutation of ['manifest','binary','extra']){const f=await fixture();try{
  result(f.run());await chmod(f.target,0o755);
  if(mutation==='manifest'){const p=join(f.target,'installed-runtime.txt');await chmod(p,0o644);await writeFile(p,'version=v99.0.0\n');await chmod(p,0o444);}
  if(mutation==='binary'){const p=join(f.target,'bin/node');await chmod(p,0o755);await writeFile(p,'unknown binary');await chmod(p,0o555);}
  if(mutation==='extra')await writeFile(join(f.target,'unexpected'),'preserve');
  await chmod(f.target,0o555);
  rejected(f.run(),{manifest:'existing_runtime_manifest_mismatch',binary:'runtime_checksum_mismatch',extra:'existing_runtime_unexpected_files'}[mutation]);
  if(mutation==='binary')assert.equal(await readFile(join(f.target,'bin/node'),'utf8'),'unknown binary');
 }finally{await f.close();}}
});
test('symlink parents/destinations and hardlinked binaries are refused',async()=>{
 for(const path of ['parent','target','binary']){const f=await fixture();try{
  if(path==='parent'){await rm(f.opt,{recursive:true});await symlink(f.root,f.opt);rejected(f.run(),'unsafe_runtime_directory');}
  if(path==='target'){await symlink(f.root,f.target);rejected(f.run(),'unsafe_runtime_directory');}
  if(path==='binary'){result(f.run());await link(join(f.target,'bin/node'),join(f.root,'hardlink'));rejected(f.run(),'unsafe_runtime_file');}
 }finally{await f.close();}}
});
test('bad runtime version and writable parent never produce an installed target',async()=>{
 const wrong=await fixture({outputVersion:'v22.0.0'});try{rejected(wrong.run(),'runtime_version_check_failed');assert(!(await readdir(wrong.opt)).includes('compass-academy-node'));}finally{await wrong.close();}
 const writable=await fixture();try{await chmod(writable.opt,0o777);rejected(writable.run(),'unsafe_runtime_directory');}finally{await writable.close();}
});
test('host wrappers prepend the scoped runtime path for non-interactive/systemd invocation',async()=>{
 for(const file of ['install-host.sh','host-control.sh','activate-host.sh']){
  const source=await readFile(new URL(file,import.meta.url),'utf8');
  assert.match(source,/export PATH=\/opt\/compass-academy-node\/bin:/);
 }
});
