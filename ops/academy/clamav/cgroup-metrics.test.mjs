import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseInspect,cgroupDirectory,parseCounters,evaluateMetrics} from './cgroup-metrics.mjs';

const id='a'.repeat(64);
const inspect=parseInspect(`${id} 1234 true 3221225472 3221225472 0 64\n`);
const healthy={peak:'2147483648\n',max:'3221225472\n',swap:'0\n',events:'low 0\nhigh 0\nmax 4\noom 0\noom_kill 0\n',cpu:'usage_usec 123456\nuser_usec 100000\nsystem_usec 23456\n'};

test('reads only a running container with a hard cap, disabled swap and no restart',()=>{
 assert.equal(inspect.memory,3221225472);
 for(const raw of [`${id} 0 true 3221225472 3221225472 0 64`,`${id} 1234 false 3221225472 3221225472 0 64`,`${id} 1234 true 3221225472 6442450944 0 64`,`${id} 1234 true 3221225472 3221225472 1 64`])assert.throws(()=>parseInspect(raw));
});

test('requires a matching cgroup v2 path within the cgroup filesystem',()=>{
 assert.equal(cgroupDirectory(`0::/system.slice/docker-${id}.scope\n`,id),`/sys/fs/cgroup/system.slice/docker-${id}.scope`);
 for(const raw of [`2:memory:/docker/${id}`,`0::/docker/${'b'.repeat(64)}`,`0::/../docker/${id}`,`0::/docker/${id}\n0::/docker/${id}`])assert.throws(()=>cgroupDirectory(raw,id));
});

test('reports measured peak and CPU but fails closed on OOM, swap, missing counters or cap drift',()=>{
 assert.deepEqual(evaluateMetrics({phase:'update',inspect,metrics:healthy}),{phase:'update',memoryPeakBytes:2147483648,memoryMaxBytes:3221225472,memoryPeakPercent:66.7,swapBytes:0,oom:0,oomKill:0,cpuUsageUsec:123456});
 for(const metrics of [
  {...healthy,swap:'1'},
  {...healthy,max:'6442450944'},
  {...healthy,peak:'3221225473'},
  {...healthy,events:healthy.events.replace('oom_kill 0','oom_kill 1')},
  {...healthy,events:'low 0\noom 0'},
  {...healthy,cpu:'user_usec 100000'},
 ])assert.throws(()=>evaluateMetrics({phase:'baseline',inspect,metrics}));
 assert.throws(()=>parseCounters('oom 0\noom 1',['oom']));
});

test('hosted gate measures updater before release and both daemon scan phases',()=>{
 const gate=readFileSync(new URL('./run-hosted-gate.sh',import.meta.url),'utf8');
 const updater=gate.indexOf('cgroup-metrics.mjs" "$clam_updater" update');
 const release=gate.indexOf('academy-gate-release\nupdater_exit=');
 assert(updater>0&&release>updater);
 assert(gate.includes('cgroup-metrics.mjs" "$clam_container" baseline'));
 assert(gate.includes('cgroup-metrics.mjs" "$clam_container" limits'));
 assert(gate.includes('--memory=3g --memory-swap=3g'));
 assert(gate.includes('--memory=4g --memory-swap=4g'));
});
