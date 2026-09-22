// Registry HTTP only: never starts Docker or downloads image layers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const lock=JSON.parse(await readFile(new URL('../../ops/academy/clamav/image-lock.json',import.meta.url),'utf8'));
assert.equal(lock.repository,'clamav/clamav');
assert.match(lock.digest,/^sha256:[a-f0-9]{64}$/);
assert(lock.image.endsWith('@'+lock.digest));
assert(Date.now()<Date.parse(lock.supportUntil+'T00:00:00Z'),'Pinned ClamAV support window has ended; review and update the image.');
const auth=await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${lock.repository}:pull`,{signal:AbortSignal.timeout(20000)});
assert(auth.ok,'Registry authorization unavailable');
const {token}=await auth.json();
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json'};
async function manifest(digest){
    const response=await fetch(`https://registry-1.docker.io/v2/${lock.repository}/manifests/${digest}`,{headers,signal:AbortSignal.timeout(20000)});
    assert(response.ok,'Pinned manifest unavailable');
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),digest);
    return JSON.parse(bytes.toString('utf8'));
}
const index=await manifest(lock.digest);
for(const [platform,digest] of Object.entries(lock.platforms)){
    const [os,architecture]=platform.split('/');
    const entry=index.manifests.find(m=>m.platform?.os===os&&m.platform?.architecture===architecture);
    assert.equal(entry?.digest,digest,`Missing pinned ${platform}`);
    const image=await manifest(digest);
    assert(image.config?.digest&&image.layers?.length>0);
}
console.log(JSON.stringify({image:lock.image,platforms:Object.keys(lock.platforms),verified:true}));
