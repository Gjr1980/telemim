// TELEMIM v3.4 — Multi-Fleet
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
/* v2 */const _getValidToken=async function(usuario,SUPA_URL,SUPA_KEY){if(!usuario?.token)return null;try{const pl=JSON.parse(atob(usuario.token.split(".")[1]));const ok=pl.exp*1000>Date.now()+30000;if(ok)return usuario.token;if(!usuario.refresh_token)return usuario.token;const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:usuario.refresh_token})});const d=await res.json();if(d.access_token){const saved=JSON.parse(localStorage.getItem("tmim_u")||"{}");saved.token=d.access_token;if(d.refresh_token)saved.refresh_token=d.refresh_token;localStorage.setItem("tmim_u",JSON.stringify(saved));return d.access_token;}}catch(e){}return usuario.token;};
const _fmtDate=function(d){return d.getFullYear()+"-"+(d.getMonth()+1<10?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate();};

// ── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPA_URL = "https://netoufukpmmfhzwirogi.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldG91ZnVrcG1tZmh6d2lyb2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTkwOTksImV4cCI6MjA4OTg5NTA5OX0.iapL70SiL_GV4XvmXRNcjlK_Sc-P2-esJzuLQvovdGQ";
var APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbzdcWIsm6LcCM6e7Cpx0699PPw7d3NQTVrIELsxTs_hbACSEEjGCPoUrBzESDhxyoGJ/exec";
// ── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
const VAPID_PUBLIC="BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZEuEguqec8LTygq7UQTqp8-XWo4";
function urlBase64ToUint8Array(base64String){var padding="=".repeat((4-base64String.length%4)%4);var base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");var rawData=window.atob(base64);var outputArray=new Uint8Array(rawData.length);for(var i=0;i<rawData.length;++i){outputArray[i]=rawData.charCodeAt(i);}return outputArray;}
async function subscribePush(userId){
  if(!("serviceWorker" in navigator)||!("PushManager" in window))return null;
  try{
    var reg=await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC)});
    var keys=sub.toJSON();
    await fetch(SUPA_URL+"/rest/v1/push_subscriptions",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({usuario_id:userId,endpoint:keys.endpoint,p256dh:keys.keys.p256dh,auth:keys.keys.auth})});
    return sub;
  }catch(e){return null;}
}
async function sendPushNotification(userIds,title,body){
  try{
    await fetch(SUPA_URL+"/functions/v1/send-push",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({user_ids:userIds,title:title,body:body})});
  }catch(e){}
}
// ── OFFLINE CACHE (IndexedDB) ─────────────────────────────────────────────────
const IDB_NAME="telemim_offline";const IDB_VER=1;
function openIDB(){return new Promise(function(resolve,reject){var req=indexedDB.open(IDB_NAME,IDB_VER);req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains("cache"))db.createObjectStore("cache");};req.onsuccess=function(e){resolve(e.target.result);};req.onerror=function(){reject();};});}
async function idbSet(key,val){try{var db=await openIDB();var tx=db.transaction("cache","readwrite");tx.objectStore("cache").put(val,key);await new Promise(function(r){tx.oncomplete=r;});}catch(e){}}
async function idbGet(key){try{var db=await openIDB();var tx=db.transaction("cache","readonly");var req=tx.objectStore("cache").get(key);return new Promise(function(r){req.onsuccess=function(){r(req.result||null);};req.onerror=function(){r(null);};});}catch(e){return null;}}
// ── OFFLINE SYNC QUEUE ────────────────────────────────────────────────────────
async function addToSyncQueue(op){try{var q=await idbGet("syncQueue")||[];q.push(op);await idbSet("syncQueue",q);}catch(e){}}
async function processSyncQueue(){
  var q=await idbGet("syncQueue");if(!q||q.length===0)return;
  var failed=[];
  for(var i=0;i<q.length;i++){
    var op=q[i];
    try{
      var r=await fetch(op.url,{method:op.method,headers:op.headers,body:op.body?JSON.stringify(op.body):undefined});
      if(!r.ok)failed.push(op);
    }catch(e){failed.push(op);}
  }
  await idbSet("syncQueue",failed);
}
// Auto-process queue when back online
if(typeof window!=="undefined"){window.addEventListener("online",function(){setTimeout(processSyncQueue,2000);});}
// ── Supabase Realtime client ───────────────────────────────
var _supaRealtime=null
function getSupaClient(){
  if(_supaRealtime) return Promise.resolve(_supaRealtime);
  try{
    _supaRealtime=createClient(SUPA_URL,SUPA_KEY,{realtime:{params:{eventsPerSecond:10}}});
    return Promise.resolve(_supaRealtime);
  }catch(e){
    return Promise.resolve(null);
  }
}
// Headers dinâmicos: usa JWT do usuário logado (não expirado) se houver; senão anon key.
function getH(){
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
async function _ensureAuth(){
  var _su=JSON.parse(localStorage.getItem('tmim_u')||'{}');
  if(_su&&_su.refresh_token){
    var _tk=await _getValidToken(_su,SUPA_URL,SUPA_KEY);
    if(_tk&&_tk!==_su.token){_su.token=_tk;localStorage.setItem('tmim_u',JSON.stringify(_su));}
  }
}

async function dbGet(table,extraParams) {
  var params="?select=*&order=id"+(extraParams?"&"+extraParams:"");
  const r = await fetch(SUPA_URL+"/rest/v1/"+table+params, { headers: getH() });
  if (!r.ok) return [];
  return r.json();
}
async function dbUpsert(table, rows) {
  await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...getH(), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
}
async function dbDelete(table, id) {
  await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: getH() });
}

async function dbGetContas(status){
  const r=await fetch(`${SUPA_URL}/rest/v1/contas_pagar?status=eq.${status}&order=criado_em.desc`,{headers:{...getH(),"Range":"0-29"}});
  if(!r.ok)return [];
  return r.json();
}
async function dbInsertConta(row){
  const r=await fetch(`${SUPA_URL}/rest/v1/contas_pagar`,{method:"POST",headers:{...getH(),"Prefer":"return=representation"},body:JSON.stringify([row])});
  if(!r.ok)return null;
  const d=await r.json();return d[0]||null;
}
async function dbPagarConta(id,agora){
  await fetch(`${SUPA_URL}/rest/v1/contas_pagar?id=eq.${id}`,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({status:"pago",pago_em:agora})});
}
// ── CUSTOS DIÁRIOS ───────────────────────────────────────────────────────────
async function dbGetCustos() {
  const r = await fetch(`${SUPA_URL}/rest/v1/custos_diarios?select=*&order=data`, { headers: getH() });
  if (!r.ok) return [];
  return r.json();
}
async function dbUpsertCusto(row) {
  await fetch(`${SUPA_URL}/rest/v1/custos_diarios`, {
    method: "POST",
    headers: { ...getH(), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
}
const FORNECEDORES = {
  van:      { tel: "" },
  caminhao: { tel: "" },
};

// ── THEME & RULES ─────────────────────────────────────────────────────────────
const COLORS = {
  bg:"#f0f4f8", card:"#ffffff", cardBorder:"#e2e8f0",
  accent:"#e67e22", green:"#16a34a", red:"#dc2626",
  blue:"#2563eb", purple:"#7c3aed", text:"#1e293b", muted:"#64748b", inputBg:"#f8fafc",
  shadow:"0 2px 12px rgba(0,0,0,0.08)", headerBg:"#1e293b",
};
const RULES = { medicaoPorM3:150, vanGanho:1000, vanCusto:400, caminhao:350, cam1a:350, camAdd:130, ajudante:80, imposto:0.16, van1a:1000, vanAdd:130, aj1a:80, ajAdd:20, dataInicioRegra:'' };

const DADOS_INICIAIS = [
  { id:1,  selo:"180",               nome:"Joyce Rosendo",                               origem:"Travessa João Murilo de Oliveira, Beira da Maré",            destino:"Rua Sargento Silvino de Macedo, N°210, 5° Travessa, Aritana",                                     data:"2026-03-09", medicao:26, van:true, comunidade:"Comunidade do Bem" },
  { id:2,  selo:"177",               nome:"Ivaneide Valença",                            origem:"Travessa João Murilo de Oliveira, Beira da Maré",            destino:"Comunidade do Bueiro, Av. Central, Afogados",                                                     data:"2026-03-04", medicao:26, van:true, comunidade:"Comunidade do Bem" },
  { id:3,  selo:"168",               nome:"Julio Serafim",                               origem:"Estrada Velha do Frigorífico, S/N, Beira da Maré",           destino:"Rua João Murilo de Oliveira, Irmã Dorothy. Ref: lanchonete o melhor do trigo",                  data:"2026-03-10", medicao:30, van:true, comunidade:"Comunidade do Bem" },
  { id:4,  selo:"VT-020-020 C e D",  nome:"Sônia Maria do Vale",                        origem:"Rua Dr. Flávio Ferreira da Silva Marajó, s/n, Com. Vietnã",  destino:"Rua Leila Felix Carã, s/nº - Torrões",                                                            data:"2026-03-02", medicao:31, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:5,  selo:"VT-020-020 C e D",  nome:"Sônia Maria do Vale",                        origem:"Rua Dr. Flávio Ferreira da Silva Marajó, s/n, Com. Vietnã",  destino:"Rua Leila Felix Carã, s/nº - Torrões",                                                            data:"2026-03-02", medicao:20, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:6,  selo:"VT-020-007 B",      nome:"Iranildo Araújo da Silva",                   origem:"Rua Dr. Flávio Ferreira da Silva Marajó, s/n, Com. Vietnã",  destino:"2ª Travessa da Rua Tenente Mindelo, nº15 - Jiquiá",                                               data:"2026-03-05", medicao:31, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:7,  selo:"VT-020-001 A",      nome:"Severino José dos Santos",                   origem:"Rua Dr. Flávio Ferreira da Silva Marajó, s/nº",              destino:"Rua Tavares de Holanda, nº 520",                                                                  data:"2026-03-06", medicao:27, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:8,  selo:"VT-020-003-A",      nome:"Ednaldo Gomes",                              origem:"Rua Dr. Flávio Ferreira da Silva Marajó, s/nº",              destino:"Rua Apulcro de Assunção, nº620 - próx. praça giradouro terminal San Martin",                      data:"2026-03-06", medicao:17, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:9,  selo:"VT-020-018-A",      nome:"Claudia Rafaela Barbosa de Oliveira Borges", origem:"Rua Dr. Flávio Ferreira da Silva Marajó, nº26",              destino:"Rua do Rosário, nº210 - Afogados",                                                               data:"2026-03-10", medicao:27, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:10, selo:"VT-020-018-A",      nome:"Claudia Rafaela Barbosa de Oliveira Borges", origem:"Rua Dr. Flávio Ferreira da Silva Marajó, nº26",              destino:"Rua do Rosário, nº210 - Afogados",                                                               data:"2026-03-10", medicao:20, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:11, selo:"VT-020-012-A",      nome:"Ricardo Pereira",                            origem:"Rua Dr. Flávio Ferreira da Silva Marajó, s/nº",              destino:"Rua Juscelândia, nº27 - Torrões",                                                                 data:"2026-03-13", medicao:29, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:12, selo:"VT-020-008-A",      nome:"Wirlânia do Nascimento Ferreira Araújo",     origem:"Rua Dr. Flávio Ferreira da Silva Marajó, nº727",             destino:"Rua Tenente Mindelo, nº15",                                                                      data:"2026-03-13", medicao:31, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:13, selo:"57",                nome:"Edeilson Pereira dos Santos",                 origem:"Av. Rio Capibaribe, 57 - São José",                         destino:"Habitacional Vila Brasil 1",                                                                      data:"2026-03-02", medicao:25, van:true, comunidade:"Comunidade Vila Brasil" },
  { id:14, selo:"008A-1",            nome:"Aguinaldo José Bezerra",                     origem:"Rua Sargento Rubens Leite, nº98",                            destino:"Av. Barreto de Menezes, 160 - Marcos Freire, Jaboatão dos Guararapes",                           data:"2026-03-18", medicao:27, van:true, comunidade:"Encostas" },
  { id:15, selo:"VT-020-004-A",      nome:"Maria do Carmo Carneiro Barbosa",            origem:"Rua Dr. Flávio Ferreira da Silva Marajó, nº730",             destino:"Rua 61, nº66 - Caetés 3 - próximo à associação Betânia",                                         data:"2026-03-05", medicao:31, van:true, comunidade:"Comunidade Chesf Vietnã" },
  { id:16, selo:"243",               nome:"Clara Fernanda dos Santos Silva",             origem:"Tv João Murilo de Oliveira, Nº 182, Beira da Maré",         destino:"Rua Ernesto Lundgren, Nº 96, Lagoa Encantada, Ibura, Recife/PE",                                  data:"2026-03-13", medicao:25, van:true, comunidade:"Comunidade Chesf Vietnã" },
];

const AGENDA_INICIAIS = [
  { id:101, nome:"Anderson Sebastião",                 selo:"VT-020-021-A", data:"2026-03-25", horario:"09:00", origem:"Rua Dr. Flávio Marajó, S/N - Comunidade Vietnã", destino:"8ª Travessa da Rua Porto Estrela, 28 - Recife/PE",         van:true,  caminhao:true, comunidade:"Comunidade Chesf Vietnã", contato:"81 8654-1134", status:"confirmado" },
  { id:102, nome:"Maria da Conceição Silva Ferreira",  selo:"SESAN",        data:"2026-03-27", horario:"14:00", origem:"Rua Zeferino Agra, nº 490 - Bloco B 108",         destino:"1ª Travessa Santo Antonio, nº 215 - Dois Unidos",          van:false, caminhao:true, comunidade:"SESAN",                   contato:"",            status:"confirmado" },
  { id:103, nome:"Jhonatan",                           selo:"VT-020-022-A", data:"2026-03-25", horario:"15:00", origem:"Rua Dr. Flávio Marajó, S/N - Comunidade Vietnã", destino:"1ª Travessa Eng. Abdias de Carvalho - Curado",             van:true,  caminhao:true, comunidade:"Comunidade Chesf Vietnã", contato:"81 8582-8967", status:"confirmado" },
];

const initForm = { nome:"", selo:"", data:(function(){var _d=new Date();var _y=_d.getFullYear();var _m=String(_d.getMonth()+1).padStart(2,"0");var _dd=String(_d.getDate()).padStart(2,"0");return _y+"-"+_m+"-"+_dd;})(), horario:"08:00", origem:"", destino:"", medicao:"", van:true, comunidade:"", contato:"" };

function fmt(n){ return "R$ "+Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2}); }
function fmtDate(d){ if(!d) return ""; const [y,m,dd]=d.split("-"); return `${dd}/${m}/${y}`; }
function getWeek(ds){
  const d=new Date(ds+"T12:00:00"), s=new Date(d.getFullYear(),0,1);
  return Math.ceil(((d-s)/86400000+s.getDay()+1)/7);
}
function weekRange(ds){
  const d=new Date(ds+"T12:00:00"), day=d.getDay();
  const mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1));
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const p=(n)=>n.toString().padStart(2,"0");
  return `${p(mon.getDate())}/${p(mon.getMonth()+1)} – ${p(sun.getDate())}/${p(sun.getMonth()+1)}`;
}
function calcRel(list,aj,alm){
  const diasVan=[...new Set((window.__mudancas||[]).filter(m=>m.van).map(m=>m.data))];
  const vd=diasVan.length, m3=list.reduce((s,m)=>s+(parseFloat(m.medicao)||0),0);
  const fatM=m3*RULES.medicaoPorM3; const fatV=vd>0?RULES.van1a:0; const bruto=fatM+fatV;
  const imp=bruto*RULES.imposto;
  const cV=vd*RULES.vanCusto, cC=list.length*RULES.caminhao, cA=(parseInt(aj)||0)>0?(RULES.aj1a+(vd>0?vd-1:0)*RULES.ajAdd)*(parseInt(aj)||0):0, cAlm=parseFloat(alm)||0;
  const custos=cV+cC+cA+cAlm, liq=bruto-imp-custos, marg=bruto>0?(liq/bruto)*100:0;
  return {fatM,fatV,bruto,imp,cV,cC,cA,cAlm,custos,liq,marg,m3,vd,nAj:parseInt(aj)||0};
}

function Badge({children,color=COLORS.accent}){
  return <span style={{background:color+"18",color,border:`1px solid ${color}33`,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
}
function Card({children,style={}}){
  return <div style={{background:COLORS.card,border:`1px solid ${COLORS.cardBorder}`,borderRadius:16,padding:18,boxShadow:COLORS.shadow,...style}}>{children}</div>;
}
function Inp({label,type="text",value,onChange,placeholder,icon}){
  return(
    <div style={{marginBottom:12}}>
      <label style={{display:"block",color:COLORS.muted,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:5,textTransform:"uppercase"}}>{icon} {label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} onInput={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:COLORS.inputBg,border:`1.5px solid ${COLORS.cardBorder}`,borderRadius:10,color:COLORS.text,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box"}}
        onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
        onBlur={e=>e.target.style.border=`1.5px solid ${COLORS.cardBorder}`}/>
    </div>
  );
}
function Tog({label,value,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <label style={{color:COLORS.muted,fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</label>
      <div onClick={()=>onChange(!value)} style={{width:46,height:25,borderRadius:13,background:value?COLORS.accent:"#cbd5e1",position:"relative",cursor:"pointer",transition:"background 0.3s"}}>
        <div style={{position:"absolute",top:3,left:value?22:3,width:19,height:19,borderRadius:10,background:"#fff",transition:"left 0.3s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
      </div>
    </div>
  );
}

// ============================================================
// AGENTE DE PRECIFICAÇÃO — Fonte Única da Verdade
// Calcula o custo de UM DIA para UMA categoria
// Regras escalonadas exactas conforme aba Config > Regras
// ============================================================
function _calcDiario(numMud, numAj, cargo, RULES){
  if(numMud===0) return 0;
  var cam1a=parseFloat(RULES.cam1a)||0;
  var camAdd=parseFloat(RULES.camAdd)||0;
  var vanD=parseFloat(RULES.vanCusto)||0;
  var aj1a=parseFloat(RULES.aj1a)||0;
  var ajAdd=parseFloat(RULES.ajAdd)||0;
  if(cargo==="van"){
    // Van: valor fixo diário independente de quantas mudanças
    return vanD;
  }
  if(cargo==="caminhao"){
    // Caminhão: base na 1ª mudança + acréscimo por cada mudança adicional
    var extraCam=Math.max(0,numMud-1);
    return cam1a+(extraCam*camAdd);
  }
  if(cargo==="ajudante"){
    // Ajudante: escalonado igual ao caminhão × qtd ajudantes presentes
    var extraAj=Math.max(0,numMud-1);
    var custoPorUm=aj1a+(extraAj*ajAdd);
    return custoPorUm*(parseInt(numAj)||1);
  }
  return 0;
}
// ============================================================
// CALCULADORA CENTRAL — usa _calcDiario como driver
// Itera dia a dia sobre os dias com mudanças
// ============================================================
function _calcCustos(mudP, cdP, cpP, RULES){
  var _fv=function(v){return parseFloat(v)||0;};
  // --- FATURAMENTO ---
  var diasU=[...new Set(mudP.map(function(m){return m.data;}))];
  var m3Total=mudP.reduce(function(s,m){return s+_fv(m.medicao);},0);
  var numVan=mudP.filter(function(m){return m.van;}).length;
  var fatBruto=diasU.length*_fv(RULES.van1a)+m3Total*_fv(RULES.medicaoPorM3);
  var imposto=fatBruto*_fv(RULES.imposto);
  var fatLiq=fatBruto-imposto;
  // --- CUSTOS VIA AGENTE DE PRECIFICAÇÃO ---
  var cCam=0; var cVan=0; var cAj=0; var cAlm=0; var cDesp=0;
  diasU.forEach(function(data){
    var numMud=mudP.filter(function(m){return m.data===data;}).length;
    if(numMud===0) return;
    var cdDia=(cdP||[]).find(function(cd){return cd.data===data;})||{ajudantes:0,custo_almoco:0,despesa_extra:0};
    var numAj=parseInt(cdDia.ajudantes)||0;
    // Fallback: if no custosDiarios, use ajudantes from mudança items; default 1
    if(numAj===0){var _ajFromMud=mudP.filter(function(m){return m.data===data;}).reduce(function(max,m){var a=parseInt(m.ajudantes)||0;return a>max?a:max;},0);numAj=_ajFromMud>0?_ajFromMud:1;}
    cCam+=_calcDiario(numMud,0,"caminhao",RULES);
    cVan+=_calcDiario(numMud,0,"van",RULES);
    cAj+=_calcDiario(numMud,numAj,"ajudante",RULES);
    cAlm+=_fv(cdDia.custo_almoco);
    cDesp+=_fv(cdDia.despesa_extra);
  });
  var cExtra=(cpP||[]).reduce(function(s,cp){return s+_fv(cp.valor);},0);
  var despTotal=cCam+cVan+cAj+cAlm+cDesp+cExtra;
  var lucroLiq=fatLiq-despTotal;
  return {
    cCam,cVan,cAj,cAlm,cDesp,cExtra,despTotal,
    fatBruto,fatLiq,imposto,lucroLiq,
    numMud:mudP.length,m3Total,diasU,numVan
  };
}
function ResumoSemanal({mudancas,RULES,prestadores,custosDiarios,setCustosDiarios,setContasSemana}){
  var _pc=function(n){return String(n).padStart(2,"0");};
  var _hc=new Date();var _dwc=_hc.getDay();var _dc=_dwc===0?6:_dwc-1;
  var _s0c=new Date(_hc.getFullYear(),_hc.getMonth(),_hc.getDate()-_dc);
  var _s1c=new Date(_s0c.getFullYear(),_s0c.getMonth(),_s0c.getDate()+6);
  var _fc=function(d){return d.getFullYear()+"-"+_pc(d.getMonth()+1)+"-"+_pc(d.getDate());};
  var _fb=function(d){return _pc(d.getDate())+"/"+_pc(d.getMonth()+1)+"/"+d.getFullYear();};
  var _sic=_fc(_s0c);var _sfc=_fc(_s1c);
  var _periodo=_fb(_s0c)+" a "+_fb(_s1c);
  var _ms=mudancas.filter(function(m){return !m.deleted_at&&m.data>=_sic&&m.data<=_sfc;});
  var _cd=(custosDiarios||[]).filter(function(x){return x.data>=_sic&&x.data<=_sfc;});
  var _fv=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
  var _fvs=function(v){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v||0);};
  var _ico={"caminhao":"🚚","van":"🚐","ajudante":"👷","almoco":"🍛","outro":"📋"};
  var _lbl={"caminhao":"Caminhão","van":"Van","ajudante":"Ajudante","almoco":"Almoço","outro":"Outro"};
  var _cor={"caminhao":"#92400e","van":"#1e40af","ajudante":"#065f46","almoco":"#7c3aed","outro":"#475569"};
  var _bg={"caminhao":"#fff7ed","van":"#eff6ff","ajudante":"#f0fdf4","almoco":"#faf5ff","outro":"#f8fafc"};
  // --- calcular detalhes por prestador usando regras centralizadas ---
  function _calcDetP(p){
    var det=[];
    var _diasDetU=[...new Set(_ms.map(function(m){return m.data;}))].sort();
    if(p.id==="__equipa_aj__"){
      // Card Equipa: agrega todos os ajudantes via custosDiarios (qtd real do dia)
      _diasDetU.forEach(function(data){
        var mDia=_ms.filter(function(m){return m.data===data;});
        var numMud=mDia.length;
        if(numMud===0) return;
        var cdDia=_cd.find(function(cd){return cd.data===data;})||{ajudantes:1};
        var numAj=parseInt(cdDia.ajudantes)||1;
        var val=_calcDiario(numMud,numAj,"ajudante",RULES);
        det.push({data,numMud,numAj,val});
      });
    }else if(p.cargo==="caminhao"||p.cargo==="van"){
      _diasDetU.forEach(function(data){
        var mDia=_ms.filter(function(m){return m.data===data;});
        var numMud=mDia.length;
        if(numMud===0) return;
        var val=_calcDiario(numMud,0,p.cargo,RULES);
        det.push({data,numMud,val});
      });
    }
    return det;
  }
  var [modalP,setModalP]=useState(null);
  var [detMap,setDetMap]=useState({});
  var [editIdx,setEditIdx]=useState(null);
  var [editVals,setEditVals]=useState({});
  // --- Grupo "Equipa de Ajudantes" (centro de custo unico) ---
  var _aj=(prestadores||[]).filter(function(p){return p.cargo==="ajudante";});
  var _vei=(prestadores||[]).filter(function(p){return p.cargo!=="ajudante";});
  var _teamAj=_aj.length>0?{id:"__equipa_aj__",nome:"Equipa de Ajudantes",cargo:"ajudante",telefone:"",_numAj:_aj.length}:null;
  var _prestRender=_teamAj?[..._vei,_teamAj]:_vei;
  function _getDet(p){return detMap[p.id]||_calcDetP(p);}
  function _getTotais(det){
    return {
      totalVal:det.reduce(function(s,d){return s+(parseFloat(d.val)||0);},0),
      totalMud:det.reduce(function(s,d){return s+(parseInt(d.numMud)||0);},0),
      diasT:det.length
    };
  }
  function _sendZap(p){
    var det=_getDet(p);
    var tot=_getTotais(det);
    var NL="\n";
    var txtDiario="";
    var _isAj=p.id==="__equipa_aj__"||p.cargo==="ajudante";
    var _somaAj=0;var _qtdAj=0;
    det.forEach(function(d){
      var parts=String(d.data).split("-");
      var df=parts[2]+"/"+parts[1]+"/"+parts[0];
      if(_isAj){
        var aj=parseInt(d.numAj)||1;
        var porAj=aj>0?(parseFloat(d.val)||0)/aj:0;
        txtDiario+="Data "+df+" - "+d.numMud+" mudanças x "+aj+" "+(aj===1?"ajudante":"ajudantes")+" = R$ "+_fvs(d.val)+" (R$ "+_fvs(porAj)+"/ajudante)"+NL;
        _somaAj+=parseFloat(d.val)||0;_qtdAj+=aj;
      }else if(p.cargo==="van"){
        txtDiario+="Data "+df+" - Diária - R$ "+_fvs(d.val)+NL;
      }else{
        txtDiario+="Data "+df+" - "+d.numMud+" mudanças - R$ "+_fvs(d.val)+NL;
      }
    });
    var ico=_ico[p.cargo]||"📋";
    var lbl=_lbl[p.cargo]||p.cargo;
    var mL=tot.totalMud===1?"mudança":"mudanças";
    var dL=tot.diasT===1?"dia":"dias";
    var _ajTotalLinha="";
    if(_isAj&&_qtdAj>0){var _mediaAj=det.length>0?_somaAj/det.length:0;_ajTotalLinha="💰 *Valor por ajudante na semana: R$ "+_fvs(_mediaAj)+"*"+NL;}
    var tx=
      "Olá *"+p.nome+"*, segue o fechamento da semana! 🤝"+NL+
      "📅 Período: "+_periodo+NL+NL+
      txtDiario+NL+
      ico+" Categoria: "+lbl+NL+
      "✅ Dias trabalhados: "+tot.diasT+" "+dL+NL+
      "📦 Total de mudanças: "+tot.totalMud+" "+mL+NL+
      "💰 *Valor total: R$ "+_fvs(tot.totalVal)+"*"+NL+
      _ajTotalLinha+NL+
      "(TELEMIM)";
    var num=(p.telefone||"").replace(/[^0-9]/g,"");
    window.open(num?"https://wa.me/"+num+"?text="+encodeURIComponent(tx):"https://wa.me/?text="+encodeURIComponent(tx),"_blank");
  }
  function _iniciarEdit(idx,d,p){
    setEditIdx(idx);
    setEditVals({data:d.data,numMud:d.numMud||0,numAj:d.numAj!==undefined?d.numAj:1,val:d.val||0,_cargo:p.cargo,_pid:p.id});
  }
  function _recalcVal(newMud,newAj,cargo){
    // Invocar o Agente de Precificação em tempo real
    var nm=parseInt(newMud)||0;
    var na=parseInt(newAj)||1;
    return _calcDiario(nm,na,cargo,RULES);
  }
  function _onChangeMud(e,cargo){
    var raw=e.target.value;
    var nm=raw===""?"":(parseInt(raw)||0);
    var na=parseInt(editVals.numAj)||1;
    var nmCalc=parseInt(nm)||0;
    setEditVals(function(v){return {...v,numMud:nm,val:raw===""?0:_recalcVal(nmCalc,na,cargo)};});
  }
  function _onChangeAj(e,cargo){
    var raw=e.target.value;
    var nm=parseInt(editVals.numMud)||0;
    var na=raw===""?"":(parseInt(raw)||1);
    var naCalc=parseInt(na)||1;
    setEditVals(function(v){return {...v,numAj:na,val:raw===""?0:_recalcVal(nm,naCalc,cargo)};});
  }
  function _salvarEdit(p){
    // PROTOCOLO 1: Capturar estado imediatamente (antes de qualquer setState)
    var _idxSnap=editIdx;
    var _valsSnap={...editVals};
    if(_idxSnap===null||_idxSnap===undefined){return;}
    // PROTOCOLO 2: Recalcular valor via Agente de Precificação
    var numMudSnap=parseInt(_valsSnap.numMud)||0;
    var numAjSnap=parseInt(_valsSnap.numAj)||1;
    var cargoSnap=p.id==="__equipa_aj__"?"ajudante":(p.cargo||"ajudante");
    var valRecalc=_calcDiario(numMudSnap,numAjSnap,cargoSnap,RULES);
    var payload={data:_valsSnap.data,numMud:numMudSnap,numAj:numAjSnap,val:valRecalc};
    // Double Map — imutabilidade correcta
    var novoDet=_getDet(p).map(function(d,i){
      return i===_idxSnap?{...d,...payload}:d;
    });
    // PROTOCOLO 3: Actualizar React imediatamente (UX responsiva)
    setDetMap(function(prev){var m={...prev};m[p.id]=novoDet;return m;});
    setEditIdx(null);
    setEditVals({});
    // PROTOCOLO 4: Actualizar custosDiarios local (Derived State — totais recalculam)
    // Isto garante que CUSTO TOTAL SEMANA e aba Financeiro reflectem a edição imediatamente
    var _data=payload.data;
    var _aj=numAjSnap;
    setCustosDiarios(function(prev){
      var existe=prev.some(function(cd){return cd.data===_data;});
      if(existe){
        return prev.map(function(cd){
          return cd.data===_data?{...cd,ajudantes:_aj}:cd;
        });
      } else {
        return [...prev,{data:_data,ajudantes:_aj,custo_almoco:0}];
      }
    });
    // PROTOCOLO 5: Persistir no Supabase (PATCH se existe, POST se nao existe)
    var _hd={...getH(),"Content-Type":"application/json","Prefer":"return=minimal"};
    fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+_data+"&select=id",{headers:getH()})
      .then(function(r){return r.json();})
      .then(function(rows){
        if(rows&&rows.length>0){
          return fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+_data,{
            method:"PATCH",
            headers:_hd,
            body:JSON.stringify({ajudantes:_aj})
          });
        } else {
          return fetch(SUPA_URL+"/rest/v1/custos_diarios",{
            method:"POST",
            headers:_hd,
            body:JSON.stringify({data:_data,ajudantes:_aj})
          });
        }
      })
      .then(function(res){
        if(res&&!res.ok) res.text().then(function(t){console.warn("Supabase save erro:",t);});
      })
      .catch(function(err){console.warn("Supabase save falhou:",err);});
    // PROTOCOLO 6: Sync contas_semana → Financeiro (robusto)
    (function(){
      try{
        var _dp6=_data.split("-");
        var _d6=new Date(parseInt(_dp6[0]),parseInt(_dp6[1])-1,parseInt(_dp6[2]));
        var _dw6=_d6.getDay();var _dif6=_dw6===0?6:_dw6-1;
        var _s06=new Date(_d6.getFullYear(),_d6.getMonth(),_d6.getDate()-_dif6);
        var _s16=new Date(_s06.getFullYear(),_s06.getMonth(),_s06.getDate()+6);
        var _p6=function(n){return String(n).padStart(2,"0");};
        var _si6=_s06.getFullYear()+"-"+_p6(_s06.getMonth()+1)+"-"+_p6(_s06.getDate());
        var _sf6=_s16.getFullYear()+"-"+_p6(_s16.getMonth()+1)+"-"+_p6(_s16.getDate());
        var _tipo6=cargoSnap==="ajudante"?"ajudante":cargoSnap;
        var _tot6=novoDet.reduce(function(s,d){
          var dData=d.data||"";
          return dData>=_si6&&dData<=_sf6?s+(parseFloat(d.val)||0):s;
        },0);
        var _hd6=Object.assign({},getH(),{"Prefer":"return=minimal"});
        fetch(SUPA_URL+"/rest/v1/contas_semana",{
          method:"POST",
          headers:Object.assign({},_hd6,{"Prefer":"resolution=merge-duplicates"}),
          body:JSON.stringify({semana_inicio:_si6,semana_fim:_sf6,tipo:_tipo6,valor_calculado:_tot6,status:"pendente"})
        }).catch(function(){});
        if(typeof setContasSemana==="function"){
          setContasSemana(function(prev){
            var existe=prev.some(function(x){return x.semana_inicio===_si6&&x.tipo===_tipo6;});
            if(existe) return prev.map(function(x){
              return(x.semana_inicio===_si6&&x.tipo===_tipo6)?{...x,valor_calculado:String(_tot6)}:x;
            });
            return [...prev,{semana_inicio:_si6,semana_fim:_sf6,tipo:_tipo6,valor_calculado:String(_tot6),status:"pendente"}];
          });
        }
      }catch(_e6){console.warn("[Proto6]",_e6);}
    })();
    }
  function _cancelarEdit(){setEditIdx(null);setEditVals({});}
  var inpS={border:"1px solid #cbd5e1",borderRadius:6,padding:"3px 6px",fontSize:11,width:"100%",background:"#fff"};
  // Custo total semana via função centralizada
  var _cSem=_calcCustos(_ms,_cd,[],RULES);
  return (
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 14px 10px",marginTop:6,marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontWeight:800,fontSize:13,color:"#1e293b"}}>📊 Fechamento Semanal</div>
        <div style={{fontSize:10,color:"#64748b"}}>{_periodo}</div>
      </div>
      {(!prestadores||prestadores.length===0)?(
        <div style={{textAlign:"center",padding:"14px 0",color:"#94a3b8",fontSize:12}}>
          Nenhum prestador cadastrado.<br/>Adicione na aba ⚙️ Config.
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {_prestRender.map(function(p){
            var det=_getDet(p);
            var tot=_getTotais(det);
            var isOpen=modalP===p.id;
            return (
              <div key={p.id} style={{background:_bg[p.cargo]||"#f8fafc",borderRadius:10,border:"1px solid #f1f5f9",overflow:"hidden"}}>
                <div style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:22,flexShrink:0}}>{_ico[p.cargo]||"📋"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:_cor[p.cargo]||"#334155"}}>{p.nome}</div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:1}}>{_lbl[p.cargo]||p.cargo}</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{tot.diasT} {tot.diasT===1?"dia":"dias"} | {tot.totalMud} {tot.totalMud===1?"mudança":"mudanças"}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <div style={{fontWeight:800,fontSize:14,color:_cor[p.cargo]||"#334155"}}>{_fv(tot.totalVal)}</div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={function(){setModalP(isOpen?null:p.id);setEditIdx(null);}} style={{background:isOpen?"#e2e8f0":"#f1f5f9",color:"#475569",border:"none",borderRadius:14,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        {isOpen?"▲ Fechar":"✏️ Detalhes"}
                      </button>
                      <button onClick={function(){_sendZap(p);}} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:14,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        📲 Zap
                      </button>
                    </div>
                  </div>
                </div>
                {isOpen&&(
                  <div style={{borderTop:"1px solid #e2e8f0",background:"#fff",padding:"12px 12px 10px"}}>
                    <div style={{fontWeight:700,fontSize:11,color:"#475569",marginBottom:8}}>📋 Extrato — {p.nome}</div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <thead>
                          <tr style={{background:"#f8fafc"}}>
                            <th style={{padding:"6px 8px",textAlign:"left",color:"#64748b",fontWeight:600,borderBottom:"1px solid #e2e8f0"}}>Data</th>
                            {p.cargo!=="van"&&<th style={{padding:"6px 4px",textAlign:"center",color:"#64748b",fontWeight:600,borderBottom:"1px solid #e2e8f0"}}>Mud.</th>}
                            {(p.id==="__equipa_aj__"||p.cargo==="ajudante")&&<th style={{padding:"6px 4px",textAlign:"center",color:"#64748b",fontWeight:600,borderBottom:"1px solid #e2e8f0"}}>Aj.</th>}
                            <th style={{padding:"6px 8px",textAlign:"right",color:"#64748b",fontWeight:600,borderBottom:"1px solid #e2e8f0"}}>Valor (R$)</th>
                            <th style={{padding:"6px 4px",textAlign:"center",color:"#64748b",fontWeight:600,borderBottom:"1px solid #e2e8f0"}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.map(function(d,i){
                            var isEdit=editIdx===i;
                            var pts=String(d.data).split("-");
                            var dfmt=pts[2]+"/"+pts[1]+"/"+pts[0];
                            if(isEdit){return(
                              <tr key={i} style={{background:"#fffbeb"}}>
                                <td style={{padding:"4px 6px"}}><input type="date" value={editVals.data} onChange={function(e){setEditVals(function(v){return {...v,data:e.target.value};});}} style={inpS}/></td>
                                {p.cargo!=="van"&&<td style={{padding:"4px 4px"}}><input type="number" min="0" value={editVals.numMud} onChange={function(e){_onChangeMud(e,p.cargo);}} style={{...inpS,width:50}}/></td>}
                                {(p.id==="__equipa_aj__"||p.cargo==="ajudante")&&<td style={{padding:"4px 4px"}}><input type="number" min="1" value={editVals.numAj} onChange={function(e){_onChangeAj(e,p.cargo);}} style={{...inpS,width:40}}/></td>}
                                <td style={{padding:"4px 6px"}}><input type="number" step="0.01" value={editVals.val} onChange={function(e){setEditVals(function(v){return {...v,val:e.target.value};});}} style={{...inpS,width:70}}/></td>
                                <td style={{padding:"4px 4px",whiteSpace:"nowrap"}}>
                                  <button onClick={function(){_salvarEdit(p);}} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer",marginRight:2}}>✅</button>
                                  <button onClick={_cancelarEdit} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>❌</button>
                                </td>
                              </tr>
                            );}
                            return(
                              <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                                <td style={{padding:"6px 8px",color:"#334155",fontWeight:500}}>{dfmt}</td>
                                {p.cargo!=="van"&&<td style={{padding:"6px 4px",textAlign:"center",color:"#475569"}}>{d.numMud}</td>}
                                {(p.id==="__equipa_aj__"||p.cargo==="ajudante")&&<td style={{padding:"6px 4px",textAlign:"center",color:"#475569"}}>{d.numAj||1}</td>}
                                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:600,color:_cor[p.cargo]||"#334155"}}>R$ {_fvs(d.val)}</td>
                                <td style={{padding:"6px 4px",textAlign:"center"}}>
                                  <button onClick={function(){_iniciarEdit(i,d,p);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,padding:2}}>✏️</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{borderTop:"2px solid #e2e8f0",background:"#f8fafc"}}>
                            <td style={{padding:"8px 8px",fontWeight:800,fontSize:11,color:"#1e293b"}} colSpan={p.cargo==="van"?1:(p.id==="__equipa_aj__"||p.cargo==="ajudante")?3:2}>TOTAL</td>
                            <td style={{padding:"8px 8px",textAlign:"right",fontWeight:800,fontSize:13,color:_cor[p.cargo]||"#334155"}}>{_fv(tot.totalVal)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
                      <button onClick={function(){_sendZap(p);}} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:800,cursor:"pointer"}}>
                        📲 Enviar Zap com estes valores
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(function(){
        var _diasMud=[...new Set(_ms.map(function(m){return m.data;}))].sort();
        if(_diasMud.length===0) return null;
        var _diasNome=["dom","seg","ter","qua","qui","sex","sáb"];
        var _totalAlm=0;var _totalDesp=0;
        _diasMud.forEach(function(dt){var cd=_cd.find(function(x){return x.data===dt;})||{};_totalAlm+=parseFloat(cd.custo_almoco)||0;_totalDesp+=parseFloat(cd.despesa_extra)||0;});
        function _saveField(dt,field,val){
          var numVal=parseFloat(val)||0;
          var _hd2={...getH(),"Content-Type":"application/json","Prefer":"return=minimal"};
          setCustosDiarios(function(prev){
            var found=false;
            var nxt=prev.map(function(c){if(c.data===dt){found=true;var u={...c};u[field]=numVal;return u;}return c;});
            if(!found){var nw={data:dt,ajudantes:0,custo_almoco:0,despesa_extra:0,descricao_extra:""};nw[field]=numVal;nxt.push(nw);}
            return nxt;
          });
          fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+dt+"&select=id",{headers:getH()})
            .then(function(r){return r.json();})
            .then(function(rows){
              var body={};body[field]=numVal;
              if(rows&&rows.length>0){return fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+dt,{method:"PATCH",headers:_hd2,body:JSON.stringify(body)});}
              else{body.data=dt;return fetch(SUPA_URL+"/rest/v1/custos_diarios",{method:"POST",headers:{...getH(),"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify(body)});}
            }).catch(function(e){console.warn(e);});
          // Sync to contas_semana para Financeiro refletir
          if(field==="custo_almoco"){
            var _almTot=0;
            _cd.forEach(function(x){_almTot+=(x.data===dt?numVal:(parseFloat(x.custo_almoco)||0));});
            if(!_cd.some(function(x){return x.data===dt;})) _almTot+=numVal;
            fetch(SUPA_URL+"/rest/v1/contas_semana",{method:"POST",headers:{...getH(),"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({semana_inicio:_sic,semana_fim:_sfc,tipo:"almoco",valor_calculado:_almTot,status:"pendente"})}).catch(function(){});
            if(typeof setContasSemana==="function"){
              setContasSemana(function(prev){
                var existe=prev.some(function(x){return x.semana_inicio===_sic&&x.tipo==="almoco";});
                if(existe) return prev.map(function(x){return(x.semana_inicio===_sic&&x.tipo==="almoco")?{...x,valor_calculado:String(_almTot)}:x;});
                return [...prev,{semana_inicio:_sic,semana_fim:_sfc,tipo:"almoco",valor_calculado:String(_almTot),status:"pendente"}];
              });
            }
          }
        }
        function _saveDesc(dt,val){
          var _hd2={...getH(),"Content-Type":"application/json","Prefer":"return=minimal"};
          setCustosDiarios(function(prev){
            var found=false;
            var nxt=prev.map(function(c){if(c.data===dt){found=true;return {...c,descricao_extra:val};}return c;});
            if(!found) nxt.push({data:dt,ajudantes:0,custo_almoco:0,despesa_extra:0,descricao_extra:val});
            return nxt;
          });
          fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+dt+"&select=id",{headers:getH()})
            .then(function(r){return r.json();})
            .then(function(rows){
              if(rows&&rows.length>0){return fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+dt,{method:"PATCH",headers:_hd2,body:JSON.stringify({descricao_extra:val})});}
              else{return fetch(SUPA_URL+"/rest/v1/custos_diarios",{method:"POST",headers:{...getH(),"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({data:dt,descricao_extra:val})});}
            }).catch(function(e){console.warn(e);});
        }
        return(
          <div style={{marginTop:10,paddingTop:10,borderTop:"2px solid #f1f5f9"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontWeight:800,fontSize:12,color:"#1e293b"}}>🍽️ Despesas Diárias</div>
              <div style={{fontSize:10,color:"#64748b"}}>{_periodo}</div>
            </div>
            {_diasMud.map(function(dt){
              var pts=dt.split("-");
              var dObj=new Date(parseInt(pts[0]),parseInt(pts[1])-1,parseInt(pts[2]));
              var dNome=_diasNome[dObj.getDay()];
              var numMud=_ms.filter(function(m){return m.data===dt;}).length;
              var cd=_cd.find(function(x){return x.data===dt;})||{custo_almoco:0,despesa_extra:0,descricao_extra:""};
              return(
                <div key={dt} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:6,border:"1px solid #e2e8f0"}}>
                  <div style={{fontWeight:700,fontSize:11,color:"#334155",marginBottom:6}}>📆 {pts[2]+"/"+pts[1]} ({dNome}) — {numMud} {numMud===1?"mudança":"mudanças"}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <div>
                      <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>🍽️ Almoço (R$)</div>
                      <input type="number" step="0.01" min="0" value={parseFloat(cd.custo_almoco)||""} onChange={function(e){_saveField(dt,"custo_almoco",e.target.value);}} placeholder="0,00" style={{width:"100%",padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>📋 Despesa (R$)</div>
                      <input type="number" step="0.01" min="0" value={parseFloat(cd.despesa_extra)||""} onChange={function(e){_saveField(dt,"despesa_extra",e.target.value);}} placeholder="0,00" style={{width:"100%",padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <div style={{marginTop:4}}>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>📝 Descrição da despesa</div>
                    <input type="text" value={cd.descricao_extra||""} onChange={function(e){_saveDesc(dt,e.target.value);}} placeholder="Ex: combustível, pedágio..." style={{width:"100%",padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                  </div>
                </div>
              );
            })}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6,padding:"6px 8px",background:"#fef2f2",borderRadius:8,fontSize:11,fontWeight:700}}>
              <div><span style={{color:"#7c3aed"}}>🍽️ Almoços: {_fv(_totalAlm)}</span> <span style={{margin:"0 6px",color:"#cbd5e1"}}>|</span> <span style={{color:"#475569"}}>📋 Despesas: {_fv(_totalDesp)}</span></div>
              <div style={{color:"#c2410c"}}>Total: {_fv(_totalAlm+_totalDesp)}</div>
            </div>
          </div>
        );
      })()}
      <div style={{marginTop:10,paddingTop:10,borderTop:"2px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>CUSTO TOTAL SEMANA</div>
          <div style={{fontWeight:900,fontSize:16,color:"#c2410c"}}>{_fv(_cSem.despTotal)}</div>
        </div>
      </div>
    </div>
  );
}
function RotaTerceirizada({token}){
  var [dados,setDados]=useState(null);
  var [erro,setErro]=useState(null);
  var [loading,setLoading]=useState(true);
  var [updating,setUpdating]=useState({});
  useEffect(function(){
    fetch(SUPA_URL+"/functions/v1/consumir-magic-link?token="+encodeURIComponent(token),{headers:{"apikey":SUPA_KEY}})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok){setDados(d);}else{setErro(d.error||"Link inválido.");}setLoading(false);})
      .catch(function(){setErro("Erro de conexão.");setLoading(false);});
  },[token]);
  function atualizarStatus(item,novoStatus,campoTempo){
    if(updating[item.id]) return;
    setUpdating(function(p){var n={...p};n[item.id]=true;return n;});
    var tabela=item._tabela||"agenda";
    fetch(SUPA_URL+"/functions/v1/atualizar-status-terceirizado",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({token:token,item_id:item.id,tabela:tabela,novo_status:novoStatus,campo_tempo:campoTempo||null})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d.ok){setDados(function(prev){if(!prev)return prev;var nRotas=prev.rotas.map(function(r){if(r.id===item.id){var u={...r,status:novoStatus};if(campoTempo)u[campoTempo]=new Date().toISOString();return u;}return r;});return {...prev,rotas:nRotas};});}
        else{alert(d.error||"Erro ao atualizar");}
        setUpdating(function(p){var n={...p};delete n[item.id];return n;});
      })
      .catch(function(){alert("Erro de conexão");setUpdating(function(p){var n={...p};delete n[item.id];return n;});});
  }
  if(loading) return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc"}}><div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:8}}>🚛</div><div style={{fontWeight:700,fontSize:14,color:"#64748b"}}>Carregando rota...</div></div></div>);
  if(erro) return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#fef2f2",padding:20}}><div style={{textAlign:"center",maxWidth:360}}><div style={{fontSize:48,marginBottom:12}}>⚠️</div><div style={{fontWeight:800,fontSize:16,color:"#dc2626",marginBottom:8}}>Link Inválido ou Expirado</div><div style={{fontSize:13,color:"#991b1b"}}>{erro}</div></div></div>);
  var _dfmt=dados.data_servico?dados.data_servico.slice(8)+"/"+dados.data_servico.slice(5,7)+"/"+dados.data_servico.slice(0,4):"";
  var _statusFlow={"confirmado":"em_deslocamento","em_deslocamento":"em_andamento","em_andamento":"realizada"};
  var _statusLabel={"confirmado":"🚗 Em Deslocamento","em_deslocamento":"🔧 Iniciar Serviço","em_andamento":"✅ Finalizar"};
  var _statusCor={"confirmado":"#f97316","em_deslocamento":"#2563eb","em_andamento":"#16a34a"};
  var _statusBg={"confirmado":"#fff7ed","em_deslocamento":"#eff6ff","em_andamento":"#f0fdf4"};
  var _statusBadge={"confirmado":"⏳ Aguardando","em_deslocamento":"🚗 Em Deslocamento","em_andamento":"🔧 Em Andamento","realizada":"✅ Finalizada"};
  return(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#1e3a8a)",padding:"20px 16px 16px",color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>TELEMIM — Rota Terceirizada</div>
        <div style={{fontSize:18,fontWeight:900,marginTop:4}}>🚛 {dados.motorista_nome||"Motorista"}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",marginTop:2}}>📅 {_dfmt}</div>
      </div>
      <div style={{padding:"12px 12px 80px"}}>
        {(!dados.rotas||dados.rotas.length===0)?(
          <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:8}}>📭</div><div style={{fontWeight:700,fontSize:14}}>Nenhuma OS para hoje.</div></div>
        ):(
          dados.rotas.map(function(r){
            var st=r.status||"confirmado";
            var prox=_statusFlow[st];
            var isFinal=st==="realizada";
            return(
              <div key={r.id} style={{background:"#fff",borderRadius:14,border:"2px solid "+(isFinal?"#86efac":"#e2e8f0"),padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>{r.nome||"Sem nome"}</div>
                  <div style={{background:_statusBg[st]||"#f8fafc",border:"1px solid "+(_statusCor[st]||"#e2e8f0"),borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:_statusCor[st]||"#64748b",whiteSpace:"nowrap"}}>{_statusBadge[st]||st}</div>
                </div>
                {r.horario&&<div style={{fontSize:12,color:"#475569",marginBottom:6}}>⏰ {r.horario}h</div>}
                {r.contato&&<div style={{fontSize:11,color:"#64748b",marginBottom:6}}>📱 <a href={"tel:"+r.contato} style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{r.contato}</a></div>}
                <div style={{fontSize:12,marginTop:8}}>📦 {r.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.origem)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{r.origem} 🗺️</a>:<span style={{color:"#94a3b8"}}>Origem não informada</span>}</div>
                <div style={{fontSize:12,marginTop:16}}>🏘️ {r.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.destino)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{r.destino} 🗺️</a>:<span style={{color:"#94a3b8"}}>Destino não informado</span>}</div>
                {r.observacoes&&<div style={{fontSize:11,color:"#64748b",marginTop:8,fontStyle:"italic"}}>📝 {r.observacoes}</div>}
                {(r.inicio_van_em||r.inicio_caminhao_em||r.inicio_em)&&<div style={{fontSize:10,color:"#16a34a",marginTop:6}}>🚗 Saiu: {new Date(r.inicio_van_em||r.inicio_caminhao_em||r.inicio_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>}
                {(r.chegada_van_em||r.chegada_caminhao_em)&&<div style={{fontSize:10,color:"#2563eb",marginTop:2}}>📍 Chegou: {new Date(r.chegada_van_em||r.chegada_caminhao_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>}
                {(r.termino_van_em||r.termino_caminhao_em||r.termino_em)&&<div style={{fontSize:10,color:"#16a34a",marginTop:2}}>🏁 Fim: {new Date(r.termino_van_em||r.termino_caminhao_em||r.termino_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>}
                {!isFinal&&prox&&(
                  <button onClick={function(){var ct=null;if(st==="confirmado")ct="inicio_em";if(st==="em_deslocamento")ct="chegada_em";if(st==="em_andamento")ct="termino_em";atualizarStatus({id:r.id,_tabela:"agenda"},prox,ct);}} disabled={!!updating[r.id]} style={{marginTop:12,width:"100%",padding:12,background:updating[r.id]?"#94a3b8":(_statusCor[st]||"#3b82f6"),color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:13,cursor:updating[r.id]?"not-allowed":"pointer",boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>{updating[r.id]?"⏳ Atualizando...":_statusLabel[st]}</button>
                )}
                {isFinal&&<div style={{marginTop:10,textAlign:"center",fontWeight:700,fontSize:12,color:"#16a34a"}}>✅ Mudança finalizada!</div>}
              </div>
            );
          })
        )}
        <div style={{marginTop:16,textAlign:"center",padding:"10px",background:"#fffbeb",borderRadius:10,border:"1px solid #fcd34d"}}>
          <div style={{fontSize:11,color:"#92400e",fontWeight:600}}>⚠️ Este link expira à meia-noite de {_dfmt}.</div>
        </div>
      </div>
    </div>
  );
}
export default function App(){
  const [usuario,setUsuario]=useState(null);
  const [abaMotorista,setAbaMotorista]=useState('hoje');
  const [regMotMes,setRegMotMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [modalAssinatura, setModalAssinatura] = useState(false);
  const [mudancaCanhoto, setMudancaCanhoto] = useState(null);
  const [loginForm,setLoginForm]=useState({email:"",senha:""});
  const [loginErro,setLoginErro]=useState("");
  const [loginLoad,setLoginLoad]=useState(false);
  const [authChecked,setAuthChecked]=useState(true);
  const [listaUsuarios,setListaUsuarios]=useState([])
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [activityLogs,setActivityLogs]=useState([]);
  const [toast,setToast]=useState(null);;
  const [notificacoes,setNotificacoes]=useState([]);
  const [notifLimit,setNotifLimit]=useState(10);
  const [novoUser,setNovoUser]=useState({nome:"",email:"",senha:"",perfil:"promorar",tipo_veiculo:"",placa_veiculo:"",contato:""});
  const [savingUser,setSavingUser]=useState(false);
  const [editUser,setEditUser]=useState(null);
  const [savingEdit,setSavingEdit]=useState(false);
  const [editMsg,setEditMsg]=useState("");
  const [userMsg,setUserMsg]=useState("");
  const [tab,setTab]=useState("dashboard");
  const [periodoFin,setPeriodoFin]=useState("semana");
  const [periodoFinMot,setPeriodoFinMot]=useState("semana");
  const [despPend,setDespPend]=useState({});
  const [calMes,setCalMes]=useState(new Date().getMonth());
  const [calAno,setCalAno]=useState(new Date().getFullYear());
  const [calDiaSel,setCalDiaSel]=useState(null);
  const [magicToken,setMagicToken]=useState(null);
  const [magicLoading,setMagicLoading]=useState(false);
  const [magicData,setMagicData]=useState(null);
  const [cfgEdit,setCfgEdit]=useState({van1a:1000,vanAdd:0,aj1a:80,ajAdd:20,dataInicioRegra:'',imposto:16});
  const [cfgSaved,setCfgSaved]=useState(false);
  const [bioLock,setBioLock]=useState(localStorage.getItem('tmim_bio_enabled')==='true'&&!!localStorage.getItem('tmim_u'));
  const [mudancas,setMudancas]=useState([]);
  const [agenda,setAgenda]=useState([]);
  const [_agendaRemovidaIds,_setAgendaRemovidaIds]=useState(new Set());
  const [custosDiarios,setCustosDiarios]=useState([]);
  const [showImport,setShowImport]=useState(false);
  const [cfgWA,setCfgWA]=useState({admin_whatsapp:"",supervisor_whatsapp:"",whatsapp_ativo:"false",evolution_api_url:"",evolution_api_key:"",evolution_instance:""});
  const [cfgWAauto,setCfgWAauto]=useState({
    atribuida_motorista:{ativo:false,dest:["mot_van","mot_caminhao"],msg:"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDE9B *MUDAN\u00C7A ATRIBU\u00CDDA*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDCC5 Data: *{data}*\n\u23F0 Hora: *{hora}*\n\n\uD83D\uDCCD *Origem:*\n{origem}\n\n\uD83D\uDCCD *Destino:*\n{destino}\n\n\uD83D\uDC77 *Supervisor:* {supervisor}\n\uD83D\uDD27 TELEMIM - PROMORAR - *VERIFIQUE O APP!*"},
    atribuida_supervisor:{ativo:false,dest:["supervisor"],msg:"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDE9B *MUDAN\u00C7A ATRIBU\u00CDDA*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDCC5 Data: *{data}*\n\u23F0 Hora: *{hora}*\n\n\uD83D\uDCCD *Origem:*\n{origem}\n\n\uD83D\uDCCD *Destino:*\n{destino}\n\n\uD83D\uDE9A *Caminh\u00E3o:* {caminhao}\n\uD83D\uDE90 *Van:* {van}\n\uD83D\uDD27 TELEMIM - PROMORAR - *VERIFIQUE O APP!*"},
    deslocamento_admin:{ativo:false,dest:["admin"],msg:"\uD83D\uDCCD {motorista} iniciou deslocamento\nCliente: {cliente}"},
    deslocamento_cliente:{ativo:false,dest:["cliente"],msg:"\uD83D\uDCCD Seu motorista esta a caminho!\nEquipe TELEMIM"},
    deslocamento_supervisor:{ativo:false,dest:["supervisor"],msg:"\uD83D\uDCCD {motorista} iniciou deslocamento\nCliente: {cliente}"},
    finalizada_admin:{ativo:false,dest:["admin"],msg:"\u2705 Mudanca finalizada!\nCliente: {cliente}\nMotorista: {motorista}"},
    finalizada_cliente:{ativo:false,dest:["cliente"],msg:"\u2705 Sua mudanca foi concluida!\nObrigado por escolher a TELEMIM."},
    finalizada_supervisor:{ativo:false,dest:["supervisor"],msg:"\u2705 Finalizada: {cliente}\nMotorista: {motorista}"}
  });
  const [isUploading,setIsUploading]=useState(false);
  const [isApproving,setIsApproving]=useState({});
  const [waLoading,setWaLoading]=useState(false);
  const [showViewPDF,setShowViewPDF]=useState(false);
  const [mudViewPDF,setMudViewPDF]=useState(null);
  const [confirmFinAg,setConfirmFinAg]=useState(null);
  const [cancelModal,setCancelModal]=useState(null);
  const [cancelMotivo,setCancelMotivo]=useState("");
  const [viewEquipeAg,setViewEquipeAg]=useState(null);
  const [showAssinatura,setShowAssinatura]=useState(false);
  const [mudAssinatura,setMudAssinatura]=useState(null);
  const [ressalvas,setRessalvas]=useState("");
  const [importText,setImportText]=useState("");
  const [showImportAg,setShowImportAg]=useState(false);
  const [subConfig,setSubConfig]=useState("usuarios");
  const [importTextAg,setImportTextAg]=useState("");
  const [form,setForm]=useState(initForm);
  const [agForm,setAgForm]=useState({...initForm,status:"confirmado"});
  const [rel,setRel]=useState(null);
  const [relDataIni,setRelDataIni]=useState("");
  const [relDataFim,setRelDataFim]=useState("");
  const [relAj,setRelAj]=useState("3");
  const [relAlm,setRelAlm]=useState("0");
  useEffect(()=>{window.__mudancas=mudancas;},[mudancas]);
  // ── Realtime: sincronização automática entre utilizadores ──────────────
  useEffect(()=>{
    var canal=null;
    getSupaClient().then(function(sb){
      if(!sb) return;
      canal=sb.channel('telemim-live')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'mudancas'},function(p){
          setMudancas(function(prev){
            if(prev.some(function(o){return o.id===p.new.id;})) return prev;
            return [p.new,...prev];
          });
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'mudancas'},function(p){setMudancas(function(prev){if(p.new&&p.new.deleted_at)return prev.filter(function(o){return o.id!==p.new.id;});return prev.map(function(o){return o.id===p.new.id?Object.assign({},o,p.new):o;});});})
        .on('postgres_changes',{event:'DELETE',schema:'public',table:'mudancas'},function(p){
          setMudancas(function(prev){return prev.filter(function(o){return o.id!==p.old.id;});});
        })
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'agenda'},function(p){
          setAgenda(function(prev){
            if(prev.some(function(a){return a.id===p.new.id;})) return prev;
            return [p.new,...prev];
          });
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'agenda'},function(p){
          setAgenda(function(prev){if(prev.some(function(a){return a.id===p.new.id;})){return prev.map(function(a){return a.id===p.new.id?Object.assign({},a,p.new):a;});}return [p.new].concat(prev);});
        })
        .on('postgres_changes',{event:'DELETE',schema:'public',table:'agenda'},function(p){
          setAgenda(function(prev){return prev.filter(function(a){return a.id!==p.old.id;});});
        })
        .subscribe(function(status){
          if(status==='SUBSCRIBED') setSyncStatus('✅ Sincronizado (live)');
        });
    });
    return function(){if(canal){getSupaClient().then(function(sb){if(sb) sb.removeChannel(canal);});}};
  },[]);
  const [semanaIdx,setSemanaIdx]=useState(0);
  const [loading,setLoading]=useState(true);
  const [flash,setFlash]=useState("");
  const [showNotifBanner,setShowNotifBanner]=useState(false);
  const [isOffline,setIsOffline]=useState(!navigator.onLine);
  const [expand,setExpand]=useState(null);
  const [search,setSearch]=useState("");
  const [filtroMes,setFiltroMes]=useState("semana");
  const [filtroDataIni,setFiltroDataIni]=useState("");
  const [filtroDataFim,setFiltroDataFim]=useState("");
  const [filtroSup,setFiltroSup]=useState("");
  const [editMud,setEditMud]=useState(null);
  const [viewMud,setViewMud]=useState(null);
  const [convertModal,setConvertModal]=useState(null);
  const [editAg,setEditAg]=useState(null);
  const [syncStatus,setSyncStatus]=useState("✅ Sincronizado");
  const [contasPagar,setContasPagar]=useState([]);
  const [contasHist,setContasHist]=useState([]);
  const [novaContaForm,setNovaContaForm]=useState({tipo:'van',descricao:'',valor:'',beneficiario:'',telefone:'',vencimento:''});
  const [showNovaConta,setShowNovaConta]=useState(false);
  const [contasSemana,setContasSemana]=useState([]);
  const [custosSemana,setCustosSemana]=useState([]);
  const [contasFilter,setContasFilter]=useState("todas");
  const [contaEditId,setContaEditId]=useState(null);const [totalEditId,setTotalEditId]=useState(null);const [totalEditVal,setTotalEditVal]=useState("");
  const [backupCfg,setBackupCfg]=useState({ativo:false,clientId:"",clientSecret:"",refreshToken:""});
  const [backupHist,setBackupHist]=useState([]);
  const [backupLoading,setBackupLoading]=useState(false);
  const [contaEditVal,setContaEditVal]=useState("");

  // ── GPS TRACKING STATE ─────────────────────────────────────────────────────
  const [gpsWatches,setGpsWatches]=useState({});// {van:{id,agendaId}, cam:{id,agendaId}}
  const [pwaInstallPrompt,setPwaInstallPrompt]=useState(null);
  const [showPwaModal,setShowPwaModal]=useState(false);
  const [pwaGpsPending,setPwaGpsPending]=useState(null);// {agId,veiTipo} — resume after install
  const [gpsPositions,setGpsPositions]=useState([]);// admin: latest positions per motorista
  const [showGpsMap,setShowGpsMap]=useState(false);
  const [gpsMapAgenda,setGpsMapAgenda]=useState(null);
  const [gpsEta,setGpsEta]=useState(null);
  const [monitorFiltro,setMonitorFiltro]=useState("todos");

  const MAPBOX_TOKEN=["pk.eyJ1IjoidGVsZW1pbSIsImEiOiJjbW9yd","HJzMmcwNW8yMndwdnZ1bDFoOXZ2In0.","4MHg1RPF_jFgiQt4Ax4Psw"].join("");

  // ── GPS: Send position to Supabase ─────────────────────────────────────────
  function _gpsSendPosition(agendaId,coords){
    var payload={motorista_id:usuario.id,agenda_id:agendaId,lat:coords.latitude,lng:coords.longitude,heading:coords.heading,speed:coords.speed};
    fetch(SUPA_URL+"/rest/v1/gps_tracking",{
      method:"POST",
      headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
      body:JSON.stringify(payload)
    }).catch(function(){});
  }

  // ── GPS: Check if running as installed PWA ─────────────────────────────────
  function _isPwaInstalled(){
    return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
  }

  // ── GPS: Start tracking (motorista) — per vehicle type ─────────────────────
  function gpsStart(agendaId,veiTipo){
    var key=veiTipo||"van";
    if(gpsWatches[key]) return;
    if(!navigator.geolocation) return;
    // If first time — show Traccar install prompt
    if(!localStorage.getItem("tmim_traccar_skip")){
      setPwaGpsPending({agId:agendaId,veiTipo:veiTipo});
      setShowPwaModal(true);
      // Continue GPS anyway — don't block, just inform
    }
    var _lastSent=0;
    // watchPosition — fires when position changes (foreground only on mobile)
    var wid=navigator.geolocation.watchPosition(
      function(pos){
        var now=Date.now();
        if(now-_lastSent<30000) return;
        _lastSent=now;
        _gpsSendPosition(agendaId,pos.coords);
      },
      function(err){console.warn("[GPS] watch error:",err.message);},
      {enableHighAccuracy:true,maximumAge:10000,timeout:15000}
    );
    // setInterval fallback — forces getCurrentPosition every 30s even if watchPosition stalls
    var iid=setInterval(function(){
      navigator.geolocation.getCurrentPosition(
        function(pos){_gpsSendPosition(agendaId,pos.coords);},
        function(){},
        {enableHighAccuracy:true,maximumAge:5000,timeout:10000}
      );
    },30000);
    // Wake Lock — prevent screen sleep on mobile
    var wl=null;
    if(navigator.wakeLock){
      navigator.wakeLock.request("screen").then(function(lock){wl=lock;}).catch(function(){});
    }
    setGpsWatches(function(prev){var n=Object.assign({},prev);n[key]={watchId:wid,intervalId:iid,wakeLock:wl,agendaId:agendaId};return n;});
  }

  // ── GPS: Stop tracking (motorista) — per vehicle type ─────────────────────
  function gpsStop(veiTipo){
    var key=veiTipo||"van";
    setGpsWatches(function(prev){
      if(!prev[key]) return prev;
      navigator.geolocation.clearWatch(prev[key].watchId);
      clearInterval(prev[key].intervalId);
      if(prev[key].wakeLock){try{prev[key].wakeLock.release();}catch(e){}}
      var n=Object.assign({},prev);delete n[key];return n;
    });
  }

  // ── GPS: Load latest positions for admin (optionally filter by motorista) ──
  async function gpsLoadPositions(agId,motoristaId){
    // Try Traccar first (background GPS)
    try{
      var _ag=agenda.find(function(a){return a.id===agId;});
      var _veiTipo=null;
      if(_ag&&motoristaId){
        if(_ag.motorista_van_id===motoristaId)_veiTipo="VAN";
        else if(_ag.motorista_caminhao_id===motoristaId)_veiTipo="CAMINHAO";
      }
      var _devId=_veiTipo==="VAN"?"VAN001":"CAM001";
      var tr=await fetch(SUPA_URL+"/functions/v1/traccar-position",{method:"POST",headers:{...getH(),"Content-Type":"application/json"},body:JSON.stringify({deviceId:_devId})});
      if(tr.ok){
        var td=await tr.json();
        if(td.ok&&td.position){return {lat:td.position.lat,lng:td.position.lng,speed:td.position.speed,battery:td.position.battery,created_at:td.position.time,source:"traccar"};}
      }
    }catch(e){}
    // Fallback to Supabase gps_tracking (PWA GPS)
    try{
      var url=SUPA_URL+"/rest/v1/gps_tracking?agenda_id=eq."+agId+"&order=created_at.desc&limit=1";
      if(motoristaId) url+="&motorista_id=eq."+motoristaId;
      var r=await fetch(url,{headers:getH()});
      if(!r.ok) return null;
      var d=await r.json();
      return d&&d.length>0?d[0]:null;
    }catch(e){return null;}
  }

  // ── GPS: Fetch ETA via Mapbox Directions ───────────────────────────────────
  async function gpsCalcEta(fromLat,fromLng,toAddress){
    try{
      // Geocode destination address
      var geoUrl="https://api.mapbox.com/geocoding/v5/mapbox.places/"+encodeURIComponent(toAddress)+".json?access_token="+MAPBOX_TOKEN+"&limit=1&country=BR";
      var geoR=await fetch(geoUrl);
      var geoD=await geoR.json();
      if(!geoD.features||geoD.features.length===0) return null;
      var destCoords=geoD.features[0].center;// [lng,lat]
      // Directions API
      var dirUrl="https://api.mapbox.com/directions/v5/mapbox/driving/"+fromLng+","+fromLat+";"+destCoords[0]+","+destCoords[1]+"?overview=full&geometries=geojson&access_token="+MAPBOX_TOKEN;
      var dirR=await fetch(dirUrl);
      var dirD=await dirR.json();
      if(!dirD.routes||dirD.routes.length===0) return null;
      var route=dirD.routes[0];
      var durMin=Math.ceil(route.duration/60);
      var eta=new Date(Date.now()+route.duration*1000);
      var _pad=function(n){return String(n).padStart(2,"0");};
      return {durMin:durMin,etaStr:_pad(eta.getHours())+":"+_pad(eta.getMinutes()),route:route.geometry,destCoords:destCoords};
    }catch(e){return null;}
  }

  // ── LOAD DATA ──────────────────────────────────────────────────────────────
  // ── FUNÇÃO loadContasSemana ─────────────────────────────────────────
  async function loadContasSemana(){
    try{
      var res=await fetch(SUPA_URL+"/rest/v1/contas_semana?order=semana_inicio.desc,tipo.asc&limit=200",{headers:getH()});
      if(!res.ok)return;
      var dados=await res.json();
      if(dados&&Array.isArray(dados))setContasSemana(dados);
    }catch(e){}
  }

  // ── DERIVED STATE: useMemo reactivos ─────────────────────────────────
  var custoSemanal=useMemo(function(){
    var _hj=new Date();var _dw=_hj.getDay();var _dif=_dw===0?6:_dw-1;
    var _s0=new Date(_hj.getFullYear(),_hj.getMonth(),_hj.getDate()-_dif);
    var _s1=new Date(_s0.getFullYear(),_s0.getMonth(),_s0.getDate()+6);
    var _pad=function(n){return String(n).padStart(2,"0");};
    var _fmt=function(d){return d.getFullYear()+"-"+_pad(d.getMonth()+1)+"-"+_pad(d.getDate());};
    var _si=_fmt(_s0);var _sf=_fmt(_s1);var _tot=0;
    var _all=[...contasPagar,...contasHist];
    _all.forEach(function(x){var _ref=x.data_pagamento||x.vencimento||"";if(_ref>=_si&&_ref<=_sf)_tot+=Number(x.valor)||0;});
    return _tot;
  },[contasPagar,contasHist]);


  var totalContasPendente=useMemo(function(){
    return contasPagar.reduce(function(acc,x){return acc+(Number(x.valor)||0);},0);
  },[contasPagar]);

  var totalContasPago=useMemo(function(){
    return contasHist.reduce(function(acc,x){return acc+(Number(x.valor)||0);},0);
  },[contasHist]);

  // ── MONITORAMENTO: agrupamento por supervisor (useMemo) ─────────────
  var monitorData=useMemo(function(){
    var _hj=new Date().toISOString().slice(0,10);
    // Derive real status from vehicle timestamps
    function _deriveStatus(item){
      // Check van progress
      if(item.termino_van_em) return "van_concluido";
      if(item.chegada_van_em) return "van_descarregando";
      if(item.saiu_destino_van_em) return "van_destino";
      if(item.chegou_origem_van_em) return "van_origem";
      if(item.inicio_van_em||item.van_saiu_em) return "van_deslocamento";
      // Check cam progress
      if(item.termino_caminhao_em) return "cam_concluido";
      if(item.chegada_caminhao_em) return "cam_descarregando";
      if(item.saiu_destino_cam_em) return "cam_destino";
      if(item.chegou_origem_cam_em) return "cam_origem";
      if(item.inicio_caminhao_em||item.caminhao_saiu_em) return "cam_deslocamento";
      // Fallback to status field
      return item.status||"confirmado";
    }
    function _isActive(item){
      var d=_deriveStatus(item);
      return d.indexOf("deslocamento")>=0||d.indexOf("origem")>=0||d.indexOf("destino")>=0||d.indexOf("descarregando")>=0||d==="Em Deslocamento"||d==="Realizando"||d==="Na Origem"||d==="Deslocamento Destino"||d==="Descarregando";
    }
    function _isConcl(item){
      var d=_deriveStatus(item);
      var _st=item.status;
      var _terminou=item.termino_em||item.termino_van_em||item.termino_caminhao_em;
      return d.indexOf("concluido")>=0||_terminou||["Concluido","Concluído","concluido","concluida","realizado","realizada"].indexOf(_st)>=0;
    }
    var _todayAg=(agenda||[]).filter(function(a){return a.data===_hj&&!a.deleted_at&&a.supervisor_id;});
    var _todayMud=(mudancas||[]).filter(function(m){return m.data===_hj&&!m.deleted_at&&m.supervisor_id;});
    var _seen={};
    var _all=[];
    _todayAg.forEach(function(a){var key=(a.nome||"").toLowerCase().trim()+"|"+a.data;_seen[key]=true;_all.push(a);});
    _todayMud.forEach(function(m){var key=(m.nome||"").toLowerCase().trim()+"|"+m.data;if(!_seen[key]){_seen[key]=true;_all.push(m);}});
    var _groups={};
    _all.forEach(function(item){
      var sid=item.supervisor_id;
      if(!_groups[sid])_groups[sid]={supervisorId:sid,activeMove:null,pendingMoves:[],completedMoves:[]};
      if(_isActive(item)){
        if(!_groups[sid].activeMove) _groups[sid].activeMove=item;
        else _groups[sid].pendingMoves.unshift(item);// multiple active → show as pending too
      }
      else if(_isConcl(item)){_groups[sid].completedMoves.push(item);}
      else{_groups[sid].pendingMoves.push(item);}
    });
    return Object.values(_groups);
  },[agenda,mudancas]);

  // ── useEffect REACTIVO: recarregar contasSemana quando contas mudam ──
  useEffect(function(){loadContasSemana();},[contasPagar,contasHist]);
  useEffect(function(){if(prestadores.length===0)loadPrestadores();if((isAdmin||isPromorar||isSocial||isSupervisor)&&listaUsuarios.length===0&&(tab==="dashboard"||tab==="monitoramento"||tab==="agenda"||tab==="lista"||tab==="contas"||tab==="financeiro"))carregarUsuarios();if(isMotorista&&(tab==="dashboard"||tab==="fin_mot"||tab==="registros_mot")){_ensureAuth().catch(function(){}).then(function(){loadMud();loadAg();});}},[tab]);
  useEffect(()=>{
    async function load(){
      try{
        // Refresh token if expired before loading data
        try{
          var _su=JSON.parse(localStorage.getItem('tmim_u')||'{}');
          if(_su&&_su.token){
            var _refreshed=await _getValidToken(_su,SUPA_URL,SUPA_KEY);
            if(_refreshed&&_refreshed!==_su.token){
              _su.token=_refreshed;
              localStorage.setItem('tmim_u',JSON.stringify(_su));
            }
          }
        }catch(_re){}
        // Carregar mudancas e agenda em paralelo
        try{
          var p=await Promise.all([dbGet("mudancas"),dbGet("agenda","deleted_at=is.null"),loadCfgWA()]);
          var mRows=p[0]||[];var aRows=p[1]||[];
          var _perfLoad=(JSON.parse(localStorage.getItem('tmim_u')||'{}')).perfil||"";
          if(mRows.length===0&&_perfLoad!=="motorista"){await dbUpsert("mudancas",DADOS_INICIAIS);mRows=DADOS_INICIAIS;}
          if(aRows.length===0&&_perfLoad!=="motorista"){await dbUpsert("agenda",AGENDA_INICIAIS);aRows=AGENDA_INICIAIS;}
          var cRows=await dbGetCustos();
          setMudancas(mRows);setAgenda(aRows);setCustosDiarios(cRows||[]);
          window.__mudancas=mRows;
          setSyncStatus("✅ Sincronizado");
        }catch(e1){
          var _perfFall=(JSON.parse(localStorage.getItem('tmim_u')||'{}')).perfil||"";
          if(_perfFall==="motorista"){setMudancas([]);setAgenda([]);}
          else{setMudancas(DADOS_INICIAIS);setAgenda(AGENDA_INICIAIS);}
          setSyncStatus("⚠️ Offline");
        }
        // Carregar contas (nao bloqueia o app se falhar)
        try{
          var cpRows=await dbGetContas("pendente");
          setContasPagar(cpRows||[]);
        }catch(e2){setContasPagar([]);}
        try{
          var chRows=await dbGetContas("pago");
          setContasHist(chRows||[]);
        }catch(e3){setContasHist([]);}
      }finally{
        loadPrestadores();
        loadAjudantes();
        loadEquipeDia();
        loadPagamentos();
        // SEMPRE executado — garante que o app abre
                setAuthChecked(true);
        setLoading(false);
      }
    }
    load();
    // === REALTIME: Supabase WebSocket + polling 30s ===
    var wsUrl=SUPA_URL.replace("https://","wss://").replace("http://","ws://")+"/realtime/v1/websocket?apikey="+SUPA_KEY+"&log_level=info";
    var ws=null;
    try{
      ws=new WebSocket(wsUrl);
      ws.onopen=function(){ws.send(JSON.stringify({topic:"realtime:public:mudancas",event:"phx_join",payload:{},ref:"1"}));ws.send(JSON.stringify({topic:"realtime:public:agenda",event:"phx_join",payload:{},ref:"2"}));};
      ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.event==="INSERT"||m.event==="UPDATE"||m.event==="DELETE"){if(m.topic&&m.topic.includes("mudancas"))loadMud();else if(m.topic&&m.topic.includes("agenda"))loadAg();}}catch(err){}};
      ws.onerror=function(){};
    }catch(err){}
    var pollId=setInterval(function(){if(document.visibilityState==="visible"){loadMud();loadAg();}},30000);
    var onVisible=function(){if(document.visibilityState==="visible"){loadMud();loadAg();}};
    document.addEventListener("visibilitychange",onVisible);
    return function(){clearInterval(pollId);document.removeEventListener("visibilitychange",onVisible);if(ws&&ws.readyState===1)ws.close();};
  },[]);
  async function loadMud(){try{const r=await dbGet("mudancas","deleted_at=is.null");if(r){setMudancas(r);idbSet("mudancas",r);}}catch(e){var cached=await idbGet("mudancas");if(cached)setMudancas(cached);}}
  async function loadAg(){try{const r=await dbGet("agenda");if(r){var mapped=r.map(function(x){return {...x,_dbId:x.id};});setAgenda(mapped);idbSet("agenda",mapped);}}catch(e){var cached=await idbGet("agenda");if(cached)setAgenda(cached);}}
  async function loadCfgWA(){
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=in.(admin_whatsapp,supervisor_whatsapp,whatsapp_ativo,evolution_api_url,evolution_api_key,evolution_instance,wa_auto_config)&select=chave,valor",{headers:getH()});
      if(!r.ok) return;
      var rows=await r.json();
      if(!Array.isArray(rows)) return;
      var obj={};
      rows.forEach(function(row){obj[row.chave]=row.valor||"";});
      setCfgWA(function(prev){return {...prev,...obj};});
      if(obj.wa_auto_config){try{setCfgWAauto(JSON.parse(obj.wa_auto_config));}catch(e){}}
    }catch(e){console.warn("loadCfgWA:",e);}
  }
  // ── ENVIAR WHATSAPP VIA EVOLUTION API ─────────────────────────────────────────
  async function enviarWA(numero,mensagem){
    if(!numero||!mensagem)return;
    var clean=numero.replace(/\D/g,"");
    if(!clean)return;
    try{
      await fetch(SUPA_URL+"/functions/v1/enviar-whatsapp",{method:"POST",headers:{...getH(),"Content-Type":"application/json"},body:JSON.stringify({numero:clean,mensagem:mensagem})});
    }catch(e){console.warn("[WA] envio falhou:",e);}
  }
  function substituirVarsWA(template,vars){
    var msg=template;
    Object.keys(vars).forEach(function(k){msg=msg.replace(new RegExp("\\{"+k+"\\}","g"),vars[k]||"");});
    return msg;
  }
  function resolverDestinatariosWA(destArray,ag){
    var nums=[];
    (destArray||[]).forEach(function(d){
      if(d==="mot_van"&&ag.motorista_van_id){var u=listaUsuarios.find(function(x){return x.id===ag.motorista_van_id;});if(u&&u.contato)nums.push(u.contato);}
      if(d==="mot_caminhao"&&ag.motorista_caminhao_id){var u=listaUsuarios.find(function(x){return x.id===ag.motorista_caminhao_id;});if(u&&u.contato)nums.push(u.contato);}
      if(d==="admin"&&cfgWA.admin_whatsapp){nums.push(cfgWA.admin_whatsapp);}
      if(d==="supervisor"&&ag.supervisor_id){var u=listaUsuarios.find(function(x){return x.id===ag.supervisor_id;});if(u&&u.contato)nums.push(u.contato);}
      if(d==="promorar"){listaUsuarios.filter(function(x){return x.perfil==="promorar"&&x.ativo&&x.contato;}).forEach(function(x){nums.push(x.contato);});}
      if(d==="social"){listaUsuarios.filter(function(x){return x.perfil==="social"&&x.ativo&&x.contato;}).forEach(function(x){nums.push(x.contato);});}
      if(d==="cliente"&&ag.contato){nums.push(ag.contato);}
    });
    return[...new Set(nums)];
  }

  // ── SYNC HELPERS ───────────────────────────────────────────────────────────
  function parseImport(txt){
    // Normalizar: remover asteriscos do WhatsApp, trim por linha
    var raw=txt.replace(/\*/g,"").replace(/\r/g,"");
    var lines=raw.split("\n").map(function(l){return l.trim();});
    var full=lines.join("\n");

    // NOME: "Sr./Sra. Nome - Selo X" ou "O Sr. Nome - Selo X" ou primeiro nome:valor
    var nome="";
    var nomeM=full.match(/(?:O\s+)?Sr[a]?\.?\s+([^\n\-]+?)\s*[-\u2013]\s*Selo/i)
      ||full.match(/(?:O\s+)?Sr[a]?\.?\s+([^\n]+)/i);
    if(nomeM) nome=nomeM[1].replace(/[-\u2013].*$/,"").trim();

    // SELO: "Selo XXXX" ou nome - Selo X ou padrão alfanumérico próximo de "Selo"
    var selo="";
    var seloM=full.match(/[Ss]elo\s*[:\-]?\s*([\w\d][\w\d\-\.]+)/)
      ||full.match(/[-\u2013]\s*[Ss]elo\s+([\w\d][\w\d\-\.]+)/i)
      ||full.match(/\b([A-Z]{1,4}[\d][\w\-]*)\b/);
    if(seloM) selo=seloM[1].trim();

    // CONTATO: aceita "Contato:", "Telefone:", "Celular:", "Tel:", "Fone:"
    var contato="";
    var contatoM=full.match(/(?:Contato|Telefone|Celular|Tel|Fone)\s*[:\-]\s*([^\n]+)/i);
    if(contatoM) contato=contatoM[1].replace(/[*\s]/g," ").trim();

    // COMUNIDADE: aceita "CIS:", "Comunidade:", "(nome da comunidade)"
    var comunidade="";
    var comM=full.match(/CIS\s*[:\-]\s*([^\n]+)/i)
      ||full.match(/[Cc]omunidade\s*[:\-]\s*([^\n]+)/i)
      ||full.match(/\(([^)\d][^)]+)\)/);
    if(comM) comunidade=comM[1].trim();

    // DATA: aceita DD/MM/AAAA, DD/MM/AA, DD/MM, com ou sem (dia-da-semana)
    var data="";
    var dataM=full.match(/Data\s*(?:[Ss]olicitad[ao]|da\s*[Mm]udan[cç]a)?\s*[:\-]?\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i)
      ||full.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if(dataM){
      var _dd=dataM[1].padStart(2,"0");
      var _mm=dataM[2].padStart(2,"0");
      var _aa=dataM[3]?String(dataM[3]):""+new Date().getFullYear();
      if(_aa.length===2) _aa="20"+_aa;
      data=_aa+"-"+_mm+"-"+_dd;
    } else {
      // Fallback: nome do dia + DD/MM
      var dM2=full.match(/(segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|domingo)[^\d]*(\d{1,2})[\/\-](\d{1,2})/i);
      if(dM2){var _y=new Date().getFullYear();data=_y+"-"+dM2[3].padStart(2,"0")+"-"+dM2[2].padStart(2,"0");}
    }

    // HORÁRIO: aceita "Horário:", "Hora:", "H:", "11h", "11:00"
    var horario="";
    var horM=full.match(/(?:[Hh]or[aá]rio|[Hh]ora|[Hh]r?)\.?\s*[:\-]\s*([^\n]+)/i)
      ||full.match(/(\d{1,2})[Hh](\d{0,2})/);
    if(horM){
      if(horM[0].match(/[:\-]/)){
        horario=horM[1].replace(/[*h]/gi,"").trim();
      } else {
        horario=horM[1]+(horM[2]?":"+horM[2].padStart(2,"0"):":00");
      }
    }

    // ORIGEM: aceita "Endereço de saída:", "Endereço inicial:", "Saída:", "Endereço saída:"
    var origem="";
    var origM=full.match(/[Ee]ndere[cç]o\s+(?:de\s+)?[Ss]a[íi]da\s*[:\-]\s*([^\n]+)/)
      ||full.match(/[Ee]ndere[cç]o\s+[Ii]nicial\s*[:\-]\s*([^\n]+)/)
      ||full.match(/[Ss]a[íi]da\s*[:\-]\s*([^\n]+)/);
    if(origM) origem=origM[1].replace(/\*+/g,"").trim();

    // DESTINO: aceita "Endereço Final:", "Destino:", "Endereço de destino:"
    var destino="";
    var destM=full.match(/[Ee]ndere[cç]o\s+[Ff]inal\s*[:\-]\s*([^\n]+)/)
      ||full.match(/[Ee]ndere[cç]o\s+(?:de\s+)?[Dd]estino\s*[:\-]\s*([^\n]+)/)
      ||full.match(/[Dd]estino\s*[:\-]\s*([^\n]+)/);
    if(destM) destino=destM[1].replace(/\*+/g,"").trim();

    // VAN: detecta "Van" no texto
    var van=/\bvan\b/i.test(full);

    // CAMINHÃO: detecta "Caminhão" ou "Caminhao" no texto
    var caminhao=/caminh[aã]o/i.test(full);

    return {nome,selo,comunidade,contato,data,horario,origem,destino,van,caminhao};
  }

    async function saveCustoDia(data, ajudantes, custo_almoco, pago_van=false, pago_caminhao=false, pago_ajudante=false, pago_almoco=false){
    const row = { id: parseInt(data.replace(/-/g,'')), data, ajudantes: parseInt(ajudantes)||0, custo_almoco: parseFloat(custo_almoco)||0, pago_van, pago_caminhao, pago_ajudante, pago_almoco };
    setCustosDiarios(prev => {
      const ex = prev.find(x=>x.data===data);
      return ex ? prev.map(x=>x.data===data?row:x) : [...prev,row];
    });
    await dbUpsertCusto(row);
  }

  async function saveMud(list,changed){
    await _ensureAuth();
    var _prevMud=mudancas.slice(); // Backup para rollback
    setMudancas(list); // Optimistic: UI antes da API
    setSyncStatus("🔄 Salvando...");
    try{
      var ts=changed?[changed]:list;
      for(var i=0;i<ts.length;i++){var m=ts[i];var row={id:m.id,nome:m.nome,selo:m.selo||"",comunidade:m.comunidade||"",data:m.data,origem:m.origem||"",destino:m.destino||"",medicao:m.medicao||0,van:m.van||false,contato:m.contato||"",observacao:m.observacao||"",confirmed_promorar:m.confirmed_promorar||false,confirmed_telemim:m.confirmed_telemim||false,adm_approved:m.adm_approved||false,promorar_approved:m.promorar_approved||false,social_approved:m.social_approved||false,status:m.status||"Registrado",signature_data:(m.signature_data!=null&&m.signature_data!="")?m.signature_data:null};row.created_by=m.created_by||(usuario&&(usuario.nome||usuario.email))||null;row.creator_role=m.creator_role||(usuario&&usuario.perfil)||null;await fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:{...getH(),"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(row)});}
      setSyncStatus("✅ Sinc");window.__mudancas=list;
    }catch(e){
      setMudancas(_prevMud); // Rollback optimista
      setSyncStatus("⚠️ Falha ao guardar. A repor...");
      console.error("[saveMud]",e);
    }
  }
  async function handleLogin(){if(!loginForm.email||!loginForm.senha){setLoginErro("Preencha email e senha");return;}setLoginLoad(true);setLoginErro("");try{const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:loginForm.email,password:loginForm.senha})});const d=await res.json();if(!res.ok||!d.access_token){setLoginErro("Email ou senha incorretos");setLoginLoad(false);return;}const pr=await fetch(SUPA_URL+"/rest/v1/usuarios?id=eq."+d.user.id+"&select=*",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+d.access_token}});const pd=await pr.json();if(!pd||!pd[0]||pd[0].ativo===false){setLoginErro("Sem acesso. Contate o administrador.");setLoginLoad(false);return;}const u={id:d.user.id,email:d.user.email,nome:pd[0].nome,perfil:pd[0].perfil,tipo_veiculo:pd[0].tipo_veiculo||null,token:d.access_token,refresh_token:d.refresh_token||null};setUsuario(u);setTab("dashboard");localStorage.setItem('tmim_u',JSON.stringify(u));/* Reload data with fresh JWT */try{var _mr=await dbGet("mudancas","deleted_at=is.null");setMudancas(_mr||[]);var _ar=await dbGet("agenda");if(_ar)setAgenda(_ar.map(function(x){return{...x,_dbId:x.id};}));var _cr=await dbGetCustos();if(_cr)setCustosDiarios(_cr);loadContasSemana();loadPrestadores();}catch(_le){}}catch(e){setLoginErro("Erro.");}setLoginLoad(false);}
  function handleLogout(){setUsuario(null);localStorage.removeItem('tmim_u');setLoginForm({email:"",senha:""});}
  const perfil=usuario?.perfil||"";const isAdmin=perfil==="admin";const isPromorar=perfil==="promorar";const isSocial=perfil==="social";const isMotorista=perfil==="motorista";const isSupervisor=perfil==="supervisor";const temFin=isAdmin;const podeEditar=isAdmin||isPromorar||isSupervisor;const verMed=isAdmin||isPromorar||isSupervisor;
  useEffect(function(){if(isAdmin)loadNotificacoes();},[usuario]);
  // ── PUSH NOTIFICATIONS: prompt after login ────────────────────────────────
  useEffect(function(){
    if(!usuario||!usuario.id)return;
    if(!("PushManager" in window)||!("serviceWorker" in navigator))return;
    var asked=localStorage.getItem("tmim_notif_asked_"+usuario.id);
    if(asked)return;
    if(Notification.permission==="granted"){subscribePush(usuario.id);return;}
    if(Notification.permission==="denied")return;
    setTimeout(function(){setShowNotifBanner(true);},2000);
  },[usuario]);
  function handleNotifAllow(){
    setShowNotifBanner(false);
    localStorage.setItem("tmim_notif_asked_"+usuario.id,"1");
    Notification.requestPermission().then(function(perm){if(perm==="granted")subscribePush(usuario.id);});
  }
  function handleNotifDismiss(){setShowNotifBanner(false);localStorage.setItem("tmim_notif_asked_"+usuario.id,"1");}
  // ── OFFLINE DETECTION ──────────────────────────────────────────────────────
  useEffect(function(){
    function goOff(){setIsOffline(true);}
    function goOn(){setIsOffline(false);}
    window.addEventListener("offline",goOff);
    window.addEventListener("online",goOn);
    return function(){window.removeEventListener("offline",goOff);window.removeEventListener("online",goOn);};
  },[]);
  // Load cached data on mount (for offline startup)
  useEffect(function(){
    (async function(){
      var cMud=await idbGet("mudancas");if(cMud&&mudancas.length===0)setMudancas(cMud);
      var cAg=await idbGet("agenda");if(cAg&&agenda.length===0)setAgenda(cAg);
      var cUsr=await idbGet("listaUsuarios");if(cUsr&&listaUsuarios.length===0)setListaUsuarios(cUsr);
    })();
  },[]);
  // ── PWA Install prompt capture ────────────────────────────────────────────
  useEffect(function(){
    function _onBIP(e){e.preventDefault();setPwaInstallPrompt(e);}
    window.addEventListener("beforeinstallprompt",_onBIP);
    return function(){window.removeEventListener("beforeinstallprompt",_onBIP);};
  },[]);
  // ── GPS Map auto-polling — refresh every 10s while modal is open ──────────
  useEffect(function(){
    if(!showGpsMap||!gpsMapAgenda) return;
    var _cancelled=false;
    function _getMapEl(){return document.getElementById("gps-map-container");}
    function _drawRoute(map,el,pos,eta){
      if(!eta||!eta.route) return;
      try{
        if(map.getSource("route")){
          map.getSource("route").setData({type:"Feature",geometry:eta.route});
        }else{
          map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:eta.route}});
          map.addLayer({id:"route",type:"line",source:"route",layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":"#2563eb","line-width":4}});
        }
        if(!el._destMarker&&eta.destCoords){
          var dEl=document.createElement("div");dEl.innerHTML="📍";dEl.style.fontSize="28px";
          el._destMarker=new window.mapboxgl.Marker({element:dEl}).setLngLat(eta.destCoords).addTo(map);
        }else if(el._destMarker&&eta.destCoords){
          el._destMarker.setLngLat(eta.destCoords);
        }
        var bounds=new window.mapboxgl.LngLatBounds();
        bounds.extend([pos.lng,pos.lat]);
        if(eta.destCoords) bounds.extend(eta.destCoords);
        map.fitBounds(bounds,{padding:60,duration:1000});
      }catch(e){console.warn("[GPS map] route error:",e);}
    }
    function _updateMap(pos,eta){
      var el=_getMapEl();
      if(!el||!el._map){setTimeout(function(){if(!_cancelled)_updateMap(pos,eta);},1000);return;}
      var map=el._map;
      if(el._marker){el._marker.setLngLat([pos.lng,pos.lat]);}
      if(!eta||!eta.route){map.easeTo({center:[pos.lng,pos.lat],duration:800});return;}
      if(map.isStyleLoaded()){_drawRoute(map,el,pos,eta);}
      else{map.on("load",function(){_drawRoute(map,el,pos,eta);});}
    }
    function _poll(){
      if(_cancelled) return;
      gpsLoadPositions(gpsMapAgenda.id,gpsMapAgenda._trackMotoristaId||null).then(function(pos){
        if(_cancelled||!pos) return;
        setGpsPositions([pos]);
        if(gpsMapAgenda.destino){
          gpsCalcEta(pos.lat,pos.lng,gpsMapAgenda.destino).then(function(eta){
            if(_cancelled) return;
            if(eta){setGpsEta(eta);_updateMap(pos,eta);}
            else{_updateMap(pos,null);}
          });
        }else{_updateMap(pos,null);}
      });
    }
    // Initial poll after a small delay to let map render
    setTimeout(_poll,800);
    var _tid=setInterval(_poll,10000);
    return function(){_cancelled=true;clearInterval(_tid);};
  },[showGpsMap,gpsMapAgenda]);
  function _renderRelatorioMotoristas(_ms,_periodoLabel){
    var _fvR=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
    var _fvN=function(v){return parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
    var _fdR=function(d){if(!d)return "";var p=d.split("-");return p[2]+"/"+p[1];};
    var _mots=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo;});
    var _dados=_mots.map(function(mot){
      var cargo=mot.tipo_veiculo==="VAN"?"van":"caminhao";
      var field=mot.tipo_veiculo==="VAN"?"motorista_van_id":"motorista_caminhao_id";
      var mudMot=_ms.filter(function(m){return m[field]===mot.id;});
      if(mudMot.length===0) return null;
      var diasU=[...new Set(mudMot.map(function(m){return m.data;}))].sort();
      var det=diasU.map(function(data){
        var numMud=mudMot.filter(function(m){return m.data===data;}).length;
        var val=_calcDiario(numMud,0,cargo,RULES);
        return {data:data,numMud:numMud,val:val};
      });
      var totalVal=det.reduce(function(s,d){return s+d.val;},0);
      var totalMud=det.reduce(function(s,d){return s+d.numMud;},0);
      return {mot:mot,cargo:cargo,det:det,totalVal:totalVal,totalMud:totalMud,diasT:det.length};
    }).filter(Boolean);
    if(_dados.length===0) return(<div style={{textAlign:"center",padding:"14px 0",color:"#94a3b8",fontSize:12}}>Nenhum motorista com mudanças no período.</div>);
    return _dados.map(function(d){
      var _ico=d.cargo==="van"?"🚐":"🚚";
      var _lbl=d.cargo==="van"?"Van":"Caminhão";
      var _cor=d.cargo==="van"?"#1e40af":"#7c3aed";
      var _bg=d.cargo==="van"?"#eff6ff":"#f5f3ff";
      function _zapMot(){
        var NL="\n";var txt="";
        d.det.forEach(function(dd){
          var df=_fdR(dd.data);
          if(d.cargo==="van"){txt+="Data "+df+" - Diária - R$ "+_fvN(dd.val)+NL;}
          else{txt+="Data "+df+" - "+dd.numMud+" mudança"+(dd.numMud!==1?"s":"")+" - R$ "+_fvN(dd.val)+NL;}
        });
        var msg="Olá *"+d.mot.nome+"*, segue o fechamento! 🤝"+NL+
          "📅 Período: "+_periodoLabel+NL+NL+
          "📋 *Detalhamento:*"+NL+txt+NL+
          _ico+" Veículo: "+_lbl+(d.mot.placa_veiculo?" · "+d.mot.placa_veiculo:"")+NL+
          "✅ Dias trabalhados: "+d.diasT+" "+(d.diasT===1?"dia":"dias")+NL+
          "📦 Total de mudanças: "+d.totalMud+" "+(d.totalMud===1?"mudança":"mudanças")+NL+
          "💰 *Valor a receber: R$ "+_fvN(d.totalVal)+"*"+NL+NL+
          "(TELEMIM)";
        window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
      }
      return(
        <div key={d.mot.id} style={{background:_bg,borderRadius:10,border:"1px solid #f1f5f9",padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:22,flexShrink:0}}>{_ico}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13,color:_cor}}>{d.mot.nome}</div>
            <div style={{fontSize:10,color:"#64748b",marginTop:1}}>{_lbl}{d.mot.placa_veiculo?" · "+d.mot.placa_veiculo:""}</div>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{d.diasT} {d.diasT===1?"dia":"dias"} | {d.totalMud} {d.totalMud===1?"mudança":"mudanças"}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <div style={{fontWeight:800,fontSize:14,color:_cor}}>{_fvR(d.totalVal)}</div>
            <button onClick={_zapMot} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:14,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📲 Zap</button>
          </div>
        </div>
      );
    });
  }
  async function carregarUsuarios(){if((!isAdmin&&!isPromorar&&!isSocial&&!isSupervisor)||!usuario?.token)return;try{if(isAdmin||isSupervisor){const _tk3=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);const r=await fetch(SUPA_URL+"/functions/v1/listar-usuarios",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk3||"")}});const d=await r.json();if(d.ok&&Array.isArray(d.usuarios)){setListaUsuarios(d.usuarios);idbSet("listaUsuarios",d.usuarios);}}else{var _tk4=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);var r2=await fetch(SUPA_URL+"/rest/v1/usuarios?perfil=eq.motorista&ativo=eq.true&select=id,nome,perfil,tipo_veiculo,placa_veiculo,ativo",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk4||SUPA_KEY)}});if(r2.ok){var d2=await r2.json();if(Array.isArray(d2)){setListaUsuarios(d2);idbSet("listaUsuarios",d2);}}}}catch(e){var cached=await idbGet("listaUsuarios");if(cached)setListaUsuarios(cached);}}
  async function editarUsuario(){if(!editUser?.id)return;if(editUser.perfil==="motorista"&&!editUser.tipo_veiculo){setEditMsg("⚠️ Selecione o tipo de veículo");return;}setSavingEdit(true);setEditMsg("");try{const bd={id:editUser.id,nome:editUser.nome,email:editUser.email,perfil:editUser.perfil,contato:editUser.contato||null};if(editUser.senha)bd.senha=editUser.senha;if(editUser.perfil==="motorista"){bd.tipo_veiculo=editUser.tipo_veiculo;bd.placa_veiculo=editUser.placa_veiculo?editUser.placa_veiculo.toUpperCase().trim():null;}else{bd.tipo_veiculo=null;bd.placa_veiculo=null;}const _tk=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);const res=await fetch(SUPA_URL+"/functions/v1/editar-usuario",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk||""),"Content-Type":"application/json"},body:JSON.stringify(bd)});const d=await res.json();if(!res.ok){setEditMsg("⚠️ "+(d.error||"Erro"));setSavingEdit(false);return;}setEditMsg("✅ Salvo!");await carregarUsuarios();setTimeout(()=>{setEditUser(null);setEditMsg("");},1500);}catch(e){setEditMsg("⚠️ Erro de conexão.");}setSavingEdit(false);}
  const [prestadores,setPrestadores]=useState([]);
  async function loadPrestadores(){
    try{
      var res=await fetch(SUPA_URL+"/rest/v1/prestadores?select=*&ativo=eq.true&order=cargo,nome",{headers:getH()});
      var data=await res.json();
      if(Array.isArray(data)&&data.length>0) setPrestadores(data);
    }catch(e){}
  }

  // ── BANCO DE AJUDANTES ──
  const [ajudantesList,setAjudantesList]=useState([]);
  const [showAddAjudante,setShowAddAjudante]=useState(false);
  const [novoAjudante,setNovoAjudante]=useState({nome:"",telefone:""});
  const [subEquipe,setSubEquipe]=useState("cadastro");
  const [equipeDiaList,setEquipeDiaList]=useState([]);
  const [equipeDiaSel,setEquipeDiaSel]=useState(()=>{var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");});
  const [equipeDiaCheck,setEquipeDiaCheck]=useState([]);
  const [equipeFinMes,setEquipeFinMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [editAjudante,setEditAjudante]=useState(null);
  const [adminRelSup,setAdminRelSup]=useState("");
  const [adminRelMes,setAdminRelMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [pagamentos,setPagamentos]=useState([]);
  const [pagMes,setPagMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [pagSup,setPagSup]=useState("");
  const [pagCam,setPagCam]=useState("");
  const [pagVan,setPagVan]=useState("");
  const [pagFiltro,setPagFiltro]=useState("todos");

  async function loadPagamentos(){
    try{var r=await fetch(SUPA_URL+"/rest/v1/pagamentos?select=*&order=criado_em.desc",{headers:getH()});var d=await r.json();if(Array.isArray(d))setPagamentos(d);}catch(e){}
  }
  async function salvarPagamento(pag){
    try{
      var _hd=Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=representation"});
      var r=await fetch(SUPA_URL+"/rest/v1/pagamentos",{method:"POST",headers:_hd,body:JSON.stringify([pag])});
      var d=await r.json();
      if(Array.isArray(d)&&d[0]){
        setPagamentos(function(prev){var exists=prev.find(function(p){return p.id===d[0].id;});return exists?prev.map(function(p){return p.id===d[0].id?d[0]:p;}):[d[0]].concat(prev);});
      }
    }catch(e){}
  }

  async function loadAjudantes(){
    try{var r=await fetch(SUPA_URL+"/rest/v1/ajudantes?select=*&ativo=eq.true&order=nome",{headers:getH()});var d=await r.json();if(Array.isArray(d))setAjudantesList(d);}catch(e){}
  }
  async function criarAjudante(){
    if(!novoAjudante.nome.trim())return;
    try{var _body={nome:novoAjudante.nome.trim()};if(novoAjudante.telefone.trim())_body.telefone=novoAjudante.telefone.trim();var r=await fetch(SUPA_URL+"/rest/v1/ajudantes",{method:"POST",headers:Object.assign({},getH(),{"Prefer":"return=representation"}),body:JSON.stringify(_body)});if(r.ok){await loadAjudantes();setNovoAjudante({nome:"",telefone:""});setShowAddAjudante(false);}}catch(e){}
  }
  async function editarAjudanteFn(){
    if(!editAjudante)return;
    try{var _body={nome:editAjudante.nome.trim()};if(editAjudante.telefone)_body.telefone=editAjudante.telefone.trim();await fetch(SUPA_URL+"/rest/v1/ajudantes?id=eq."+editAjudante.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_body)});await loadAjudantes();setEditAjudante(null);setSyncStatus("✅ Ajudante atualizado!");}catch(e){setSyncStatus("⚠️ Erro ao editar");}
  }
  async function desativarAjudante(ajId){
    try{await fetch(SUPA_URL+"/rest/v1/ajudantes?id=eq."+ajId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({ativo:false})});await loadAjudantes();setSyncStatus("✅ Ajudante removido!");}catch(e){setSyncStatus("⚠️ Erro ao remover");}
  }
  async function loadEquipeDia(){
    try{var r=await fetch(SUPA_URL+"/rest/v1/equipe_dia?select=*&order=data.desc",{headers:getH()});var d=await r.json();if(Array.isArray(d))setEquipeDiaList(d);}catch(e){}
  }
  async function salvarEquipeDia(data,ajudantesArr){
    var existing=equipeDiaList.find(function(e){return e.data===data;});
    var _hd=Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"});
    try{
      var r;
      if(existing){r=await fetch(SUPA_URL+"/rest/v1/equipe_dia?data=eq."+data,{method:"PATCH",headers:_hd,body:JSON.stringify({ajudantes:ajudantesArr})});}
      else{r=await fetch(SUPA_URL+"/rest/v1/equipe_dia",{method:"POST",headers:_hd,body:JSON.stringify({data:data,ajudantes:ajudantesArr})});}
      if(r.ok){var d=await r.json();if(Array.isArray(d)&&d[0]){setEquipeDiaList(function(prev){var nxt=prev.filter(function(e){return e.data!==data;});nxt.push(d[0]);return nxt;});}setSyncStatus("✅ Equipe do dia salva!");}
    }catch(e){setSyncStatus("⚠️ Erro ao salvar equipe do dia");}
  }

    async function criarUsuario(){
    if(!novoUser.nome||!novoUser.email||!novoUser.senha){setUserMsg("⚠️ Preencha todos os campos");return;}
    if(novoUser.perfil==="motorista"&&!novoUser.tipo_veiculo){setUserMsg("⚠️ Selecione o tipo de veículo para motoristas");return;}
    setSavingUser(true);setUserMsg("");
    try{
      var _body={nome:novoUser.nome,email:novoUser.email,senha:novoUser.senha,perfil:novoUser.perfil};
      if(novoUser.contato)_body.contato=novoUser.contato.trim();
      if(novoUser.perfil==="motorista"){_body.tipo_veiculo=novoUser.tipo_veiculo;if(novoUser.placa_veiculo)_body.placa_veiculo=novoUser.placa_veiculo.toUpperCase().trim();}
      const res=await fetch(SUPA_URL+"/functions/v1/criar-usuario",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(usuario?.token||''),"Content-Type":"application/json"},body:JSON.stringify(_body)});
      const d=await res.json();
      if(!res.ok){setUserMsg("⚠️ "+(d.error||"Erro ao criar"));setSavingUser(false);return;}
      setUserMsg("✅ Usuário criado!");setNovoUser({nome:"",email:"",senha:"",perfil:"promorar",tipo_veiculo:"",placa_veiculo:"",contato:""});carregarUsuarios();
    }catch(e){setUserMsg("⚠️ Erro de conexão.");}
    setSavingUser(false);
  }
  async function gerarMagicLink(dataAlvo){
    if(!usuario||!isMotorista) return;
    setMagicLoading(true);
    try{
      var dt=dataAlvo||new Date().toISOString().slice(0,10);
      var res=await fetch(SUPA_URL+"/functions/v1/gerar-magic-link",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({motorista_id:usuario.id,motorista_nome:usuario.nome||"",data_servico:dt})});
      var d=await res.json();
      if(d.ok&&d.token){setMagicToken(d.token);setMagicData(dt);}else{alert("Erro: "+(d.error||"falha"));}
    }catch(e){alert("Erro de conexão");}
    setMagicLoading(false);
  }
  function abrirWha(ag){const tel=(ag.contato||"").replace(/\D/g,"");if(!tel)return;window.open("https://wa.me/55"+tel+"?text="+encodeURIComponent("Olá "+ag.nome+"! Mudança dia "+(ag.data||"")+" às "+(ag.horario||"?")+"\nDe: "+(ag.origem||"?")+"\nPara: "+(ag.destino||"?")+"\n🚛 PROMORAR"),"_blank");}
  async function registrarPush(){try{if(!('serviceWorker' in navigator)||!('PushManager' in window)){alert('Push nao suportado');return;}const perm=await Notification.requestPermission();if(perm!=='granted'){alert('Permissao negada');return;}const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZEuEguqec8LTygq7UQTqp8-XWo4'});const jj=sub.toJSON();await fetch(SUPA_URL+'/rest/v1/push_subscriptions',{method:'POST',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(usuario?.token||''),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({usuario_id:usuario?.id,endpoint:jj.endpoint,p256dh:jj.keys?.p256dh||'',auth:jj.keys?.auth||''})});alert('\u2705 Ativado!');}catch(pushErr){alert('Erro: '+pushErr.message);}}
  async function enviarPush(titulo,corpo){try{await fetch(SUPA_URL+'/functions/v1/enviar-push',{method:'POST',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(usuario?.token||''),'Content-Type':'application/json'},body:JSON.stringify({titulo,corpo})});}catch{}}
  async function ativarBiometria(){try{if(!window.PublicKeyCredential){alert('Biometria nao suportada');return;}const uid=new TextEncoder().encode(usuario?.id||'tmim');const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'TELEMIM',id:location.hostname},user:{id:uid,name:usuario?.email||'u',displayName:usuario?.nome||'U'},pubKeyCredParams:[{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000}});localStorage.setItem('tmim_bio_id',cred.id);localStorage.setItem('tmim_bio_enabled','true');alert('\u2705 Biometria ativada!');}catch(e){if(e.name==='NotAllowedError')alert('Cancelado.');else alert('Erro: '+e.message);}}
  async function verificarBiometria(){try{const id=localStorage.getItem('tmim_bio_id');if(!id)return false;const b=Uint8Array.from(atob(id.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,allowCredentials:[{id:b,type:'public-key'}],userVerification:'required',timeout:60000}});return true;}catch{return false;}}
  function desativarBiometria(){localStorage.removeItem('tmim_bio_id');localStorage.removeItem('tmim_bio_enabled');alert('Biometria desativada.');}
  async function toggleAtivoUser(u){await fetch(SUPA_URL+"/rest/v1/usuarios?id=eq."+u.id,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({ativo:!u.ativo})});carregarUsuarios();}
    async function marcarTempo(tipo,item,tabela){
    if(!podeEditar)return;
    const campo=tipo==='inicio'?'inicio_em':'termino_em';
    const agora=new Date().toISOString();
    await fetch(SUPA_URL+"/rest/v1/"+tabela+"?id=eq."+item.id,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({[campo]:agora})});
    if(tabela==="agenda"){
      setAgenda(prev=>prev.map(a=>a.id===item.id?{...a,[campo]:agora}:a));
    }else{
      setMudancas(prev=>prev.map(m=>m.id===item.id?{...m,[campo]:agora}:m));
    }
  }
  function fmtTempo(iso){if(!iso)return null;const d=new Date(iso);return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
    function addLog(msg){var ts=new Date();var hora=String(ts.getHours()).padStart(2,"0")+":"+String(ts.getMinutes()).padStart(2,"0");setActivityLogs(function(prev){return [{id:ts.getTime(),hora:hora,msg:msg},...prev].slice(0,10);});setToast({id:ts.getTime(),msg:msg});setTimeout(function(){setToast(null);},4000);}
  function loadNotificacoes(){fetch(SUPA_URL+"/rest/v1/notificacoes?select=*&order=criado_em.desc&limit=50",{headers:getH()}).then(function(r){return r.json();}).then(function(d){if(Array.isArray(d))setNotificacoes(d);}).catch(function(){});}
  function _addNotif(tipo,descricao,mudanca_nome){var nome=(usuario&&(usuario.nome||usuario.email))||"Sistema";fetch(SUPA_URL+"/rest/v1/notificacoes",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({tipo:tipo,descricao:descricao,usuario_nome:nome,mudanca_nome:mudanca_nome||""})}).then(function(){loadNotificacoes();}).catch(function(){});}
  async function handleValidar3vias(id,tipo){
    var campo=tipo==="social"?"social_approved":tipo==="promorar"?"promorar_approved":"adm_approved";
    var campoPor=tipo+"_approved_by";
    var nome=usuario&&(usuario.nome||usuario.email)||"";
    var anterior=mudancas.find(function(m){return m.id===id;});
    setMudancas(prev=>prev.map(m=>m.id===id?{...m,[campo]:true,[campoPor]:nome}:m));
    window.__mudancas=(window.__mudancas||[]).map(m=>m.id===id?{...m,[campo]:true,[campoPor]:nome}:m);
    try{
      await fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+id,{method:"PATCH",headers:{...getH(),"Prefer":"return=representation"},body:JSON.stringify({[campo]:true,[campoPor]:nome})});
    }catch(e){
      if(anterior)setMudancas(prev=>prev.map(m=>m.id===id?{...anterior}:m));
      setSyncStatus("⚠️ Erro ao validar");
    }
  }
  async function saveAg(list,changed){
    await _ensureAuth();
    setAgenda(list);
    setSyncStatus("⏳ Salvando...");
    try{
      var ts=changed?[changed]:list;
      for(var i=0;i<ts.length;i++){
        var a=ts[i];
        var row={nome:a.nome,selo:a.selo||"",comunidade:a.comunidade||"",data:a.data,horario:a.horario||"",origem:a.origem||"",destino:a.destino||"",contato:a.contato||"",van:a.van||false,caminhao:a.caminhao||false,medicao:a.medicao||0,ajudantes:a.ajudantes||0,status:a.status||"confirmado",observacao:a.observacao||"",social_approved:a.social_approved||false,promorar_approved:a.promorar_approved||false,adm_approved:a.adm_approved||false,requires_validation:a.requires_validation||false};
        if(!a.created_by){row.created_by=(usuario&&(usuario.nome||usuario.email))||null;row.creator_role=(usuario&&usuario.perfil)||null;}
        if(a.motorista_van_id!==undefined)row.motorista_van_id=a.motorista_van_id||null;
        if(a.motorista_caminhao_id!==undefined)row.motorista_caminhao_id=a.motorista_caminhao_id||null;
        var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{
          method:"PATCH",
          headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
          body:JSON.stringify(row)
        });
        if(!r.ok){
          if(r.status===503){
            await new Promise(function(res){setTimeout(res,1000);});
            var rR=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(row)});
            if(!rR.ok) throw new Error("saveAg retry HTTP "+rR.status);
          } else throw new Error("saveAg PATCH HTTP "+r.status);
        }
      }
      setSyncStatus("✅ Sinc");
    }catch(e){setSyncStatus("⚠️ Erro ao guardar");console.error("[saveAg]",e);loadAg();}
  }

  async function handleAddMud(){
    if(!form.nome||!form.selo) return;
    // === TRAVA ANTI-DUPLICIDADE: nome OU selo na mesma data ===
    var _nomeF=(form.nome||"").toLowerCase().trim();
    var _seloF=(form.selo||"").toLowerCase().trim();
    var _dataF=form.data;
    var _isDupMud=mudancas.some(function(m){
      if(m.data!==_dataF)return false;
      var _n=(m.nome||"").toLowerCase().trim();
      var _s=(m.selo||"").toLowerCase().trim();
      return (_nomeF&&_n===_nomeF)||(_seloF&&_s===_seloF);
    });
    var _isDupAg=agenda.some(function(a){
      if(a.data!==_dataF)return false;
      var _n=(a.nome||"").toLowerCase().trim();
      var _s=(a.selo||"").toLowerCase().trim();
      return (_nomeF&&_n===_nomeF)||(_seloF&&_s===_seloF);
    });
    if(_isDupMud||_isDupAg){
      setFlash("🚨 Bloqueado: Já existe uma mudança para este Cliente ou Selo nesta data. Verifique a Agenda ou os Registros.");
      return;
    }
    var _p=usuario&&usuario.perfil||"";var _isSocial=_p==="social";var _isPromorar=_p==="promorar";var _isAdm=_p==="admin"||_p==="telemim";var _nomeUser=usuario&&(usuario.nome||usuario.email)||"";const nova={...form,id:Date.now(),medicao:parseFloat(form.medicao)||0,requires_validation:true,social_approved:_isSocial,social_approved_by:_isSocial?_nomeUser:null,promorar_approved:_isPromorar,promorar_approved_by:_isPromorar?_nomeUser:null,adm_approved:_isAdm,adm_approved_by:_isAdm?_nomeUser:null,created_by:_nomeUser,creator_role:_p};
    setMudancas(prev=>[nova,...prev]);
    await saveMud([nova,...mudancas],nova);
    setForm(initForm); setFlash("✅ Salvo!"); setTimeout(()=>setFlash(""),1800); setTab("lista");
  }
  async function handleDelMud(id){
    if(!usuario||usuario.perfil!=="admin"){setSyncStatus("⛔ Apenas o administrador pode excluir mudânças.");return;}
    var nome=usuario&&usuario.nome?usuario.nome:"Admin";
    var prevMud=mudancas.slice();
    setMudancas(function(m){return m.filter(function(x){return x.id!==id;});});
    setSyncStatus("⌛ Apagando...");
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+id,
        {method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
        body:JSON.stringify({deleted_at:new Date().toISOString(),deleted_by:nome})});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("🗑️ OS apagada (mantida para auditoria).");
    }catch(e){
      setMudancas(prevMud);
      setSyncStatus("⚠️ Erro ao apagar: "+e.message);
    }
  }
  async function handleSaveEditMud(){
    if(!editMud) return;
    var _isFromAgenda=editMud._fromAgenda;
    var _anterior=_isFromAgenda?(agenda||[]).find(function(a){return a.id===editMud.id;}):mudancas.find(function(m){return m.id===editMud.id;});
    if(_isFromAgenda){
      // Save to agenda table directly
      var _body={medicao:parseFloat(editMud.medicao)||0,nome:editMud.nome||"",selo:editMud.selo||"",comunidade:editMud.comunidade||"",origem:editMud.origem||"",destino:editMud.destino||"",van:editMud.van||false,caminhao:editMud.caminhao||false,ajudantes:parseInt(editMud.ajudantes)||0,observacao:editMud.observacao||""};
      setAgenda(function(prev){return prev.map(function(a){return a.id===editMud.id?Object.assign({},a,_body):a;});});
      setSyncStatus("🔄 Salvando...");
      try{
        await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+editMud.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_body)});
        // Sync to mudancas table for Contas/Financeiro
        var _mudKey=(editMud.nome||"").toLowerCase().trim();
        var _mudData=editMud.data;
        var _existeMud=mudancas.find(function(m){return(m.nome||"").toLowerCase().trim()===_mudKey&&m.data===_mudData;});
        var _mudSync={nome:editMud.nome||"",selo:editMud.selo||"",comunidade:editMud.comunidade||"",data:editMud.data,origem:editMud.origem||"",destino:editMud.destino||"",contato:editMud.contato||null,van:editMud.van||false,caminhao:editMud.caminhao||false,medicao:parseFloat(editMud.medicao)||0,ajudantes:parseInt(editMud.ajudantes)||0,observacao:editMud.observacao||"",status:editMud.status||"Concluído",motorista_van_id:editMud.motorista_van_id||null,motorista_caminhao_id:editMud.motorista_caminhao_id||null,supervisor_id:editMud.supervisor_id||null};
        if(_existeMud){
          // PATCH existing mudancas record
          var _patchFields={medicao:parseFloat(editMud.medicao)||0,nome:editMud.nome||"",selo:editMud.selo||"",comunidade:editMud.comunidade||"",origem:editMud.origem||"",destino:editMud.destino||"",van:editMud.van||false,caminhao:editMud.caminhao||false,ajudantes:parseInt(editMud.ajudantes)||0,observacao:editMud.observacao||"",motorista_van_id:editMud.motorista_van_id||null,motorista_caminhao_id:editMud.motorista_caminhao_id||null,supervisor_id:editMud.supervisor_id||null};
          setMudancas(function(prev){return prev.map(function(m){return m.id===_existeMud.id?Object.assign({},m,_patchFields):m;});});
          fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+_existeMud.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_patchFields)}).catch(function(){});
        }else{
          // CREATE new mudancas record
          fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),body:JSON.stringify(_mudSync)}).then(function(r){return r.json();}).then(function(d){if(Array.isArray(d)&&d[0]){setMudancas(function(prev){return[d[0]].concat(prev);});}}).catch(function(){});
        }
        setSyncStatus("✅ Sinc");
      }catch(e){setSyncStatus("⚠️ Erro ao salvar");}
    }else{
      const updated=mudancas.map(m=>m.id===editMud.id?{...editMud,medicao:parseFloat(editMud.medicao)||0}:m);
      setMudancas(()=>updated);
      await saveMud(updated,editMud);
    }
    try{if(_anterior){var _nMed=parseFloat(editMud.medicao)||0;var _oMed=parseFloat(_anterior.medicao)||0;if(_nMed!==_oMed){_addNotif("cubagem",(_oMed===0?"Cubagem inserida: ":"Cubagem alterada: ")+_oMed+" > "+_nMed+" m3",editMud.nome);}var _c=[];if((editMud.nome||"")!==(_anterior.nome||""))_c.push("nome");if((editMud.destino||"")!==(_anterior.destino||""))_c.push("destino");if((editMud.origem||"")!==(_anterior.origem||""))_c.push("origem");if((editMud.data||"")!==(_anterior.data||""))_c.push("data");if((editMud.selo||"")!==(_anterior.selo||""))_c.push("selo");if((editMud.comunidade||"")!==(_anterior.comunidade||""))_c.push("comunidade");if((editMud.observacao||"")!==(_anterior.observacao||""))_c.push("obs");if(Boolean(editMud.van)!==Boolean(_anterior.van))_c.push("van");if(_c.length>0)_addNotif("edicao",_c.join(", ")+" alterado(s)",editMud.nome);}}catch(e){}
    // RBAC: campo _qtdAj apenas Admin; nao-admin preserva valor anterior no BD
    if(isAdmin&&editMud._qtdAj!==undefined&&editMud._qtdAj!==""){
      var _aj=parseInt(editMud._qtdAj)||1;
      var _data=editMud.data;
      // Derived State: actualizar custosDiarios para totais recalcularem
      setCustosDiarios(function(prev){
        var existe=prev.some(function(cd){return cd.data===_data;});
        if(existe) return prev.map(function(cd){return cd.data===_data?{...cd,ajudantes:_aj}:cd;});
        return [...prev,{data:_data,ajudantes:_aj,custo_almoco:0}];
      });
      // Persistir no Supabase (PATCH se existe, POST se nao existe)
      var _hd={...getH(),"Content-Type":"application/json","Prefer":"return=minimal"};
      fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+_data+"&select=id",{headers:getH()})
        .then(function(r){return r.json();})
        .then(function(rows){
          if(rows&&rows.length>0){
            return fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+_data,{method:"PATCH",headers:_hd,body:JSON.stringify({ajudantes:_aj})});
          }
          return fetch(SUPA_URL+"/rest/v1/custos_diarios",{method:"POST",headers:_hd,body:JSON.stringify({data:_data,ajudantes:_aj})});
        }).catch(function(err){console.warn("save qtdAj err:",err);});
    }
    setEditMud(null);
  }

  // ── AGENDA CRUD ────────────────────────────────────────────────────────────
  async function handleValidarAg(id,tipo){
    await _ensureAuth();
    var campo=tipo==="social"?"social_approved":tipo==="promorar"?"promorar_approved":"adm_approved";
    var campoPor=tipo+"_approved_by";
    var nome=usuario&&(usuario.nome||usuario.email)||"";
    var anterior=agenda.find(function(a){return a.id===id;});
    setAgenda(prev=>prev.map(a=>a.id===id?{...a,[campo]:true,[campoPor]:nome}:a));
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+id,{method:"PATCH",headers:{...getH(),"Prefer":"return=representation"},body:JSON.stringify({[campo]:true,[campoPor]:nome})});
    }catch(e){
      if(anterior)setAgenda(prev=>prev.map(a=>a.id===id?{...anterior}:a));
      setSyncStatus("⚠️ Erro ao validar");
    }
  }
  async function handleAddAg(){
    if(!agForm.nome||!agForm.data) return;
    // === TRAVA ANTI-DUPLICIDADE: nome OU selo na mesma data ===
    var _nomeAF=(agForm.nome||"").toLowerCase().trim();
    var _seloAF=(agForm.selo||"").toLowerCase().trim();
    var _dataAF=agForm.data;
    var _isDupAgMud=mudancas.some(function(m){
      if(m.data!==_dataAF)return false;
      var _n=(m.nome||"").toLowerCase().trim();
      var _s=(m.selo||"").toLowerCase().trim();
      return (_nomeAF&&_n===_nomeAF)||(_seloAF&&_s===_seloAF);
    });
    var _isDupAgAg=agenda.some(function(a){
      if(a.data!==_dataAF)return false;
      var _n=(a.nome||"").toLowerCase().trim();
      var _s=(a.selo||"").toLowerCase().trim();
      return (_nomeAF&&_n===_nomeAF)||(_seloAF&&_s===_seloAF);
    });
    if(_isDupAgMud||_isDupAgAg){
      setFlash("🚨 Bloqueado: Já existe um agendamento para este Cliente ou Selo nesta data. Verifique a Agenda ou os Registros.");
      return;
    }
    var _pa=usuario&&usuario.perfil||"";var _na=usuario&&(usuario.nome||usuario.email)||"";const nova={...agForm,id:Date.now(),requires_validation:true,social_approved:_pa==="social",social_approved_by:_pa==="social"?_na:null,promorar_approved:_pa==="promorar",promorar_approved_by:_pa==="promorar"?_na:null,adm_approved:_pa==="admin"||_pa==="telemim",adm_approved_by:(_pa==="admin"||_pa==="telemim")?_na:null};
    // POST directo para nova agenda
    (async function(){
      try{
        await _ensureAuth();
        var _nomeLog=usuario&&(usuario.nome||usuario.email)||"";var _perfilLog=usuario&&usuario.perfil||"";
        var rowNova={nome:nova.nome,selo:nova.selo||"",comunidade:nova.comunidade||"",data:nova.data,horario:nova.horario||"",origem:nova.origem||"",destino:nova.destino||"",contato:nova.contato||"",van:nova.van||false,caminhao:nova.caminhao||false,medicao:nova.medicao||0,ajudantes:nova.ajudantes||0,status:nova.status||"confirmado",observacao:nova.observacao||"",social_approved:nova.social_approved||false,promorar_approved:nova.promorar_approved||false,adm_approved:nova.adm_approved||false,requires_validation:nova.requires_validation||false,created_by:_nomeLog,creator_role:_perfilLog};
        setSyncStatus("⏳ Salvando...");
        var rNova=await fetch(SUPA_URL+"/rest/v1/agenda",{
          method:"POST",
          headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),
          body:JSON.stringify(rowNova)
        });
        if(!rNova.ok) throw new Error("POST nova agenda HTTP "+rNova.status);
        var rData=await rNova.json();
        var _bdId=rData&&rData[0]&&rData[0].id;
        setAgenda(function(prev){
          var sem=prev.filter(function(x){return x.id!==nova.id;});
          return [{...nova,id:_bdId||nova.id},...sem];
        });
        setSyncStatus("✅ Sinc");
        // Não chamar loadAg() aqui - evita race condition que apaga a nova agenda
      }catch(eN){setSyncStatus("⚠️ Erro ao agendar");console.error("[novaAgenda]",eN);}
    })();
    
    // Notificação por e-mail (admin + promorar)
    (function(){
      var _supaBase=SUPA_URL.split('/rest/v1')[0];
      fetch(_supaBase+'/functions/v1/enviar-email-agendamento',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY},
        body:JSON.stringify({agenda:nova,agendadoPor:{nome:usuario&&usuario.nome,email:usuario&&usuario.email,perfil:usuario&&usuario.perfil}})
      }).catch(function(e){console.warn('[email agendamento]',e);});
    })();
    setAgForm({...initForm,status:"confirmado"}); setFlash("✅ Agendado!"); setTimeout(()=>setFlash(""),1800); setTab("agenda");
  }
  async function handleDelAg(id){
    if(!usuario||usuario.perfil!=="admin"){setSyncStatus("⛔ Apenas o administrador pode excluir agendas.");return;}
    var nome=usuario&&usuario.nome?usuario.nome:"Admin";
    var prevAg=agenda.slice();
    setAgenda(function(a){return a.filter(function(x){return x.id!==id;});});
    setSyncStatus("⌛ Apagando...");
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+id,
        {method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
        body:JSON.stringify({deleted_at:new Date().toISOString(),deleted_by:nome})});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("🗑️ Agenda apagada (mantida para auditoria).");
    }catch(e){
      setAgenda(prevAg);
      setSyncStatus("⚠️ Erro ao apagar: "+e.message);
    }
  }
  async function handleSaveEditAg(){
    if(!editAg) return;
    // Ler valores DOM actuais (captura alterações via picker nativo)
    var _domInputs=document.querySelectorAll('input[type="date"],input[type="time"],input[type="text"],input[type="tel"]');
    var _domData={};
    _domInputs.forEach(function(inp){
      if(inp.name) _domData[inp.name]=inp.value;
      // Identificar campos pelo placeholder ou pelo valor relativo ao editAg
      if(inp.type==="date"&&inp.value) _domData._date=inp.value;
      if(inp.type==="time"&&inp.value) _domData._time=inp.value;
    });
    // Merge: preferir valor DOM se disponível para data e hora
    var _editMerged={...editAg};
    if(_domData._date) _editMerged.data=_domData._date;
    if(_domData._time) _editMerged.horario=_domData._time;
    const updated=agenda.map(a=>a.id===_editMerged.id?{..._editMerged}:a);
    await saveAg(updated,_editMerged); setEditAg(null);
  }
  async function pagarConta(cid){
    if(!window.confirm('Marcar como paga?'))return;
    const agora=new Date().toISOString();
    await dbPagarConta(cid,agora);
    const paga=contasPagar.find(x=>x.id===cid);
    setContasPagar(prev=>prev.filter(x=>x.id!==cid));
    if(paga)setContasHist(prev=>[{...paga,status:'pago',pago_em:agora},...prev.slice(0,29)]);
    setFlash('✅ Conta paga!');
    loadContasSemana();
  }
  async function criarConta(evt){
    evt.preventDefault();
    if(!novaContaForm.descricao||!novaContaForm.valor){alert('Preencha descrição e valor');return;}
    const rowData={...novaContaForm,valor:parseFloat(novaContaForm.valor)||0,criado_por:usuario.email};
    const nd=await dbInsertConta(rowData);
    if(!nd){alert('Erro ao salvar');return;}
    setContasPagar(prev=>[nd,...prev]);
    setNovaContaForm({tipo:'van',descricao:'',valor:'',beneficiario:'',telefone:'',vencimento:''});
    setShowNovaConta(false);setFlash('✅ Conta adicionada!');
    loadContasSemana();
  }
  async function salvarCanhotoNoDrive(agId,pdfB64,nome){
    try{
      const res=await fetch(SUPA_URL+"/functions/v1/canhoto-drive",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({agenda_id:agId,pdf_base64:pdfB64,nome_arquivo:nome})});
      const d=await res.json();
      if(d.ok){setMsgSucesso("✅ Canhoto salvo no Drive!");setTimeout(()=>setMsgSucesso(""),3000);}
    }catch(e){console.warn("[canhoto-drive]",e);}
  }
  async function confirmarComAssinatura(assinB64){
    const ag=mudancaCanhoto;
    setModalAssinatura(false);setMudancaCanhoto(null);
    if(!ag)return;
    await converterEmMudanca(ag);
    if(!assinB64)return;
    try{
      if(!window.jspdf){
        await new Promise((ok,err)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          s.onload=ok;s.onerror=err;document.head.appendChild(s);
        });
      }
      const{jsPDF}=window.jspdf;
      const doc=new jsPDF({unit:"mm",format:"a4"});
      doc.setFillColor(230,126,34);doc.rect(0,0,210,22,"F");
      doc.setTextColor(255,255,255);doc.setFontSize(14);doc.setFont("helvetica","bold");
      doc.text("TELEMIM - PROMORAR",105,10,{align:"center"});
      doc.text("CANHOTO DE MUDANCA",105,18,{align:"center"});
      doc.setTextColor(0,0,0);doc.setFontSize(11);doc.setFont("helvetica","bold");
      doc.text("DADOS DA MUDANCA",15,32);
      doc.setFont("helvetica","normal");doc.setFontSize(10);
      doc.text("Morador: "+(ag.nome||""),15,42);
      doc.text("Selo: "+(ag.selo||"")+" | Comunidade: "+(ag.comunidade||""),15,49);
      doc.text("Data: "+(ag.data||"")+" | Horario: "+(ag.horario||""),15,56);
      doc.setFont("helvetica","bold");doc.text("ASSINATURA DO MORADOR",15,78);
      try{doc.addImage(assinB64,"PNG",15,82,100,30);}catch(e){}
      doc.line(15,115,140,115);
      doc.setFontSize(9);doc.setTextColor(100,100,100);
      doc.text("Gerado pelo TELEMIM - PROMORAR",105,280,{align:"center"});
      const pdfFinal=doc.output("datauristring").split(",")[1];
      const nm="Canhoto_"+(ag.nome||"morador").replace(/\s+/g,"_")+"_"+(ag.data||"sem-data")+".pdf";
      await salvarCanhotoNoDrive(ag.id,pdfFinal,nm);
    }catch(err){console.warn("[assinatura-pdf]",err);}
  }
  async function converterEmMudanca(ag){
    if(!ag.medicao){alert('Informe a medição (m³) antes de finalizar.');return;}
    setMudancaCanhoto(ag);
    setModalAssinatura(true);
    return;
    const nova={nome:ag.nome,selo:ag.selo||'',comunidade:ag.comunidade||'',data:ag.data,origem:ag.origem||'',destino:ag.destino||'',contato:ag.contato||null,van:ag.van||false,caminhao:ag.caminhao||false,medicao:ag.medicao||0,ajudantes:ag.ajudantes||0,observacao:ag.observacao||'',status:'concluida',registrado_por:usuario.email};
    const{error:errM}=await supabase.from('mudancas').insert([nova]);
    if(!errM)setMudancas(prev=>[nova,...prev]);
    if(!errM)setMudancas(prev=>[nova,...prev]);
    if(errM){alert('Erro: '+errM.message);return;}
    await supabase.from('agenda').update({status:'concluida'}).eq('id',ag.id);
    setMudancas(prev=>[...prev,{...nova,id:Date.now()}]);
    setAgenda(prev=>prev.filter(a=>a.id!==ag.id));
    setFlash('✅ Mudança finalizada!');
  }

  async function confirmarConversao(ag, medicao){
    if(!medicao){ alert("Informe a medição em m³!"); return; }
    const nova = { id: Date.now(), nome:ag.nome, selo:ag.selo||"", comunidade:ag.comunidade||"", data:ag.data, origem:ag.origem||"", destino:ag.destino||"", medicao:parseFloat(medicao)||0, van:ag.van||false };
    await saveMud([...mudancas, nova]);
    const updated = agenda.map(a => a.id===ag.id ? {...a,status:"realizado"} : a);
    await saveAg(updated);
    setConvertModal(null);
    setTab("lista");
    setFlash("✅ Mudança registrada!"); setTimeout(()=>setFlash(""),2000);
    try{_addNotif("concluida","Mudanca concluida",ag.nome);}catch(e){}
  }

  async function toggleStatus(id){
    setAgenda(prev=>{
      const updated=prev.map(a=>a.id===id?{...a,status:a.status==="confirmado"?"pendente":a.status==="pendente"?"realizado":"confirmado"}:a);
      dbUpsert("agenda",updated).catch(()=>{});
      return updated;
    });
  }
  async function toggleAgField(id,field){
    setAgenda(prev=>{
      const updated=prev.map(a=>a.id===id?{...a,[field]:!a[field]}:a);
      dbUpsert("agenda",updated).catch(()=>{});
      return updated;
    });
  }
  async function updateAgField(id,field,value){
    setAgenda(prev=>{
      const updated=prev.map(a=>a.id===id?{...a,[field]:value}:a);
      dbUpsert("agenda",updated).catch(()=>{});
      return updated;
    });
  }

  // ── RELATÓRIO ──────────────────────────────────────────────────────────────
  function gerarRel(){
    const lista=mudancas.filter(m=>{
      if(relDataIni&&m.data<relDataIni) return false;
      if(relDataFim&&m.data>relDataFim) return false;
      return true;
    });
    setRel({...calcRel(lista,relAj,relAlm),lista,ini:relDataIni,fim:relDataFim});
  }

    function _openRelModal(){
    var p=document.getElementById("_rm");if(p)p.parentNode.removeChild(p);
    var ov=document.createElement("div");ov.id="_rm";
    ov.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:9990;display:flex;align-items:center;justify-content:center;padding:16px";
    var box=document.createElement("div");box.style.cssText="background:#fff;border-radius:20px;padding:24px 20px;max-width:360px;width:100%";
    var close=function(){var x=document.getElementById("_rm");if(x)x.parentNode.removeChild(x);};
    ov.onclick=function(e){if(e.target===ov)close();};
    function mk(t,css,txt){var d=document.createElement(t);if(css)d.style.cssText=css;if(txt!==undefined)d.textContent=txt;return d;}
    var iI=mk("input","flex:1;padding:6px 8px;border-radius:8px;border:1.5px solid #e2e8f0;font-size:12px;color:#334155");iI.type="date";iI.value=relDataIni||"";
    var iF=mk("input","flex:1;padding:6px 8px;border-radius:8px;border:1.5px solid #e2e8f0;font-size:12px;color:#334155");iF.type="date";iF.value=relDataFim||"";
    var fmt=["pdf"];
    var bPdf=mk("button","flex:1;padding:14px 8px;border-radius:12px;border:2.5px solid #3b82f6;background:#eff6ff;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer");
    bPdf.appendChild(mk("span","font-size:26px","📄"));bPdf.appendChild(mk("span","font-size:11px;font-weight:800;color:#3b82f6","Documento"));bPdf.appendChild(mk("span","font-size:9px;color:#94a3b8","PDF/Excel"));
    var bWpp=mk("button","flex:1;padding:14px 8px;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer");
    bWpp.appendChild(mk("span","font-size:26px","💬"));bWpp.appendChild(mk("span","font-size:11px;font-weight:800;color:#64748b","WhatsApp"));bWpp.appendChild(mk("span","font-size:9px;color:#94a3b8","Copiar texto"));
    var bAc=mk("button","flex:2;padding:12px 0;border-radius:12px;border:none;background:#3b82f6;color:#fff;font-weight:800;font-size:13px;cursor:pointer","📥 Baixar Arquivo");
    bPdf.onclick=function(){fmt[0]="pdf";bPdf.style.border="2.5px solid #3b82f6";bPdf.style.background="#eff6ff";bPdf.children[1].style.color="#3b82f6";bWpp.style.border="1.5px solid #e2e8f0";bWpp.style.background="#f8fafc";bWpp.children[1].style.color="#64748b";bAc.textContent="📥 Baixar Arquivo";bAc.style.background="#3b82f6";};
    bWpp.onclick=function(){fmt[0]="wpp";bWpp.style.border="2.5px solid #25d366";bWpp.style.background="#f0fdf4";bWpp.children[1].style.color="#25d366";bPdf.style.border="1.5px solid #e2e8f0";bPdf.style.background="#f8fafc";bPdf.children[1].style.color="#64748b";bAc.textContent="💬 Gerar Texto p/Copiar";bAc.style.background="#25d366";};
    bAc.onclick=function(){
      setRelDataIni(iI.value);setRelDataFim(iF.value);
      if(fmt[0]==="wpp"){close();setTimeout(function(){
          var lista=_filterByPeriod(window.__mudancas||[],iI.value,iF.value);
          if(!lista.length){alert("Nenhuma mudança neste período.");return;}
          var fd=function(d){if(!d)return"?";var p=d.split("-");return p[2]+"/"+p[1];};
          var per=(iI.value&&iF.value)?(fd(iI.value)+" a "+fd(iF.value)):iI.value?fd(iI.value):new Date().toLocaleDateString("pt-BR");
          var lin=lista.map(function(m){return"👤 *"+m.nome+"* | 📅 "+fd(m.data)+" | 📍 "+(m.comunidade||m.destino||m.selo||"");});
          var SEP="━━━━━━━━━━━━━━━━━";
          var NL="\n";
          var txt="🚚 *RELATÓRIO TELEMIM*"+NL+"📅 "+per+NL+SEP+NL+lin.join(NL)+NL+SEP+NL+"📊 *Total: "+lin.length+"*"+NL+"_TELEMIM_";
          var cb=function(){setToast({msg:"📋 Copiado! Cole no WhatsApp"});setTimeout(function(){setToast(null);},4000);};
          if(navigator.clipboard){navigator.clipboard.writeText(txt).then(cb).catch(function(){var t=mk("textarea","","");t.value=txt;document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);cb();});}
          else{var t=mk("textarea","","");t.value=txt;document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);cb();}
        },100);}else{gerarPDFRelatorio(_filterByPeriod(window.__mudancas||[],iI.value,iF.value),iI.value,iF.value,bAc);close();}
    };
    var r1=mk("div","display:flex;gap:6px;margin-bottom:10px");
    function bS(txt2,fn2){var b=mk("button","flex:1;padding:7px 2px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;font-size:11px;font-weight:700;cursor:pointer;color:#334155",txt2);b.onclick=fn2;return b;}
    r1.appendChild(bS("Hoje",function(){var d=new Date().toISOString().slice(0,10);iI.value=d;iF.value=d;}));r1.appendChild(bS("Este Mês",function(){var d=new Date();var y=d.getFullYear();var m=String(d.getMonth()+1).padStart(2,"0");iI.value=y+"-"+m+"-01";iF.value=d.toISOString().slice(0,10);}));r1.appendChild(bS("Tudo",function(){iI.value="";iF.value="";}));
    var rD=mk("div","display:flex;gap:6px;align-items:center;margin-bottom:18px");rD.appendChild(iI);rD.appendChild(mk("span","color:#94a3b8;font-size:11px","a"));rD.appendChild(iF);
    var rF=mk("div","display:flex;gap:10px;margin-bottom:20px");rF.appendChild(bPdf);rF.appendChild(bWpp);
    var rA=mk("div","display:flex;gap:8px");var bCn=mk("button","flex:1;padding:12px 0;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#64748b;font-weight:700;font-size:13px;cursor:pointer","Cancelar");bCn.onclick=close;rA.appendChild(bCn);rA.appendChild(bAc);
    box.appendChild(mk("div","font-weight:800;font-size:16px;color:#1e293b;margin-bottom:16px;text-align:center","📊 Gerar Relatório"));
    box.appendChild(mk("div","font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase","Período"));
    box.appendChild(r1);box.appendChild(rD);
    box.appendChild(mk("div","font-size:11px;font-weight:700;color:#64748b;margin-bottom:10px;text-transform:uppercase","Como exportar?"));
    box.appendChild(rF);box.appendChild(rA);ov.appendChild(box);document.body.appendChild(ov);
  }
  // ── HELPER: gerar PDF nativo com jsPDF + autoTable ─────────────
    // ── FUNÇÕES PURAS (testadas unitariamente) ──────────────────────────────────
  function _parseDateISO(iso){
    if(!iso||typeof iso!=='string')return null;
    var p=iso.split('-');if(p.length!==3)return null;
    var y=parseInt(p[0],10),m=parseInt(p[1],10),d=parseInt(p[2],10);
    if(isNaN(y)||isNaN(m)||isNaN(d)||m<1||m>12||d<1||d>31)return null;
    return new Date(y,m-1,d);
  }
  function _filterByPeriod(moves,ini,fim){
    var dIni=ini?_parseDateISO(ini):null;
    var dFim=fim?_parseDateISO(fim):null;
    return moves.filter(function(m){
      var d=_parseDateISO(m.data);
      if(!d)return false;
      if(dIni&&d<dIni)return false;
      if(dFim&&d>dFim)return false;
      return true;
    });
  }
  function _fmtDateISO(iso){
    var d=_parseDateISO(iso);if(!d)return'-';
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  }
  function _fmtTime(ts){
    if(!ts)return'-';
    var d=new Date(ts);if(isNaN(d.getTime()))return'-';
    return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }
  function _vehicleLabel(m){return m.van?'Van':'Caminhão';}
  function _statusLabel(m){
    var p=[];
    if(m.adm_approved)p.push('✅ ADM');
    else if(m.confirmed_telemim)p.push('🟡 TELE');
    else p.push('⏳ Pend.');
    if(m.promorar_approved)p.push('✅ PRO');
    return p.join(' ');
  }
  function _buildTableRows(lista){
    return lista.map(function(m){return[
      _fmtDateISO(m.data),
      _fmtTime(m.inicio_em),
      m.nome||'-',
      m.comunidade||m.origem||'-',
      m.destino||'-',
      m.medicao?(Number(m.medicao).toFixed(1)+' m³'):'-',
      _vehicleLabel(m),
      _statusLabel(m)
    ];});
  }
  function _buildSingleCardRows(m){
    // === MAPEAMENTO ESTRITO — chaves reais do Supabase ===
    // mudancas: data,inicio_em,nome,comunidade,origem,destino,medicao,van,contato,observacao
    // agenda:   data,horario,nome,comunidade,origem,destino,medicao,van,caminhao,ajudantes,contato,observacao
    var hora;
    if(m.horario&&m.horario.trim())hora=m.horario.trim();
    else{var _h=_fmtTime(m.inicio_em);hora=(_h&&_h!=="-")?_h:"Não informada";}
    var medicaoVal=m.medicao;
    var medicaoOk=medicaoVal&&Number(medicaoVal)>0;
    var veiculo;
    if(m.van&&m.caminhao)veiculo="Van + Caminhão";
    else if(m.van)veiculo="Van";
    else if(m.caminhao)veiculo="Caminhão";
    else veiculo="Caminhão";
    var rows=[
      ['Cliente',   m.nome||'Não informado'],
      ['Data',      _fmtDateISO(m.data)||'Não informada'],
      ['Hora',      hora],
      ['Comunidade', m.comunidade||'Não informada'],
      ['Origem/Saída', m.origem||'Não informada'],
      ['Destino',   m.destino||'Não informado'],
      ['Medição (m³)', medicaoOk?(Number(medicaoVal).toFixed(1)+' m³'):'A definir'],
      ['Veículo',   veiculo],
      ['Status',    _statusLabel(m)]
    ];
    if(m.ajudantes&&Number(m.ajudantes)>0)rows.splice(6,0,['Ajudantes',String(m.ajudantes)]);
    if(m.contato&&m.contato.trim())rows.splice(3,0,['Telefone',m.contato.trim()]);
    if(m.observacao&&m.observacao.trim())rows.push(['Observação',m.observacao.trim()]);
    return rows;
  }
  function _pdfFileName(d){
    var dt=d||new Date();
    return 'Telemim_Relatorio_'+String(dt.getDate()).padStart(2,'0')+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+dt.getFullYear()+'.pdf';
  }
  function _singleCardFileName(m){
    var n=(m.nome||'').replace(/\s+/g,'')||'Cliente';
    return 'OS_'+n+'.pdf';
  }

  // ── HELPER: carregar jsPDF + autoTable via CDN ────────────────────────────────
  async function _loadJsPDF(){
    if(!window.jspdf){
      await new Promise(function(res,rej){
        var s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload=res;s.onerror=rej;document.head.appendChild(s);
      });
    }
    if(!window.jspdfAutoTable){
      await new Promise(function(res,rej){
        var s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        s.onload=res;s.onerror=rej;document.head.appendChild(s);
      });
      window.jspdfAutoTable=true;
    }
    return window.jspdf.jsPDF;
  }

  // ── RELATÓRIO GLOBAL (modal 📊 Gerar Relatório) ──────────────────────────────
  async function gerarPDFRelatorio(lista,dataIni,dataFim,btnRef){
    if(btnRef){btnRef.disabled=true;btnRef.textContent='⏳ A gerar documento...';}
    try{
      var JsPDF=await _loadJsPDF();
      var doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4'});
      var pgW=doc.internal.pageSize.getWidth();
      var pgH=doc.internal.pageSize.getHeight();
      var now=new Date();
      var extractStr=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      var perStr=dataIni&&dataFim?(_fmtDateISO(dataIni)+' a '+_fmtDateISO(dataFim)):dataIni?('A partir de '+_fmtDateISO(dataIni)):dataFim?('Até '+_fmtDateISO(dataFim)):'Todo o período';
      // Cabeçalho
      doc.setFillColor(17,24,39);
      doc.rect(0,0,pgW,18,'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(14);doc.setFont('helvetica','bold');
      doc.text('🚚 RELATÓRIO DE OPERAÇÕES — TELEMIM',14,8);
      doc.setFontSize(9);doc.setFont('helvetica','normal');
      doc.text('Contrato: PROMORAR  |  Período: '+perStr,14,13.5);
      doc.text('Total: '+lista.length+' mudança'+(lista.length!==1?'s':''),pgW-14,13.5,{align:'right'});
      doc.setTextColor(30,41,59);
      // Tabela
      doc.autoTable({
        startY:22,
        head:[['📅 Data','⏰ Hora','Cliente','Origem','Destino','m³','Veículo','Validações']],
        body:_buildTableRows(lista),
        theme:'grid',
        styles:{fontSize:8,cellPadding:2,overflow:'linebreak',font:'helvetica'},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold',fontSize:9},
        alternateRowStyles:{fillColor:[248,250,252]},
        columnStyles:{0:{cellWidth:20,halign:'center'},1:{cellWidth:14,halign:'center'},2:{cellWidth:40},3:{cellWidth:40},4:{cellWidth:40},5:{cellWidth:16,halign:'center'},6:{cellWidth:20,halign:'center'},7:{cellWidth:30,halign:'center'}},
        didDrawPage:function(data){
          var pN=doc.internal.getNumberOfPages();
          var cur=doc.internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(7);doc.setTextColor(100,116,139);
          doc.text('TELEMIM — Relatório gerado em: '+extractStr,14,pgH-4);
          doc.text('Página '+cur+' de '+pN,pgW-14,pgH-4,{align:'right'});
          doc.setTextColor(30,41,59);
        }
      });
      doc.save(_pdfFileName(now));
    }finally{
      if(btnRef){btnRef.disabled=false;btnRef.textContent='📥 Baixar PDF';}
    }
  }

  // ── PDF INDIVIDUAL DO CARD ─────────────────────────────────────────────────────
  async function gerarPDFCardIndividual(move,btnRef){
    if(btnRef){btnRef.disabled=true;btnRef.textContent='⏳ A gerar...';}
    try{
      var JsPDF=await _loadJsPDF();
      var doc=new JsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      var pgW=doc.internal.pageSize.getWidth();
      var pgH=doc.internal.pageSize.getHeight();
      var now=new Date();
      // Cabeçalho
      doc.setFillColor(17,24,39);
      doc.rect(0,0,pgW,22,'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(16);doc.setFont('helvetica','bold');
      doc.text('TELEMIM — Ordem de Serviço',14,10);
      doc.setFontSize(9);doc.setFont('helvetica','normal');
      doc.text('Contrato: PROMORAR  |  Gerado em: '+now.toLocaleDateString('pt-BR'),14,17);
      doc.setTextColor(30,41,59);
      // Tabela de dados do card
      doc.autoTable({
        startY:28,
        head:[['Campo','Detalhe']],
        body:_buildSingleCardRows(move),
        theme:'grid',
        styles:{fontSize:10,cellPadding:4},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold'},
        columnStyles:{0:{cellWidth:40,fontStyle:'bold',fillColor:[248,250,252]},1:{cellWidth:130}},
        didDrawPage:function(){
          doc.setFontSize(7);doc.setTextColor(100,116,139);
          doc.text('TELEMIM — Documento gerado automaticamente',14,pgH-8);
          doc.setTextColor(30,41,59);
        }
      });
      doc.save(_singleCardFileName(move));
    }finally{
      if(btnRef){btnRef.disabled=false;btnRef.textContent='📄 PDF';}
    }
  }

  
  // ── PDF SEMANA ─────────────────────────────────────────────────────────────
  function gerarPDFMudanca(m){
    // Abrir modal de assinatura
    setMudAssinatura(m);
    setRessalvas("");
    setShowAssinatura(true);
  }
  // ── Cloud Backup Google Drive (Apps Script) ────────────────────
  async function handleFinalizeOS(m,pdfB64){if(isUploading) return;setIsUploading(true);setSyncStatus("⏳ A guardar canhoto...");try{var r=await fetch(SUPA_URL+"/functions/v1/salvar-canhoto",{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY},body:JSON.stringify({osId:m.id,pdfBase64:pdfB64,nome:m.nome||""})});var j=await r.json();if(j&&j.sucesso){setSyncStatus("✅ Canhoto guardado!");setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);}else{console.warn("[Canhoto] erro:",j);setSyncStatus("✅ OS Concluída");setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);}}catch(e){console.warn("[Canhoto] Erro:",e);setSyncStatus("✅ OS Concluída!");setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);}finally{setIsUploading(false);}}

  // 🚚 MÁQUINA DE ESTADOS DO MOTORISTA ???????????????????????????????????
  async function handleStatusMotorista(ag, novoStatus){
    if(!ag||!ag.id) return;
    var agora=new Date().toISOString();
    var _isVanMot=usuario&&(usuario.tipo_veiculo==="VAN"||ag.motorista_van_id===usuario.id);
    var _isCamMot=usuario&&(usuario.tipo_veiculo==="CAMINHAO"||ag.motorista_caminhao_id===usuario.id);
    var body={};
    var _veiTipo=_isVanMot?"van":"cam";
    // ── 4-step flow for van/caminhão ──
    // Step 1: Ajudantes a Bordo → GPS ativo rumo à ORIGEM
    if(novoStatus==="Em Deslocamento"){
      if(_isVanMot){body.inicio_van_em=agora;body.van_saiu_em=agora;}
      else if(_isCamMot){body.inicio_caminhao_em=agora;body.caminhao_saiu_em=agora;}
      else{body.status=novoStatus;body.inicio_em=agora;}
      gpsStart(ag.id,_veiTipo);
    }
    // Step 2: Chegou na Origem → GPS para (carregamento)
    if(novoStatus==="Na Origem"){
      if(_isVanMot) body.chegou_origem_van_em=agora;
      else if(_isCamMot) body.chegou_origem_cam_em=agora;
      gpsStop(_veiTipo);
    }
    // Step 3: Deslocamento Destino → GPS reativa rumo ao DESTINO
    if(novoStatus==="Deslocamento Destino"){
      if(_isVanMot) body.saiu_destino_van_em=agora;
      else if(_isCamMot) body.saiu_destino_cam_em=agora;
      gpsStart(ag.id,_veiTipo);
    }
    // Step 4: Chegou no Destino → GPS para, equipe descarregando (NÃO conclui)
    if(novoStatus==="Descarregando"){
      if(_isVanMot){body.chegada_van_em=agora;}
      else if(_isCamMot){body.chegada_caminhao_em=agora;}
      gpsStop(_veiTipo);
    }
    // Step 6: Concluído (set by Finalizar Mudança button)
    if(novoStatus==="Concluido"||novoStatus==="realizado"){
      if(_isVanMot){body.termino_van_em=agora;if(!ag.chegada_van_em)body.chegada_van_em=agora;}
      else if(_isCamMot){body.termino_caminhao_em=agora;if(!ag.chegada_caminhao_em)body.chegada_caminhao_em=agora;}
      else{body.status="concluida";body.termino_em=agora;}
      gpsStop(_veiTipo);
    }
    // Legacy: Realizando (admin/supervisor/social use)
    if(novoStatus==="Realizando"){
      if(!_isVanMot&&!_isCamMot){body.status=novoStatus;body.inicio_mudanca_em=agora;}
    }
    var prevAgenda=agenda.slice();
    setAgenda(function(prev){return prev.map(function(a){return a.id===ag.id?Object.assign({},a,body):a;});});
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+ag.id,{
        method:"PATCH",
        headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
        body:JSON.stringify(body)
      });
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("✅ Status actualizado!");
      // If concluded, create mudancas record for Registros tab
      if(novoStatus==="Concluido"||novoStatus==="realizado"){
        var _merged=Object.assign({},ag,body);
        var _novaM={nome:_merged.nome||"",selo:_merged.selo||"",comunidade:_merged.comunidade||"",data:_merged.data,origem:_merged.origem||"",destino:_merged.destino||"",contato:_merged.contato||null,van:_merged.van||false,caminhao:_merged.caminhao||false,medicao:parseFloat(_merged.medicao)||0,ajudantes:parseInt(_merged.ajudantes)||0,observacao:_merged.observacao||"",status:"Concluído",termino_em:agora,criado_em:agora,motorista_van_id:_merged.motorista_van_id||null,motorista_caminhao_id:_merged.motorista_caminhao_id||null,supervisor_id:_merged.supervisor_id||null,approved_by_admin:_merged.approved_by_admin||null,approved_by_social:_merged.approved_by_social||null,approved_by_promorar:_merged.approved_by_promorar||null,approved_by_supervisor:_merged.approved_by_supervisor||null,inicio_van_em:_merged.inicio_van_em||null,chegou_origem_van_em:_merged.chegou_origem_van_em||null,saiu_destino_van_em:_merged.saiu_destino_van_em||null,chegada_van_em:_merged.chegada_van_em||null,inicio_caminhao_em:_merged.inicio_caminhao_em||null,chegou_origem_cam_em:_merged.chegou_origem_cam_em||null,saiu_destino_cam_em:_merged.saiu_destino_cam_em||null,chegada_caminhao_em:_merged.chegada_caminhao_em||null};
        fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),body:JSON.stringify(_novaM)}).then(function(r2){return r2.json();}).then(function(d){if(Array.isArray(d)&&d[0]){setMudancas(function(prev){return[d[0]].concat(prev);});}}).catch(function(){});
        // Push notification: mudança finalizada → admin + supervisor
        var _fNotifIds=[];var _fAdmins=listaUsuarios.filter(function(u){return u.perfil==="admin"&&u.ativo;});_fAdmins.forEach(function(a){_fNotifIds.push(a.id);});if(ag.supervisor_id)_fNotifIds.push(ag.supervisor_id);
        if(_fNotifIds.length>0){var _hora=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});sendPushNotification(_fNotifIds,"✅ Mudança concluída!","👤 "+(ag.nome||"Mudança")+" · 📐 "+(ag.medicao||"0")+" m³ · 🕐 Finalizada às "+_hora);}
        // WA auto: finalizada
        if(cfgWA.whatsapp_ativo==="true"){
          var _fVars={cliente:ag.nome||"",data:ag.data||"",origem:ag.origem||"",destino:ag.destino||"",motorista:(usuario&&usuario.nome)||"Motorista",metragem:ag.medicao||""};
          ["finalizada_admin","finalizada_supervisor","finalizada_cliente"].forEach(function(evKey){
            var ev=cfgWAauto[evKey];if(!ev||!ev.ativo)return;
            var _nums=resolverDestinatariosWA(ev.dest,ag);
            _nums.forEach(function(n){enviarWA(n,substituirVarsWA(ev.msg,_fVars));});
          });
        }
      }
      setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);
    }catch(e){
      setAgenda(prevAgenda);
      setSyncStatus("⚠️ Erro ao actualizar status");
    }
  }
  async function handleDeslocamento(ag, tipo){
    if(!ag||!ag.id) return;
    var agora=new Date().toISOString();
    var body={};
    if(tipo==="van"){body.van_saiu_em=agora;body.inicio_van_em=agora;}
    else{body.caminhao_saiu_em=agora;body.inicio_caminhao_em=agora;}
    var prevAgenda=agenda.slice();
    setAgenda(function(prev){return prev.map(function(a){if(a.id!==ag.id)return a;return Object.assign({},a,body);});});
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+ag.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("✅ Deslocamento registrado!");
      // Push notification to admin+supervisor: motorista a caminho
      var _notifIds=[];var _admins=listaUsuarios.filter(function(u){return u.perfil==="admin"&&u.ativo;});_admins.forEach(function(a){_notifIds.push(a.id);});if(ag.supervisor_id)_notifIds.push(ag.supervisor_id);
      if(_notifIds.length>0){var _motNome=(usuario&&usuario.nome)||"Motorista";sendPushNotification(_notifIds,"🚐 Motorista a caminho!",_motNome+" ("+tipo+") saiu para: 👤 "+(ag.nome||"Mudança")+" · 📍 "+(ag.comunidade||""));}
      // WA auto: deslocamento
      if(cfgWA.whatsapp_ativo==="true"){
        var _dVars={cliente:ag.nome||"",data:ag.data||"",origem:ag.origem||"",destino:ag.destino||"",motorista:(usuario&&usuario.nome)||"Motorista",metragem:ag.medicao||""};
        ["deslocamento_admin","deslocamento_supervisor","deslocamento_cliente"].forEach(function(evKey){
          var ev=cfgWAauto[evKey];if(!ev||!ev.ativo)return;
          var _nums=resolverDestinatariosWA(ev.dest,ag);
          _nums.forEach(function(n){enviarWA(n,substituirVarsWA(ev.msg,_dVars));});
        });
      }
      setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);
    }catch(e){setAgenda(prevAgenda);setSyncStatus("⚠️ Erro ao registrar deslocamento");}
  }
  // ── Optimistic UI — Carimbos de Aprovação ──────────────
  async function handleApprove(osId){
    // Anti-duplo clique: bloquear se já em aprovação
    if(isApproving[osId]) return;
    setIsApproving(function(prev){var n={};Object.assign(n,prev);n[osId]=true;return n;});

    // Guardar estado anterior para possível rollback
    var previousData=mudancas.slice();

    // Definir o carimbo com base na role do utilizador logado
    var updatePayload={};
    if(usuario&&usuario.perfil==='admin')      updatePayload.approved_by_admin=usuario.nome;
    if(usuario&&usuario.perfil==='social')     updatePayload.approved_by_social=usuario.nome;
    if(usuario&&usuario.perfil==='promorar')   updatePayload.approved_by_promorar=usuario.nome;
    if(usuario&&usuario.perfil==='supervisor') updatePayload.approved_by_supervisor=usuario.nome;

    if(Object.keys(updatePayload).length===0){
      setIsApproving(function(prev){var n={};Object.assign(n,prev);delete n[osId];return n;});
      return;
    }

    // MUTAÇÃO OTIMISTA — actualizar UI antes da API
    setMudancas(function(prev){
      return prev.map(function(os){
        return os.id===osId?Object.assign({},os,updatePayload):os;
      });
    });

    // SINCRONIZAÇÃO EM SEGUNDO PLANO
    try{
      var patchRes=await fetch(
        SUPA_URL+'/rest/v1/mudancas?id=eq.'+osId,
        {method:'PATCH',headers:{...getH(),'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify(updatePayload)}
      );
      if(!patchRes.ok) throw new Error('HTTP '+patchRes.status);
    }catch(e){
      // ROLLBACK — desfazer a mutação e notificar
      console.error('[Optimistic] Falha no Agente Ativo:',e);
      setMudancas(previousData);
      setSyncStatus('⚠️ Aprovação não guardada. Verifique a ligação.');
    } finally {
      setIsApproving(function(prev){var n={};Object.assign(n,prev);delete n[osId];return n;});
    }
  }

  function pedirFinalizacao(ag){if(!ag||!ag.id)return;setConfirmFinAg(ag);}
  async function handleRegistarOS(ag){
    if(!ag||!ag.id) return;
    setConfirmFinAg(null);
    var prevAgenda=agenda.slice();
    _setAgendaRemovidaIds(function(prev){var s=new Set(prev);s.add(ag.id);return s;});
    setAgenda(function(prev){return prev.filter(function(x){return x.id!==ag.id;});});
    try{
      var novaOS={nome:ag.nome,data:ag.data,horario:ag.horario||null,selo:ag.selo||null,van:ag.van||false,caminhao:ag.caminhao||false,comunidade:ag.comunidade||null,observacao:ag.observacao||null,origem:ag.origem||null,destino:ag.destino||null,contato:ag.contato||null,medicao:parseFloat(ag.medicao)||0,ajudantes:parseInt(ag.ajudantes)||0,status:"Registrado",requested_by:ag.requested_by||null,approved_by_admin:ag.approved_by_admin||null,approved_by_social:ag.approved_by_social||null,approved_by_promorar:ag.approved_by_promorar||null,approved_by_supervisor:ag.approved_by_supervisor||null,motorista_van_id:ag.motorista_van_id||null,motorista_caminhao_id:ag.motorista_caminhao_id||null,supervisor_id:ag.supervisor_id||null,equipa_confirmada:ag.equipa_confirmada||[]};
      var r1=await fetch(SUPA_URL+"/rest/v1/mudancas?on_conflict=nome,data",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation,resolution=merge-duplicates"}),body:JSON.stringify(novaOS)});
      if(!r1.ok) throw new Error("HTTP "+r1.status);
      var _r1Body=await r1.json().catch(function(){return null;});
      var _adminId=usuario&&(usuario.email||usuario.nome)||"Administrador";var r2=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+ag.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({deleted_at:new Date().toISOString(),deleted_by:_adminId})});
      if(!r2.ok) throw new Error("HTTP r2:"+r2.status);
      var _novaMud=(_r1Body&&Array.isArray(_r1Body)&&_r1Body[0])?_r1Body[0]:null;
      if(_novaMud){
        setMudancas(function(prev){return [_novaMud].concat(prev);});
        setMudAssinatura(_novaMud);
        setRessalvas("");
        setShowAssinatura(true);
        // ── Auto Contas a Pagar ──
        var _eqConf=ag.equipa_confirmada||[];
        if(_eqConf.length>0){
          try{
            var _supNome="";if(ag.supervisor_id){var _sf=listaUsuarios.find(function(u){return u.id===ag.supervisor_id;});if(_sf)_supNome=_sf.nome;}
            var _nomes=_eqConf.map(function(a){return a.nome;}).join(", ");
            var _desc="Acerto OS #"+_novaMud.id+" - "+(_supNome?"Sup: "+_supNome+" + ":"")+"Equipa: "+_nomes;
            await fetch(SUPA_URL+"/rest/v1/contas_pagar",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({tipo:"PAGAR",categoria:"Pagamento de Equipe",descricao:_desc,valor:0,data:ag.data||new Date().toISOString().slice(0,10),os_id:_novaMud.id,agenda_id:ag.id,status:"pendente"})});
          }catch(e){}
        }
      }
      setAgenda(function(prev){return prev.filter(function(x){return x.id!==ag.id;});});
      setSyncStatus("✅ OS registada com sucesso!");
    }catch(e){
      setAgenda(prevAgenda);
      setSyncStatus("⚠️ Erro ao registar: "+e.message);
      console.error("[handleRegistarOS]",e);
    }
  }
  // ── Optimistic UI — Carimbos da Agenda ──────────────────────────────
  async function handleApproveAgenda(agId){
    if(isApproving[agId]) return;
    await _ensureAuth();
    setIsApproving(function(prev){var n={};Object.assign(n,prev);n[agId]=true;return n;});
    var previousAgenda=agenda.slice();
    var updatePayload={};
    if(usuario&&usuario.perfil==='admin')      updatePayload.approved_by_admin=usuario.nome;
    if(usuario&&usuario.perfil==='social')     updatePayload.approved_by_social=usuario.nome;
    if(usuario&&usuario.perfil==='promorar')   updatePayload.approved_by_promorar=usuario.nome;
    if(usuario&&usuario.perfil==='supervisor') updatePayload.approved_by_supervisor=usuario.nome;
    if(Object.keys(updatePayload).length===0){
      setIsApproving(function(prev){var n={};Object.assign(n,prev);delete n[agId];return n;});
      return;
    }
    setAgenda(function(prev){
      return prev.map(function(ag){
        return ag.id===agId?Object.assign({},ag,updatePayload):ag;
      });
    });
    try{
      var patchRes=await fetch(
        SUPA_URL+'/rest/v1/agenda?id=eq.'+agId,
        {method:'PATCH',headers:Object.assign({},getH(),{'Content-Type':'application/json','Prefer':'return=minimal'}),
        body:JSON.stringify(updatePayload)}
      );
      if(!patchRes.ok) throw new Error('HTTP '+patchRes.status);
      var _agNome="";var _agItem=agenda.find(function(x){return x.id===agId;});if(_agItem)_agNome=_agItem.nome||"";
      try{_addNotif("aprovacao",(usuario&&usuario.nome||"Usuário")+" confirmou a mudança",_agNome);}catch(e){}
    }catch(e){
      setAgenda(previousAgenda);
      setSyncStatus('⚠️ Aprovação (Agenda) não guardada. Verifique a ligação.');
      console.error('[handleApproveAgenda]',e);
    }finally{
      setIsApproving(function(prev){var n={};Object.assign(n,prev);delete n[agId];return n;});
    }
  }
  // ── CANCELAR MUDANÇA ─────────────────────────────────────────────────
  async function handleSolicitarCancelamento(agId,motivo){
    await _ensureAuth();
    var _nome=usuario?(usuario.nome||usuario.email):"";
    var _perfil=usuario?usuario.perfil:"";
    var payload={cancelamento_solicitado:true,cancelamento_motivo:motivo,cancelamento_por:_nome,cancelamento_perfil:_perfil,cancelamento_em:new Date().toISOString()};
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,payload):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(payload)});
      try{_addNotif("cancelamento","Solicitação de cancelamento por "+_nome,(agenda.find(function(a){return a.id===agId;})||{}).nome||"");}catch(e){}
      setSyncStatus("✅ Solicitação de cancelamento enviada!");
    }catch(e){setSyncStatus("⚠️ Erro ao solicitar cancelamento");}
    setCancelModal(null);setCancelMotivo("");
  }
  async function handleCancelarDireto(agId){
    await _ensureAuth();
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,{status:"cancelada",cancelamento_solicitado:false}):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({status:"cancelada",cancelamento_solicitado:false})});
      try{_addNotif("cancelamento","Mudança cancelada pelo admin",(agenda.find(function(a){return a.id===agId;})||{}).nome||"");}catch(e){}
      setSyncStatus("✅ Mudança cancelada!");
    }catch(e){setSyncStatus("⚠️ Erro ao cancelar");}
  }
  async function handleAutorizarCancelamento(agId){
    await _ensureAuth();
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,{status:"cancelada",cancelamento_solicitado:false}):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({status:"cancelada",cancelamento_solicitado:false})});
      setSyncStatus("✅ Cancelamento autorizado!");
    }catch(e){setSyncStatus("⚠️ Erro ao autorizar");}
  }
  async function handleRecusarCancelamento(agId){
    await _ensureAuth();
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,{cancelamento_solicitado:false,cancelamento_motivo:null,cancelamento_por:null,cancelamento_perfil:null}):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({cancelamento_solicitado:false,cancelamento_motivo:null,cancelamento_por:null,cancelamento_perfil:null})});
      setSyncStatus("✅ Cancelamento recusado!");
    }catch(e){setSyncStatus("⚠️ Erro ao recusar");}
  }
  async function handleDespachar(agId,motoristaId,tipo){
    await _ensureAuth();
    var mid=motoristaId||null;
    var field=tipo==="VAN"?"motorista_van_id":"motorista_caminhao_id";
    setAgenda(function(prev){return prev.map(function(a){if(a.id!==agId)return a;var u={};u[field]=mid;return Object.assign({},a,u);});});
    try{
      var body={};body[field]=mid;
      var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("✅ Motorista despachado!");
      // Push notification to motorista
      if(mid){var _agItem=agenda.find(function(a){return a.id===agId;});sendPushNotification([mid],"📋 Nova mudança atribuída!","👤 "+(_agItem?_agItem.nome:"Mudança")+" · 📅 "+(_agItem?_agItem.data:"")+" · "+tipo);
        // WA auto: atribuida_motorista
        if(cfgWA.whatsapp_ativo==="true"&&cfgWAauto.atribuida_motorista&&cfgWAauto.atribuida_motorista.ativo){
          var _mot=listaUsuarios.find(function(u){return u.id===mid;});
          var _supNome="";if((_agItem||{}).supervisor_id){var _sU=listaUsuarios.find(function(u){return u.id===_agItem.supervisor_id;});if(_sU)_supNome=_sU.nome||"";}
          var _motVanN="";if((_agItem||{}).motorista_van_id){var _mv=listaUsuarios.find(function(u){return u.id===_agItem.motorista_van_id;});if(_mv)_motVanN=_mv.nome||"";}
          var _motCamN="";if((_agItem||{}).motorista_caminhao_id){var _mc=listaUsuarios.find(function(u){return u.id===_agItem.motorista_caminhao_id;});if(_mc)_motCamN=_mc.nome||"";}
          var _vars={cliente:(_agItem||{}).nome||"",data:(_agItem||{}).data||"",hora:(_agItem||{}).horario||"",origem:(_agItem||{}).origem||"",destino:(_agItem||{}).destino||"",motorista:(_mot&&_mot.nome)||"",metragem:(_agItem||{}).metragem||"",supervisor:_supNome,caminhao:_motCamN,van:_motVanN};
          var _nums=resolverDestinatariosWA(cfgWAauto.atribuida_motorista.dest,_agItem||{});
          _nums.forEach(function(n){enviarWA(n,substituirVarsWA(cfgWAauto.atribuida_motorista.msg,_vars));});
        }
      }
    }catch(e){
      loadAg();
      setSyncStatus("⚠️ Erro ao despachar");
    }
  }
  async function handleDespacharMud(mudId,motoristaId,tipo){
    await _ensureAuth();
    var mid=motoristaId||null;
    var field=tipo==="VAN"?"motorista_van_id":"motorista_caminhao_id";
    setMudancas(function(prev){return prev.map(function(m){if(m.id!==mudId)return m;var u={};u[field]=mid;return Object.assign({},m,u);});});
    try{
      var body={};body[field]=mid;
      var r=await fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+mudId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)});
      if(!r.ok) throw new Error("HTTP "+r.status);
    }catch(e){loadMud();}
  }
  async function handleDespacharSup(agId,supId){
    await _ensureAuth();
    var sid=supId||null;
    var _ag=agenda.find(function(a){return a.id===agId;});
    setAgenda(function(prev){return prev.map(function(a){if(a.id!==agId)return a;return Object.assign({},a,{supervisor_id:sid});});});
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({supervisor_id:sid})});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("✅ Supervisor designado!");
      // Push notification to supervisor
      if(sid&&_ag){sendPushNotification([sid],"📋 Nova mudança atribuída!","👤 "+(_ag.nome||"Mudança")+" · 📅 "+(_ag.data||"")+" · ⏰ "+(_ag.horario||""));
        // WA auto: atribuida_supervisor
        if(cfgWA.whatsapp_ativo==="true"&&cfgWAauto.atribuida_supervisor&&cfgWAauto.atribuida_supervisor.ativo){
          var _supU=listaUsuarios.find(function(u){return u.id===sid;});
          var _motVanNome="";var _motCamNome="";if(_ag.motorista_van_id){var _mvU=listaUsuarios.find(function(u){return u.id===_ag.motorista_van_id;});if(_mvU)_motVanNome=_mvU.nome||"";}if(_ag.motorista_caminhao_id){var _mcU=listaUsuarios.find(function(u){return u.id===_ag.motorista_caminhao_id;});if(_mcU)_motCamNome=_mcU.nome||"";}
          var _vars2={cliente:_ag.nome||"",data:_ag.data||"",hora:_ag.horario||"",origem:_ag.origem||"",destino:_ag.destino||"",motorista:"",supervisor:(_supU&&_supU.nome)||"",metragem:_ag.metragem||"",caminhao:_motCamNome,van:_motVanNome};
          var _nums2=resolverDestinatariosWA(cfgWAauto.atribuida_supervisor.dest,Object.assign({},_ag,{supervisor_id:sid}));
          _nums2.forEach(function(n){enviarWA(n,substituirVarsWA(cfgWAauto.atribuida_supervisor.msg,_vars2));});
        }}
      if(sid&&_ag){var _sup=listaUsuarios.find(function(u){return u.id===sid;});if(_sup&&_sup.email){try{await fetch(SUPA_URL+"/functions/v1/enviar-email-agendamento",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({to:_sup.email,subject:"📋 Designação de Supervisão — "+(_ag.nome||"Mudança"),html:"<h2>Olá "+(_sup.nome||"Supervisor")+"!</h2><p>Você foi designado(a) para supervisionar a seguinte mudança:</p><p><b>👤 Cliente:</b> "+(_ag.nome||"—")+"</p><p><b>📅 Data:</b> "+(_ag.data||"—")+(_ag.horario?" às "+_ag.horario+"h":"")+"</p><p><b>🏷️ Selo:</b> "+(_ag.selo||"—")+"</p><p><b>📦 Saída:</b> "+(_ag.origem||"—")+"</p><p><b>🏘️ Destino:</b> "+(_ag.destino||"—")+"</p><br><p>Acesse o app para mais detalhes.</p><p><b>TELEMIM — PROMORAR</b></p>"})});} catch(e){}}}
    }catch(e){loadAg();setSyncStatus("⚠️ Erro ao designar");}
  }

  async function _gerarPDFComAssinatura(m,assinaturaB64,obs){
    var LOGO='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAARCACdANwDASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBQYDBAkBAv/EAEwQAAEDAwIDBAQHDAcIAwAAAAECAwQABREGEiExBhNBUWEUIjJxgbEHFSNCUmKCkaHB0dIWMzQ1VHKis8JDU2NzdJKTsuElNkR0g/H/xAAcAQEAAgMBAQEAAAAAAAAAAAAABAUCAwYHAQj/xABCEQABAwMCBAQGBggEBwAAAAABAgMRAAQFITEGEkEHUWFxFIGRobHBExUWIjI0U3KSssETNlRUgsLh8DVSYnOCwuHx/9oADAMBAAIRAxEAPwC/1KUpSlKUpSlKUpSlKUpSlKUpSlKUpSlK4Js2Jbrc/PnyWo0ZhBcdedVtShI5kk+ArRzxu4Uj/wCb2z6Cr/StTj7TRhxQHmYqVb2NzcglhtSo7gT8K3+laB/Tfwo/Te2/Wr/Svn9N/Cj9N7b9av8AStfptv8AvE+0VI+psh/p1/yq/KpApWgf038KP03tv1q/0r4eOHCgAk63tuB7Vf6U9Nt/3ifaKfU2Q/06/wCVX5VIFKjmHx64PXC5tW+LxAs6pDqtiELWpGT5ZUAB9NSKlQUkKSQQRkEeNb0rSoSkzUV+0ftyA+gpnvBHxr7SlKyqPSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpXQvVmt+odPTLJdmA/CltFl5vJG5J9o6VE73Zq4Vx47kiR8attNpK1rXPISkDmSSRyFTPWn33WXDqXBn2C86rsqUPIXFksKmoSoAgpUk8+RqFd2ts7959IJG01c4nIZG3JbsnFpBMnkn2wKhY6D7MYJH3ZDl/8Aan/StU4iaU4EWvQcuZo/Vjki9I2/B46JZfDpyMgjHIYyc55Yrav6Juzz+TxFIHgPjVnl/wCNatxD4fcGrFoCXctL65VNuzZT3EUTG3++JIynakZHLJz4YrkLu3WllZLLQ0OoOvqr1XFXrarxlPpd0ZUNFJ0Oux307/CoPyc9TTJ8zXw9aVxNe1gVq+pGkJuDasZ7xHpA9DXoF2ab3PvvZq0/IuT673mA7EDi1FSlIbcUhOSep2gD6K8/9SKSqeykEEhHMfTV9eyzEfi9mCxF9so752Q+3n8pCnlEH6RXf8KKVqOkfOvK+1pCPqppR/FziP5VTUy0pSuzr89UpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUqs2qeEHA6BqSWq5a3mwH3nluqitPIc7sqJJHqEjmT151IfHHW03TWmo1ntTymJlyKgp5BwptpON20+BJIGffVY9hcJUSSSck+ZqW1g2MggKuRKRtXM3/aNfcOXKmMUrlWQOY9O8COtS/Yuzzwk1Mwp2w60uc4J9YNPNFSfenZkVmR2UdDjpfb8Pc41/JUKWm53CxXli62qW5FlsK3JcQcfQfNJ8QauLpvU8e/8ADuJqYgNIdjF5xOeSFJB3D6CDVfecLWVvBDYIPhXRcO9rmaygUh24UlaROh0I76qfeNH8H7Tql20pmatmMMOFp6ay6ztSoHB2pKcqAP7uVSjE7L2gJ8BmbD1DfXGH2w424HW8KSRkH1Kg594yXnph5d6tTv1kn/OrpaIjKicN7FHWCFIgsgg+B2Cs7/hnGsJTytCetROFu1LibJXDyHrtXKNREaa7bVCrPY74cfGqJk686jmoCgpbDshtKXB+aSlAIHuIqf7db4NptMa2W2K3Fhxm0sssNDCW0JGAAPdXZpWDLDbKeVtIA8K6LI5q+yXL6Y8VxtJ2pSlK21WUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKVAXaOtkgSLHeggmMA5EWvwQskKTn34V9VQYCU8sVeG9WW26gsci0XaMiREfTtW2r9hB8COoNQVd+zrckzVGxagjuRifRRNQQtA8tychX1Cr3H37aGw05pFeY8U8M3T10bq1TzBW46g7VCZI5lRwPGp0uNze0N2WoFmeUWbpd21pba/KbQ4oqWcexKse811o3C/S/DmMnU3EG9NT1MqC49vYRhLrg5gYPNfPw5DzqMdY6uuOstUO3e4HYMbGI4PosN+CR7fEnxNSlFN2tIRqkGSe89wqhbbcwjThdMPLTyhPUA7k93cB6662mbI7qHVtssTCCfhT6UKx+Sgc1H6Eg1dlptLTCGkDCUJCQPICoU4D6Fchxl6zujJS9IbLUJCxgpbPrL/7sDHsHtqbqqsm/9I7yjYfGu54KxarS0L7ghTmvqG3t39lKUpVbXZ0pSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUpSlKUr8POtR4633nEtttpK1rUcBIAySa/ddO7W9u7WGba3VqQiUwthSk9QFJIz+2voidawcKgklAk9Ki2d2htIx5DrUO23WalBIS6hCUIc9o3Kzj3itTvnaJvElhbNgsbEAkYD8pffKHuSMDP0msDI4Ea/YmrZYj2+Q0k4Q+JO0LHgcEZHurKWvs86plOJVdrtboDf5Qa3Pr/AMhV+lqwRqTPr+VeXu3vEtyS2EKT5JA95/Oouut4u19uK7le7i/Nkq6uvq9UeSR0SPYK7PCtdm1hxytmlVt/DYqA5IllCsJAQkkJJ8cqxkeVY7jxo1Vl1bb9G6QkzHEsxu9uc15wJSpxZ9BGB02pGcD84ZrfeynoRu0apuV2z3yo0fu1P4wC4s9B7kpP11IeeBti4jQdKqLDGTkUM3KuZZVqJnbUyatchCGmkttpCEJACUpGAAPCv1SlcvXtQEUpSlKUpSlKUpSlKUpSlKUpSlKUpVG/vheLX6To/wAEx/LT74Xi1+k6P8Ex/LXK/a+y/wAqvYPzr1H9EuY/eN+1X+yryUqjf3wvFr9J0f4Jj+Wn3wvFr9J0f4Jj+Wn2vsv8qvYPzp+iXMfvG/ar/ZV5KVXzs98TNZ661VeYep7smazGiNutJEdtvaorwTlIGeVWDq+sb1F6yH2wYPfXC5zDP4a7VZXBBUmNpjUT1A+FKUrWeIV8naa4XX2/WwtCZChreZLqdydw6ZHjUlxwNoK1bATVfbW6rh5DCN1EAeZMVs1Ko47x74q3O4sNOan+DNqdQkoixmm+RUOWdpP7avHVdjMuzkef6EEcsb+Pr8K6HiThO74f+i9LUklyY5STERvIHfSlcEybDt8NcufKZjMI9Z15YQlPvJrXJnEvQUFG5/VdrPLOG3g4T9Cc1bJQpX4RNce9dMMfrVhPmQK2qtS1/ru26G005MkrS7NcBTFig+k6v/JI8TWgap7QVuYaei6St7sx/oJUpJbaT7Qn1lfsqCb3ebtf7u5c71Oclyl9Vr6JHglI6AewVZWuNWtQLug99cbnOMmGEFqyPMs9eg/M+6urcrjKuU+Vdro/vffWp55xXmev0f5Vr+ke0vqrh3qCRGtUC23KwLe3rivI7t1RwAVJdTzB5csgirAaD4ERtSabemeNPRpbe1iE06phwJP5aynBB8k/X5VF3GDsinTNkf1Jw8nzJ8KMkuSbZLIW8hsDJW0sD08dSkjOOhPSrFy6tln0c7e6qLD4W+t0fWJEE7d8d/rq0HC7i5pLixpxVx07IU3KYwJdukYD0ZR6ZA6pPgocj7+Vb7XlVoXWl44YcQ7bq2xuqWWVYda3YTJZPrtq8wR08iAfCvUSw3qBqPTFvv1rdDsOfHRJZX5oWkEfTzqnvbX6BWmxrv8RkvTG4X+Ib+PjWRpSsXqO/QNL6TuGobmpQiQWVPubBlRA8B7ScAe+oClBAKlHQVdtNLdWG2xKiYA7ydqylKrBau1fMd1W2i8aXix7M45tUph5Sn2UE43HPoqx1IAHsqzqFpcaS4hQUlQBBHiKh2OSt70KLCpjernN8OZDCqQm+b5ecSNQdt9idRNfqlKVOqjpSlKUpSlKUqEvvWuG3/ABmoP8Wj+So740cEtH8PuGyb9YpF1clGY1HxKkJWjaoKzyCRz5CrY1C3ah+Q5v5zY/cuucymJs27RxaGwCAa9E4W4qy9zl7Zl65UpKlgEE6EVUWwQWbnqy122SVhmVMZYcKDhW1awk4Png1bb71rht/xmoP8Wj+SqpaP+USwfOUb7VNejI6VScK2NvctuF5AVBG9dp2n5y/xr9umzeUgKCpgxOorQtAcIdK8N7pMn2B+5OOy2ksuCW8lwBIVuGMJHPNb9mq58Y+0JJsl4kaV0Ktky46i3Lua0hwNLHVDSTyKh0KjkA8gD1qDm75xc1E25d41z1jcGkElUiM5IU2nHXmj0R9FWruetLFXo1s2VR3bDvrlrXgXLZtsZLJPhHPEFeqiOk7RptrPhV/a0jjF8g+q/m5z91Vm4d9oPV2l7yzG1RPkXuzKUEvJkne+wPFSF9Tj81Wc+w1ZPivKjzuzzqSbEdS9HftS3WnEHIWlSQQR7CCKmNZVnIWjqmtCAZB32NVN1wrecP5a1RcwUqWnlUNjChPkR3VRCF+No369H8Qr0srzThfjaN+vR/EK9J5EhiJEdlSXUMstILjjizhKEgZJJ8ABVLwZol7/ALfnXY9sIJXZgf8AP/4VDnaFtV7n2O0yYLLz9ujurMptpJVtUQNiykdQPSGfDNQEzark+oCNapzpPIBqKtWfqTW08S+0fqC83N+26GkqtVpbJQJqUj4RJH5wJ/q0+QHPzI6VHarvxaiwRqFdy1mzF9f4cXZKW8ee71cfsroRx2zagsstlYHUaD/37q8vuf8Ah+vMu4L67u0sFcQkiTttuI8tSPdUlWLhHru+OIPxOu3sE83p57oAexPNR+qps0Twa09pWS1c56vja5o5pdeThto+aEeftOTUU8GOP95maliaT1xKTMblrDMW5LAS4hw8kocxyUCeQV1BIznPKT+Peqr/AKP4UIu+nLgqDMM9lkupQlfoKCsjCgR4Cp32nRd2qrpBhKdwN/79cVTsdkP1LlWsc8Ap1ZHKon7pnqIHxBIqUeVfFAFJCsEHwNU20T2h9YQNViZrG+yLla2o7yjDbjtILzm38GnclIx6WOfQVr2peO3ErUV1XJb1DItEfP4OJbVd0lseAKvWUfaT9AqgVxZZhsLAMztpPnvXpTfZVllXBZUpASADzSY1nQaST36RrvUU8arTE01xm1Pp+ChKGI9ycLLYTgNoVhaUj2ALq7PZUnyZ3ZY078KJJYXIjtk/mIeWE/s5fRVWoEvSOr9ctz+L7NxujKm9q7hFeLcn0B6AWU/1iTjbz9IZHpYGKz104yapEGPY9GvHSWnYSO6hWy2EJU22Om9z1lKPUnIGSffVldca2LlmggHmnbrp69q53F9jObt8o62opDcSFyeUgnQARMiNRGnfBE3vrEap07D1Zoy5acuClojzmFMqWj1kZ6KHtBAP0VUPh1x81pYdWQ2dR3qReLM86luSiYQtxpJON6F9cjOcEkEZ99Wr4iXSdZ+Euorva5JjzI1veeYeSAShQSSCAQQaws8tb39utaQYA1B8vnW7L8KZDA37DK1DmWRyKExMjwkEEjpVdrV2VdSnVjbd6vlsNmQ4C49GKy86jPqhBThJI5ZJOPbVr220MspabSEoQAlIHgB0rz+kcT+Il1mNpna1va0qcTlCJKmkn0h4IwKu3r+6T7Lwjv8Ad7ZILEyLbnXmXQAooWlGQcHIPPzqs4fuLMIeVbIIAgmTJO/wrpOPcfmFPWbWSfStS5SnlEAGUgk6azInTpoK2ilUisnH3iQnU9uVeNWum3CU0ZQERk5Z3jf0Rn1c9OddrXnaH1rqS8PN6dnvWC1JUQy3GwH3E+Clr5kE+ScAe3rWz7WWf0ZXBnu0n47VH/RVl/SEs8yIIkqkwPD8IJJ8B5kVdOlUi0Px913pvUUdy9XmVe7UpYEmNMUHF7CeakLPMKHUDOD0rO8SO0dqS9Xd6BomWuz2ltRSiSlAEiT/AM2SPQHkBz8z4DJPFVmWS4Znu6//ACsHOy7LpuxbJKSkieeTyjwOkz4R84uBSqH6f44cS7Dd25h1NMubSVAuRLgvvm3R4pyeafeCKu3pu/Q9TaRtuoIORHnR0SEJPVO4Z2n2g5H0VNxeaYyPMGwQR0NUnE/Bt7w/yKfIUhWKZ37jIHqrK1C3ah+Q5v5zY/cuppqFu1D8hzfzmx+5dbsx+xO+RqNwd/jdp/Gn41U7R/yiWD5yjfapq+2vr29pzhdf75HOH4kF11o+S9pCT9ZFUJ0f8olg+co32qav5rSxK1Nw7vWn0EBydDdYQT0Cyk7SfpxXMcKhRtn+Tfp5wa9J7US0MlYl/8ABrPlzJn3V53sLZ+HtuT+9dZ7wKf2qwtac5VgnxIzz8zVloXan03a7WxbbRoGSzEjoDbLLcxtKUJHIAAJNVxYcn2DUjTy2O5n2+SFKZfRnY42vJSpJ9owRVv9M8eeE10srUi6Ox7FN2jvosiISEq8dq0pIUPLofYKq8A4pBWlL4aV4gGfWfhXUcdsNuoZW5YquUCfwLUImNwkGZ6Hp69at6+1HD1nxBm6ktlhVaW5e1a4yVd5+EAwpeQkD0sZPLrnzqzTaZaewepM5DiHhYFDa4CCE89vI/8ALtroas7TOkrcwqJoi1uXecr0G33mixHSTyB5gLV7gB76kTiz333vmpvhGC78Vr37RgbsDP7au7G0aQbl1D30iikzAgaye+OnSuMzeVunk421fsywgOJ5eZXMohMCIIBG431NUPhfjaN+vR/EKuX2lb3JtHA92LGcKFXKW3CWR17shS1D6QjHuJqmkL8bRv16P4hV1e0PpmXqTglLVAaU7Itr6J4bSMqUhIUlePclRP0VVYILNjdhveB8DXTcbqZTm8Sp/wDDzK323RHviqg6LvFksGuYF61Dal3SDEWXTDSpKQ4sD0M7uRAVgkeOKsC92sbQ8wtj7hJT7S0lKkOTUbVA8iCNhyPZUDcPtWp0TxAg6hcgtz47W5t+MsA942oYVjPLcORHtHtq2kPjlwYctaZnxzGiqKcmO7BWl1J8toQcn3EivuBcUGVJRcpbM6gga+sn3U46t213Tbj2OXcCIBStQA1OnKkGD49fVVN/TlaqMiz29+OlyZ3kWO2CstAuZQgEDmRyGfZVte07uPAlrf63xlHz78Lrgt3aBtup+KFl0loyyrUxMlBD8+Yju8NgFSu7bHPOE9VEY8q7Xah+Q1v5zj/uXU+2tGWLC6Uy7zgjXSBI7vbVFkcrd32dxaLu2+hKVSAVcxIJA10Efh661VjQGnmNV8T7Hp2UtSY8yUlt4oOFbACpQB8CQkjPtq0PGrhtoi3cBbnMtWm7fb5NsbQ7GfjMhCx6aUkKUOagQTnOfPrVeeCX9oHS/wD1Svsl1bHjp/Z41P8A9Mn7RFR8DbNLxtwtSQTr7kzU7jfIXLPEePZbcITKDAMDVcGe+QIqjVsgquV8h21C9ipUhuOFeRWsJz+2rqan4Q8P4PBi62yJpuE2uLAdcamd0PhAcQ2VBZc9YnIyeeD06VTjSfyg2L5yjfbJr0A1l8nF/wDm6T9kqnC9u04w+paQTtr5GnaXkLm3vbFtlwpEk6GNZTvXnKTlonzTn9lX34gqKuzbflKOSbE4ST4/gqoQP6j/ALP8qvtxA/s1335iX9jWvhn9Vdfw/I1J7Sv2vGf9Q/FFUQj/AO/NfrE/xCr98VPkJ1V80v8A2Zqgkf8A35r9Yn+IVfvip8hOqvml/wCzNZcMfs915D4KrR2lf4hjP4z/AFN1QJDanX0tIxuWoJGfMnAq8ieC+gIHC57T6tOwXXBEUFzltAyFOhH9Z3nUHPMYOB0xiqQQvxrG/Xo/iFekVy/E8v8AUr/hNZcJ2zTqXlOJB2GvjNYdqmRubVdmhhwpBKiYMajlj2Sa81BySCfLJq7HDDhFoiLwitZumnbfcplyhtyJUiUyHFkuJCtqSeaQAQBjHTPWqTn+rP8A+f8AKvRXQ3yX6b+a4v2Sa18IsNuvOFaQYHXxqV2sX1xbWluhhZTzKMwYmAI2868/tQwGbVrG62uOVFmJNejtlRybdqQAQRkGvtKys8db2Ui3TE76k7eda8xxDkMwUG/c5+SY0AiYnYDuFQDr7sx2e+3R666QuSLK+8orXCdbK45UepTjmj3DI8gKj5HZW1+ZGxd508hvPrh10/s7urf0qvf4csXl85RBPcYq+se0TOWbIZS6FAbcwBI9e59c1CfC/s9QtCaojanuV+duNyjpWGm2Wg0ygqSUknOVKOCcdPdW8cT9AJ4kaITp1V0VbgJLcnvgz3vqg8sZHXPXNbpWscQLvc9P6ElX21vNNuQlNvuIdQFB1sLAWjn0JB5Hzqxt8Xdoba9EbTCVbjXWfHeudyXFV+q5+t7hwlxsSDA0CZOgiNNelRdors2taO1/a9TJ1e5MMB0u9wYQRvylScbt5x63lUra50sNacPbnpczTCE5sN/CA33mzCgrO3Iz086zbEyPItjU9txPwdxsPJWTgbSM5+qtc0LrBesrRcLkYSYrDE1yMyd5V3iEgELOQME56V9t8UwwytppEIO+p66d81hkOLLy9vmLi6e5nhqgwNknm6CNCetQ9auyszbNQQbmNbOOmLJbkd38AA3bFhWM7+WcYqfbzbvjbTk+1F3uvhcZyP3m3ds3pKc48cZrtPSI8aKqTIfbaZQNynHFBKUjzJPIV+t6O67zenZjduzyx55rG1xtvaJUllMBW+p+db8pxHf5VxDl47zKRtokR7AO7rVafvR2e72/d270xn4uH/sqeb/pkXzhtO0mZhYEqCqF8ICN23KNu7bnn54zWt6ru85V8sh03q4qauFyZhuRY4ZdQEjK3Fb8FQO1PTPjW/PyGIsZUiS+2yygZU44oJSke0nkK+sYa2tEkNJjn31Pz+VarvjXI5h0G6d5iyZSYQBJgyOUa7Deq4N9ktlt5Dn3dOnaoKx8XDng5/vKnrVNgGptC3TThlGMJ8RcXvwjfs3JxuxkZ92ayEe5W6WptMWfGeLiStAbdSrckHBIweYB8a7VYW2KtrVKkNIgK31PzNSMhxTkcqtp66e5y2ZSYSIOh6ATsN6rYz2TGWZTb33cunYtK8fF454Of7z2VY6Sz8IhusbtveIKM4zjIxXxiXFlBz4NJae7tZQvu1hW1Q6g46H2VxzLjb7eEGfOjRQs4SX3Uo3HyGTzrKzxlvZ8yWERO+5+NasxxLfZbdcv3ebkmDCRExOwHcN6rl96Oztx93bvTH4uH/sqw9jtnxNpe22cPd98CitRu9Kdu/YkJzjwzjpXcekMR4ypL7zbTKRuU4tQSkDzJPKuCPc7bLLYi3CK+XQVNht1Kt4HUjB54r5Z4u2syVW6InfUn4ms8xxTkMuEN373Ny6gQkb6dAKgG89llm76luF2OtXGTMlOSe7EAK2b1lWM7+eM9ambQelRojh5bNLJnGaIKFI+EFvu9+5alerk49bHXwrOOTYbM1mG9KYbkP5LTKlgLcxzO0dTj2Vz18tcXbWrhdZRCj4n5msslxRkcowm1u3eZCCIEJEECBsAdj1pSlKn1RUpSlKUpSlKUpSlKUpSlKUpSlKUrS+IAbuLmn9LOJ3t3W5JD7fgplpJdWP/ABSPprdK6Uq026bdYVylRUOS4JWYzpJBb3jCsY8xyrY2oJVzH++6ot6wp9ktJ6xPlI5h6xIqPbNZ9ZfFCOH9wglm0xHC27eO+H+1QwcpaQkcwsjCFE9Eg+JFYaBLXA7MV9uTG1tdwkS9mOQT3sgtD3AA1NGARisFbtI2K36Rc00iIZFscLhVHkqLoIWoqI5+GTy8q3i5B/EOoP51TuYVaTDS5+4tIJ3EwEjQbDXx860DiHKaY4dtaTtjqFW+EYca5yM5S22VoSG8/nH1j5JHP1hWS1BqO033XFj0ixJbXZ1LddmvIUAw/wB0jcI+/ooAlJWBywAD4it4jaescOwGxx7TDRbiClUXugW1Z65B6+81wTtJ6ZuUCJBnWKA9Ghq3x2VMjY0f+UDkB7Ohol9GgIOk+/rX1zF3JKlJUn7wQCNYhJJ5Qe4gwTGuukHSNWpNll8drPeGYduttpZgSX48rYln4SEYQXVHkNnpHb7AT0IrIp1PadR8RJki97WLDZ4CZcVuaMJkKcUR8I2HqMJwgEZ9LIGSK325aZ0/eJEN+6WeHLXDOY5eaCu76dB0xyHL2V9l6bsM6/Rr1MtMR+4RhtZkONhSkDORj3Hp5eFfS+gxIO0VinFXKCoJUmCvmIjfQDXuAIkDrAkiou0xc7PYuLGo7teIsOxqegR3IsJDYQ4ULUTtCE81OnCdwSOpx4V+mHdQ33jNc4DiXreubbWEupbVhUKLvUogkcu+UMDI9UrOM7c1LTlut7txbuDsGMuW0naiQppJcQPIKxkCvyzbIDF2k3NmK2iXJQhDzwHpLSjO0H3ZNDcpkqjWI+FEYR0JS2XPuhZVoIJBmZ8dYEQANd4iPLI/Y9GcSdXxGm2YMJMaC61FZGC4opUnCE9VKUcDlzJNcuimbRqvRl1v+pmY8iTOekMzRKx/sjSVFIYyfUCUgHljmSa3l6x2eRfGby/bIjlwZRsalLaBcQPIK6jqfrrRVad07N46SWFWSKAmGJUhKxuQ+4VDaso5AKHPJOc8uhGT9DiVg7gwNfL86wcs3bVSBCVI5lAJ2H3yTOxH3RIiNp11ius3fLJdtephT0txdM2S1plxW5XJuQSrYl7afWSlKSEZ893iKxmnrlZrNxkvN7u8WFYm3rW07Ejd0G3FIW4eqBzU6raklIGeYHUVKM7TVguV5i3afaIkmbFGGH3WwpTfPPL3HmPLwrtu223v3Bqe9BjOSmRhp9bSStA8kqIyK+ekIiIOoj+/Otn1RcFYWpaZSrmGm+ka7RyjQAHpqZ2ie53ZyBxZtOrLrBbkPyGjBZtQx8It4WfwC1nO1CnCVBWSMbgBnBqQ2LPdpiFSrteJceQ4rIjwHdrTKcckAkZUfEqOMknkBgVwt6ItCL27cFPTHUOzfjAxHHAWvhGMBzpuOMAgEkA9B0rZawdeBA5elSLDHuNqcLx0JmJ67EmN5jyHQDSv/9k='
    // Carregar jsPDF via CDN (injectar script se necessário)
    function _runPDF(){
      var jsPDF=window.jspdf?.jsPDF||window.jsPDF;
      if(!jsPDF){
        var s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload=function(){_runPDF();};
        document.head.appendChild(s);
        return;
      }
      var doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      var W=210;var M=18;var Y=0;
      // CABEÇALHO — Logo
      try{doc.addImage(LOGO,'JPEG',M,5,50,36);}catch(e){}
      // Título empresa
      doc.setFont('helvetica','bold');
      doc.setFontSize(13);
      doc.setTextColor(255,69,0);
      doc.text('TELEMIM MUDANÇAS',W/2,14,{align:'center'});
      doc.setFontSize(8);
      doc.setTextColor(80,80,80);
      doc.text('G. DE SOUZA ADMINISTRAÇÃO DE OBRAS LTDA',W/2,19,{align:'center'});
      doc.text('CNPJ: 04.130.817/0001-35',W/2,23,{align:'center'});
      // Linha divisória
      doc.setDrawColor(220,220,220);
      doc.line(M,32,W-M,32);
      Y=38;
      // Dados da OS
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.setTextColor(60,60,60);
      doc.text('Cliente: '+(m.nome||''),M,Y); Y+=6;
      doc.text('Selo: '+(m.selo||''),M,Y);
      doc.text('Data: '+(m.data||''),W/2,Y,{align:'left'});
      Y+=6;
      doc.text('Origem: '+(m.origem||''),M,Y); Y+=6;
      doc.text('Destino: '+(m.destino||''),M,Y); Y+=8;
      // Título centralizado
      doc.setFont('helvetica','bold');
      doc.setFontSize(11);
      doc.setTextColor(30,30,30);
      doc.text('DECLARAÇÃO DE RECEBIMENTO E VISTORIA',W/2,Y,{align:'center'});
      Y+=8;
      // Corpo do texto legal
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.setTextColor(40,40,40);
      var lw=W-M*2;
      var L1='O CONTRATANTE acima qualificado declara, para todos os fins de direito, que nesta data recebeu todos os seus móveis, caixas, pertences e volumes transportados pela empresa G DE SOUZA ADMINISTRAÇÃO DE OBRAS LTDA no endereço de destino.';
      var linhas1=doc.splitTextToSize(L1,lw);
      doc.text(linhas1,M,Y); Y+=linhas1.length*4.5+4;
      doc.text('Declara ainda, de forma livre e expressa, que:',M,Y); Y+=6;
      var items=['Acompanhou e/ou conferiu o descarregamento de todos os itens no ato da entrega.','Todos os pertences chegaram ao destino em sua totalidade, sem nenhuma avaria, quebra, perda ou dano decorrente do processo de transporte ou manuseio por parte da equipe da empresa prestadora.','O serviço de mudança ocorreu sem nenhuma interferência negativa, estando os bens nas mesmas condições em que se encontravam na origem.','Diante da vistoria realizada e aprovação no ato da entrega, isenta a empresa prestadora de qualquer responsabilidade ou cobrança por reclamações posteriores referentes a danos físicos, estéticos ou falta de objetos, dando-lhe plena, rasa e irrevogável quitação pelos serviços de mudança prestados.'];
      items.forEach(function(it){
        var ls=doc.splitTextToSize('• '+it,lw-4);
        doc.text(ls,M+4,Y); Y+=ls.length*4.5+2;
      });
      Y+=4;
      // Ressalvas
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.text('RESSALVAS / OBSERVAÇÕES DO CLIENTE:',M,Y); Y+=5;
      doc.setFont('helvetica','normal');
      var obsText=obs&&obs.trim()?obs.trim():'Nenhuma ressalva.';
      var lobs=doc.splitTextToSize(obsText,lw);
      doc.text(lobs,M,Y); Y+=lobs.length*4.5+8;
      // Data por extenso
      var meses=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      var hoje=new Date();
      var dtExt='Recife, '+hoje.getDate()+' de '+meses[hoje.getMonth()]+' de '+hoje.getFullYear()+'.';
      doc.text(dtExt,M,Y); Y+=6;
      doc.text('Nome legível: '+(m.nome||''),M,Y); Y+=10;
      // Assinatura
      if(assinaturaB64){
        try{
          var imgH=28;var imgW=70;
          if(Y+imgH>270){doc.addPage();Y=20;}
          doc.addImage(assinaturaB64,'PNG',M,Y,imgW,imgH);
          doc.setDrawColor(150,150,150);
          doc.line(M,Y+imgH+2,M+imgW,Y+imgH+2);
          doc.setFontSize(8);
          doc.setTextColor(100,100,100);
          doc.text('Assinatura do Cliente',M,Y+imgH+6);
        }catch(e){}
      }
      // Rodapé
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(120,120,120);
      var rodape='G. DE SOUZA ADMINISTRAÇÃO DE OBRAS LTDA | Rua Floriano Peixoto, 85 - Sala: 423 - Anexo: 2 - Santo Antônio - Recife - PE | Fone: 81. 99244.0900 - falejr@gmail.com - CNPJ: 04.130.817/00001-35';
      var lrod=doc.splitTextToSize(rodape,lw);
      doc.text(lrod,W/2,285,{align:'center'});
      // Salvar
      var nomeArq='Recibo_'+(m.nome||'').split(' ').join('_')+'_'+(m.data||'').split('/').join('-')+'.pdf';
      doc.save(nomeArq);
    }
    _runPDF();
    // Drive Backup: chamar handleFinalizeOS com o PDF gerado
    try{
      var _driveB64=doc.output("datauristring").split(",")[1];
      handleFinalizeOS(m,_driveB64);
    }catch(e){console.warn("[Drive] Erro ao obter PDF base64:",e);}
    // WhatsApp: envio automático após assinar canhoto
    if(cfgWA&&cfgWA.whatsapp_ativo==="true"){
      try{
        var _pdfB64=doc.output("datauristring").split(",")[1];
        var _adminTel=(cfgWA.admin_whatsapp||"").replace(/\D/g,"");
        var _clienteTel=(m.contato||"").replace(/\D/g,"");
        var _supTel=(cfgWA.supervisor_whatsapp||"").replace(/\D/g,"");
        var _msg="\uD83D\uDCCB *OS #"+m.id+" - Canhoto Assinado*\n\n\uD83D\uDC64 Cliente: "+m.nome+"\n\uD83D\uDCC5 Data: "+(m.data||"")+"\n\uD83D\uDCCD Destino: "+(m.destino||"-")+"\n\n\u2705 O canhoto electrónico foi assinado. O PDF já foi guardado. Partilhe o ficheiro em anexo.";
        // Tentar Edge Function primeiro (se ZAPI configurado no servidor)
        var _wp={osId:m.id,clienteNome:m.nome||"",clienteTelefone:_clienteTel,adminWhatsapp:_adminTel,supervisorWhatsapp:_supTel,pdfBase64:_pdfB64,data:m.data||""};
        fetch(SUPA_URL+"/functions/v1/enviar-whatsapp",{
          method:"POST",
          headers:{...getH(),"Content-Type":"application/json"},
          body:JSON.stringify(_wp)
        }).then(function(r){return r.json();}).then(function(res){
          if(res&&res.enviados>0){
            console.log("[WA] "+res.enviados+" enviados via API");
            setSyncStatus("📲 WhatsApp enviado! ("+res.enviados+" destinos)");
          } else {
            // Fallback: abrir wa.me para o Admin automaticamente
            console.warn("[WA] API sem envios — fallback wa.me",JSON.stringify(res));
            if(_adminTel){
              var _msgEnc=encodeURIComponent(_msg.replace(/\\n/g,"\n"));
              setTimeout(function(){window.open("https://wa.me/55"+_adminTel+"?text="+_msgEnc,"_blank");},500);
              setSyncStatus("📲 WhatsApp aberto para Admin! Envie o PDF em anexo.");
            }
          }
        }).catch(function(e){
          console.warn("[WA] Edge Function indisponível — fallback wa.me:",e);
          if(_adminTel){
            var _msgEnc2=encodeURIComponent(_msg.replace(/\\n/g,"\n"));
            setTimeout(function(){window.open("https://wa.me/55"+_adminTel+"?text="+_msgEnc2,"_blank");},500);
            setSyncStatus("📲 WhatsApp aberto para Admin!");
          }
        });
      }catch(e){console.warn("[WA] erro:",e);}
    }
  }

  // ── PDF MUDANÇA INDIVIDUAL ─────────────────────────────────────────────────
  function gerarPDFAgendamento(a,btn){gerarPDFCardIndividual(a,btn);}

  function compartilharWhatsApp(a,tipo="agendamento"){
    {isMotorista&&<div style={{display:'flex',gap:0,marginBottom:16,background:'#f1f5f9',borderRadius:10,padding:3}}><button onClick={()=>setAbaMotorista('hoje')} style={{flex:1,padding:'8px 0',borderRadius:8,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',background:abaMotorista==='hoje'?'#fff':'transparent',color:abaMotorista==='hoje'?'#E87E22':'#64748b',boxShadow:abaMotorista==='hoje'?'0 1px 4px rgba(0,0,0,.1)':'none'}}>{String.fromCodePoint(0x1F69B)} Hoje</button><button onClick={()=>setAbaMotorista('registros')} style={{flex:1,padding:'8px 0',borderRadius:8,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',background:abaMotorista==='registros'?'#fff':'transparent',color:abaMotorista==='registros'?'#E87E22':'#64748b',boxShadow:abaMotorista==='registros'?'0 1px 4px rgba(0,0,0,.1)':'none'}}>{String.fromCodePoint(0x1F4CB)} Registros</button></div>}
    const veiculos=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"—";
    const texto=`🚛 *TELEMIM — ${tipo==="hoje"?"MUDANÇA HOJE":"MUDANÇA AGENDADA"}*\n━━━━━━━━━━━━━━━━━\n👤 *Beneficiário:* ${a.nome}\n🏷️ *Selo:* ${a.selo||"—"}\n📅 *Data:* ${fmtDate(a.data)}${a.horario?` ⏰ ${a.horario}`:""}\n📍 *Comunidade:* ${a.comunidade||"—"}\n📦 *Saída:* ${a.origem||"—"}\n🏠 *Chegada:* ${a.destino||"—"}\n🚗 *Veículos:* ${veiculos}${a.contato?`\n📞 *Contato:* ${a.contato}`:""}\n━━━━━━━━━━━━━━━━━\n✅ *Status:* ${a.status==="confirmado"?"Confirmado":a.status==="pendente"?"Pendente":"Realizado"}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`,"_blank");
  }
  function compartilharMudanca(m){
    const texto=`🚛 *TELEMIM — MUDANÇA REALIZADA*\n━━━━━━━━━━━━━━━━━\n👤 *Beneficiário:* ${m.nome}\n🏷️ *Selo:* ${m.selo||"—"}\n📅 *Data:* ${fmtDate(m.data)}\n📍 *Comunidade:* ${m.comunidade||"—"}\n📦 *Saída:* ${m.origem||"—"}\n🏠 *Chegada:* ${m.destino||"—"}\n📐 *Medição:* ${m.medicao} m³\n🚐 *Van:* ${m.van?"Sim":"Não"}\n━━━━━━━━━━━━━━━━━\n_Gerado pelo TELEMIM_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`,"_blank");
  }
  function compartilharRelatorio(r,periodo){
    const nMud=r.lista?.length||mudancas.length;
    const texto=`📊 *TELEMIM — RELATÓRIO FINANCEIRO*\n━━━━━━━━━━━━━━━━━\n📅 *Período:* ${periodo}\n📦 *Mudanças:* ${nMud}\n📐 *Total m³:* ${r.m3} m³\n🚐 *Dias com Van:* ${r.vd}\n\n💵 *FATURAMENTO*\n📐 Medição (${r.m3} m³ × R$150): R$ ${r.fatM.toLocaleString("pt-BR",{minimumFractionDigits:2})}\n🚐 Van (${r.vd} dia${r.vd!==1?"s":""} × R$1.000): R$ ${r.fatV.toLocaleString("pt-BR",{minimumFractionDigits:2})}\n*Faturamento Bruto: R$ ${r.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}*\n\n🏛️ *IMPOSTO (16%)*\nDedução: - R$ ${r.imp.toLocaleString("pt-BR",{minimumFractionDigits:2})}\n\n🔧 *DISCRIMINAÇÃO DOS CUSTOS*\n${r.vd>0?`🚐 Van (${r.vd} dia${r.vd!==1?"s":""} × R$400): - R$ ${r.cV.toLocaleString("pt-BR",{minimumFractionDigits:2})}\n`:""}🚚 Caminhão (${nMud} × R$350): - R$ ${r.cC.toLocaleString("pt-BR",{minimumFractionDigits:2})}\n👷 Ajudantes (${r.nAj} × R$80): - R$ ${r.cA.toLocaleString("pt-BR",{minimumFractionDigits:2})}${r.cAlm>0?`\n🍽️ Almoço: - R$ ${r.cAlm.toLocaleString("pt-BR",{minimumFractionDigits:2})}`:""}\n*Total de Custos: - R$ ${r.custos.toLocaleString("pt-BR",{minimumFractionDigits:2})}*\n\n━━━━━━━━━━━━━━━━━\n💰 *LUCRO LÍQUIDO: R$ ${r.liq.toLocaleString("pt-BR",{minimumFractionDigits:2})}*\n📈 *Margem: ${r.marg.toFixed(1)}%*\n━━━━━━━━━━━━━━━━━\n_Gerado pelo TELEMIM_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`,"_blank");
  }

  // ── COMPUTED ───────────────────────────────────────────────────────────────
  // Merge: mudancas + agenda items (concluídas OU em andamento) que não estão em mudancas
  // Usado para Registros, Contas e Financeiro
  var _allForFiltered=(function(){
    var _list=[].concat(mudancas);
    var _seenKeys={};
    _list.forEach(function(m){if(m.nome&&m.data)_seenKeys[(m.nome||"").toLowerCase().trim()+"|"+m.data]=true;});
    // Enrich mudancas with ajudantes from agenda when mudança has 0
    _list.forEach(function(m,idx){
      if((parseInt(m.ajudantes)||0)===0&&m.nome&&m.data){
        var _agMatch=(agenda||[]).find(function(ag){return !ag.deleted_at&&ag.data===m.data&&(ag.nome||"").toLowerCase().trim()===(m.nome||"").toLowerCase().trim()&&(parseInt(ag.ajudantes)||0)>0;});
        if(_agMatch)_list[idx]=Object.assign({},m,{ajudantes:parseInt(_agMatch.ajudantes)});
      }
    });
    var _conclStatuses=["concluida","concluido","realizada","realizado","Concluído","Concluido"];
    (agenda||[]).forEach(function(a){
      if(a.deleted_at||!a.data) return;
      var _done=_conclStatuses.indexOf(a.status)>=0||a.termino_em||a.chegada_van_em||a.chegada_caminhao_em||a.termino_van_em||a.termino_caminhao_em;
      var _active=a.inicio_van_em||a.van_saiu_em||a.inicio_caminhao_em||a.caminhao_saiu_em||a.chegou_origem_van_em||a.chegou_origem_cam_em||a.saiu_destino_van_em||a.saiu_destino_cam_em||a.status==="Realizando"||a.inicio_mudanca_em;
      if(!_done&&!_active) return;
      var key=(a.nome||"").toLowerCase().trim()+"|"+a.data;
      if(_seenKeys[key]) return;
      _seenKeys[key]=true;
      _list.push(Object.assign({},a,{_fromAgenda:true,status:_done?"Concluído":(a.status||"confirmado"),termino_em:a.termino_em||a.termino_van_em||a.termino_caminhao_em||null,criado_em:a.criado_em||a.termino_em||null}));
    });
    return _list;
  })();
  const semanas=(()=>{
    const map={};
    mudancas.forEach(m=>{
      const w=getWeek(m.data)+"-"+m.data.slice(0,4);
      if(!map[w]) map[w]={key:w,label:weekRange(m.data),items:[]};
      map[w].items.push(m);
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key));
  })();

  const totalM3=_allForFiltered.filter(m=>!m.deleted_at).reduce((s,m)=>s+(parseFloat(m.medicao)||0),0);
  const comunidades=[...new Set(mudancas.map(m=>m.comunidade).filter(Boolean))];
  var _hjFilt=new Date();_hjFilt.setHours(0,0,0,0);
  var _am14Filt=new Date(_hjFilt);_am14Filt.setDate(_am14Filt.getDate()-14);
  const filtered=[...(_allForFiltered)].filter(function(mx){if(mx.deleted_at)return false;
    if(isMotorista){var _dMx=new Date(mx.data+"T12:00:00");_dMx.setHours(0,0,0,0);return _dMx>=_am14Filt;}

    var tx=search.toLowerCase();
    var okS=!search||(mx.nome||"").toLowerCase().includes(tx)||(mx.selo||"").toLowerCase().includes(tx)||(mx.comunidade||"").toLowerCase().includes(tx);
    var dtOk=(function(){if(filtroMes==="semana"){var hj2=new Date();var dw=hj2.getDay();var _dif=dw===0?6:dw-1;var s0=new Date(hj2.getFullYear(),hj2.getMonth(),hj2.getDate()-_dif);var _pad=function(n){return String(n).padStart(2,"0");};var dias7=Array.from({length:7},function(_,ii){var d=new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()+ii);return d.getFullYear()+"-"+_pad(d.getMonth()+1)+"-"+_pad(d.getDate());});return dias7.includes(mx.data);}if(filtroMes==="mes_atual"){return mx.data&&mx.data.slice(0,7)===new Date().toISOString().slice(0,7);}if(filtroDataIni&&filtroDataFim){return mx.data>=filtroDataIni&&mx.data<=filtroDataFim;}if(filtroDataIni){return mx.data>=filtroDataIni;}if(filtroDataFim){return mx.data<=filtroDataFim;}return true;})();var supOk=!filtroSup||mx.supervisor_id===filtroSup;return okS&&dtOk&&supOk;
  }).sort((a,b)=>(b.data||"").localeCompare(a.data||""));

  var _d0=new Date();_d0.setDate(1);
  var _d1=new Date();_d1.setDate(1);_d1.setMonth(_d1.getMonth()-1);
  var _d2=new Date();_d2.setDate(1);_d2.setMonth(_d2.getMonth()-2);
  var _nms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var _m0={v:_d0.toISOString().slice(0,7),l:_nms[_d0.getMonth()]+'/'+String(_d0.getFullYear()).slice(2)};
  var _m1={v:_d1.toISOString().slice(0,7),l:_nms[_d1.getMonth()]+'/'+String(_d1.getFullYear()).slice(2)};
  var _m2={v:_d2.toISOString().slice(0,7),l:_nms[_d2.getMonth()]+'/'+String(_d2.getFullYear()).slice(2)};
  const agendaOrdenada=[...agenda].filter(a=>a.status!=='concluida'&&a.status!=='cancelada'&&!a.deleted_at&&!_agendaRemovidaIds.has(a.id)).sort((a,b)=>a.data.localeCompare(b.data)||(a.horario||"").localeCompare(b.horario||""));
  const hoje=(function(){var _d=new Date();var _y=_d.getFullYear();var _m=String(_d.getMonth()+1).padStart(2,"0");var _dd=String(_d.getDate()).padStart(2,"0");return _y+"-"+_m+"-"+_dd;})();
  const amanha=(function(){
    var _d=new Date();
    var _a=new Date(_d.getFullYear(),_d.getMonth(),_d.getDate()+1);
    var _y=_a.getFullYear();
    var _m=String(_a.getMonth()+1).padStart(2,"0");
    var _dd=String(_a.getDate()).padStart(2,"0");
    return _y+"-"+_m+"-"+_dd;
  })();
  const proximas=agendaOrdenada.filter(a=>a.data>=hoje);
  const passadas=agendaOrdenada.filter(a=>a.data<hoje);
  const _statusRealizados=["realizado","realizada","realizado","executado","executada","concluido","concluida","Realizado","Realizada"];
  // Excluir também itens que já existem em mudancas (foram sincronizados como realizados)
  const _jaEmMudancas=function(a){return mudancas.some(function(m){return m.data===a.data&&(m.nome||"").toLowerCase().trim()===(a.nome||"").toLowerCase().trim();});};
  const mudancasHoje=agendaOrdenada.filter(a=>a.data===hoje&&!_jaEmMudancas(a));
  const mudancasAmanha=agendaOrdenada.filter(a=>a.data===amanha&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a));
  const mudancasFuturas=isMotorista?agendaOrdenada.filter(a=>a.data>amanha&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a)):[];
  const _mesAtual=new Date().getMonth();
  const _anoAtual=new Date().getFullYear();
  const _mesesNome=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const _realizadasMes=isMotorista?(function(){var _hj2=new Date();var _dw2=_hj2.getDay();var _dif2=_dw2===0?6:_dw2-1;var _s0w=new Date(_hj2.getFullYear(),_hj2.getMonth(),_hj2.getDate()-_dif2);var _s1w=new Date(_s0w.getFullYear(),_s0w.getMonth(),_s0w.getDate()+6);var _pad2=function(n){return String(n).padStart(2,"0");};var _siW=_s0w.getFullYear()+"-"+_pad2(_s0w.getMonth()+1)+"-"+_pad2(_s0w.getDate());var _sfW=_s1w.getFullYear()+"-"+_pad2(_s1w.getMonth()+1)+"-"+_pad2(_s1w.getDate());return new Set((_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data>=_siW&&m.data<=_sfW;}).map(function(m){return m.data;})).size;})():(_allForFiltered||[]).filter(function(m){var d=new Date(m.data+"T12:00:00");return !m.deleted_at&&d.getMonth()===_mesAtual&&d.getFullYear()===_anoAtual;}).length;
  const _pendentesMes=agenda.filter(a=>{const d=new Date(a.data+"T12:00:00");const hoje=new Date();hoje.setHours(0,0,0,0);return !a.deleted_at&&d>=hoje&&(a.status==="confirmado"||a.status==="pendente");}).length;
  const _mudHoje=agendaOrdenada.filter(a=>a.data===hoje&&a.status!=="realizado");

  const statusColor={confirmado:COLORS.green,pendente:COLORS.accent,realizado:COLORS.muted};
  const statusLabel={confirmado:"✅ Confirmado",pendente:"⏳ Pendente",realizado:"✔ Realizado"};

  const TABS=isMotorista?[
    {id:"dashboard",label:"🚚 Minha Operação"},
    {id:"registros_mot",label:"📋 Meus Registros"},
    {id:"fin_mot",label:"💰 Financeiro"},
  ]:isSupervisor?[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"lista",label:"📋 Registros"},
    {id:"equipe",label:"👷 Equipe"},
    {id:"config",label:"⚙️ Config"},
  ]:[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"monitoramento",label:"📡 Monitor"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"lista",label:"📋 Registros"},
    {id:"importar_mud",label:"+ Mudanças"},
    ...(isAdmin?[{id:"contas",label:"💸 Contas"},{id:"financeiro",label:"💰 Financeiro"},{id:"config",label:"⚙️ Config"}]:[]),
  ];

  // ── BTN STYLES ─────────────────────────────────────────────────────────────
  const btnGreen={background:"#dcfce7",border:"none",color:COLORS.green,borderRadius:8,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700};
  const btnBlue={background:"#eff6ff",border:"none",color:COLORS.blue,borderRadius:8,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700};
  const btnRed={background:"#fef2f2",border:"none",color:COLORS.red,borderRadius:8,padding:"5px 8px",cursor:"pointer",fontSize:12};

  // ── TAG HELPERS ────────────────────────────────────────────────────────────
  const TagSelo=({v})=><span style={{background:"#f1f5f9",borderRadius:8,padding:"3px 9px",fontSize:11,color:COLORS.muted,fontWeight:600}}>🏷️ {v||"—"}</span>;
  const TagData=({v})=><span style={{background:"#eff6ff",borderRadius:8,padding:"6px 16px",fontSize:20,color:COLORS.blue,fontWeight:700}}>📅 {fmtDate(v)}</span>;
  const TagHora=({v})=>v?<span style={{background:"#f0fdf4",borderRadius:8,padding:"3px 9px",fontSize:11,color:COLORS.green,fontWeight:700}}>⏰ {v}h</span>:null;
  const TagCom=({v})=>v?<span style={{background:"#fff7ed",borderRadius:8,padding:"3px 9px",fontSize:11,color:COLORS.accent,fontWeight:600}}>📍 {v}</span>:null;

    var _mlParam=(function(){try{var u=new URL(window.location.href);return u.searchParams.get("ml")||null;}catch(e){return null;}})();
    if(_mlParam) return <RotaTerceirizada token={_mlParam}/>;

    if(bioLock) return(
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:0,padding:32}}>
      <div style={{width:90,height:90,borderRadius:'50%',background:'rgba(255,255,255,0.08)',backdropFilter:'blur(10px)',border:'1.5px solid rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:24,boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
        <span style={{fontSize:40}}>🔒</span>
      </div>
      <div style={{fontSize:22,fontWeight:800,color:'#ffffff',letterSpacing:3,marginBottom:8}}>TELEMIM</div>
      <div style={{fontSize:13,color:'rgba(255,255,255,0.5)',marginBottom:40,letterSpacing:1}}>PROMORAR</div>
      <button onClick={async function(){const ok=await verificarBiometria();if(ok){  try{    var _u=localStorage.getItem('tmim_u');    var _ud=_u?JSON.parse(_u):null;    if(_ud&&_ud.id){      setBioLock(false);      setUsuario(_ud);      setTab('dashboard');    }else{      alert('Sessão expirada. Faça login com senha.');      setBioLock(false);    }  }catch(e2){setBioLock(false);}}else alert('Biometria falhou. Tente novamente.');}} style={{width:220,background:'linear-gradient(135deg,#ea580c,#dc2626)',color:'#fff',border:'none',borderRadius:50,padding:'16px 0',fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:1,boxShadow:'0 4px 20px rgba(234,88,12,0.4)',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:16}}>
        <span style={{fontSize:18}}>🔐</span> Usar Biometria
      </button>
      <button onClick={function(){localStorage.removeItem('tmim_u');setUsuario(null);setBioLock(false);}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.35)',fontSize:12,cursor:'pointer',letterSpacing:0.5,padding:8}}>
        Entrar com senha
      </button>
    </div>
  );
  if(loading) return(
    <div style={{paddingBottom:usuario?"76px":0,minHeight:"100vh",background:COLORS.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14}}>
      <div style={{fontSize:42}}>🚛</div>
      <div style={{color:COLORS.accent,fontWeight:900,fontSize:18}}>Carregando do Supabase...</div>
    </div>
  );

  if(!authChecked)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f8fafc",color:"#64748b"}}>⏳ Carregando...</div>);
  if(!usuario)return(<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e293b,#1e40af)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div style={{background:"#fff",borderRadius:20,padding:"32px 24px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}><div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:44,marginBottom:8}}>🚛</div><div style={{fontSize:24,fontWeight:900,color:"#1e293b"}}>TELEMIM</div><div style={{fontSize:11,color:"#64748b",fontWeight:600,letterSpacing:2,marginTop:2}}>GESTÃO DE MUDANÇAS · PROMORAR</div></div><div style={{marginBottom:14}}><label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5}}>EMAIL</label><input value={loginForm.email} onChange={e=>setLoginForm(f=>({...f,email:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="seu@email.com" style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/></div><div style={{marginBottom:8}}><label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:5}}>SENHA</label><input type="password" value={loginForm.senha} onChange={e=>setLoginForm(f=>({...f,senha:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••" style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/></div>{loginErro&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#dc2626",marginBottom:10}}>{loginErro}</div>}<button onClick={handleLogin} disabled={loginLoad} style={{width:"100%",padding:13,borderRadius:12,background:loginLoad?"#94a3b8":"#1e40af",color:"#fff",fontWeight:900,fontSize:15,border:"none",cursor:loginLoad?"not-allowed":"pointer",marginTop:8}}>{loginLoad?"⏳ Entrando...":"🔐 Entrar"}</button><div style={{textAlign:"center",marginTop:16,fontSize:10,color:"#94a3b8"}}>TELEMIM v2.0 · Acesso restrito</div></div></div>);
    return(
    <div style={{minHeight:"100vh",background:COLORS.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:COLORS.text,paddingBottom:50}}>

      {/* Header */}
      <div style={{background:COLORS.headerBg,padding:"16px 16px 12px",boxShadow:"0 2px 16px rgba(0,0,0,0.15)"}}>
        <div style={{maxWidth:640,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{background:COLORS.accent,borderRadius:12,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🚛</div>
            <div>
              <div style={{fontSize:20,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>TELEMIM</div>
              <div style={{fontSize:10,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase"}}>CONTRATO: PROMORAR</div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
              </div>
              <span style={{fontSize:10,color:syncStatus.includes("✅")?"#4ade80":syncStatus.includes("🔄")?"#fbbf24":"#f87171",fontWeight:700}}>{syncStatus}</span><div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}><span style={{background:isAdmin?"#dbeafe":isPromorar?"#dcfce7":isSupervisor?"#fef3c7":isMotorista?"#ede9fe":"#fef9c3",border:"1px solid "+(isAdmin?"#93c5fd":isPromorar?"#86efac":isSupervisor?"#f59e0b":isMotorista?"#c4b5fd":"#fde047"),borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:800,color:isAdmin?"#1d4ed8":isPromorar?"#15803d":isSupervisor?"#92400e":isMotorista?"#7c3aed":"#a16207"}}>{isAdmin?"🛡️ Admin":isPromorar?"🏢 Promorar":isSupervisor?"👷 Supervisor":isMotorista?"🚚 Motorista":"🌟 Social"}</span><span style={{fontSize:11,color:"#64748b",maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{usuario?.nome?.split(" ")[0]}</span><button onClick={registrarPush} title="Notificacoes" style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>🔔</button><button onClick={function(){localStorage.getItem('tmim_bio_enabled')==='true'?desativarBiometria():ativarBiometria();}} title="Biometria" style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>🔐</button><button onClick={handleLogout} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 8px",fontSize:10,fontWeight:700,color:"#64748b",cursor:"pointer"}}>Sair</button></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"0 12px"}}>

        {/* Alertas */}
       
        {/* Tabs */}
        <div style={{marginTop:8,marginBottom:0}}>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {TABS.slice(0,4).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            {TABS.slice(4).map(t=>(
              <button key={t.id} onClick={()=>t.id==="importar_mud"?(setTab("novaAgenda"),setShowImportAg(true)):(setTab(t.id),t.id==="registros_mot"&&setAbaMotorista('registros'))} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ══ OFFLINE INDICATOR ══ */}
        {isOffline&&<div style={{margin:"0 12px 8px",background:"#fef2f2",border:"2px solid #dc2626",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>📡</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:12,color:"#991b1b"}}>Sem conexão</div>
            <div style={{fontSize:10,color:"#dc2626"}}>Exibindo dados salvos localmente</div>
          </div>
        </div>}
        {/* ══ PUSH NOTIFICATION BANNER ══ */}
        {showNotifBanner&&<div style={{margin:"0 12px 12px",background:"#eff6ff",border:"2px solid #3b82f6",borderRadius:14,padding:"14px 16px",boxShadow:"0 4px 16px rgba(59,130,246,0.15)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24}}>🔔</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:13,color:"#1e40af"}}>Ativar Notificações?</div>
              <div style={{fontSize:11,color:"#3b82f6",marginTop:2}}>Receba alertas de mudanças atribuídas, motorista a caminho e finalizações</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={handleNotifDismiss} style={{flex:1,padding:"9px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>Agora não</button>
            <button onClick={handleNotifAllow} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:"#2563eb",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>✅ Ativar</button>
          </div>
        </div>}
        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard"&&(
        <div style={{paddingBottom:16}}>
        {(()=>{var _p=usuario&&usuario.perfil||"";var _campoMeu=_p==="admin"?"approved_by_admin":_p==="social"?"approved_by_social":_p==="promorar"?"approved_by_promorar":_p==="supervisor"?"approved_by_supervisor":null;if(!_campoMeu)return null;var _pend=[...agenda].filter(function(x){if(!x.data||x.deleted_at)return false;if(x[_campoMeu])return false;return true;});if(!_pend.length)return null;return(<div style={{margin:"0 12px 16px",background:"#fffbeb",border:"2.5px solid #f59e0b",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(245,158,11,0.25)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>🔔</span><div><div style={{fontWeight:800,fontSize:14,color:"#92400e"}}>Notificações ({_pend.length})</div><div style={{fontWeight:600,fontSize:11,color:"#b45309"}}>Confirme o recebimento das mudanças agendadas</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pend.map(function(x){var _quem=x.created_by||x.approved_by_admin||x.approved_by_social||x.approved_by_promorar||"Sistema";var _perfQuem=x.creator_role||"";return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #fcd34d",borderRadius:12,padding:"10px 12px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>👤 {x.nome}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} · 🏷️ {x.selo||"—"}</div><div style={{fontSize:10,color:"#64748b",marginTop:1}}>Agendado por: <strong>{_quem}</strong>{_perfQuem?" ("+_perfQuem+")":""}</div></div><button onClick={function(e){e.stopPropagation();handleApproveAgenda(x.id);}} disabled={!!isApproving[x.id]} style={{padding:"7px 14px",background:isApproving[x.id]?"#94a3b8":"#16a34a",color:"#fff",border:"none",borderRadius:999,fontWeight:800,fontSize:11,cursor:isApproving[x.id]?"not-allowed":"pointer",whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 2px 8px rgba(22,163,74,0.3)"}}>{isApproving[x.id]?"⏳":"✅ Confirmar"}</button></div></div>);})}</div></div>);})()}
        {isAdmin&&(function(){var _pendCanc=agenda.filter(function(a){return !a.deleted_at&&a.cancelamento_solicitado;});if(_pendCanc.length===0)return null;return(<div style={{margin:"0 12px 16px",background:"#fef2f2",border:"2.5px solid #dc2626",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(220,38,38,0.15)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>🚨</span><div><div style={{fontWeight:800,fontSize:14,color:"#991b1b"}}>Solicitações de Cancelamento ({_pendCanc.length})</div><div style={{fontWeight:600,fontSize:11,color:"#b91c1c"}}>Autorize ou recuse os pedidos abaixo</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pendCanc.map(function(x){return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #fecaca",borderRadius:12,padding:"10px 12px"}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",marginBottom:3}}>📦 {x.nome}</div><div style={{fontSize:10,color:"#64748b"}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} · ⏰ {x.horario||"?"}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>👤 Solicitado por: <strong>{x.cancelamento_por}</strong> ({x.cancelamento_perfil})</div>{x.cancelamento_motivo&&<div style={{fontSize:10,color:"#991b1b",marginTop:2}}>💬 {x.cancelamento_motivo}</div>}<div style={{display:"flex",gap:6,marginTop:8}}><button onClick={function(){handleRecusarCancelamento(x.id);}} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Recusar</button><button onClick={function(){handleAutorizarCancelamento(x.id);}} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Autorizar Cancelamento</button></div></div>);})}</div></div>);})()}
        {isMotorista&&mudancasHoje.length===0&&mudancasAmanha.length===0&&mudancasFuturas.length===0&&(<div style={{margin:"12px 0 0",background:"#f0fdf4",border:"2px solid #86efac",borderRadius:14,padding:"20px 16px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:8}}>😊</div><div style={{fontWeight:800,fontSize:15,color:"#15803d",marginBottom:6}}>Nenhuma mudança agendada!</div><div style={{fontSize:13,color:"#16a34a"}}>Bom descanso! ✅</div></div>)}
        {mudancasHoje.length>0&&(
          <div style={{margin:"12px 0 0",display:"flex",flexDirection:"column",gap:7}}>
            {mudancasHoje.map(function(a,_idx){
              var _isVanMot=usuario&&(usuario.tipo_veiculo==="VAN"||a.motorista_van_id===usuario.id);
              var _isCamMot=usuario&&(usuario.tipo_veiculo==="CAMINHAO"||a.motorista_caminhao_id===usuario.id);
              var _stMot;
              if(_isVanMot){
                if(a.termino_van_em) _stMot="Concluido";
                else if(a.chegada_van_em) _stMot="Descarregando";
                else if(a.saiu_destino_van_em) _stMot="Deslocamento Destino";
                else if(a.chegou_origem_van_em) _stMot="Na Origem";
                else if(a.inicio_van_em||a.van_saiu_em) _stMot="Em Deslocamento";
                else _stMot="confirmado";
              }else if(_isCamMot){
                if(a.termino_caminhao_em) _stMot="Concluido";
                else if(a.chegada_caminhao_em) _stMot="Descarregando";
                else if(a.saiu_destino_cam_em) _stMot="Deslocamento Destino";
                else if(a.chegou_origem_cam_em) _stMot="Na Origem";
                else if(a.inicio_caminhao_em||a.caminhao_saiu_em) _stMot="Em Deslocamento";
                else _stMot="confirmado";
              }else{
                _stMot=a.status||"confirmado";
              }
              var _dest=_idx===0;
              var _isDone=_statusRealizados.includes(a.status)||a.termino_em||_stMot==="Concluido";
              return(
              <div key={a.id} style={{background:_isDone?"#f0fdf4":"#dcfce7",border:(_dest?"3px":"2px")+" solid "+(_isDone?"#86efac":"#16a34a"),borderRadius:_dest?18:14,padding:_dest?"20px 18px":"14px 15px",boxShadow:_dest?"0 4px 16px rgba(22,163,74,0.25)":"0 2px 8px rgba(22,163,74,0.15)",opacity:_isDone?0.85:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:_dest?14:10}}>
                  <div style={{flex:1}}>
                    <div style={{color:"#15803d",fontWeight:900,fontSize:_dest?13:11,letterSpacing:1,textTransform:"uppercase",marginBottom:_dest?5:3}}>{_dest?"🚚 PRÓXIMA MUDANÇA":"🚚 MUDANÇA HOJE"}</div>
                    <div style={{fontWeight:800,fontSize:_dest?20:15,color:"#1e293b",marginBottom:_dest?4:2}}>{a.nome}</div>
                    {a.horario&&<div style={{fontSize:_dest?14:12,color:"#475569"}}>⏰ {a.horario}h</div>}
                    <div style={{fontSize:_dest?13:11,marginTop:8}}>📦 {a.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.origem)} target="_blank" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{a.origem} 🗺️</a>:<span style={{color:"#64748b"}}>?</span>}</div>
                    <div style={{fontSize:_dest?13:11,marginTop:24}}>🏘️ {a.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.destino)} target="_blank" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{a.destino} 🗺️</a>:<span style={{color:"#64748b"}}>?</span>}</div>
                    {(a.approved_by_supervisor||a.supervisor_id)&&(function(){var _supNome=a.approved_by_supervisor||(function(){var _s=listaUsuarios.find(function(u){return u.id===a.supervisor_id;});return _s?_s.nome:null;})();return _supNome?<div style={{fontSize:_dest?13:12,marginTop:8,fontWeight:700,color:"#065f46",background:"#ecfdf5",borderRadius:8,padding:"5px 10px",border:"1px solid #a7f3d0"}}>👷 Supervisor: {_supNome}</div>:null;})()}
                  </div>
                  <div style={{background:_stMot==="Em Deslocamento"||_stMot==="Deslocamento Destino"?"#dbeafe":_stMot==="Na Origem"||_stMot==="Descarregando"?"#fef9c3":_stMot==="Concluido"?"#dcfce7":"#f1f5f9",border:"1px solid "+(_stMot==="Em Deslocamento"||_stMot==="Deslocamento Destino"?"#93c5fd":_stMot==="Na Origem"||_stMot==="Descarregando"?"#fde047":_stMot==="Concluido"?"#86efac":"#cbd5e1"),borderRadius:20,padding:"3px 10px",fontSize:_dest?11:10,fontWeight:700,color:_stMot==="Em Deslocamento"||_stMot==="Deslocamento Destino"?"#1d4ed8":_stMot==="Na Origem"||_stMot==="Descarregando"?"#854d0e":_stMot==="Concluido"?"#15803d":"#64748b",whiteSpace:"nowrap"}}>
                    {_stMot==="confirmado"||_stMot==="pendente"?"🟡 Pendente":_stMot==="Em Deslocamento"?"🚚 Rumo à Origem":_stMot==="Na Origem"?"📍 Na Origem":_stMot==="Deslocamento Destino"?"🚚 Rumo ao Destino":_stMot==="Descarregando"?"📦 Descarregando":_stMot==="Concluido"?"✅ Concluído":_stMot}
                  </div>{_stMot==="Em Deslocamento"||_stMot==="Na Origem"||_stMot==="Deslocamento Destino"?
                    <div style={{marginTop:4,fontSize:_dest?11:10,color:_stMot==="Em Deslocamento"?"#1d4ed8":"#854d0e",fontWeight:700,letterSpacing:0.5}}>{(function(){var _ts=_stMot==="Em Deslocamento"?a.inicio_em:a.inicio_mudanca_em;if(!_ts)return null;var _ini=new Date(_ts);var _pad=function(n){return String(n).padStart(2,"0");};var _hora=_pad(_ini.getHours())+":"+_pad(_ini.getMinutes());var _label=_stMot==="Em Deslocamento"?"🚐 Saída: ":"🚛 Início: ";return _label+_hora;})()}</div>:null}
                </div>
                {(a.inicio_van_em||a.inicio_caminhao_em||a.van_saiu_em||a.caminhao_saiu_em)&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
                    {(a.inicio_van_em||a.van_saiu_em)&&<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      <div style={{fontSize:_dest?11:9,fontWeight:700,color:"#1d4ed8",background:"#dbeafe",borderRadius:6,padding:"3px 8px"}}>🚐 Saiu {new Date(a.inicio_van_em||a.van_saiu_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>
                      {a.chegou_origem_van_em&&<div style={{fontSize:_dest?11:9,fontWeight:700,color:"#b45309",background:"#fef3c7",borderRadius:6,padding:"3px 8px"}}>📍 Origem {new Date(a.chegou_origem_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.saiu_destino_van_em&&<div style={{fontSize:_dest?11:9,fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:6,padding:"3px 8px"}}>🚚 Destino {new Date(a.saiu_destino_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.chegada_van_em&&<div style={{fontSize:_dest?11:9,fontWeight:700,color:"#15803d",background:"#dcfce7",borderRadius:6,padding:"3px 8px"}}>🏁 Chegou {new Date(a.chegada_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                    </div>}
                    {(a.inicio_caminhao_em||a.caminhao_saiu_em)&&<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      <div style={{fontSize:_dest?11:9,fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:6,padding:"3px 8px"}}>🚚 Saiu {new Date(a.inicio_caminhao_em||a.caminhao_saiu_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>
                      {a.chegou_origem_cam_em&&<div style={{fontSize:_dest?11:9,fontWeight:700,color:"#b45309",background:"#fef3c7",borderRadius:6,padding:"3px 8px"}}>📍 Origem {new Date(a.chegou_origem_cam_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.saiu_destino_cam_em&&<div style={{fontSize:_dest?11:9,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",borderRadius:6,padding:"3px 8px"}}>🚚 Destino {new Date(a.saiu_destino_cam_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.chegada_caminhao_em&&<div style={{fontSize:_dest?11:9,fontWeight:700,color:"#15803d",background:"#dcfce7",borderRadius:6,padding:"3px 8px"}}>🏁 Chegou {new Date(a.chegada_caminhao_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                    </div>}
                  </div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {/* ── MOTORISTA: 4-step buttons ── */}
                  {isMotorista&&(_stMot==="confirmado"||_stMot==="pendente")&&(
                    <button onClick={function(){handleStatusMotorista(a,"Em Deslocamento");}} style={{width:"100%",background:"#2563eb",border:"none",borderRadius:_dest?12:10,padding:_dest?"16px 0":"12px 0",fontSize:_dest?16:14,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      👥 Ajudantes a Bordo
                    </button>
                  )}
                  {isMotorista&&_stMot==="Em Deslocamento"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,background:"#dbeafe",border:"1.5px solid #93c5fd",borderRadius:_dest?10:8,padding:_dest?"10px 14px":"8px 12px"}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:"#2563eb",animation:"pulse 1.5s infinite"}}></span>
                        <span style={{fontSize:_dest?12:11,fontWeight:700,color:"#1d4ed8"}}>📡 GPS ativo — rumo à origem</span>
                      </div>
                      <button onClick={function(){handleStatusMotorista(a,"Na Origem");}} style={{width:"100%",background:"#f59e0b",border:"none",borderRadius:_dest?12:10,padding:_dest?"16px 0":"12px 0",fontSize:_dest?16:14,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        📍 Chegou na Origem
                      </button>
                    </div>
                  )}
                  {isMotorista&&_stMot==="Na Origem"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,background:"#fef9c3",border:"1.5px solid #fde047",borderRadius:_dest?10:8,padding:_dest?"10px 14px":"8px 12px"}}>
                        <span style={{fontSize:_dest?12:11,fontWeight:700,color:"#854d0e"}}>📦 Carregando na origem...</span>
                      </div>
                      <button onClick={function(){handleStatusMotorista(a,"Deslocamento Destino");}} style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:_dest?12:10,padding:_dest?"16px 0":"12px 0",fontSize:_dest?16:14,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        🚚 Deslocamento Destino
                      </button>
                    </div>
                  )}
                  {isMotorista&&_stMot==="Deslocamento Destino"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,background:"#dbeafe",border:"1.5px solid #93c5fd",borderRadius:_dest?10:8,padding:_dest?"10px 14px":"8px 12px"}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:"#2563eb",animation:"pulse 1.5s infinite"}}></span>
                        <span style={{fontSize:_dest?12:11,fontWeight:700,color:"#1d4ed8"}}>📡 GPS ativo — rumo ao destino</span>
                      </div>
                      <button onClick={function(){handleStatusMotorista(a,"Descarregando");}} style={{width:"100%",background:"#d97706",border:"none",borderRadius:_dest?12:10,padding:_dest?"16px 0":"12px 0",fontSize:_dest?16:14,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        🏁 Chegou no Destino
                      </button>
                    </div>
                  )}
                  {isMotorista&&_stMot==="Descarregando"&&(
                    <div style={{display:"flex",alignItems:"center",gap:6,background:"#fef9c3",border:"1.5px solid #fde047",borderRadius:_dest?10:8,padding:_dest?"10px 14px":"8px 12px"}}>
                      <span style={{fontSize:_dest?12:11,fontWeight:700,color:"#854d0e"}}>📦 Descarregando no destino...</span>
                    </div>
                  )}
                  {/* ── CONCLUÍDA banner ── */}
                  {(function(){var _done=_statusRealizados.includes(a.status)||a.termino_em||(_stMot==="Concluido");
                    return _done?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#dcfce7",border:"2px solid #86efac",borderRadius:_dest?12:10,padding:_dest?"12px 0":"9px 0"}}><span style={{fontSize:_dest?18:15}}>✅</span><span style={{fontWeight:800,fontSize:_dest?15:13,color:"#15803d"}}>Mudança Concluída</span></div>:null;})()}
                  {/* ── ADMIN/SUPERVISOR/PROMORAR/SOCIAL: Iniciar / Finalizar ── */}
                  {!isMotorista&&(function(){
                    var _isConcl=_statusRealizados.includes(a.status)||a.termino_em||(_stMot==="Concluido");
                    if(_isConcl) return null;
                    var _isIniciada=a.status==="Realizando"||a.inicio_mudanca_em;
                    return _isIniciada?(
                      <button onClick={function(){var agora=new Date().toISOString();var body={status:"concluida",termino_em:agora};
                        setAgenda(function(prev){return prev.map(function(x){return x.id===a.id?Object.assign({},x,body):x;});});
                        fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)}).then(function(r){if(r.ok){setSyncStatus("✅ Mudança finalizada!");
                          // Create mudancas record for Registros tab
                          var _numAj=parseInt(a.ajudantes)||0;
                          var _novaM={nome:a.nome||"",selo:a.selo||"",comunidade:a.comunidade||"",data:a.data,origem:a.origem||"",destino:a.destino||"",contato:a.contato||null,van:a.van||false,caminhao:a.caminhao||false,medicao:parseFloat(a.medicao)||0,ajudantes:_numAj,observacao:a.observacao||"",status:"Concluído",termino_em:agora,criado_em:agora,motorista_van_id:a.motorista_van_id||null,motorista_caminhao_id:a.motorista_caminhao_id||null,supervisor_id:a.supervisor_id||null,approved_by_admin:a.approved_by_admin||null,approved_by_social:a.approved_by_social||null,approved_by_promorar:a.approved_by_promorar||null,approved_by_supervisor:a.approved_by_supervisor||null,inicio_van_em:a.inicio_van_em||null,chegou_origem_van_em:a.chegou_origem_van_em||null,saiu_destino_van_em:a.saiu_destino_van_em||null,chegada_van_em:a.chegada_van_em||null,inicio_caminhao_em:a.inicio_caminhao_em||null,chegou_origem_cam_em:a.chegou_origem_cam_em||null,saiu_destino_cam_em:a.saiu_destino_cam_em||null,chegada_caminhao_em:a.chegada_caminhao_em||null};
                          fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),body:JSON.stringify(_novaM)}).then(function(r2){return r2.json();}).then(function(d){if(Array.isArray(d)&&d[0]){setMudancas(function(prev){return[d[0]].concat(prev);});}}).catch(function(){});
                          // Auto-create custosDiarios entry for financial calculations
                          if(_numAj>0&&a.data){var _cdExist=(custosDiarios||[]).find(function(cd){return cd.data===a.data;});if(!_cdExist){saveCustoDia(a.data,_numAj,0);}}
                        }setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);}).catch(function(){setSyncStatus("⚠️ Erro");});
                      }} style={{width:"100%",background:"#16a34a",border:"none",borderRadius:_dest?12:10,padding:_dest?"14px 0":"10px 0",fontSize:_dest?15:13,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        ✅ Finalizar Mudança
                      </button>
                    ):(
                      <button onClick={function(){var agora=new Date().toISOString();var body={status:"Realizando",inicio_mudanca_em:agora};
                        setAgenda(function(prev){return prev.map(function(x){return x.id===a.id?Object.assign({},x,body):x;});});
                        fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)}).then(function(r){if(r.ok)setSyncStatus("✅ Mudança iniciada!");setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);}).catch(function(){setSyncStatus("⚠️ Erro");});
                      }} style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:_dest?12:10,padding:_dest?"14px 0":"10px 0",fontSize:_dest?15:13,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        🔧 Iniciar Mudança
                      </button>
                    );
                  })()}
                </div>
              </div>
              );
            })}
          </div>
        )}
{mudancasAmanha.length>0&&(
          <div style={{margin:"8px 0 0",display:"flex",flexDirection:"column",gap:7}}>
            {mudancasAmanha.map(function(a){
              var _stAmh=a.status||"confirmado";
              return(
              <div key={a.id} style={{background:"#fff7ed",border:"2px solid #f97316",borderRadius:14,padding:"14px 15px",boxShadow:"0 2px 8px rgba(249,115,22,0.15)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{color:"#ea580c",fontWeight:900,fontSize:11,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>📅 MUDANÇA AMANHÃ</div>
                    <div style={{fontWeight:800,fontSize:15,color:"#1e293b",marginBottom:2}}>{a.nome}</div>
                    {a.horario&&<div style={{fontSize:12,color:"#475569"}}>⏰ {a.horario}h</div>}
                    <div style={{fontSize:11,marginTop:8}}>📦 {a.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.origem)} target="_blank" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{a.origem} 🗺️</a>:<span style={{color:"#64748b"}}>?</span>}</div>
                    <div style={{fontSize:11,marginTop:24}}>🏘️ {a.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.destino)} target="_blank" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{a.destino} 🗺️</a>:<span style={{color:"#64748b"}}>?</span>}</div>
                    {(a.approved_by_supervisor||a.supervisor_id)&&(function(){var _supNome=a.approved_by_supervisor||(function(){var _s=listaUsuarios.find(function(u){return u.id===a.supervisor_id;});return _s?_s.nome:null;})();return _supNome?<div style={{fontSize:12,marginTop:8,fontWeight:700,color:"#065f46",background:"#ecfdf5",borderRadius:8,padding:"5px 10px",border:"1px solid #a7f3d0"}}>👷 Supervisor: {_supNome}</div>:null;})()}
                  </div>
                  <div style={{background:"#ffedd5",border:"1px solid #fed7aa",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#c2410c",whiteSpace:"nowrap"}}>⏳ Amanhã</div>
                </div>
                <div style={{background:"#fff",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",fontWeight:600,textAlign:"center"}}>
                  🛠️ {isSupervisor||isPromorar?"Prepare a sua equipe para amanhã!":(usuario&&usuario.tipo_veiculo==="CAMINHAO"?"Prepare o caminhão para amanhã!":"Prepare a van para amanhã!")}
                </div>
              </div>
              );
            })}
          </div>
        )}
{isMotorista&&mudancasFuturas.length>0&&(
          <div style={{margin:"8px 0 0",display:"flex",flexDirection:"column",gap:7}}>
            <div style={{color:"#1d4ed8",fontWeight:900,fontSize:11,letterSpacing:1,textTransform:"uppercase",marginTop:6,marginBottom:2,paddingLeft:2}}>📋 PRÓXIMAS MUDANÇAS</div>
            {mudancasFuturas.map(function(a){
              return(
              <div key={a.id} style={{background:"#dbeafe",border:"2px solid #3b82f6",borderRadius:14,padding:"14px 15px",boxShadow:"0 2px 8px rgba(59,130,246,0.15)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{color:"#1d4ed8",fontWeight:900,fontSize:11,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>📋 MUDANÇA {a.data?new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):""}</div>
                    <div style={{fontWeight:800,fontSize:15,color:"#1e293b",marginBottom:2}}>{a.nome}</div>
                    {a.horario&&<div style={{fontSize:12,color:"#475569"}}>⏰ {a.horario}h</div>}
                    <div style={{fontSize:11,marginTop:8}}>📦 {a.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.origem)} target="_blank" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{a.origem} 🗺️</a>:<span style={{color:"#64748b"}}>?</span>}</div>
                    <div style={{fontSize:11,marginTop:24}}>🏘️ {a.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.destino)} target="_blank" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>{a.destino} 🗺️</a>:<span style={{color:"#64748b"}}>?</span>}</div>
                    {(a.approved_by_supervisor||a.supervisor_id)&&(function(){var _supNome=a.approved_by_supervisor||(function(){var _s=listaUsuarios.find(function(u){return u.id===a.supervisor_id;});return _s?_s.nome:null;})();return _supNome?<div style={{fontSize:12,marginTop:8,fontWeight:700,color:"#065f46",background:"#ecfdf5",borderRadius:8,padding:"5px 10px",border:"1px solid #a7f3d0"}}>👷 Supervisor: {_supNome}</div>:null;})()}
                  </div>
                  <div style={{background:"#bfdbfe",border:"1px solid #93c5fd",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#1e40af",whiteSpace:"nowrap"}}>{a.data?new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}):"?"}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}
        {isMotorista&&tab==="dashboard"&&(mudancasHoje.length>0||mudancasAmanha.length>0)&&(function(){
          var _hj=new Date();var _am=new Date(_hj);_am.setDate(_am.getDate()+1);
          var _hjStr=_hj.toISOString().slice(0,10);var _amStr=_am.toISOString().slice(0,10);
          var _temHoje=mudancasHoje.length>0;var _temAmanha=mudancasAmanha.length>0;
          var _magicDfmt=magicData?magicData.slice(8)+"/"+magicData.slice(5,7):"";
          var _magicLabel=magicData===_hjStr?"hoje ("+_magicDfmt+")":"amanhã ("+_magicDfmt+")";
          return(
          <div style={{margin:"14px 0 0",background:"#fff7ed",border:"2px solid #f97316",borderRadius:14,padding:"14px 16px"}}>
            <div style={{fontWeight:800,fontSize:13,color:"#c2410c",marginBottom:8}}>🔗 Terceirizar Rota</div>
            <div style={{fontSize:11,color:"#78350f",marginBottom:10}}>Gere um link temporário para um motorista terceirizado. Envie na véspera ou no dia. O link expira à meia-noite do dia da rota.</div>
            {!magicToken?(
              <div style={{display:"flex",gap:8}}>
                {_temHoje&&<button onClick={function(){gerarMagicLink(_hjStr);}} disabled={magicLoading} style={{flex:1,padding:12,background:magicLoading?"#94a3b8":"#f97316",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:12,cursor:magicLoading?"not-allowed":"pointer"}}>{magicLoading?"⏳...":"🔗 Hoje"}</button>}
                {_temAmanha&&<button onClick={function(){gerarMagicLink(_amStr);}} disabled={magicLoading} style={{flex:1,padding:12,background:magicLoading?"#94a3b8":"#1e40af",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:12,cursor:magicLoading?"not-allowed":"pointer"}}>{magicLoading?"⏳...":"🔗 Amanhã"}</button>}
              </div>
            ):(
              <div>
                <div style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:8,padding:"8px 10px",marginBottom:8,fontSize:11,color:"#15803d",fontWeight:600,wordBreak:"break-all"}}>✅ Link gerado para {_magicLabel}<br/>{location.origin+"/?ml="+magicToken}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={function(){navigator.clipboard.writeText(location.origin+"/?ml="+magicToken);alert("📋 Link copiado!");}} style={{flex:1,padding:10,background:"#1e40af",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>📋 Copiar</button>
                  <button onClick={function(){var url=location.origin+"/?ml="+magicToken;window.open("https://wa.me/?text="+encodeURIComponent("🚛 Rota terceirizada TELEMIM ("+_magicLabel+")\nAcesse o link para ver as mudanças:\n"+url),"_blank");}} style={{flex:1,padding:10,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>📲 Zap</button>
                </div>
                <button onClick={function(){setMagicToken(null);setMagicData(null);}} style={{marginTop:6,width:"100%",padding:8,background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontWeight:600,fontSize:11,cursor:"pointer"}}>Gerar novo link</button>
              </div>
            )}
          </div>
          );})()}
        <div style={{display:isMotorista&&abaMotorista!=='registros'&&tab!=='registros_mot'?'none':undefined}}>
{tab==="registros_mot"&&isMotorista&&(function(){
          var _nomesMes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          var _mesD=new Date(regMotMes+"-15");
          var _mesLabel=_nomesMes[_mesD.getMonth()]+" "+_mesD.getFullYear();
          var _mesAnt=function(){var d=new Date(regMotMes+"-15");d.setMonth(d.getMonth()-1);setRegMotMes(d.toISOString().slice(0,7));};
          var _mesProx=function(){var d=new Date(regMotMes+"-15");d.setMonth(d.getMonth()+1);setRegMotMes(d.toISOString().slice(0,7));};
          var _hj3=new Date().toISOString().slice(0,10);
          var _statusConcluido=function(s){return["realizado","realizada","concluido","concluida","Concluido","Concluído"].indexOf(s)>=0;};
          var _mm3=(mudancas||[]).filter(function(m){if(m.deleted_at||!m.data||m.data.slice(0,7)!==regMotMes)return false;if(!usuario||!usuario.id)return false;return m.motorista_van_id===usuario.id||m.motorista_caminhao_id===usuario.id;});
          // Incluir agenda items atribuídos ao motorista — inclusive soft-deleted (admin já registrou OS) para não sumir do histórico
          var _agMot=(agenda||[]).filter(function(a){if(!a.data||a.data.slice(0,7)!==regMotMes)return false;if(a.status==="cancelada")return false;if(!usuario||!usuario.id)return false;if(a.motorista_van_id!==usuario.id&&a.motorista_caminhao_id!==usuario.id)return false;var _jaExiste=_mm3.some(function(m){return m.data===a.data&&(m.nome||"").toLowerCase().trim()===(a.nome||"").toLowerCase().trim();});return !_jaExiste;});
          _agMot.forEach(function(a){var _st=_statusConcluido(a.status)?"Concluído":a.status==="confirmado"?"Agendado":a.status==="Em Deslocamento"?"Em Deslocamento":a.status==="Realizando"?"Realizando":"Pendente";_mm3.push({id:a.id,nome:a.nome,data:a.data,horario:a.horario,selo:a.selo,comunidade:a.comunidade,origem:a.origem,destino:a.destino,van:a.van,caminhao:a.caminhao,medicao:a.medicao,status:_st,motorista_van_id:a.motorista_van_id,motorista_caminhao_id:a.motorista_caminhao_id,_fromAgenda:true});});
          var _dd3=[...new Set(_mm3.map(function(m){return m.data;}))].sort(function(a,b){return b.localeCompare(a);});
          return(
            <div style={{padding:"0 12px 80px",background:"#f8fafc"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:16,paddingTop:4}}>
                <button onClick={_mesAnt} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontSize:14,fontWeight:700}}>◀</button>
                <div style={{fontSize:15,fontWeight:800,color:"#1e293b"}}>📅 {_mesLabel}</div>
                <button onClick={_mesProx} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontSize:14,fontWeight:700}}>▶</button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>📋 Meus Registros</div>
                <span style={{background:"#e0e7ff",color:"#3730a3",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700}}>{_mm3.length} mudança{_mm3.length!==1?"s":""}</span>
              </div>
              {_mm3.length===0?<div style={{background:"#fff",borderRadius:12,padding:"32px 16px",textAlign:"center",border:"1px solid #e2e8f0"}}><div style={{fontSize:32,marginBottom:8}}>📭</div><div style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>Nenhuma mudança registrada neste mês</div></div>:_dd3.map(function(dia){
                var _md3=_mm3.filter(function(m){return m.data===dia;}).sort(function(a,b){return(a.horario||"99:99").localeCompare(b.horario||"99:99");});
                var _df3=dia.slice(8)+"/"+dia.slice(5,7)+"/"+dia.slice(0,4);
                var _ih3=dia===_hj3;
                return(
                <div key={dia} style={{background:"#fff",borderRadius:14,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",border:_ih3?"2px solid #3b82f6":"1px solid #e2e8f0"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:14,color:_ih3?"#1e40af":"#1e293b"}}>{_ih3?"📍 Hoje — ":""}{_df3}</div>
                    <span style={{background:"#e0e7ff",color:"#3730a3",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>{_md3.length} mud.</span>
                  </div>
                  {_md3.map(function(m,_i3){
                    var _isConcl=["Concluído","concluida","concluido","Concluido","realizado","realizada"].indexOf(m.status)>=0;
                    var _isAndamento=m.status==="Em Deslocamento"||m.status==="Realizando";
                    var _stColor=_isConcl?"#16a34a":m.status==="Registrado"||m.status==="Agendado"?"#d97706":_isAndamento?"#1d4ed8":"#64748b";
                    var _stLabel=_isConcl?"✅ Concluído":m.status==="Registrado"?"⏳ Registrado":m.status==="Em Deslocamento"?"🚚 Em Deslocamento":m.status==="Realizando"?"⚡ Realizando":m.status==="Agendado"?"📋 Agendado":"📋 "+m.status;
                    var _veics=[m.van&&"🚐 Van",m.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"";
                    return(
                    <div key={_i3} style={{padding:"10px 12px",marginBottom:_i3<_md3.length-1?6:0,background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#1e293b",flex:1}}>{m.nome}</div>
                        <span style={{fontSize:10,fontWeight:700,color:_stColor,background:_stColor==="#16a34a"?"#f0fdf4":_stColor==="#d97706"?"#fffbeb":"#f8fafc",borderRadius:6,padding:"2px 8px",border:"1px solid "+_stColor+"33",whiteSpace:"nowrap",marginLeft:6}}>{_stLabel}</span>
                      </div>
                      {m.comunidade&&<div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{m.comunidade}</div>}
                      {(m.origem||m.destino)&&<div style={{fontSize:11,color:"#475569",marginBottom:3}}>📦 {m.origem||"?"} → 🏠 {m.destino||"?"}</div>}
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                        {_veics&&<span style={{fontSize:10,fontWeight:600,color:"#1e40af",background:"#dbeafe",borderRadius:6,padding:"2px 7px"}}>{_veics}</span>}
                        {m.medicao>0&&<span style={{fontSize:10,fontWeight:600,color:"#7c3aed",background:"#ede9fe",borderRadius:6,padding:"2px 7px"}}>📐 {m.medicao} m³</span>}
                        {m.horario&&<span style={{fontSize:10,fontWeight:600,color:"#334155",background:"#f1f5f9",borderRadius:6,padding:"2px 7px"}}>⏰ {m.horario}</span>}
                      </div>
                    </div>
                  );})}
                </div>
                );
              })}
            </div>
          );
        })()}
</div>


{!isMotorista&&tab==="dashboard"&&(function(){
  var _mN=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  var _dN=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  var _primDia=new Date(calAno,calMes,1);
  var _inicDow=_primDia.getDay();
  var _diasMes=new Date(calAno,calMes+1,0).getDate();
  var _cells=[];
  for(var _ci=0;_ci<_inicDow;_ci++)_cells.push(null);
  for(var _cd=1;_cd<=_diasMes;_cd++)_cells.push(_cd);
  var _prefix=calAno+"-"+(calMes+1<10?"0":"")+(calMes+1);
  var _agMes=(agenda||[]).filter(function(a){return a.data&&a.data.slice(0,7)===_prefix&&!a.deleted_at;});
  var _porDia={};
  _agMes.forEach(function(a){var d=parseInt(a.data.slice(8,10));if(!_porDia[d])_porDia[d]={total:0,items:[]};_porDia[d].total++;_porDia[d].items.push(a);});
  var _hjStr=new Date().toISOString().slice(0,10);
  function _navM(dir){var nm=calMes+dir;var na=calAno;if(nm<0){nm=11;na--;}if(nm>11){nm=0;na++;}setCalMes(nm);setCalAno(na);setCalDiaSel(null);}
  function _dStr(d){return _prefix+"-"+(d<10?"0":"")+d;}
  var _selD=calDiaSel?parseInt(calDiaSel.slice(8,10)):null;
  var _selItems=(_selD&&_porDia[_selD]?_porDia[_selD].items:[]).slice().sort(function(a,b){return(a.horario||"99:99").localeCompare(b.horario||"99:99");});
  return(
    <div style={{padding:"0 12px 16px"}}>
      <div style={{background:"#fff",borderRadius:16,border:"1.5px solid #e2e8f0",padding:"16px 14px",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <button onClick={function(){_navM(-1);}} style={{background:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:16,fontWeight:700,color:"#334155"}}>◀</button>
          <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>🗓️ {_mN[calMes]} {calAno}</div>
          <button onClick={function(){_navM(1);}} style={{background:"#e2e8f0",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:16,fontWeight:700,color:"#334155"}}>▶</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {_dN.map(function(dn){return <div key={dn} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94a3b8",padding:"4px 0"}}>{dn}</div>;})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
          {_cells.map(function(dia,idx){
            if(dia===null)return <div key={"e"+idx} style={{minHeight:42}}></div>;
            var _ds=_dStr(dia);var _info=_porDia[dia];var _isH=_ds===_hjStr;var _isS=calDiaSel===_ds;var _hasM=_info&&_info.total>0;
            return(
              <div key={dia} onClick={function(){setCalDiaSel(_isS?null:_ds);}}
                style={{minHeight:42,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,cursor:"pointer",
                  border:_isS?"2px solid #1e40af":_isH?"2px solid #3b82f6":"1.5px solid transparent",
                  background:_isS?"#dbeafe":(_isH?"#eff6ff":"transparent"),transition:"all 0.15s"}}>
                <div style={{fontSize:13,fontWeight:_isH||_isS?800:500,color:_isS?"#1e40af":(_isH?"#1e40af":"#334155")}}>{dia}</div>
                {_hasM&&<div style={{minWidth:16,height:16,borderRadius:8,padding:"0 3px",
                  background:_info.items.some(function(x){return x.status==="cancelada";})?"#dc2626":_info.items.every(function(x){return x.status==="concluida";})?"#047857":"#f59e0b",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",marginTop:1}}>{_info.total}</div>}
              </div>);
          })}
        </div>
        {calDiaSel&&_selItems.length>0&&(
          <div style={{marginTop:14,borderTop:"1.5px solid #e2e8f0",paddingTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>📋 {calDiaSel.slice(8)+"/"+calDiaSel.slice(5,7)}</div>
              <span style={{background:"#e0e7ff",color:"#3730a3",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700}}>{_selItems.length} mud.</span>
            </div>
            {_selItems.map(function(a){return(
              <div key={a.id} style={{padding:"8px 10px",marginBottom:4,background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
                <div style={{display:"flex",alignItems:"center"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:a.status==="concluida"?"#047857":a.status==="cancelada"?"#dc2626":"#f59e0b",marginRight:10,flexShrink:0}}></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nome}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{a.comunidade||a.origem||""}{a.horario?<span> - <b style={{color:"#334155"}}>{a.horario.replace(":00","")+"h"}</b></span>:""}</div>
                  </div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:700,color:a.status==="concluida"?"#047857":a.status==="cancelada"?"#dc2626":"#d97706"}}>{a.status==="concluida"?"✅":a.status==="cancelada"?"❌":"⏳"}</span>
                    <button onClick={function(e){e.stopPropagation();setViewMud(a);}} style={{background:"#f0f9ff",border:"1.5px solid #0ea5e9",color:"#0ea5e9",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>👁️ Ver</button>
                  </div>
                </div>
                {(a.van||a.motorista_van_id||a.caminhao||a.motorista_caminhao_id)&&calDiaSel===_hjStr&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
                    {(a.van||a.motorista_van_id)&&(<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {(a.inicio_van_em||a.van_saiu_em)?
                        <div style={{fontSize:9,fontWeight:700,color:"#1d4ed8",background:"#dbeafe",borderRadius:5,padding:"2px 6px"}}>🚐 Saiu {new Date(a.inicio_van_em||a.van_saiu_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>
                        :(isAdmin||isSupervisor)?<button onClick={function(e){e.stopPropagation();handleDeslocamento(a,"van");}} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🚐 Van Saiu</button>:null
                      }
                      {a.chegou_origem_van_em&&<div style={{fontSize:9,fontWeight:700,color:"#b45309",background:"#fef3c7",borderRadius:5,padding:"2px 6px"}}>📍 Origem {new Date(a.chegou_origem_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.saiu_destino_van_em&&<div style={{fontSize:9,fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:5,padding:"2px 6px"}}>🚚 Destino {new Date(a.saiu_destino_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.chegada_van_em&&<div style={{fontSize:9,fontWeight:700,color:"#15803d",background:"#dcfce7",borderRadius:5,padding:"2px 6px"}}>🏁 Chegou {new Date(a.chegada_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                    </div>)}
                    {(a.caminhao||a.motorista_caminhao_id)&&(<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {(a.inicio_caminhao_em||a.caminhao_saiu_em)?
                        <div style={{fontSize:9,fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:5,padding:"2px 6px"}}>🚚 Saiu {new Date(a.inicio_caminhao_em||a.caminhao_saiu_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>
                        :(isAdmin||isSupervisor)?<button onClick={function(e){e.stopPropagation();handleDeslocamento(a,"caminhao");}} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>🚚 Caminhão Saiu</button>:null
                      }
                      {a.chegou_origem_cam_em&&<div style={{fontSize:9,fontWeight:700,color:"#b45309",background:"#fef3c7",borderRadius:5,padding:"2px 6px"}}>📍 Origem {new Date(a.chegou_origem_cam_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.saiu_destino_cam_em&&<div style={{fontSize:9,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",borderRadius:5,padding:"2px 6px"}}>🚚 Destino {new Date(a.saiu_destino_cam_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                      {a.chegada_caminhao_em&&<div style={{fontSize:9,fontWeight:700,color:"#15803d",background:"#dcfce7",borderRadius:5,padding:"2px 6px"}}>🏁 Chegou {new Date(a.chegada_caminhao_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</div>}
                    </div>)}
                    {(isAdmin||isSupervisor||isPromorar)&&(((a.inicio_van_em||a.van_saiu_em)&&!a.chegou_origem_van_em)||(a.saiu_destino_van_em&&!a.chegada_van_em))?
                      <button onClick={function(e){e.stopPropagation();var _a=Object.assign({},a,{_trackMotoristaId:a.motorista_van_id,_trackVeiculo:"van"});setGpsMapAgenda(_a);setShowGpsMap(true);setGpsEta(null);
                        gpsLoadPositions(a.id,a.motorista_van_id).then(function(pos){if(pos&&a.destino){gpsCalcEta(pos.lat,pos.lng,a.destino).then(function(eta){setGpsEta(eta);});}setGpsPositions(pos?[pos]:[]);});
                      }} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",marginTop:4}}>📡 GPS Van</button>
                    :null}
                    {(isAdmin||isSupervisor||isPromorar)&&(((a.inicio_caminhao_em||a.caminhao_saiu_em)&&!a.chegou_origem_cam_em)||(a.saiu_destino_cam_em&&!a.chegada_caminhao_em))?
                      <button onClick={function(e){e.stopPropagation();var _a=Object.assign({},a,{_trackMotoristaId:a.motorista_caminhao_id,_trackVeiculo:"cam"});setGpsMapAgenda(_a);setShowGpsMap(true);setGpsEta(null);
                        gpsLoadPositions(a.id,a.motorista_caminhao_id).then(function(pos){if(pos&&a.destino){gpsCalcEta(pos.lat,pos.lng,a.destino).then(function(eta){setGpsEta(eta);});}setGpsPositions(pos?[pos]:[]);});
                      }} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",marginTop:4}}>📡 GPS Caminhão</button>
                    :null}
                  </div>
                )}
                {/* ── Iniciar / Finalizar Mudança (admin, supervisor, promorar, social) ── */}
                {(isAdmin||isSupervisor||isPromorar||isSocial)&&calDiaSel===_hjStr&&a.status!=="concluida"&&a.status!=="cancelada"&&(
                  <div style={{display:"flex",gap:4,marginTop:6}}>
                    {a.status!=="Realizando"&&a.status!=="em_andamento"&&!a.inicio_mudanca_em?(
                      <button onClick={function(e){e.stopPropagation();var agora=new Date().toISOString();var body={status:"Realizando",inicio_mudanca_em:agora};
                        setAgenda(function(prev){return prev.map(function(x){return x.id===a.id?Object.assign({},x,body):x;});});
                        fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)}).then(function(r){if(r.ok){setSyncStatus("✅ Mudança iniciada!");}else{setSyncStatus("⚠️ Erro");}setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);}).catch(function(){setSyncStatus("⚠️ Erro");});
                      }} style={{flex:1,background:"#7c3aed",color:"#fff",border:"none",borderRadius:6,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔧 Iniciar Mudança</button>
                    ):(!a.termino_em&&(a.status==="Realizando"||a.status==="em_andamento"||a.inicio_mudanca_em))?(
                      <button onClick={function(e){e.stopPropagation();var agora=new Date().toISOString();var body={status:"concluida",termino_em:agora};
                        setAgenda(function(prev){return prev.map(function(x){return x.id===a.id?Object.assign({},x,body):x;});});
                        fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)}).then(function(r){if(r.ok){setSyncStatus("✅ Mudança finalizada!");}else{setSyncStatus("⚠️ Erro");}setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);}).catch(function(){setSyncStatus("⚠️ Erro");});
                      }} style={{flex:1,background:"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Finalizar Mudança</button>
                    ):null}
                  </div>
                )}
              </div>
              );})}
          </div>
        )}
        {calDiaSel&&_selItems.length===0&&(
          <div style={{marginTop:14,borderTop:"1.5px solid #e2e8f0",paddingTop:12,textAlign:"center",color:"#94a3b8",fontSize:13,padding:"16px 0"}}>Nenhuma mudança neste dia</div>
        )}
      </div>
    </div>
  );
})()}
        </div>
      )}
        {tab==="dashboard"&&isAdmin&&notificacoes.length>0&&(<div style={{padding:"0 12px 16px"}}><div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"14px 14px 10px"}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",letterSpacing:0.3,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>{"🔔 CENTRAL DE NOTIFICACOES"}</div>{notificacoes.slice(0,notifLimit).map(function(n){var ico=n.tipo==="concluida"?"🟢":n.tipo==="cubagem"?"📐":"✏️";var tit=n.tipo==="concluida"?"Mudanca concluida":n.tipo==="cubagem"?"Cubagem alterada":"Mudanca editada";var dt=n.criado_em?new Date(n.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"";return(<div key={n.id} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><span style={{fontSize:14}}>{ico}</span><span style={{fontSize:12,fontWeight:700,color:"#334155"}}>{tit}</span></div><div style={{fontSize:11,color:"#475569",marginLeft:22}}>{n.mudanca_nome||""}{n.descricao&&n.descricao!==tit?(" - "+n.descricao):""}</div><div style={{fontSize:10,color:"#94a3b8",marginLeft:22,marginTop:2}}>{"por "}<b>{n.usuario_nome||"Sistema"}</b>{" · "+dt}</div></div>);})}{notificacoes.length>notifLimit&&(<div style={{textAlign:"center",paddingTop:8}}><button onClick={function(){setNotifLimit(function(p){return p+10;});}} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 16px",fontSize:11,fontWeight:700,color:"#64748b",cursor:"pointer"}}>{"Ver mais ("+(notificacoes.length-notifLimit)+" anteriores)"}</button></div>)}</div></div>)}
        {tab==="dashboard"&&activityLogs.length>0&&<div style={{padding:"0 12px 16px"}}><div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"12px 14px"}}><div style={{fontWeight:800,fontSize:12,color:"#64748b",letterSpacing:0.5,marginBottom:8,display:"flex",alignItems:"center",gap:5}}>🔔 ÚNTIMAS ATUALIZAÇÕES</div>{activityLogs.slice(0,5).map(function(log){return(<div key={log.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f8fafc"}}><span style={{fontSize:13,flexShrink:0}}>✅</span><div style={{flex:1,fontSize:11,color:"#334155",lineHeight:1.5}}>{log.msg}<span style={{color:"#94a3b8",marginLeft:6,fontSize:10}}>{log.hora}h</span></div></div>);})}</div></div>}
{/* ══ ABA MONITORAMENTO — Torre de Controle ══ */}
{tab==="monitoramento"&&!isMotorista&&(function(){
  var _hjStr=new Date().toISOString().slice(0,10);
  var _hjFmt=(function(){var p=_hjStr.split("-");return p[2]+"/"+p[1]+"/"+p[0];})();
  var _hora=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  // Step Tracker component
  var StepTracker=function(props){
    var status=props.status||"confirmado";
    var steps=[
      {key:"deslocamento",label:"Rumo à Origem",icon:"🚐"},
      {key:"origem",label:"Na Origem",icon:"📍"},
      {key:"carregando",label:"Carregando",icon:"📦"},
      {key:"destino",label:"Rumo ao Destino",icon:"🚚"},
      {key:"descarregando",label:"Descarregando",icon:"📦"},
      {key:"chegou",label:"Concluído",icon:"🏁"}
    ];
    var _map={"Em Deslocamento":0,"Na Origem":1,"Carregando":2,"Realizando":2,"Deslocamento Destino":3,"Descarregando":4,"No Destino":4,"Concluido":5,"Concluído":5,"concluido":5,"concluida":5,"realizado":5,"realizada":5};
    var activeIdx=_map[status]!==undefined?_map[status]:-1;
    return(
      <div style={{display:"flex",alignItems:"center",gap:0,padding:"12px 0"}}>
        {steps.map(function(step,idx){
          var isDone=idx<activeIdx;
          var isActive=idx===activeIdx;
          var isFuture=idx>activeIdx;
          return(
            <div key={step.key} style={{display:"flex",alignItems:"center",flex:1}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:0}}>
                <div style={{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
                  background:isDone?"#16a34a":isActive?"#2563eb":"#e2e8f0",
                  color:isDone||isActive?"#fff":"#94a3b8",
                  fontWeight:800,
                  boxShadow:isActive?"0 0 0 4px rgba(37,99,235,0.25)":"none",
                  animation:isActive?"pulse 1.5s infinite":"none",
                  border:isActive?"3px solid #93c5fd":"2px solid "+(isDone?"#16a34a":"#e2e8f0")
                }}>{isDone?"✓":step.icon}</div>
                <div style={{fontSize:9,fontWeight:isDone||isActive?700:500,color:isDone?"#16a34a":isActive?"#2563eb":"#94a3b8",marginTop:4,textAlign:"center",whiteSpace:"nowrap"}}>{step.label}</div>
              </div>
              {idx<steps.length-1&&(
                <div style={{flex:1,height:3,background:isDone?"#16a34a":"#e2e8f0",borderRadius:2,margin:"0 4px",marginBottom:18,alignSelf:"flex-start",marginTop:17}}></div>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  // Totais gerais do dia
  var _allToday=[...(agenda||[]).filter(function(a){return a.data===_hjStr&&!a.deleted_at;}),
    ...(mudancas||[]).filter(function(m){return m.data===_hjStr&&!m.deleted_at;})];
  var _statusAtivo2=function(s){return s==="Em Deslocamento"||s==="Realizando";};
  var _statusConcl2=function(s){return["Concluido","Concluído","concluido","concluida","realizado","realizada"].indexOf(s)>=0;};
  var _totalAtivas=_allToday.filter(function(x){return _statusAtivo2(x.status);}).length;
  var _totalConcl=_allToday.filter(function(x){return _statusConcl2(x.status);}).length;
  var _totalPend=_allToday.filter(function(x){return !_statusAtivo2(x.status)&&!_statusConcl2(x.status);}).length;

  return(
    <div style={{padding:"0 0 80px"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f)",padding:"20px 16px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:1.5,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Torre de Controle</div>
            <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>📡 Monitoramento</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>📅 {_hjFmt}</div>
            <div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>⏰ {_hora}</div>
          </div>
        </div>
        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:14}}>
          <div style={{background:"rgba(37,99,235,0.2)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(37,99,235,0.3)"}}>
            <div style={{fontSize:22,fontWeight:900,color:"#60a5fa"}}>{_totalAtivas}</div>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:0.5}}>EM ANDAMENTO</div>
          </div>
          <div style={{background:"rgba(245,158,11,0.2)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(245,158,11,0.3)"}}>
            <div style={{fontSize:22,fontWeight:900,color:"#fbbf24"}}>{_totalPend}</div>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:0.5}}>PENDENTES</div>
          </div>
          <div style={{background:"rgba(22,163,74,0.2)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(22,163,74,0.3)"}}>
            <div style={{fontSize:22,fontWeight:900,color:"#4ade80"}}>{_totalConcl}</div>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:0.5}}>CONCLUÍDAS</div>
          </div>
        </div>
      </div>

      {/* Filtro por Supervisor / Social */}
      {(function(){
        var _sups=listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;});
        var _socs=listaUsuarios.filter(function(u){return u.perfil==="social"&&u.ativo;});
        // Collect social names from today's agenda
        var _socNames=[];
        var _seenSoc={};
        (agenda||[]).forEach(function(a){if(a.data===_hjStr&&!a.deleted_at&&a.approved_by_social&&!_seenSoc[a.approved_by_social]){_seenSoc[a.approved_by_social]=true;_socNames.push(a.approved_by_social);}});
        return(
          <div style={{padding:"10px 12px 0",display:"flex",gap:6}}>
            <select value={monitorFiltro} onChange={function(e){setMonitorFiltro(e.target.value);}}
              style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:700,color:"#1e293b",cursor:"pointer"}}>
              <option value="todos">👁️ Todos</option>
              <optgroup label="👷 Supervisores">
                {_sups.map(function(s){return <option key={s.id} value={"sup:"+s.id}>👷 {s.nome}</option>;})}
                {_sups.length===0&&<option disabled>Nenhum supervisor</option>}
              </optgroup>
              <optgroup label="🤝 Social">
                {_socs.map(function(s){return <option key={s.id} value={"soc:"+s.nome}>🤝 {s.nome}</option>;})}
                {_socNames.filter(function(n){return !_socs.some(function(s){return s.nome===n;});}).map(function(n){return <option key={n} value={"soc:"+n}>🤝 {n}</option>;})}
                {_socs.length===0&&_socNames.length===0&&<option disabled>Nenhum social</option>}
              </optgroup>
            </select>
            {monitorFiltro!=="todos"&&(
              <button onClick={function(){setMonitorFiltro("todos");}} style={{padding:"10px 14px",borderRadius:10,border:"1.5px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✕ Limpar</button>
            )}
          </div>
        );
      })()}

      {/* Cards por Supervisor */}
      <div style={{padding:"12px 12px 0"}}>
        {(function(){
          var _filtered=monitorData;
          if(monitorFiltro!=="todos"){
            if(monitorFiltro.startsWith("sup:")){
              var _sid=monitorFiltro.slice(4);
              _filtered=monitorData.filter(function(g){return g.supervisorId===_sid;});
            }else if(monitorFiltro.startsWith("soc:")){
              var _socNome=monitorFiltro.slice(4);
              _filtered=monitorData.filter(function(g){
                var _allMoves=[g.activeMove].concat(g.pendingMoves,g.completedMoves).filter(Boolean);
                return _allMoves.some(function(m){return m.approved_by_social===_socNome;});
              });
            }
          }
          if(_filtered.length===0) return(
            <div style={{background:"#fff",borderRadius:16,padding:"40px 20px",textAlign:"center",border:"1.5px solid #e2e8f0"}}>
              <div style={{fontSize:40,marginBottom:8}}>📡</div>
              <div style={{fontSize:15,fontWeight:800,color:"#64748b"}}>{monitorFiltro!=="todos"?"Nenhuma operação para este filtro":"Nenhuma operação hoje"}</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>{monitorFiltro!=="todos"?"Tente outro filtro ou 'Todos'":"Agende mudanças com supervisor para monitorar"}</div>
            </div>
          );
          return _filtered.map(function(group){
          var sup=listaUsuarios.find(function(u){return u.id===group.supervisorId;});
          var supNome=sup?sup.nome:"Supervisor #"+String(group.supervisorId).slice(0,6);
          var supContato=sup&&sup.contato?sup.contato:"";
          var am=group.activeMove;
          var _hasActive=!!am;
          var _pendCount=group.pendingMoves.length;
          var _doneCount=group.completedMoves.length;
          var _totalSup=(_hasActive?1:0)+_pendCount+_doneCount;

          return(
            <div key={group.supervisorId} style={{background:"#fff",borderRadius:16,marginBottom:12,border:_hasActive?"2.5px solid #2563eb":"1.5px solid #e2e8f0",boxShadow:_hasActive?"0 4px 20px rgba(37,99,235,0.15)":"0 2px 8px rgba(0,0,0,0.04)",overflow:"hidden"}}>
              {/* Cabeçalho do Supervisor */}
              <div style={{background:_hasActive?"linear-gradient(135deg,#1e3a5f,#1e40af)":"#f8fafc",padding:"12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid "+(_hasActive?"rgba(255,255,255,0.1)":"#e2e8f0")}}>
                <div style={{width:42,height:42,borderRadius:"50%",background:_hasActive?"rgba(255,255,255,0.15)":"#e0e7ff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:_hasActive?"2px solid rgba(255,255,255,0.3)":"2px solid #c7d2fe"}}>👷</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:_hasActive?"#fff":"#1e293b"}}>{supNome}</div>
                  {supContato&&<div style={{fontSize:11,color:_hasActive?"rgba(255,255,255,0.6)":"#94a3b8"}}>📞 {supContato}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {_hasActive&&<div style={{width:10,height:10,borderRadius:"50%",background:"#22c55e",animation:"pulse 1.5s infinite"}}></div>}
                  <span style={{fontSize:11,fontWeight:700,color:_hasActive?"#93c5fd":"#94a3b8"}}>{_totalSup} OS</span>
                </div>
              </div>

              {/* Corpo — Active Move com Step Tracker */}
              <div style={{padding:"14px 16px"}}>
                {_hasActive?(
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"#2563eb",animation:"pulse 1.5s infinite"}}></div>
                      <div style={{fontSize:11,fontWeight:800,color:"#2563eb",letterSpacing:1,textTransform:"uppercase"}}>Operação em Andamento</div>
                    </div>

                    {/* Dados do Morador */}
                    <div style={{background:"#fff7ed",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid #fed7aa"}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#c2410c",letterSpacing:0.5,marginBottom:4}}>MORADOR</div>
                      <div style={{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:2}}>👤 {am.nome}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                        {am.selo&&<span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"2px 8px"}}>🏷️ {am.selo}</span>}
                        {am.comunidade&&<span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"2px 8px"}}>📍 {am.comunidade}</span>}
                        {am.contato&&<span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"2px 8px"}}>📞 {am.contato}</span>}
                        {am.horario&&<span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"2px 8px"}}>⏰ {am.horario}h</span>}
                        {am.medicao>0&&<span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"2px 8px"}}>📐 {am.medicao} m³</span>}
                      </div>
                    </div>

                    {/* Origem → Destino */}
                    <div style={{display:"flex",alignItems:"stretch",gap:8,marginBottom:10}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,paddingTop:4}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:"#2563eb",border:"2px solid #93c5fd"}}></div>
                        <div style={{flex:1,width:2,background:"#cbd5e1"}}></div>
                        <div style={{width:10,height:10,borderRadius:"50%",background:"#16a34a",border:"2px solid #86efac"}}></div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:2}}>SAÍDA</div>
                        <div style={{fontSize:12,color:"#1e293b",fontWeight:700,marginBottom:8}}>{am.origem||"?"}</div>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:2}}>DESTINO</div>
                        <div style={{fontSize:12,color:"#1e293b",fontWeight:700}}>{am.destino||"?"}</div>
                      </div>
                    </div>

                    {/* Van e Caminhão — Motoristas */}
                    {(am.motorista_van_id||am.motorista_caminhao_id)&&(function(){
                      var _vanMot=am.motorista_van_id?listaUsuarios.find(function(u){return u.id===am.motorista_van_id;}):null;
                      var _camMot=am.motorista_caminhao_id?listaUsuarios.find(function(u){return u.id===am.motorista_caminhao_id;}):null;
                      return(
                        <div style={{display:"flex",gap:6,marginBottom:10}}>
                          {_vanMot&&(
                            <div style={{flex:1,background:"#dbeafe",borderRadius:8,padding:"8px 10px",border:"1px solid #93c5fd"}}>
                              <div style={{fontSize:10,fontWeight:700,color:"#1d4ed8",marginBottom:3}}>🚐 VAN</div>
                              <div style={{fontSize:12,fontWeight:800,color:"#1e293b"}}>{_vanMot.nome}</div>
                              {_vanMot.placa_veiculo&&<div style={{fontSize:10,color:"#475569",marginTop:2}}>🔖 {_vanMot.placa_veiculo}</div>}
                              {_vanMot.contato&&<div style={{fontSize:10,color:"#475569",marginTop:1}}>📞 {_vanMot.contato}</div>}
                              {/* Van timestamps — 4 steps */}
                              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                                {(am.inicio_van_em||am.van_saiu_em)&&<span style={{fontSize:8,fontWeight:700,color:"#1d4ed8",background:"#eff6ff",borderRadius:4,padding:"2px 5px"}}>🚐 Saiu {new Date(am.inicio_van_em||am.van_saiu_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                                {am.chegou_origem_van_em&&<span style={{fontSize:8,fontWeight:700,color:"#b45309",background:"#fef3c7",borderRadius:4,padding:"2px 5px"}}>📍 Origem {new Date(am.chegou_origem_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                                {am.saiu_destino_van_em&&<span style={{fontSize:8,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",borderRadius:4,padding:"2px 5px"}}>🚚 Destino {new Date(am.saiu_destino_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                                {am.chegada_van_em&&<span style={{fontSize:8,fontWeight:700,color:"#15803d",background:"#dcfce7",borderRadius:4,padding:"2px 5px"}}>🏁 Chegou {new Date(am.chegada_van_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                              </div>
                              {/* GPS button for Van — active during step 1 (rumo origem) and step 3 (rumo destino) */}
                              {(((am.inicio_van_em||am.van_saiu_em)&&!am.chegou_origem_van_em)||(am.saiu_destino_van_em&&!am.chegada_van_em))&&(
                                <button onClick={function(){var _a=Object.assign({},am,{_trackMotoristaId:am.motorista_van_id,_trackVeiculo:"van"});setGpsMapAgenda(_a);setShowGpsMap(true);setGpsEta(null);
                                  gpsLoadPositions(am.id,am.motorista_van_id).then(function(pos){if(pos&&am.destino){gpsCalcEta(pos.lat,pos.lng,am.destino).then(function(eta){setGpsEta(eta);});}setGpsPositions(pos?[pos]:[]);});
                                }} style={{marginTop:6,width:"100%",background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"6px 0",fontWeight:700,fontSize:10,cursor:"pointer"}}>📡 Rastrear Van</button>
                              )}
                            </div>
                          )}
                          {_camMot&&(
                            <div style={{flex:1,background:"#ede9fe",borderRadius:8,padding:"8px 10px",border:"1px solid #c4b5fd"}}>
                              <div style={{fontSize:10,fontWeight:700,color:"#7c3aed",marginBottom:3}}>🚚 CAMINHÃO</div>
                              <div style={{fontSize:12,fontWeight:800,color:"#1e293b"}}>{_camMot.nome}</div>
                              {_camMot.placa_veiculo&&<div style={{fontSize:10,color:"#475569",marginTop:2}}>🔖 {_camMot.placa_veiculo}</div>}
                              {_camMot.contato&&<div style={{fontSize:10,color:"#475569",marginTop:1}}>📞 {_camMot.contato}</div>}
                              {/* Caminhão timestamps — 4 steps */}
                              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                                {(am.inicio_caminhao_em||am.caminhao_saiu_em)&&<span style={{fontSize:8,fontWeight:700,color:"#7c3aed",background:"#f5f3ff",borderRadius:4,padding:"2px 5px"}}>🚚 Saiu {new Date(am.inicio_caminhao_em||am.caminhao_saiu_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                                {am.chegou_origem_cam_em&&<span style={{fontSize:8,fontWeight:700,color:"#b45309",background:"#fef3c7",borderRadius:4,padding:"2px 5px"}}>📍 Origem {new Date(am.chegou_origem_cam_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                                {am.saiu_destino_cam_em&&<span style={{fontSize:8,fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:4,padding:"2px 5px"}}>🚚 Destino {new Date(am.saiu_destino_cam_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                                {am.chegada_caminhao_em&&<span style={{fontSize:8,fontWeight:700,color:"#15803d",background:"#dcfce7",borderRadius:4,padding:"2px 5px"}}>🏁 Chegou {new Date(am.chegada_caminhao_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+"h"}</span>}
                              </div>
                              {/* GPS button for Caminhão — active during step 1 and step 3 */}
                              {(((am.inicio_caminhao_em||am.caminhao_saiu_em)&&!am.chegou_origem_cam_em)||(am.saiu_destino_cam_em&&!am.chegada_caminhao_em))&&(
                                <button onClick={function(){var _a=Object.assign({},am,{_trackMotoristaId:am.motorista_caminhao_id,_trackVeiculo:"cam"});setGpsMapAgenda(_a);setShowGpsMap(true);setGpsEta(null);
                                  gpsLoadPositions(am.id,am.motorista_caminhao_id).then(function(pos){if(pos&&am.destino){gpsCalcEta(pos.lat,pos.lng,am.destino).then(function(eta){setGpsEta(eta);});}setGpsPositions(pos?[pos]:[]);});
                                }} style={{marginTop:6,width:"100%",background:"#7c3aed",color:"#fff",border:"none",borderRadius:6,padding:"6px 0",fontWeight:700,fontSize:10,cursor:"pointer"}}>📡 Rastrear Caminhão</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Step Tracker — derive status from van/cam timestamps (6 steps) */}
                    {(function(){
                      var _st4="confirmado";
                      // Check vehicle timestamps for 6-step flow
                      var _hasConcl=am.status==="concluida"||am.status==="realizada"||am.termino_em||am.termino_van_em||am.termino_caminhao_em;
                      var _hasChegDest=am.chegada_van_em||am.chegada_caminhao_em;
                      var _hasSaiuDest=am.saiu_destino_van_em||am.saiu_destino_cam_em;
                      var _hasOrigem=am.chegou_origem_van_em||am.chegou_origem_cam_em;
                      var _hasSaiu=am.inicio_van_em||am.van_saiu_em||am.inicio_caminhao_em||am.caminhao_saiu_em;
                      if(_hasConcl&&_hasChegDest) _st4="Concluido";
                      else if(_hasChegDest) _st4="Descarregando";
                      else if(_hasSaiuDest) _st4="Deslocamento Destino";
                      else if(_hasOrigem) _st4="Carregando";
                      else if(_hasSaiu) _st4="Em Deslocamento";
                      // Fallback to general status (non-vehicle flow)
                      else if(_hasConcl) _st4="Concluido";
                      else if(am.status==="Realizando"||am.status==="em_andamento"||am.inicio_mudanca_em) _st4="Carregando";
                      return(
                        <div style={{background:"#f8fafc",borderRadius:12,padding:"8px 12px",marginTop:4,border:"1px solid #e2e8f0"}}>
                          <StepTracker status={_st4}/>
                        </div>
                      );
                    })()}
                  </div>
                ):(
                  <div style={{textAlign:"center",padding:"16px 0",color:"#94a3b8"}}>
                    <div style={{fontSize:28,marginBottom:4}}>☕</div>
                    <div style={{fontSize:13,fontWeight:600}}>Nenhuma operação em andamento</div>
                  </div>
                )}
              </div>

              {/* Rodapé — Pendentes e Concluídas */}
              <div style={{background:"#f8fafc",padding:"10px 16px",borderTop:"1px solid #e2e8f0",display:"flex",gap:8}}>
                <div style={{flex:1,background:"#fffbeb",borderRadius:8,padding:"8px 10px",border:"1px solid #fcd34d"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                    <span style={{fontSize:12}}>⏳</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#92400e"}}>Falta Realizar: {_pendCount}</span>
                  </div>
                  {_pendCount>0&&<div style={{fontSize:10,color:"#b45309",lineHeight:1.6}}>
                    {group.pendingMoves.slice(0,3).map(function(pm){return <div key={pm.id}>• {pm.nome}{pm.horario?" ("+pm.horario+"h)":""}</div>;})}
                    {_pendCount>3&&<div style={{color:"#94a3b8",fontStyle:"italic"}}>+{_pendCount-3} mais...</div>}
                  </div>}
                </div>
                <div style={{flex:1,background:"#f0fdf4",borderRadius:8,padding:"8px 10px",border:"1px solid #bbf7d0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                    <span style={{fontSize:12}}>✅</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#166534"}}>Concluídas: {_doneCount}</span>
                  </div>
                  {_doneCount>0&&<div style={{fontSize:10,color:"#15803d",lineHeight:1.6}}>
                    {group.completedMoves.slice(0,3).map(function(cm){return <div key={cm.id}>• {cm.nome}</div>;})}
                    {_doneCount>3&&<div style={{color:"#94a3b8",fontStyle:"italic"}}>+{_doneCount-3} mais...</div>}
                  </div>}
                </div>
              </div>
            </div>
          );
        });
        })()}
      </div>
    </div>
  );
})()}

{tab==="fin_mot"&&isMotorista&&(function(){
  var _hj=new Date();
  var _pad=function(n){return String(n).padStart(2,"0");};
  var _dSem=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  var _meuId=usuario&&usuario.id;
  var _meuTipo=usuario&&usuario.tipo_veiculo;
  var _isVan=_meuTipo==="VAN";
  var _isCam=_meuTipo==="CAMINHAO";
  var _icone=_isVan?"🚐":"🚚";
  var _label=_isVan?"Van":"Caminhão";

  var _di,_df,_periodoLabel;
  if(periodoFinMot==="semana"){
    var _dw=_hj.getDay();var _dif=_dw===0?6:_dw-1;
    var _s0=new Date(_hj.getFullYear(),_hj.getMonth(),_hj.getDate()-_dif);
    var _s6=new Date(_s0.getFullYear(),_s0.getMonth(),_s0.getDate()+6);
    _di=_s0.getFullYear()+"-"+_pad(_s0.getMonth()+1)+"-"+_pad(_s0.getDate());
    _df=_s6.getFullYear()+"-"+_pad(_s6.getMonth()+1)+"-"+_pad(_s6.getDate());
    _periodoLabel="Semana "+_pad(_s0.getDate())+"/"+_pad(_s0.getMonth()+1)+" a "+_pad(_s6.getDate())+"/"+_pad(_s6.getMonth()+1);
  }else if(periodoFinMot==="mes_atual"){
    _di=_hj.getFullYear()+"-"+_pad(_hj.getMonth()+1)+"-01";
    var _uf=new Date(_hj.getFullYear(),_hj.getMonth()+1,0);
    _df=_uf.getFullYear()+"-"+_pad(_uf.getMonth()+1)+"-"+_pad(_uf.getDate());
    _periodoLabel=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][_hj.getMonth()]+" "+_hj.getFullYear();
  }else{
    var _ma=new Date(_hj.getFullYear(),_hj.getMonth()-1,1);
    _di=_ma.getFullYear()+"-"+_pad(_ma.getMonth()+1)+"-01";
    var _uf2=new Date(_ma.getFullYear(),_ma.getMonth()+1,0);
    _df=_uf2.getFullYear()+"-"+_pad(_uf2.getMonth()+1)+"-"+_pad(_uf2.getDate());
    _periodoLabel=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][_ma.getMonth()]+" "+_ma.getFullYear();
  }

  // Só conta mudanças FINALIZADAS (status Concluído/concluida)
  var _statusFin=["Concluído","concluida","Concluido","concluído"];
  var _todas=(_allForFiltered||[]).filter(function(m){
    if(m.deleted_at||!m.data||m.data<_di||m.data>_df) return false;
    if(!_statusFin.includes(m.status)) return false;
    return m.motorista_van_id===_meuId||m.motorista_caminhao_id===_meuId;
  });

  var _diasU=[...new Set(_todas.map(function(m){return m.data;}))].sort();
  var _totalGeral=0;
  var _detalhe=_diasU.map(function(dia){
    var _doDia=_todas.filter(function(m){return m.data===dia;});
    var numMud=_doDia.length;
    var _comoVan=_doDia.some(function(m){return m.motorista_van_id===_meuId;});
    var valor;
    if(_comoVan){
      valor=parseFloat(RULES.vanCusto)||400;
    }else{
      var _c1=parseFloat(RULES.cam1a)||350;
      var _cA=parseFloat(RULES.camAdd)||130;
      valor=_c1+Math.max(0,numMud-1)*_cA;
    }
    _totalGeral+=valor;
    var _dt=new Date(dia+"T12:00:00");
    var _dNome=_dSem[_dt.getDay()];
    return {dia:dia,dNome:_dNome,numMud:numMud,valor:valor,items:_doDia,comoVan:_comoVan};
  });

  var _fvR=function(v){return "R$ "+(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};

  return(
    <div style={{padding:"0 12px 80px"}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#1e3a8a)",borderRadius:14,padding:"16px 16px 12px",marginBottom:14}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:1,textTransform:"uppercase"}}>💰 MEU FINANCEIRO</div>
        <div style={{fontSize:16,fontWeight:900,color:"#fff",marginTop:4}}>{_periodoLabel}</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["semana","Semana"],["mes_atual","Mês Atual"],["mes_ant","Mês Ant."]].map(function(p){
          return <button key={p[0]} onClick={function(){setPeriodoFinMot(p[0]);}} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1.5px solid "+(periodoFinMot===p[0]?"#1e40af":"#e2e8f0"),background:periodoFinMot===p[0]?"#1e40af":"#fff",color:periodoFinMot===p[0]?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>{p[1]}</button>;
        })}
      </div>
      {_detalhe.length===0?(
        <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>Nenhuma mudança atribuída no período.</div>
      ):(
        <div>
          {_detalhe.map(function(d){
            return(
              <div key={d.dia} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>📅 {d.dia.slice(8)+"/"+d.dia.slice(5,7)} ({d.dNome})</div>
                  <span style={{background:"#e0e7ff",color:"#3730a3",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>{d.numMud} {d.numMud===1?"mudança":"mudanças"}</span>
                </div>
                {d.items.map(function(m,i){
                  return <div key={i} style={{fontSize:11,color:"#475569",padding:"3px 0",borderTop:i>0?"1px solid #f1f5f9":"none"}}>👤 {m.nome}{m.comunidade?" · "+m.comunidade:""}</div>;
                })}
                <div style={{marginTop:8,textAlign:"right",fontWeight:800,fontSize:14,color:d.comoVan?"#2563eb":"#7c3aed"}}>{d.comoVan?"🚐 Van":"🚚 Caminhão"}: {_fvR(d.valor)}</div>
              </div>
            );
          })}
          <div style={{background:"linear-gradient(135deg,#15803d,#166534)",borderRadius:14,padding:"16px 18px",marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:"rgba(255,255,255,0.8)",fontWeight:700,fontSize:13}}>💰 TOTAL A RECEBER</div>
              <div style={{fontWeight:900,fontSize:22,color:"#fff"}}>{_fvR(_totalGeral)}</div>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:4}}>{_detalhe.length} {_detalhe.length===1?"dia":"dias"} · {_todas.length} {_todas.length===1?"mudança":"mudanças"}</div>
          </div>
        </div>
      )}
    </div>
  );
})()}

      {tab==="lista"&&(
          <div>
            <div style={{padding:'8px 12px 0'}}><div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>{setFiltroMes('semana');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes==='semana'&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes==='semana'&&!filtroDataIni?'#fff':'#475569'}}>Semana</button><button onClick={()=>{setFiltroMes('mes_atual');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes==='mes_atual'&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes==='mes_atual'&&!filtroDataIni?'#fff':'#475569'}}>Mês Atual</button><button onClick={()=>{setFiltroMes('');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes===''&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes===''&&!filtroDataIni?'#fff':'#475569'}}>Todos</button></div><div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}><input type='date' value={filtroDataIni} onChange={e=>{setFiltroDataIni(e.target.value);setFiltroMes('datas');}} style={{flex:1,padding:'5px 8px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,color:'#334155'}} /><span style={{fontSize:11,color:'#94a3b8',whiteSpace:'nowrap'}}>até</span><input type='date' value={filtroDataFim} onChange={e=>{setFiltroDataFim(e.target.value);setFiltroMes('datas');}} style={{flex:1,padding:'5px 8px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,color:'#334155'}} /></div>{isAdmin&&<div style={{display:'flex',gap:6,alignItems:'center',marginBottom:6,marginTop:6}}><select value={filtroSup} onChange={function(e){setFiltroSup(e.target.value);}} style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1.5px solid '+(filtroSup?'#b45309':'#e2e8f0'),background:filtroSup?'#fef3c7':'#f8fafc',fontSize:12,fontWeight:600,color:filtroSup?'#92400e':'#64748b',cursor:'pointer'}}><option value="">👷 Supervisor: Todos</option>{listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;}).map(function(s){return <option key={s.id} value={s.id}>{s.nome}</option>;})}</select><button onClick={function(){var _fList=filtered;var _supNm=filtroSup?(listaUsuarios.find(function(u){return u.id===filtroSup;})||{}).nome||"":"Todos";var NL="%0A";var t="📊 *REGISTROS"+(filtroSup?" - "+_supNm.toUpperCase():"")+("*"+NL+"🗓️ "+(_fList.length)+" mudança"+(_fList.length!==1?"s":"")+NL+NL);var _byDate={};_fList.forEach(function(m){var d=m.data||"sem-data";if(!_byDate[d])_byDate[d]=[];_byDate[d].push(m);});Object.keys(_byDate).sort(function(a,b){return b.localeCompare(a);}).forEach(function(d){var p=d.split("-");t+="📅 "+(p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d)+NL;_byDate[d].forEach(function(m){t+="  👤 "+(m.nome||"—")+" · ⏰ "+(m.horario||"—")+"h · 📐 "+(m.medicao||"0")+" m³"+NL;});t+=NL;});t+="━━━━━━━━━━━━"+NL+"Total: "+_fList.length+" mudança"+(_fList.length!==1?"s":"")+NL+"— TELEMIM Mudanças";window.open("https://wa.me/?text="+encodeURIComponent(t),"_blank");}} style={{padding:'7px 10px',borderRadius:8,border:'none',background:'#25d366',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer'}}>📲</button><button onClick={function(){var _fList=filtered;var _supNm=filtroSup?(listaUsuarios.find(function(u){return u.id===filtroSup;})||{}).nome||"":"Todos";var NL="\n";var t="📊 REGISTROS"+(filtroSup?" - "+_supNm.toUpperCase():"")+NL+"Total: "+_fList.length+" mudança"+(_fList.length!==1?"s":"")+NL+NL;var _byDate={};_fList.forEach(function(m){var d=m.data||"sem-data";if(!_byDate[d])_byDate[d]=[];_byDate[d].push(m);});Object.keys(_byDate).sort(function(a,b){return b.localeCompare(a);}).forEach(function(d){var p=d.split("-");t+="📅 "+(p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d)+NL;_byDate[d].forEach(function(m){t+="  👤 "+(m.nome||"—")+" · ⏰ "+(m.horario||"—")+"h · 📐 "+(m.medicao||"0")+" m³"+NL;});t+=NL;});t+="━━━━━━━━━━━━━━━━━━"+NL+"Total: "+_fList.length+" mudança"+(_fList.length!==1?"s":"")+NL+NL+"— TELEMIM Mudanças";var _w=window.open("","_blank");_w.document.write("<html><head><title>Registros"+(filtroSup?" - "+_supNm:"")+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");_w.document.close();}} style={{padding:'7px 10px',borderRadius:8,border:'none',background:'#1e40af',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer'}}>📄</button></div>}</div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar nome, selo ou comunidade..."
              style={{width:"100%",background:"#fff",border:`1.5px solid ${COLORS.cardBorder}`,borderRadius:12,color:COLORS.text,padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:12,boxShadow:COLORS.shadow}}/>
            {filtered.map(m=>(
              <Card key={m.id} style={{marginBottom:10,padding:0,overflow:"hidden"}}>
                {/* ── Header azul ── */}
                <div style={{background:"linear-gradient(135deg,#1e3a8a,#1e40af)",padding:"14px 16px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:900,fontSize:18,color:"#fff",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>👤 {m.nome}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                        {m.selo&&<span style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontWeight:600}}>🏷️ {m.selo}</span>}
                        {m.data&&<span style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontWeight:600}}>📅 {m.data.slice(8)+"/"+m.data.slice(5,7)+"/"+m.data.slice(0,4)}</span>}
                      </div>
                    </div>
                    {!isMotorista&&verMed&&m.medicao&&<div style={{background:"rgba(255,255,255,0.2)",borderRadius:8,padding:"4px 10px",marginLeft:8}}><span style={{fontSize:13,fontWeight:800,color:"#fff"}}>📐 {m.medicao} m³</span></div>}
                  </div>
                </div>
                {/* ── Body ── */}
                <div style={{padding:"10px 16px 8px",fontSize:12,color:"#475569"}}>
                  <div style={{marginBottom:4}}>🕐 <b>Concluída em:</b> {m.termino_em?new Date(m.termino_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):m.criado_em?new Date(m.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
                    <span>{m.approved_by_promorar?<b style={{color:"#16a34a"}}>✅ {m.approved_by_promorar}</b>:<span style={{color:"#9ca3af"}}>⏳ Promorar</span>}</span>
                    <span>{m.approved_by_admin?<b style={{color:"#16a34a"}}>✅ {m.approved_by_admin}</b>:<span style={{color:"#9ca3af"}}>⏳ Admin</span>}</span>
                    <span>{m.approved_by_social?<b style={{color:"#16a34a"}}>✅ {m.approved_by_social}</b>:<span style={{color:"#9ca3af"}}>⏳ Social</span>}</span>
                    <span>{m.approved_by_supervisor?<b style={{color:"#16a34a"}}>✅ {m.approved_by_supervisor}</b>:<span style={{color:"#9ca3af"}}>⏳ Supervisor</span>}</span>
                  </div>
                  {(function(){var _vn=null,_cn=null;if(m.motorista_van_id){var _fv=listaUsuarios.find(function(u){return u.id===m.motorista_van_id;});if(_fv)_vn=_fv;}if(m.motorista_caminhao_id){var _fc=listaUsuarios.find(function(u){return u.id===m.motorista_caminhao_id;});if(_fc)_cn=_fc;}if(!_vn&&!_cn)return null;return(<div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:4,fontSize:11}}>{_vn&&<span><b style={{color:"#2563eb"}}>🚐 {_vn.nome}</b>{_vn.placa_veiculo?" · "+_vn.placa_veiculo:""}</span>}{_cn&&<span><b style={{color:"#7c3aed"}}>🚚 {_cn.nome}</b>{_cn.placa_veiculo?" · "+_cn.placa_veiculo:""}</span>}</div>);})()}
                  {(isAdmin||isSupervisor)&&(function(){var _motsV=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="VAN";});var _motsC=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="CAMINHAO";});var _ds={padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",width:"100%"};return <>{m.van&&_motsV.length>0&&<div style={{marginTop:4}}><label style={{fontSize:9,color:"#2563eb",fontWeight:700}}>🚐 Motorista Van</label><select value={m.motorista_van_id||""} onChange={function(e){handleDespacharMud(m.id,e.target.value||null,"VAN");}} style={Object.assign({},_ds,{border:"1px solid #93c5fd",background:"#eff6ff",color:"#2563eb"})}><option value="">— Sem motorista Van —</option>{_motsV.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}</option>);})}</select></div>}{m.caminhao&&_motsC.length>0&&<div style={{marginTop:4}}><label style={{fontSize:9,color:"#7c3aed",fontWeight:700}}>🚚 Motorista Caminhão</label><select value={m.motorista_caminhao_id||""} onChange={function(e){handleDespacharMud(m.id,e.target.value||null,"CAMINHAO");}} style={Object.assign({},_ds,{border:"1px solid #c4b5fd",background:"#f5f3ff",color:"#7c3aed"})}><option value="">— Sem motorista Caminhão —</option>{_motsC.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}</option>);})}</select></div>}</>;})()}
                </div>
                {/* ── Validação 3 vias ── */}
                {m.requires_validation&&<div style={{display:"flex",gap:3,padding:"6px 16px",borderTop:"1px solid #f1f5f9",flexWrap:"wrap"}}>{m.social_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Social</span>:usuario&&usuario.perfil==="social"?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"social");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Social</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Social</span>}{m.promorar_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Promorar</span>:usuario&&usuario.perfil==="promorar"?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"promorar");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Promorar</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Promorar</span>}{m.adm_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Adm</span>:usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim")?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"adm");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Adm</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Adm</span>}</div>}
                {/* ── Barra de ações ── */}
                <div style={{display:"flex",gap:6,padding:"8px 16px 12px",borderTop:"1px solid #e2e8f0",flexWrap:"wrap",alignItems:"center"}}>
                  {m.contato&&<button onClick={()=>{var tel=(m.contato||"").replace(/\D/g,"");var txt="\uD83D\uDE9A *TELEMIM — Sua Mudan\u00E7a*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nOl\u00E1 *"+m.nome+"*! \uD83D\uDC4B\nConfirmamos sua mudan\u00E7a:\n\uD83D\uDCC5 *Data:* "+_fmtDate(m.data)+"\n\uD83D\uDCCD *Sa\u00EDda:* "+(m.comunidade||m.origem||"-")+"\n\uD83D\uDCCD *Destino:* "+(m.destino||"-")+"\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nEm caso de d\u00FAvidas, entre em contacto. \uD83D\uDE0A\n_TELEMIM_";window.open("https://wa.me/55"+tel+"?text="+encodeURIComponent(txt),"_blank");}} style={{background:"#25d366",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}}>📱</button>}
                  <button onClick={()=>setViewMud(m)} style={{background:"#f0f9ff",border:"1.5px solid #0ea5e9",color:"#0ea5e9",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}}>👁️</button>
                  <button onClick={()=>compartilharMudanca(m)} style={{...btnGreen,borderRadius:8,padding:"6px 10px",fontSize:13}}>📲</button>
                  {m.signature_data
                    ? <button onClick={function(){setMudViewPDF(m);setShowViewPDF(true);}} style={{background:"#e0f2fe",border:"1.5px solid #0284c7",color:"#0284c7",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>📄 Assinado</button>
                    : <button onClick={()=>gerarPDFMudanca(m)} style={{background:"#fff7ed",border:"1.5px solid #ea580c",color:"#ea580c",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✍️ Assinar</button>}
                  {(isAdmin||isPromorar)&&<button onClick={()=>setEditMud((function(){var _cd=(custosDiarios||[]).find(function(x){return x.data===m.data;});return {...m,_qtdAj:_cd?parseInt(_cd.ajudantes)||1:1};})())} style={{...btnBlue,borderRadius:8,padding:"6px 10px",fontSize:13}}>✏️</button>}
                  {(usuario&&usuario.perfil==="admin")&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:m.id,nome:m.nome,tipo:"mud"});}} style={{...btnRed,borderRadius:8,padding:"6px 10px",fontSize:13}}>✕</button>}
                  {(isAdmin||isSupervisor)&&<button onClick={function(){var _eq=equipeDiaList.find(function(e){return e.data===m.data;});setViewEquipeAg({nome:m.nome,data:m.data,ajudantes:_eq&&Array.isArray(_eq.ajudantes)?_eq.ajudantes:[]});}} style={{background:"#fef9c3",border:"1.5px solid #fde047",color:"#92400e",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}} title="Ver equipe do dia">👷</button>}
                </div>
              </Card>
            ))}
            {filtered.length===0&&<div style={{textAlign:"center",color:COLORS.muted,padding:40,fontSize:14}}>Nenhum resultado.</div>}
          </div>
        )}

        {/* ══ AGENDA ══ */}
        {tab==="agenda"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:13}}>
              <div style={{fontSize:16,fontWeight:900,color:COLORS.text}}>📅 Mudanças Agendadas</div>
              <div style={{display:"flex",gap:7}}>
                {mudancasHoje.length>0&&(<>
                  <button onClick={()=>{
                    const lista=agendaOrdenada.filter(a=>a.data===hoje&&a.status!=="Concluído");
                    const linhas=lista.filter(function(a){return!_agendaRemovidaIds.has(a.id);}).map(a=>{const v=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ");return `👤 *${a.nome}*\n🏷️ Selo: ${a.selo||"—"} · ⏰ ${a.horario||"—"}h\n📍 ${a.comunidade||"—"}\n📦 Saída: ${a.origem||"—"}\n🏠 Chegada: ${a.destino||"—"}\n🚗 Veículos: ${v||"—"}${a.contato?`\n📞 ${a.contato}`:""}${a.medicao?`\n📐 ${a.medicao} m³`:""}`;});
                    const txt=`🚛 *TELEMIM — MUDANÇAS DO DIA*\n📅 *${new Date().toLocaleDateString("pt-BR")}*\n━━━━━━━━━━━━━━━━━\n${linhas.join("\n\n━━━━━━━━━━━━━━━━━\n")}\n\n━━━━━━━━━━━━━━━━━\n_Total: ${lista.length} mudança${lista.length!==1?"s":""} · TELEMIM_`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`,"_blank");
                  }} style={{background:"#dcfce7",border:"1.5px solid #16a34a",color:"#16a34a",borderRadius:10,padding:"7px 12px",fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📲 Dia ({mudancasHoje.length})</button>
                  </>
                )}
                <button onClick={_openRelModal} style={{background:COLORS.accent,border:"none",color:"#fff",borderRadius:10,padding:"7px 12px",fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📊 Gerar Relatório</button>
                <button onClick={()=>setTab("novaAgenda")} style={{background:COLORS.purple,color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontWeight:800,fontSize:12,cursor:"pointer",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>+ Agendar</button>
              </div>
            </div>
            {proximas.length>0&&(
              <div style={{marginBottom:16}}>
                {proximas.map(a=>(
                  <div id={"move-card-"+a.id}><Card key={a.id} style={{marginBottom:9,padding:"14px 16px",border:`1.5px solid ${statusColor[a.status]||COLORS.cardBorder}33`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:900,fontSize:24,color:COLORS.text,marginBottom:8}}>👤 {a.nome}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                          <TagSelo v={a.selo}/><TagData v={a.data}/><TagHora v={a.horario}/><TagCom v={a.comunidade}/>
                        </div>
                        <div style={{fontSize:12,lineHeight:1.9,background:"#f8fafc",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                          <div>📦 <strong>Saída:</strong> {a.origem?<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.origem)}`} target="_blank" style={{color:COLORS.blue,textDecoration:"none",fontWeight:600}}>{a.origem} 🗺️</a>:<span style={{color:COLORS.muted}}>—</span>}</div>
                          <div>🏠 <strong>Chegada:</strong> {a.destino?<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.destino)}`} target="_blank" style={{color:COLORS.blue,textDecoration:"none",fontWeight:600}}>{a.destino} 🗺️</a>:<span style={{color:COLORS.muted}}>—</span>}</div>
                          {a.contato&&<div>📞 <strong>Contato:</strong> <a href={`tel:${a.contato.replace(/\D/g,"")}`} style={{color:COLORS.green,textDecoration:"none",fontWeight:700}}>{a.contato} 📲</a></div>}
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>🚗 Veículos</div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={()=>toggleAgField(a.id,"van")} style={{padding:"7px 14px",borderRadius:10,border:`2px solid ${a.van?COLORS.blue:"#e2e8f0"}`,background:a.van?"#eff6ff":"#f8fafc",color:a.van?COLORS.blue:COLORS.muted,fontWeight:800,fontSize:13,cursor:"pointer",transition:"all 0.2s"}}>🚐 Van {a.van?"✓":"✗"}</button>
                            <button onClick={()=>toggleAgField(a.id,"caminhao")} style={{padding:"7px 14px",borderRadius:10,border:`2px solid ${a.caminhao?COLORS.accent:"#e2e8f0"}`,background:a.caminhao?"#fff7ed":"#f8fafc",color:a.caminhao?COLORS.accent:COLORS.muted,fontWeight:800,fontSize:13,cursor:"pointer",transition:"all 0.2s"}}>🚚 Caminhão {a.caminhao?"✓":"✗"}</button>
                          </div>
                        </div>
                        {!isAdmin&&(a.motorista_van_id||a.motorista_caminhao_id)&&(function(){var _vn=null,_cn=null;if(a.motorista_van_id){var _f=listaUsuarios.find(function(u){return u.id===a.motorista_van_id;});if(_f)_vn=_f;}if(a.motorista_caminhao_id){var _f2=listaUsuarios.find(function(u){return u.id===a.motorista_caminhao_id;});if(_f2)_cn=_f2;}if(!_vn&&!_cn)return null;return(<div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:6,fontSize:11}}>{_vn&&<span><b style={{color:"#2563eb"}}>🚐 {_vn.nome}</b>{_vn.placa_veiculo?" · "+_vn.placa_veiculo:""}</span>}{_cn&&<span><b style={{color:"#7c3aed"}}>🚚 {_cn.nome}</b>{_cn.placa_veiculo?" · "+_cn.placa_veiculo:""}</span>}</div>);})()}
                        {(isAdmin||isSupervisor)&&(function(){var _motsV=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="VAN";});var _motsC=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="CAMINHAO";});var _selStyle={flex:1,padding:"8px 10px",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"};var _okStyle={padding:"8px 12px",borderRadius:9,border:"none",fontWeight:800,fontSize:12,cursor:"pointer",color:"#fff",whiteSpace:"nowrap"};var _kV=a.id+"_VAN";var _kC=a.id+"_CAM";var _valV=despPend[_kV]!==undefined?despPend[_kV]:(a.motorista_van_id||"");var _valC=despPend[_kC]!==undefined?despPend[_kC]:(a.motorista_caminhao_id||"");var _changedV=despPend[_kV]!==undefined&&despPend[_kV]!==(a.motorista_van_id||"");var _changedC=despPend[_kC]!==undefined&&despPend[_kC]!==(a.motorista_caminhao_id||"");return(<div style={{marginBottom:10}}><div style={{color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>🚚 Despachar Motoristas</div>{a.van&&_motsV.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><select value={_valV} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kV]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valV?"#2563eb":"#e2e8f0"),background:_valV?"#eff6ff":"#f8fafc",color:_valV?"#2563eb":"#64748b"})}><option value="">🚐 Sem motorista Van</option>{_motsV.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}{mt.placa_veiculo?" · "+mt.placa_veiculo:""}</option>);})}</select><button onClick={function(){handleDespachar(a.id,_valV||null,"VAN");setDespPend(function(p){var n=Object.assign({},p);delete n[_kV];return n;});}} disabled={!_changedV} style={Object.assign({},_okStyle,{background:_changedV?"#2563eb":"#94a3b8",cursor:_changedV?"pointer":"not-allowed"})}>{_changedV?"✓ OK":"✓"}</button></div>}{a.caminhao&&_motsC.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><select value={_valC} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kC]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valC?"#7c3aed":"#e2e8f0"),background:_valC?"#f5f3ff":"#f8fafc",color:_valC?"#7c3aed":"#64748b"})}><option value="">🚚 Sem motorista Caminhão</option>{_motsC.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}{mt.placa_veiculo?" · "+mt.placa_veiculo:""}</option>);})}</select><button onClick={function(){handleDespachar(a.id,_valC||null,"CAMINHAO");setDespPend(function(p){var n=Object.assign({},p);delete n[_kC];return n;});}} disabled={!_changedC} style={Object.assign({},_okStyle,{background:_changedC?"#7c3aed":"#94a3b8",cursor:_changedC?"pointer":"not-allowed"})}>{_changedC?"✓ OK":"✓"}</button></div>}{(function(){var _sups=listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;});if(_sups.length===0)return null;var _kS=a.id+"_SUP";var _valS=despPend[_kS]!==undefined?despPend[_kS]:(a.supervisor_id||"");var _changedS=despPend[_kS]!==undefined&&despPend[_kS]!==(a.supervisor_id||"");return(<div style={{display:"flex",gap:6,alignItems:"center"}}><select value={_valS} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kS]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valS?"#b45309":"#e2e8f0"),background:_valS?"#fef3c7":"#f8fafc",color:_valS?"#92400e":"#64748b"})}><option value="">👷 Sem supervisor</option>{_sups.map(function(s){return(<option key={s.id} value={s.id}>{s.nome}</option>);})}</select><button onClick={function(){handleDespacharSup(a.id,_valS||null);setDespPend(function(p){var n=Object.assign({},p);delete n[_kS];return n;});}} disabled={!_changedS} style={Object.assign({},_okStyle,{background:_changedS?"#b45309":"#94a3b8",cursor:_changedS?"pointer":"not-allowed"})}>{_changedS?"✓ OK":"✓"}</button></div>);})()}</div>);})()}
                        {(usuario&&usuario.perfil!=="social")&&<div style={{display:"grid",gridTemplateColumns:(usuario&&(usuario.perfil==="admin"||usuario.perfil==="supervisor"))?"1fr 1fr":"1fr",gap:8,marginBottom:10}}>{(usuario&&usuario.perfil!=="social")&&<div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>📐 Medição (m³)</label>
                            <input type="number" placeholder="Ex: 27" value={a.medicao||""} onChange={e=>updateAgField(a.id,"medicao",e.target.value)}
                              style={{width:"100%",background:"#fff",border:`1.5px solid ${a.medicao?COLORS.green:COLORS.cardBorder}`,borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                              onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
                              onBlur={e=>e.target.style.border=`1.5px solid ${a.medicao?COLORS.green:COLORS.cardBorder}`}/>
                          </div>}
                          {(usuario&&(usuario.perfil==="admin"||usuario.perfil==="supervisor"))&&<div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>👷 Ajudantes</label>
                            <input type="number" placeholder="Ex: 3" value={a.ajudantes||""} onChange={e=>updateAgField(a.id,"ajudantes",e.target.value)}
                              style={{width:"100%",background:"#fff",border:`1.5px solid ${a.ajudantes?COLORS.green:COLORS.cardBorder}`,borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                              onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
                              onBlur={e=>e.target.style.border=`1.5px solid ${a.ajudantes?COLORS.green:COLORS.cardBorder}`}/>
                          </div>}
                        </div>}
                        {(isAdmin||isSupervisor)&&(function(){var _eqD=equipeDiaList.find(function(e){return e.data===a.data;});var _eqAj=_eqD&&Array.isArray(_eqD.ajudantes)?_eqD.ajudantes:[];return _eqAj.length>0?<div style={{marginBottom:8}}><div style={{display:"flex",flexWrap:"wrap",gap:4}}><span style={{fontSize:11,fontWeight:700,color:"#92400e"}}>👷 Equipe ({_eqAj.length}):</span>{_eqAj.map(function(aj){return <span key={aj.id} style={{background:"#dcfce7",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700,color:"#15803d"}}>{aj.nome}</span>;})}</div></div>:null;})()}
                        {a.cancelamento_solicitado&&<div style={{background:"#fef9c3",border:"1.5px solid #fde047",borderRadius:10,padding:"8px 12px",marginBottom:8}}>
                          <div style={{fontSize:11,fontWeight:800,color:"#92400e"}}>🟡 Cancelamento pendente</div>
                          <div style={{fontSize:10,color:"#78350f",marginTop:2}}>Solicitado por: {a.cancelamento_por} ({a.cancelamento_perfil})</div>
                          {a.cancelamento_motivo&&<div style={{fontSize:10,color:"#78350f",marginTop:1}}>Motivo: {a.cancelamento_motivo}</div>}
                          {isAdmin&&<div style={{display:"flex",gap:6,marginTop:6}}>
                            <button onClick={function(){handleRecusarCancelamento(a.id);}} style={{padding:"5px 12px",borderRadius:8,border:"1.5px solid #ef4444",background:"#fef2f2",color:"#dc2626",fontSize:10,fontWeight:700,cursor:"pointer"}}>❌ Recusar</button>
                            <button onClick={function(){handleAutorizarCancelamento(a.id);}} style={{padding:"5px 12px",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>✅ Autorizar Cancelamento</button>
                          </div>}
                        </div>}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={function(){pedirFinalizacao(a);}} disabled={_agendaRemovidaIds.has(a.id)} style={{background:_agendaRemovidaIds.has(a.id)?"#059669":"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:_agendaRemovidaIds.has(a.id)?"default":"pointer"}}>{_agendaRemovidaIds.has(a.id)?"✅ Concluído":"✅ Finalizar"}</button>
                            {(isSupervisor||isPromorar||isSocial)&&!a.cancelamento_solicitado&&<button onClick={function(){setCancelModal(a);setCancelMotivo("");}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Cancelar</button>}
                            {isAdmin&&!a.cancelamento_solicitado&&<button onClick={function(){if(confirm("Cancelar mudança de "+a.nome+"?\nEsta ação não pode ser desfeita.")){handleCancelarDireto(a.id);}}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Cancelar</button>}
                          </div>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {a.medicao&&<Badge color={COLORS.green}>📐 {a.medicao} m³</Badge>}
                            {a.ajudantes&&parseInt(a.ajudantes)>0&&<Badge color="#b45309">👷 {a.ajudantes} {parseInt(a.ajudantes)===1?"ajudante":"ajudantes"}</Badge>}
                            <button onClick={()=>compartilharWhatsApp(a)} style={{...btnGreen,fontSize:14,padding:"6px 10px"}}>📲</button>
                            <button onClick={e=>gerarPDFAgendamento(a,e.currentTarget)} style={{...btnRed,background:"#fff1f0",fontSize:14,padding:"6px 10px"}}>📄</button>
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:9}}>
                        <button onClick={()=>converterEmMudanca(a)} style={{background:"#f0fdf4",border:"none",color:COLORS.green,borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Converter em mudança">✅</button>
                        <button onClick={()=>setEditAg({...a})} style={btnBlue}>✏️</button>
                        {(usuario&&usuario.perfil==="admin")&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:a.id,nome:a.nome,tipo:"ag"});}} style={btnRed}>✕</button>}
                        {(isAdmin||isSupervisor)&&<button onClick={function(){var _eq=equipeDiaList.find(function(e){return e.data===a.data;});setViewEquipeAg({nome:a.nome,data:a.data,ajudantes:_eq&&Array.isArray(_eq.ajudantes)?_eq.ajudantes:[]});}} style={{background:"#fef9c3",border:"none",color:"#92400e",borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Ver equipe do dia">👷</button>}
                      </div>
                    </div>
                  
                  
                    {/* ── Carimbos de Aprovação (Agenda) ── */}
                    {(a.approved_by_admin||a.approved_by_social||a.approved_by_promorar||a.approved_by_supervisor||a.requested_by||
                    (usuario&&['admin','social','promorar','supervisor'].includes(usuario.perfil)))&&(
                    <div style={{borderTop:"1px solid #e2e8f0",marginTop:6,paddingTop:5,fontSize:11,color:"#475569"}}>
                      <div style={{marginBottom:3}}>📝 <b>Solicitado por:</b> {a.created_by||a.requested_by||"Sistema"}{a.criado_em?" · "+new Date(a.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <span>Promorar: {a.approved_by_promorar?<b style={{color:"#16a34a"}}>✅ {a.approved_by_promorar}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>
                        {usuario&&usuario.perfil==="promorar"&&!a.approved_by_promorar&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#7e22ce",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <span>Admin: {a.approved_by_admin?<b style={{color:"#16a34a"}}>✅ {a.approved_by_admin}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>
                        {usuario&&usuario.perfil==="admin"&&!a.approved_by_admin&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#1e40af",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <span>Social: {a.approved_by_social?<b style={{color:"#16a34a"}}>✅ {a.approved_by_social}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>
                        {usuario&&usuario.perfil==="social"&&!a.approved_by_social&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#0f766e",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>Supervisor: {a.approved_by_supervisor?<b style={{color:"#16a34a"}}>✅ {a.approved_by_supervisor}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>
                        {usuario&&usuario.perfil==="supervisor"&&!a.approved_by_supervisor&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#b45309",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}
                      </div>
                    </div>)}
                    </Card>
</div>                ))}
              </div>
            )}
            {agenda.length===0&&<div style={{textAlign:"center",color:COLORS.muted,padding:50,fontSize:14}}>Nenhuma mudança agendada.Clique em <strong style={{color:COLORS.purple}}>+ Agendar</strong>! 📅</div>}
          </div>
        )}

        {/* ══ NOVA AGENDA ══ */}
        {tab==="novaAgenda"&&(
          <Card>
            <div style={{fontSize:17,fontWeight:800,marginBottom:14,color:COLORS.purple}}>📅 Novo Agendamento</div>
            <button onClick={()=>{setShowImportAg(true);setImportTextAg("");}} style={{background:"#f5f3ff",border:"1.5px solid "+COLORS.purple,color:COLORS.purple,borderRadius:10,padding:"7px 14px",fontWeight:800,fontSize:12,cursor:"pointer"}}>📥 Importar Solicitação</button>
            <Inp label="Nome" icon="👤" value={agForm.nome} onChange={v=>setAgForm(f=>({...f,nome:v}))} placeholder="Nome completo"/>
            <Inp label="Selo" icon="🏷️" value={agForm.selo||""} onChange={v=>setAgForm(f=>({...f,selo:v}))} placeholder="Ex: VT-020-021-A"/>
            <Inp label="Comunidade" icon="📍" value={agForm.comunidade||""} onChange={v=>setAgForm(f=>({...f,comunidade:v}))} placeholder="Nome da comunidade"/>
            <Inp label="Data" icon="📅" type="date" value={agForm.data} onChange={v=>setAgForm(f=>({...f,data:v}))}/>
            <Inp label="Horário" icon="⏰" type="time" value={agForm.horario||""} onChange={v=>setAgForm(f=>({...f,horario:v}))}/>
            <Inp label="Saída" icon="📦" value={agForm.origem||""} onChange={v=>setAgForm(f=>({...f,origem:v}))} placeholder="Endereço de origem"/>
            <Inp label="Chegada" icon="🏠" value={agForm.destino||""} onChange={v=>setAgForm(f=>({...f,destino:v}))} placeholder="Endereço de destino"/>
            <Inp label="Contato" icon="📞" value={agForm.contato||""} onChange={v=>setAgForm(f=>({...f,contato:v}))} placeholder="Ex: 81 99999-9999"/>
            <Tog label="🚐 Van" value={agForm.van} onChange={v=>setAgForm(f=>({...f,van:v}))}/>
            <Tog label="🚚 Caminhão" value={agForm.caminhao||false} onChange={v=>setAgForm(f=>({...f,caminhao:v}))}/>
            <div style={{marginBottom:12}}>
              <label style={{display:"block",color:COLORS.muted,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:6,textTransform:"uppercase"}}>📋 Status</label>
              <div style={{display:"flex",gap:7}}>
                {["confirmado","pendente"].map(s=>(
                  <button key={s} onClick={()=>setAgForm(f=>({...f,status:s}))} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${agForm.status===s?statusColor[s]:COLORS.cardBorder}`,background:agForm.status===s?statusColor[s]+"18":"#f8fafc",color:agForm.status===s?statusColor[s]:COLORS.muted,fontWeight:700,fontSize:12,cursor:"pointer"}}>{statusLabel[s]}</button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={()=>setTab("agenda")} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${COLORS.cardBorder}`,background:"transparent",color:COLORS.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Cancelar</button>
              <button onClick={handleAddAg} style={{flex:2,padding:12,borderRadius:12,border:"none",background:COLORS.purple,color:"#fff",fontWeight:900,fontSize:14,cursor:"pointer"}}>{flash||"📅 Confirmar"}</button>
            </div>
          </Card>
        )}

        {/* ══ NOVA MUDANÇA ══ */}
        {tab==="novo"&&(
          <Card>
            <div style={{fontSize:17,fontWeight:800,marginBottom:14,color:COLORS.accent}}>➕ Nova Mudança Realizada</div>
            <button onClick={()=>{setShowImport(true);setImportText("");}} style={{background:"#eff6ff",border:"1.5px solid "+COLORS.blue,color:COLORS.blue,borderRadius:10,padding:"7px 14px",fontWeight:800,fontSize:12,cursor:"pointer"}}>📥 Importar Solicitação</button>
            <Inp label="Nome" icon="👤" value={form.nome} onChange={v=>setForm(f=>({...f,nome:v}))} placeholder="Nome completo"/>
            <Inp label="Selo" icon="🏷️" value={form.selo} onChange={v=>setForm(f=>({...f,selo:v}))} placeholder="Ex: VT-020-001 A"/>
            <Inp label="Comunidade" icon="📍" value={form.comunidade} onChange={v=>setForm(f=>({...f,comunidade:v}))} placeholder="Nome da comunidade"/>
            <Inp label="Data" icon="📅" type="date" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))}/>
            <Inp label="Origem" icon="📦" value={form.origem} onChange={v=>setForm(f=>({...f,origem:v}))} placeholder="Endereço de origem"/>
            <Inp label="Destino" icon="🏠" value={form.destino} onChange={v=>setForm(f=>({...f,destino:v}))} placeholder="Endereço de destino"/>
            <Inp label="Telef. Morador" icon="📱" value={form.contato} onChange={v=>setForm(f=>({...f,contato:v}))} placeholder="Ex: 81 9 8888-1234" type="tel"/>
            <Inp label="Medição (m³)" icon="📐" type="number" value={form.medicao} onChange={v=>setForm(f=>({...f,medicao:v}))} placeholder="Ex: 27"/>
            <Tog label="🚐 Van" value={form.van} onChange={v=>setForm(f=>({...f,van:v}))}/>
            <button onClick={handleAddMud} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:COLORS.accent,color:"#fff",fontWeight:900,fontSize:15,cursor:"pointer",boxShadow:"0 2px 8px rgba(230,126,34,0.3)"}}>
              {flash||"💾 Salvar Mudança"}
            </button>
          </Card>
        )}

        {/* ══ RELATÓRIO ══ */}
        {tab==="financeiro"&&isAdmin&&periodoFin!=="simples"&&periodoFin!=="completo"&&(function(){
          var _now=new Date();
          var _am=_now.getFullYear()+"-"+(String(_now.getMonth()+1).padStart(2,"0"));
          var _fv=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
          var _fvs=function(v){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v||0);};
          var _nm=new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^./,function(s){return s.toUpperCase();});
          // Filtrar dados do mês — usar slice(0,7) === _am (formato ISO YYYY-MM)
          var _mudM=(_allForFiltered||[]).filter(function(m){return m.data&&m.data.slice(0,7)===_am;});
          var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===_am;});
          var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===_am;});
          // Usar função centralizada — MESMA lógica que aba Contas
          var _r=_calcCustos(_mudM,_cdM,_cpM,RULES);var _csM=(contasSemana||[]).filter(function(x){return x.semana_inicio&&x.semana_inicio.slice(0,7)===_am&&["caminhao","van","ajudante","almoco"].includes(x.tipo)&&x.tipo_conta!=="receber";});if(_csM.length>0){var _getEdited=function(tp){var _items=_csM.filter(function(x){return x.tipo===tp&&x.valor_editado;});return _items.length>0?_items.reduce(function(s,x){return s+(parseFloat(x.valor_editado)||0);},0):null;};var _eCam=_getEdited("caminhao");var _eVan=_getEdited("van");var _eAj=_getEdited("ajudante");var _eAlm=_getEdited("almoco");_r=Object.assign({},_r,{cCam:_eCam!==null?_eCam:_r.cCam,cVan:_eVan!==null?_eVan:_r.cVan,cAj:_eAj!==null?_eAj:_r.cAj,cAlm:_eAlm!==null?_eAlm:_r.cAlm});_r.despTotal=_r.cCam+_r.cVan+_r.cAj+_r.cAlm+_r.cDesp+_r.cExtra;}
          return (
            <div style={{padding:"12px 12px 0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                📊 Gerencial — {_nm}
              </div>
              {(function(){
  // Faturamento médio diário (mês)
  var _fatDiaMed=_r.fatBruto>0&&_mudM.length>0
    ?_r.fatBruto/[...new Set(_mudM.map(function(m){return m.data;}))].length
    :0;
  // Faturamento semanal (semana actual)
  var _hj2=new Date();
  var _dw2=_hj2.getDay();var _dif2=_dw2===0?6:_dw2-1;
  var _s0w=new Date(_hj2.getFullYear(),_hj2.getMonth(),_hj2.getDate()-_dif2);
  var _s1w=new Date(_s0w.getFullYear(),_s0w.getMonth(),_s0w.getDate()+6);
  var _p2=function(n){return String(n).padStart(2,"0");};
  var _si2=_s0w.getFullYear()+"-"+_p2(_s0w.getMonth()+1)+"-"+_p2(_s0w.getDate());
  var _sf2=_s1w.getFullYear()+"-"+_p2(_s1w.getMonth()+1)+"-"+_p2(_s1w.getDate());
  var _mudSem=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data>=_si2&&m.data<=_sf2;});
  var _rSem=_calcCustos(_mudSem,(custosDiarios||[]).filter(function(cd){return cd.data>=_si2&&cd.data<=_sf2;}),(contasPagar||[]).filter(function(cp){return cp.data&&cp.data>=_si2&&cp.data<=_sf2;}),RULES);
  var _fatSem=_rSem.fatBruto;
  var _diasSem=[...new Set(_mudSem.map(function(m){return m.data;}))].length;
  return(
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
    <div style={{background:"linear-gradient(135deg,#fff7ed,#ffedd5)",border:"2px solid #fb923c",borderRadius:14,padding:"12px 12px 10px"}}>
      {(function(){
        var _hj3=new Date();
        var _p3=function(n){return String(n).padStart(2,"0");};
        var _hoje3=_hj3.getFullYear()+"-"+_p3(_hj3.getMonth()+1)+"-"+_p3(_hj3.getDate());
        var _mudHj=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data===_hoje3;});
        var _m3Hj=_mudHj.reduce(function(s,m){return s+(parseFloat(m.medicao)||0);},0);
        var _valMud=_m3Hj*(parseFloat(RULES.medicaoPorM3)||150);
        var _valVan=_mudHj.some(function(m){return m.van;})?( parseFloat(RULES.vanGanho)||1000):0;
        var _totalDia=_valMud+_valVan;
        return(
          <div>
            <div style={{fontSize:10,color:"#ea580c",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>⚡ Faturamento Diário</div>
            <div style={{fontSize:18,fontWeight:900,color:"#c2410c",marginBottom:8}}>{"R$ "+_fvs(_totalDia)}</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <div style={{display:"flex",justifyContent:"space-between",background:"rgba(234,88,12,0.08)",borderRadius:6,padding:"3px 6px"}}>
                <span style={{fontSize:10,color:"#9a3412"}}>💼 Mudanças ({_m3Hj}m³ × R${parseFloat(RULES.medicaoPorM3)||150})</span>
                <span style={{fontSize:10,fontWeight:700,color:"#c2410c"}}>{"R$ "+_fvs(_valMud)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",background:"rgba(234,88,12,0.08)",borderRadius:6,padding:"3px 6px"}}>
                <span style={{fontSize:10,color:"#9a3412"}}>🚐 Van (diária)</span>
                <span style={{fontSize:10,fontWeight:700,color:"#c2410c"}}>{"R$ "+_fvs(_valVan)}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
   <div style={{background:"linear-gradient(135deg,#faf5ff,#ede9fe)",border:"2px solid #a78bfa",borderRadius:14,padding:"12px 12px 10px"}}>
      <div style={{fontSize:10,color:"#7c3aed",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>📅 Fat. Semana Atual</div>
      <div style={{fontSize:18,fontWeight:900,color:"#5b21b6",marginBottom:4}}>{"R$ "+_fvs(_fatSem)}</div>
      <div style={{fontSize:10,color:"#4c1d95",background:"rgba(124,58,237,0.1)",borderRadius:6,padding:"2px 6px",display:"inline-block"}}>{"mudancas: "+_mudSem.length+" • "+_diasSem+" "+((_diasSem===1)?"dia":"dias")}</div>
    </div>
  </div>
  );
})()}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div style={{background:"#fff5f5",border:"2px solid #fca5a5",borderRadius:14,padding:"12px 12px 10px"}}>
                  <div style={{fontSize:10,color:"#ef4444",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>
                    💸 Despesa Total
                  </div>
                  <div style={{fontSize:18,fontWeight:900,color:"#dc2626",marginBottom:8}}>{"R$ "+_fvs(_r.despTotal)}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {[
                      {ic:"🚚",lbl:"Caminhão",v:_r.cCam},
                      {ic:"🚐",lbl:"Van",v:_r.cVan},
                      {ic:"👷",lbl:"Ajudante",v:_r.cAj},
                      {ic:"🍛",lbl:"Almoço+Extra",v:_r.cAlm+_r.cExtra}
                    ].map(function(k,i){return(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(220,38,38,0.06)",borderRadius:6,padding:"2px 6px"}}>
                        <span style={{fontSize:10,color:"#991b1b"}}>{k.ic} {k.lbl}</span>
                        <span style={{fontSize:10,fontWeight:700,color:"#dc2626"}}>{"R$ "+_fvs(k.v)}</span>
                      </div>
                    );})
                    }
                  </div>
                </div>
                <div style={{background:"#f0fdf4",border:"2px solid #86efac",borderRadius:14,padding:"12px 12px 10px"}}>
                  <div style={{fontSize:10,color:"#16a34a",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>
                    💰 Receita Bruta
                  </div>
                  <div style={{fontSize:18,fontWeight:900,color:"#15803d",marginBottom:8}}>{"R$ "+_fvs(_r.fatBruto)}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {[
                      {ic:"📦",lbl:"Mudanças",v:_r.numMud,unit:""},
                      {ic:"📏",lbl:"Metragem",v:_r.m3Total.toFixed(0),unit:" m³"},
                      {ic:"🚐",lbl:"Vans",v:_r.numVan,unit:""}
                    ].map(function(k,i){return(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(21,128,61,0.07)",borderRadius:6,padding:"2px 6px"}}>
                        <span style={{fontSize:10,color:"#166534"}}>{k.ic} {k.lbl}</span>
                        <span style={{fontSize:10,fontWeight:700,color:"#16a34a"}}>{k.v}{k.unit}</span>
                      </div>
                    );})
                    }
                  </div>
                </div>
              </div>
              <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e40af)",borderRadius:14,padding:"16px 16px 14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.65)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Receita Líquida (após impostos)</div>
                    <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.85)",marginTop:2}}>{"R$ "+_fvs(_r.fatLiq)}</div>
                    <div style={{marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                      <span style={{background:"rgba(34,197,94,0.25)",border:"1px solid rgba(34,197,94,0.5)",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700,color:"#86efac"}}>
                        {_r.fatBruto>0?((_r.fatLiq/_r.fatBruto)*100).toFixed(1)+"%":"0%"} lucro líquido
                      </span>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.65)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Impostos ({((RULES.imposto||0)*100).toFixed(0)}%)</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#fbbf24",marginTop:2}}>{"R$ "+_fvs(_r.imposto)}</div>
                  </div>
                </div>
                <div style={{paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.15)"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.65)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>🚀 Lucro Líquido</div>
                  <div style={{fontSize:28,fontWeight:900,color:_r.lucroLiq>=0?"#4ade80":"#f87171"}}>{"R$ "+_fvs(_r.lucroLiq)}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",marginTop:4}}>Receita Líquida menos todas as despesas do mês</div>
                </div>
              </div>
            </div>
          );
        })()}
        {tab==="financeiro"&&isAdmin&&(()=>{
return(<div style={{display:'flex',gap:4,padding:'12px 12px 0',background:'#f8fafc',flexWrap:'wrap'}}>{[{v:'semana',l:'Semana'},{v:'mes_atual',l:'Mês Atual'},{v:'mes_ant',l:'Mês Ant.'},{v:'simples',l:'📊 Simples'},{v:'completo',l:'📋 Completo'}].map(function(p){return(<button key={p.v} onClick={()=>setPeriodoFin(p.v)} style={{flex:1,padding:'8px 2px',borderRadius:10,border:'none',background:periodoFin===p.v?'#1e40af':'#e2e8f0',color:periodoFin===p.v?'#fff':'#475569',fontSize:10,fontWeight:periodoFin===p.v?700:500,cursor:'pointer',minWidth:p.v==='simples'||p.v==='completo'?'auto':'0'}}>{p.l}</button>);})}</div>);
})()}
        {tab==="financeiro"&&isAdmin&&periodoFin!=="simples"&&periodoFin!=="completo"&&(()=>{
var _tipos2=[{tp:"caminhao",ico:"🚚",lbl:"Caminhão"},{tp:"van",ico:"🚐",lbl:"Van"},{tp:"ajudante",ico:"👷",lbl:"Ajudante"},{tp:"almoco",ico:"🍽️",lbl:"Almoço"}];
var _semFin=[];
var _hjFin=new Date();
var _p2f=function(n){return String(n).padStart(2,"0");};
var _fmtD2=function(dt){return dt.getFullYear()+"-"+_p2f(dt.getMonth()+1)+"-"+_p2f(dt.getDate());};
if(periodoFin==='semana'){
  var _dwF=_hjFin.getDay();var _difF=_dwF===0?6:_dwF-1;
  var _s0F=new Date(_hjFin.getFullYear(),_hjFin.getMonth(),_hjFin.getDate()-_difF);
  var _s1F=new Date(_s0F.getFullYear(),_s0F.getMonth(),_s0F.getDate()+6);
  _semFin.push({si:_fmtD2(_s0F),sf:_fmtD2(_s1F)});
}else{
  var _tgM=_hjFin.getMonth();var _tgY=_hjFin.getFullYear();
  if(periodoFin==='mes_ant'){_tgM--;if(_tgM<0){_tgM=11;_tgY--;}}
  var _diaM=new Date(_tgY,_tgM,1);
  while(_diaM.getMonth()===_tgM){var _dwFin=_diaM.getDay();var _diffFin=_dwFin===0?6:_dwFin-1;var _s0Fin=new Date(_diaM);_s0Fin.setDate(_diaM.getDate()-_diffFin);var _s1Fin=new Date(_s0Fin);_s1Fin.setDate(_s0Fin.getDate()+6);var _siF=_fmtD2(_s0Fin);if(!_semFin.find(function(x){return x.si===_siF;}))_semFin.push({si:_siF,sf:_fmtD2(_s1Fin)});_diaM.setDate(_diaM.getDate()+7);}
}
var _fV3=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2});};
var _fD3=function(d){if(!d)return "";var p=d.split("-");return p[2]+"/"+p[1];};
return(
<div style={{paddingBottom:80}}>
  <div style={{background:'linear-gradient(135deg,#1e293b,#1e40af)',padding:'20px 16px 24px'}}><div style={{fontSize:12,color:'rgba(255,255,255,0.65)',marginBottom:2}}>Painel Financeiro</div><div style={{fontSize:21,fontWeight:800,color:'#fff'}}>{(function(){if(periodoFin==='semana'){var d=new Date();var ds=d.getDay();var s0=new Date(d);s0.setDate(d.getDate()-ds+(ds===0?-6:1));var s1=new Date(s0);s1.setDate(s0.getDate()+6);var fmt=function(dt){return dt.getDate()+'/'+(dt.getMonth()+1);};return 'Semana: '+fmt(s0)+' a '+fmt(s1)+'/'+s1.getFullYear();}if(periodoFin==='mes_ant'){var dm=new Date();dm.setDate(1);dm.setMonth(dm.getMonth()-1);return dm.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^\w/,function(s){return s.toUpperCase();});}return new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^\w/,function(s){return s.toUpperCase();});})()}</div></div>
  <div style={{padding:"12px 12px 0"}}>
    <div style={{fontWeight:800,fontSize:14,color:"#1e293b",marginBottom:10,display:"flex",alignItems:"center",gap:6}}><span>📅</span> Custos do Período</div>
    {_semFin.length===0&&<div style={{textAlign:"center",color:"#94a3b8",padding:24,fontSize:13}}>Nenhuma semana neste período</div>}
    {_semFin.map(function(_sem2){
      var _its2=contasSemana.filter(function(x){return x.semana_inicio===_sem2.si&&["caminhao","van","ajudante","almoco"].includes(x.tipo);});
      var _mudSem2=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data>=_sem2.si&&m.data<=_sem2.sf;});
      var _cdSem2=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data>=_sem2.si&&cd.data<=_sem2.sf;});
      var _rSem2=_calcCustos(_mudSem2,_cdSem2,[],RULES);
      var _calcMap2={caminhao:_rSem2.cCam,van:_rSem2.cVan,ajudante:_rSem2.cAj,almoco:_rSem2.cAlm};
      var _totalSem2=_tipos2.reduce(function(s,t){var _it=_its2.find(function(x){return x.tipo===t.tp;});return s+((_it&&_it.valor_editado)?parseFloat(_it.valor_editado):(_calcMap2[t.tp]||0));},0);
      return(
        <div key={_sem2.si} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:700,fontSize:12,color:"#64748b"}}>📆 {_fD3(_sem2.si)} a {_fD3(_sem2.sf)}</span><span style={{fontWeight:800,fontSize:13,color:_totalSem2>0?"#dc2626":"#94a3b8"}}>{_fV3(_totalSem2)}</span></div>
          {_tipos2.map(function(_t2){
            var _it2=_its2.find(function(x){return x.tipo===_t2.tp;});
            var _val2=(_it2&&_it2.valor_editado)?parseFloat(_it2.valor_editado):(_calcMap2[_t2.tp]||0);
            var _ek2=_sem2.si+"_"+_t2.tp;
            return(
              <div key={_t2.tp} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                <span style={{fontSize:16,minWidth:24}}>{_t2.ico}</span>
                <span style={{flex:1,fontSize:12,color:"#334155",fontWeight:600}}>{_t2.lbl}</span>
                {contaEditId===_ek2
                  ?<div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <input autoFocus type="number" step="0.01" defaultValue={_val2.toFixed(2)} onChange={function(e){setContaEditVal(e.target.value);}} style={{width:100,padding:"3px 8px",borderRadius:6,border:"1.5px solid #1e40af",fontSize:12}} />
                    <button onClick={function(){var _nv2=parseFloat(contaEditVal);if(isNaN(_nv2)){setContaEditId(null);return;}if(_it2){fetch(SUPA_URL+"/rest/v1/contas_semana?id=eq."+_it2.id,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor_editado:_nv2,valor_calculado:_nv2})}).then(function(){setContasSemana(function(p){return p.map(function(x){return x.id===_it2.id?Object.assign({},x,{valor_editado:_nv2,valor_calculado:String(_nv2)}):x;});});});}else{fetch(SUPA_URL+"/rest/v1/contas_semana",{method:"POST",headers:{...getH(),"Prefer":"return=representation"},body:JSON.stringify({semana_inicio:_sem2.si,semana_fim:_sem2.sf,tipo:_t2.tp,tipo_conta:"pagar",valor_calculado:_nv2,valor_editado:_nv2,qtd_mudancas:0,status:"pendente"})}).then(function(r){return r.json();}).then(function(_j2){if(_j2&&_j2[0])setContasSemana(function(p){return p.concat([_j2[0]]);});});}setContaEditId(null);setContaEditVal("");}} style={{padding:"3px 8px",background:"#1e40af",color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer",fontWeight:700}}>✓</button>
                    <button onClick={function(){setContaEditId(null);setContaEditVal("");}} style={{padding:"3px 8px",background:"#e2e8f0",color:"#475569",border:"none",borderRadius:6,fontSize:12,cursor:"pointer"}}>✕</button>
                  </div>
                  :<div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:13,fontWeight:700,color:_val2>0?"#1e293b":"#94a3b8"}}>{_fV3(_val2)}</span>
                    <button onClick={function(){setContaEditId(_ek2);setContaEditVal(_val2.toFixed(2));}} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"2px 6px",cursor:"pointer",fontSize:11,color:"#64748b"}}>✏️</button>
                  </div>
                }
              </div>);
          })}
        </div>);
    })}
  </div>
</div>);
})()}
        </div>
{tab==="financeiro"&&isAdmin&&periodoFin!=="simples"&&periodoFin!=="completo"&&(function(){
  var _pc=function(n){return String(n).padStart(2,"0");};
  var _hj=new Date();
  var _si,_sf,_periodoLbl;
  if(periodoFin==="semana"){
    var _dw=_hj.getDay();var _df=_dw===0?6:_dw-1;
    var _s0=new Date(_hj.getFullYear(),_hj.getMonth(),_hj.getDate()-_df);
    var _s1=new Date(_s0.getFullYear(),_s0.getMonth(),_s0.getDate()+6);
    var _fd=function(d){return d.getFullYear()+"-"+_pc(d.getMonth()+1)+"-"+_pc(d.getDate());};
    var _fb=function(d){return _pc(d.getDate())+"/"+_pc(d.getMonth()+1)+"/"+d.getFullYear();};
    _si=_fd(_s0);_sf=_fd(_s1);_periodoLbl=_fb(_s0)+" a "+_fb(_s1);
  }else if(periodoFin==="mes_ant"){
    var _dm=new Date(_hj.getFullYear(),_hj.getMonth()-1,1);
    var _ul=new Date(_hj.getFullYear(),_hj.getMonth(),0);
    _si=_dm.getFullYear()+"-"+_pc(_dm.getMonth()+1)+"-01";
    _sf=_ul.getFullYear()+"-"+_pc(_ul.getMonth()+1)+"-"+_pc(_ul.getDate());
    _periodoLbl="01/"+_pc(_dm.getMonth()+1)+"/"+_dm.getFullYear()+" a "+_pc(_ul.getDate())+"/"+_pc(_ul.getMonth()+1)+"/"+_ul.getFullYear();
  }else{
    _si=_hj.getFullYear()+"-"+_pc(_hj.getMonth()+1)+"-01";
    var _uf=new Date(_hj.getFullYear(),_hj.getMonth()+1,0);
    _sf=_uf.getFullYear()+"-"+_pc(_uf.getMonth()+1)+"-"+_pc(_uf.getDate());
    _periodoLbl="01/"+_pc(_hj.getMonth()+1)+"/"+_hj.getFullYear()+" a "+_pc(_uf.getDate())+"/"+_pc(_uf.getMonth()+1)+"/"+_uf.getFullYear();
  }
  var _ms=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data>=_si&&m.data<=_sf;});
  return(
    <div style={{padding:"0 12px",marginTop:10,marginBottom:10}}>
      <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 14px 10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:800,fontSize:13,color:"#1e293b"}}>📋 Relatório por Motorista</div>
          <div style={{fontSize:10,color:"#64748b"}}>{_periodoLbl}</div>
        </div>
        {_renderRelatorioMotoristas(_ms,_periodoLbl)}
      </div>
    </div>
  );
})()}
{/* ══ RELATÓRIO SIMPLES ══ */}
{tab==="financeiro"&&isAdmin&&periodoFin==="simples"&&(function(){
  var _pc=function(n){return String(n).padStart(2,"0");};
  var _fvR=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
  var _hj=new Date();
  // Gerar últimos 6 meses
  var _meses=[];
  for(var i=0;i<=5;i++){
    var d=new Date(_hj.getFullYear(),_hj.getMonth()-i,1);
    var ym=d.getFullYear()+"-"+_pc(d.getMonth()+1);
    var lbl=d.toLocaleDateString("pt-BR",{month:"short",year:"numeric"}).replace(/^\w/,function(s){return s.toUpperCase();});
    _meses.push({ym:ym,lbl:lbl});
  }
  var _rows=_meses.map(function(mes){
    var _mudM=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===mes.ym;});
    var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===mes.ym;});
    var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===mes.ym;});
    var r=_calcCustos(_mudM,_cdM,_cpM,RULES);
    return {lbl:mes.lbl,ym:mes.ym,receita:r.fatBruto,despesa:r.despTotal,lucro:r.fatBruto-r.despTotal,numMud:_mudM.length};
  });
  var _totRec=_rows.reduce(function(s,r){return s+r.receita;},0);
  var _totDesp=_rows.reduce(function(s,r){return s+r.despesa;},0);
  var _totLuc=_totRec-_totDesp;

  function _gerarPdfSimples(){
    _loadJsPDF().then(function(JsPDF){
      var doc=new JsPDF({unit:"mm",format:"a4"});
      doc.setFontSize(16);doc.setFont(undefined,"bold");
      doc.text("Relatório Financeiro - Simples",14,20);
      doc.setFontSize(10);doc.setFont(undefined,"normal");
      doc.text("Gerado em: "+new Date().toLocaleDateString("pt-BR"),14,28);
      var head=[["Mês","Mudanças","Receita","Despesa","Lucro"]];
      var body=_rows.map(function(r){return [r.lbl,String(r.numMud),_fvR(r.receita),_fvR(r.despesa),_fvR(r.lucro)];});
      body.push(["TOTAL",String(_rows.reduce(function(s,r){return s+r.numMud;},0)),_fvR(_totRec),_fvR(_totDesp),_fvR(_totLuc)]);
      doc.autoTable({head:head,body:body,startY:34,styles:{fontSize:10,cellPadding:3},headStyles:{fillColor:[30,64,175]},footStyles:{fillColor:[241,245,249]},alternateRowStyles:{fillColor:[248,250,252]}});
      doc.save("relatorio-simples.pdf");
    });
  }
  function _zapSimples(){
    var NL="%0A";var t="📊 *Relatório Financeiro Simples*"+NL+NL;
    _rows.forEach(function(r){
      t+="📅 *"+r.lbl+"*"+NL;
      t+="  Mudanças: "+r.numMud+NL;
      t+="  Receita: "+_fvR(r.receita)+NL;
      t+="  Despesa: "+_fvR(r.despesa)+NL;
      t+="  Lucro: "+_fvR(r.lucro)+NL+NL;
    });
    t+="━━━━━━━━━━━━━━━━"+NL;
    t+="💰 *TOTAL*"+NL;
    t+="  Receita: "+_fvR(_totRec)+NL;
    t+="  Despesa: "+_fvR(_totDesp)+NL;
    t+="  Lucro: "+_fvR(_totLuc)+NL;
    window.open("https://wa.me/?text="+t,"_blank");
  }

  return(
    <div style={{padding:"12px",paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#1e40af)",padding:"16px",borderRadius:14,marginBottom:12}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.65)"}}>📊 Relatório Simples</div>
        <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>Últimos 6 meses</div>
      </div>
      <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,overflow:"hidden",marginBottom:12}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:"#1e40af",color:"#fff"}}>
              <th style={{padding:"8px 6px",textAlign:"left",fontWeight:700}}>Mês</th>
              <th style={{padding:"8px 6px",textAlign:"right",fontWeight:700}}>Mud.</th>
              <th style={{padding:"8px 6px",textAlign:"right",fontWeight:700}}>Receita</th>
              <th style={{padding:"8px 6px",textAlign:"right",fontWeight:700}}>Despesa</th>
              <th style={{padding:"8px 6px",textAlign:"right",fontWeight:700}}>Lucro</th>
            </tr>
          </thead>
          <tbody>
            {_rows.map(function(r,i){return(
              <tr key={r.ym} style={{background:i%2===0?"#fff":"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
                <td style={{padding:"8px 6px",fontWeight:600,color:"#334155"}}>{r.lbl}</td>
                <td style={{padding:"8px 6px",textAlign:"right",color:"#64748b"}}>{r.numMud}</td>
                <td style={{padding:"8px 6px",textAlign:"right",color:"#16a34a",fontWeight:600}}>{_fvR(r.receita)}</td>
                <td style={{padding:"8px 6px",textAlign:"right",color:"#dc2626",fontWeight:600}}>{_fvR(r.despesa)}</td>
                <td style={{padding:"8px 6px",textAlign:"right",color:r.lucro>=0?"#15803d":"#dc2626",fontWeight:700}}>{_fvR(r.lucro)}</td>
              </tr>
            );})}
            <tr style={{background:"#1e293b",color:"#fff",fontWeight:800}}>
              <td style={{padding:"10px 6px"}}>TOTAL</td>
              <td style={{padding:"10px 6px",textAlign:"right"}}>{_rows.reduce(function(s,r){return s+r.numMud;},0)}</td>
              <td style={{padding:"10px 6px",textAlign:"right",color:"#4ade80"}}>{_fvR(_totRec)}</td>
              <td style={{padding:"10px 6px",textAlign:"right",color:"#fca5a5"}}>{_fvR(_totDesp)}</td>
              <td style={{padding:"10px 6px",textAlign:"right",color:_totLuc>=0?"#4ade80":"#fca5a5"}}>{_fvR(_totLuc)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={_gerarPdfSimples} style={{flex:1,padding:"12px",background:"#dc2626",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>📄 Exportar PDF</button>
        <button onClick={_zapSimples} style={{flex:1,padding:"12px",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>📲 WhatsApp</button>
      </div>
    </div>
  );
})()}
{/* ══ RELATÓRIO COMPLETO ══ */}
{tab==="financeiro"&&isAdmin&&periodoFin==="completo"&&(function(){
  var _pc=function(n){return String(n).padStart(2,"0");};
  var _fvR=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
  var _hj=new Date();
  var _meses=[];
  for(var i=0;i<=5;i++){
    var d=new Date(_hj.getFullYear(),_hj.getMonth()-i,1);
    var ym=d.getFullYear()+"-"+_pc(d.getMonth()+1);
    var lbl=d.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^\w/,function(s){return s.toUpperCase();});
    _meses.push({ym:ym,lbl:lbl});
  }
  var _dados=_meses.map(function(mes){
    var _mudM=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===mes.ym;});
    var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===mes.ym;});
    var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===mes.ym;});
    var r=_calcCustos(_mudM,_cdM,_cpM,RULES);
    var diasTrab=[...new Set(_mudM.map(function(m){return m.data;}))].length;
    return {lbl:mes.lbl,ym:mes.ym,numMud:_mudM.length,m3:r.m3Total,diasTrab:diasTrab,fatBruto:r.fatBruto,imposto:r.imposto,fatLiq:r.fatLiq,cCam:r.cCam,cVan:r.cVan,cAj:r.cAj,cAlm:r.cAlm,cDesp:r.cDesp,cExtra:r.cExtra,despTotal:r.despTotal,lucro:r.lucroLiq};
  });
  var _tot={numMud:0,m3:0,diasTrab:0,fatBruto:0,imposto:0,fatLiq:0,cCam:0,cVan:0,cAj:0,cAlm:0,cDesp:0,cExtra:0,despTotal:0,lucro:0};
  _dados.forEach(function(d){_tot.numMud+=d.numMud;_tot.m3+=d.m3;_tot.diasTrab+=d.diasTrab;_tot.fatBruto+=d.fatBruto;_tot.imposto+=d.imposto;_tot.fatLiq+=d.fatLiq;_tot.cCam+=d.cCam;_tot.cVan+=d.cVan;_tot.cAj+=d.cAj;_tot.cAlm+=d.cAlm;_tot.cDesp+=d.cDesp;_tot.cExtra+=d.cExtra;_tot.despTotal+=d.despTotal;_tot.lucro+=d.lucro;});

  function _renderCard(d,isTot){
    var bg=isTot?"linear-gradient(135deg,#1e293b,#1e40af)":"#fff";
    var tc=isTot?"#fff":"#1e293b";var tc2=isTot?"rgba(255,255,255,0.7)":"#64748b";
    var bdr=isTot?"none":"1.5px solid #e2e8f0";
    return(
      <div key={d.ym||"total"} style={{background:bg,border:bdr,borderRadius:14,padding:"14px 14px 12px",marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:800,color:tc,marginBottom:10}}>{isTot?"📊 TOTAL GERAL":("📅 "+d.lbl)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
          <div style={{background:isTot?"rgba(255,255,255,0.1)":"#f0fdf4",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:tc2,fontWeight:600}}>Viagens</div><div style={{fontSize:16,fontWeight:800,color:tc}}>{d.numMud}</div></div>
          <div style={{background:isTot?"rgba(255,255,255,0.1)":"#eff6ff",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:tc2,fontWeight:600}}>Cubagem</div><div style={{fontSize:16,fontWeight:800,color:tc}}>{d.m3.toFixed(0)} m³</div></div>
          <div style={{background:isTot?"rgba(255,255,255,0.1)":"#faf5ff",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:tc2,fontWeight:600}}>Dias Trab.</div><div style={{fontSize:16,fontWeight:800,color:tc}}>{d.diasTrab}</div></div>
        </div>
        <div style={{borderTop:isTot?"1px solid rgba(255,255,255,0.2)":"1px solid #e2e8f0",paddingTop:8,marginBottom:6}}>
          <div style={{fontSize:10,fontWeight:700,color:isTot?"#86efac":"#16a34a",marginBottom:4,textTransform:"uppercase"}}>Receita</div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}><span style={{fontSize:11,color:tc2}}>Receita Bruta</span><span style={{fontSize:11,fontWeight:700,color:tc}}>{_fvR(d.fatBruto)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}><span style={{fontSize:11,color:tc2}}>Impostos ({((RULES.imposto||0)*100).toFixed(0)}%)</span><span style={{fontSize:11,fontWeight:700,color:isTot?"#fbbf24":"#ea580c"}}>{_fvR(d.imposto)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderTop:isTot?"1px dashed rgba(255,255,255,0.2)":"1px dashed #e2e8f0"}}><span style={{fontSize:11,fontWeight:700,color:tc}}>Receita Líquida</span><span style={{fontSize:12,fontWeight:800,color:isTot?"#4ade80":"#15803d"}}>{_fvR(d.fatLiq)}</span></div>
        </div>
        <div style={{borderTop:isTot?"1px solid rgba(255,255,255,0.2)":"1px solid #e2e8f0",paddingTop:8,marginBottom:6}}>
          <div style={{fontSize:10,fontWeight:700,color:isTot?"#fca5a5":"#dc2626",marginBottom:4,textTransform:"uppercase"}}>Despesas</div>
          {[{ic:"🚚",lbl:"Caminhão",v:d.cCam},{ic:"🚐",lbl:"Van",v:d.cVan},{ic:"👷",lbl:"Ajudantes",v:d.cAj},{ic:"🍛",lbl:"Almoço",v:d.cAlm},{ic:"📋",lbl:"Desp. Extras",v:d.cDesp},{ic:"💼",lbl:"Outros",v:d.cExtra}].map(function(k,i){return(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}><span style={{fontSize:11,color:tc2}}>{k.ic} {k.lbl}</span><span style={{fontSize:11,fontWeight:600,color:tc}}>{_fvR(k.v)}</span></div>
          );})}
          <div style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderTop:isTot?"1px dashed rgba(255,255,255,0.2)":"1px dashed #e2e8f0",marginTop:4}}><span style={{fontSize:11,fontWeight:700,color:tc}}>Despesa Total</span><span style={{fontSize:12,fontWeight:800,color:isTot?"#fca5a5":"#dc2626"}}>{_fvR(d.despTotal)}</span></div>
        </div>
        <div style={{background:isTot?"rgba(255,255,255,0.15)":"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
          <div style={{fontSize:9,color:tc2,fontWeight:600,textTransform:"uppercase"}}>Lucro Líquido</div>
          <div style={{fontSize:22,fontWeight:900,color:d.lucro>=0?(isTot?"#4ade80":"#16a34a"):(isTot?"#f87171":"#dc2626")}}>{_fvR(d.lucro)}</div>
        </div>
      </div>
    );
  }

  function _gerarPdfCompleto(){
    _loadJsPDF().then(function(JsPDF){
      var doc=new JsPDF({unit:"mm",format:"a4"});
      doc.setFontSize(16);doc.setFont(undefined,"bold");
      doc.text("Relatório Financeiro - Completo",14,20);
      doc.setFontSize(10);doc.setFont(undefined,"normal");
      doc.text("Gerado em: "+new Date().toLocaleDateString("pt-BR"),14,28);
      var head=[["Mês","Viag.","m³","Dias","Rec.Bruta","Impostos","Rec.Líq.","Caminhão","Van","Ajud.","Almoço","Extras","Desp.Total","Lucro"]];
      var body=_dados.map(function(d){return [d.lbl,String(d.numMud),d.m3.toFixed(0),String(d.diasTrab),_fvR(d.fatBruto),_fvR(d.imposto),_fvR(d.fatLiq),_fvR(d.cCam),_fvR(d.cVan),_fvR(d.cAj),_fvR(d.cAlm),_fvR(d.cDesp+d.cExtra),_fvR(d.despTotal),_fvR(d.lucro)];});
      body.push(["TOTAL",String(_tot.numMud),_tot.m3.toFixed(0),String(_tot.diasTrab),_fvR(_tot.fatBruto),_fvR(_tot.imposto),_fvR(_tot.fatLiq),_fvR(_tot.cCam),_fvR(_tot.cVan),_fvR(_tot.cAj),_fvR(_tot.cAlm),_fvR(_tot.cDesp+_tot.cExtra),_fvR(_tot.despTotal),_fvR(_tot.lucro)]);
      doc.autoTable({head:head,body:body,startY:34,styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[30,64,175]},alternateRowStyles:{fillColor:[248,250,252]},margin:{left:6,right:6}});
      doc.save("relatorio-completo.pdf");
    });
  }
  function _zapCompleto(){
    var NL="%0A";var t="📋 *Relatório Financeiro Completo*"+NL+NL;
    _dados.forEach(function(d){
      t+="━━━━━━━━━━━━━━━━"+NL;
      t+="📅 *"+d.lbl+"*"+NL;
      t+="📦 Viagens: "+d.numMud+" | 📏 "+d.m3.toFixed(0)+"m³ | 🗓️ "+d.diasTrab+" dias"+NL;
      t+="💚 Receita Bruta: "+_fvR(d.fatBruto)+NL;
      t+="🏦 Impostos: "+_fvR(d.imposto)+NL;
      t+="✅ Receita Líquida: "+_fvR(d.fatLiq)+NL;
      t+="🚚 Caminhão: "+_fvR(d.cCam)+NL;
      t+="🚐 Van: "+_fvR(d.cVan)+NL;
      t+="👷 Ajudantes: "+_fvR(d.cAj)+NL;
      t+="🍛 Almoço: "+_fvR(d.cAlm)+NL;
      t+="📋 Extras: "+_fvR(d.cDesp+d.cExtra)+NL;
      t+="❌ Despesa Total: "+_fvR(d.despTotal)+NL;
      t+="💰 *Lucro: "+_fvR(d.lucro)+"*"+NL+NL;
    });
    t+="━━━━━━━━━━━━━━━━"+NL;
    t+="📊 *TOTAL GERAL*"+NL;
    t+="📦 Viagens: "+_tot.numMud+" | 📏 "+_tot.m3.toFixed(0)+"m³ | 🗓️ "+_tot.diasTrab+" dias"+NL;
    t+="💚 Receita: "+_fvR(_tot.fatBruto)+NL;
    t+="❌ Despesa: "+_fvR(_tot.despTotal)+NL;
    t+="💰 *Lucro: "+_fvR(_tot.lucro)+"*"+NL;
    window.open("https://wa.me/?text="+t,"_blank");
  }

  return(
    <div style={{padding:"12px",paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#1e40af)",padding:"16px",borderRadius:14,marginBottom:12}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.65)"}}>📋 Relatório Completo</div>
        <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>Últimos 6 meses — Detalhado</div>
      </div>
      {_dados.map(function(d){return _renderCard(d,false);})}
      {_renderCard(_tot,true)}
      <div style={{display:"flex",gap:8}}>
        <button onClick={_gerarPdfCompleto} style={{flex:1,padding:"12px",background:"#dc2626",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>📄 Exportar PDF</button>
        <button onClick={_zapCompleto} style={{flex:1,padding:"12px",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>📲 WhatsApp</button>
      </div>
    </div>
  );
})()}
{tab==="contas"&&<ResumoSemanal mudancas={_allForFiltered} RULES={RULES} prestadores={prestadores} custosDiarios={custosDiarios} setCustosDiarios={setCustosDiarios} setContasSemana={setContasSemana}/>}
{false&&tab==="contas"&&isAdmin&&(function(){
  var _fv2=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
  var _fd2=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]:d;};
  var _sups=listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;});
  var _aj1a2=parseFloat(RULES.aj1a)||80;
  var _ajAdd2=parseFloat(RULES.ajAdd)||20;
  // Filter equipe_dia by selected month
  var _eqMes2=equipeDiaList.filter(function(e){return e.data&&e.data.slice(0,7)===adminRelMes&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
  // Build ajudantes map
  var _ajMap2={};
  _eqMes2.forEach(function(ed){
    var numMud=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data===ed.data;}).length;
    var valPorAj=numMud>0?_aj1a2+Math.max(0,numMud-1)*_ajAdd2:0;
    ed.ajudantes.forEach(function(aj){
      if(!_ajMap2[aj.id])_ajMap2[aj.id]={nome:aj.nome,telefone:aj.telefone||"",dias:[]};
      _ajMap2[aj.id].dias.push({data:ed.data,numMud:numMud,valor:valPorAj});
    });
  });
  var _ajFinArr2=Object.values(_ajMap2).sort(function(a,b){return a.nome.localeCompare(b.nome);});
  var _totalDias2=0;var _totalValor2=0;
  _ajFinArr2.forEach(function(a){_totalDias2+=a.dias.length;a.dias.forEach(function(d){_totalValor2+=d.valor;});});
  var _mesD2=new Date(adminRelMes+"-15");
  var _nomesMes2=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var _mesLabel2=_nomesMes2[_mesD2.getMonth()]+"/"+_mesD2.getFullYear();
  var _supNome=adminRelSup?(listaUsuarios.find(function(u){return u.id===adminRelSup;})||{}).nome||"":"";
  return(
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 14px 10px",marginTop:10,marginBottom:10}}>
      <div style={{fontWeight:800,fontSize:14,color:"#1e293b",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>📊 Relatório por Supervisor</div>
      {/* Supervisor selector */}
      <div style={{marginBottom:12}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Supervisor</label>
        <select value={adminRelSup} onChange={function(e){setAdminRelSup(e.target.value);}} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,fontWeight:600,color:adminRelSup?"#1e293b":"#94a3b8",background:"#f8fafc",cursor:"pointer",boxSizing:"border-box"}}>
          <option value="">Selecione um supervisor...</option>
          {_sups.map(function(s){return <option key={s.id} value={s.id}>{s.nome}</option>;})}
        </select>
      </div>
      {/* Month selector */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:14}}>
        <button onClick={function(){var d=new Date(adminRelMes+"-15");d.setMonth(d.getMonth()-1);setAdminRelMes(d.toISOString().slice(0,7));}} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>◀</button>
        <div style={{fontSize:14,fontWeight:800,color:"#1e293b"}}>📅 {_mesLabel2}</div>
        <button onClick={function(){var d=new Date(adminRelMes+"-15");d.setMonth(d.getMonth()+1);setAdminRelMes(d.toISOString().slice(0,7));}} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>▶</button>
      </div>
      {/* Results */}
      {!adminRelSup?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Selecione um supervisor para ver o relatório</div>:
      _ajFinArr2.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Nenhuma equipe escalada neste mês</div>:
      <div>
        {_ajFinArr2.map(function(aj){
          var _tAj=aj.dias.reduce(function(s,d){return s+d.valor;},0);
          return <div key={aj.nome} style={{background:"#f8fafc",borderRadius:10,padding:"10px 12px",marginBottom:8,border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>👷 {aj.nome}{aj.telefone&&<span style={{fontSize:11,color:"#64748b",fontWeight:500}}> — 📞 {aj.telefone}</span>}</div>
            {aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).map(function(d,i){
              return <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 16px",fontSize:11,color:"#475569"}}>
                <span>📅 {_fd2(d.data)} · {d.numMud} mud</span>
                <span style={{fontWeight:700,color:"#065f46"}}>{_fv2(d.valor)}</span>
              </div>;
            })}
            <div style={{textAlign:"right",fontSize:12,fontWeight:800,color:"#065f46",marginTop:4}}>💰 Total: {_fv2(_tAj)}</div>
          </div>;
        })}
        {/* Total */}
        <div style={{background:"#065f46",borderRadius:10,padding:"12px 14px",marginTop:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>👷 {_ajFinArr2.length} ajudante{_ajFinArr2.length!==1?"s":""} · {_totalDias2} dia{_totalDias2!==1?"s":""}</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:900}}>TOTAL: {_fv2(_totalValor2)}</div>
          </div>
        </div>
        {/* Buttons */}
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={function(){
            var NL="%0A";var txt="📊 *RELATÓRIO MENSAL — Equipe: "+(_supNome||"").toUpperCase()+"*"+NL+"📅 "+_mesLabel2+NL+NL;
            _ajFinArr2.forEach(function(aj){
              var _tAj=aj.dias.reduce(function(s,d){return s+d.valor;},0);
              txt+="👷 *"+aj.nome+"*"+(aj.telefone?" — 📞 "+aj.telefone:"")+NL;
              aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){
                txt+="   📅 "+_fd2(d.data)+" · "+d.numMud+" mud · "+_fv2(d.valor)+NL;
              });
              txt+="   💰 Total: "+_fv2(_tAj)+NL+NL;
            });
            txt+="━━━━━━━━━━━━━━━━━━"+NL;
            txt+="👷 "+_ajFinArr2.length+" ajudante"+(_ajFinArr2.length!==1?"s":"")+" · "+_totalDias2+" dia"+(_totalDias2!==1?"s":"")+NL;
            txt+="💰 *TOTAL: "+_fv2(_totalValor2)+"*"+NL+NL+"— TELEMIM Mudanças";
            window.open("https://wa.me/?text="+txt,"_blank");
          }} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"12px 10px",borderRadius:12,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📲 WhatsApp</button>
          <button onClick={function(){
            var NL="\n";var txt="RELATÓRIO MENSAL — Equipe: "+(_supNome||"").toUpperCase()+NL+"📅 "+_mesLabel2+NL+NL;
            _ajFinArr2.forEach(function(aj){
              var _tAj=aj.dias.reduce(function(s,d){return s+d.valor;},0);
              txt+="👷 "+aj.nome+(aj.telefone?" — 📞 "+aj.telefone:"")+NL;
              aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){
                txt+="   📅 "+_fd2(d.data)+" · "+d.numMud+" mudança"+(d.numMud!==1?"s":"")+" · "+_fv2(d.valor)+NL;
              });
              txt+="   💰 Total: "+_fv2(_tAj)+NL+NL;
            });
            txt+="━━━━━━━━━━━━━━━━━━"+NL;
            txt+="👷 "+_ajFinArr2.length+" ajudantes · "+_totalDias2+" dias"+NL;
            txt+="💰 TOTAL: "+_fv2(_totalValor2)+NL+NL+"— TELEMIM Mudanças";
            var _w=window.open("","_blank");
            _w.document.write("<html><head><title>Relatório Equipe - "+(_supNome||"")+' - '+_mesLabel2+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}body{font-size:12px;}}</style></head><body>"+txt.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
            _w.document.close();
          }} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"12px 10px",borderRadius:12,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📄 PDF</button>
        </div>
      </div>}
    </div>
  );
})()}
{tab==="contas"&&isAdmin&&(function(){
  var _fvP=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
  var _fdP=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d;};
  var _fdShort=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]:d;};
  var _sups2=listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;});
  var _motsCam=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="CAMINHAO";});
  var _motsVan=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="VAN";});
  var _aj1aP=parseFloat(RULES.aj1a)||80;
  var _ajAddP=parseFloat(RULES.ajAdd)||20;
  // Build equipe data for month
  var _eqMesP=equipeDiaList.filter(function(e){return e.data&&e.data.slice(0,7)===pagMes&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
  var _ajMapP={};
  _eqMesP.forEach(function(ed){
    var numMud=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data===ed.data;}).length;
    var valPorAj=numMud>0?_aj1aP+Math.max(0,numMud-1)*_ajAddP:0;
    ed.ajudantes.forEach(function(aj){
      if(!_ajMapP[aj.id])_ajMapP[aj.id]={id:aj.id,nome:aj.nome,telefone:aj.telefone||"",dias:[],total:0};
      _ajMapP[aj.id].dias.push({data:ed.data,numMud:numMud,valor:valPorAj});
      _ajMapP[aj.id].total+=valPorAj;
    });
  });
  var _ajListP=Object.values(_ajMapP).sort(function(a,b){return a.nome.localeCompare(b.nome);});
  var _totalEquipe=_ajListP.reduce(function(s,aj){return s+aj.total;},0);
  var _totalDiasEquipe=_ajListP.reduce(function(s,aj){return s+aj.dias.length;},0);
  // Motorista costs for month
  var _mudMesP=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===pagMes;});
  var _diasMesP=[...new Set(_mudMesP.map(function(m){return m.data;}))];
  var _camTotal=0;var _vanTotal=0;
  _diasMesP.forEach(function(data){var n=_mudMesP.filter(function(m){return m.data===data;}).length;_camTotal+=(parseFloat(RULES.cam1a)||350)+Math.max(0,n-1)*(parseFloat(RULES.camAdd)||130);_vanTotal+=parseFloat(RULES.vanCusto)||400;});
  // Get payment status
  var _getPag=function(tipo,refId){return (pagamentos||[]).find(function(p){return p.tipo===tipo&&p.ref_id===refId&&p.periodo===pagMes;})||null;};
  var _statusColor=function(s){return s==="pago"?"#16a34a":s==="parcial"?"#f59e0b":"#dc2626";};
  var _statusBg=function(s){return s==="pago"?"#f0fdf4":s==="parcial"?"#fffbeb":"#fef2f2";};
  var _statusLabel=function(s){return s==="pago"?"✅ Pago":s==="parcial"?"⚠️ Parcial":"⏳ Pendente";};
  // Month label
  var _mesDP=new Date(pagMes+"-15");
  var _nomesMesP=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var _mesLabelP=_nomesMesP[_mesDP.getMonth()]+"/"+_mesDP.getFullYear();
  // Totals
  var _totalGeral=_totalEquipe+_camTotal+_vanTotal;
  var _totalPago=0;
  _ajListP.forEach(function(aj){var p=_getPag("ajudante",aj.id);if(p&&p.status==="pago")_totalPago+=aj.total;});
  if(pagCam){var pC=_getPag("caminhao",pagCam);if(pC&&pC.status==="pago")_totalPago+=_camTotal;}
  if(pagVan){var pV=_getPag("van",pagVan);if(pV&&pV.status==="pago")_totalPago+=_vanTotal;}
  var _totalPend=_totalGeral-_totalPago;
  // Render payment item
  var _renderPagItem=function(tipo,refId,nome,telefone,valor,dias){
    var _pag=_getPag(tipo,refId);
    var _st=_pag?_pag.status:"pendente";
    if(pagFiltro==="pendente"&&_st==="pago")return null;
    if(pagFiltro==="pago"&&_st!=="pago")return null;
    return <div key={tipo+"_"+refId} style={{background:_statusBg(_st),borderRadius:10,padding:"12px 14px",marginBottom:8,border:"1px solid "+(_st==="pago"?"#bbf7d0":_st==="parcial"?"#fde68a":"#fecaca")}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{nome}</div>
          {telefone&&<div style={{fontSize:10,color:"#64748b"}}>📞 {telefone}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:15,fontWeight:900,color:_statusColor(_st)}}>{_fvP(valor)}</div>
          <div style={{fontSize:10,fontWeight:700,color:_statusColor(_st)}}>{_statusLabel(_st)}</div>
        </div>
      </div>
      {dias&&<div style={{marginBottom:8,paddingLeft:8,borderLeft:"2px solid #e2e8f0"}}>
        {dias.sort(function(a,b){return a.data.localeCompare(b.data);}).map(function(d,i){
          return <div key={i} style={{fontSize:10,color:"#475569",padding:"2px 0"}}>{_fdShort(d.data)} · {d.numMud} mud · {_fvP(d.valor)}</div>;
        })}
      </div>}
      {_pag&&_pag.data_pagamento&&<div style={{fontSize:10,color:"#64748b",marginBottom:6}}>📅 Pago em: {_fdP(_pag.data_pagamento)}{_pag.metodo?" · "+_pag.metodo:""}</div>}
      <div style={{display:"flex",gap:6}}>
        {_st!=="pago"&&<button onClick={function(){
          salvarPagamento({id:_pag?_pag.id:undefined,tipo:tipo,ref_id:refId,ref_nome:nome,periodo:pagMes,valor:valor,status:"pago",data_pagamento:new Date().toISOString().slice(0,10),metodo:"PIX",criado_em:_pag?_pag.criado_em:new Date().toISOString()});
        }} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Marcar Pago</button>}
        {_st!=="parcial"&&_st!=="pago"&&<button onClick={function(){
          salvarPagamento({id:_pag?_pag.id:undefined,tipo:tipo,ref_id:refId,ref_nome:nome,periodo:pagMes,valor:valor,status:"parcial",data_pagamento:new Date().toISOString().slice(0,10),metodo:"",criado_em:_pag?_pag.criado_em:new Date().toISOString()});
        }} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:"#f59e0b",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚠️ Parcial</button>}
        {_st==="pago"&&<button onClick={function(){
          salvarPagamento({id:_pag.id,tipo:tipo,ref_id:refId,ref_nome:nome,periodo:pagMes,valor:valor,status:"pendente",data_pagamento:null,metodo:"",criado_em:_pag.criado_em});
        }} style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>↩️ Desfazer</button>}
      </div>
    </div>;
  };
  var _supNome2=pagSup?(listaUsuarios.find(function(u){return u.id===pagSup;})||{}).nome||"":"";
  return(
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 14px 16px",marginTop:10,marginBottom:10}}>
      <div style={{fontWeight:800,fontSize:14,color:"#1e293b",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>💰 Gestão de Pagamentos</div>
      {/* Month nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:12}}>
        <button onClick={function(){var d=new Date(pagMes+"-15");d.setMonth(d.getMonth()-1);setPagMes(d.toISOString().slice(0,7));}} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>◀</button>
        <div style={{fontSize:14,fontWeight:800,color:"#1e293b"}}>📅 {_mesLabelP}</div>
        <button onClick={function(){var d=new Date(pagMes+"-15");d.setMonth(d.getMonth()+1);setPagMes(d.toISOString().slice(0,7));}} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>▶</button>
      </div>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div style={{background:"#fef2f2",borderRadius:10,padding:"10px 12px",border:"1px solid #fecaca"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#dc2626"}}>⏳ PENDENTE</div>
          <div style={{fontSize:16,fontWeight:900,color:"#dc2626"}}>{_fvP(_totalPend)}</div>
        </div>
        <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 12px",border:"1px solid #bbf7d0"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#16a34a"}}>✅ PAGO</div>
          <div style={{fontSize:16,fontWeight:900,color:"#16a34a"}}>{_fvP(_totalPago)}</div>
        </div>
      </div>
      {/* Filters */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{k:"todos",l:"Todos"},{k:"pendente",l:"⏳ Pendente"},{k:"pago",l:"✅ Pago"}].map(function(f){
          return <button key={f.k} onClick={function(){setPagFiltro(f.k);}} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"1.5px solid "+(pagFiltro===f.k?"#1e40af":"#e2e8f0"),background:pagFiltro===f.k?"#eff6ff":"#f8fafc",color:pagFiltro===f.k?"#1e40af":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f.l}</button>;
        })}
      </div>

      {/* ═══ BLOCO 1: EQUIPE SUPERVISOR ═══ */}
      <div style={{borderTop:"3px solid #065f46",paddingTop:12,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:800,color:"#065f46",marginBottom:8}}>👷 EQUIPE SUPERVISOR</div>
        <select value={pagSup} onChange={function(e){setPagSup(e.target.value);}} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,fontWeight:600,color:pagSup?"#1e293b":"#94a3b8",background:"#f8fafc",cursor:"pointer",boxSizing:"border-box",marginBottom:10}}>
          <option value="">Selecione o supervisor...</option>
          {_sups2.map(function(s){return <option key={s.id} value={s.id}>{s.nome}</option>;})}
        </select>
        {pagSup&&_ajListP.length===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma equipe escalada neste mês</div>}
        {pagSup&&_ajListP.map(function(aj){return _renderPagItem("ajudante",aj.id,"👷 "+aj.nome,aj.telefone,aj.total,aj.dias);})}
        {pagSup&&_ajListP.length>0&&<div style={{background:"#065f46",borderRadius:10,padding:"12px 14px",marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>👷 {_ajListP.length} ajudante{_ajListP.length!==1?"s":""} · {_totalDiasEquipe} dia{_totalDiasEquipe!==1?"s":""}</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:900}}>TOTAL: {_fvP(_totalEquipe)}</div>
          </div>
        </div>}
        {pagSup&&_ajListP.length>0&&<div style={{display:"flex",gap:6,marginTop:8}}>
          <button onClick={function(){
            _ajListP.forEach(function(aj){
              var _pag=_getPag("ajudante",aj.id);
              if(!_pag||_pag.status!=="pago"){
                salvarPagamento({id:_pag?_pag.id:undefined,tipo:"ajudante",ref_id:aj.id,ref_nome:"👷 "+aj.nome,periodo:pagMes,valor:aj.total,status:"pago",data_pagamento:new Date().toISOString().slice(0,10),metodo:"PIX",criado_em:_pag?_pag.criado_em:new Date().toISOString()});
              }
            });
          }} style={{flex:1,padding:"10px 8px",borderRadius:10,border:"none",background:"#16a34a",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>✅ Pagar Todos</button>
          <button onClick={function(){
            var NL="%0A";var t="📊 *EQUIPE "+(_supNome2||"").toUpperCase()+"*"+NL+"🗓️ "+_mesLabelP+NL+NL;
            _ajListP.forEach(function(aj){
              t+="👷 *"+aj.nome+"*"+NL;
              aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="   📅 "+_fdShort(d.data)+" · "+d.numMud+" mud · "+_fvP(d.valor)+NL;});
              t+="   💰 Total: "+_fvP(aj.total)+NL+NL;
            });
            t+="━━━━━━━━━━━━"+NL+"👷 "+_ajListP.length+" ajudantes · "+_totalDiasEquipe+" dias"+NL+"💰 *TOTAL: "+_fvP(_totalEquipe)+"*"+NL+NL+"— TELEMIM Mudanças";
            window.open("https://wa.me/?text="+encodeURIComponent(t),"_blank");
          }} style={{padding:"10px 14px",borderRadius:10,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>📲</button>
          <button onClick={function(){
            var NL="\n";var t="📊 EQUIPE "+(_supNome2||"").toUpperCase()+NL+"🗓️ "+_mesLabelP+NL+NL;
            _ajListP.forEach(function(aj){
              t+="👷 "+aj.nome+NL;
              aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="   📅 "+_fdShort(d.data)+" · "+d.numMud+" mud · "+_fvP(d.valor)+NL;});
              t+="   💰 Total: "+_fvP(aj.total)+NL+NL;
            });
            t+="━━━━━━━━━━━━━━━━━━"+NL+"👷 "+_ajListP.length+" ajudantes · "+_totalDiasEquipe+" dias"+NL+"💰 TOTAL: "+_fvP(_totalEquipe)+NL+NL+"— TELEMIM Mudanças";
            var _w=window.open("","_blank");
            _w.document.write("<html><head><title>Equipe "+(_supNome2||"")+" - "+_mesLabelP+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
            _w.document.close();
          }} style={{padding:"10px 14px",borderRadius:10,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>📄</button>
        </div>}
      </div>

      {/* ═══ BLOCO 2: CAMINHÃO ═══ */}
      <div style={{borderTop:"3px solid #92400e",paddingTop:12,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:800,color:"#92400e",marginBottom:8}}>🚚 CAMINHÃO</div>
        <select value={pagCam} onChange={function(e){setPagCam(e.target.value);}} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,fontWeight:600,color:pagCam?"#1e293b":"#94a3b8",background:"#f8fafc",cursor:"pointer",boxSizing:"border-box",marginBottom:10}}>
          <option value="">Selecione o motorista...</option>
          {_motsCam.map(function(m){return <option key={m.id} value={m.id}>{m.nome}{m.placa_veiculo?" · "+m.placa_veiculo:""}</option>;})}
        </select>
        {pagCam&&_camTotal>0&&_renderPagItem("caminhao",pagCam,"🚚 "+(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).nome||"",(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).contato||"",_camTotal,[{data:_diasMesP.length+" dias",numMud:_mudMesP.length,valor:_camTotal}])}
        {pagCam&&_camTotal>0&&<div style={{background:"#92400e",borderRadius:10,padding:"10px 14px",marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>🚚 {_diasMesP.length} dia{_diasMesP.length!==1?"s":""} · {_mudMesP.length} mudança{_mudMesP.length!==1?"s":""}</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:900}}>TOTAL: {_fvP(_camTotal)}</div>
          </div>
        </div>}
        {pagCam&&_camTotal>0&&(function(){var _camNome=(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).nome||"";var _camTel=(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).contato||"";return <div style={{display:"flex",gap:6,marginTop:8}}>
          <button onClick={function(){
            var NL="%0A";var t="📊 *CAMINHÃO - "+_camNome.toUpperCase()+"*"+NL+"🗓️ "+_mesLabelP+NL+NL;
            t+="🚚 "+_diasMesP.length+" dia"+(_diasMesP.length!==1?"s":"")+" · "+_mudMesP.length+" mudança"+(_mudMesP.length!==1?"s":"")+NL;
            t+="💰 *TOTAL: "+_fvP(_camTotal)+"*"+NL+NL+"— TELEMIM Mudanças";
            var _ph=_camTel?(_camTel.replace(/\D/g,"").length<=11?"55"+_camTel.replace(/\D/g,""):_camTel.replace(/\D/g,"")):"";
            window.open("https://wa.me/"+_ph+"?text="+encodeURIComponent(t),"_blank");
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📲 WhatsApp</button>
          <button onClick={function(){
            var NL="\n";var t="📊 CAMINHÃO - "+_camNome.toUpperCase()+NL+"🗓️ "+_mesLabelP+NL+NL;
            t+="🚚 "+_diasMesP.length+" dia"+(_diasMesP.length!==1?"s":"")+" · "+_mudMesP.length+" mudança"+(_mudMesP.length!==1?"s":"")+NL;
            t+="💰 TOTAL: "+_fvP(_camTotal)+NL+NL+"— TELEMIM Mudanças";
            var _w=window.open("","_blank");
            _w.document.write("<html><head><title>Caminhão - "+_camNome+" - "+_mesLabelP+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
            _w.document.close();
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📄 PDF</button>
        </div>;})()}
        {pagCam&&_camTotal===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma mudança neste mês</div>}
      </div>

      {/* ═══ BLOCO 3: VAN ═══ */}
      <div style={{borderTop:"3px solid #1e40af",paddingTop:12,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:800,color:"#1e40af",marginBottom:8}}>🚐 VAN</div>
        <select value={pagVan} onChange={function(e){setPagVan(e.target.value);}} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,fontWeight:600,color:pagVan?"#1e293b":"#94a3b8",background:"#f8fafc",cursor:"pointer",boxSizing:"border-box",marginBottom:10}}>
          <option value="">Selecione o motorista...</option>
          {_motsVan.map(function(m){return <option key={m.id} value={m.id}>{m.nome}{m.placa_veiculo?" · "+m.placa_veiculo:""}</option>;})}
        </select>
        {pagVan&&_vanTotal>0&&_renderPagItem("van",pagVan,"🚐 "+(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).nome||"",(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).contato||"",_vanTotal,[{data:_diasMesP.length+" dias",numMud:_mudMesP.length,valor:_vanTotal}])}
        {pagVan&&_vanTotal>0&&<div style={{background:"#1e40af",borderRadius:10,padding:"10px 14px",marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>🚐 {_diasMesP.length} dia{_diasMesP.length!==1?"s":""}</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:900}}>TOTAL: {_fvP(_vanTotal)}</div>
          </div>
        </div>}
        {pagVan&&_vanTotal>0&&(function(){var _vanNome=(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).nome||"";var _vanTel=(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).contato||"";return <div style={{display:"flex",gap:6,marginTop:8}}>
          <button onClick={function(){
            var NL="%0A";var t="📊 *VAN - "+_vanNome.toUpperCase()+"*"+NL+"🗓️ "+_mesLabelP+NL+NL;
            t+="🚐 "+_diasMesP.length+" dia"+(_diasMesP.length!==1?"s":"")+" · "+_mudMesP.length+" mudança"+(_mudMesP.length!==1?"s":"")+NL;
            t+="💰 *TOTAL: "+_fvP(_vanTotal)+"*"+NL+NL+"— TELEMIM Mudanças";
            var _ph=_vanTel?(_vanTel.replace(/\D/g,"").length<=11?"55"+_vanTel.replace(/\D/g,""):_vanTel.replace(/\D/g,"")):"";
            window.open("https://wa.me/"+_ph+"?text="+encodeURIComponent(t),"_blank");
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📲 WhatsApp</button>
          <button onClick={function(){
            var NL="\n";var t="📊 VAN - "+_vanNome.toUpperCase()+NL+"🗓️ "+_mesLabelP+NL+NL;
            t+="🚐 "+_diasMesP.length+" dia"+(_diasMesP.length!==1?"s":"")+" · "+_mudMesP.length+" mudança"+(_mudMesP.length!==1?"s":"")+NL;
            t+="💰 TOTAL: "+_fvP(_vanTotal)+NL+NL+"— TELEMIM Mudanças";
            var _w=window.open("","_blank");
            _w.document.write("<html><head><title>Van - "+_vanNome+" - "+_mesLabelP+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
            _w.document.close();
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📄 PDF</button>
        </div>;})()}
        {pagVan&&_vanTotal===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma mudança neste mês</div>}
      </div>

      {/* Export button */}
      <button onClick={function(){
        var csv="Nome,Tipo,Periodo,Valor,Status,Data Pagamento,Metodo\n";
        _ajListP.forEach(function(aj){var _pag=_getPag("ajudante",aj.id);var _st=_pag?_pag.status:"pendente";csv+='"'+aj.nome+'","Ajudante","'+_mesLabelP+'","'+aj.total.toFixed(2)+'","'+_st+'","'+(_pag&&_pag.data_pagamento?_fdP(_pag.data_pagamento):"")+'","'+(_pag&&_pag.metodo?_pag.metodo:"")+'"'+"\n";});
        if(pagCam){var pC2=_getPag("caminhao",pagCam);var nC=(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).nome||"";csv+='"'+nC+'","Caminhão","'+_mesLabelP+'","'+_camTotal.toFixed(2)+'","'+(pC2?pC2.status:"pendente")+'","'+(pC2&&pC2.data_pagamento?_fdP(pC2.data_pagamento):"")+'","'+(pC2&&pC2.metodo?pC2.metodo:"")+'"'+"\n";}
        if(pagVan){var pV2=_getPag("van",pagVan);var nV=(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).nome||"";csv+='"'+nV+'","Van","'+_mesLabelP+'","'+_vanTotal.toFixed(2)+'","'+(pV2?pV2.status:"pendente")+'","'+(pV2&&pV2.data_pagamento?_fdP(pV2.data_pagamento):"")+'","'+(pV2&&pV2.metodo?pV2.metodo:"")+'"'+"\n";}
        var blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
        var url=URL.createObjectURL(blob);
        var a=document.createElement("a");a.href=url;a.download="pagamentos_"+pagMes+".csv";a.click();URL.revokeObjectURL(url);
      }} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"#475569",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>📥 Exportar Excel (CSV)</button>
    </div>
  );
})()}
        {/* ══ ABA EQUIPE ══ */}
        {tab==="equipe"&&isSupervisor&&(function(){
          var _fv=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
          var _fd=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]:d;};
          var _fdFull=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d;};
          // Escalar: mudancas do dia selecionado (includes concluded)
          var _mudDia=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data===equipeDiaSel;});
          var _numMudDia=_mudDia.length;
          var _eqDia=equipeDiaList.find(function(e){return e.data===equipeDiaSel;});
          var _eqAjArr=_eqDia&&Array.isArray(_eqDia.ajudantes)?_eqDia.ajudantes:[];
          // Custo preview
          var _aj1a=parseFloat(RULES.aj1a)||80;
          var _ajAdd=parseFloat(RULES.ajAdd)||20;
          var _custoPorAj=_numMudDia>0?_aj1a+Math.max(0,_numMudDia-1)*_ajAdd:0;
          var _custoTotalDia=_custoPorAj*equipeDiaCheck.length;
          // Financeiro
          var _mesFin=equipeFinMes;
          var _eqMes=equipeDiaList.filter(function(e){return e.data&&e.data.slice(0,7)===_mesFin&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
          var _ajMap={};
          _eqMes.forEach(function(ed){
            var numMud=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data===ed.data;}).length;
            var valPorAj=numMud>0?_aj1a+Math.max(0,numMud-1)*_ajAdd:0;
            ed.ajudantes.forEach(function(aj){
              if(!_ajMap[aj.id])_ajMap[aj.id]={nome:aj.nome,telefone:aj.telefone||"",dias:[]};
              _ajMap[aj.id].dias.push({data:ed.data,numMud:numMud,valor:valPorAj});
            });
          });
          var _ajFinArr=Object.values(_ajMap).sort(function(a,b){return a.nome.localeCompare(b.nome);});
          var _totalGeralDias=0;var _totalGeralValor=0;
          _ajFinArr.forEach(function(a){_totalGeralDias+=a.dias.length;a.dias.forEach(function(d){_totalGeralValor+=d.valor;});});
          // Mes navigation
          var _mesD=new Date(_mesFin+"-15");
          var _nomesMes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          var _mesLabel=_nomesMes[_mesD.getMonth()]+" "+_mesD.getFullYear();
          var _mesAnterior=function(){var d=new Date(_mesFin+"-15");d.setMonth(d.getMonth()-1);setEquipeFinMes(d.toISOString().slice(0,7));};
          var _mesProximo=function(){var d=new Date(_mesFin+"-15");d.setMonth(d.getMonth()+1);setEquipeFinMes(d.toISOString().slice(0,7));};
          return <div style={{paddingBottom:80}}>
            <div style={{background:"#1e293b",padding:"20px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Gerenciamento</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>👷 Equipe</div></div>
            <div style={{display:"flex",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
              {[{id:"cadastro",l:"📋 Cadastro"},{id:"escalar",l:"📅 Escalar"},{id:"financeiro",l:"💰 Financeiro"}].map(function(t){return <button key={t.id} onClick={function(){setSubEquipe(t.id);loadAjudantes();if(t.id!=="cadastro")loadEquipeDia();if(t.id==="escalar"){var _f=equipeDiaList.find(ed=>ed.data===equipeDiaSel);setEquipeDiaCheck(_f&&Array.isArray(_f.ajudantes)?_f.ajudantes:[]);}}} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subEquipe===t.id?700:500,background:"transparent",borderBottom:subEquipe===t.id?"3px solid #065f46":"3px solid transparent",color:subEquipe===t.id?"#065f46":"#64748b"}}>{t.l}</button>;})}
            </div>
            {/* SUB: CADASTRO */}
            {subEquipe==="cadastro"&&<div style={{padding:16}}>
              <Card style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>👷 Ajudantes Cadastrados ({ajudantesList.length})</div>
                  <button onClick={function(){setShowAddAjudante(!showAddAjudante);}} style={{padding:"7px 14px",borderRadius:10,border:"1.5px solid #16a34a",background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Novo</button>
                </div>
                {showAddAjudante&&<div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px",marginBottom:14}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <input placeholder="Nome" value={novoAjudante.nome} onChange={function(e){setNovoAjudante(function(p){return{...p,nome:e.target.value};});}} style={{flex:2,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                    <input type="tel" placeholder="Telefone" value={novoAjudante.telefone} onChange={function(e){setNovoAjudante(function(p){return{...p,telefone:e.target.value};});}} style={{flex:1.5,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                    <button onClick={criarAjudante} style={{padding:"9px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>✓</button>
                  </div>
                </div>}
                {ajudantesList.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhum ajudante cadastrado</div>:ajudantesList.map(function(aj){
                  return <div key={aj.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{aj.nome}</div>{aj.telefone&&<div style={{fontSize:11,color:"#64748b"}}>📞 {aj.telefone}</div>}</div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={function(){setEditAjudante({id:aj.id,nome:aj.nome,telefone:aj.telefone||""});}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                      <button onClick={function(){if(confirm("Remover "+aj.nome+"?"))desativarAjudante(aj.id);}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #ef4444",background:"#fef2f2",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button>
                    </div>
                  </div>;
                })}
              </Card>
              {editAjudante&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditAjudante(null);}}>
                <div style={{background:"#fff",borderRadius:16,padding:"20px 16px",width:"100%",maxWidth:360}} onClick={function(e){e.stopPropagation();}}>
                  <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>✏️ Editar Ajudante</div>
                  <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Nome</div><input value={editAjudante.nome} onChange={function(e){setEditAjudante(function(p){return{...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                  <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Telefone</div><input type="tel" value={editAjudante.telefone} onChange={function(e){setEditAjudante(function(p){return{...p,telefone:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                  <div style={{display:"flex",gap:8}}><button onClick={function(){setEditAjudante(null);}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarAjudanteFn} style={{flex:2,padding:11,borderRadius:10,background:"#16a34a",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>✅ Salvar</button></div>
                </div>
              </div>}
            </div>}
            {/* SUB: ESCALAR */}
            {subEquipe==="escalar"&&<div style={{padding:16}}>
              <Card style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>📅 DATA</div>
                <input type="date" value={equipeDiaSel} onChange={function(e){
                  setEquipeDiaSel(e.target.value);
                  var _found=equipeDiaList.find(function(ed){return ed.data===e.target.value;});
                  setEquipeDiaCheck(_found&&Array.isArray(_found.ajudantes)?_found.ajudantes:[]);
                }} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontWeight:700,color:"#1e293b",boxSizing:"border-box"}}/>
              </Card>
              {_numMudDia>0?<Card style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,marginBottom:8}}>MUDANÇAS DO DIA ({_numMudDia})</div>
                {_mudDia.map(function(m,i){return <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:12}}><span style={{fontWeight:700}}>{m.nome}</span><span style={{color:"#64748b"}}> — {m.origem||"?"} → {m.destino||"?"}</span>{m.van&&<span style={{marginLeft:4,fontSize:10,background:"#eff6ff",borderRadius:4,padding:"1px 5px",color:"#1e40af"}}>🚐</span>}{m.caminhao&&<span style={{marginLeft:4,fontSize:10,background:"#fff7ed",borderRadius:4,padding:"1px 5px",color:"#92400e"}}>🚚</span>}</div>;})}
              </Card>:<Card style={{marginBottom:16}}><div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma mudança neste dia</div></Card>}
              <Card>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,marginBottom:10}}>SELECIONE A EQUIPE DO DIA</div>
                {ajudantesList.map(function(aj){
                  var _sel=equipeDiaCheck.find(function(s){return s.id===aj.id;});
                  return <div key={aj.id} onClick={function(){
                    if(_sel){setEquipeDiaCheck(function(prev){return prev.filter(function(s){return s.id!==aj.id;});});}
                    else{setEquipeDiaCheck(function(prev){return prev.concat([{id:aj.id,nome:aj.nome,telefone:aj.telefone||""}]);});}
                  }} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",marginBottom:4,borderRadius:10,border:"1.5px solid "+(_sel?"#16a34a":"#e2e8f0"),background:_sel?"#f0fdf4":"#fff",cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{_sel?"☑":"☐"}</span>
                      <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{aj.nome}</div>{aj.telefone&&<div style={{fontSize:10,color:"#64748b"}}>📞 {aj.telefone}</div>}</div>
                    </div>
                  </div>;
                })}
                {equipeDiaCheck.length>0&&_numMudDia>0&&<div style={{marginTop:12,background:"#f0fdf4",borderRadius:10,padding:"10px 14px",border:"1px solid #bbf7d0"}}>
                  <div style={{fontSize:12,color:"#065f46"}}>👷 {equipeDiaCheck.length} ajudante{equipeDiaCheck.length>1?"s":""} × {_numMudDia} mudança{_numMudDia>1?"s":""} = <strong>{_fv(_custoPorAj)}</strong>/ajudante</div>
                  <div style={{fontSize:13,fontWeight:800,color:"#065f46",marginTop:4}}>💰 Custo total do dia: {_fv(_custoTotalDia)}</div>
                </div>}
                <button onClick={function(){salvarEquipeDia(equipeDiaSel,equipeDiaCheck);}} style={{width:"100%",padding:13,borderRadius:12,background:"#065f46",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:"pointer",marginTop:14}}>💾 Salvar Equipe do Dia</button>
              </Card>
            </div>}
            {/* SUB: FINANCEIRO */}
            {subEquipe==="financeiro"&&<div style={{padding:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:16}}>
                <button onClick={_mesAnterior} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>◀</button>
                <div style={{fontSize:15,fontWeight:800,color:"#1e293b"}}>📅 {_mesLabel}</div>
                <button onClick={_mesProximo} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>▶</button>
              </div>
              {/* Botões Relatório Semanal */}
              {_ajFinArr.length>0&&<div style={{display:"flex",gap:8,marginBottom:14}}>
                <button onClick={function(){
                  var NL="%0A";var txt="📊 *RELATÓRIO MENSAL — Equipe*"+NL+"📅 "+_mesLabel+NL+NL;
                  _ajFinArr.forEach(function(aj){
                    var _tAj=aj.dias.reduce(function(s,d){return s+d.valor;},0);
                    txt+="👷 *"+aj.nome+"*"+(aj.telefone?" — 📞 "+aj.telefone:"")+NL;
                    aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){
                      txt+="   📅 "+_fd(d.data)+" · "+d.numMud+" mud · "+_fv(d.valor)+NL;
                    });
                    txt+="   💰 Total: "+_fv(_tAj)+NL+NL;
                  });
                  txt+="━━━━━━━━━━━━━━━━━━"+NL;
                  txt+="👷 "+_ajFinArr.length+" ajudante"+(_ajFinArr.length!==1?"s":"")+" · "+_totalGeralDias+" dia"+(_totalGeralDias!==1?"s":"")+NL;
                  txt+="💰 *TOTAL: "+_fv(_totalGeralValor)+"*"+NL+NL+"— TELEMIM Mudanças";
                  window.open("https://wa.me/?text="+txt,"_blank");
                }} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"12px 10px",borderRadius:12,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📲 Relatório WhatsApp</button>
                <button onClick={function(){
                  var NL="\n";var txt="RELATÓRIO MENSAL — Equipe"+NL+"📅 "+_mesLabel+NL+NL;
                  _ajFinArr.forEach(function(aj){
                    var _tAj=aj.dias.reduce(function(s,d){return s+d.valor;},0);
                    txt+="👷 "+aj.nome+(aj.telefone?" — 📞 "+aj.telefone:"")+NL;
                    aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){
                      txt+="   📅 "+_fd(d.data)+" · "+d.numMud+" mudança"+(d.numMud!==1?"s":"")+" · "+_fv(d.valor)+NL;
                    });
                    txt+="   💰 Total: "+_fv(_tAj)+NL+NL;
                  });
                  txt+="━━━━━━━━━━━━━━━━━━"+NL;
                  txt+="👷 "+_ajFinArr.length+" ajudantes · "+_totalGeralDias+" dias"+NL;
                  txt+="💰 TOTAL: "+_fv(_totalGeralValor)+NL+NL+"— TELEMIM Mudanças";
                  var _w=window.open("","_blank");
                  _w.document.write("<html><head><title>Relatório Equipe - "+_mesLabel+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{body{font-size:12px;}}</style></head><body>"+txt.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
                  _w.document.close();
                }} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"12px 10px",borderRadius:12,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📄 PDF Relatório</button>
              </div>}
              {_ajFinArr.length===0?<Card><div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhuma equipe escalada neste mês</div></Card>:_ajFinArr.map(function(aj){
                var _totalAj=aj.dias.reduce(function(s,d){return s+d.valor;},0);
                // WhatsApp message for individual ajudante
                var _waMsg=(function(){var NL="%0A";var t="Olá "+aj.nome+"! 👷"+NL+"Segue seu resumo de pagamento:"+NL+NL;aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="📅 "+_fd(d.data)+" · "+d.numMud+" mudança"+(d.numMud!==1?"s":"")+" · "+_fv(d.valor)+NL;});t+=NL+"💰 *Total: "+_fv(_totalAj)+"*"+NL+"🗓️ "+aj.dias.length+" dia"+(aj.dias.length!==1?"s":"")+" trabalhado"+(aj.dias.length!==1?"s":"")+NL+NL+"— TELEMIM Mudanças";return t;})();
                var _waPhone=aj.telefone?(aj.telefone.replace(/\D/g,"").length<=11?"55"+aj.telefone.replace(/\D/g,""):aj.telefone.replace(/\D/g,"")):"";
                return <Card key={aj.nome} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div><div style={{fontWeight:800,fontSize:14,color:"#1e293b"}}>👷 {aj.nome}</div>{aj.telefone&&<div style={{fontSize:11,color:"#64748b"}}>📞 {aj.telefone}</div>}</div>
                    {_waPhone&&<button onClick={function(){window.open("https://wa.me/"+_waPhone+"?text="+_waMsg,"_blank");}} style={{background:"#25d366",border:"none",borderRadius:10,padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:16}}>📲</span><span style={{fontSize:10,fontWeight:700,color:"#fff"}}>Enviar</span></button>}
                  </div>
                  <div style={{borderTop:"1px solid #e2e8f0",paddingTop:8}}>
                    {aj.dias.sort(function(a,b){return a.data.localeCompare(b.data);}).map(function(d,i){
                      return <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}>
                        <span style={{color:"#475569"}}>{_fd(d.data)}  ·  {d.numMud} mudança{d.numMud!==1?"s":""}</span>
                        <span style={{fontWeight:700,color:"#065f46"}}>{_fv(d.valor)}</span>
                      </div>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:8,borderTop:"2px solid #e2e8f0"}}>
                    <span style={{fontSize:12,color:"#64748b"}}>{aj.dias.length} dia{aj.dias.length!==1?"s":""} trabalhado{aj.dias.length!==1?"s":""}</span>
                    <span style={{fontSize:14,fontWeight:900,color:"#065f46"}}>TOTAL: {_fv(_totalAj)} 💰</span>
                  </div>
                </Card>;
              })}
              {_ajFinArr.length>0&&<div style={{background:"#065f46",borderRadius:14,padding:"16px 18px",marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{color:"rgba(255,255,255,0.8)",fontSize:12}}>👷 {_ajFinArr.length} ajudante{_ajFinArr.length!==1?"s":""} · {_totalGeralDias} dia{_totalGeralDias!==1?"s":""}</div>
                  <div style={{color:"#fff",fontSize:16,fontWeight:900}}>TOTAL MÊS: {_fv(_totalGeralValor)}</div>
                </div>
                <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,marginTop:6}}>Regra: 1ª mud R${_aj1a} + R${_ajAdd} por mud adicional (Config → Regras)</div>
              </div>}
            </div>}
          </div>;
        })()}
        {tab==="config"&&<div style={{paddingBottom:80}}><div style={{background:"#1e293b",padding:"20px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Sistema</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>⚙️ Configuração</div></div><div style={{display:"flex",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}><button onClick={()=>setSubConfig("usuarios")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="usuarios"?700:500,background:"transparent",borderBottom:subConfig==="usuarios"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="usuarios"?"#1e40af":"#64748b"}}>👥 Usuários</button>{isAdmin&&<button onClick={()=>setSubConfig("regras")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="regras"?700:500,background:"transparent",borderBottom:subConfig==="regras"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="regras"?"#1e40af":"#64748b"}}>📊 Regras</button>}</div>{isAdmin&&<button onClick={()=>setSubConfig("backup")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="backup"?700:500,background:"transparent",borderBottom:subConfig==="backup"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="backup"?"#1e40af":"#64748b"}}>💾 Backup</button>}{subConfig==="usuarios"&&(isAdmin||isSupervisor)&&(<div style={{paddingBottom:80}} onMouseEnter={()=>listaUsuarios.length===0&&carregarUsuarios()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:16,fontWeight:900}}>👥 Gerenciar Usuários</div><button onClick={carregarUsuarios} style={{background:"#eff6ff",border:"1px solid #3b82f6",color:"#3b82f6",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔄 Atualizar</button></div><Card style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>USUÁRIOS ({listaUsuarios.length})</div>{listaUsuarios.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Clique em Atualizar</div>:listaUsuarios.map(u=>(<div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}><div><div style={{fontWeight:700,fontSize:13}}>{u.nome}</div><div style={{fontSize:11,color:"#94a3b8"}}>{u.email}{u.contato?" · 📞 "+u.contato:""}</div><span style={{display:"inline-block",marginTop:3,background:u.perfil==="admin"?"#dbeafe":u.perfil==="promorar"?"#dcfce7":u.perfil==="motorista"?"#ede9fe":"#fef9c3",borderRadius:12,padding:"2px 8px",fontSize:10,fontWeight:800,color:u.perfil==="admin"?"#1d4ed8":u.perfil==="promorar"?"#15803d":u.perfil==="motorista"?"#7c3aed":"#a16207"}}>{u.perfil==="admin"?"👑 Admin":u.perfil==="promorar"?"🏢 Promorar":u.perfil==="supervisor"?"👷 Supervisor":u.perfil==="motorista"?"🚚 Motorista":"🤝 Social"}</span>{u.perfil==="motorista"&&(u.tipo_veiculo||u.placa_veiculo)&&<span style={{display:"inline-block",marginTop:3,marginLeft:4,background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:12,padding:"2px 8px",fontSize:10,fontWeight:600,color:"#6d28d9"}}>{u.tipo_veiculo==="VAN"?"🚐 Van":u.tipo_veiculo==="CAMINHAO"?"🚛 Caminhão":u.tipo_veiculo||""}{u.placa_veiculo?" · "+u.placa_veiculo:""}</span>}</div><button onClick={function(){setEditUser({id:u.id,nome:u.nome,email:u.email,senha:"",perfil:u.perfil,ativo:u.ativo,tipo_veiculo:u.tipo_veiculo||"",placa_veiculo:u.placa_veiculo||"",contato:u.contato||""});setEditMsg("");}} style={{padding:"6px 12px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>✏️ Editar</button>{isAdmin&&<button onClick={()=>toggleAtivoUser(u)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(u.ativo?"#ef4444":"#22c55e"),background:u.ativo?"#fef2f2":"#f0fdf4",color:u.ativo?"#ef4444":"#22c55e",fontSize:11,fontWeight:700,cursor:"pointer"}}>{u.ativo?"🚫 Desativar":"✅ Ativar"}</button>}</div>))}</Card><Card><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>+ NOVO USUÁRIO</div><Inp label="Nome" icon="👤" value={novoUser.nome} onChange={v=>setNovoUser(f=>({...f,nome:v}))}/><Inp label="Email" icon="📧" value={novoUser.email} onChange={v=>setNovoUser(f=>({...f,email:v}))}/><Inp label="Senha" icon="🔒" value={novoUser.senha} onChange={v=>setNovoUser(f=>({...f,senha:v}))}/><Inp label="Contato (telefone)" icon="📞" value={novoUser.contato} onChange={v=>setNovoUser(f=>({...f,contato:v}))}/><div style={{marginBottom:12}}><label style={{display:"block",color:"#94a3b8",fontSize:11,fontWeight:700,marginBottom:5}}>PERFIL</label><div style={{display:"flex",gap:8}}>{(isAdmin?[["admin","👑 Admin"],["promorar","🏢 Promorar"],["social","🤝 Social"],["motorista","🚚 Motorista"],["supervisor","👷 Supervisor"]]:[["motorista","🚚 Motorista"],["supervisor","👷 Supervisor"],["social","🤝 Social"]]).map(([val,lab])=>(<button key={val} onClick={()=>setNovoUser(f=>({...f,perfil:val,tipo_veiculo:val!=="motorista"?"":f.tipo_veiculo,placa_veiculo:val!=="motorista"?"":f.placa_veiculo}))} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1.5px solid "+(novoUser.perfil===val?"#f97316":"#e2e8f0"),background:novoUser.perfil===val?"#fff7ed":"#f8fafc",color:novoUser.perfil===val?"#f97316":"#94a3b8",fontWeight:800,fontSize:11,cursor:"pointer"}}>{lab}</button>))}</div></div>{novoUser.perfil==="motorista"&&<div style={{marginBottom:12,padding:"12px 14px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12}}><div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:0.5,marginBottom:10}}>🚗 DADOS DO VEÍCULO</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Tipo de Veículo *</label><select value={novoUser.tipo_veiculo} onChange={function(e){setNovoUser(function(f){return Object.assign({},f,{tipo_veiculo:e.target.value});});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid "+(novoUser.tipo_veiculo?"#7c3aed":"#e2e8f0"),borderRadius:9,fontSize:13,fontWeight:700,color:novoUser.tipo_veiculo?"#7c3aed":"#94a3b8",background:novoUser.tipo_veiculo?"#f5f3ff":"#fff",cursor:"pointer",boxSizing:"border-box"}}><option value="">Selecione...</option><option value="VAN">Van</option><option value="CAMINHAO">Caminhão</option></select></div><div><label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Placa (Opcional)</label><input type="text" placeholder="Ex: ABC-1D23" value={novoUser.placa_veiculo} onChange={function(e){setNovoUser(function(f){return Object.assign({},f,{placa_veiculo:e.target.value});});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontWeight:600,color:"#1e293b",textTransform:"uppercase",boxSizing:"border-box"}}/></div></div></div>}{userMsg&&<div style={{background:userMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:userMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{userMsg}</div>}<button onClick={criarUsuario} disabled={savingUser} style={{width:"100%",padding:13,borderRadius:12,background:savingUser?"#94a3b8":"#f97316",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:savingUser?"not-allowed":"pointer"}}>{savingUser?"⏳ Criando...":"➕ Criar Usuário"}</button></Card></div>)}{editUser&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditUser(null);}}><div style={{background:"#fff",borderRadius:16,padding:"20px 16px 24px",width:"100%",maxWidth:420}} onClick={function(e){e.stopPropagation();}}><div style={{fontSize:15,fontWeight:800,color:"#1e293b",marginBottom:14}}>✏️ Editar Usuário</div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>👤 NOME</div><input value={editUser.nome} onChange={function(e){setEditUser(function(p){return {...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Nome"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📧 EMAIL</div><input value={editUser.email} onChange={function(e){setEditUser(function(p){return {...p,email:e.target.value};});}} type="email" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Email"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📞 CONTATO</div><input value={editUser.contato||""} onChange={function(e){setEditUser(function(p){return {...p,contato:e.target.value};});}} type="tel" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Ex: 81999990000"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>🔒 NOVA SENHA <span style={{fontSize:10,color:"#94a3b8"}}>(vazio = manter)</span></div><input value={editUser.senha||""} onChange={function(e){setEditUser(function(p){return {...p,senha:e.target.value};});}} type="password" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Nova senha (opcional)"/></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6}}>PERFIL</div><div style={{display:"flex",gap:8}}>{[{v:"admin",l:"👑 Admin"},{v:"promorar",l:"🏢 Promorar"},{v:"social",l:"🤝 Social"},{v:"motorista",l:"🚚 Motorista"},{v:"supervisor",l:"👷 Sup."}].map(function(p){return <button key={p.v} onClick={function(){setEditUser(function(u){return {...u,perfil:p.v,tipo_veiculo:p.v!=="motorista"?"":u.tipo_veiculo,placa_veiculo:p.v!=="motorista"?"":u.placa_veiculo};});}} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"2px solid "+(editUser.perfil===p.v?"#1e40af":"#e2e8f0"),background:editUser.perfil===p.v?"#eff6ff":"#f8fafc",color:editUser.perfil===p.v?"#1e40af":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>{p.l}</button>;})}</div></div>{editUser.perfil==="motorista"&&<div style={{marginBottom:14,padding:"12px 14px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12}}><div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:0.5,marginBottom:10}}>🚗 DADOS DO VEÍCULO</div><div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Tipo de Veículo *</div><select value={editUser.tipo_veiculo||""} onChange={function(e){setEditUser(function(u){return {...u,tipo_veiculo:e.target.value};});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid "+(editUser.tipo_veiculo?"#7c3aed":"#e2e8f0"),borderRadius:9,fontSize:13,fontWeight:700,color:editUser.tipo_veiculo?"#7c3aed":"#94a3b8",background:editUser.tipo_veiculo?"#f5f3ff":"#fff",cursor:"pointer",boxSizing:"border-box"}}><option value="">Selecione...</option><option value="VAN">Van</option><option value="CAMINHAO">Caminhão</option></select></div><div><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Placa (Opcional)</div><input type="text" placeholder="Ex: ABC-1D23" value={editUser.placa_veiculo||""} onChange={function(e){setEditUser(function(u){return {...u,placa_veiculo:e.target.value};});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontWeight:600,color:"#1e293b",textTransform:"uppercase",boxSizing:"border-box"}}/></div></div>}{editMsg&&<div style={{background:editMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:editMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{editMsg}</div>}<div style={{display:"flex",gap:8}}><button onClick={function(){setEditUser(null);setEditMsg("");}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarUsuario} disabled={savingEdit} style={{flex:2,padding:11,borderRadius:10,background:savingEdit?"#94a3b8":"#1e40af",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:savingEdit?"not-allowed":"pointer"}}>{savingEdit?"⏳ Salvando...":"✅ Salvar"}</button></div></div></div>}{subConfig==="backup"&&<div style={{padding:16,paddingBottom:16}}><div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:12}}>💾 Backup Automático → Google Drive</div><div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>Backup Ativado</div><div style={{fontSize:10,color:"#64748b"}}>Semanal (seg) + Mensal (dia 1)</div></div><button onClick={async function(){const nv=!backupCfg.ativo;await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.backup_ativo",{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor:nv?"true":"false"})});setBackupCfg(function(p){return{...p,ativo:nv};});}} style={{padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:backupCfg.ativo?"#16a34a":"#e2e8f0",color:backupCfg.ativo?"#fff":"#64748b"}}>{backupCfg.ativo?"✅ Ativo":"❌ Inativo"}</button></div><div style={{background:"#eff6ff",borderRadius:10,padding:"12px 14px",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:8}}>🔗 Google OAuth2</div><div style={{marginBottom:6}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Client ID</div><input type="text" value={backupCfg.clientId} onChange={function(e){setBackupCfg(function(p){return{...p,clientId:e.target.value};});}} placeholder="xxxxxx.apps.googleusercontent.com" style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><div style={{marginBottom:6}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Client Secret</div><input type="password" value={backupCfg.clientSecret} onChange={function(e){setBackupCfg(function(p){return{...p,clientSecret:e.target.value};});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><div style={{marginBottom:8}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Refresh Token</div><input type="password" value={backupCfg.refreshToken} onChange={function(e){setBackupCfg(function(p){return{...p,refreshToken:e.target.value};});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><button onClick={async function(){const pairs=[["backup_gdrive_client_id",backupCfg.clientId],["backup_gdrive_client_secret",backupCfg.clientSecret],["backup_gdrive_refresh_token",backupCfg.refreshToken]];for(const [k,v] of pairs){await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+k,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor:v})});}alert("✅ Credenciais salvas!");}} style={{width:"100%",padding:"8px",background:"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>Salvar Credenciais</button></div><div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#16a34a",marginBottom:4}}>📅 Agendamento Automático</div><div style={{fontSize:11,color:"#475569",marginBottom:2}}>🔁 Semanal: toda segunda-feira às 06:00h</div><div style={{fontSize:11,color:"#475569",marginBottom:2}}>📆 Mensal: dia 1º de cada mês às 06:00h</div><div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Pasta: APP Telemim → [Ano] → Semanal / Mensal</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><button onClick={async function(){setBackupLoading(true);try{const res=await fetch("https://netoufukpmmfhzwirogi.supabase.co/functions/v1/backup-gdrive?tipo=semanal&force=1",{method:"POST",headers:{"Content-Type":"application/json"}});const j=await res.json();alert(j.ok?"✅ Backup semanal!\n"+j.arquivo:"❌ "+(j.erro||j.msg));}catch(e){alert("❌ "+e.message);}setBackupLoading(false);}} disabled={backupLoading} style={{padding:"10px",background:backupLoading?"#94a3b8":"#059669",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{backupLoading?"⏳...":"🚀 Rodar Semanal"}</button><button onClick={async function(){setBackupLoading(true);try{const res=await fetch("https://netoufukpmmfhzwirogi.supabase.co/functions/v1/backup-gdrive?tipo=mensal&force=1",{method:"POST",headers:{"Content-Type":"application/json"}});const j=await res.json();alert(j.ok?"✅ Backup mensal!\n"+j.arquivo:"❌ "+(j.erro||j.msg));}catch(e){alert("❌ "+e.message);}setBackupLoading(false);}} disabled={backupLoading} style={{padding:"10px",background:backupLoading?"#94a3b8":"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{backupLoading?"⏳...":"🚀 Rodar Mensal"}</button></div><div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>Histórico de Backups</div>{backupHist.length===0?<div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:16}}>Nenhum backup realizado ainda</div>:backupHist.map(function(h){return <div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",marginBottom:8,background:h.status==="ok"?"#f0fdf4":"#fef2f2",borderRadius:8,border:"1px solid "+(h.status==="ok"?"#bbf7d0":"#fecaca")}}><div><div style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{h.tipo==="semanal"?"🔁":"📆"} {h.periodo_ref}</div><div style={{fontSize:10,color:"#64748b"}}>{h.arquivo_nome||h.erro_msg}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#94a3b8"}}>{h.executado_em?new Date(h.executado_em).toLocaleString("pt-BR"):""}</div>{h.gdrive_link&&<a href={h.gdrive_link} target="_blank" style={{fontSize:10,color:"#1e40af"}}>🔗 Ver</a>}</div></div>;})}</div>}{subConfig==="regras"&&<div style={{padding:"12px 12px 80px"}}><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚛 Caminhão</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>1ª Mudança (R$)</label><input type="number" value={cfgEdit.cam1a||350} onChange={e=>setCfgEdit(p=>({...p,cam1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.camAdd||130} onChange={e=>setCfgEdit(p=>({...p,camAdd:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>👷 Ajudante</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>1º Ajudante (R$)</label><input type="number" value={cfgEdit.aj1a||80} onChange={e=>setCfgEdit(p=>({...p,aj1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.ajAdd||20} onChange={e=>setCfgEdit(p=>({...p,ajAdd:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚐 Van</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Custo Operacional (R$)</label><input type="number" value={cfgEdit.vanCusto||400} onChange={e=>setCfgEdit(p=>({...p,vanCusto:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Valor Cobrado (R$)</label><input type="number" value={cfgEdit.van1a||1000} onChange={e=>setCfgEdit(p=>({...p,van1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🮾 Imposto e Vigência</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Imposto (%)</label><input type="number" value={Math.round((cfgEdit.imposto||0.16)*100)} onChange={e=>setCfgEdit(p=>({...p,imposto:Number(e.target.value)/100}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>📅 Data Início</label><input type="date" value={cfgEdit.dataInicioRegra||""} onChange={e=>setCfgEdit(p=>({...p,dataInicioRegra:e.target.value}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,boxSizing:"border-box",color:"#334155"}}/></div></div></div></div>{(()=>{const _c1=cfgEdit.cam1a||350;const _cA=cfgEdit.camAdd||130;const _a1=cfgEdit.aj1a||80;const _aA=cfgEdit.ajAdd||20;const _v1=cfgEdit.van1a||1000;const _vC=cfgEdit.vanCusto||400;return <div style={{background:"#f1f5f9",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:12,color:"#475569"}}><div style={{fontWeight:700,marginBottom:6}}>Simulação:</div><div>🚛 1 mud: R${_c1} | 2 mud: R${_c1+_cA} | 3 mud: R${_c1+2*_cA}</div><div>👷 1 aj/1 mud: R${_a1} | 1 aj/2 mud: R${_a1+_aA}</div><div>🚐 Van cobra R${_v1} | custa R${_vC}</div></div>;})()}<button onClick={async()=>{try{const rows=[{chave:"cam_1a_mudanca",valor:String(cfgEdit.cam1a||350)},{chave:"cam_adicional",valor:String(cfgEdit.camAdd||130)},{chave:"ajudante_1a_mudanca",valor:String(cfgEdit.aj1a||80)},{chave:"ajudante_adicional",valor:String(cfgEdit.ajAdd||20)},{chave:"custo_van_dia",valor:String(cfgEdit.vanCusto||400)},{chave:"ganho_van_dia",valor:String(cfgEdit.van1a||1000)},{chave:"van_1a_mudanca",valor:String(cfgEdit.van1a||1000)},{chave:"imposto_pct",valor:String(Math.round((cfgEdit.imposto||0.16)*100))},{chave:"data_inicio_regra",valor:cfgEdit.dataInicioRegra||""}];let ok2=true;for(const row of rows){const res=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+row.chave,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor:row.valor})});if(!res.ok){ok2=false;}}if(ok2){alert("Regras salvas!");}else{alert("Erro ao salvar.");}}catch(e){alert("Erro: "+e.message);}}} style={{width:"100%",padding:"14px",background:"#1e40af",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>💾 Salvar Regras</button></div>}</div>}
          {isAdmin&&subConfig==="regras"&&(
            <div style={{marginTop:20,background:"#f0fdf4",borderRadius:12,padding:16,border:"1px solid #bbf7d0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:800,color:"#15803d"}}>📲 Automação WhatsApp</div>
                <button onClick={function(){var v=cfgWA.whatsapp_ativo==="true"?"false":"true";setCfgWA(function(p){return {...p,whatsapp_ativo:v};});fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.whatsapp_ativo",{method:"PATCH",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({valor:v})}).catch(function(e){console.warn(e);});}} style={{padding:"4px 12px",borderRadius:20,border:"none",background:cfgWA.whatsapp_ativo==="true"?"#16a34a":"#e2e8f0",color:cfgWA.whatsapp_ativo==="true"?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  {cfgWA.whatsapp_ativo==="true"?"✅ Ativo":"⭕ Inativo"}
                </button>
              </div>
              <div style={{fontSize:11,color:"#374151",marginBottom:10,background:"#fff",borderRadius:8,padding:"6px 10px",border:"1px solid #d1fae5"}}>Configure quais notificações enviar automaticamente por evento e destinatário.</div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:3}}>👑 Telefone Admin</div>
                <input type="tel" value={cfgWA.admin_whatsapp} onChange={function(e){setCfgWA(function(p){return {...p,admin_whatsapp:e.target.value};});}} placeholder="Ex: 81999990000" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:3}}>👥 Telefone Supervisor</div>
                <input type="tel" value={cfgWA.supervisor_whatsapp} onChange={function(e){setCfgWA(function(p){return {...p,supervisor_whatsapp:e.target.value};});}} placeholder="Ex: 81988880000" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              {/* ── NOTIFICAÇÕES POR EVENTO ── */}
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #d1fae5"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#15803d",marginBottom:12}}>📋 Notificações por Evento</div>
                {[
                  {grupo:"Mudança Atribuída",items:[
                    {key:"atribuida_motorista",label:"🚚 Motorista"},
                    {key:"atribuida_supervisor",label:"👷 Supervisor"}
                  ]},
                  {grupo:"Motorista em Deslocamento",items:[
                    {key:"deslocamento_admin",label:"👑 Admin"},
                    {key:"deslocamento_cliente",label:"👤 Cliente"},
                    {key:"deslocamento_supervisor",label:"👷 Supervisor"}
                  ]},
                  {grupo:"Mudança Finalizada",items:[
                    {key:"finalizada_admin",label:"👑 Admin"},
                    {key:"finalizada_cliente",label:"👤 Cliente"},
                    {key:"finalizada_supervisor",label:"👷 Supervisor"}
                  ]}
                ].map(function(g){return <div key={g.grupo} style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:6}}>{g.grupo}</div>
                  <div style={{background:"#fff",borderRadius:8,border:"1px solid #d1fae5",padding:"8px 10px"}}>
                    {g.items.map(function(item){
                      var cfg=cfgWAauto[item.key]||{ativo:false,dest:[],msg:""};
                      var _dest=cfg.dest||[];
                      var _chips=[{id:"mot_van",label:"\uD83D\uDE90 Mot. Van"},{id:"mot_caminhao",label:"\uD83D\uDE9A Mot. Caminh\u00E3o"},{id:"admin",label:"\uD83D\uDC51 Admin"},{id:"supervisor",label:"\uD83D\uDC77 Supervisor"},{id:"promorar",label:"\uD83D\uDCCB Promorar"},{id:"social",label:"\uD83C\uDFDB Social"},{id:"cliente",label:"\uD83D\uDC64 Cliente"}];
                      return <div key={item.key} style={{marginBottom:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <input type="checkbox" checked={cfg.ativo} onChange={function(){setCfgWAauto(function(p){var n=Object.assign({},p);n[item.key]=Object.assign({},n[item.key],{ativo:!cfg.ativo});return n;});}} style={{width:16,height:16,cursor:"pointer"}}/>
                          <span style={{fontSize:11,fontWeight:600,color:cfg.ativo?"#15803d":"#64748b"}}>{item.label}</span>
                        </div>
                        {cfg.ativo&&<div>
                          <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Enviar para:</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
                            {_chips.map(function(ch){var sel=_dest.indexOf(ch.id)!==-1;return <button key={ch.id} type="button" onClick={function(){setCfgWAauto(function(p){var n=Object.assign({},p);var cur=(n[item.key]&&n[item.key].dest)||[];var nDest=sel?cur.filter(function(x){return x!==ch.id;}):cur.concat([ch.id]);n[item.key]=Object.assign({},n[item.key],{dest:nDest});return n;});}} style={{padding:"3px 8px",borderRadius:12,border:sel?"1px solid #16a34a":"1px solid #d1d5db",background:sel?"#dcfce7":"#f9fafb",color:sel?"#15803d":"#6b7280",fontSize:10,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>{ch.label}</button>;})}
                          </div>
                          <textarea value={cfg.msg} onChange={function(e){setCfgWAauto(function(p){var n=Object.assign({},p);n[item.key]=Object.assign({},n[item.key],{msg:e.target.value});return n;});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1fae5",fontSize:11,minHeight:50,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace"}}/>
                        </div>}
                      </div>;
                    })}
                  </div>
                </div>;})}
                <div style={{fontSize:10,color:"#64748b",background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:10}}>
                  Variáveis: {"{cliente}"} {"{motorista}"} {"{data}"} {"{origem}"} {"{destino}"} {"{metragem}"} {"{supervisor}"}
                </div>
              </div>
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #d1fae5"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:8}}>🤖 Evolution API (envio automático)</div>
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>URL da API</div>
                  <input type="text" value={cfgWA.evolution_api_url} onChange={function(e){setCfgWA(function(p){return {...p,evolution_api_url:e.target.value};});}} placeholder="http://64.181.190.173:8080" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>API Key</div>
                  <input type="password" value={cfgWA.evolution_api_key} onChange={function(e){setCfgWA(function(p){return {...p,evolution_api_key:e.target.value};});}} placeholder="Chave da Evolution API" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Nome da Instância</div>
                  <input type="text" value={cfgWA.evolution_instance} onChange={function(e){setCfgWA(function(p){return {...p,evolution_instance:e.target.value};});}} placeholder="telemim" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
                </div>
              </div>
              <button onClick={async function(){
                setWaLoading(true);
                try{
                  var pairs=[["admin_whatsapp",cfgWA.admin_whatsapp||""],["supervisor_whatsapp",cfgWA.supervisor_whatsapp||""],["whatsapp_ativo",cfgWA.whatsapp_ativo||"false"],["evolution_api_url",cfgWA.evolution_api_url||""],["evolution_api_key",cfgWA.evolution_api_key||""],["evolution_instance",cfgWA.evolution_instance||""],["wa_auto_config",JSON.stringify(cfgWAauto)]];
                  for(var i=0;i<pairs.length;i++){await fetch(SUPA_URL+"/rest/v1/configuracoes",{method:"POST",headers:{...getH(),"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({chave:pairs[i][0],valor:pairs[i][1]})}).catch(function(e){console.warn("WA save:",e);});}
                  setSyncStatus("📲 Configurações WhatsApp salvas!");
                  setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);
                }catch(e){setSyncStatus("⚠️ Erro: "+e.message);}
                setWaLoading(false);
              }} disabled={waLoading} style={{width:"100%",padding:10,borderRadius:10,border:"none",background:waLoading?"#86efac":"#16a34a",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginTop:12}}>{waLoading?"⏳ Salvando...":"💾 Salvar Configurações WhatsApp"}</button>
            </div>
          )}
            {/* ══ MODAL GPS MAP ══ */}
      {showGpsMap&&gpsMapAgenda&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(4px)",zIndex:2000,display:"flex",flexDirection:"column",padding:0}} onClick={function(){setShowGpsMap(false);setGpsMapAgenda(null);setGpsEta(null);setGpsPositions([]);}}>
          <div style={{flex:1,display:"flex",flexDirection:"column"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{background:"#1e293b",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:"#fff",fontWeight:800,fontSize:14}}>{gpsMapAgenda._trackVeiculo==="cam"?"🚚":"🚐"} GPS {gpsMapAgenda._trackVeiculo==="cam"?"Caminhão":"Van"} — {gpsMapAgenda.nome}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",animation:"pulse 1.5s infinite"}}></span>
                  <span style={{color:"#4ade80",fontSize:11,fontWeight:600}}>Tempo real — auto-refresh 15s</span>
                  {gpsPositions.length>0&&gpsPositions[0].created_at&&<span style={{color:"#94a3b8",fontSize:10,marginLeft:4}}>· Última: {(function(){var d=new Date(gpsPositions[0].created_at);var _p=function(n){return String(n).padStart(2,"0");};return _p(d.getHours())+":"+_p(d.getMinutes())+":"+_p(d.getSeconds());})()}</span>}
                </div>
              </div>
              <button onClick={function(){setShowGpsMap(false);setGpsMapAgenda(null);setGpsEta(null);setGpsPositions([]);}} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:12,cursor:"pointer"}}>✕ Fechar</button>
            </div>
            {gpsEta&&(
              <div style={{background:"#ecfdf5",padding:"10px 16px",borderBottom:"1px solid #a7f3d0",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>⏱️</span>
                <span style={{fontWeight:800,fontSize:14,color:"#065f46"}}>Chegada prevista: {gpsEta.etaStr}</span>
                <span style={{fontSize:12,color:"#047857",marginLeft:8}}>({gpsEta.durMin} min restantes)</span>
              </div>
            )}
            {gpsPositions.length===0&&!gpsEta&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#94a3b8",fontSize:14,fontWeight:600}}>
                <div style={{width:24,height:24,border:"3px solid #64748b",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}></div>
                Aguardando dados GPS do motorista...
                <div style={{fontSize:11,color:"#64748b",maxWidth:260,textAlign:"center"}}>O app do motorista precisa estar aberto com a tela ligada</div>
              </div>
            )}
            {gpsPositions.length>0&&(
              <div id="gps-map-container" style={{flex:1,position:"relative"}} ref={function(el){
                if(!el||!window.mapboxgl||el._mapReady) return;
                el._mapReady=true;
                var pos=gpsPositions[0];
                window.mapboxgl.accessToken=MAPBOX_TOKEN;
                var map=new window.mapboxgl.Map({container:el,style:"mapbox://styles/mapbox/streets-v12",center:[pos.lng,pos.lat],zoom:13});
                el._map=map;
                var markerEl=document.createElement("div");
                markerEl.innerHTML=gpsMapAgenda._trackVeiculo==="cam"?"🚚":"🚐";
                markerEl.style.fontSize="32px";
                el._marker=new window.mapboxgl.Marker({element:markerEl}).setLngLat([pos.lng,pos.lat]).addTo(map);
                // Draw route on map load if ETA already available
                map.on("load",function(){
                  if(gpsEta&&gpsEta.route){
                    try{
                      map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:gpsEta.route}});
                      map.addLayer({id:"route",type:"line",source:"route",layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":"#2563eb","line-width":4}});
                      if(gpsEta.destCoords){
                        var dEl=document.createElement("div");dEl.innerHTML="📍";dEl.style.fontSize="28px";
                        el._destMarker=new window.mapboxgl.Marker({element:dEl}).setLngLat(gpsEta.destCoords).addTo(map);
                        var bounds=new window.mapboxgl.LngLatBounds();
                        bounds.extend([pos.lng,pos.lat]);bounds.extend(gpsEta.destCoords);
                        map.fitBounds(bounds,{padding:60,duration:1000});
                      }
                    }catch(e){}
                  }
                });
              }}></div>
            )}
            <div style={{background:"#1e293b",padding:"10px 16px",display:"flex",gap:8}}>
              <button onClick={function(){
                gpsLoadPositions(gpsMapAgenda.id,gpsMapAgenda._trackMotoristaId||null).then(function(pos){
                  if(!pos) return;
                  setGpsPositions([pos]);
                  var _el=document.getElementById("gps-map-container");
                  if(gpsMapAgenda.destino){
                    gpsCalcEta(pos.lat,pos.lng,gpsMapAgenda.destino).then(function(eta){
                      if(eta){setGpsEta(eta);}
                      if(_el&&_el._map&&_el._marker){
                        _el._marker.setLngLat([pos.lng,pos.lat]);
                        _el._map.easeTo({center:[pos.lng,pos.lat],duration:1000});
                        if(eta&&eta.route&&_el._map.isStyleLoaded()){
                          if(_el._map.getSource("route")){_el._map.getSource("route").setData({type:"Feature",geometry:eta.route});}
                          else{_el._map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:eta.route}});_el._map.addLayer({id:"route",type:"line",source:"route",layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":"#2563eb","line-width":4}});}
                          if(!_el._destMarker&&eta.destCoords){var dEl=document.createElement("div");dEl.innerHTML="📍";dEl.style.fontSize="28px";_el._destMarker=new window.mapboxgl.Marker({element:dEl}).setLngLat(eta.destCoords).addTo(_el._map);}
                          var b=new window.mapboxgl.LngLatBounds();b.extend([pos.lng,pos.lat]);if(eta.destCoords)b.extend(eta.destCoords);_el._map.fitBounds(b,{padding:60,duration:1000});
                        }
                      }
                    });
                  }else if(_el&&_el._marker){
                    _el._marker.setLngLat([pos.lng,pos.lat]);
                    _el._map.easeTo({center:[pos.lng,pos.lat],duration:1000});
                  }
                });
              }} style={{flex:1,background:"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:13,cursor:"pointer"}}>🔄 Atualizar Agora</button>
            </div>
          </div>
        </div>
      )}
            {/* ══ MODAL TRACCAR INSTALL ══ */}
      {showPwaModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(6px)",zIndex:2500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setShowPwaModal(false);}}>
          <div style={{background:"#fff",borderRadius:20,padding:"28px 22px",width:"100%",maxWidth:360,textAlign:"center"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{fontSize:52,marginBottom:12}}>📡</div>
            <div style={{fontSize:18,fontWeight:900,color:"#1e293b",marginBottom:8}}>Instale o Traccar Client</div>
            <div style={{fontSize:13,color:"#475569",marginBottom:16,lineHeight:1.5}}>Para o GPS funcionar com a <b>tela bloqueada</b>, instale o app <b>Traccar Client</b> no seu celular.</div>
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"12px 14px",marginBottom:16,textAlign:"left"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#166534",marginBottom:8}}>Apos instalar, configure:</div>
              <div style={{fontSize:12,color:"#15803d",lineHeight:1.8}}>
                <b>Device ID:</b> {usuario&&usuario.tipo_veiculo==="VAN"?"VAN001":"CAM001"}<br/>
                <b>Server URL:</b> http://64.181.190.173:5055
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button onClick={function(){window.open("https://play.google.com/store/apps/details?id=org.traccar.client","_blank");}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>Android</button>
              <button onClick={function(){window.open("https://apps.apple.com/app/traccar-client/id843156974","_blank");}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:"#1e293b",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>iPhone</button>
            </div>
            <button onClick={function(){localStorage.setItem("tmim_traccar_skip","1");setShowPwaModal(false);}} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#334155",fontWeight:700,fontSize:13,cursor:"pointer"}}>Fechar</button>
          </div>
        </div>
      )}
            {/* ══ MODAL CONFIRMAR FINALIZAÇÃO ══ */}
      {confirmFinAg&&(
        <div style={{position:"fixed",inset:0,background:"rgba(30,64,175,0.75)",backdropFilter:"blur(4px)",zIndex:1500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setConfirmFinAg(null);}}>
          <div style={{background:"rgba(255,255,255,0.12)",borderRadius:20,padding:"32px 24px 24px",width:"100%",maxWidth:340,textAlign:"center",border:"1px solid rgba(255,255,255,0.25)"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{fontSize:48,marginBottom:12}}>🏁</div>
            <div style={{fontSize:18,fontWeight:900,color:"#fff",marginBottom:6}}>Mudança concluída?</div>
            <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.95)",marginBottom:16}}>{confirmFinAg.nome}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:24}}>Ao confirmar, a tela de assinatura do cliente será aberta.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={function(){setConfirmFinAg(null);}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"2px solid rgba(255,255,255,0.4)",background:"transparent",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Voltar</button>
              <button onClick={function(){handleRegistarOS(confirmFinAg);}} style={{flex:1.5,padding:"12px 0",borderRadius:12,border:"none",background:"#fff",color:"#1e40af",fontWeight:900,fontSize:14,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>🏁 Concluir</button>
            </div>
          </div>
        </div>
      )}
            {/* ══ MODAL ASSINATURA DIGITAL ══ */}
      {showAssinatura&&mudAssinatura&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:900,color:COLORS.accent}}>✍️ Assinatura Digital</div>
              <button onClick={function(){setShowAssinatura(false);setMudAssinatura(null);}} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:COLORS.muted}}>✕</button>
            </div>
            <div style={{fontSize:12,color:COLORS.muted,marginBottom:8}}>Cliente: <b>{mudAssinatura.nome}</b> | Selo: <b>{mudAssinatura.selo||'-'}</b></div>
            <div style={{fontSize:11,color:"#92400e",background:"#fef3c7",borderRadius:8,padding:"6px 10px",marginBottom:10}}>Peça ao cliente que assine no espaço abaixo com o dedo ou caneta.</div>
            <div style={{position:"relative",marginBottom:8}}>
              <canvas id="canvasAssin" width={440} height={160} style={{width:"100%",height:160,border:"2px solid #e2e8f0",borderRadius:10,background:"#f8fafc",touchAction:"none",cursor:"crosshair"}}
                onPointerDown={function(e){
                  var cv=document.getElementById('canvasAssin');
                  var ctx=cv.getContext('2d');
                  var r=cv.getBoundingClientRect();
                  var sx=cv.width/r.width;var sy=cv.height/r.height;
                  ctx.beginPath();
                  ctx.moveTo((e.clientX-r.left)*sx,(e.clientY-r.top)*sy);
                  cv._draw=true;
                  e.preventDefault();
                }}
                onPointerMove={function(e){
                  var cv=document.getElementById('canvasAssin');
                  if(!cv._draw) return;
                  var ctx=cv.getContext('2d');
                  var r=cv.getBoundingClientRect();
                  var sx=cv.width/r.width;var sy=cv.height/r.height;
                  ctx.lineTo((e.clientX-r.left)*sx,(e.clientY-r.top)*sy);
                  ctx.strokeStyle='#1e293b';ctx.lineWidth=2.5;ctx.lineCap='round';
                  ctx.stroke();
                  e.preventDefault();
                }}
                onPointerUp={function(e){var cv=document.getElementById('canvasAssin');cv._draw=false;}}
                onPointerLeave={function(e){var cv=document.getElementById('canvasAssin');cv._draw=false;}}
              />
              <button onClick={function(){var cv=document.getElementById('canvasAssin');cv.getContext('2d').clearRect(0,0,cv.width,cv.height);}} style={{position:"absolute",top:6,right:6,background:"#f1f5f9",border:"none",borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer",color:COLORS.muted}}>Limpar</button>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:COLORS.text,marginBottom:4}}>Ressalvas / Observações do cliente</div>
              <textarea value={ressalvas} onChange={function(e){setRessalvas(e.target.value);}} rows={2} placeholder="Deixe em branco se não houver ressalvas..." style={{width:"100%",padding:"6px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setShowAssinatura(false);setMudAssinatura(null);}} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#f1f5f9",color:COLORS.muted,fontWeight:700,cursor:"pointer"}}>Cancelar</button>
              <button onClick={async function(){
                var cv=document.getElementById('canvasAssin');
                var ctx=cv.getContext('2d');
                var px=ctx.getImageData(0,0,cv.width,cv.height).data;
                var temDesenho=false;
                for(var i=3;i<px.length;i+=4){if(px[i]>0){temDesenho=true;break;}}
                if(!temDesenho){alert('Por favor, recolha a assinatura do cliente antes de continuar.');return;}
                var assinB64=cv.toDataURL('image/png');
                setShowAssinatura(false);
                var _mId=mudAssinatura.id;
                var _sigB64=assinB64;
                setMudancas(function(prev){return prev.map(function(m){return m.id===_mId?{...m,status:"Concluído",requested_by:usuario?usuario.nome:null,signature_data:_sigB64}:m;});});
                fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+_mId,{method:"PATCH",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({status:"Concluído",signature_data:_sigB64})}).catch(function(e){console.warn("sig patch:",e);});
                // Fix: Also update agenda status if item came from agenda
                var _isAgenda=agenda.some(function(a){return a.id===_mId;});
                if(_isAgenda){
                  setAgenda(function(prev){return prev.map(function(a){return a.id===_mId?{...a,status:"concluida"}:a;});});
                  fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+_mId,{method:"PATCH",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({status:"concluida"})}).catch(function(e){console.warn("agenda status patch:",e);});
                  // Create mudancas record from agenda item for registros
                  var _agItem=agenda.find(function(a){return a.id===_mId;});
                  if(_agItem){
                    var _novaM={nome:_agItem.nome,selo:_agItem.selo||"",comunidade:_agItem.comunidade||"",data:_agItem.data,origem:_agItem.origem||"",destino:_agItem.destino||"",contato:_agItem.contato||null,van:_agItem.van||false,caminhao:_agItem.caminhao||false,medicao:parseFloat(_agItem.medicao)||0,ajudantes:parseInt(_agItem.ajudantes)||0,observacao:_agItem.observacao||"",status:"Concluído",signature_data:_sigB64,motorista_van_id:_agItem.motorista_van_id||null,motorista_caminhao_id:_agItem.motorista_caminhao_id||null,supervisor_id:_agItem.supervisor_id||null,approved_by_admin:_agItem.approved_by_admin||null,approved_by_social:_agItem.approved_by_social||null,approved_by_promorar:_agItem.approved_by_promorar||null,approved_by_supervisor:_agItem.approved_by_supervisor||null};
                    fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(_novaM)}).then(function(r){return r.json();}).then(function(d){if(Array.isArray(d)&&d[0]){setMudancas(function(prev){return[d[0]].concat(prev);});}}).catch(function(e){console.warn("create mud from agenda:",e);});
                  }
                }
                try{_addNotif("concluida","Mudanca concluida e assinada",mudAssinatura.nome);}catch(e){}
                await _gerarPDFComAssinatura(mudAssinatura,assinB64,ressalvas);
                setMudAssinatura(null);
              }} style={{flex:2,padding:10,borderRadius:10,border:"none",background:COLORS.accent,color:"#fff",fontWeight:900,cursor:"pointer"}}>📄 Gerar Recibo PDF</button>
            </div>
          </div>
        </div>
      )}
         {/* ══ MODAL DETALHES DA MUDANÇA (READ-ONLY) ══ */}
      {viewMud&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setViewMud(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:"20px 18px",width:"94%",maxWidth:440,maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:17,fontWeight:900,color:COLORS.text}}>📋 Detalhes da Mudança</div>
              <button onClick={()=>setViewMud(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94a3b8"}}>✕</button>
            </div>
            {(function(){var v=viewMud;var _row=function(label,val,icon){return val?<div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}><span style={{fontSize:12,color:"#64748b"}}>{icon} {label}</span><span style={{fontSize:12,fontWeight:600,color:COLORS.text,textAlign:"right",maxWidth:"60%"}}>{val}</span></div>:null;};
            return(<div>
              {_row("Nome",v.nome,"👤")}
              {_row("Selo",v.selo,"🏷️")}
              {_row("Comunidade",v.comunidade,"🏘️")}
              {_row("Data",v.data,"📅")}
              {_row("Horário",v.horario,"⏰")}
              {_row("Origem",v.origem,"📦")}
              {_row("Destino",v.destino,"🏠")}
              {_row("Contato",v.contato,"📞")}
              {_row("Medição",v.medicao?v.medicao+" m³":"","📐")}
              {_row("Van",v.van?"Sim":"Não","🚐")}
              {_row("Caminhão",v.caminhao?"Sim":"Não","🚚")}
              {_row("Status",v.status,"📌")}
              {_row("Observação",v.observacao,"📝")}
              {_row("Criado por",v.created_by,"✍️")}
              {_row("Perfil criador",v.creator_role,"🔑")}
              {_row("Criado em",v.criado_em?new Date(v.criado_em).toLocaleString("pt-BR"):null,"🕐")}
              <div style={{borderTop:"1px solid #e2e8f0",marginTop:10,paddingTop:8,fontSize:11,color:"#475569"}}>
                <div style={{fontWeight:700,marginBottom:4}}>Aprovações:</div>
                <div style={{marginBottom:2}}>Admin: {v.approved_by_admin?<b style={{color:"#16a34a"}}>✅ {v.approved_by_admin}</b>:<span style={{color:"#9ca3af"}}>⏳ Pendente</span>}</div>
                <div style={{marginBottom:2}}>Social: {v.approved_by_social?<b style={{color:"#16a34a"}}>✅ {v.approved_by_social}</b>:<span style={{color:"#9ca3af"}}>⏳ Pendente</span>}</div>
                <div>Promorar: {v.approved_by_promorar?<b style={{color:"#16a34a"}}>✅ {v.approved_by_promorar}</b>:<span style={{color:"#9ca3af"}}>⏳ Pendente</span>}</div>
              </div>
            </div>);})()}
            <button onClick={()=>setViewMud(null)} style={{marginTop:14,padding:"10px 0",width:"100%",background:COLORS.accent,color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Fechar</button>
          </div>
        </div>
      )}
         {/* ══ MODAL VER PDF ASSINADO (READ-ONLY) ══ */}
      {showViewPDF&&mudViewPDF&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto",padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:900,color:"#0284c7"}}>📄 PDF Assinado</div>
              <button onClick={function(){setShowViewPDF(false);setMudViewPDF(null);}} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#0369a1",fontWeight:600}}>🔒 Documento já assinado — apenas leitura. Não é possível reasinar.</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>Cliente: <b>{mudViewPDF.nome}</b> | Selo: <b>{mudViewPDF.selo||"-"}</b></div>
            <div style={{fontSize:11,color:"#475569",marginBottom:12}}>📅 Assinado em: <b>{mudViewPDF.assinado_em?new Date(mudViewPDF.assinado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):mudViewPDF.termino_em?new Date(mudViewPDF.termino_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</b></div>
            {mudViewPDF.signature_data&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:6}}>Assinatura registada:</div>
                <div style={{border:"2px solid #e2e8f0",borderRadius:10,overflow:"hidden",background:"#f8fafc",pointerEvents:"none"}}>
                  <img src={mudViewPDF.signature_data} alt="Assinatura" style={{width:"100%",display:"block",maxHeight:140,objectFit:"contain"}}/>
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={function(){_gerarPDFComAssinatura(mudViewPDF,mudViewPDF.signature_data,"");}} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#0284c7",color:"#fff",fontWeight:900,cursor:"pointer",fontSize:13}}>⬇️ Baixar PDF</button>
              <button onClick={function(){setShowViewPDF(false);setMudViewPDF(null);}} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#f1f5f9",color:"#64748b",fontWeight:700,cursor:"pointer"}}>Fechar</button>
            </div>
          </div>
        </div>
      )}
   {/* ══ MODAL IMPORTAR (MUDANÇA) ══ */}
      {showImport&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowImport(false)}><div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"20px 16px 32px",width:"100%",maxWidth:480,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:15,fontWeight:900,color:COLORS.text,marginBottom:4}}>📥 Importar Solicitação</div>
        <div style={{fontSize:11,color:COLORS.muted,marginBottom:12}}>Cole o texto recebido. O app preenche automaticamente!</div>
        <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder="Sr. José Luiz Ramos - Número do Selo: VT-022-006-A&#10;de (Chesf Vietnã), informou...&#10;Data solicitada: Quarta: 25/03&#10;Horário: 11:00h&#10;Endereço de saída: Rua...&#10;Endereço Final: Rua..." style={{width:"100%",minHeight:140,background:"#f8fafc",border:"1.5px solid "+COLORS.cardBorder,borderRadius:10,padding:"10px",fontSize:12,color:COLORS.text,resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
        {importText&&(()=>{const p=parseImport(importText);return(<div style={{background:"#fff7ed",border:"1px solid "+COLORS.accent+"44",borderRadius:10,padding:"10px",marginTop:10,fontSize:11}}><div style={{fontWeight:800,color:COLORS.accent,marginBottom:6}}>✨ Dados extraídos:</div>{[["👤 Nome",p.nome],["🏷️ Selo",p.selo],["📍 Comunidade",p.comunidade],["📅 Data",p.data?fmtDate(p.data):"—"],["⏰ Horário",p.horario||"—"],["📦 Saída",p.origem],["🏠 Destino",p.destino],["🚐 Van",p.van?"✅":"—"],["🚚 Caminhão",p.caminhao?"✅":"—"]].map(([k,v])=>(<div key={k} style={{display:"flex",gap:8,marginBottom:3}}><span style={{color:COLORS.muted,minWidth:90}}>{k}:</span><span style={{fontWeight:600,color:COLORS.text}}>{v||"—"}</span></div>))}</div>);})()}
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button onClick={()=>setShowImport(false)} style={{flex:1,padding:"11px",borderRadius:10,border:"1.5px solid "+COLORS.cardBorder,background:"#f8fafc",color:COLORS.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>{if(!importText.trim())return;const p=parseImport(importText);setForm(f=>({...f,nome:p.nome||f.nome,selo:p.selo||f.selo,comunidade:p.comunidade||f.comunidade,data:p.data||f.data,origem:p.origem||f.origem,destino:p.destino||f.destino,van:p.van||f.van,caminhao:p.caminhao||f.caminhao}));setShowImport(false);setFlash("✅ Dados importados!");setTimeout(()=>setFlash(""),2500);}} style={{flex:2,padding:"11px",borderRadius:10,background:COLORS.accent,color:"#fff",fontWeight:900,fontSize:13,cursor:"pointer",border:"none"}}>✅ Importar e Preencher</button>
        </div>
      </div></div>)}

      {/* ══ MODAL EDITAR MUDANÇA ══ */}
      {editMud&&podeEditar&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setEditMud(null)}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:22,width:"100%",maxWidth:640,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 -4px 30px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:900,color:COLORS.accent}}>✏️ Editar Mudança</div>
              <button onClick={()=>setEditMud(null)} style={{background:"transparent",border:"none",color:COLORS.muted,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            <Inp label="Nome" icon="👤" value={editMud.nome} onChange={v=>setEditMud(f=>({...f,nome:v}))} placeholder="Nome completo"/>
            <Inp label="Selo" icon="🏷️" value={editMud.selo||""} onChange={v=>setEditMud(f=>({...f,selo:v}))} placeholder="Ex: VT-020-001 A"/>
            <Inp label="Comunidade" icon="📍" value={editMud.comunidade||""} onChange={v=>setEditMud(f=>({...f,comunidade:v}))} placeholder="Comunidade"/>
            <Inp label="Data" icon="📅" type="date" value={editMud.data} onChange={v=>setEditMud(f=>({...f,data:v}))}/>
            <Inp label="Origem" icon="📦" value={editMud.origem||""} onChange={v=>setEditMud(f=>({...f,origem:v}))} placeholder="Endereço de origem"/>
            <Inp label="Destino" icon="🏠" value={editMud.destino||""} onChange={v=>setEditMud(f=>({...f,destino:v}))} placeholder="Endereço de destino"/>
            <Inp label="Medição (m³)" icon="📐" type="number" value={editMud.medicao} onChange={v=>setEditMud(f=>({...f,medicao:v}))} placeholder="Ex: 27"/>
            <Tog label="🚐 Van" value={editMud.van} onChange={v=>setEditMud(f=>({...f,van:v}))}/>
            <Tog label="🚚 Caminhão" value={editMud.caminhao} onChange={v=>setEditMud(f=>({...f,caminhao:v}))}/>
            {isAdmin&&<div style={{marginTop:8,padding:"10px 12px",background:"#fefce8",borderRadius:10,border:"1px solid #fef08a"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:6}}>👷 Qtd. Ajudantes <span style={{fontSize:9,background:"#f59e0b",color:"#fff",borderRadius:4,padding:"1px 5px",marginLeft:4}}>ADMIN</span></div>
              <input type="number" min="0" value={editMud._qtdAj===0?"":editMud._qtdAj||""} onChange={function(e){var raw=e.target.value;setEditMud(function(f){return {...f,_qtdAj:raw===""?"":(parseInt(raw)||0)};});}} style={{width:"100%",padding:"6px 10px",borderRadius:8,border:"1px solid #fcd34d",fontSize:13,fontWeight:600,background:"#fffbeb"}} placeholder="Ex: 3"/>
              <div style={{fontSize:10,color:"#78716c",marginTop:4}}>Apenas administradores podem alterar este valor.</div>
            </div>}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={()=>setEditMud(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${COLORS.cardBorder}`,background:"transparent",color:COLORS.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Cancelar</button>
              <button onClick={handleSaveEditMud} style={{flex:2,padding:12,borderRadius:12,border:"none",background:COLORS.accent,color:"#fff",fontWeight:900,fontSize:14,cursor:"pointer"}}>💾 Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL IMPORTAR (AGENDA) ══ */}
      {showImportAg&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowImportAg(false)}><div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"20px 16px 32px",width:"100%",maxWidth:480,maxHeight:"80vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:15,fontWeight:900,color:COLORS.text,marginBottom:4}}>📥 Importar Solicitação</div>
        <div style={{fontSize:11,color:COLORS.muted,marginBottom:12}}>Cole o texto recebido. O app preenche o agendamento automaticamente!</div>
        <textarea value={importTextAg} onChange={e=>setImportTextAg(e.target.value)} placeholder="Sr. José Luiz Ramos - Número do Selo: VT-022-006-A&#10;de (Chesf Vietnã), informou...&#10;Data solicitada: Quarta: 25/03&#10;Horário: 11:00h&#10;Endereço de saída: Rua...&#10;Endereço Final: Rua..." style={{width:"100%",minHeight:140,background:"#f8fafc",border:"1.5px solid "+COLORS.cardBorder,borderRadius:10,padding:"10px",fontSize:12,color:COLORS.text,resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
        {importTextAg&&(()=>{const p=parseImport(importTextAg);return(<div style={{background:"#f5f3ff",border:"1px solid "+COLORS.purple+"44",borderRadius:10,padding:"10px",marginTop:10,fontSize:11}}><div style={{fontWeight:800,color:COLORS.purple,marginBottom:6}}>✨ Dados extraídos:</div>{[["👤 Nome",p.nome],["🏷️ Selo",p.selo],["📍 Comunidade",p.comunidade],["📅 Data",p.data?fmtDate(p.data):"—"],["⏰ Horário",p.horario||"—"],["📦 Saída",p.origem],["🏠 Destino",p.destino],["🚐 Van",p.van?"✅":"—"],["🚚 Caminhão",p.caminhao?"✅":"—"]].map(([k,v])=>(<div key={k} style={{display:"flex",gap:8,marginBottom:3}}><span style={{color:COLORS.muted,minWidth:90}}>{k}:</span><span style={{fontWeight:600,color:COLORS.text}}>{v||"—"}</span></div>))}</div>);})()}
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button onClick={()=>setShowImportAg(false)} style={{flex:1,padding:"11px",borderRadius:10,border:"1.5px solid "+COLORS.cardBorder,background:"#f8fafc",color:COLORS.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>{if(!importTextAg.trim())return;const p=parseImport(importTextAg);setAgForm(f=>({...f,nome:p.nome||f.nome,selo:p.selo||f.selo,comunidade:p.comunidade||f.comunidade,data:p.data||f.data,horario:p.horario||f.horario,origem:p.origem||f.origem,destino:p.destino||f.destino,van:p.van||f.van,caminhao:p.caminhao||f.caminhao}));setShowImportAg(false);setFlash("✅ Dados importados!");setTimeout(()=>setFlash(""),2500);}} style={{flex:2,padding:"11px",borderRadius:10,background:COLORS.purple,color:"#fff",fontWeight:900,fontSize:13,cursor:"pointer",border:"none"}}>✅ Importar e Preencher</button>
        </div>
      
      </div>{toast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:12,fontWeight:700,zIndex:9999,boxShadow:"0 4px 24px rgba(0,0,0,0.3)",maxWidth:"90vw",textAlign:"center"}}>{toast.msg}</div>}</div>)}

      {/* ══ MODAL EDITAR AGENDAMENTO ══ */}
      {editAg&&podeEditar&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setEditAg(null)}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:22,width:"100%",maxWidth:640,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 -4px 30px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:900,color:COLORS.purple}}>✏️ Editar Agendamento</div>
              <button onClick={()=>setEditAg(null)} style={{background:"transparent",border:"none",color:COLORS.muted,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            <Inp label="Nome" icon="👤" value={editAg.nome} onChange={v=>setEditAg(f=>({...f,nome:v}))} placeholder="Nome completo"/>
            <Inp label="Selo" icon="🏷️" value={editAg.selo||""} onChange={v=>setEditAg(f=>({...f,selo:v}))} placeholder="Ex: VT-020-021-A"/>
            <Inp label="Comunidade" icon="📍" value={editAg.comunidade||""} onChange={v=>setEditAg(f=>({...f,comunidade:v}))} placeholder="Comunidade"/>
            <Inp label="Data" icon="📅" type="date" value={editAg.data} onChange={v=>setEditAg(f=>({...f,data:v}))}/>
            <Inp label="Horário" icon="⏰" type="time" value={editAg.horario||""} onChange={v=>setEditAg(f=>({...f,horario:v}))}/>
            <Inp label="Saída" icon="📦" value={editAg.origem||""} onChange={v=>setEditAg(f=>({...f,origem:v}))} placeholder="Endereço de origem"/>
            <Inp label="Chegada" icon="🏠" value={editAg.destino||""} onChange={v=>setEditAg(f=>({...f,destino:v}))} placeholder="Endereço de destino"/>
            <Inp label="Contato" icon="📞" value={editAg.contato||""} onChange={v=>setEditAg(f=>({...f,contato:v}))} placeholder="Ex: 81 99999-9999"/>
            <Tog label="🚐 Van" value={editAg.van||false} onChange={v=>setEditAg(f=>({...f,van:v}))}/>
            <Tog label="🚚 Caminhão" value={editAg.caminhao||false} onChange={v=>setEditAg(f=>({...f,caminhao:v}))}/>
            <div style={{marginBottom:11}}>
              <label style={{display:"block",color:COLORS.muted,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:6,textTransform:"uppercase"}}>📋 Status</label>
              <div style={{display:"flex",gap:7}}>
                {["confirmado","pendente","realizado"].map(s=>(
                  <button key={s} onClick={()=>setEditAg(f=>({...f,status:s}))} style={{flex:1,padding:"8px 4px",borderRadius:9,border:`1.5px solid ${editAg.status===s?statusColor[s]:COLORS.cardBorder}`,background:editAg.status===s?statusColor[s]+"18":"#f8fafc",color:editAg.status===s?statusColor[s]:COLORS.muted,fontWeight:700,fontSize:11,cursor:"pointer"}}>
                    {statusLabel[s]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={()=>setEditAg(null)} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${COLORS.cardBorder}`,background:"transparent",color:COLORS.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Cancelar</button>
              <button onClick={handleSaveEditAg} style={{flex:2,padding:12,borderRadius:12,border:"none",background:COLORS.purple,color:"#fff",fontWeight:900,fontSize:14,cursor:"pointer"}}>💾 Salvar</button>
            </div>
          </div>
        </div>
      )}

    {modalAssinatura&&mudancaCanhoto&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
          <p style={{margin:"0 0 2px",fontWeight:700,fontSize:16}}>✍️ Assinatura do Morador</p>
          <p style={{margin:"0 0 14px",fontSize:12,color:"#666"}}>{mudancaCanhoto.nome} — {mudancaCanhoto.data}</p>
          <div style={{border:"1.5px solid #e2e8f0",borderRadius:8,overflow:"hidden",marginBottom:12,background:"#f8fafc"}}>
            <canvas id="cvAssin" width={360} height={150}
              style={{display:"block",width:"100%",touchAction:"none",cursor:"crosshair"}}
              onPointerDown={e=>{const c=e.currentTarget,ctx=c.getContext("2d");c._d=true;const b=c.getBoundingClientRect();ctx.beginPath();ctx.moveTo((e.clientX-b.left)*(c.width/b.width),(e.clientY-b.top)*(c.height/b.height));}}
              onPointerMove={e=>{const c=e.currentTarget;if(!c._d)return;const b=c.getBoundingClientRect(),ctx=c.getContext("2d");ctx.lineWidth=2.5;ctx.strokeStyle="#1e293b";ctx.lineCap="round";ctx.lineTo((e.clientX-b.left)*(c.width/b.width),(e.clientY-b.top)*(c.height/b.height));ctx.stroke();}}
              onPointerUp={e=>{e.currentTarget._d=false;}}
              onPointerLeave={e=>{e.currentTarget._d=false;}}
            />
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{const c=document.getElementById("cvAssin");if(c)c.getContext("2d").clearRect(0,0,c.width,c.height);}} style={{flex:1,padding:"10px 0",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:13}}>Limpar</button>
            <button onClick={()=>{setModalAssinatura(false);setMudancaCanhoto(null);}} style={{flex:1,padding:"10px 0",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:13}}>Cancelar</button>
            <button onClick={async()=>{const c=document.getElementById("cvAssin");await confirmarComAssinatura(c?c.toDataURL("image/png"):null);}} style={{flex:2,padding:"10px 0",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14}}>✅ Confirmar</button>
          </div>
        </div>
      </div>
    )}
    {/* ══ MODAL VER EQUIPE DO DIA ══ */}
    {viewEquipeAg&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setViewEquipeAg(null);}}>
        <div style={{background:"#fff",borderRadius:16,padding:"20px 18px",width:"100%",maxWidth:360}} onClick={function(e){e.stopPropagation();}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:15,fontWeight:900,color:"#92400e"}}>👷 Equipe do Dia</div>
            <button onClick={function(){setViewEquipeAg(null);}} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#94a3b8"}}>✕</button>
          </div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>📅 {viewEquipeAg.data?viewEquipeAg.data.slice(8)+"/"+viewEquipeAg.data.slice(5,7)+"/"+viewEquipeAg.data.slice(0,4):""}</div>
          {viewEquipeAg.ajudantes.length===0?<div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8",fontSize:13}}>Nenhuma equipe escalada neste dia</div>:viewEquipeAg.ajudantes.map(function(aj){
            return <div key={aj.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",marginBottom:4,background:"#f0fdf4",borderRadius:10,border:"1px solid #bbf7d0"}}>
              <span style={{fontSize:16}}>✅</span>
              <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{aj.nome}</div>{aj.telefone&&<div style={{fontSize:11,color:"#64748b"}}>📞 {aj.telefone}</div>}</div>
            </div>;
          })}
          {viewEquipeAg.ajudantes.length>0&&<div style={{marginTop:10,fontSize:12,color:"#065f46",fontWeight:700,textAlign:"center"}}>{viewEquipeAg.ajudantes.length} ajudante{viewEquipeAg.ajudantes.length!==1?"s":""} escalado{viewEquipeAg.ajudantes.length!==1?"s":""}</div>}
        </div>
      </div>
    )}
    {/* ══ MODAL SOLICITAR CANCELAMENTO ══ */}
    {cancelModal&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setCancelModal(null);setCancelMotivo("");}}>
        <div style={{background:"#fff",borderRadius:16,padding:"24px 20px",width:"100%",maxWidth:380}} onClick={function(e){e.stopPropagation();}}>
          <div style={{fontSize:16,fontWeight:900,color:"#dc2626",marginBottom:14}}>⚠️ Solicitar Cancelamento</div>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:4}}>📦 {cancelModal.nome}</div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:14}}>📅 {cancelModal.data?fmtDate(cancelModal.data):""} · ⏰ {cancelModal.horario||"?"}</div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Motivo do cancelamento:</div>
            <textarea value={cancelMotivo} onChange={function(e){setCancelMotivo(e.target.value);}} rows={3} placeholder="Informe o motivo..." style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
          </div>
          <div style={{background:"#fef9c3",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#92400e",marginBottom:14}}>O Admin será notificado e precisará autorizar o cancelamento.</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){setCancelModal(null);setCancelMotivo("");}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Voltar</button>
            <button onClick={function(){if(!cancelMotivo.trim()){alert("Informe o motivo do cancelamento.");return;}handleSolicitarCancelamento(cancelModal.id,cancelMotivo.trim());}} style={{flex:2,padding:11,borderRadius:10,background:"#dc2626",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>📩 Solicitar Cancelamento</button>
          </div>
        </div>
      </div>
    )}
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.55)",zIndex:9998,display:confirmDelete?"flex":"none",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setConfirmDelete(null);}}><div style={{background:"#fff",borderRadius:20,padding:"28px 24px",maxWidth:340,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.2)",textAlign:"center"}} onClick={function(e){e.stopPropagation();}}><div style={{fontSize:36,marginBottom:12}}>⚠️</div><div style={{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:8}}>Tem a certeza?</div><div style={{fontSize:13,color:"#64748b",marginBottom:20}}>Apagar <strong>{confirmDelete&&confirmDelete.nome}</strong>?</div><div style={{display:"flex",gap:10}}><button onClick={function(){setConfirmDelete(null);}} style={{flex:1,padding:"11px 0",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button><button onClick={function(){if(confirmDelete&&confirmDelete.tipo==="mud")handleDelMud(confirmDelete.id);else if(confirmDelete)handleDelAg(confirmDelete.id);setConfirmDelete(null);}} style={{flex:1,padding:"11px 0",borderRadius:12,border:"none",background:"#ef4444",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>🗑️ Sim, Apagar</button></div></div></div>
    </div>
  );
}
