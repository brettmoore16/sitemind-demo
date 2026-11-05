import { HttpError, assert } from './errors.mjs';
export function database(env, fetcher=fetch) {
  return async function request(path,{token,system=false,method='GET',body,headers={}}={}) {
    const key=system?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_ANON_KEY;
    assert(env.SUPABASE_URL && key,503,'Database is not configured');
    const response=await fetcher(`${env.SUPABASE_URL}${path}`,{method,signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:`Bearer ${system?key:token || key}`,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok){
      if(response.status===401)throw new HttpError(401,'Your session expired. Sign in again.');
      const error=await response.json().catch(()=>({}));
      if(error.code==='40001')throw new HttpError(409,'This project changed elsewhere. Reload before retrying.');
      if(error.code==='42501' || response.status===403)throw new HttpError(403,'You do not have permission for this project.');
      throw new HttpError(502,'The database could not complete this request.');
    }
    return response.status===204?null:response.json();
  };
}
export async function authenticate(req, db, cookies) {
  const token=cookies.sm_access;
  assert(token,401,'Sign in to continue');
  const user=await db('/auth/v1/user',{token});
  assert(user?.id && user.email_confirmed_at,401,'A verified account is required');
  return {user,token};
}
export async function workspace(db,token,projectId) {
  const result=await db('/rest/v1/rpc/get_workspace',{token,method:'POST',body:{p_project:projectId}});
  assert(result?.project,404,'Project not found');
  return result;
}
