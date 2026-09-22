import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';

const execute=promisify(execFile);
const appName=/^app-w136dv828ofipvjfnxrqi643-[0-9]+$/;
const containerId=/^[a-f0-9]{64}$/;
const inspection='{"id":{{json .Id}},"name":{{json .Name}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"running":{{json .State.Running}},"paused":{{json .State.Paused}},"restarting":{{json .State.Restarting}}}';

// Fixed resource scope; never select the first app or infer an unknown Compose project.
// Read only the necessary Docker fields, never Config.Env or the complete inspection.
export async function discoverAcademyApp({run=execute}={}){
 const docker=async args=>{
  try{return await run('docker',['--host','unix:///var/run/docker.sock',...args],{encoding:'utf8',timeout:3000,maxBuffer:65536});}
  catch{throw new Error('academy_app_discovery_failed');}
 };
 const {stdout}=await docker(['ps','--no-trunc','--filter','status=running','--filter','label=com.docker.compose.service=app','--format','{{.ID}}\t{{.Names}}\t{{.State}}']);
 const rows=String(stdout).trim().split('\n').filter(Boolean).map(line=>line.split('\t'));
 if(rows.some(row=>row.length!==3||!containerId.test(row[0])))throw new Error('academy_app_discovery_invalid');
 const matches=rows.filter(([,name,state])=>appName.test(name)&&state==='running');
 if(matches.length!==1)throw new Error(matches.length?'academy_app_ambiguous':'academy_app_not_found');
 const [id,name]=matches[0];
 const {stdout:raw}=await docker(['inspect','--format',inspection,id]);
 let value;try{value=JSON.parse(raw);}catch{throw new Error('academy_app_discovery_invalid');}
 if(!value||value.id!==id||value.name!==`/${name}`||value.service!=='app'||value.running!==true||value.paused!==false||value.restarting!==false)throw new Error('academy_app_not_ready');
 return {id,name};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.platform!=='linux'||process.getuid?.()!==0||process.argv.length!==2)throw new Error('linux_host_root_required');
  process.stdout.write((await discoverAcademyApp()).id+'\n');
 }catch(error){
  process.stderr.write(JSON.stringify({ok:false,error:/^[a-z_]{1,80}$/.test(error.message)?error.message:'academy_app_discovery_failed'})+'\n');process.exitCode=1;
 }
}
