import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../COMPASS/package.json',import.meta.url));
const {load}=require('js-yaml');
const text=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const yaml=name=>load(text(name));
const lock=JSON.parse(text('image-lock.json'));

test('proposal uses the locked image with isolated non-root resource caps',()=>{
 for(const [name,service,memory,pids]of [['compose.daemon.proposal.yml','clamd','4g',128],['compose.update.proposal.yml','freshclam','3g',64]]){
  const doc=yaml(name),s=doc.services[service];
  assert.deepEqual(Object.keys(doc.services),[service]);
  assert.equal(s.image,lock.image);assert.equal(s.user,'1000:1000');
  assert.equal(s.mem_limit,memory);assert.equal(s.memswap_limit,memory);assert.equal(s.cpus,'2.0');assert.equal(s.pids_limit,pids);
  assert.equal(s.read_only,true);assert.deepEqual(s.cap_drop,['ALL']);assert.deepEqual(s.security_opt,['no-new-privileges:true']);
  assert(!s.ports&&!s.profiles&&!s.labels&&!s.privileged&&!s.network_mode);
  assert.deepEqual(s.environment,{TZ:'Etc/UTC'});
  assert(s.volumes.every(v=>v.type==='bind'&&v.bind.create_host_path===false&&!v.source.includes('docker.sock')));
 }
});
test('keeps the one-shot updater outside the daemon compose and preserves database validation',()=>{
 const daemon=yaml('compose.daemon.proposal.yml'),update=yaml('compose.update.proposal.yml');
 assert.notEqual(daemon.name,update.name);
 assert.equal(daemon.networks.scanner_private.external,true);
 assert.match(daemon.networks.scanner_private.name,/\$\{.*:\?/);
 assert.deepEqual(update.services.freshclam.networks,['signature_updates']);
 assert.deepEqual(daemon.services.clamd.entrypoint,['clamd']);
 assert.deepEqual(update.services.freshclam.entrypoint,['freshclam']);
 assert.equal(update.services.freshclam.restart,'no');
 assert(!update.services.freshclam.command.includes('--daemon'));
 assert.equal(daemon.services.clamd.volumes.find(v=>v.target==='/var/lib/clamav').read_only,true);
 assert.equal(update.services.freshclam.volumes.find(v=>v.target==='/var/lib/clamav').read_only,undefined);
 assert.match(text('clamd-health.conf'),/^TCPAddr 127\.0\.0\.1$/m);
 assert.match(text('freshclam.serialized.conf'),/^TestDatabases yes$/m);
 assert(!/^NotifyClamd /m.test(text('freshclam.serialized.conf')));
 const canonical=text('freshclam.conf').split('\n').filter(line=>line&&!/^(Checks|NotifyClamd) /.test(line)).join('\n');
 assert.equal(text('freshclam.serialized.conf').split('\n').filter(line=>line&&!line.startsWith('#')).join('\n'),canonical);
});
