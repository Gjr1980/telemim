// ── SUPABASE CONFIG ──────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { addToSyncQueue } from "../utils/offline.js";

export const SUPA_URL = "https://netoufukpmmfhzwirogi.supabase.co";
export const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldG91ZnVrcG1tZmh6d2lyb2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTkwOTksImV4cCI6MjA4OTg5NTA5OX0.iapL70SiL_GV4XvmXRNcjlK_Sc-P2-esJzuLQvovdGQ";
// APPS_SCRIPT_URL removida — canhotos agora salvam direto em Supabase Storage via edge function 'salvar-canhoto'

/* v2 */export const _getValidToken=async function(usuario,SUPA_URL,SUPA_KEY){if(!usuario?.token)return null;try{const pl=JSON.parse(atob(usuario.token.split(".")[1]));const ok=pl.exp*1000>Date.now()+30000;if(ok)return usuario.token;if(!usuario.refresh_token)return usuario.token;const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:usuario.refresh_token})});const d=await res.json();if(d.access_token){const saved=JSON.parse(localStorage.getItem("tmim_u")||"{}");saved.token=d.access_token;if(d.refresh_token)saved.refresh_token=d.refresh_token;localStorage.setItem("tmim_u",JSON.stringify(saved));return d.access_token;}}catch(e){}return usuario.token;};

export const _fmtDate=function(d){return d.getFullYear()+"-"+(d.getMonth()+1<10?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate();};

// ── Supabase Realtime client ───────────────────────────────
var _supaRealtime=null;
export function getSupaClient(){
  if(_supaRealtime) return Promise.resolve(_supaRealtime);
  try{
    _supaRealtime=createClient(SUPA_URL,SUPA_KEY,{realtime:{params:{eventsPerSecond:10}}});
    return Promise.resolve(_supaRealtime);
  }catch(e){
    return Promise.resolve(null);
  }
}

// Headers dinâmicos: usa JWT do usuário logado (não expirado) se houver; senão anon key.
export function getH(){
  var _t=SUPA_KEY;
  try{
    var _u=JSON.parse(localStorage.getItem('tmim_u')||'{}');
    if(_u&&_u.token){
      var _pl=JSON.parse(atob(_u.token.split('.')[1]));
      if(_pl.exp*1000>Date.now()+5000)_t=_u.token;
    }
  }catch(e){}
  return {"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":"Bearer "+_t};
}

export async function _ensureAuth(){
  var _su=JSON.parse(localStorage.getItem('tmim_u')||'{}');
  if(_su&&_su.refresh_token){
    var _tk=await _getValidToken(_su,SUPA_URL,SUPA_KEY);
    if(_tk&&_tk!==_su.token){_su.token=_tk;localStorage.setItem('tmim_u',JSON.stringify(_su));}
  }
}

export async function dbGet(table,extraParams) {
  var params="?select=*&order=id"+(extraParams?"&"+extraParams:"");
  const r = await fetch(SUPA_URL+"/rest/v1/"+table+params, { headers: getH() });
  if (!r.ok) return [];
  return r.json();
}
export async function dbUpsert(table, rows) {
  const _url=`${SUPA_URL}/rest/v1/${table}`;
  const _h={ ...getH(), "Prefer": "resolution=merge-duplicates" };
  const _b=JSON.stringify(rows);
  try {
    const r=await fetch(_url,{method:"POST",headers:_h,body:_b});
    if(!r.ok && r.status>=500) await addToSyncQueue({url:_url,method:"POST",headers:_h,body:_b});
  } catch(e) {
    await addToSyncQueue({url:_url,method:"POST",headers:_h,body:_b});
    throw e;
  }
}
export async function dbDelete(table, id) {
  const _url=`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`;
  const _h=getH();
  try {
    const r=await fetch(_url,{method:"DELETE",headers:_h});
    if(!r.ok && r.status>=500) await addToSyncQueue({url:_url,method:"DELETE",headers:_h});
  } catch(e) {
    await addToSyncQueue({url:_url,method:"DELETE",headers:_h});
    throw e;
  }
}

export async function dbGetContas(status){
  const r=await fetch(`${SUPA_URL}/rest/v1/contas_pagar?status=eq.${status}&order=criado_em.desc`,{headers:{...getH(),"Range":"0-29"}});
  if(!r.ok)return [];
  return r.json();
}
export async function dbInsertConta(row){
  const r=await fetch(`${SUPA_URL}/rest/v1/contas_pagar`,{method:"POST",headers:{...getH(),"Prefer":"return=representation"},body:JSON.stringify([row])});
  if(!r.ok)return null;
  const d=await r.json();return d[0]||null;
}
export async function dbPagarConta(id,agora){
  const _url=`${SUPA_URL}/rest/v1/contas_pagar?id=eq.${id}`;
  const _h={...getH(),"Prefer":"return=minimal"};
  const _b=JSON.stringify({status:"pago",pago_em:agora});
  try {
    const r=await fetch(_url,{method:"PATCH",headers:_h,body:_b});
    if(!r.ok && r.status>=500) await addToSyncQueue({url:_url,method:"PATCH",headers:_h,body:_b});
  } catch(e) {
    await addToSyncQueue({url:_url,method:"PATCH",headers:_h,body:_b});
    throw e;
  }
}
// ── CUSTOS DIÁRIOS ───────────────────────────────────────────────────────────
export async function dbGetCustos() {
  const r = await fetch(`${SUPA_URL}/rest/v1/custos_diarios?select=*&order=data`, { headers: getH() });
  if (!r.ok) return [];
  return r.json();
}
export async function dbUpsertCusto(row) {
  const _url=`${SUPA_URL}/rest/v1/custos_diarios`;
  const _h={ ...getH(), "Prefer": "resolution=merge-duplicates" };
  const _b=JSON.stringify([row]);
  try {
    const r=await fetch(_url,{method:"POST",headers:_h,body:_b});
    if(!r.ok && r.status>=500) await addToSyncQueue({url:_url,method:"POST",headers:_h,body:_b});
  } catch(e) {
    await addToSyncQueue({url:_url,method:"POST",headers:_h,body:_b});
    throw e;
  }
}

export const FORNECEDORES = {
  van:      { tel: "" },
  caminhao: { tel: "" },
};

