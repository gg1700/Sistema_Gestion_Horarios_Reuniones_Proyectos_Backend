import dotenv from 'dotenv';
dotenv.config({quiet:true});

async function main() {
  const target = new URL(process.env.LOCAL_DB_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1'].includes(target.hostname) || target.port !== '5433' || target.pathname !== '/Telematicos') throw new Error('Solo Docker local.');
  const {default:pool} = await import('../../src/config/database.config');
  try {
    const {rows} = await pool.query(`SELECT a.user_id FROM public.external_account a JOIN public."user" u ON u.id=a.user_id
      WHERE a.provider='github' AND a.state='active' AND u.status='active' AND u.deleted_at IS NULL`);
    if(rows.length!==1) {console.log('Verificación real omitida: se necesita exactamente una cuenta GitHub activa en la base local.');return;}
    const { listGithubRepositories } = await import('../../src/services/github-repository.service');
    const result=await listGithubRepositories(rows[0].user_id);
    console.log('GitHub real consultado:', {available:result.repositories.length,public:result.repositories.filter(repo=>repo.visibility==='public').length,selected:result.selectedIds.length,maxSelected:result.maxSelected});
  } finally {await pool.end();}
}
main().catch(error=>{console.error('Verificación real fallida:',{code:error.code,statusCode:error.statusCode,message:error.code?'Consulta fallida. No se imprimen credenciales.':'Error de configuración local.'});process.exitCode=1;});
