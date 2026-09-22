import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,lstat,mkdir,chmod,chown,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const execute=promisify(execFile),sourceDirectory=dirname(fileURLToPath(import.meta.url));
export const runtimeFiles=['host-control.sh','host-control.mjs','host-control-core.mjs','worker-host.sh','worker-request.mjs',
 'activate-host.sh','activate-host.mjs','activation-app-check.mjs',
 'compose.daemon.proposal.yml','compose.update.proposal.yml','clamd.conf','clamd-health.conf','freshclam.serialized.conf','image-lock.json'];
export const unitNames=['compass-academy-materials','compass-academy-sync','compass-academy-clamav-update'];
export const unitFiles=unitNames.flatMap(name=>[`${name}.service`,`${name}.timer`]);

// Injectable root/runtime only for native tests. The host CLI below accepts no overrides.
export async function installHostFiles({root='/',source=sourceDirectory,run=execute,rootUid=0,rootGid=0,engineUid=1000,engineGid=1000}={}){
 const target=join(root,'opt/compass-academy'),control=join(root,'var/lib/compass-academy-control');
 const units=join(root,'etc/systemd/system'),engine=join(root,'var/lib/compass-academy');
 const state=async path=>{try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
 async function directory(path,mode,uid,gid){
  const existing=await state(path);
  if(existing&&(!existing.isDirectory()||existing.isSymbolicLink()||existing.uid!==uid||(existing.mode&0o022)))throw new Error('unsafe_install_directory');
  if(!existing){await mkdir(path,{recursive:true,mode});await chown(path,uid,gid);}
  await chmod(path,mode);
 }
 async function destination(path){
  const existing=await state(path);
  if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.uid!==rootUid||(existing.mode&0o022)))throw new Error('unsafe_install_file');
 }
 const copies=[];
 for(const name of [...runtimeFiles,...unitFiles]){
  const unit=unitFiles.includes(name),from=join(source,unit?'systemd':'',name),info=await lstat(from);
  if(!info.isFile()||info.isSymbolicLink())throw new Error('unsafe_source_file');
  const data=await readFile(from);copies.push({name,to:join(unit?units:target,name),data,mode:name.endsWith('.sh')?0o755:0o644});
 }
 // Do not replace live schedules. Installation never stops or disables them for the operator.
 for(const name of unitNames){
  for(const suffix of ['service','timer']){
   let stdout;
   try{({stdout}=await run('systemctl',['show',`${name}.${suffix}`,'--property=LoadState,ActiveState,UnitFileState'],{encoding:'utf8',timeout:10000}));}
   catch(error){
    // Some systemd releases return nonzero for a missing unit while still
    // returning explicit properties. Never treat a bus/transport failure as absence.
    const missing=Object.fromEntries(String(error.stdout??'').trim().split('\n').map(line=>line.split('=')));
    if(![1,4].includes(error.code)||missing.LoadState!=='not-found'||missing.ActiveState!=='inactive'||(missing.UnitFileState??'')!=='')throw new Error('systemd_unit_inspection_failed');
    continue;
   }
   const properties=Object.fromEntries(stdout.trim().split('\n').map(line=>line.split('=')));
   if(!['loaded','not-found','masked'].includes(properties.LoadState)||!['inactive','failed'].includes(properties.ActiveState))throw new Error('stop_schedulers_before_install');
   if(suffix==='timer'&&properties.LoadState!=='not-found'&&!['disabled','masked'].includes(properties.UnitFileState))throw new Error('disable_schedulers_before_install');
  }
 }
 // Reject symlink ancestors before recursive mkdir/copy (including first install).
 for(const path of [join(root,'opt'),join(root,'var'),join(root,'var/lib'),join(root,'etc'),join(root,'etc/systemd'),units]){
  const info=await state(path);if(info&&(!info.isDirectory()||info.isSymbolicLink()||info.uid!==rootUid||(info.mode&0o022)))throw new Error('unsafe_install_parent');
 }
 await directory(target,0o755,rootUid,rootGid);await directory(control,0o700,rootUid,rootGid);
 await directory(units,0o755,rootUid,rootGid);await directory(engine,0o700,rootUid,rootGid);
 for(const name of ['signatures','scan-tmp','update-tmp'])await directory(join(engine,name),0o700,engineUid,engineGid);
 for(const copy of copies)await destination(copy.to);
 const manifest=join(target,'installed-files.json');await destination(manifest);
 for(const copy of copies){
  const temp=`${copy.to}.install-${process.pid}`;
  await writeFile(temp,copy.data,{mode:copy.mode,flag:'wx'});await chmod(temp,copy.mode);await chown(temp,rootUid,rootGid);await rename(temp,copy.to);
 }
 await run('systemctl',['daemon-reload'],{encoding:'utf8',timeout:30000});
 const report={installedAt:new Date().toISOString(),files:copies.map(({name,data})=>({name,sha256:createHash('sha256').update(data).digest('hex')})),activated:false};
 const temp=`${manifest}.install-${process.pid}`;await writeFile(temp,JSON.stringify(report,null,2)+'\n',{mode:0o644,flag:'wx'});
 await chown(temp,rootUid,rootGid);await rename(temp,manifest);
 return {ok:true,installed:copies.length,activated:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.platform!=='linux'||process.getuid?.()!==0||process.argv.length!==2)throw new Error('linux_host_root_required');
  for(const fd of [7,8,9])await lstat(`/proc/self/fd/${fd}`);
  process.stdout.write(JSON.stringify(await installHostFiles())+'\n');
 }catch(error){process.stderr.write(JSON.stringify({ok:false,error:/^[a-z_]{1,80}$/.test(error.message)?error.message:'host_install_failed'})+'\n');process.exitCode=1;}
}
