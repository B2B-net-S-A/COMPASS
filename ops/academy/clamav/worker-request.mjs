// Sent on stdin to Node inside the discovered app. Never export its secret to the host.
const workers={materials:{path:'academy-materials',timeout:300000},sync:{path:'academy-sync',timeout:180000}};
export async function requestWorker(worker,{env=process.env,fetchRequest=fetch}={}){
 const config=workers[worker];
 if(!config)throw new Error('invalid_worker');
 const secret=env.CRON_SECRET;
 if(typeof secret!=='string'||!secret.trim()||/[\r\n]/.test(secret))throw new Error('cron_secret_missing_or_invalid');
 const response=await fetchRequest(`http://127.0.0.1:10000/api/cron/${config.path}`,{
  method:'GET',headers:{Authorization:`Bearer ${secret}`},redirect:'error',signal:AbortSignal.timeout(config.timeout),
 });
 // No response fields (including error messages) are forwarded to host logs.
 const body=await response.json();
 return {ok:response.ok&&body?.ok===true,worker,status:response.status};
}
if(process.argv[1]==='-'){
 try{const result=await requestWorker(process.argv[2]);process.stdout.write(JSON.stringify(result)+'\n');if(!result.ok)process.exitCode=1;}
 catch{process.stderr.write('{"ok":false,"error":"academy_worker_request_failed"}\n');process.exitCode=1;}
}
