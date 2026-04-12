// TELEMIM v3.3
import { useState, useEffect, useMemo } from "react";
/* v2 */const _getValidToken=async function(usuario,SUPA_URL,SUPA_KEY){if(!usuario?.token)return null;try{const pl=JSON.parse(atob(usuario.token.split(".")[1]));const ok=pl.exp*1000>Date.now()+30000;if(ok)return usuario.token;if(!usuario.refresh_token)return usuario.token;const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:usuario.refresh_token})});const d=await res.json();if(d.access_token){const saved=JSON.parse(localStorage.getItem("tmim_u")||"{}");saved.token=d.access_token;if(d.refresh_token)saved.refresh_token=d.refresh_token;localStorage.setItem("tmim_u",JSON.stringify(saved));return d.access_token;}}catch(e){}return usuario.token;};
const _fmtDate=function(d){return d.getFullYear()+"-"+(d.getMonth()+1<10?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate();};

// ── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPA_URL = "https://netoufukpmmfhzwirogi.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldG91ZnVrcG1tZmh6d2lyb2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTkwOTksImV4cCI6MjA4OTg5NTA5OX0.iapL70SiL_GV4XvmXRNcjlK_Sc-P2-esJzuLQvovdGQ";
const HEADERS = { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` };

async function dbGet(table) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*&order=id`, { headers: HEADERS });
  if (!r.ok) return [];
  return r.json();
}
async function dbUpsert(table, rows) {
  await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
}
async function dbDelete(table, id) {
  await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: HEADERS });
}

async function dbGetContas(status){
  const r=await fetch(`${SUPA_URL}/rest/v1/contas_pagar?status=eq.${status}&order=criado_em.desc`,{headers:{...HEADERS,"Range":"0-29"}});
  if(!r.ok)return [];
  return r.json();
}
async function dbInsertConta(row){
  const r=await fetch(`${SUPA_URL}/rest/v1/contas_pagar`,{method:"POST",headers:{...HEADERS,"Prefer":"return=representation"},body:JSON.stringify([row])});
  if(!r.ok)return null;
  const d=await r.json();return d[0]||null;
}
async function dbPagarConta(id,agora){
  await fetch(`${SUPA_URL}/rest/v1/contas_pagar?id=eq.${id}`,{method:"PATCH",headers:{...HEADERS,"Prefer":"return=minimal"},body:JSON.stringify({status:"pago",pago_em:agora})});
}
// ── CUSTOS DIÁRIOS ───────────────────────────────────────────────────────────
async function dbGetCustos() {
  const r = await fetch(`${SUPA_URL}/rest/v1/custos_diarios?select=*&order=data`, { headers: HEADERS });
  if (!r.ok) return [];
  return r.json();
}
async function dbUpsertCusto(row) {
  await fetch(`${SUPA_URL}/rest/v1/custos_diarios`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates" },
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
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
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
  var cCam=0; var cVan=0; var cAj=0; var cAlm=0;
  diasU.forEach(function(data){
    var numMud=mudP.filter(function(m){return m.data===data;}).length;
    if(numMud===0) return;
    var cdDia=(cdP||[]).find(function(cd){return cd.data===data;})||{ajudantes:0,custo_almoco:0};
    var numAj=parseInt(cdDia.ajudantes)||0;
    cCam+=_calcDiario(numMud,0,"caminhao",RULES);
    cVan+=_calcDiario(numMud,0,"van",RULES);
    cAj+=_calcDiario(numMud,numAj,"ajudante",RULES);
    cAlm+=_fv(cdDia.custo_almoco);
  });
  var cExtra=(cpP||[]).reduce(function(s,cp){return s+_fv(cp.valor);},0);
  var despTotal=cCam+cVan+cAj+cAlm+cExtra;
  var lucroLiq=fatLiq-despTotal;
  return {
    cCam,cVan,cAj,cAlm,cExtra,despTotal,
    fatBruto,fatLiq,imposto,lucroLiq,
    numMud:mudP.length,m3Total,diasU,numVan
  };
}
function ResumoSemanal({mudancas,RULES,prestadores,custosDiarios,setCustosDiarios}){
  var _pc=function(n){return String(n).padStart(2,"0");};
  var _hc=new Date();var _dwc=_hc.getDay();var _dc=_dwc===0?6:_dwc-1;
  var _s0c=new Date(_hc.getFullYear(),_hc.getMonth(),_hc.getDate()-_dc);
  var _s1c=new Date(_s0c.getFullYear(),_s0c.getMonth(),_s0c.getDate()+6);
  var _fc=function(d){return d.getFullYear()+"-"+_pc(d.getMonth()+1)+"-"+_pc(d.getDate());};
  var _fb=function(d){return _pc(d.getDate())+"/"+_pc(d.getMonth()+1)+"/"+d.getFullYear();};
  var _sic=_fc(_s0c);var _sfc=_fc(_s1c);
  var _periodo=_fb(_s0c)+" a "+_fb(_s1c);
  var _ms=mudancas.filter(function(m){return m.data>=_sic&&m.data<=_sfc;});
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
    det.forEach(function(d){
      var parts=String(d.data).split("-");
      var df=parts[2]+"/"+parts[1]+"/"+parts[0];
      if(p.id==="__equipa_aj__"||p.cargo==="ajudante"){
        var aj=parseInt(d.numAj)||1;
        txtDiario+="Data "+df+" - "+d.numMud+" mudanças x "+aj+" "+(aj===1?"ajudante":"ajudantes")+" = R$ "+_fvs(d.val)+NL;
      }else if(p.cargo==="van"){
        // Van: diária fixa — não mencionar mudanças
        txtDiario+="Data "+df+" - Diária - R$ "+_fvs(d.val)+NL;
      }else{
        // Caminhão: base + acréscimo
        txtDiario+="Data "+df+" - "+d.numMud+" mudanças - R$ "+_fvs(d.val)+NL;
      }
    });
    var ico=_ico[p.cargo]||"📋";
    var lbl=_lbl[p.cargo]||p.cargo;
    var mL=tot.totalMud===1?"mudança":"mudanças";
    var dL=tot.diasT===1?"dia":"dias";
    var tx=
      "Olá *"+p.nome+"*, segue o fechamento da semana! 🤝"+NL+
      "📅 Período: "+_periodo+NL+NL+
      txtDiario+NL+
      ico+" Categoria: "+lbl+NL+
      "✅ Dias trabalhados: "+tot.diasT+" "+dL+NL+
      "📦 Total de mudanças: "+tot.totalMud+" "+mL+NL+
      "💰 *Valor a receber: R$ "+_fvs(tot.totalVal)+"*"+NL+NL+
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
    var _hd={...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"};
    fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+_data+"&select=id",{headers:HEADERS})
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
      <div style={{marginTop:10,paddingTop:10,borderTop:"2px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>CUSTO TOTAL SEMANA</div>
          <div style={{fontWeight:900,fontSize:16,color:"#c2410c"}}>{_fv(_cSem.despTotal)}</div>
        </div>
      </div>
    </div>
  );
}
export default function App(){
  const [usuario,setUsuario]=useState(null);
  const [loginForm,setLoginForm]=useState({email:"",senha:""});
  const [loginErro,setLoginErro]=useState("");
  const [loginLoad,setLoginLoad]=useState(false);
  const [authChecked,setAuthChecked]=useState(true);
  const [listaUsuarios,setListaUsuarios]=useState([])
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [activityLogs,setActivityLogs]=useState([]);
  const [toast,setToast]=useState(null);;
  const [novoUser,setNovoUser]=useState({nome:"",email:"",senha:"",perfil:"promorar"});
  const [savingUser,setSavingUser]=useState(false);
  const [editUser,setEditUser]=useState(null);
  const [savingEdit,setSavingEdit]=useState(false);
  const [editMsg,setEditMsg]=useState("");
  const [userMsg,setUserMsg]=useState("");
  const [tab,setTab]=useState("dashboard");
  const [periodoFin,setPeriodoFin]=useState("semana");
  const [cfgEdit,setCfgEdit]=useState({van1a:1000,vanAdd:0,aj1a:80,ajAdd:20,dataInicioRegra:'',imposto:16});
  const [cfgSaved,setCfgSaved]=useState(false);
  const [bioLock,setBioLock]=useState(localStorage.getItem('tmim_bio_enabled')==='true'&&!!localStorage.getItem('tmim_u'));
  const [mudancas,setMudancas]=useState([]);
  const [agenda,setAgenda]=useState([]);
  const [custosDiarios,setCustosDiarios]=useState([]);
  const [showImport,setShowImport]=useState(false);
  const [cfgWA,setCfgWA]=useState({admin_whatsapp:"",supervisor_whatsapp:"",whatsapp_ativo:"false"});
  const [waLoading,setWaLoading]=useState(false);
  const [showViewPDF,setShowViewPDF]=useState(false);
  const [mudViewPDF,setMudViewPDF]=useState(null);
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
  const [semanaIdx,setSemanaIdx]=useState(0);
  const [loading,setLoading]=useState(true);
  const [flash,setFlash]=useState("");
  const [expand,setExpand]=useState(null);
  const [search,setSearch]=useState("");
  const [filtroMes,setFiltroMes]=useState("");
  const [filtroDataIni,setFiltroDataIni]=useState("");
  const [filtroDataFim,setFiltroDataFim]=useState("");
  const [editMud,setEditMud]=useState(null);
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
  const [contaEditId,setContaEditId]=useState(null);
  const [backupCfg,setBackupCfg]=useState({ativo:false,clientId:"",clientSecret:"",refreshToken:""});
  const [backupHist,setBackupHist]=useState([]);
  const [backupLoading,setBackupLoading]=useState(false);
  const [contaEditVal,setContaEditVal]=useState("");

  // ── LOAD DATA ──────────────────────────────────────────────────────────────
  // ── FUNÇÃO loadContasSemana ─────────────────────────────────────────
  async function loadContasSemana(){
    try{
      var hj=new Date();var dw=hj.getDay();var dif=dw===0?6:dw-1;
      // Usar year/month/date local para evitar bug UTC no fuso BRT (-3h)
      var s0=new Date(hj.getFullYear(),hj.getMonth(),hj.getDate()-dif);
      var s1=new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()+6);
      var _pad=function(n){return String(n).padStart(2,"0");};
      var si=s0.getFullYear()+"-"+_pad(s0.getMonth()+1)+"-"+_pad(s0.getDate());
      var sf=s1.getFullYear()+"-"+_pad(s1.getMonth()+1)+"-"+_pad(s1.getDate());
      var res=await fetch(SUPA_URL+"/rest/v1/contas_semana",{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=representation"},body:JSON.stringify({semana_inicio:si,semana_fim:sf,tipo:"outro",tipo_conta:"pagar",status:"pendente"})});
      if(!res.ok)return;
      var novo=await res.json();
      if(novo&&novo[0])setContasSemana(function(prev){return novo;});
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

  // ── useEffect REACTIVO: recarregar contasSemana quando contas mudam ──
  useEffect(function(){loadContasSemana();},[contasPagar,contasHist]);
  useEffect(function(){if(prestadores.length===0)loadPrestadores();},[tab]);
  useEffect(()=>{
    async function load(){
      try{
        // Carregar mudancas e agenda em paralelo
        try{
          var p=await Promise.all([dbGet("mudancas"),dbGet("agenda"),loadCfgWA()]);
          var mRows=p[0]||[];var aRows=p[1]||[];
          if(mRows.length===0){await dbUpsert("mudancas",DADOS_INICIAIS);mRows=DADOS_INICIAIS;}
          if(aRows.length===0){await dbUpsert("agenda",AGENDA_INICIAIS);aRows=AGENDA_INICIAIS;}
          var cRows=await dbGetCustos();
          setMudancas(mRows);setAgenda(aRows);setCustosDiarios(cRows||[]);
          window.__mudancas=mRows;
          setSyncStatus("✅ Sincronizado");
        }catch(e1){
          setMudancas(DADOS_INICIAIS);setAgenda(AGENDA_INICIAIS);
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
  async function loadMud(){const r=await dbGet("mudancas");if(r)setMudancas(r);}
  async function loadAg(){const r=await dbGet("agenda");if(r)setAgenda(r);}
  async function loadCfgWA(){
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=in.(admin_whatsapp,supervisor_whatsapp,whatsapp_ativo)&select=chave,valor",{headers:HEADERS});
      if(!r.ok) return;
      var rows=await r.json();
      if(!Array.isArray(rows)) return;
      var obj={};
      rows.forEach(function(row){obj[row.chave]=row.valor||"";});
      setCfgWA(function(prev){return {...prev,...obj};});
    }catch(e){console.warn("loadCfgWA:",e);}
  }

  async function loadMud(){const rows=await dbGet("mudancas");if(rows)setMudancas(rows);}
  async function loadAg(){const rows=await dbGet("agenda");if(rows)setAgenda(rows);}

  // ── SYNC HELPERS ───────────────────────────────────────────────────────────
  function parseImport(txt){
    const nomeM=txt.match(/\*([^*\n]+?)\s*-\s*N[uú]mero/i)||txt.match(/Sr[a]?\.?\s*\*?([^\n*]+?)\*?\s*[-–]/);
    const nome=nomeM?nomeM[1].trim():"";
    const seloM=txt.match(/\b([A-Z]{2,3}-\d{3}-\d{3}-?[A-Z]?)\b/i)||txt.match(/Selo[:\s]*\*?([A-Z]{2,3}-[\d\w-]+)\*?/i);
    const selo=seloM?seloM[1].trim():"";
    const comM=txt.match(/\(([^)]+)\)/);
    const comunidade=comM?comM[1].trim():"";
    const contatoM=txt.match(/Contato\s*:\s*([^\n*]+)/i);
    const contato=contatoM?contatoM[1].trim():"";
    let data="";
    const dM=txt.match(/(segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|domingo)\s*:?\s*(\d{1,2})\/(\d{1,2})/i);
    if(dM){const d=dM[2].padStart(2,"0"),m=dM[3].padStart(2,"0"),y=new Date().getFullYear();data=y+"-"+m+"-"+d;}
    const horM=txt.match(/[Hh]or[aá]rio\s*:\s*([^\n*]+)/i);
    const horario=horM?horM[1].replace(/[*h]/gi,"").trim():"";
    const origM=txt.match(/[Ee]ndere[cç]o\s+de\s+[Ss]a[íi]da\s*:\s*\*?\s*([^\n]+)/)||txt.match(/[Ss]a[íi]da\s*:\s*\*?\s*([^\n]+)/);
    const origem=origM?origM[1].replace(/\*+/g,"").trim():"";
    const destM=txt.match(/[Ee]ndere[cç]o\s+[Ff]inal\s*:\s*\*?\s*([^\n]+)/)||txt.match(/[Dd]estino\s*:\s*([^\n]+)/);
    const destino=destM?destM[1].replace(/\*+/g,"").replace(/^[Rr]ua\s+para\s+onde\s+vai\s*:\s*/,"").trim():"";
    return {nome,selo,comunidade,contato,data,horario,origem,destino};
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
    setMudancas(list);
    setSyncStatus("🔄 Salvando...");
    try{
      var ts=changed?[changed]:list;
      for(var i=0;i<ts.length;i++){var m=ts[i];var row={id:m.id,nome:m.nome,selo:m.selo||"",comunidade:m.comunidade||"",data:m.data,origem:m.origem||"",destino:m.destino||"",medicao:m.medicao||0,van:m.van||false,contato:m.contato||"",observacao:m.observacao||"",confirmed_promorar:m.confirmed_promorar||false,confirmed_telemim:m.confirmed_telemim||false,adm_approved:m.adm_approved||false,promorar_approved:m.promorar_approved||false,social_approved:m.social_approved||false,status:m.status||"Registrado",signature_data:(m.signature_data!=null&&m.signature_data!="")?m.signature_data:null};await fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:{...HEADERS,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(row)});}
      setSyncStatus("✅ Sinc");window.__mudancas=list;
    }catch(e){setSyncStatus("⚠️ Erro");loadMud();}
  }
  async function handleLogin(){if(!loginForm.email||!loginForm.senha){setLoginErro("Preencha email e senha");return;}setLoginLoad(true);setLoginErro("");try{const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:loginForm.email,password:loginForm.senha})});const d=await res.json();if(!res.ok||!d.access_token){setLoginErro("Email ou senha incorretos");setLoginLoad(false);return;}const pr=await fetch(SUPA_URL+"/rest/v1/usuarios?id=eq."+d.user.id+"&select=*",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+d.access_token}});const pd=await pr.json();if(!pd||!pd[0]||pd[0].ativo===false){setLoginErro("Sem acesso. Contate o administrador.");setLoginLoad(false);return;}const u={id:d.user.id,email:d.user.email,nome:pd[0].nome,perfil:pd[0].perfil,token:d.access_token};setUsuario(u);setTab("dashboard");localStorage.setItem('tmim_u',JSON.stringify(u));}catch(e){setLoginErro("Erro.");}setLoginLoad(false);}
  function handleLogout(){setUsuario(null);localStorage.removeItem('tmim_u');setLoginForm({email:"",senha:""});}
  const perfil=usuario?.perfil||"";const isAdmin=perfil==="admin";const isPromorar=perfil==="promorar";const isSocial=perfil==="social";const temFin=isAdmin;const podeEditar=isAdmin||isPromorar;const verMed=isAdmin||isPromorar;
  async function carregarUsuarios(){if(!isAdmin||!usuario?.token)return;const _tk3=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);const r=await fetch(SUPA_URL+"/functions/v1/listar-usuarios",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk3||"")}});const d=await r.json();if(d.ok&&Array.isArray(d.usuarios))setListaUsuarios(d.usuarios);}
  async function editarUsuario(){if(!editUser?.id)return;setSavingEdit(true);setEditMsg("");try{const bd={id:editUser.id,nome:editUser.nome,email:editUser.email,perfil:editUser.perfil};if(editUser.senha)bd.senha=editUser.senha;const _tk=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);const res=await fetch(SUPA_URL+"/functions/v1/editar-usuario",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk||""),"Content-Type":"application/json"},body:JSON.stringify(bd)});const d=await res.json();if(!res.ok){setEditMsg("⚠️ "+(d.error||"Erro"));setSavingEdit(false);return;}setEditMsg("✅ Salvo!");await carregarUsuarios();setTimeout(()=>{setEditUser(null);setEditMsg("");},1500);}catch(e){setEditMsg("⚠️ Erro de conexão.");}setSavingEdit(false);}
  const [prestadores,setPrestadores]=useState([]);
  async function loadPrestadores(){
    try{
      var res=await fetch(SUPA_URL+"/rest/v1/prestadores?select=*&ativo=eq.true&order=cargo,nome",{headers:HEADERS});
      var data=await res.json();
      if(Array.isArray(data)&&data.length>0) setPrestadores(data);
    }catch(e){}
  }

    async function criarUsuario(){
    if(!novoUser.nome||!novoUser.email||!novoUser.senha){setUserMsg("⚠️ Preencha todos os campos");return;}
    setSavingUser(true);setUserMsg("");
    try{
      const res=await fetch(SUPA_URL+"/functions/v1/criar-usuario",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(usuario?.token||''),"Content-Type":"application/json"},body:JSON.stringify({nome:novoUser.nome,email:novoUser.email,senha:novoUser.senha,perfil:novoUser.perfil})});
      const d=await res.json();
      if(!res.ok){setUserMsg("⚠️ "+(d.error||"Erro ao criar"));setSavingUser(false);return;}
      setUserMsg("✅ Usuário criado!");setNovoUser({nome:"",email:"",senha:"",perfil:"promorar"});carregarUsuarios();
    }catch(e){setUserMsg("⚠️ Erro de conexão.");}
    setSavingUser(false);
  }
  function abrirWha(ag){const tel=(ag.contato||"").replace(/\D/g,"");if(!tel)return;window.open("https://wa.me/55"+tel+"?text="+encodeURIComponent("Olá "+ag.nome+"! Mudança dia "+(ag.data||"")+" às "+(ag.horario||"?")+"\nDe: "+(ag.origem||"?")+"\nPara: "+(ag.destino||"?")+"\n🚛 PROMORAR"),"_blank");}
  async function registrarPush(){try{if(!('serviceWorker' in navigator)||!('PushManager' in window)){alert('Push nao suportado');return;}const perm=await Notification.requestPermission();if(perm!=='granted'){alert('Permissao negada');return;}const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZEuEguqec8LTygq7UQTqp8-XWo4'});const jj=sub.toJSON();await fetch(SUPA_URL+'/rest/v1/push_subscriptions',{method:'POST',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(usuario?.token||''),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({usuario_id:usuario?.id,endpoint:jj.endpoint,p256dh:jj.keys?.p256dh||'',auth:jj.keys?.auth||''})});alert('\u2705 Ativado!');}catch(pushErr){alert('Erro: '+pushErr.message);}}
  async function enviarPush(titulo,corpo){try{await fetch(SUPA_URL+'/functions/v1/enviar-push',{method:'POST',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(usuario?.token||''),'Content-Type':'application/json'},body:JSON.stringify({titulo,corpo})});}catch{}}
  async function ativarBiometria(){try{if(!window.PublicKeyCredential){alert('Biometria nao suportada');return;}const uid=new TextEncoder().encode(usuario?.id||'tmim');const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'TELEMIM',id:location.hostname},user:{id:uid,name:usuario?.email||'u',displayName:usuario?.nome||'U'},pubKeyCredParams:[{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000}});localStorage.setItem('tmim_bio_id',cred.id);localStorage.setItem('tmim_bio_enabled','true');alert('\u2705 Biometria ativada!');}catch(e){if(e.name==='NotAllowedError')alert('Cancelado.');else alert('Erro: '+e.message);}}
  async function verificarBiometria(){try{const id=localStorage.getItem('tmim_bio_id');if(!id)return false;const b=Uint8Array.from(atob(id.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,allowCredentials:[{id:b,type:'public-key'}],userVerification:'required',timeout:60000}});return true;}catch{return false;}}
  function desativarBiometria(){localStorage.removeItem('tmim_bio_id');localStorage.removeItem('tmim_bio_enabled');alert('Biometria desativada.');}
  async function toggleAtivoUser(u){await fetch(SUPA_URL+"/rest/v1/usuarios?id=eq."+u.id,{method:"PATCH",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+usuario.token,"Content-Type":"application/json"},body:JSON.stringify({ativo:!u.ativo})});carregarUsuarios();}
    async function marcarTempo(tipo,item,tabela){
    if(!podeEditar)return;
    const campo=tipo==='inicio'?'inicio_em':'termino_em';
    const agora=new Date().toISOString();
    await fetch(SUPA_URL+"/rest/v1/"+tabela+"?id=eq."+item.id,{method:"PATCH",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(usuario?.token||SUPA_KEY),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({[campo]:agora})});
    if(tabela==="agenda"){
      setAgenda(prev=>prev.map(a=>a.id===item.id?{...a,[campo]:agora}:a));
    }else{
      setMudancas(prev=>prev.map(m=>m.id===item.id?{...m,[campo]:agora}:m));
    }
  }
  function fmtTempo(iso){if(!iso)return null;const d=new Date(iso);return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
    function addLog(msg){var ts=new Date();var hora=String(ts.getHours()).padStart(2,"0")+":"+String(ts.getMinutes()).padStart(2,"0");setActivityLogs(function(prev){return [{id:ts.getTime(),hora:hora,msg:msg},...prev].slice(0,10);});setToast({id:ts.getTime(),msg:msg});setTimeout(function(){setToast(null);},4000);}
  async function handleValidar3vias(id,tipo){
    var campo=tipo==="social"?"social_approved":tipo==="promorar"?"promorar_approved":"adm_approved";
    var campoPor=tipo+"_approved_by";
    var nome=usuario&&(usuario.nome||usuario.email)||"";
    var anterior=mudancas.find(function(m){return m.id===id;});
    setMudancas(prev=>prev.map(m=>m.id===id?{...m,[campo]:true,[campoPor]:nome}:m));
    window.__mudancas=(window.__mudancas||[]).map(m=>m.id===id?{...m,[campo]:true,[campoPor]:nome}:m);
    try{
      await fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+id,{method:"PATCH",headers:{...HEADERS,"Prefer":"return=representation"},body:JSON.stringify({[campo]:true,[campoPor]:nome})});
    }catch(e){
      if(anterior)setMudancas(prev=>prev.map(m=>m.id===id?{...anterior}:m));
      setSyncStatus("⚠️ Erro ao validar");
    }
  }
  async function saveAg(list,changed){
    setAgenda(list);
    setSyncStatus("🔄 Salvando...");
    try{
      var ts=changed?[changed]:list;
      for(var i=0;i<ts.length;i++){var a=ts[i];var row={id:a.id,nome:a.nome,selo:a.selo||"",comunidade:a.comunidade||"",data:a.data,horario:a.horario||"",origem:a.origem||"",destino:a.destino||"",contato:a.contato||"",van:a.van||false,caminhao:a.caminhao||false,medicao:a.medicao||0,ajudantes:a.ajudantes||0,status:a.status||"confirmado",observacao:a.observacao||"",social_approved:a.social_approved||false,promorar_approved:a.promorar_approved||false,adm_approved:a.adm_approved||false};await fetch(SUPA_URL+"/rest/v1/agenda",{method:"POST",headers:{...HEADERS,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(row)});}
      setSyncStatus("✅ Sinc");
    }catch(e){setSyncStatus("⚠️ Erro");loadAg();}
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
    var _p=usuario&&usuario.perfil||"";var _isSocial=_p==="social";var _isPromorar=_p==="promorar";var _isAdm=_p==="admin"||_p==="telemim";var _nomeUser=usuario&&(usuario.nome||usuario.email)||"";const nova={...form,id:Date.now(),medicao:parseFloat(form.medicao)||0,requires_validation:true,social_approved:_isSocial,social_approved_by:_isSocial?_nomeUser:null,promorar_approved:_isPromorar,promorar_approved_by:_isPromorar?_nomeUser:null,adm_approved:_isAdm,adm_approved_by:_isAdm?_nomeUser:null};
    setMudancas(prev=>[nova,...prev]);
    await saveMud([nova,...mudancas],nova);
    setForm(initForm); setFlash("✅ Salvo!"); setTimeout(()=>setFlash(""),1800); setTab("lista");
  }
  async function handleDelMud(id){
    setMudancas(prev=>prev.filter(m=>m.id!==id));
    setSyncStatus("🔄 Salvando...");
    try { await dbDelete("mudancas",id); setSyncStatus("✅ Sincronizado"); }
    catch(e){ setSyncStatus("⚠️ Erro ao salvar"); }
  }
  async function handleSaveEditMud(){
    if(!editMud) return;
    const updated=mudancas.map(m=>m.id===editMud.id?{...editMud,medicao:parseFloat(editMud.medicao)||0}:m);
    setMudancas(()=>updated);
    await saveMud(updated,editMud);
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
      var _hd={...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"};
      fetch(SUPA_URL+"/rest/v1/custos_diarios?data=eq."+_data+"&select=id",{headers:HEADERS})
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
    var campo=tipo==="social"?"social_approved":tipo==="promorar"?"promorar_approved":"adm_approved";
    var campoPor=tipo+"_approved_by";
    var nome=usuario&&(usuario.nome||usuario.email)||"";
    var anterior=agenda.find(function(a){return a.id===id;});
    setAgenda(prev=>prev.map(a=>a.id===id?{...a,[campo]:true,[campoPor]:nome}:a));
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+id,{method:"PATCH",headers:{...HEADERS,"Prefer":"return=representation"},body:JSON.stringify({[campo]:true,[campoPor]:nome})});
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
    setAgenda(prev=>[nova,...prev]);
    await saveAg([nova,...agenda],nova);
    setAgForm({...initForm,status:"confirmado"}); setAgenda(prev=>[nova,...prev]); setFlash("✅ Agendado!"); setTimeout(()=>setFlash(""),1800); setTab("agenda");
  }
  async function handleDelAg(id){
    setAgenda(prev=>prev.filter(a=>a.id!==id));
    setSyncStatus("🔄 Salvando...");
    try { await dbDelete("agenda",id); setSyncStatus("✅ Sincronizado"); }
    catch(e){ setSyncStatus("⚠️ Erro ao salvar"); }
  }
  async function handleSaveEditAg(){
    if(!editAg) return;
    const updated=agenda.map(a=>a.id===editAg.id?{...editAg}:a);
    await saveAg(updated); setEditAg(null);
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
  async function converterEmMudanca(ag){
    if(!ag.medicao){alert('Informe a medição (m³) antes de finalizar.');return;}
    if(!window.confirm('Confirmar como realizada?\nSerá movida para Mudanças Registradas.'))return;
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
  function _gerarPDFComAssinatura(m,assinaturaB64,obs){
    var LOGO='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABrAJYDASIAAhEBAxEB/8QAHAABAAMAAwEBAAAAAAAAAAAAAAYHCAMEBQIB/8QAShAAAQMEAAMFAggGEAcAAAAAAQIDBAAFBhEHEiETMUFRYQgiFBUyN3F1gbIWF0JSs9EYIyQ1NjhzdJGSk5ShscHSJ1NVVnKF8P/EABsBAAIDAQEBAAAAAAAAAAAAAAAFAwQGAgEH/8QANxEAAQMCBAQCBwcFAQAAAAAAAQIDEQAEBRIhMQZBUWETcRUigZGhsfAHIzJCwdHhFBYkQ1NU/9oADAMBAAIRAxEAPwDZdKUoopSlKKKUpSiilKUoopSvLyyLeJtglRrBcW7dcVpAZkON86UHY309RsVWM2w8V4QSZvFC0Rgv5PbNJRv6Np61WfuFNHRBPcR+pFMrKwbukkqeSg9Dmnz0SauKlZ8zCdxGxyxPXVXE+zzg0UjsI/Zlxezr3Ry9e/f0VAvxscQv+5X/AOxa/wBtLH8eZYVlcQoH2fvWjseB7u/bLlu6hQmPzD5pFbApWLrnxi4lW+QxLayd1xIV1ZdjtFCteB0kHR+mtdYZePwhxK03zsuyM+G1IKPzSpIJH9NXrHEGr1JU3OnWluO8MXmCpQt8ghUjQnceYFevSlKvVnKUpSiilKUoopSlKKUpSiilKUoopSlKKK4LhKbhQJEx1Lim2GlOqDaeZRCRsgAd56d1UPm+fcMMyXFcvlgyJ5cYKDSkNchAVrYOl+gq1eJWXt4jZkPpaS/MkKKI7SjpOwNlSvQf6iqca4oZimYJCpURxvm2WVRUhBHl06/40OYY/eN+oQE9xM/GoWuLsNwO4h9C1OcihWXLPXQ7/KoplrvDF2xPIxmxZBHuhKexckE9mkb97Y2d9N1Bewf/wCQ7/Zn9VbIsGURL3g7+QMNIYWyy4Xmzo9m4hOyPUdxHoarXgnfr5cM2WxOuMiUzJjrddQ6rmAUNaIH5PfrpSF7hQv5llYTl5BMfrW4t/taZsCywhhTgdMgqcmNuqdu3nWa75GlSnY8KNEkPyFL91ttpSlKJ6AAAd5rdHDa2SbLgFgtU1PLJiW9lp5P5qwgbH2HpXvBCAdhIB+ivqrmHYamxSQFSTUfEvFa8cQhst5Akk7zPwFKUpTKsjSlKUUUpSlFFKUpRRSlKUUUpSlFFKUpRRVVe0PaZcm22+7MNqcYhqWh/Q3yJXrSvo2NE+oqlCoBPUgDzrVN2yPHbetyNcrvb2FgftjTryebR8099VfkmWcO7W+p/HsdgXG477b078H5GUHz6jr9g+0U3s31hARkJrA8Q4ZbOXBuPHSmcw9Dppo1r7K8VEt7GuE71veKmp1/eK22j0UiPoArI8OYDQidem9n7O9nX2lxvziCEaEVk+fXmWfuj+mq9gfGGb5zHhTLgkz7gokoV+ShIJVyp8AB3CtL2K1xLNaY9sgu8keOjlSPE+ZPqT1Nc3aw2go/MrU17gFqby5Tcf62hCZ5n6M+4V3aUpSqu7SlKUUUpSlFFKUpRRSlKUUUpVW/j3wX866f3M/rp+PfBfzrp/cz+uqPpO0/6D309/tjF/8AzL9xq0qVVp474Jr5V0/uZ/XVk2qaxcrbFuMbm7CUyh5vmGjyqAI2PA6NTM3bL5IbUDHSqV7hN7YpCrlooBmkRXZpSoVnHE7F8Pufxbdopbn2gj12jyb2f3oGm9nprWvr3jd+6Qv56/qh3sNWOD0mq/8AEX+qT96dV5wg/i7u/VsP/NqoV7Jf765F/IMfeXXXT7PYrrZXcZlMNSIKGm23IoddJWoHlJKjvZGuvhWR8auJ8S7QYEi9wYhbhynG27e+63zMrAIC9pJHXm1r7D1p5hfFqLxVm4pjOqWYqLKllYlLS1qSNVrK2g5RaXW39oBNXrHBBFRTPEbFhStbMXL24rNmuPJlvWfH7TL7eHl1tvI95G9bVKxqMr1c4dj3LsZMp6S5NaWkJLaFJJcGh40AQfDp+eo5/ZQS9FgJfukm7hNxflIbLqJZ5FJaQ8lAHOA2g8oJ66PI1sjh3m2DXbJJWOR7fHavbMUrDrSQ2+lXQ8pT3Ae940K6OT2zEbFEuKrVJucgfG7U/PjQWFoYbSU8ynnFgc6ySAOvX5J6VXWL2q32e3XJFuV2bLsKNMSVdAsJWBvR/WlAkJJG9Sln/AAjkW2nCrffbvNubDjCfcbjvuOKeaH5QSooSgHY2sA9DV3YFm9vzeF8Y3pDr9sDSJEZyQ0poOhJIBIPUdD3Gvjx3FX7GtMqWtKkH3VoUCFJ2k7B9Nf4VV6HdZelVPYJcWACMPqe/euliHCqzXd1+fbVxYsl0udovI0lgNqVygaKtoV1G/XuPSq0yq2YJYcrk25zJrv8R7XtHLXBbZBHhzJKlJBOiCobI8DXc9n+3xIPEvJJEaMww24GFdm0kJBJjA7AB7yT+qrb48UNz4Sxly3ue1OGVxpg2FBgEA+KfFB3oBWwPOvlzfV8KnmOIW3W5TZpWqJA2+vVVLNuAkdLT4HkORr2uJE2JasihttyGX4z9vKHGH0BaFcqOX5PjpSh6p6H04UPsz0KZSD8W3mPQcyN+f21Ys4i47k95jy5eOWti+TQ0BIt81K2W9j8oIWdlH/e6deN3cMzTM7MjLr1DTZN1mzpTFqh2uEIzMhsHmoHkjSOhHOhSTrlSNjqatq0X1l/AoN7kKLDsaDJKiN62EnzB7q5d2kpLzQhDYB5ZB1gzBMqR4ZVkMcWwvfGKrXJW4trEFZKFJCZPLqTOhP+43FULwp/jPiT+Xe+6urfhz/ABnxJ/Lvfey/k61H+zhYo9k4GW+8qcBm3p+RMDjY0UqPUhP/AJdj9tXJgtou93xiIi62VVvetkh2Ws81yTHSlKPFPKoaQB02NdNjXIbcU2NMpbaIBUi4b6GFt0K3MHVbGa0zHFtiM8zDKLvLujbyZt3kCNJWcX7jn/eiK6Y+lQilKUoopSlKKKVC5b9xTmsq8QYrs5iIlNtfjslPMdpDvONkDopSQevQEmppXw2y02pxTbSEFxXMspSBzHWtnzOgK7QrLOlVrlgvZQDEGar5qROtYyq4l9pu4OyojCnehQ2tSUDx6cqe0118vWvTlZU2xkclxb6jAZtxcjNI6qmOc5Cigd51y6GunUnu0alBgQv3STEYPwogv7QCHSAAObz6AD7K5uyb2j9rR7o0n3R0HkKkLqTuPqBVNFi83ohyBv15qPUddepHSq6euqJdwx2RMu5cjOOiTMWVoEZDiWi4htHTewdePgN7JrlvmSy5dru8y3y5ceXEW4iPFQlIUhCEgqedSoE6O9gHX5IHUmp2mHDSy00IjAbaXzNoDY0hXmB4H1r7Qwwh11xDLaVu67RQSAV6Ghs+Ne+MiR6tR+j34KfEifOdo68jr5maiU7IZzl1tECyLTIZkpdbMlaeZDqkoHvA+KU72SOhPuj04PwjkW2HPt79x7aa3dBEQ88lO2WllGnXAAAEjnOidAnQqbdk3zoX2aOZAIQeUbSD3geXcK6d6ZYNruCiw0orYVz8yAefSTre+/7a8S4jQZfqalctXwFLDmvtgCNgJ66zUfud1RbJTNuRe3XBMkhLsp5SCmIkNlRTzaA5lcp0DvW967gerY8geZnXhh+XIeWgt/AGJRSFhoo5u1WQByp6kkq7gNd/SpBjMSIcXtjRisFAZbWElsaCtA82vP1r05kSNMjux5LCHWnUcjiVD5Q8jQVpHqkVym2fXDiVxzA15jbfqZmPZoBUbwy4XafZW2ucOSIyltSpMkbC3QrekJTo8uiCCddCB164VJIcWPDZ7GM0G0bJ0OpJPeST1JPmaVwpYJJAq4xbqQ2lK1EkDrX/9k='
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
      try{doc.addImage(LOGO,'JPEG',M,8,37,26);}catch(e){}
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
    // WhatsApp: chamar Edge Function FORA de _runPDF (cfgWA acessível aqui)
    if(cfgWA&&cfgWA.whatsapp_ativo==="true"){
      try{
        // Gerar PDF em base64 separado (não bloqueia o save)
        var _docWA=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
        _docWA.text("Canhoto OS "+m.id,10,10);
        // Usar o mesmo PDF já gerado via doc.output()
        var _pdfB64=doc.output("datauristring").split(",")[1];
        var _wp={
          osId:m.id,
          clienteNome:m.nome||"",
          clienteTelefone:(m.contato||"").replace(/\D/g,""),
          adminWhatsapp:(cfgWA.admin_whatsapp||"").replace(/\D/g,""),
          supervisorWhatsapp:(cfgWA.supervisor_whatsapp||"").replace(/\D/g,""),
          pdfBase64:_pdfB64,
          data:m.data||""
        };
        fetch(SUPA_URL+"/functions/v1/enviar-whatsapp",{
          method:"POST",
          headers:{...HEADERS,"Content-Type":"application/json"},
          body:JSON.stringify(_wp)
        }).then(function(r){return r.json();})
          .then(function(res){
            if(res&&res.enviados>0) console.log("[WA] "+res.enviados+" mensagens enviadas");
            else console.warn("[WA] sem envios:",JSON.stringify(res));
          })
          .catch(function(e){console.warn("[WA] Edge Function indisponível (non-blocking):",e);});
      }catch(e){console.warn("[WA] erro ao disparar:",e);}
    }
  }

  // ── PDF MUDANÇA INDIVIDUAL ─────────────────────────────────────────────────
  function gerarPDFAgendamento(a,btn){gerarPDFCardIndividual(a,btn);}

  function compartilharWhatsApp(a,tipo="agendamento"){
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
  const semanas=(()=>{
    const map={};
    mudancas.forEach(m=>{
      const w=getWeek(m.data)+"-"+m.data.slice(0,4);
      if(!map[w]) map[w]={key:w,label:weekRange(m.data),items:[]};
      map[w].items.push(m);
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key));
  })();

  const totalM3=mudancas.reduce((s,m)=>s+(parseFloat(m.medicao)||0),0);
  const comunidades=[...new Set(mudancas.map(m=>m.comunidade).filter(Boolean))];
  const filtered=[...mudancas].filter(function(mx){
    var tx=search.toLowerCase();
    var okS=!search||mx.nome.toLowerCase().includes(tx)||mx.selo.toLowerCase().includes(tx)||(mx.comunidade||"").toLowerCase().includes(tx);
    var dtOk=(function(){if(filtroMes==="semana"){var hj2=new Date();var dw=hj2.getDay();var _dif=dw===0?6:dw-1;var s0=new Date(hj2.getFullYear(),hj2.getMonth(),hj2.getDate()-_dif);var _pad=function(n){return String(n).padStart(2,"0");};var dias7=Array.from({length:7},function(_,ii){var d=new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()+ii);return d.getFullYear()+"-"+_pad(d.getMonth()+1)+"-"+_pad(d.getDate());});return dias7.includes(mx.data);}if(filtroMes==="mes_atual"){return mx.data&&mx.data.slice(0,7)===new Date().toISOString().slice(0,7);}if(filtroDataIni&&filtroDataFim){return mx.data>=filtroDataIni&&mx.data<=filtroDataFim;}if(filtroDataIni){return mx.data>=filtroDataIni;}if(filtroDataFim){return mx.data<=filtroDataFim;}return true;})();return okS&&dtOk;
  }).sort((a,b)=>b.data.localeCompare(a.data));

  var _d0=new Date();_d0.setDate(1);
  var _d1=new Date();_d1.setDate(1);_d1.setMonth(_d1.getMonth()-1);
  var _d2=new Date();_d2.setDate(1);_d2.setMonth(_d2.getMonth()-2);
  var _nms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var _m0={v:_d0.toISOString().slice(0,7),l:_nms[_d0.getMonth()]+'/'+String(_d0.getFullYear()).slice(2)};
  var _m1={v:_d1.toISOString().slice(0,7),l:_nms[_d1.getMonth()]+'/'+String(_d1.getFullYear()).slice(2)};
  var _m2={v:_d2.toISOString().slice(0,7),l:_nms[_d2.getMonth()]+'/'+String(_d2.getFullYear()).slice(2)};
  const agendaOrdenada=[...agenda].filter(a=>a.status!=='concluida').sort((a,b)=>a.data.localeCompare(b.data)||(a.horario||"").localeCompare(b.horario||""));
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
  const mudancasHoje=agendaOrdenada.filter(a=>a.data===hoje&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a));
  const mudancasAmanha=agendaOrdenada.filter(a=>a.data===amanha&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a));
  const _mesAtual=new Date().getMonth();
  const _anoAtual=new Date().getFullYear();
  const _mesesNome=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const _realizadasMes=mudancas.filter(m=>{const d=new Date(m.data+"T12:00:00");return d.getMonth()===_mesAtual&&d.getFullYear()===_anoAtual;}).length;
  const _pendentesMes=agenda.filter(a=>{const d=new Date(a.data+"T12:00:00");return d.getMonth()===_mesAtual&&d.getFullYear()===_anoAtual&&(a.status==="pendente"||a.status==="confirmado");}).length;
  const _mudHoje=agendaOrdenada.filter(a=>a.data===hoje&&a.status!=="realizado");

  const statusColor={confirmado:COLORS.green,pendente:COLORS.accent,realizado:COLORS.muted};
  const statusLabel={confirmado:"✅ Confirmado",pendente:"⏳ Pendente",realizado:"✔ Realizado"};

  const TABS=[
    {id:"dashboard",label:"📈 Dashboard"},
    {id:"lista",label:"📋 Registros"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"importar_mud",label:"+ Mudânças"},
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
                <Badge color={COLORS.green}>{mudancas.length} mudanças</Badge>
                <Badge color={COLORS.blue}>{totalM3} m³</Badge>
                <Badge color={COLORS.purple}>{agenda.length} agendadas</Badge>
              </div>
              <span style={{fontSize:10,color:syncStatus.includes("✅")?"#4ade80":syncStatus.includes("🔄")?"#fbbf24":"#f87171",fontWeight:700}}>{syncStatus}</span><div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}><span style={{background:isAdmin?"#dbeafe":isPromorar?"#dcfce7":"#fef9c3",border:"1px solid "+(isAdmin?"#93c5fd":isPromorar?"#86efac":"#fde047"),borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:800,color:isAdmin?"#1d4ed8":isPromorar?"#15803d":"#a16207"}}>{isAdmin?"👑 Admin":isPromorar?"🏢 Promorar":"🤝 Social"}</span><span style={{fontSize:11,color:"#64748b",maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{usuario?.nome?.split(" ")[0]}</span><button onClick={registrarPush} title="Notificacoes" style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>🔔</button><button onClick={function(){localStorage.getItem('tmim_bio_enabled')==='true'?desativarBiometria():ativarBiometria();}} title="Biometria" style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>🔐</button><button onClick={handleLogout} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 8px",fontSize:10,fontWeight:700,color:"#64748b",cursor:"pointer"}}>Sair</button></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"0 12px"}}>

        {/* Alertas */}
       
        {/* Tabs */}
        <div style={{marginTop:8,marginBottom:0}}>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {TABS.slice(0,3).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            {TABS.slice(3).map(t=>(
              <button key={t.id} onClick={()=>t.id==="importar_mud"?(setTab("novaAgenda"),setShowImportAg(true)):setTab(t.id)} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard"&&(
        <div style={{paddingBottom:16}}>
        {(()=>{var _p=usuario&&usuario.perfil||"";var _pend=[...agenda,...mudancas].filter(function(x){if(!x.requires_validation)return false;if(_p==="social")return !x.social_approved;if(_p==="promorar")return !x.promorar_approved;if(_p==="admin"||_p==="telemim")return !x.adm_approved;return false;});if(!_pend.length)return null;return(<div style={{margin:"0 12px 16px",background:"#fffbeb",border:"2.5px solid #f59e0b",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(245,158,11,0.25)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>🚨</span><div><div style={{fontWeight:800,fontSize:13,color:"#92400e",letterSpacing:0.5}}>⚠️ AÇÃO REQUERIDA — APROVAÇÕES PENDENTES</div><div style={{fontWeight:600,fontSize:11,color:"#b45309"}}>{_pend.length} mudança{_pend.length>1?"s":""} aguarda{_pend.length===1?"":"m"} a SUA aprovação!</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pend.slice(0,3).map(function(x){var _quem=x.social_approved_by||x.promorar_approved_by||x.adm_approved_by||"Sistema";var _isFut=x.data&&new Date(x.data+"T12:00:00")>=new Date();return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #fcd34d",borderRadius:12,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>👤 {x.nome}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} • Solicitado por: <strong>{_quem}</strong></div></div><button onClick={function(e){e.stopPropagation();setTab(_isFut?"agenda":"lista");var _tid=x.id;setTimeout(function(){var el=document.getElementById("move-card-"+_tid);if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.style.outline="3px solid #f59e0b";el.style.borderRadius="16px";el.style.transition="outline 0.3s";setTimeout(function(){el.style.outline="";},3000);}},500);}} style={{padding:"7px 12px",background:"#f59e0b",color:"#fff",border:"none",borderRadius:999,fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 2px 8px rgba(245,158,11,0.4)"}}>👆 Ver e Aprovar</button></div>);})}{_pend.length>3&&<div style={{textAlign:"center",fontSize:11,color:"#b45309",fontWeight:700,marginTop:4}}>...e mais {_pend.length-3} pendente{_pend.length-3>1?"s":""}</div>}</div></div>);})()}
        {mudancasHoje.length>0&&(
          <div style={{margin:"12px 0 0",display:"flex",flexDirection:"column",gap:7}}>
            {mudancasHoje.map(a=>(
              <div key={a.id} className={a.inicio_em&&!a.termino_em?"em-andamento":""} style={{background:"#dcfce7",border:`2px solid ${COLORS.green}`,borderRadius:14,padding:"12px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,boxShadow:"0 2px 8px rgba(22,163,74,0.15)"}}>
                <div style={{flex:1}}>
                  <div style={{color:COLORS.green,fontWeight:900,fontSize:12,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>🔔 MUDANÇA HOJE!</div>
                  <div style={{fontWeight:800,fontSize:13,color:COLORS.text}}>{a.nome}</div>
                  <div style={{color:COLORS.muted,fontSize:11}}>{a.horario?`⏰ ${a.horario}h · `:""}{a.origem||"—"}</div>
                </div>
                {podeEditar&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                  {!a.inicio_em
                    ?<button onClick={()=>marcarTempo('inicio',a,'agenda')} style={{flex:1,background:"#dcfce7",border:"1.5px solid #16a34a",borderRadius:10,padding:"7px 0",fontSize:12,fontWeight:800,color:"#15803d",cursor:"pointer"}}>▶ Iniciar</button>
                    :<span style={{flex:1,background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"7px 10px",fontSize:12,fontWeight:700,color:"#15803d",textAlign:"center"}}>▶ {fmtTempo(a.inicio_em)}</span>
                  }
                  <button onClick={()=>gerarPDFMudanca(a)} style={{width:"100%",background:"#16a34a",border:"none",borderRadius:10,padding:"9px 0",fontSize:13,fontWeight:900,color:"#fff",cursor:"pointer",letterSpacing:0.3}}>✅ Finalizar Mudança</button>
                  {a.inicio_em&&a.termino_em&&<span style={{fontSize:11,color:"#64748b",fontWeight:700,background:"#f1f5f9",borderRadius:8,padding:"4px 8px"}}>🕒 {Math.round((new Date(a.termino_em)-new Date(a.inicio_em))/60000)}min</span>}
                </div>}
                <button onClick={()=>compartilharWhatsApp(a,"hoje")} style={{background:COLORS.green,border:"none",color:"#fff",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:15,flexShrink:0,fontWeight:700}}>📲</button>
              </div>
            ))}
          </div>
        )}
        <div style={{padding:"0 12px 14px",background:"#fffbeb",borderLeft:"4px solid #f59e0b",marginTop:8,borderRadius:6}}><div style={{fontSize:10,fontWeight:800,color:"#d97706",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>⚠️ PREPARAÇÃO AMANHÃ — 📅 {_mesesNome[_mesAtual]} {_anoAtual}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div style={{background:"linear-gradient(135deg,#065f46,#047857)",borderRadius:14,padding:"16px 14px",boxShadow:"0 4px 12px rgba(6,95,70,0.3)"}}><div style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontWeight:800,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>REALIZADAS</div><div style={{fontSize:32,fontWeight:900,color:"#fff",lineHeight:1,marginBottom:4}}>{_realizadasMes}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.75)"}}>mudanças ✔️</div></div><div style={{background:"linear-gradient(135deg,#1e3a8a,#1d4ed8)",borderRadius:14,padding:"16px 14px",boxShadow:"0 4px 12px rgba(29,78,216,0.3)"}}><div style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontWeight:800,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>PENDENTES</div><div style={{fontSize:32,fontWeight:900,color:"#fff",lineHeight:1,marginBottom:4}}>{_pendentesMes}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.75)"}}>a realizar 🗓️</div></div></div></div><div style={{padding:"0 12px 2px"}}><div style={{fontSize:10,fontWeight:800,color:COLORS.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🔔 Notificações</div></div>{_mudHoje.map(a=>(<div key={a.id} style={{margin:"0 12px 8px",background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:18}}>🚛</span><div style={{flex:1}}><div style={{fontSize:10,fontWeight:800,color:"#b91c1c",letterSpacing:0.5}}>MUDANÇA HOJE!</div><div style={{fontSize:13,fontWeight:700,color:COLORS.text}}>{a.nome}</div><div style={{fontSize:11,color:COLORS.muted}}>{a.horario?"⏰ "+a.horario+"h":""}{a.comunidade?" · "+a.comunidade:""}</div></div><button onClick={()=>setTab("agenda")} style={{fontSize:10,padding:"5px 10px",borderRadius:8,background:"#ef4444",color:"#fff",border:"none",fontWeight:700,cursor:"pointer"}}>Ver</button></div>))}{mudancasAmanha.length>0&&(
          <div style={{margin:"8px 0 0",display:"flex",flexDirection:"column",gap:7}}>
            {mudancasAmanha.map(a=>(
              <div key={a.id} className={a.inicio_em&&!a.termino_em?"em-andamento":""} style={{background:"#fff7ed",border:`2px solid ${COLORS.accent}`,borderRadius:14,padding:"12px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,boxShadow:"0 2px 8px rgba(230,126,34,0.15)"}}>
                <div style={{flex:1}}>
                  <div style={{color:COLORS.accent,fontWeight:900,fontSize:12,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>⚠️ MUDANÇA AMANHÃ!</div>
                  <div style={{fontWeight:800,fontSize:13,color:COLORS.text}}>{a.nome}</div>
                  <div style={{color:COLORS.muted,fontSize:11}}>{a.horario?`⏰ ${a.horario}h · `:""}{a.origem||"—"}</div>
                </div>
                <button onClick={()=>compartilharWhatsApp(a,"amanha")} style={{background:COLORS.accent,border:"none",color:"#fff",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:15,flexShrink:0,fontWeight:700}}>📲</button>
              </div>
            ))}
          </div>
        )}
{tab==="financeiro"&&<div style={{padding:"8px 12px 12px",background:"#f8fafc"}}><button onClick={function(){window.print();}} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#1e40af,#1e293b)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📄 Exportar PDF</button></div>}
          {(function(){var hj=new Date();var anoMes=(function(){if(periodoFin==='mes_ant'){var dm=new Date();dm.setDate(1);dm.setMonth(dm.getMonth()-1);return dm.toISOString().slice(0,7);}return hj.toISOString().slice(0,7);})();var mudMes=(mudancas||[]).filter(function(m){return m.data&&m.data.slice(0,7)===anoMes;});var diasU=[...new Set(mudMes.map(function(m){return m.data;}))].sort(function(a,b){return b.localeCompare(a);});var totMes=mudMes.length;return(<div style={{padding:'16px 12px',background:'#f8fafc'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div style={{fontWeight:800,fontSize:15,color:'#1e293b'}}>📋 Mudanças do Mês</div><span style={{background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'4px 12px',fontSize:13,fontWeight:700}}>{totMes} total</span></div>{diasU.length===0&&<div style={{textAlign:'center',color:'#94a3b8',padding:32,fontSize:13}}>Nenhuma mudança este mês</div>}{diasU.map(function(dia){var mDia=mudMes.filter(function(m){return m.data===dia;});var df=dia.slice(8)+'/'+dia.slice(5,7)+'/'+dia.slice(0,4);var isHoje=dia===hj.toISOString().slice(0,10);return(<div key={dia} style={{background:'#fff',borderRadius:12,padding:'14px 16px',marginBottom:10,boxShadow:'0 1px 6px rgba(0,0,0,0.06)',border:isHoje?'1.5px solid #3b82f6':'1px solid #e2e8f0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><div style={{fontWeight:700,fontSize:14,color:isHoje?'#1e40af':'#1e293b'}}>{df}{isHoje&&<span style={{marginLeft:8,background:'#dbeafe',color:'#1e40af',borderRadius:6,padding:'1px 7px',fontSize:10,fontWeight:700}}>HOJE</span>}</div><span style={{background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:700}}>{mDia.length} mud.</span></div>{mDia.map(function(m,i){return(<div key={i} style={{display:'flex',alignItems:'center',padding:'7px 0',borderTop:i>0?'1px solid #f1f5f9':'none'}}><div style={{width:7,height:7,borderRadius:'50%',background:m.status==='concluida'?'#047857':m.status==='cancelada'?'#dc2626':'#f59e0b',marginRight:10,flexShrink:0}}></div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#334155'}}>{m.nome}</div><div style={{fontSize:11,color:'#94a3b8'}}>{m.comunidade||''}{m.medicao>0?' · '+m.medicao+'m³':''}</div></div><div style={{fontSize:11,fontWeight:700,color:m.status==='concluida'?'#047857':m.status==='cancelada'?'#dc2626':'#d97706'}}>{m.status==='concluida'?'✅':m.status==='cancelada'?'❌':'⏳'}</div></div>);})}</div>);})}</div>);})()} 
        </div>
      )}
        {tab==="dashboard"&&activityLogs.length>0&&<div style={{padding:"0 12px 16px"}}><div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"12px 14px"}}><div style={{fontWeight:800,fontSize:12,color:"#64748b",letterSpacing:0.5,marginBottom:8,display:"flex",alignItems:"center",gap:5}}>🔔 ÚNTIMAS ATUALIZAÇÕES</div>{activityLogs.slice(0,5).map(function(log){return(<div key={log.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f8fafc"}}><span style={{fontSize:13,flexShrink:0}}>✅</span><div style={{flex:1,fontSize:11,color:"#334155",lineHeight:1.5}}>{log.msg}<span style={{color:"#94a3b8",marginLeft:6,fontSize:10}}>{log.hora}h</span></div></div>);})}</div></div>}
      {tab==="lista"&&(
          <div>
            <div style={{padding:'8px 12px 0'}}><div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>{setFiltroMes('semana');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes==='semana'&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes==='semana'&&!filtroDataIni?'#fff':'#475569'}}>Semana</button><button onClick={()=>{setFiltroMes('mes_atual');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes==='mes_atual'&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes==='mes_atual'&&!filtroDataIni?'#fff':'#475569'}}>Mês Atual</button><button onClick={()=>{setFiltroMes('');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes===''&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes===''&&!filtroDataIni?'#fff':'#475569'}}>Todos</button></div><div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}><input type='date' value={filtroDataIni} onChange={e=>{setFiltroDataIni(e.target.value);setFiltroMes('datas');}} style={{flex:1,padding:'5px 8px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,color:'#334155'}} /><span style={{fontSize:11,color:'#94a3b8',whiteSpace:'nowrap'}}>até</span><input type='date' value={filtroDataFim} onChange={e=>{setFiltroDataFim(e.target.value);setFiltroMes('datas');}} style={{flex:1,padding:'5px 8px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,color:'#334155'}} /></div></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar nome, selo ou comunidade..."
              style={{width:"100%",background:"#fff",border:`1.5px solid ${COLORS.cardBorder}`,borderRadius:12,color:COLORS.text,padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:12,boxShadow:COLORS.shadow}}/>
            {filtered.map(m=>(
              <Card key={m.id} style={{marginBottom:8,padding:"13px 15px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14,color:COLORS.text,marginBottom:5}}>👤 {m.nome}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><TagSelo v={m.selo}/><TagData v={m.data}/></div>
                  </div>
                  <div style={{display:"flex",gap:5,alignItems:"center",marginLeft:8}}>
                    {verMed&&<Badge color={COLORS.green}>{m.medicao} m³</Badge>}
                    {m.contato&&<button onClick={()=>{var tel=(m.contato||"").replace(/\D/g,"");var txt="\uD83D\uDE9A *TELEMIM — Sua Mudan\u00E7a*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nOl\u00E1 *"+m.nome+"*! \uD83D\uDC4B\nConfirmamos sua mudan\u00E7a:\n\uD83D\uDCC5 *Data:* "+_fmtDate(m.data)+"\n\uD83D\uDCCD *Sa\u00EDda:* "+(m.comunidade||m.origem||"-")+"\n\uD83D\uDCCD *Destino:* "+(m.destino||"-")+"\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nEm caso de d\u00FAvidas, entre em contacto. \uD83D\uDE0A\n_TELEMIM_";window.open("https://wa.me/55"+tel+"?text="+encodeURIComponent(txt),"_blank");}} style={{background:"#25d366",border:"none",color:"#fff",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:14}} title="WhatsApp Morador">📱</button>}
                    <button onClick={()=>compartilharMudanca(m)} style={btnGreen}>📲</button>
                    {m.signature_data
                    ? <button onClick={function(){setMudViewPDF(m);setShowViewPDF(true);}} style={{...btnRed,background:"#e0f2fe",border:"1.5px solid #0284c7",color:"#0284c7"}} title="Ver PDF Assinado">📄 Assinado</button>
                    : <button onClick={()=>gerarPDFMudanca(m)} style={{...btnRed,background:"#fff7ed",border:"1.5px solid #ea580c",color:"#ea580c"}} title="Assinar Canhoto">✍️ Assinar</button>}
                    <button onClick={()=>setEditMud((function(){var _cd=(custosDiarios||[]).find(function(x){return x.data===m.data;});return {...m,_qtdAj:_cd?parseInt(_cd.ajudantes)||1:1};})())} style={btnBlue}>✏️</button>
                    {(usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim"))&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:m.id,nome:m.nome,tipo:"mud"});}} style={btnRed}>✕</button>}
                  </div>
                </div>
              
              {m.requires_validation&&<div style={{display:"flex",gap:3,marginTop:6,paddingTop:6,borderTop:"1px solid #f1f5f9",flexWrap:"wrap"}}>{m.social_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Social</span>:usuario&&usuario.perfil==="social"?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"social");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Social</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Social</span>}{m.promorar_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Promorar</span>:usuario&&usuario.perfil==="promorar"?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"promorar");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Promorar</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Promorar</span>}{m.adm_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Adm</span>:usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim")?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"adm");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Adm</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Adm</span>}</div>}</Card>
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
                    const linhas=lista.map(a=>{const v=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ");return `👤 *${a.nome}*\n🏷️ Selo: ${a.selo||"—"} · ⏰ ${a.horario||"—"}h\n📍 ${a.comunidade||"—"}\n📦 Saída: ${a.origem||"—"}\n🏠 Chegada: ${a.destino||"—"}\n🚗 Veículos: ${v||"—"}${a.contato?`\n📞 ${a.contato}`:""}${a.medicao?`\n📐 ${a.medicao} m³`:""}`;});
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
                        {(usuario&&usuario.perfil!=="social")&&<div style={{display:"grid",gridTemplateColumns:(usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim"))?"1fr 1fr":"1fr",gap:8,marginBottom:10}}>{(usuario&&usuario.perfil!=="social")&&<div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>📐 Medição (m³)</label>
                            <input type="number" placeholder="Ex: 27" value={a.medicao||""} onChange={e=>updateAgField(a.id,"medicao",e.target.value)}
                              style={{width:"100%",background:"#fff",border:`1.5px solid ${a.medicao?COLORS.green:COLORS.cardBorder}`,borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                              onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
                              onBlur={e=>e.target.style.border=`1.5px solid ${a.medicao?COLORS.green:COLORS.cardBorder}`}/>
                          </div>}
                          {(usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim"))&&<div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>👷 Ajudantes</label>
                            <input type="number" placeholder="Ex: 3" value={a.ajudantes||""} onChange={e=>updateAgField(a.id,"ajudantes",e.target.value)}
                              style={{width:"100%",background:"#fff",border:`1.5px solid ${a.ajudantes?COLORS.green:COLORS.cardBorder}`,borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                              onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
                              onBlur={e=>e.target.style.border=`1.5px solid ${a.ajudantes?COLORS.green:COLORS.cardBorder}`}/>
                          </div>}
                        </div>}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                          <button onClick={()=>toggleStatus(a.id)} style={{background:statusColor[a.status]+"18",border:`1.5px solid ${statusColor[a.status]}44`,color:statusColor[a.status],borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{statusLabel[a.status]||"⏳ Pendente"}</button>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {a.medicao&&<Badge color={COLORS.green}>📐 {a.medicao} m³</Badge>}
                            <button onClick={()=>compartilharWhatsApp(a)} style={{...btnGreen,fontSize:14,padding:"6px 10px"}}>📲</button>
                            <button onClick={e=>gerarPDFAgendamento(a,e.currentTarget)} style={{...btnRed,background:"#fff1f0",fontSize:14,padding:"6px 10px"}}>📄</button>
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:9}}>
                        <button onClick={()=>converterEmMudanca(a)} style={{background:"#f0fdf4",border:"none",color:COLORS.green,borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Converter em mudança">✅</button>
                        <button onClick={()=>setEditAg({...a})} style={btnBlue}>✏️</button>
                        {(usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim"))&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:a.id,nome:a.nome,tipo:"ag"});}} style={btnRed}>✕</button>}
                      </div>
                    </div>
                  
                  {a.requires_validation&&<div style={{display:"flex",gap:3,marginTop:6,paddingTop:6,borderTop:"1px solid #f1f5f9",flexWrap:"wrap"}}>{a.social_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Social</span>:usuario&&usuario.perfil==="social"?<button onClick={function(e){e.stopPropagation();handleValidarAg(a.id,"social");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Social</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Social</span>}{a.promorar_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Promorar</span>:usuario&&usuario.perfil==="promorar"?<button onClick={function(e){e.stopPropagation();handleValidarAg(a.id,"promorar");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Promorar</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Promorar</span>}{a.adm_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Adm</span>:usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim")?<button onClick={function(e){e.stopPropagation();handleValidarAg(a.id,"adm");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Adm</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Adm</span>}</div>}</Card>
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
        {tab==="financeiro"&&isAdmin&&(function(){
          var _now=new Date();
          var _am=_now.getFullYear()+"-"+(String(_now.getMonth()+1).padStart(2,"0"));
          var _fv=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
          var _fvs=function(v){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v||0);};
          var _nm=new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^./,function(s){return s.toUpperCase();});
          // Filtrar dados do mês — usar slice(0,7) === _am (formato ISO YYYY-MM)
          var _mudM=(mudancas||[]).filter(function(m){return m.data&&m.data.slice(0,7)===_am;});
          var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===_am;});
          var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===_am;});
          // Usar função centralizada — MESMA lógica que aba Contas
          var _r=_calcCustos(_mudM,_cdM,_cpM,RULES);
          return (
            <div style={{padding:"12px 12px 0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                📊 Gerencial — {_nm}
              </div>
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
        {tab==="financeiro"&&isAdmin&&(
        <div style={{paddingBottom:80}}>
          <div style={{display:'flex',gap:6,padding:'12px 12px 0',background:'#f8fafc'}}>{[{v:'semana',l:'Semana'},{v:'mes_atual',l:'Mês Atual'},{v:'mes_ant',l:'Mês Anterior'}].map(function(p){return(<button key={p.v} onClick={()=>setPeriodoFin(p.v)} style={{flex:1,padding:'8px 2px',borderRadius:10,border:'none',background:periodoFin===p.v?'#1e40af':'#e2e8f0',color:periodoFin===p.v?'#fff':'#475569',fontSize:11,fontWeight:periodoFin===p.v?700:500,cursor:'pointer'}}>{p.l}</button>);})}</div><div style={{background:'linear-gradient(135deg,#1e293b,#1e40af)',padding:'20px 16px 24px',marginBottom:-12}}><div style={{fontSize:12,color:'rgba(255,255,255,0.65)',marginBottom:2}}>Painel Financeiro</div><div style={{fontSize:21,fontWeight:800,color:'#fff'}}>{(function(){if(periodoFin==='semana'){var d=new Date();var ds=d.getDay();var s0=new Date(d);s0.setDate(d.getDate()-ds+(ds===0?-6:1));var s1=new Date(s0);s1.setDate(s0.getDate()+6);var fmt=function(dt){return dt.getDate()+'/'+(dt.getMonth()+1);};return 'Semana: '+fmt(s0)+' a '+fmt(s1)+'/'+s1.getFullYear();}if(periodoFin==='mes_ant'){var dm=new Date();dm.setDate(1);dm.setMonth(dm.getMonth()-1);return dm.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^\w/,function(s){return s.toUpperCase();});}return new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^\w/,function(s){return s.toUpperCase();});})()}</div></div>
        </div>
      )}
        </div>

           {tab==="contas"&&<ResumoSemanal mudancas={mudancas} RULES={RULES} prestadores={prestadores} custosDiarios={custosDiarios} setCustosDiarios={setCustosDiarios}/>}
           {tab==="contas"&&isAdmin&&(()=>{const _hj=new Date();const _dw=_hj.getDay();const _diffSeg=_dw===0?6:_dw-1;const _s0=new Date(_hj);_s0.setDate(_hj.getDate()-_diffSeg);const _s1=new Date(_s0);_s1.setDate(_s0.getDate()+6);const _si=_fmtDate(_s0);const _sf=_fmtDate(_s1);const _dIni=contasFilter==="periodo"&&contaEditId==="ini"?contaEditVal:_si;const _dFim=contasFilter==="periodo"&&contaEditId==="fim"?contaEditVal:_sf;const _it=contasSemana.filter(function(x){return x.semana_inicio>=_si&&x.semana_inicio<=_sf;});const _fV=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2});};const _fD=function(d){if(!d)return "";const _p=d.split("-");return _p[2]+"/"+_p[1];};const _ico={"caminhao":"🚛","van":"🚐","ajudante":"👷","almoco":"🍽️","outro":"📋"};const _lbl={"caminhao":"Caminhão","van":"Van","ajudante":"Ajudante","almoco":"Almoço","outro":"Outro"};const _totP=_it.filter(function(x){return x.tipo_conta!=="receber";}).reduce(function(s,x){return s+(parseFloat(x.valor_editado||x.valor_calculado)||0);},0);const _totR=_it.filter(function(x){return x.tipo_conta==="receber";}).reduce(function(s,x){return s+(parseFloat(x.valor_editado||x.valor_calculado)||0);},0);const _pendP=_it.filter(function(x){return x.tipo_conta!=="receber"&&x.status==="pendente";}).reduce(function(s,x){return s+(parseFloat(x.valor_editado||x.valor_calculado)||0);},0);return <div style={{paddingBottom:80}}><div style={{background:"linear-gradient(135deg,#1e293b,#065f46)",padding:"18px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>PROMORAR</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>💸 Contas a Pagar / Receber</div></div><div style={{background:"#f8fafc",padding:"10px 12px 8px",borderBottom:"1px solid #e2e8f0"}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6}}>Período</div><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><input type="date" defaultValue={_si} id="cIni" onChange={function(e){setContaEditId("ini");setContaEditVal(e.target.value);}} style={{flex:1,padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,color:"#334155"}} /><span style={{fontSize:11,color:"#94a3b8"}}>até</span><input type="date" defaultValue={_sf} id="cFim" onChange={function(e){setContaEditId("fim");setContaEditVal(e.target.value);}} style={{flex:1,padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,color:"#334155"}} /><button onClick={function(){setContasFilter("periodo");}} style={{padding:"6px 10px",background:"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>Buscar</button></div><div style={{display:"flex",gap:6}}>{["todas","pendente","pago"].map(function(f){return <button key={f} onClick={()=>setContasFilter(f)} style={{padding:"4px 10px",borderRadius:14,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:contasFilter===f?"#1e40af":"#e2e8f0",color:contasFilter===f?"#fff":"#475569"}}>{f==="todas"?"Todas":f==="pendente"?"⚠️ Pendente":"✅ Pago"}</button>;})}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,padding:"10px 12px 6px",background:"#f8fafc"}}><div style={{background:"#fff7ed",borderRadius:10,padding:"9px 6px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}><div style={{fontSize:9,color:"#94a3b8"}}>A PAGAR</div><div style={{fontSize:12,fontWeight:800,color:"#ea580c"}}>{_fV(_totP)}</div></div><div style={{background:"#eff6ff",borderRadius:10,padding:"9px 6px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}><div style={{fontSize:9,color:"#94a3b8"}}>A RECEBER</div><div style={{fontSize:12,fontWeight:800,color:"#1e40af"}}>{_fV(_totR)}</div></div><div style={{background:_totR-_pendP>=0?"#f0fdf4":"#fef2f2",borderRadius:10,padding:"9px 6px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}><div style={{fontSize:9,color:"#94a3b8"}}>SALDO</div><div style={{fontSize:12,fontWeight:800,color:_totR-_pendP>=0?"#16a34a":"#dc2626"}}>{_fV(_totR-_pendP)}</div></div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 12px 8px",background:"#f8fafc"}}><button onClick={function(){const _desc=prompt("Descrição da conta a PAGAR:");if(!_desc)return;const _val=parseFloat(prompt("Valor (R$):"));if(isNaN(_val))return;const _sem=prompt("Data início da semana (AAAA-MM-DD):",_si);if(!_sem)return;fetch(SUPA_URL+"/rest/v1/contas_semana",{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=representation"},body:JSON.stringify({semana_inicio:_sem,semana_fim:_sf,tipo:"outro",tipo_conta:"pagar",descricao_livre:_desc,valor_calculado:_val,qtd_mudancas:0,status:"pendente"})}).then(function(res){return res.json();}).then(function(novo){if(novo&&novo[0]){setContasSemana(function(prev){return[...prev,novo[0]];});}});}} style={{padding:"10px",background:"#ea580c",color:"#fff",border:"none",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Conta a Pagar</button><button onClick={function(){const _desc=prompt("Descrição da conta a RECEBER:");if(!_desc)return;const _val=parseFloat(prompt("Valor (R$):"));if(isNaN(_val))return;const _sem=prompt("Data início da semana (AAAA-MM-DD):",_si);if(!_sem)return;fetch(SUPA_URL+"/rest/v1/contas_semana",{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=representation"},body:JSON.stringify({semana_inicio:_sem,semana_fim:_sf,tipo:"outro",tipo_conta:"receber",descricao_livre:_desc,valor_calculado:_val,qtd_mudancas:0,status:"pendente"})}).then(function(res){return res.json();}).then(function(novo){if(novo&&novo[0]){setContasSemana(function(prev){return[...prev,novo[0]];});}});}} style={{padding:"10px",background:"#1e40af",color:"#fff",border:"none",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Conta a Receber</button></div><div style={{margin:"0 12px 10px",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}><div style={{background:"#1e293b",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{margin:"0 12px 10px"}}>{(()=>{const _hj=new Date();const _dw=_hj.getDay();const _diffSeg=_dw===0?6:_dw-1;const _s0=new Date(_hj);_s0.setDate(_hj.getDate()-_diffSeg);const _siK=_fmtDate(_s0);const _calc=custosSemana.find(function(x){return x.semana_inicio===_siK;});const _man=contasSemana.filter(function(x){return x.semana_inicio===_siK;});const _fV2=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2});};const _sfK=_calc?_calc.semana_fim:_siK;const _totCal=_calc?parseFloat(_calc.total_custos||0):0;const _totMan=_man.reduce(function(s,x){return s+(parseFloat(x.valor_editado||x.valor_calculado)||0);},0);return <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}><div style={{background:"#1e293b",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:700,color:"#fff"}}>Semana Atual</div><div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{_fD(_siK)} a {_fD(_sfK)} {_calc?"("+_calc.qtd_mudancas+" mud.)":""}</div></div></div><div style={{padding:"8px 8px 4px"}}>{_calc?[{tipo:"caminhao",val:_calc.val_caminhao,icon:"🚛",lbl:"Caminhão"},{tipo:"van",val:_calc.val_van,icon:"🚐",lbl:"Van"},{tipo:"ajudante",val:_calc.val_ajudante,icon:"👷",lbl:"Ajudante"},{tipo:"almoco",val:_calc.val_almoco,icon:"🍽️",lbl:"Almoço"}].map(function(k){const _v=parseFloat(k.val||0);const _pndK=_man.find(function(x){return x.tipo===k.tipo;});const _pago=_pndK&&_pndK.status==="pago";return <div key={k.tipo} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",marginBottom:8,background:_pago?"#f0fdf4":"#fff7ed",borderRadius:10,border:"1.5px solid "+(_pago?"#bbf7d0":"#fed7aa")}}><div style={{fontSize:18,minWidth:24}}>{k.icon}</div><div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:"#475569"}}>{k.lbl}</div><div style={{fontSize:17,fontWeight:800,color:_pago?"#16a34a":"#ea580c"}}>{_fV2(_v)}</div></div><div style={{display:"flex",gap:3}}><button onClick={async function(){const _ns=_pago?"pendente":"pago";if(_pndK){await fetch(SUPA_URL+"/rest/v1/contas_semana?id=eq."+_pndK.id,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({status:_ns,pago_em:_ns==="pago"?new Date().toISOString():null})});setContasSemana(function(p){return p.map(function(x){return x.id===_pndK.id?{...x,status:_ns}:x;});});}else{const _res=await fetch(SUPA_URL+"/rest/v1/contas_semana",{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=representation"},body:JSON.stringify({semana_inicio:_siK,semana_fim:_sfK,tipo:k.tipo,tipo_conta:"pagar",valor_calculado:_v,qtd_mudancas:_calc.qtd_mudancas||0,status:"pago",pago_em:new Date().toISOString()})});const _j=await _res.json();if(_j&&_j[0]){setContasSemana(function(p){return[...p,_j[0]];});}}}} style={{padding:"4px 7px",background:_pago?"#fee2e2":"#dcfce7",color:_pago?"#dc2626":"#16a34a",border:"none",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>{_pago?"↩️":"💳 Pagar"}</button><button onClick={function(){const _msg="*TELEMIM \u2013 Semana "+_fD(_siK)+" a "+_fD(_sfK)+"*\\n"+k.icon+" *"+k.lbl+"*\\n"+(function(){var _NL="\n";var _muds=(mudancas||[]).filter(function(m){return m.data>=_siK&&m.data<=_sfK;});var _diasMap={};_muds.forEach(function(m){_diasMap[m.data]=(_diasMap[m.data]||0)+1;});var _dsorted=Object.keys(_diasMap).sort();if(_dsorted.length===0) return "(sem mudan\u00E7as)";var _nomes=["Dom","Seg","Ter","Qua","Qui","Sex","S\u00E1b"];var _totalMud=_muds.length;return _dsorted.map(function(d){  var _nd=_diasMap[d];  var _dn=_nomes[new Date(d+"T12:00:00").getDay()];  var _vDia=_totalMud>0?(_fV2(_v*_nd/_totalMud)):"R$ 0,00";  return "\u2022 "+_dn+" "+d.slice(8)+"/"+d.slice(5,7)+" \u2192 "+_nd+" mudan\u00E7a"+(_nd>1?"s":"")+" - Valor "+_vDia;}).join(""+_NL+"");})()+""+_NL+""+_NL+"\uD83D\uDCB0 *Valor Total: "+_fV2(_v)+"*"+_NL+""+_NL+"TELEMIM";window.open("https://wa.me/?text="+encodeURIComponent(_msg.replace(/\\n/g,"\n")),"_blank");}} style={{padding:"4px 7px",background:"#22c55e",color:"#fff",border:"none",borderRadius:6,fontSize:13,cursor:"pointer"}}>📲</button></div></div>;}):<div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:12}}>Nenhuma mudança esta semana</div>}<div style={{margin:"8px 8px 4px",padding:"12px 14px",background:"#1e293b",borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>Total da semana <span style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>auto•calculação</span></div><div style={{fontSize:18,fontWeight:900,color:"#fbbf24"}}>{_fV2(_totCal+_totMan)}</div></div>{_man.filter(function(x){return x.tipo==="outro"&&(contasFilter==="todas"||x.status===contasFilter);}).map(function(_item){const _val=parseFloat(_item.valor_editado||_item.valor_calculado)||0;const _pnd2=_item.status==="pendente";const _isRec=_item.tipo_conta==="receber";const _isEd=contaEditId===_item.id;return <div key={_item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",marginBottom:8,background:_isRec?"#eff6ff":_pnd2?"#fff7ed":"#f0fdf4",borderRadius:10,border:"1.5px solid "+(_isRec?"#bfdbfe":_pnd2?"#fed7aa":"#bbf7d0")}}><div style={{fontSize:18,minWidth:24}}>📋</div><div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,color:"#475569",display:"flex",gap:4}}>{_item.descricao_livre||"Outro"}<span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:_isRec?"#dbeafe":"#fee2e2",color:_isRec?"#1d4ed8":"#dc2626"}}>{_isRec?"receber":"pagar"}</span></div>{_isEd?<input autoFocus type="number" value={contaEditVal} onChange={function(ev){setContaEditVal(ev.target.value);}} style={{width:"88%",padding:"3px 8px",borderRadius:6,border:"1.5px solid #1e40af",fontSize:13}} />:<div style={{fontSize:17,fontWeight:800,color:_isRec?"#1e40af":_pnd2?"#ea580c":"#16a34a"}}>{_fV2(_val)}</div>}</div><div style={{display:"flex",gap:3}}>{_isEd?<button onClick={async function(){const _nv=parseFloat(contaEditVal);if(!isNaN(_nv)){await fetch(SUPA_URL+"/rest/v1/contas_semana?id=eq."+_item.id,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({valor_editado:_nv})});setContasSemana(function(p){return p.map(function(x){return x.id===_item.id?{...x,valor_editado:_nv}:x;});});}setContaEditId(null);}} style={{padding:"4px 7px",background:"#1e40af",color:"#fff",border:"none",borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:700}}>✓</button>:<button onClick={function(){setContaEditId(_item.id);setContaEditVal(String(_val));}} style={{padding:"4px 6px",background:"#e2e8f0",color:"#475569",border:"none",borderRadius:6,fontSize:11,cursor:"pointer"}}>✏️</button>}<button onClick={async function(){const _ns=_pnd2?"pago":"pendente";await fetch(SUPA_URL+"/rest/v1/contas_semana?id=eq."+_item.id,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({status:_ns,pago_em:_ns==="pago"?new Date().toISOString():null})});setContasSemana(function(p){return p.map(function(x){return x.id===_item.id?{...x,status:_ns}:x;});});}} style={{padding:"4px 7px",background:_pnd2?"#dcfce7":"#fee2e2",color:_pnd2?"#16a34a":"#dc2626",border:"none",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>{_pnd2?"Pagar":"↩️"}</button><button onClick={function(){const _msg="*TELEMIM*\n"+(_item.descricao_livre||"Outro")+"\nValor: "+_fV2(_val)+"\n\nTELEMIM";window.open("https://wa.me/?text="+encodeURIComponent(_msg.replace(/\\n/g,"\n")),"_blank");}} style={{padding:"4px 7px",background:"#22c55e",color:"#fff",border:"none",borderRadius:6,fontSize:13,cursor:"pointer"}}>📲</button></div></div>;})}</div></div>;})()}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{_fD(_si)} a {_fD(_sf)}</div></div><div style={{fontSize:12,fontWeight:800,color:"#fbbf24"}}>{_fV(_totP)}</div></div><div style={{padding:"8px 8px 4px"}}>{(()=>{const _itensSem=contasSemana.filter(function(x){return x.semana_inicio===_si;});if(_itensSem.length===0) return <div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:12}}>Nenhum custo registrado esta semana</div>;return _itensSem.filter(function(x){return contasFilter==="todas"||x.status===contasFilter;}).map(function(_item){const _val=parseFloat(_item.valor_editado||_item.valor_calculado)||0;const _pnd=_item.status==="pendente";const _isRec=_item.tipo_conta==="receber";const _isEd=contaEditId===_item.id;const _tipoKey=_item.tipo in _ico?_item.tipo:"outro";const _desc=_item.descricao_livre||_lbl[_tipoKey];return <div key={_item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",marginBottom:8,background:_isRec?"#eff6ff":_pnd?"#fff7ed":"#f0fdf4",borderRadius:10,border:"1.5px solid "+(_isRec?"#bfdbfe":_pnd?"#fed7aa":"#bbf7d0")}}><div style={{fontSize:18,minWidth:24}}>{_ico[_tipoKey]}</div><div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,color:"#475569",display:"flex",gap:4,alignItems:"center"}}>{_desc}<span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:_isRec?"#dbeafe":"#fee2e2",color:_isRec?"#1d4ed8":"#dc2626"}}>{_isRec?"receber":"pagar"}</span></div>{_isEd?<input autoFocus type="number" value={contaEditVal} onChange={function(ev){setContaEditVal(ev.target.value);}} style={{width:"88%",padding:"3px 8px",borderRadius:6,border:"1.5px solid #1e40af",fontSize:13}} />:<div style={{fontSize:17,fontWeight:800,color:_isRec?"#1e40af":_pnd?"#ea580c":"#16a34a"}}>{_fV(_val)}</div>}</div><div style={{display:"flex",gap:3}}>{_isEd?<button onClick={async function(){const _nv=parseFloat(contaEditVal);if(!isNaN(_nv)){await fetch(SUPA_URL+"/rest/v1/contas_semana?id=eq."+_item.id,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({valor_editado:_nv})});setContasSemana(function(prev){return prev.map(function(x){return x.id===_item.id?{...x,valor_editado:_nv}:x;});});}setContaEditId(null);}} style={{padding:"4px 7px",background:"#1e40af",color:"#fff",border:"none",borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:700}}>✓</button>:<button onClick={function(){setContaEditId(_item.id);setContaEditVal(String(_val));}} style={{padding:"4px 6px",background:"#e2e8f0",color:"#475569",border:"none",borderRadius:6,fontSize:11,cursor:"pointer"}}>✏️</button>}<button onClick={async function(){const _ns=_pnd?"pago":"pendente";await fetch(SUPA_URL+"/rest/v1/contas_semana?id=eq."+_item.id,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({status:_ns,pago_em:_ns==="pago"?new Date().toISOString():null})});setContasSemana(function(prev){return prev.map(function(x){return x.id===_item.id?{...x,status:_ns}:x;});});}} style={{padding:"4px 7px",background:_pnd?"#dcfce7":"#fee2e2",color:_pnd?"#16a34a":"#dc2626",border:"none",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>{_pnd?(_isRec?"⬇️":"💳"):"↩️"}</button><button onClick={function(){const _msg="*PROMORAR – Semana "+_fD(_si)+" a "+_fD(_sf)+"*\n"+_ico[_tipoKey]+" "+_desc+"\nValor: "+_fV(_val)+"\nTipo: "+(_isRec?"A Receber 💰":"A Pagar 💳")+"\nSit.: "+(_pnd?"Pendente ⚠️":"Pago ✅")+"\n\nTELEMIM | PROMORAR";window.open("https://wa.me/?text="+encodeURIComponent(_msg.replace(/\\n/g,"\n")),"_blank");}} style={{padding:"4px 7px",background:"#22c55e",color:"#fff",border:"none",borderRadius:6,fontSize:13,cursor:"pointer"}}>📲</button></div></div>;});})()}</div></div></div>;})()}{tab==="config"&&<div style={{paddingBottom:80}}><div style={{background:"#1e293b",padding:"20px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Sistema</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>⚙️ Configuração</div></div><div style={{display:"flex",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}><button onClick={()=>setSubConfig("usuarios")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="usuarios"?700:500,background:"transparent",borderBottom:subConfig==="usuarios"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="usuarios"?"#1e40af":"#64748b"}}>👥 Usuários</button><button onClick={()=>setSubConfig("regras")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="regras"?700:500,background:"transparent",borderBottom:subConfig==="regras"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="regras"?"#1e40af":"#64748b"}}>📊 Regras</button></div><button onClick={()=>setSubConfig("backup")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="backup"?700:500,background:"transparent",borderBottom:subConfig==="backup"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="backup"?"#1e40af":"#64748b"}}>💾 Backup</button>{subConfig==="usuarios"&&isAdmin&&(<div style={{paddingBottom:80}} onMouseEnter={()=>listaUsuarios.length===0&&carregarUsuarios()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:16,fontWeight:900}}>👥 Gerenciar Usuários</div><button onClick={carregarUsuarios} style={{background:"#eff6ff",border:"1px solid #3b82f6",color:"#3b82f6",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔄 Atualizar</button></div><Card style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>USUÁRIOS ({listaUsuarios.length})</div>{listaUsuarios.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Clique em Atualizar</div>:listaUsuarios.map(u=>(<div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}><div><div style={{fontWeight:700,fontSize:13}}>{u.nome}</div><div style={{fontSize:11,color:"#94a3b8"}}>{u.email}</div><span style={{display:"inline-block",marginTop:3,background:u.perfil==="admin"?"#dbeafe":u.perfil==="promorar"?"#dcfce7":"#fef9c3",borderRadius:12,padding:"2px 8px",fontSize:10,fontWeight:800,color:u.perfil==="admin"?"#1d4ed8":u.perfil==="promorar"?"#15803d":"#a16207"}}>{u.perfil==="admin"?"👑 Admin":u.perfil==="promorar"?"🏢 Promorar":"🤝 Social"}</span></div><button onClick={function(){setEditUser({id:u.id,nome:u.nome,email:u.email,senha:"",perfil:u.perfil,ativo:u.ativo});setEditMsg("");}} style={{padding:"6px 12px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>✏️ Editar</button><button onClick={()=>toggleAtivoUser(u)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(u.ativo?"#ef4444":"#22c55e"),background:u.ativo?"#fef2f2":"#f0fdf4",color:u.ativo?"#ef4444":"#22c55e",fontSize:11,fontWeight:700,cursor:"pointer"}}>{u.ativo?"🚫 Desativar":"✅ Ativar"}</button></div>))}</Card><Card><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>+ NOVO USUÁRIO</div><Inp label="Nome" icon="👤" value={novoUser.nome} onChange={v=>setNovoUser(f=>({...f,nome:v}))}/><Inp label="Email" icon="📧" value={novoUser.email} onChange={v=>setNovoUser(f=>({...f,email:v}))}/><Inp label="Senha" icon="🔒" value={novoUser.senha} onChange={v=>setNovoUser(f=>({...f,senha:v}))}/><div style={{marginBottom:12}}><label style={{display:"block",color:"#94a3b8",fontSize:11,fontWeight:700,marginBottom:5}}>PERFIL</label><div style={{display:"flex",gap:8}}>{[["admin","👑 Admin"],["promorar","🏢 Promorar"],["social","🤝 Social"]].map(([val,lab])=>(<button key={val} onClick={()=>setNovoUser(f=>({...f,perfil:val}))} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1.5px solid "+(novoUser.perfil===val?"#f97316":"#e2e8f0"),background:novoUser.perfil===val?"#fff7ed":"#f8fafc",color:novoUser.perfil===val?"#f97316":"#94a3b8",fontWeight:800,fontSize:11,cursor:"pointer"}}>{lab}</button>))}</div></div>{userMsg&&<div style={{background:userMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:userMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{userMsg}</div>}<button onClick={criarUsuario} disabled={savingUser} style={{width:"100%",padding:13,borderRadius:12,background:savingUser?"#94a3b8":"#f97316",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:savingUser?"not-allowed":"pointer"}}>{savingUser?"⏳ Criando...":"➕ Criar Usuário"}</button></Card></div>)}{editUser&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditUser(null);}}><div style={{background:"#fff",borderRadius:16,padding:"20px 16px 24px",width:"100%",maxWidth:420}} onClick={function(e){e.stopPropagation();}}><div style={{fontSize:15,fontWeight:800,color:"#1e293b",marginBottom:14}}>✏️ Editar Usuário</div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>👤 NOME</div><input value={editUser.nome} onChange={function(e){setEditUser(function(p){return {...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Nome"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📧 EMAIL</div><input value={editUser.email} onChange={function(e){setEditUser(function(p){return {...p,email:e.target.value};});}} type="email" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Email"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>🔒 NOVA SENHA <span style={{fontSize:10,color:"#94a3b8"}}>(vazio = manter)</span></div><input value={editUser.senha||""} onChange={function(e){setEditUser(function(p){return {...p,senha:e.target.value};});}} type="password" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Nova senha (opcional)"/></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6}}>PERFIL</div><div style={{display:"flex",gap:8}}>{[{v:"admin",l:"👑 Admin"},{v:"promorar",l:"🏢 Promorar"},{v:"social",l:"🤝 Social"}].map(function(p){return <button key={p.v} onClick={function(){setEditUser(function(u){return {...u,perfil:p.v};});}} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"2px solid "+(editUser.perfil===p.v?"#1e40af":"#e2e8f0"),background:editUser.perfil===p.v?"#eff6ff":"#f8fafc",color:editUser.perfil===p.v?"#1e40af":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>{p.l}</button>;})}</div></div>{editMsg&&<div style={{background:editMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:editMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{editMsg}</div>}<div style={{display:"flex",gap:8}}><button onClick={function(){setEditUser(null);setEditMsg("");}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarUsuario} disabled={savingEdit} style={{flex:2,padding:11,borderRadius:10,background:savingEdit?"#94a3b8":"#1e40af",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:savingEdit?"not-allowed":"pointer"}}>{savingEdit?"⏳ Salvando...":"✅ Salvar"}</button></div></div></div>}{subConfig==="backup"&&<div style={{padding:16,paddingBottom:16}}><div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:12}}>💾 Backup Automático → Google Drive</div><div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>Backup Ativado</div><div style={{fontSize:10,color:"#64748b"}}>Semanal (seg) + Mensal (dia 1)</div></div><button onClick={async function(){const nv=!backupCfg.ativo;await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.backup_ativo",{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({valor:nv?"true":"false"})});setBackupCfg(function(p){return{...p,ativo:nv};});}} style={{padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:backupCfg.ativo?"#16a34a":"#e2e8f0",color:backupCfg.ativo?"#fff":"#64748b"}}>{backupCfg.ativo?"✅ Ativo":"❌ Inativo"}</button></div><div style={{background:"#eff6ff",borderRadius:10,padding:"12px 14px",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:8}}>🔗 Google OAuth2</div><div style={{marginBottom:6}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Client ID</div><input type="text" value={backupCfg.clientId} onChange={function(e){setBackupCfg(function(p){return{...p,clientId:e.target.value};});}} placeholder="xxxxxx.apps.googleusercontent.com" style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><div style={{marginBottom:6}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Client Secret</div><input type="password" value={backupCfg.clientSecret} onChange={function(e){setBackupCfg(function(p){return{...p,clientSecret:e.target.value};});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><div style={{marginBottom:8}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Refresh Token</div><input type="password" value={backupCfg.refreshToken} onChange={function(e){setBackupCfg(function(p){return{...p,refreshToken:e.target.value};});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><button onClick={async function(){const pairs=[["backup_gdrive_client_id",backupCfg.clientId],["backup_gdrive_client_secret",backupCfg.clientSecret],["backup_gdrive_refresh_token",backupCfg.refreshToken]];for(const [k,v] of pairs){await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+k,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({valor:v})});}alert("✅ Credenciais salvas!");}} style={{width:"100%",padding:"8px",background:"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>Salvar Credenciais</button></div><div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#16a34a",marginBottom:4}}>📅 Agendamento Automático</div><div style={{fontSize:11,color:"#475569",marginBottom:2}}>🔁 Semanal: toda segunda-feira às 06:00h</div><div style={{fontSize:11,color:"#475569",marginBottom:2}}>📆 Mensal: dia 1º de cada mês às 06:00h</div><div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Pasta: APP Telemim → [Ano] → Semanal / Mensal</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><button onClick={async function(){setBackupLoading(true);try{const res=await fetch("https://netoufukpmmfhzwirogi.supabase.co/functions/v1/backup-gdrive?tipo=semanal&force=1",{method:"POST",headers:{"Content-Type":"application/json"}});const j=await res.json();alert(j.ok?"✅ Backup semanal!\n"+j.arquivo:"❌ "+(j.erro||j.msg));}catch(e){alert("❌ "+e.message);}setBackupLoading(false);}} disabled={backupLoading} style={{padding:"10px",background:backupLoading?"#94a3b8":"#059669",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{backupLoading?"⏳...":"🚀 Rodar Semanal"}</button><button onClick={async function(){setBackupLoading(true);try{const res=await fetch("https://netoufukpmmfhzwirogi.supabase.co/functions/v1/backup-gdrive?tipo=mensal&force=1",{method:"POST",headers:{"Content-Type":"application/json"}});const j=await res.json();alert(j.ok?"✅ Backup mensal!\n"+j.arquivo:"❌ "+(j.erro||j.msg));}catch(e){alert("❌ "+e.message);}setBackupLoading(false);}} disabled={backupLoading} style={{padding:"10px",background:backupLoading?"#94a3b8":"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{backupLoading?"⏳...":"🚀 Rodar Mensal"}</button></div><div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>Histórico de Backups</div>{backupHist.length===0?<div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:16}}>Nenhum backup realizado ainda</div>:backupHist.map(function(h){return <div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",marginBottom:8,background:h.status==="ok"?"#f0fdf4":"#fef2f2",borderRadius:8,border:"1px solid "+(h.status==="ok"?"#bbf7d0":"#fecaca")}}><div><div style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{h.tipo==="semanal"?"🔁":"📆"} {h.periodo_ref}</div><div style={{fontSize:10,color:"#64748b"}}>{h.arquivo_nome||h.erro_msg}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#94a3b8"}}>{h.executado_em?new Date(h.executado_em).toLocaleString("pt-BR"):""}</div>{h.gdrive_link&&<a href={h.gdrive_link} target="_blank" style={{fontSize:10,color:"#1e40af"}}>🔗 Ver</a>}</div></div>;})}</div>}{subConfig==="regras"&&<div style={{padding:"12px 12px 80px"}}><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚛 Caminhão</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>1ª Mudança (R$)</label><input type="number" value={cfgEdit.cam1a||350} onChange={e=>setCfgEdit(p=>({...p,cam1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.camAdd||130} onChange={e=>setCfgEdit(p=>({...p,camAdd:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>👷 Ajudante</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>1º Ajudante (R$)</label><input type="number" value={cfgEdit.aj1a||80} onChange={e=>setCfgEdit(p=>({...p,aj1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.ajAdd||20} onChange={e=>setCfgEdit(p=>({...p,ajAdd:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚐 Van</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Custo Operacional (R$)</label><input type="number" value={cfgEdit.vanCusto||400} onChange={e=>setCfgEdit(p=>({...p,vanCusto:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Valor Cobrado (R$)</label><input type="number" value={cfgEdit.van1a||1000} onChange={e=>setCfgEdit(p=>({...p,van1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🮾 Imposto e Vigência</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Imposto (%)</label><input type="number" value={Math.round((cfgEdit.imposto||0.16)*100)} onChange={e=>setCfgEdit(p=>({...p,imposto:Number(e.target.value)/100}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>📅 Data Início</label><input type="date" value={cfgEdit.dataInicioRegra||""} onChange={e=>setCfgEdit(p=>({...p,dataInicioRegra:e.target.value}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,boxSizing:"border-box",color:"#334155"}}/></div></div></div></div>{(()=>{const _c1=cfgEdit.cam1a||350;const _cA=cfgEdit.camAdd||130;const _a1=cfgEdit.aj1a||80;const _aA=cfgEdit.ajAdd||20;const _v1=cfgEdit.van1a||1000;const _vC=cfgEdit.vanCusto||400;return <div style={{background:"#f1f5f9",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:12,color:"#475569"}}><div style={{fontWeight:700,marginBottom:6}}>Simulação:</div><div>🚛 1 mud: R${_c1} | 2 mud: R${_c1+_cA} | 3 mud: R${_c1+2*_cA}</div><div>👷 1 aj/1 mud: R${_a1} | 1 aj/2 mud: R${_a1+_aA}</div><div>🚐 Van cobra R${_v1} | custa R${_vC}</div></div>;})()}<button onClick={async()=>{try{const rows=[{chave:"cam_1a_mudanca",valor:String(cfgEdit.cam1a||350)},{chave:"cam_adicional",valor:String(cfgEdit.camAdd||130)},{chave:"ajudante_1a_mudanca",valor:String(cfgEdit.aj1a||80)},{chave:"ajudante_adicional",valor:String(cfgEdit.ajAdd||20)},{chave:"custo_van_dia",valor:String(cfgEdit.vanCusto||400)},{chave:"ganho_van_dia",valor:String(cfgEdit.van1a||1000)},{chave:"van_1a_mudanca",valor:String(cfgEdit.van1a||1000)},{chave:"imposto_pct",valor:String(Math.round((cfgEdit.imposto||0.16)*100))},{chave:"data_inicio_regra",valor:cfgEdit.dataInicioRegra||""}];let ok2=true;for(const row of rows){const res=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+row.chave,{method:"PATCH",headers:{"Content-Type":"application/json",apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY,"Prefer":"return=minimal"},body:JSON.stringify({valor:row.valor})});if(!res.ok){ok2=false;}}if(ok2){alert("Regras salvas!");}else{alert("Erro ao salvar.");}}catch(e){alert("Erro: "+e.message);}}} style={{width:"100%",padding:"14px",background:"#1e40af",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>💾 Salvar Regras</button></div>}</div>}
          {isAdmin&&subConfig==="regras"&&(
            <div style={{marginTop:20,background:"#f0fdf4",borderRadius:12,padding:16,border:"1px solid #bbf7d0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:800,color:"#15803d"}}>📲 Automação WhatsApp</div>
                <button onClick={function(){var v=cfgWA.whatsapp_ativo==="true"?"false":"true";setCfgWA(function(p){return {...p,whatsapp_ativo:v};});fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.whatsapp_ativo",{method:"PATCH",headers:{...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({valor:v})}).catch(function(e){console.warn(e);});}} style={{padding:"4px 12px",borderRadius:20,border:"none",background:cfgWA.whatsapp_ativo==="true"?"#16a34a":"#e2e8f0",color:cfgWA.whatsapp_ativo==="true"?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  {cfgWA.whatsapp_ativo==="true"?"✅ Activo":"⭕ Inactivo"}
                </button>
              </div>
              <div style={{fontSize:11,color:"#374151",marginBottom:10,background:"#fff",borderRadius:8,padding:"6px 10px",border:"1px solid #d1fae5"}}>Ao finalizar OS com assinatura, envia o canhoto PDF automaticamente para cliente, admin e supervisor.</div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:3}}>👑 Telefone Admin</div>
                <input type="tel" value={cfgWA.admin_whatsapp} onChange={function(e){setCfgWA(function(p){return {...p,admin_whatsapp:e.target.value};});}} placeholder="Ex: 81999990000" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:3}}>👥 Telefone Supervisor</div>
                <input type="tel" value={cfgWA.supervisor_whatsapp} onChange={function(e){setCfgWA(function(p){return {...p,supervisor_whatsapp:e.target.value};});}} placeholder="Ex: 81988880000" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1fae5",fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <button onClick={async function(){
                setWaLoading(true);
                try{
                  await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.admin_whatsapp",{method:"PATCH",headers:{...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({valor:cfgWA.admin_whatsapp||""})}).catch(function(e){console.warn("WA admin save:",e);});
                  await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.supervisor_whatsapp",{method:"PATCH",headers:{...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({valor:cfgWA.supervisor_whatsapp||""})}).catch(function(e){console.warn("WA sup save:",e);});
                  await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.whatsapp_ativo",{method:"PATCH",headers:{...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({valor:cfgWA.whatsapp_ativo||"false"})}).catch(function(e){console.warn("WA ativo save:",e);});
                  setSyncStatus("📲 Contactos WhatsApp guardados com sucesso!");
                  setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);
                }catch(e){setSyncStatus("⚠️ Erro: "+e.message);}
                setWaLoading(false);
              }} disabled={waLoading} style={{width:"100%",padding:10,borderRadius:10,border:"none",background:waLoading?"#86efac":"#16a34a",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>{waLoading?"⏳ A guardar...":"💾 Guardar Contactos WhatsApp"}</button>
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
              <button onClick={function(){
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
                setMudancas(function(prev){return prev.map(function(m){return m.id===_mId?{...m,status:"Concluído",signature_data:_sigB64}:m;});});
                fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+_mId,{method:"PATCH",headers:{...HEADERS,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({status:"Concluído",signature_data:_sigB64})}).catch(function(e){console.warn("sig patch:",e);});
                _gerarPDFComAssinatura(mudAssinatura,assinB64,ressalvas);
                setMudAssinatura(null);
              }} style={{flex:2,padding:10,borderRadius:10,border:"none",background:COLORS.accent,color:"#fff",fontWeight:900,cursor:"pointer"}}>📄 Gerar Recibo PDF</button>
            </div>
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
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Cliente: <b>{mudViewPDF.nome}</b> | Selo: <b>{mudViewPDF.selo||"-"}</b></div>
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

    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.55)",zIndex:9998,display:confirmDelete?"flex":"none",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setConfirmDelete(null);}}><div style={{background:"#fff",borderRadius:20,padding:"28px 24px",maxWidth:340,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.2)",textAlign:"center"}} onClick={function(e){e.stopPropagation();}}><div style={{fontSize:36,marginBottom:12}}>⚠️</div><div style={{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:8}}>Tem a certeza?</div><div style={{fontSize:13,color:"#64748b",marginBottom:20}}>Apagar <strong>{confirmDelete&&confirmDelete.nome}</strong>?</div><div style={{display:"flex",gap:10}}><button onClick={function(){setConfirmDelete(null);}} style={{flex:1,padding:"11px 0",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button><button onClick={function(){if(confirmDelete&&confirmDelete.tipo==="mud")handleDelMud(confirmDelete.id);else if(confirmDelete)handleDelAg(confirmDelete.id);setConfirmDelete(null);}} style={{flex:1,padding:"11px 0",borderRadius:12,border:"none",background:"#ef4444",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>🗑️ Sim, Apagar</button></div></div></div>
    </div>
  );
}
