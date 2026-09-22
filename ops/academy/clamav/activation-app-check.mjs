// Executed on stdin by Node inside compass-app; never export its environment.
export async function checkActivationApp(sha,{env=process.env,fetchRequest=fetch}={}){
 if(typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))throw new Error('invalid_expected_sha');
 if(env.ACADEMY_CLAMAV_HOST!=='academy-clamd'||(env.ACADEMY_CLAMAV_PORT??'3310')!=='3310'
  ||typeof env.CRON_SECRET!=='string'||!env.CRON_SECRET.trim()||/[\r\n]/.test(env.CRON_SECRET))throw new Error('app_configuration_not_ready');
 const response=await fetchRequest('http://127.0.0.1:10000/api/health',{redirect:'error',signal:AbortSignal.timeout(15000)});
 const health=await response.json();
 if(!response.ok||!['healthy','degraded'].includes(health.status)||![sha,sha.slice(0,7)].includes(health.version))throw new Error('deployed_sha_not_ready');
 return {ok:true,version:health.version};
}
if(process.argv[1]==='-'){
 try{process.stdout.write(JSON.stringify(await checkActivationApp(process.argv[2]))+'\n');}
 catch{process.stderr.write('{"ok":false,"error":"app_activation_check_failed"}\n');process.exitCode=1;}
}
