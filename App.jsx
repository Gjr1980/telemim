import { useState, useEffect } from "react";

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

const initForm = { nome:"", selo:"", data:new Date().toISOString().split("T")[0], horario:"08:00", origem:"", destino:"", medicao:"", van:true, comunidade:"", contato:"" };

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
  const diasVan=[...new Set(mudancas.filter(m=>m.van).map(m=>m.data))];
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

export default function App(){
  const [usuario,setUsuario]=useState(null);
  const [loginForm,setLoginForm]=useState({email:"",senha:""});
  const [loginErro,setLoginErro]=useState("");
  const [loginLoad,setLoginLoad]=useState(false);
  const [authChecked,setAuthChecked]=useState(false);
  const [listaUsuarios,setListaUsuarios]=useState([]);
  const [novoUser,setNovoUser]=useState({nome:"",email:"",senha:"",perfil:"promorar"});
  const [savingUser,setSavingUser]=useState(false);
  const [userMsg,setUserMsg]=useState("");
  const [tab,setTab]=useState("inicio");
  const [periodoFin,setPeriodoFin]=useState("semana");
  const [cfgEdit,setCfgEdit]=useState({van1a:1000,vanAdd:0,aj1a:80,ajAdd:20,dataInicioRegra:'',imposto:16});
  const [cfgSaved,setCfgSaved]=useState(false);
  const [bioLock,setBioLock]=useState(localStorage.getItem('tmim_bio_enabled')==='true'&&!!localStorage.getItem('tmim_u'));
  const [mudancas,setMudancas]=useState([]);
  const [agenda,setAgenda]=useState([]);
  const [custosDiarios,setCustosDiarios]=useState([]);
  const [showImport,setShowImport]=useState(false);
  const [importText,setImportText]=useState("");
  const [showImportAg,setShowImportAg]=useState(false);
  const [importTextAg,setImportTextAg]=useState("");
  const [form,setForm]=useState(initForm);
  const [agForm,setAgForm]=useState({...initForm,status:"confirmado"});
  const [rel,setRel]=useState(null);
  const [relDataIni,setRelDataIni]=useState("");
  const [relDataFim,setRelDataFim]=useState("");
  const [relAj,setRelAj]=useState("3");
  const [relAlm,setRelAlm]=useState("0");
  const [semanaIdx,setSemanaIdx]=useState(0);
  const [loading,setLoading]=useState(true);
  const [flash,setFlash]=useState("");
  const [expand,setExpand]=useState(null);
  const [search,setSearch]=useState("");
  const [filtroMes,setFiltroMes]=useState("");
  const [editMud,setEditMud]=useState(null);
  const [convertModal,setConvertModal]=useState(null);
  const [editAg,setEditAg]=useState(null);
  const [syncStatus,setSyncStatus]=useState("✅ Sincronizado");
  const [contasPagar,setContasPagar]=useState([]);
  const [contasHist,setContasHist]=useState([]);
  const [novaContaForm,setNovaContaForm]=useState({tipo:'van',descricao:'',valor:'',beneficiario:'',telefone:'',vencimento:''});
  const [showNovaConta,setShowNovaConta]=useState(false);

  // ── LOAD DATA ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    async function load(){
      try {
        let [mRows, aRows] = await Promise.all([dbGet("mudancas"), dbGet("agenda")]);
        if(mRows.length===0){
          await dbUpsert("mudancas", DADOS_INICIAIS);
          mRows = DADOS_INICIAIS;
        }
        if(aRows.length===0){
          await dbUpsert("agenda", AGENDA_INICIAIS);
          aRows = AGENDA_INICIAIS;
        }
        let cRows = await dbGetCustos();
        setMudancas(mRows);
        setAgenda(aRows);
        setCustosDiarios(cRows);
      } catch(e){
        setMudancas(DADOS_INICIAIS);
        setAgenda(AGENDA_INICIAIS);
        setSyncStatus("⚠️ Offline");
      }
      const cpRows=await dbGetContas('pendente');
      setContasPagar(cpRows);
      const chRows=await dbGetContas('pago');
      setContasHist(chRows);
      setLoading(false);
    }
    load();
  },[]);

  // ── SYNC HELPERS ───────────────────────────────────────────────────────────
  function parseImport(txt){
    const nome=(txt.match(/Sr[a]?\.\s*\*?([^-\n*]+?)\*?\s*[-–]/)||txt.match(/Sr[a]?\.\s*\*?([^\n*]+?)\*?\s*[\n]/)||[])[1]?.trim()||"";
    const selo=(txt.match(/Selo[:\s]*\*?([A-Z]{2,3}-[\d\w-]+)\*?/i)||[])[1]?.trim()||"";
    const comunidade=(txt.match(/\(([^)]+)\)/)||[])[1]?.trim()||"";
    const van=/van/i.test(txt);
    const caminhao=/caminhão|caminhao/i.test(txt);
    let data="";
    const dMatch=txt.match(/(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)[:\s*]*([\d]{1,2})\/([\d]{1,2})/i);
    if(dMatch){const d=dMatch[2].padStart(2,'0'),m=dMatch[3].padStart(2,'0'),yr=new Date().getFullYear();data=yr+"-"+m+"-"+d;}
    const horario=(txt.match(/[Hh]or[aá]rio[:\s*]*([\d]{1,2}:[\d]{2})/)||txt.match(/([\d]{1,2}:[\d]{2})h/)||[])[1]?.replace('h','').trim()||"";
    const origem=(txt.match(/[Ss]a[íi]da[:\s*]+([^\n*]+)/)||txt.match(/[Ee]ndere[cç]o de sa[íi]da[:\s*]+([^\n*]+)/)||[])[1]?.trim()||"";
    const destino=(txt.match(/[Ee]ndere[cç]o [Ff]inal[:\s*]+([^\n*]+)/)||txt.match(/[Dd]estino[:\s*]+([^\n*]+)/)||[])[1]?.trim()||"";
    return {nome,selo,comunidade,van,caminhao,data,horario,origem,destino};
  }

    async function saveCustoDia(data, ajudantes, custo_almoco, pago_van=false, pago_caminhao=false, pago_ajudante=false, pago_almoco=false){
    const row = { id: parseInt(data.replace(/-/g,'')), data, ajudantes: parseInt(ajudantes)||0, custo_almoco: parseFloat(custo_almoco)||0, pago_van, pago_caminhao, pago_ajudante, pago_almoco };
    setCustosDiarios(prev => {
      const ex = prev.find(x=>x.data===data);
      return ex ? prev.map(x=>x.data===data?row:x) : [...prev,row];
    });
    await dbUpsertCusto(row);
  }

  async function saveMud(list){
    setMudancas(list);
    setSyncStatus("🔄 Salvando...");
    try {
      for(const m of list){
        const row={id:m.id,nome:m.nome,selo:m.selo||"",comunidade:m.comunidade||"",data:m.data,origem:m.origem||"",destino:m.destino||"",medicao:m.medicao||0,van:m.van||false};
        await fetch(`${SUPA_URL}/rest/v1/mudancas`,{method:"POST",headers:{...HEADERS,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify([row])});
      }
      setSyncStatus("✅ Sinc");
    } catch(e){ setSyncStatus("⚠️ Erro"); }
  }
  useEffect(()=>{const s=localStorage.getItem('tmim_u');if(s){try{setUsuario(JSON.parse(s));}catch(e){}}setAuthChecked(true);
    fetch(SUPA_URL+'/rest/v1/configuracoes?select=chave,valor',{headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}}).then(res=>res.json()).then(rows=>{if(!Array.isArray(rows))return;const cfg={};rows.forEach(row=>{cfg[row.chave]=row.valor;});RULES.van1a=Number(cfg.van_1a_mudanca)||1000;RULES.vanAdd=Number(cfg.van_adicional)||130;RULES.aj1a=Number(cfg.ajudante_1a_mudanca)||80;RULES.ajAdd=Number(cfg.ajudante_adicional)||20;RULES.imposto=(Number(cfg.imposto_pct)||16)/100;RULES.dataInicioRegra=cfg.data_inicio_regra||'';setCfgEdit({van1a:RULES.van1a,vanAdd:RULES.vanAdd,aj1a:RULES.aj1a,ajAdd:RULES.ajAdd,dataInicioRegra:RULES.dataInicioRegra,imposto:Number(cfg.imposto_pct)||16});}).catch(()=>{});if(!document.getElementById('tmim-anim')){const st=document.createElement('style');st.id='tmim-anim';st.textContent='@keyframes piscarVerde{0%,100%{opacity:1;box-shadow:0 2px 8px rgba(22,163,74,0.15);}50%{opacity:0.88;box-shadow:0 0 0 8px rgba(22,163,74,0.35),0 4px 20px rgba(22,163,74,0.6);}}.em-andamento{animation:piscarVerde 1.2s ease-in-out infinite!important;}';document.head.appendChild(st);}if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}},[]);
  async function handleLogin(){if(!loginForm.email||!loginForm.senha){setLoginErro("Preencha email e senha");return;}setLoginLoad(true);setLoginErro("");try{const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:loginForm.email,password:loginForm.senha})});const d=await res.json();if(!res.ok||!d.access_token){setLoginErro("Email ou senha incorretos");setLoginLoad(false);return;}const pr=await fetch(SUPA_URL+"/rest/v1/usuarios?id=eq."+d.user.id+"&select=*",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+d.access_token}});const pd=await pr.json();if(!pd||!pd[0]||pd[0].ativo===false){setLoginErro("Sem acesso. Contate o administrador.");setLoginLoad(false);return;}const u={id:d.user.id,email:d.user.email,nome:pd[0].nome,perfil:pd[0].perfil,token:d.access_token};setUsuario(u);localStorage.setItem('tmim_u',JSON.stringify(u));}catch(e){setLoginErro("Erro.");}setLoginLoad(false);}
  function handleLogout(){setUsuario(null);localStorage.removeItem('tmim_u');setLoginForm({email:"",senha:""});}
  const perfil=usuario?.perfil||"";const isAdmin=perfil==="admin";const isPromorar=perfil==="promorar";const isSocial=perfil==="social";const temFin=isAdmin;const podeEditar=isAdmin||isPromorar;const verMed=isAdmin||isPromorar;
  async function carregarUsuarios(){if(!isAdmin||!usuario?.token)return;const r=await fetch(SUPA_URL+"/rest/v1/usuarios?select=*&order=criado_em.asc",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+usuario.token}});const d=await r.json();if(Array.isArray(d))setListaUsuarios(d);}
  async function criarUsuario(){
    if(!novoUser.nome||!novoUser.email||!novoUser.senha){setUserMsg("⚠️ Preencha todos os campos");return;}
    setSavingUser(true);setUserMsg("");
    try{
      const res=await fetch(SUPA_URL+"/functions/v1/criar-usuario",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(usuario?.token||''),"Content-Type":"application/json"},body:JSON.stringify({nome:novoUser.nome,email:novoUser.email,password:novoUser.senha,perfil:novoUser.perfil})});
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
    if(tabela==="agenda")loadAg();else loadMud();
  }
  function fmtTempo(iso){if(!iso)return null;const d=new Date(iso);return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
    async function saveAg(list){
    setAgenda(list);
    setSyncStatus("🔄 Salvando...");
    try {
      for(const a of list){
        const row={id:a.id,nome:a.nome,selo:a.selo||"",comunidade:a.comunidade||"",data:a.data,horario:a.horario||"",origem:a.origem||"",destino:a.destino||"",contato:a.contato||"",van:a.van||false,caminhao:a.caminhao||false,medicao:a.medicao||0,ajudantes:a.ajudantes||0,status:a.status||"confirmado"};
        await fetch(`${SUPA_URL}/rest/v1/agenda`,{method:"POST",headers:{...HEADERS,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify([row])});
      }
      setSyncStatus("✅ Sinc");
    } catch(e){ setSyncStatus("⚠️ Erro"); }
  }

  // ── MUDANÇAS CRUD ──────────────────────────────────────────────────────────
  async function handleAddMud(){
    if(!form.nome||!form.selo) return;
    const nova={...form,id:Date.now(),medicao:parseFloat(form.medicao)||0};
    await saveMud([...mudancas,nova]);
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
    await saveMud(updated); setEditMud(null);
  }

  // ── AGENDA CRUD ────────────────────────────────────────────────────────────
  async function handleAddAg(){
    if(!agForm.nome||!agForm.data) return;
    const nova={...agForm,id:Date.now()};
    await saveAg([...agenda,nova]);
    setAgForm({...initForm,status:"confirmado"}); setFlash("✅ Agendado!"); setTimeout(()=>setFlash(""),1800); setTab("agenda");
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
  }
  async function converterEmMudanca(ag){
    if(!ag.medicao){alert('Informe a medição (m³) antes de finalizar.');return;}
    if(!window.confirm('Confirmar como realizada?\nSerá movida para Mudanças Registradas.'))return;
    const nova={nome:ag.nome,selo:ag.selo||'',comunidade:ag.comunidade||'',data:ag.data,origem:ag.origem||'',destino:ag.destino||'',contato:ag.contato||null,van:ag.van||false,caminhao:ag.caminhao||false,medicao:ag.medicao||0,ajudantes:ag.ajudantes||0,observacao:ag.observacao||'',status:'concluida',registrado_por:usuario.email};
    const{error:errM}=await supabase.from('mudancas').insert([nova]);
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

  // ── HELPER: abrir PDF via Blob (funciona em todos os ambientes) ────────────
  function abrirPDF(html, nomeArquivo){
    const printStyle = `<style>@media print{body{margin:0;padding:0;background:#fff}.page{box-shadow:none!important;border-radius:0!important;border:none!important}}@page{size:A4;margin:8mm}</style>`;
    const fullHtml = html.replace('</head>', printStyle + '</head>');
    const w = window.open('', '_blank', 'width=900,height=700');
    if(!w){ alert('Permita pop-ups para gerar PDF!'); return; }
    w.document.write(fullHtml);
    w.document.close();
    w.addEventListener('load', function(){ setTimeout(function(){ w.print(); }, 600); });
  }

  // ── CSS COMPARTILHADO PARA PDFs ────────────────────────────────────────────
  const pdfCSS=`*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f4f6f9;color:#1a1a2e;padding:20px}.page{max-width:720px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}.header{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:#fff;padding:24px 28px}.logo{font-size:22px;font-weight:900;color:#e67e22}.subtitle{font-size:10px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;margin-top:2px}.header-meta{font-size:11px;color:#94a3b8;text-align:right;line-height:1.8}.header-top{display:flex;justify-content:space-between;align-items:flex-start}.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}.body{padding:24px 28px}.section{margin-bottom:20px}.section-title{font-size:12px;font-weight:800;padding:7px 12px;border-radius:8px;margin-bottom:9px}.title-fat{background:#fff8e6;color:#b7840a}.title-imp{background:#fdecea;color:#c0392b}.title-cust{background:#eaf4fb;color:#1a6a99}.title-res{background:#f0f0f0;color:#333}.title-mud{background:#f0faf4;color:#1a7a45}.title-ag{background:#f5f3ff;color:#6d28d9}.title-info{background:#f0f9ff;color:#0369a1}table{width:100%;border-collapse:collapse}td{padding:8px 11px;font-size:12px;border-bottom:1px solid #f0f0f0}td:last-child{text-align:right;font-weight:700}tr.total td{background:#f8f9fb;font-weight:800;font-size:13px;border-top:2px solid #e0e0e0}tr.hrow td{background:#f0f2f5;font-weight:700;font-size:11px;color:#666;text-transform:uppercase}.green{color:#16a34a}.red{color:#dc2626}.blue{color:#2563eb}.orange{color:#e67e22}.purple{color:#7c3aed}.lucro-box{border-radius:12px;padding:20px;text-align:center;margin-bottom:20px}.lucro-label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px}.lucro-val{font-size:36px;font-weight:900;line-height:1}.lucro-sub{font-size:12px;margin-top:7px;font-weight:600}.stats{display:grid;gap:10px;margin-bottom:20px}.stat{background:#f8f9fb;border-radius:10px;padding:12px;text-align:center;border:1px solid #e8eaf0}.stat-val{font-size:16px;font-weight:900;color:#1a1a2e}.stat-label{font-size:10px;color:#8890a4;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}.info-row{display:flex;gap:8px;margin-bottom:8px;font-size:12px}.info-label{font-weight:700;color:#475569;min-width:90px}.info-val{color:#64748b}.footer{background:#f8f9fb;border-top:1px solid #eee;padding:12px 28px;display:flex;justify-content:space-between;align-items:center}.footer-logo{font-size:12px;font-weight:800;color:#e67e22}.footer-info{font-size:10px;color:#aaa}@media print{body{padding:0;background:#fff}.page{box-shadow:none;border-radius:0}}`;

  // ── PDF RELATÓRIO FINANCEIRO ───────────────────────────────────────────────
  function gerarPDFGeral(){
    if(!rel) return;
    const periodo=rel.ini||rel.fim?`${rel.ini?fmtDate(rel.ini):"início"} a ${rel.fim?fmtDate(rel.fim):"hoje"}`:"Todo o período";
    const corLucro=rel.liq>=0?"#16a34a":"#dc2626";
    const bgLucro=rel.liq>=0?"linear-gradient(135deg,#f0fdf4,#dcfce7)":"linear-gradient(135deg,#fef2f2,#fee2e2)";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>TELEMIM — Relatório Financeiro</title><style>${pdfCSS}</style></head><body>
    <div class="page">
      <div class="header">
        <div class="header-top">
          <div><div class="logo">🚛 TELEMIM</div><div class="subtitle">Gestão Financeira de Mudanças</div></div>
          <div class="header-meta"><div>CONTRATO: PROMORAR</div><div>Gerado: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}</div></div>
        </div>
        <div style="margin-top:10px;font-size:13px;color:#e67e22;font-weight:700">📅 Período: ${periodo}</div>
      </div>
      <div class="body">
        <div class="lucro-box" style="background:${bgLucro};border:2px solid ${corLucro}">
          <div class="lucro-label" style="color:${corLucro}">💰 LUCRO LÍQUIDO</div>
          <div class="lucro-val" style="color:${corLucro}">R$ ${rel.liq.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
          <div class="lucro-sub" style="color:${corLucro}">Margem de Lucro: ${rel.marg.toFixed(1)}%</div>
        </div>
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="stat-val">${rel.lista.length}</div><div class="stat-label">Mudanças</div></div>
          <div class="stat"><div class="stat-val">${rel.m3} m³</div><div class="stat-label">Total Medido</div></div>
          <div class="stat"><div class="stat-val">${rel.vd} dia${rel.vd!==1?"s":""}</div><div class="stat-label">Com Van</div></div>
        </div>
        <div class="section"><div class="section-title title-fat">💵 Faturamento</div><table>
          <tr><td>📐 Medição (${rel.m3} m³ × R$ 150,00)</td><td class="green">R$ ${rel.fatM.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr><td>🚐 Van (${rel.vd} dia${rel.vd!==1?"s":""} × R$ 1.000,00)</td><td class="green">R$ ${rel.fatV.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr class="total"><td>Faturamento Bruto</td><td class="orange">R$ ${rel.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-imp">🏛️ Imposto (16%)</div><table>
          <tr><td>Dedução sobre Faturamento Bruto</td><td class="red">- R$ ${rel.imp.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-cust">🔧 Discriminação dos Custos</div><table>
          ${rel.vd>0?`<tr><td>🚐 Van (${rel.vd} dia${rel.vd!==1?"s":""} × R$ 400,00)</td><td class="red">- R$ ${rel.cV.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>`:""}
          <tr><td>🚚 Caminhão (${rel.lista.length} × R$ 350,00)</td><td class="red">- R$ ${rel.cC.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr><td>👷 Ajudantes (${rel.nAj} × R$ 80,00)</td><td class="red">- R$ ${rel.cA.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          ${rel.cAlm>0?`<tr><td>🍽️ Almoço</td><td class="red">- R$ ${rel.cAlm.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>`:""}
          <tr class="total"><td>Total de Custos</td><td class="blue">- R$ ${rel.custos.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-res">📊 Resumo Final</div><table>
          <tr><td>Faturamento Bruto</td><td class="orange">R$ ${rel.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr><td>(-) Imposto 16%</td><td class="red">- R$ ${rel.imp.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr><td>(-) Custos Operacionais</td><td class="blue">- R$ ${rel.custos.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr class="total"><td>(=) Lucro Líquido</td><td style="color:${corLucro}">R$ ${rel.liq.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-mud">📋 Mudanças do Período (${rel.lista.length})</div><table>
          <tr class="hrow"><td>Beneficiário</td><td>Selo</td><td>Comunidade</td><td>Data</td><td>m³</td></tr>
          ${rel.lista.map((m,i)=>`<tr style="background:${i%2===0?"#fff":"#fafafa"}"><td>${m.nome}</td><td>${m.selo||"—"}</td><td>${m.comunidade||"—"}</td><td>${fmtDate(m.data)}</td><td>${m.medicao}</td></tr>`).join("")}
        </table></div>
      </div>
      <div class="footer"><div class="footer-logo">🚛 TELEMIM</div><div class="footer-info">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div></div>
    </div></body></html>`;
    abrirPDF(html, `TELEMIM-Relatorio-${periodo.replace(/\//g,"-")}`);
  }

  // ── PDF SEMANA ─────────────────────────────────────────────────────────────
  function gerarPDFMudancas(){
    if(!rel) return;
    const periodo=rel.ini||rel.fim?`${rel.ini?fmtDate(rel.ini):"início"} a ${rel.fim?fmtDate(rel.fim):"hoje"}`:"Todo o período";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>TELEMIM — Mudanças Realizadas</title><style>${pdfCSS}</style></head><body>
    <div class="page">
      <div class="header"><div class="header-top"><div><div class="logo">🚛 TELEMIM</div><div class="subtitle">Mudanças Realizadas</div></div><div class="header-meta"><div>CONTRATO: PROMORAR</div><div>Gerado: ${new Date().toLocaleDateString("pt-BR")}</div></div></div><div style="margin-top:8px;font-size:12px;color:#e67e22;font-weight:700">📅 ${periodo}</div></div>
      <div class="body">
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="stat-val">${rel.lista.length}</div><div class="stat-label">Mudanças</div></div>
          <div class="stat"><div class="stat-val">${rel.m3} m³</div><div class="stat-label">Total m³</div></div>
          <div class="stat"><div class="stat-val">${rel.vd}</div><div class="stat-label">Dias c/ Van</div></div>
        </div>
        <div class="section"><div class="section-title title-mud">📋 Relação de Mudanças (${rel.lista.length})</div>
        <table><tr class="hrow"><td>#</td><td>Beneficiário</td><td>Selo</td><td>Comunidade</td><td>Data</td><td>m³</td><td>Van</td></tr>
        ${rel.lista.map((m,i)=>`<tr style="background:${i%2===0?"#fff":"#fafafa"}"><td>${i+1}</td><td>${m.nome}</td><td>${m.selo||"—"}</td><td>${m.comunidade||"—"}</td><td>${fmtDate(m.data)}</td><td class="green">${m.medicao}</td><td>${m.van?"✅":"—"}</td></tr>`).join("")}
        <tr class="total"><td colspan="5">TOTAL</td><td class="green">${rel.m3} m³</td><td>${rel.vd} dias</td></tr></table></div>
      </div>
      <div class="footer"><div class="footer-logo">🚛 TELEMIM</div><div class="footer-info">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div></div>
    </div></body></html>`;
    abrirPDF(html,`TELEMIM-Mudancas-${periodo.replace(/\//g,"-")}`);
  }

    function gerarPDFSemana(sw,sr){
    const corLucro=sr.liq>=0?"#16a34a":"#dc2626";
    const bgLucro=sr.liq>=0?"linear-gradient(135deg,#f0fdf4,#dcfce7)":"linear-gradient(135deg,#fef2f2,#fee2e2)";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>TELEMIM — Relatório Semanal ${sw.label}</title><style>${pdfCSS}</style></head><body>
    <div class="page">
      <div class="header">
        <div class="header-top">
          <div><div class="logo">🚛 TELEMIM</div><div class="subtitle">Relatório Semanal</div></div>
          <div class="header-meta"><div>CONTRATO: PROMORAR</div><div>Gerado: ${new Date().toLocaleDateString("pt-BR")}</div></div>
        </div>
        <div style="margin-top:10px;font-size:14px;color:#3498db;font-weight:800">📆 Semana: ${sw.label}</div>
      </div>
      <div class="body">
        <div class="lucro-box" style="background:${bgLucro};border:2px solid ${corLucro}">
          <div class="lucro-label" style="color:${corLucro}">💰 LUCRO DA SEMANA</div>
          <div class="lucro-val" style="color:${corLucro}">R$ ${sr.liq.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
          <div class="lucro-sub" style="color:${corLucro}">Margem: ${sr.marg.toFixed(1)}%</div>
        </div>
        <div class="stats" style="grid-template-columns:repeat(4,1fr)">
          <div class="stat"><div class="stat-val">${sw.items.length}</div><div class="stat-label">Mudanças</div></div>
          <div class="stat"><div class="stat-val">${sr.m3} m³</div><div class="stat-label">Medido</div></div>
          <div class="stat"><div class="stat-val">${sr.vd}</div><div class="stat-label">Dias Van</div></div>
          <div class="stat"><div class="stat-val orange">R$ ${sr.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div><div class="stat-label">Fat. Bruto</div></div>
        </div>
        <div class="section"><div class="section-title title-fat">💵 Faturamento</div><table>
          <tr><td>Medição (${sr.m3} m³ × R$ 150,00)</td><td class="green">R$ ${sr.fatM.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr><td>Van (${sr.vd} dia${sr.vd!==1?"s":""} × R$ 1.000,00)</td><td class="green">R$ ${sr.fatV.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr class="total"><td>Faturamento Bruto</td><td class="orange">R$ ${sr.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-imp">🏛️ Imposto (16%)</div><table>
          <tr><td>Dedução sobre Faturamento Bruto</td><td class="red">- R$ ${sr.imp.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-cust">🔧 Discriminação dos Custos</div><table>
          ${sr.vd>0?`<tr><td>🚐 Van (${sr.vd} dia${sr.vd!==1?"s":""} × R$ 400,00)</td><td class="red">- R$ ${sr.cV.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>`:""}
          <tr><td>🚚 Caminhão (${sw.items.length} × R$ 350,00)</td><td class="red">- R$ ${sr.cC.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          <tr><td>👷 Ajudantes (${sr.nAj} × R$ 80,00)</td><td class="red">- R$ ${sr.cA.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
          ${sr.cAlm>0?`<tr><td>🍽️ Almoço</td><td class="red">- R$ ${sr.cAlm.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>`:""}
          <tr class="total"><td>Total de Custos</td><td class="blue">- R$ ${sr.custos.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
        </table></div>
        <div class="section"><div class="section-title title-mud">📋 Mudanças da Semana (${sw.items.length})</div><table>
          <tr class="hrow"><td>Beneficiário</td><td>Selo</td><td>Data</td><td>m³</td><td>Van</td></tr>
          ${sw.items.map((m,i)=>`<tr style="background:${i%2===0?"#fff":"#fafafa"}"><td>${m.nome}</td><td>${m.selo||"—"}</td><td>${fmtDate(m.data)}</td><td>${m.medicao}</td><td>${m.van?"✅":"—"}</td></tr>`).join("")}
        </table></div>
      </div>
      <div class="footer"><div class="footer-logo">🚛 TELEMIM</div><div class="footer-info">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div></div>
    </div></body></html>`;
    abrirPDF(html, `TELEMIM-Semana-${sw.label.replace(/[–\/]/g,"-")}`);
  }

  // ── PDF MUDANÇA INDIVIDUAL ─────────────────────────────────────────────────
  function gerarPDFMudanca(m){
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>TELEMIM — Mudança ${m.nome}</title><style>${pdfCSS}</style></head><body>
    <div class="page">
      <div class="header">
        <div class="header-top">
          <div><div class="logo">🚛 TELEMIM</div><div class="subtitle">Comprovante de Mudança Realizada</div></div>
          <div class="header-meta"><div>CONTRATO: PROMORAR</div><div>Gerado: ${new Date().toLocaleDateString("pt-BR")}</div></div>
        </div>
      </div>
      <div class="body">
        <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:18px;text-align:center;margin-bottom:20px">
          <div style="font-size:10px;font-weight:700;color:#16a34a;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">✅ MUDANÇA REALIZADA</div>
          <div style="font-size:24px;font-weight:900;color:#1e293b">${m.nome}</div>
          <div style="font-size:13px;color:#64748b;margin-top:5px">📅 ${fmtDate(m.data)} · 🏷️ ${m.selo||"—"}</div>
        </div>
        <div class="section"><div class="section-title title-info">📋 Dados da Mudança</div>
          <div style="padding:4px 0">
            <div class="info-row"><span class="info-label">👤 Beneficiário</span><span class="info-val">${m.nome}</span></div>
            <div class="info-row"><span class="info-label">🏷️ Selo</span><span class="info-val">${m.selo||"—"}</span></div>
            <div class="info-row"><span class="info-label">📍 Comunidade</span><span class="info-val">${m.comunidade||"—"}</span></div>
            <div class="info-row"><span class="info-label">📅 Data</span><span class="info-val">${fmtDate(m.data)}</span></div>
            <div class="info-row"><span class="info-label">📦 Saída</span><span class="info-val">${m.origem||"—"}</span></div>
            <div class="info-row"><span class="info-label">🏠 Chegada</span><span class="info-val">${m.destino||"—"}</span></div>
            <div class="info-row"><span class="info-label">📐 Medição</span><span class="info-val" style="font-weight:800;color:#16a34a">${m.medicao} m³</span></div>
            <div class="info-row"><span class="info-label">🚐 Van</span><span class="info-val">${m.van?"✅ Utilizada":"❌ Não utilizada"}</span></div>
          </div>
        </div>
      </div>
      <div class="footer"><div class="footer-logo">🚛 TELEMIM</div><div class="footer-info">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div></div>
    </div></body></html>`;
    abrirPDF(html, `TELEMIM-Mudanca-${m.nome.split(" ")[0]}-${fmtDate(m.data).replace(/\//g,"-")}`);
  }

  // ── PDF AGENDAMENTO INDIVIDUAL ─────────────────────────────────────────────
  function gerarPDFAgendamento(a){
    const veiculos=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"—";
    const sc={confirmado:"#16a34a",pendente:"#e67e22",realizado:"#64748b"};
    const sb={confirmado:"#f0fdf4",pendente:"#fff7ed",realizado:"#f8fafc"};
    const cor=sc[a.status]||"#64748b";
    const bg=sb[a.status]||"#f8fafc";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>TELEMIM — Agendamento ${a.nome}</title><style>${pdfCSS}</style></head><body>
    <div class="page">
      <div class="header">
        <div class="header-top">
          <div><div class="logo">🚛 TELEMIM</div><div class="subtitle">Comprovante de Agendamento</div></div>
          <div class="header-meta"><div>CONTRATO: PROMORAR</div><div>Gerado: ${new Date().toLocaleDateString("pt-BR")}</div></div>
        </div>
      </div>
      <div class="body">
        <div style="background:${bg};border:2px solid ${cor};border-radius:12px;padding:18px;text-align:center;margin-bottom:20px">
          <div style="font-size:10px;font-weight:700;color:${cor};letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">📅 MUDANÇA AGENDADA</div>
          <div style="font-size:24px;font-weight:900;color:#1e293b">${a.nome}</div>
          <div style="font-size:13px;color:#64748b;margin-top:5px">📅 ${fmtDate(a.data)}${a.horario?` ⏰ ${a.horario}h`:""}</div>
          <div style="margin-top:8px;display:inline-block;padding:4px 14px;border-radius:20px;background:${cor}22;color:${cor};font-size:12px;font-weight:700">${a.status==="confirmado"?"✅ Confirmado":a.status==="pendente"?"⏳ Pendente":"✔ Realizado"}</div>
        </div>
        <div class="section"><div class="section-title title-ag">📋 Dados do Agendamento</div>
          <div style="padding:4px 0">
            <div class="info-row"><span class="info-label">👤 Beneficiário</span><span class="info-val">${a.nome}</span></div>
            <div class="info-row"><span class="info-label">🏷️ Selo</span><span class="info-val">${a.selo||"—"}</span></div>
            <div class="info-row"><span class="info-label">📍 Comunidade</span><span class="info-val">${a.comunidade||"—"}</span></div>
            <div class="info-row"><span class="info-label">📅 Data</span><span class="info-val" style="font-weight:800;color:#2563eb">${fmtDate(a.data)}</span></div>
            ${a.horario?`<div class="info-row"><span class="info-label">⏰ Horário</span><span class="info-val" style="font-weight:800;color:#16a34a">${a.horario}h</span></div>`:""}
            <div class="info-row"><span class="info-label">📦 Saída</span><span class="info-val">${a.origem||"—"}</span></div>
            <div class="info-row"><span class="info-label">🏠 Chegada</span><span class="info-val">${a.destino||"—"}</span></div>
            <div class="info-row"><span class="info-label">🚗 Veículos</span><span class="info-val" style="font-weight:800">${veiculos}</span></div>
            ${a.contato?`<div class="info-row"><span class="info-label">📞 Contato</span><span class="info-val">${a.contato}</span></div>`:""}
            ${a.medicao?`<div class="info-row"><span class="info-label">📐 Medição</span><span class="info-val" style="font-weight:800;color:#16a34a">${a.medicao} m³</span></div>`:""}
            ${a.ajudantes?`<div class="info-row"><span class="info-label">👷 Ajudantes</span><span class="info-val">${a.ajudantes}</span></div>`:""}
          </div>
        </div>
      </div>
      <div class="footer"><div class="footer-logo">🚛 TELEMIM</div><div class="footer-info">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</div></div>
    </div></body></html>`;
    abrirPDF(html, `TELEMIM-Agendamento-${a.nome.split(" ")[0]}-${fmtDate(a.data).replace(/\//g,"-")}`);
  }

  // ── WHATSAPP ───────────────────────────────────────────────────────────────
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
    return okS&&(!filtroMes||mx.data.slice(0,7)===filtroMes);
  }).sort((a,b)=>b.data.localeCompare(a.data));

  var _d0=new Date();_d0.setDate(1);
  var _d1=new Date();_d1.setDate(1);_d1.setMonth(_d1.getMonth()-1);
  var _d2=new Date();_d2.setDate(1);_d2.setMonth(_d2.getMonth()-2);
  var _nms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var _m0={v:_d0.toISOString().slice(0,7),l:_nms[_d0.getMonth()]+'/'+String(_d0.getFullYear()).slice(2)};
  var _m1={v:_d1.toISOString().slice(0,7),l:_nms[_d1.getMonth()]+'/'+String(_d1.getFullYear()).slice(2)};
  var _m2={v:_d2.toISOString().slice(0,7),l:_nms[_d2.getMonth()]+'/'+String(_d2.getFullYear()).slice(2)};
  const agendaOrdenada=[...agenda].filter(a=>a.status!=='concluida').sort((a,b)=>a.data.localeCompare(b.data)||(a.horario||"").localeCompare(b.horario||""));
  const hoje=new Date().toISOString().split("T")[0];
  const amanha=new Date(new Date().getTime()+86400000).toISOString().split("T")[0];
  const proximas=agendaOrdenada.filter(a=>a.data>=hoje);
  const passadas=agendaOrdenada.filter(a=>a.data<hoje);
  const mudancasHoje=agendaOrdenada.filter(a=>a.data===hoje&&a.status!=="realizado");
  const mudancasAmanha=agendaOrdenada.filter(a=>a.data===amanha&&a.status!=="realizado");

  const statusColor={confirmado:COLORS.green,pendente:COLORS.accent,realizado:COLORS.muted};
  const statusLabel={confirmado:"✅ Confirmado",pendente:"⏳ Pendente",realizado:"✔ Realizado"};

  const TABS=[
    {id:"dashboard",label:"📈 Dashboard"},
    {id:"lista",label:"📋 Registros"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"novo",label:"➕ Nova"},
    ...(isAdmin?[{id:"financeiro",label:"💰 Financeiro"},{id:"usuarios",label:"👥 Usuários"}]:[]),
    
    ...(isAdmin?[{id:"usuarios",label:"👥 Usuários"}]:[]),
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
      <button onClick={async function(){const ok=await verificarBiometria();if(ok)setBioLock(false);else alert('Biometria falhou. Tente novamente.');}} style={{width:220,background:'linear-gradient(135deg,#ea580c,#dc2626)',color:'#fff',border:'none',borderRadius:50,padding:'16px 0',fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:1,boxShadow:'0 4px 20px rgba(234,88,12,0.4)',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:16}}>
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
                  {a.inicio_em&&(!a.termino_em
                    ?<button onClick={()=>marcarTempo('termino',a,'agenda')} style={{flex:1,background:"#fee2e2",border:"1.5px solid #dc2626",borderRadius:10,padding:"7px 0",fontSize:12,fontWeight:800,color:"#dc2626",cursor:"pointer"}}>⏹ Finalizar</button>
                    :<span style={{flex:1,background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"7px 10px",fontSize:12,fontWeight:700,color:"#dc2626",textAlign:"center"}}>⏹ {fmtTempo(a.termino_em)}</span>
                  )}
                  {a.inicio_em&&a.termino_em&&<span style={{fontSize:11,color:"#64748b",fontWeight:700,background:"#f1f5f9",borderRadius:8,padding:"4px 8px"}}>🕒 {Math.round((new Date(a.termino_em)-new Date(a.inicio_em))/60000)}min</span>}
                </div>}
                <button onClick={()=>compartilharWhatsApp(a,"hoje")} style={{background:COLORS.green,border:"none",color:"#fff",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:15,flexShrink:0,fontWeight:700}}>📲</button>
              </div>
            ))}
          </div>
        )}
        {mudancasAmanha.length>0&&(
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

        {/* Tabs */}
        <div style={{marginTop:14,marginBottom:13}}>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {TABS.slice(0,3).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            {TABS.slice(3).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ══ DASHBOARD ══ */}
        {tab==="inicio"&&(
        <div style={{paddingBottom:80}}>{tab==="financeiro"&&<div style={{padding:"8px 12px 12px",background:"#f8fafc"}}><button onClick={function(){window.print();}} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#1e40af,#1e293b)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📄 Exportar PDF</button></div>}
          {(function(){var hj=new Date();var anoMes=(function(){if(periodoFin==='mes_ant'){var dm=new Date();dm.setDate(1);dm.setMonth(dm.getMonth()-1);return dm.toISOString().slice(0,7);}return hj.toISOString().slice(0,7);})();var mudMes=(mudancas||[]).filter(function(m){return m.data&&m.data.slice(0,7)===anoMes;});var diasU=[...new Set(mudMes.map(function(m){return m.data;}))].sort(function(a,b){return b.localeCompare(a);});var totMes=mudMes.length;return(<div style={{padding:'16px 12px',background:'#f8fafc'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div style={{fontWeight:800,fontSize:15,color:'#1e293b'}}>📋 Mudanças do Mês</div><span style={{background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'4px 12px',fontSize:13,fontWeight:700}}>{totMes} total</span></div>{diasU.length===0&&<div style={{textAlign:'center',color:'#94a3b8',padding:32,fontSize:13}}>Nenhuma mudança este mês</div>}{diasU.map(function(dia){var mDia=mudMes.filter(function(m){return m.data===dia;});var df=dia.slice(8)+'/'+dia.slice(5,7)+'/'+dia.slice(0,4);var isHoje=dia===hj.toISOString().slice(0,10);return(<div key={dia} style={{background:'#fff',borderRadius:12,padding:'14px 16px',marginBottom:10,boxShadow:'0 1px 6px rgba(0,0,0,0.06)',border:isHoje?'1.5px solid #3b82f6':'1px solid #e2e8f0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><div style={{fontWeight:700,fontSize:14,color:isHoje?'#1e40af':'#1e293b'}}>{df}{isHoje&&<span style={{marginLeft:8,background:'#dbeafe',color:'#1e40af',borderRadius:6,padding:'1px 7px',fontSize:10,fontWeight:700}}>HOJE</span>}</div><span style={{background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:700}}>{mDia.length} mud.</span></div>{mDia.map(function(m,i){return(<div key={i} style={{display:'flex',alignItems:'center',padding:'7px 0',borderTop:i>0?'1px solid #f1f5f9':'none'}}><div style={{width:7,height:7,borderRadius:'50%',background:m.status==='concluida'?'#047857':m.status==='cancelada'?'#dc2626':'#f59e0b',marginRight:10,flexShrink:0}}></div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#334155'}}>{m.nome}</div><div style={{fontSize:11,color:'#94a3b8'}}>{m.comunidade||''}{m.medicao>0?' · '+m.medicao+'m³':''}</div></div><div style={{fontSize:11,fontWeight:700,color:m.status==='concluida'?'#047857':m.status==='cancelada'?'#dc2626':'#d97706'}}>{m.status==='concluida'?'✅':m.status==='cancelada'?'❌':'⏳'}</div></div>);})}</div>);})}</div>);})()} 
        </div>
      )}
        {tab==="lista"&&(
          <div>
            <div style={{display:'flex',flexWrap:'wrap',gap:0,marginBottom:8}}><button onClick={()=>setFiltroMes('')} style={filtroMes===''?{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #1e40af','background':'#1e40af','color':'#fff','fontSize':'12px','fontWeight':700,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}:{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #e2e8f0','background':'#fff','color':'#475569','fontSize':'12px','fontWeight':400,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}}>Todos</button><button onClick={()=>setFiltroMes(_m0.v)} style={filtroMes===_m0.v?{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #1e40af','background':'#1e40af','color':'#fff','fontSize':'12px','fontWeight':700,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}:{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #e2e8f0','background':'#fff','color':'#475569','fontSize':'12px','fontWeight':400,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}}>{_m0.l}</button><button onClick={()=>setFiltroMes(_m1.v)} style={filtroMes===_m1.v?{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #1e40af','background':'#1e40af','color':'#fff','fontSize':'12px','fontWeight':700,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}:{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #e2e8f0','background':'#fff','color':'#475569','fontSize':'12px','fontWeight':400,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}}>{_m1.l}</button><button onClick={()=>setFiltroMes(_m2.v)} style={filtroMes===_m2.v?{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #1e40af','background':'#1e40af','color':'#fff','fontSize':'12px','fontWeight':700,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}:{'padding':'4px 12px','borderRadius':'16px','border':'1.5px solid #e2e8f0','background':'#fff','color':'#475569','fontSize':'12px','fontWeight':400,'cursor':'pointer','marginRight':'4px','marginBottom':'4px'}}>{_m2.l}</button></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar nome, selo ou comunidade..."
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
                    <button onClick={()=>compartilharMudanca(m)} style={btnGreen}>📲</button>
                    <button onClick={()=>gerarPDFMudanca(m)} style={{...btnRed,background:"#fff1f0"}}>📄</button>
                    <button onClick={()=>setEditMud({...m})} style={btnBlue}>✏️</button>
                    <button onClick={()=>handleDelMud(m.id)} style={btnRed}>✕</button>
                  </div>
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
                    const lista=agendaOrdenada.filter(a=>a.data===hoje);
                    const linhas=lista.map(a=>{const v=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ");return `👤 *${a.nome}*\n🏷️ Selo: ${a.selo||"—"} · ⏰ ${a.horario||"—"}h\n📍 ${a.comunidade||"—"}\n📦 Saída: ${a.origem||"—"}\n🏠 Chegada: ${a.destino||"—"}\n🚗 Veículos: ${v||"—"}${a.contato?`\n📞 ${a.contato}`:""}${a.medicao?`\n📐 ${a.medicao} m³`:""}`;});
                    const txt=`🚛 *TELEMIM — MUDANÇAS DO DIA*\n📅 *${new Date().toLocaleDateString("pt-BR")}*\n━━━━━━━━━━━━━━━━━\n${linhas.join("\n\n━━━━━━━━━━━━━━━━━\n")}\n\n━━━━━━━━━━━━━━━━━\n_Total: ${lista.length} mudança${lista.length!==1?"s":""} · TELEMIM_`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`,"_blank");
                  }} style={{background:"#dcfce7",border:"1.5px solid #16a34a",color:"#16a34a",borderRadius:10,padding:"7px 12px",fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📲 Dia ({mudancasHoje.length})</button>
                  <button onClick={()=>{
                    const lista=agendaOrdenada.filter(a=>a.data===hoje);
                    const linhas=lista.map((a,i)=>{const v=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join("+");return (i+1)+". *"+a.nome+"*\n🏷️ "+a.selo+" · ⏰ "+(a.horario||"—")+"h\n📍 "+(a.comunidade||"—")+"\n📦 "+(a.origem||"—")+"\n🏠 "+(a.destino||"—")+"\n🚗 "+(v||"—")+(a.contato?"\n📞 "+a.contato:"")+(a.medicao?"\n📐 "+a.medicao+" m³":"");});
                    const tot=lista.length, nV=lista.filter(x=>x.van).length, nC=lista.filter(x=>x.caminhao).length;
                    const txt="📋 *RELATÓRIO DO DIA — TELEMIM*\n📅 *"+new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})+"*\n🚛 CONTRATO: PROMORAR\n━━━━━━━━━━━━━━━━━\n"+linhas.join("\n\n━━━━━━━━━━━━━━━━━\n")+"\n\n━━━━━━━━━━━━━━━━━\n📊 *Total: "+tot+" mudança"+(tot!==1?"s":"")+" hoje*\n🚐 "+nV+" c/ van · 🚚 "+nC+" c/ caminhão\n_TELEMIM_";
                    window.open("https://wa.me/?text="+encodeURIComponent(txt),"_blank");
                  }} style={{background:"#eff6ff",border:"1.5px solid #2563eb",color:"#2563eb",borderRadius:10,padding:"7px 12px",fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📊 Relatório Dia</button>
                  </>
                )}
                <button onClick={()=>{
                  const hj=new Date().toISOString().split("T")[0];
                  const diasFut=[...new Set(agendaOrdenada.filter(a=>a.data>=hj&&a.status!=="realizado").map(m=>m.data))].sort();
                  if(!diasFut.length){alert("Nenhuma mudança agendada!");return;}
                  const proxDia=diasFut[0];
                  const lista=agendaOrdenada.filter(a=>a.data===proxDia&&a.status!=="realizado");
                  const nDia=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][new Date(proxDia+"T12:00:00").getDay()];
                  const linhas=lista.map((a,i)=>{const v=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join("+");return (i+1)+". *"+a.nome+"*\n🏷️ "+a.selo+" · ⏰ "+(a.horario||"—")+"h\n📍 "+(a.comunidade||"—")+"\n📦 "+(a.origem||"—")+"\n🏠 "+(a.destino||"—")+"\n🚗 "+(v||"—")+(a.contato?"\n📞 "+a.contato:"")+(a.medicao?"\n📐 "+a.medicao+" m³":"");});
                  const isHoje=proxDia===hj;
                  const dtFmt=new Date(proxDia+"T12:00:00").toLocaleDateString("pt-BR");
                  const txt="📋 *RELATÓRIO DE MUDANÇAS*\n📅 "+nDia+", "+dtFmt+(isHoje?" (HOJE)":"")+"\n🚛 CONTRATO: PROMORAR\n━━━━━━━━━━━━━━━━━\n"+linhas.join("\n\n━━━━━━━━━━━━━━━━━\n")+"\n\n━━━━━━━━━━━━━━━━━\n📊 *"+lista.length+" mudança"+(lista.length!==1?"s":"")+" · "+nDia+"*\n🚐 "+lista.filter(a=>a.van).length+" c/ van  🚚 "+lista.filter(a=>a.caminhao).length+" c/ caminhão\n_TELEMIM · PROMORAR_";
                  window.open("https://wa.me/?text="+encodeURIComponent(txt),"_blank");
                }} style={{background:"#f0fdf4",border:"1.5px solid #16a34a",color:"#16a34a",borderRadius:10,padding:"7px 12px",fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📊 Relatório Mudança do Dia</button>
                <button onClick={()=>setTab("novaAgenda")} style={{background:COLORS.purple,color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontWeight:800,fontSize:12,cursor:"pointer",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>+ Agendar</button>
              </div>
            </div>
            {proximas.length>0&&(
              <div style={{marginBottom:16}}>
                {proximas.map(a=>(
                  <Card key={a.id} style={{marginBottom:9,padding:"14px 16px",border:`1.5px solid ${statusColor[a.status]||COLORS.cardBorder}33`}}>
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
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                          <div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>📐 Medição (m³)</label>
                            <input type="number" placeholder="Ex: 27" value={a.medicao||""} onChange={e=>updateAgField(a.id,"medicao",e.target.value)}
                              style={{width:"100%",background:"#fff",border:`1.5px solid ${a.medicao?COLORS.green:COLORS.cardBorder}`,borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                              onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
                              onBlur={e=>e.target.style.border=`1.5px solid ${a.medicao?COLORS.green:COLORS.cardBorder}`}/>
                          </div>
                          <div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>👷 Ajudantes</label>
                            <input type="number" placeholder="Ex: 3" value={a.ajudantes||""} onChange={e=>updateAgField(a.id,"ajudantes",e.target.value)}
                              style={{width:"100%",background:"#fff",border:`1.5px solid ${a.ajudantes?COLORS.green:COLORS.cardBorder}`,borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                              onFocus={e=>e.target.style.border=`1.5px solid ${COLORS.accent}`}
                              onBlur={e=>e.target.style.border=`1.5px solid ${a.ajudantes?COLORS.green:COLORS.cardBorder}`}/>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                          <button onClick={()=>toggleStatus(a.id)} style={{background:statusColor[a.status]+"18",border:`1.5px solid ${statusColor[a.status]}44`,color:statusColor[a.status],borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{statusLabel[a.status]||"⏳ Pendente"}</button>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {a.medicao&&<Badge color={COLORS.green}>📐 {a.medicao} m³</Badge>}
                            <button onClick={()=>compartilharWhatsApp(a)} style={{...btnGreen,fontSize:14,padding:"6px 10px"}}>📲</button>
                            <button onClick={()=>gerarPDFAgendamento(a)} style={{...btnRed,background:"#fff1f0",fontSize:14,padding:"6px 10px"}}>📄</button>
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:9}}>
                        <button onClick={()=>converterEmMudanca(a)} style={{background:"#f0fdf4",border:"none",color:COLORS.green,borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Converter em mudança">✅</button>
                        <button onClick={()=>setEditAg({...a})} style={btnBlue}>✏️</button>
                        <button onClick={()=>handleDelAg(a.id)} style={btnRed}>✕</button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {agenda.length===0&&<div style={{textAlign:"center",color:COLORS.muted,padding:50,fontSize:14}}>Nenhuma mudança agendada.<br/>Clique em <strong style={{color:COLORS.purple}}>+ Agendar</strong>! 📅</div>}
          </div>
        )}

        {/* ══ NOVA AGENDA ══ */}
        {tab==="novaAgenda"&&(
          <Card>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14,color:COLORS.purple}}>📅 Novo Agendamento</div>
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
            <div style={{fontSize:15,fontWeight:800,marginBottom:14,color:COLORS.accent}}>➕ Nova Mudança Realizada</div>
            <button onClick={()=>{setShowImport(true);setImportText("");}} style={{background:"#eff6ff",border:"1.5px solid "+COLORS.blue,color:COLORS.blue,borderRadius:10,padding:"7px 14px",fontWeight:800,fontSize:12,cursor:"pointer"}}>📥 Importar Solicitação</button>
            <Inp label="Nome" icon="👤" value={form.nome} onChange={v=>setForm(f=>({...f,nome:v}))} placeholder="Nome completo"/>
            <Inp label="Selo" icon="🏷️" value={form.selo} onChange={v=>setForm(f=>({...f,selo:v}))} placeholder="Ex: VT-020-001 A"/>
            <Inp label="Comunidade" icon="📍" value={form.comunidade} onChange={v=>setForm(f=>({...f,comunidade:v}))} placeholder="Nome da comunidade"/>
            <Inp label="Data" icon="📅" type="date" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))}/>
            <Inp label="Origem" icon="📦" value={form.origem} onChange={v=>setForm(f=>({...f,origem:v}))} placeholder="Endereço de origem"/>
            <Inp label="Destino" icon="🏠" value={form.destino} onChange={v=>setForm(f=>({...f,destino:v}))} placeholder="Endereço de destino"/>
            <Inp label="Medição (m³)" icon="📐" type="number" value={form.medicao} onChange={v=>setForm(f=>({...f,medicao:v}))} placeholder="Ex: 27"/>
            <Tog label="🚐 Van" value={form.van} onChange={v=>setForm(f=>({...f,van:v}))}/>
            <button onClick={handleAddMud} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:COLORS.accent,color:"#fff",fontWeight:900,fontSize:15,cursor:"pointer",boxShadow:"0 2px 8px rgba(230,126,34,0.3)"}}>
              {flash||"💾 Salvar Mudança"}
            </button>
          </Card>
        )}

        {/* ══ RELATÓRIO ══ */}
        {tab==="financeiro"&&isAdmin&&(
        <div style={{paddingBottom:80}}>
          <div style={{display:'flex',gap:6,padding:'12px 12px 0',background:'#f8fafc'}}>{[{v:'semana',l:'Semana'},{v:'mes_atual',l:'Mês Atual'},{v:'mes_ant',l:'Mês Anterior'}].map(function(p){return(<button key={p.v} onClick={()=>setPeriodoFin(p.v)} style={{flex:1,padding:'8px 2px',borderRadius:10,border:'none',background:periodoFin===p.v?'#1e40af':'#e2e8f0',color:periodoFin===p.v?'#fff':'#475569',fontSize:11,fontWeight:periodoFin===p.v?700:500,cursor:'pointer'}}>{p.l}</button>);})}</div><div style={{background:'linear-gradient(135deg,#1e293b,#1e40af)',padding:'20px 16px 24px',marginBottom:-12}}><div style={{fontSize:12,color:'rgba(255,255,255,0.65)',marginBottom:2}}>Painel Financeiro</div><div style={{fontSize:21,fontWeight:800,color:'#fff'}}>{(function(){if(periodoFin==='semana'){var d=new Date();var ds=d.getDay();var s0=new Date(d);s0.setDate(d.getDate()-ds+(ds===0?-6:1));var s1=new Date(s0);s1.setDate(s0.getDate()+6);var fmt=function(dt){return dt.getDate()+'/'+(dt.getMonth()+1);};return 'Semana: '+fmt(s0)+' a '+fmt(s1)+'/'+s1.getFullYear();}if(periodoFin==='mes_ant'){var dm=new Date();dm.setDate(1);dm.setMonth(dm.getMonth()-1);return dm.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^\w/,function(s){return s.toUpperCase();});}return new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^\w/,function(s){return s.toUpperCase();});})()}</div></div>
          {(function(){var hj=new Date();var anoMes=(periodoFin==='mes_ant'?(function(){var _dm=new Date();_dm.setDate(1);_dm.setMonth(_dm.getMonth()-1);return _dm.toISOString().slice(0,7);})():hj.toISOString().slice(0,7));var diasMes=(mudancas||[]).filter(function(m){return m.data&&m.data.slice(0,7)===anoMes;});var diasU=[...new Set(diasMes.map(function(m){return m.data;}))];var totM3=diasMes.reduce(function(s,m){return s+(parseFloat(m.medicao)||0);},0);var brMes=diasU.length*RULES.van1a+totM3*RULES.medicaoPorM3;var impMes=brMes*RULES.imposto;var lqMes=brMes-impMes;var cstMes=custosDiarios.filter(function(cd){return cd.data&&cd.data.slice(0,7)===anoMes;});var cvMes=diasU.length*RULES.vanCusto;var cajMes=cstMes.reduce(function(s,cd){var n=diasMes.filter(function(m){return m.data===cd.data;}).length;return s+(cd.ajudantes>0?(RULES.aj1a+(n>0?n-1:0)*RULES.ajAdd)*(cd.ajudantes):0);},0);var calmMes=cstMes.reduce(function(s,cd){return s+(parseFloat(cd.custo_almoco)||0);},0);var ctMes=cvMes+cajMes+calmMes;var luMes=lqMes-ctMes;var mg=brMes>0?((luMes/brMes)*100).toFixed(1):'0.0';var fR=function(v){return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});};var fN=function(v){return 'R$'+Math.round(v).toLocaleString('pt-BR');};return(<>{tab==="financeiro"&&periodoFin!=="semana"&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'20px 12px 10px',background:'#f8fafc'}}>{[{l:'Fat. Bruto',v:fR(brMes),ic:'💰',cor:'#1e40af',bg:'#eff6ff'},{l:'Rec. Líquida',v:fR(lqMes),ic:'✅',cor:'#047857',bg:'#f0fdf4'},{l:'Custo Total',v:fR(ctMes),ic:'💸',cor:'#b45309',bg:'#fffbeb'},{l:'Lucro',v:fR(luMes),ic:'🚀',cor:luMes>=0?'#047857':'#dc2626',bg:luMes>=0?'#f0fdf4':'#fef2f2'}].map(function(k,i){return(<div key={i} style={{background:k.bg,borderRadius:14,padding:'14px 12px',border:'1.5px solid '+k.cor+'33'}}><div style={{fontSize:20,marginBottom:4}}>{k.ic}</div><div style={{fontSize:11,color:'#64748b',marginBottom:2}}>{k.l}</div><div style={{fontSize:15,fontWeight:800,color:k.cor}}>{k.v}</div></div>);})}</div>}<div style={{display:'flex',gap:8,padding:'0 12px 12px',background:'#f8fafc'}}>{tab==="financeiro"&&periodoFin!=="semana"&&<div style={{flex:1,background:'#fff',borderRadius:10,padding:'10px 4px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}><div style={{fontSize:14}}>📅</div><div style={{fontSize:9,color:'#94a3b8',margin:'2px 0'}}>Dias</div><div style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>{diasU.length}</div></div>}{[{l:'Mudanças',v:diasMes.length,ic:'🚛'},{l:'m³',v:totM3.toFixed(0),ic:'📏'},{l:'Margem',v:mg+'%',ic:'📊'}].map(function(k,i){return(<div key={i} style={{flex:1,background:'#fff',borderRadius:10,padding:'10px 4px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}><div style={{fontSize:14}}>{k.ic}</div><div style={{fontSize:9,color:'#94a3b8',margin:'2px 0'}}>{k.l}</div><div style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>{k.v}</div></div>);})}</div><div style={{padding:'0 12px 10px',background:'#f8fafc'}}><div style={{background:'#fff',borderRadius:14,padding:16,boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}><div style={{background:'linear-gradient(135deg,#eff6ff,#dbeafe)',borderRadius:14,padding:'16px 14px',boxShadow:'0 2px 8px rgba(30,64,175,0.10)',border:'1.5px solid #1e40af22'}}>{(function(){var hwk=new Date();var dwk=hwk.getDay();var s0=new Date(hwk);s0.setDate(hwk.getDate()-dwk+(dwk===0?-6:1));var dias0=Array.from({length:7},function(_,ii){var d0=new Date(s0);d0.setDate(s0.getDate()+ii);return d0.toISOString().slice(0,10);});var mSem=mudancas.filter(function(m){return dias0.includes(m.data);});var m3Sem=mSem.reduce(function(s,m){return s+(parseFloat(m.medicao)||0);},0);var brSem=m3Sem*RULES.medicaoPorM3;var vdSem=[...new Set(mSem.map(function(m){return m.data;}))].length;var vanSem=vdSem*(RULES.van1a||0);var fatSem=brSem+vanSem;var impSem=fatSem*(RULES.imposto||0.06);var liqSem=fatSem-impSem;{tab==="financeiro"&&periodoFin!=="semana"&&(function(){var cc=custosDiarios.filter(function(cd){return cd.data&&cd.data.slice(0,7)===anoMes;});var cvT=diasU.length*RULES.vanCusto;var camT=cc.reduce(function(s,cd){var n=diasMes.filter(function(m){return m.data===cd.data;}).length;return s+(n>0?RULES.cam1a+(n-1)*RULES.camAdd:0);},0);var cajT=cc.reduce(function(s,cd){var n=diasMes.filter(function(m){return m.data===cd.data;}).length;return s+(cd.ajudantes>0?(RULES.aj1a+(n>0?n-1:0)*RULES.ajAdd)*cd.ajudantes:0);},0);var almT=cc.reduce(function(s,cd){return s+(parseFloat(cd.custo_almoco)||0);},0);var impT=brMes*(RULES.imposto||0);var ctT=cvT+camT+cajT+almT+impT;var fRx=function(v){return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});};return(<div style={{margin:'0 12px 10px',background:'#fff',borderRadius:14,padding:'14px 16px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}><div style={{fontSize:11,fontWeight:700,color:'#64748b',marginBottom:10,letterSpacing:1,textTransform:'uppercase'}}>💸 Custo Total</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}><div style={{background:'#fef3c7',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:10,color:'#92400e',marginBottom:2}}>🚛 Caminhão</div><div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>{fRx(camT)}</div></div><div style={{background:'#eff6ff',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:10,color:'#1e40af',marginBottom:2}}>🚐 Van</div><div style={{fontSize:13,fontWeight:700,color:'#1e40af'}}>{fRx(cvT)}</div></div><div style={{background:'#f0fdf4',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:10,color:'#065f46',marginBottom:2}}>👷 Ajudantes</div><div style={{fontSize:13,fontWeight:700,color:'#065f46'}}>{fRx(cajT)}</div></div><div style={{background:'#fdf4ff',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:10,color:'#7e22ce',marginBottom:2}}>🍽 Almoço</div><div style={{fontSize:13,fontWeight:700,color:'#7e22ce'}}>{fRx(almT)}</div></div></div><div style={{borderTop:'1px solid #f1f5f9',paddingTop:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontSize:10,color:'#64748b',marginBottom:2}}>📋 Imposto ({Math.round((RULES.imposto||0)*100)}%)</div><div style={{fontSize:12,fontWeight:600,color:'#64748b'}}>{fRx(impT)}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#dc2626',marginBottom:2,fontWeight:600}}>CUSTO TOTAL</div><div style={{fontSize:16,fontWeight:800,color:ctT<=lqMes?'#047857':'#dc2626'}}>{fRx(ctT)}</div></div></div></div>);})()}return(<><div style={{color:'#1e40af',fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:4}}>FATURAMENTO SEMANA</div><div style={{fontSize:26,fontWeight:900,color:'#1e293b'}}>R$ {fatSem.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div><div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}><span style={{fontSize:11,color:'#475569'}}>🚐 R${Math.round(vanSem)}</span><span style={{fontSize:11,color:'#475569'}}>📏 {m3Sem.toFixed(1)}m³</span><span style={{fontSize:11,color:'#94a3b8'}}>Imp: R${Math.round(impSem)}</span></div><div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #bfdbfe'}}><div style={{fontSize:10,color:'#64748b',marginBottom:2}}>Líquido</div><div style={{fontSize:20,fontWeight:900,color:'#1e40af'}}>R$ {liqSem.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div></>);})()}</div><div style={{background:'linear-gradient(135deg,#fff7ed,#ffedd5)',borderRadius:14,padding:'16px 14px',boxShadow:'0 2px 8px rgba(194,65,12,0.10)',border:'1.5px solid #c2410c22'}}>{(function(){var hwk2=new Date();var dwk2=hwk2.getDay();var s02=new Date(hwk2);s02.setDate(hwk2.getDate()-dwk2+(dwk2===0?-6:1));var dias02=Array.from({length:7},function(_,ii){var d02=new Date(s02);d02.setDate(s02.getDate()+ii);return d02.toISOString().slice(0,10);});var cdSem=custosDiarios.filter(function(x){return dias02.includes(x.data);});var mSem2=mudancas.filter(function(m){return dias02.includes(m.data);});var vdSem2=[...new Set(mSem2.map(function(m){return m.data;}))].length;var cCam=cdSem.reduce(function(s,x){var ndc2=mSem2.filter(function(m){return m.data===x.data;}).length;return s+(ndc2>0?RULES.cam1a+(ndc2-1)*RULES.camAdd:0);},0);var cVan2=vdSem2*(RULES.vanCusto||0);var cAj2=cdSem.reduce(function(s,x){var nd=mSem2.filter(function(m){return m.data===x.data;}).length;return s+(x.ajudantes>0?(RULES.aj1a+(nd>1?nd-1:0)*RULES.ajAdd)*x.ajudantes:0);},0);var cAlm2=cdSem.reduce(function(s,x){return s+(parseFloat(x.custo_almoco)||0);},0);var ctSem2=cCam+cVan2+cAj2+cAlm2;return(<></>);})()}</div></div><div style={{fontWeight:800,fontSize:15,color:'#1e293b',marginBottom:12}}>📊 Despesa Semanal</div>{(function(){var hj2=new Date();var dow=hj2.getDay();var sg=new Date(hj2);sg.setDate(hj2.getDate()-dow+(dow===0?-6:1));return Array.from({length:7},function(_,i){var dd=new Date(sg);dd.setDate(sg.getDate()+i);return dd.toISOString().slice(0,10);}).map(function(dia){var mD=(mudancas||[]).filter(function(m){return m.data===dia;});var cD=custosDiarios.find(function(cd){return cd.data===dia;});var nD=mD.length;var brD=nD>0?RULES.van1a:0;brD+=mD.reduce(function(s,m){return s+(parseFloat(m.medicao)||0);},0)*RULES.medicaoPorM3;var lqD=brD*(1-RULES.imposto);var ajD=cD?cD.ajudantes||0:0;var cAD=ajD>0?(RULES.aj1a+(nD>0?nD-1:0)*RULES.ajAdd)*ajD:0;var cuD=nD>0?RULES.vanCusto+cAD+(parseFloat(cD&&cD.custo_almoco)||0):0;var luD=nD>0?lqD-cuD:0;var isHj=dia===hj2.toISOString().slice(0,10);var nm=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(dia+'T12:00:00').getDay()];var df=dia.slice(8)+'/'+dia.slice(5,7);return(<div key={dia} style={{display:'flex',alignItems:'center',padding:'10px 12px',borderRadius:10,marginBottom:6,background:isHj?'#eff6ff':'#f8fafc',border:isHj?'1.5px solid #3b82f6':'1px solid #e2e8f0'}}><div style={{width:42,flexShrink:0}}><div style={{fontSize:10,color:isHj?'#3b82f6':'#94a3b8',fontWeight:700}}>{nm}</div><div style={{fontSize:13,fontWeight:800,color:isHj?'#1e40af':'#475569'}}>{df}</div></div>{nD>0?(<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'space-between'}}><div><span style={{background:'#dbeafe',color:'#1e40af',borderRadius:6,padding:'2px 6px',fontSize:11,fontWeight:700,marginRight:4}}>{nD} mud.</span>{ajD>0&&<span style={{background:'#fef3c7',color:'#92400e',borderRadius:6,padding:'2px 5px',fontSize:10}}>{ajD} aj.</span>}</div><div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:'#047857'}}>R$ {Math.round(luD).toLocaleString('pt-BR')}</div><div style={{fontSize:9,color:'#94a3b8'}}>bruto {fN(brD)}</div></div></div>):(<div style={{flex:1,textAlign:'center',fontSize:11,color:'#cbd5e1'}}>sem mudanças</div>)}</div>);});})()}</div></div><div style={{padding:'0 12px 16px',background:'#f8fafc'}}><div style={{background:'#fff',borderRadius:14,padding:16,boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}><div style={{background:'#fff',borderRadius:14,padding:16,boxShadow:'0 2px 8px rgba(0,0,0,0.06)',marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><div style={{fontWeight:800,fontSize:15,color:'#1e293b'}}>💸 Contas a Pagar</div><button onClick={()=>setShowNovaConta(!showNovaConta)} style={{background:'#1e40af',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>{showNovaConta?'Cancelar':'+ Nova'}</button></div>{showNovaConta&&<div style={{background:'#f8fafc',borderRadius:10,padding:12,marginBottom:12}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}><div><div style={{fontSize:11,color:'#64748b',marginBottom:3}}>Tipo</div><select value={novaContaForm.tipo} onChange={e=>setNovaContaForm(p=>({...p,tipo:e.target.value}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #cbd5e0',fontSize:12}}><option value='caminhao'>🚛 Caminhão</option><option value='van'>🚐 Van</option><option value='ajudante'>👷 Ajudante</option><option value='almoco'>🍽 Almoço</option></select></div><div><div style={{fontSize:11,color:'#64748b',marginBottom:3}}>Valor R$</div><input type='number' value={novaContaForm.valor} onChange={e=>setNovaContaForm(p=>({...p,valor:e.target.value}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #cbd5e0',fontSize:12}} placeholder='0.00'/></div></div><div style={{marginBottom:8}}><div style={{fontSize:11,color:'#64748b',marginBottom:3}}>Descrição</div><input type='text' value={novaContaForm.descricao} onChange={e=>setNovaContaForm(p=>({...p,descricao:e.target.value}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #cbd5e0',fontSize:12}} placeholder='Ex: Motorista João sem.18'/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}><div><div style={{fontSize:11,color:'#64748b',marginBottom:3}}>Beneficiário</div><input type='text' value={novaContaForm.beneficiario} onChange={e=>setNovaContaForm(p=>({...p,beneficiario:e.target.value}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #cbd5e0',fontSize:12}}/></div><div><div style={{fontSize:11,color:'#64748b',marginBottom:3}}>WhatsApp</div><input type='text' value={novaContaForm.telefone} onChange={e=>setNovaContaForm(p=>({...p,telefone:e.target.value}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #cbd5e0',fontSize:12}} placeholder='5581...'/></div></div><div style={{marginBottom:10}}><div style={{fontSize:11,color:'#64748b',marginBottom:3}}>Vencimento</div><input type='date' value={novaContaForm.vencimento} onChange={e=>setNovaContaForm(p=>({...p,vencimento:e.target.value}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #cbd5e0',fontSize:12}}/></div><button onClick={criarConta} style={{width:'100%',background:'#047857',color:'#fff',border:'none',borderRadius:8,padding:'9px',fontSize:13,fontWeight:700,cursor:'pointer'}}>Salvar Conta</button></div>}{contasPagar.length===0&&!showNovaConta&&<div style={{textAlign:'center',color:'#94a3b8',fontSize:13,padding:'12px 0'}}>Nenhuma conta pendente ✅</div>}{contasPagar.map(function(ct4){var tpM4={caminhao:{ic:'🚛',cc:'#7c3aed',bg:'#f5f3ff',lb:'Caminhão'},van:{ic:'🚐',cc:'#1e40af',bg:'#eff6ff',lb:'Van'},ajudante:{ic:'👷',cc:'#047857',bg:'#f0fdf4',lb:'Ajudante'},almoco:{ic:'🍽',cc:'#b45309',bg:'#fffbeb',lb:'Almoço'}};var tp4=tpM4[ct4.tipo]||{ic:'💰',cc:'#374151',bg:'#f9fafb',lb:ct4.tipo};var venc4=ct4.vencimento?new Date(ct4.vencimento+'T12:00:00'):null;var vencida4=venc4&&venc4<new Date();var msg4=encodeURIComponent('🚛 *TELEMIM*\n\nOlá '+(ct4.beneficiario||'')+'!\nConta: *'+ct4.descricao+'*\nValor: *R$ '+parseFloat(ct4.valor||0).toFixed(2).replace('.',',')+' *\n\n_PROMORAR_');return(<div key={ct4.id} style={{background:tp4.bg,borderRadius:12,padding:'12px 14px',marginBottom:8,border:'1.5px solid '+tp4.cc+'33'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}><div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:22}}>{tp4.ic}</span><div><div style={{fontWeight:700,fontSize:13,color:'#1e293b'}}>{ct4.descricao}</div><div style={{fontSize:11,color:'#64748b'}}>{tp4.lb}{ct4.beneficiario?' · '+ct4.beneficiario:''}{ct4.vencimento?' · Vence '+ct4.vencimento.slice(8)+'/'+ct4.vencimento.slice(5,7):''}</div></div></div><div style={{textAlign:'right'}}><div style={{fontWeight:900,fontSize:16,color:tp4.cc}}>R$ {parseFloat(ct4.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>{vencida4&&<span style={{fontSize:10,background:'#fee2e2',color:'#dc2626',borderRadius:4,padding:'1px 5px'}}>Vencida</span>}</div></div><div style={{display:'flex',gap:6}}><button onClick={()=>window.open('https://wa.me/'+(ct4.telefone||'')+'?text='+msg4,'_blank')} style={{flex:1,background:'#dcfce7',color:'#166534',border:'none',borderRadius:8,padding:'8px 0',fontSize:12,fontWeight:700,cursor:'pointer'}}>📱 WhatsApp</button><button onClick={()=>pagarConta(ct4.id)} style={{flex:1,background:'#047857',color:'#fff',border:'none',borderRadius:8,padding:'8px 0',fontSize:12,fontWeight:700,cursor:'pointer'}}>✅ Pago</button></div></div>);})}{contasHist.length>0&&<details style={{marginTop:10}}><summary style={{fontSize:12,color:'#64748b',cursor:'pointer',fontWeight:600}}>Histórico de pagamentos ({contasHist.length})</summary><div style={{marginTop:8}}>{contasHist.map(function(ch3){var icH={caminhao:'🚛',van:'🚐',ajudante:'👷',almoco:'🍽'};var pgEm3=ch3.pago_em?new Date(ch3.pago_em).toLocaleDateString('pt-BR'):'';return(<div key={ch3.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f1f5f9',opacity:0.7}}><span style={{fontSize:12}}>{icH[ch3.tipo]||'💰'} {ch3.descricao}</span><span style={{fontSize:11,color:'#047857',fontWeight:700}}>✅ R$ {parseFloat(ch3.valor||0).toFixed(2)} {pgEm3}</span></div>);})}</div></details>}</div><div style={{fontWeight:800,fontSize:15,color:'#1e293b',marginBottom:12}}>📋 Histórico do Mês</div>{diasU.length===0&&<div style={{textAlign:'center',color:'#94a3b8',fontSize:13,padding:20}}>Nenhuma mudança este mês</div>}{diasU.slice().sort(function(a,b){return b.localeCompare(a);}).map(function(dia){var mD2=diasMes.filter(function(m){return m.data===dia;});var cD2=cstMes.find(function(cd){return cd.data===dia;});var nD2=mD2.length;var br2=nD2>0?RULES.van1a:0;br2+=mD2.reduce(function(s,m){return s+(parseFloat(m.medicao)||0);},0)*RULES.medicaoPorM3;var lq2=br2*(1-RULES.imposto);var aj2=cD2?cD2.ajudantes||0:0;var ca2=aj2>0?(RULES.aj1a+(nD2>0?nD2-1:0)*RULES.ajAdd)*aj2:0;var cu2=RULES.vanCusto+ca2+(parseFloat(cD2&&cD2.custo_almoco)||0);var lu2=lq2-cu2;var df2=dia.slice(8)+'/'+dia.slice(5,7);return(<div key={dia} style={{borderBottom:'1px solid #f1f5f9',paddingBottom:12,marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><div><span style={{fontWeight:700,fontSize:14,color:'#1e293b'}}>{df2}</span><span style={{marginLeft:8,background:'#e0e7ff',color:'#3730a3',borderRadius:6,padding:'2px 7px',fontSize:11,fontWeight:600}}>{nD2} mud.</span>{aj2>0&&<span style={{marginLeft:4,background:'#fef3c7',color:'#92400e',borderRadius:6,padding:'2px 6px',fontSize:11}}>{aj2} aj.</span>}</div><div style={{textAlign:'right'}}><div style={{fontSize:15,fontWeight:800,color:lu2>=0?'#047857':'#dc2626'}}>R$ {lu2.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div><div style={{fontSize:9,color:'#94a3b8'}}>lucro</div></div></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>{[{l:'Fat.Bruto',v:fN(br2),c:'#1e40af'},{l:'Rec.Líq.',v:fN(lq2),c:'#047857'},{l:'Custo',v:fN(cu2),c:'#b45309'}].map(function(k,i){return(<div key={i} style={{background:'#f8fafc',borderRadius:8,padding:'6px 8px',textAlign:'center'}}><div style={{fontSize:9,color:'#94a3b8'}}>{k.l}</div><div style={{fontSize:11,fontWeight:700,color:k.c}}>{k.v}</div></div>);})}</div></div>);})}</div></div></>);})()} 
        </div>
      )}
        </div>

            {tab==="usuarios"&&isAdmin&&(<div style={{paddingBottom:80}} onMouseEnter={()=>listaUsuarios.length===0&&carregarUsuarios()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:16,fontWeight:900}}>👥 Gerenciar Usuários</div><button onClick={carregarUsuarios} style={{background:"#eff6ff",border:"1px solid #3b82f6",color:"#3b82f6",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔄 Atualizar</button></div><Card style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>USUÁRIOS ({listaUsuarios.length})</div>{listaUsuarios.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Clique em Atualizar</div>:listaUsuarios.map(u=>(<div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}><div><div style={{fontWeight:700,fontSize:13}}>{u.nome}</div><div style={{fontSize:11,color:"#94a3b8"}}>{u.email}</div><span style={{display:"inline-block",marginTop:3,background:u.perfil==="admin"?"#dbeafe":u.perfil==="promorar"?"#dcfce7":"#fef9c3",borderRadius:12,padding:"2px 8px",fontSize:10,fontWeight:800,color:u.perfil==="admin"?"#1d4ed8":u.perfil==="promorar"?"#15803d":"#a16207"}}>{u.perfil==="admin"?"👑 Admin":u.perfil==="promorar"?"🏢 Promorar":"🤝 Social"}</span></div><button onClick={()=>toggleAtivoUser(u)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(u.ativo?"#ef4444":"#22c55e"),background:u.ativo?"#fef2f2":"#f0fdf4",color:u.ativo?"#ef4444":"#22c55e",fontSize:11,fontWeight:700,cursor:"pointer"}}>{u.ativo?"🚫 Desativar":"✅ Ativar"}</button></div>))}</Card><Card><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>+ NOVO USUÁRIO</div><Inp label="Nome" icon="👤" value={novoUser.nome} onChange={v=>setNovoUser(f=>({...f,nome:v}))}/><Inp label="Email" icon="📧" value={novoUser.email} onChange={v=>setNovoUser(f=>({...f,email:v}))}/><Inp label="Senha" icon="🔒" value={novoUser.senha} onChange={v=>setNovoUser(f=>({...f,senha:v}))}/><div style={{marginBottom:12}}><label style={{display:"block",color:"#94a3b8",fontSize:11,fontWeight:700,marginBottom:5}}>PERFIL</label><div style={{display:"flex",gap:8}}>{[["admin","👑 Admin"],["promorar","🏢 Promorar"],["social","🤝 Social"]].map(([val,lab])=>(<button key={val} onClick={()=>setNovoUser(f=>({...f,perfil:val}))} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1.5px solid "+(novoUser.perfil===val?"#f97316":"#e2e8f0"),background:novoUser.perfil===val?"#fff7ed":"#f8fafc",color:novoUser.perfil===val?"#f97316":"#94a3b8",fontWeight:800,fontSize:11,cursor:"pointer"}}>{lab}</button>))}</div></div>{userMsg&&<div style={{background:userMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:userMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{userMsg}</div>}<button onClick={criarUsuario} disabled={savingUser} style={{width:"100%",padding:13,borderRadius:12,background:savingUser?"#94a3b8":"#f97316",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:savingUser?"not-allowed":"pointer"}}>{savingUser?"⏳ Criando...":"➕ Criar Usuário"}</button></Card></div>)}
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
      <div style={{marginTop:24,padding:20,background:'#fff',borderRadius:16,boxShadow:'0 2px 12px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0'}}><div style={{fontWeight:800,fontSize:16,color:COLORS.text,marginBottom:4}}>⚙️ Regras de Cálculo</div><div style={{fontSize:12,color:COLORS.muted,marginBottom:16}}>Valores progressivos por mudança no dia</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}><div><label style={{fontSize:11,fontWeight:600,color:COLORS.muted,display:'block',marginBottom:4}}>🚛 1ª Mudança (R$)</label><input type="number" value={cfgEdit.van1a} onChange={ev=>setCfgEdit(p=>({...p,van1a:Number(ev.target.value)}))} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,boxSizing:'border-box'}}/></div><div><label style={{fontSize:11,fontWeight:600,color:COLORS.muted,display:'block',marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.vanAdd} onChange={ev=>setCfgEdit(p=>({...p,vanAdd:Number(ev.target.value)}))} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,boxSizing:'border-box'}}/></div><div><label style={{fontSize:11,fontWeight:600,color:COLORS.muted,display:'block',marginBottom:4}}>👷 1º Ajudante (R$)</label><input type="number" value={cfgEdit.aj1a} onChange={ev=>setCfgEdit(p=>({...p,aj1a:Number(ev.target.value)}))} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,boxSizing:'border-box'}}/></div><div><label style={{fontSize:11,fontWeight:600,color:COLORS.muted,display:'block',marginBottom:4}}>+ Acréscimo Aj. (R$)</label><input type="number" value={cfgEdit.ajAdd} onChange={ev=>setCfgEdit(p=>({...p,ajAdd:Number(ev.target.value)}))} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,boxSizing:'border-box'}}/></div><div><label style={{fontSize:11,fontWeight:600,color:COLORS.muted,display:'block',marginBottom:4}}>📅 Data Início</label><input type="date" value={cfgEdit.dataInicioRegra} onChange={ev=>setCfgEdit(p=>({...p,dataInicioRegra:ev.target.value}))} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,boxSizing:'border-box'}}/></div><div><label style={{fontSize:11,fontWeight:600,color:COLORS.muted,display:'block',marginBottom:4}}>💸 Imposto (%)</label><input type="number" value={cfgEdit.imposto} onChange={ev=>setCfgEdit(p=>({...p,imposto:Number(ev.target.value)}))} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,boxSizing:'border-box'}}/></div></div><div style={{background:COLORS.bg,borderRadius:10,padding:12,marginBottom:16,fontSize:12,color:COLORS.muted}}><strong>3 mud.:</strong> R$ {(cfgEdit.van1a+2*cfgEdit.vanAdd).toFixed(2)} | <strong>4 mud.:</strong> R$ {(cfgEdit.van1a+3*cfgEdit.vanAdd).toFixed(2)}</div>{cfgSaved&&<div style={{color:'#16a34a',fontSize:13,fontWeight:700,marginBottom:8}}>✅ Salvo!</div>}<button onClick={async function(){const cc=[{k:'van_1a_mudanca',v:String(cfgEdit.van1a)},{k:'van_adicional',v:String(cfgEdit.vanAdd)},{k:'ajudante_1a_mudanca',v:String(cfgEdit.aj1a)},{k:'ajudante_adicional',v:String(cfgEdit.ajAdd)},{k:'data_inicio_regra',v:cfgEdit.dataInicioRegra},{k:'imposto_pct',v:String(cfgEdit.imposto)}];for(const x of cc){await fetch(SUPA_URL+'/rest/v1/configuracoes?chave=eq.'+x.k,{method:'PATCH',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(usuario?.token||SUPA_KEY),'Content-Type':'application/json'},body:JSON.stringify({valor:x.v})});}RULES.van1a=cfgEdit.van1a;RULES.vanAdd=cfgEdit.vanAdd;RULES.aj1a=cfgEdit.aj1a;RULES.ajAdd=cfgEdit.ajAdd;RULES.imposto=cfgEdit.imposto/100;RULES.dataInicioRegra=cfgEdit.dataInicioRegra;setCfgSaved(true);setTimeout(()=>setCfgSaved(false),3000);}} style={{width:'100%',background:COLORS.accent,color:'#fff',border:'none',borderRadius:12,padding:'12px 0',fontWeight:700,fontSize:15,cursor:'pointer'}}>💾 Salvar</button></div>
      </div></div>)}

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
    {usuario&&(
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #e2e8f0',display:'flex',zIndex:9999,paddingBottom:'env(safe-area-inset-bottom,0px)',boxShadow:'0 -4px 20px rgba(0,0,0,0.08)'}}>
        {[{id:'inicio',icon:'🏠',label:'Hoje'},{id:'registros',icon:'📋',label:'Mudânças'},{id:'agenda',icon:'📅',label:'Agenda'},...(isAdmin?[{id:'financeiro',icon:'💰',label:'Financeiro'}]:[]),...(isAdmin?[{id:'usuarios',icon:'⚙️',label:'Config'}]:[])].map(mn=>(
          <button key={mn.id} onClick={()=>setTab(mn.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px 6px',background:'none',border:'none',cursor:'pointer',color:tab===mn.id?'#ea580c':'#94a3b8'}}>
            <span style={{fontSize:20,lineHeight:1}}>{mn.icon}</span>
            <span style={{fontSize:10,fontWeight:tab===mn.id?700:500,marginTop:3,color:tab===mn.id?'#ea580c':'#94a3b8'}}>{mn.label}</span>
            {tab===mn.id&&<span style={{width:20,height:3,background:'#ea580c',borderRadius:2,marginTop:2}}/>}
          </button>
        ))}
      </nav>
    )}
    </div>
  );
}
