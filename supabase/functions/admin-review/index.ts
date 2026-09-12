import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Deploy the admin page separately and set an exact comma-separated origin allowlist.
const origins=(Deno.env.get('ADMIN_ALLOWED_ORIGINS')||'http://127.0.0.1:8085').split(',').map(x=>x.trim());
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.includes(origin))return reply(403,{error:{code:'ORIGIN_DENIED',message:'后台来源未获允许'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:{code:'METHOD_NOT_ALLOWED',message:'请使用 POST'}});
 try{
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return reply(401,{error:{code:'AUTH_REQUIRED',message:'请先登录管理员账号'}});
  const server=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  // getUser validates the token at Auth; do not trust decoded client claims alone.
  const {data:auth,error:authError}=await server.auth.getUser(token);
  if(authError||!auth.user)return reply(401,{error:{code:'AUTH_REQUIRED',message:'登录状态已过期'}});
  const {data:admin,error:adminError}=await server.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();
  if(adminError||!admin)return reply(403,{error:{code:'ADMIN_REQUIRED',message:'该账号没有审核权限'}});
  const body=await req.json();
  if(body.action==='list'){
   const table=({merchant:'merchant_profiles',task:'tasks',report:'reports'} as Record<string,string>)[body.kind];
   if(!table)return reply(400,{error:{code:'INVALID_KIND',message:'审核类型无效'}});
   const column=body.kind==='merchant'?'verification_status':body.kind==='task'?'review_status':'status';
   let query=server.from(table).select('*').eq(column,body.kind==='report'?'open':'pending');
   if(body.kind==='task')query=query.eq('status','pending_review');
   const {data,error}=await query.order('created_at',{ascending:true}).limit(100);
   if(error)throw error;return reply(200,{data});
  }
  if(body.action==='license'){
   const {data:m,error}=await server.from('merchant_profiles').select('license_storage_path').eq('user_id',body.id).single();
   if(error||!m?.license_storage_path)return reply(404,{error:{code:'LICENSE_NOT_FOUND',message:'执照尚未上传'}});
   const signed=await server.storage.from('merchant-verification').createSignedUrl(m.license_storage_path,60);
   if(signed.error)throw signed.error;return reply(200,{data:{url:signed.data.signedUrl,expires_in:60}});
  }
  if(body.action==='moderate'){
   const {error}=await server.rpc('admin_moderate',{p_actor:auth.user.id,p_kind:body.kind,p_id:body.id,p_status:body.status});
   if(error)return reply(400,{error:{code:error.message,message:'审核失败，状态可能已发生变化，请刷新后重试'}});
   return reply(200,{data:{ok:true}});
  }
  return reply(400,{error:{code:'INVALID_ACTION',message:'操作类型无效'}});
 }catch(error){console.error('admin-review failed',error instanceof Error?error.message:'request error');return reply(400,{error:{code:'REQUEST_FAILED',message:'请求未完成，请检查输入后重试'}});}
});
