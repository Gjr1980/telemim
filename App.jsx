// TELEMIM v3.4 — Multi-Fleet
import { useState, useEffect, useMemo } from "react";
// ── Modular imports ──────────────────────────────────────────────────────────
import { SUPA_URL, SUPA_KEY, _getValidToken, _fmtDate, getSupaClient, getH, _ensureAuth, dbGet, dbUpsert, dbDelete, dbGetContas, dbInsertConta, dbPagarConta, dbGetCustos, dbUpsertCusto, FORNECEDORES } from "./src/config/supabase.js";
import { VAPID_PUBLIC, COLORS, RULES, DADOS_INICIAIS, AGENDA_INICIAIS, initForm } from "./src/config/constants.js";
import { urlBase64ToUint8Array, subscribePush, sendPushNotification } from "./src/utils/push.js";
import { idbSet, idbGet, addToSyncQueue, processSyncQueue } from "./src/utils/offline.js";
import { _calcDiario, _calcCustos } from "./src/utils/calcCustos.js";
import { exportarPDF, exportarExcel } from "./src/utils/exportar.js";
import { Badge, Card, Inp, InpEndereco, Tog, playNotifSound } from "./src/components/shared.jsx";

// ── Globais a nível de módulo ────────────────────────────────────────
const MAPBOX_TOKEN_GLOBAL = ["pk.eyJ1IjoidGVsZW1pbSIsImEiOiJjbW9yd","HJzMmcwNW8yMndwdnZ1bDFoOXZ2In0.","4MHg1RPF_jFgiQt4Ax4Psw"].join("");

// ── Helper GPS+ETA reutilizável (escopo de módulo) ─────────────────
// Pega GPS atual do navegador e calcula ETA até o endereço via Mapbox driving-traffic.
async function calcETAGpsParaEndereco(toAddress, opts = {}) {
  const timeoutMs = opts.timeout || 6000;
  const maxAgeMs = opts.maxAge || 60000;
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    let resolved = false;
    const _to = setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (resolved) return;
        try {
          const fromLat = pos.coords.latitude;
          const fromLng = pos.coords.longitude;
          const cleanAddr = (toAddress || "").replace(/\s+/g, " ").trim();
          const geoUrl = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + encodeURIComponent(cleanAddr) + ".json?access_token=" + MAPBOX_TOKEN_GLOBAL + "&limit=1&country=BR&proximity=-34.87,-8.05";
          const geoR = await fetch(geoUrl);
          const geoD = await geoR.json();
          if (!geoD.features || geoD.features.length === 0) { resolved = true; clearTimeout(_to); return resolve(null); }
          const destCoords = geoD.features[0].center;
          const dirUrl = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic/" + fromLng + "," + fromLat + ";" + destCoords[0] + "," + destCoords[1] + "?overview=false&access_token=" + MAPBOX_TOKEN_GLOBAL;
          const dirR = await fetch(dirUrl);
          const dirD = await dirR.json();
          if (!dirD.routes || dirD.routes.length === 0) { resolved = true; clearTimeout(_to); return resolve(null); }
          const route = dirD.routes[0];
          const durMin = Math.max(1, Math.ceil(route.duration / 60));
          const distKm = (route.distance / 1000).toFixed(1);
          const eta = new Date(Date.now() + route.duration * 1000);
          const _pad = (n) => String(n).padStart(2, "0");
          const etaStr = _pad(eta.getHours()) + ":" + _pad(eta.getMinutes());
          const ratio = parseFloat(distKm) > 0 ? (durMin / parseFloat(distKm)) : 2;
          let transitoTxt = "🟢 Leve";
          if (ratio > 3.5) transitoTxt = "🔴 Pesado";
          else if (ratio > 2.5) transitoTxt = "🟡 Moderado";
          resolved = true;
          clearTimeout(_to);
          resolve({ durMin, etaStr, distKm, transitoTxt });
        } catch (e) {
          resolved = true;
          clearTimeout(_to);
          resolve(null);
        }
      },
      () => { if (!resolved) { resolved = true; clearTimeout(_to); resolve(null); } },
      { timeout: timeoutMs, maximumAge: maxAgeMs, enableHighAccuracy: false }
    );
  });
}

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
function ResumoSemanal({mudancas,mudDesp,RULES,prestadores,custosDiarios,setCustosDiarios,setContasSemana,equipeDiaList,solicitacoesFin}){
  var _pc=function(n){return String(n).padStart(2,"0");};
  var _hc=new Date();var _dwc=_hc.getDay();var _dc=_dwc===0?6:_dwc-1;
  var _s0c=new Date(_hc.getFullYear(),_hc.getMonth(),_hc.getDate()-_dc);
  var _s1c=new Date(_s0c.getFullYear(),_s0c.getMonth(),_s0c.getDate()+6);
  var _fc=function(d){return d.getFullYear()+"-"+_pc(d.getMonth()+1)+"-"+_pc(d.getDate());};
  var _fb=function(d){return _pc(d.getDate())+"/"+_pc(d.getMonth()+1)+"/"+d.getFullYear();};
  var _sic=_fc(_s0c);var _sfc=_fc(_s1c);
  var _periodo=_fb(_s0c)+" a "+_fb(_s1c);
  var _ms=mudancas.filter(function(m){return !m.deleted_at&&m.data>=_sic&&m.data<=_sfc;});
  var _msDesp=(mudDesp||mudancas).filter(function(m){return !m.deleted_at&&m.data>=_sic&&m.data<=_sfc;});
  var _cd=(custosDiarios||[]).filter(function(x){return x.data>=_sic&&x.data<=_sfc;});
  var _fv=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
  var _fvs=function(v){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v||0);};
  var _ico={"caminhao":"🚚","van":"🚐","ajudante":"👷","almoco":"🍛","outro":"📋"};
  var _lbl={"caminhao":"Caminhão","van":"Van","ajudante":"Ajudante","almoco":"Almoço","outro":"Outro"};
  var _cor={"caminhao":"#92400e","van":"#1e40af","ajudante":"#065f46","almoco":"#7c3aed","outro":"#475569"};
  var _bg={"caminhao":"#fff7ed","van":"#eff6ff","ajudante":"#f0fdf4","almoco":"#faf5ff","outro":"#f8fafc"};
  // --- calcular detalhes por prestador usando regras centralizadas ---
  // Custos usam _msDesp (todas agendadas, não só concluídas)
  function _calcDetP(p){
    var det=[];
    var _diasDetD=[...new Set(_msDesp.map(function(m){return m.data;}))].sort();
    var _aj1aR=parseFloat(RULES.aj1a)||80;var _ajAddR=parseFloat(RULES.ajAdd)||20;
    var _aprovR=(solicitacoesFin||[]).filter(function(s){return s.status==="aprovado"&&s.tipo==="editar_valor";});
    if(p.id==="__equipa_aj__"){
      _diasDetD.forEach(function(data){
        var numMud=_msDesp.filter(function(m){return m.data===data;}).length;
        if(numMud===0) return;
        var _eqDia=(equipeDiaList||[]).find(function(e){return e.data===data&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
        if(_eqDia){
          var valPorAj=_aj1aR+Math.max(0,numMud-1)*_ajAddR;
          var valTotal=0;
          _eqDia.ajudantes.forEach(function(aj){
            var ajVal=valPorAj;
            var aprov=_aprovR.find(function(s){return s.prestador_nome===aj.nome&&s.data_ref===data;});
            if(aprov){var _nv=parseFloat(aprov.valor_novo);if(!isNaN(_nv))ajVal=_nv;}
            valTotal+=ajVal;
          });
          det.push({data,numMud,numAj:_eqDia.ajudantes.length,val:valTotal});
        }
        // Sem equipe_dia = sem custo ajudante (sem fallback inventado)
      });
    }else if(p.cargo==="caminhao"||p.cargo==="van"){
      _diasDetD.forEach(function(data){
        // Veículo condicional: só cobra se teve veículo naquele dia
        var mudDia=_msDesp.filter(function(m){return m.data===data;});
        var numMudVeic=p.cargo==="caminhao"?mudDia.filter(function(m){return m.caminhao||m.motorista_caminhao_id;}).length:mudDia.filter(function(m){return m.van||m.motorista_van_id;}).length;
        if(numMudVeic===0) return;
        var val=_calcDiario(numMudVeic,0,p.cargo,RULES);
        det.push({data,numMud:numMudVeic,val});
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
  var _eqSem=(equipeDiaList||[]).filter(function(e){return e.data>=_sic&&e.data<=_sfc;});
  var _cSem=_calcCustos(_ms,_cd,[],RULES,_msDesp,_eqSem,solicitacoesFin);
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
  var [usuarios,setUsuarios]=useState([]);
  var [sendingMsg,setSendingMsg]=useState(null);
  var [msgSentStatus,setMsgSentStatus]=useState({});
  // ── Helper: dispara WhatsApp via edge function enviar-whatsapp-publico (sem JWT) ──
  function enviarWAPublico(numero, mensagem){
    if(!numero || !mensagem) return Promise.resolve({ok:false,error:"sem numero/mensagem"});
    return fetch(SUPA_URL+"/functions/v1/enviar-whatsapp-publico",{
      method:"POST",
      headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({numero:numero, mensagem:mensagem})
    }).then(function(r){return r.json().catch(function(){return{ok:false,error:"resposta inválida"};});})
      .catch(function(e){return {ok:false, error:e.message};});
  }
  function carregarDados(){
    fetch(SUPA_URL+"/functions/v1/consumir-magic-link?token="+encodeURIComponent(token),{headers:{"apikey":SUPA_KEY}})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok){setDados(d);}else if(!dados){setErro(d.error||"Link inválido.");}setLoading(false);})
      .catch(function(){if(!dados){setErro("Erro de conexão.");}setLoading(false);});
  }
  useEffect(function(){carregarDados();},[token]);
  useEffect(function(){var iv=setInterval(carregarDados,30000);return function(){clearInterval(iv);};},[token]);
  var [assistSociais,setAssistSociais]=useState([]);
  useEffect(function(){
    fetch(SUPA_URL+"/rest/v1/usuarios?select=id,nome,perfil,tipo_veiculo,placa_veiculo,contato&ativo=eq.true",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY}})
      .then(function(r){return r.json();}).then(function(d){if(Array.isArray(d))setUsuarios(d);}).catch(function(){});
    fetch(SUPA_URL+"/rest/v1/assistentes_social?select=id,nome,contato&ativo=eq.true",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY}})
      .then(function(r){return r.json();}).then(function(d){if(Array.isArray(d))setAssistSociais(d);}).catch(function(){});
  },[]);
  function atualizarStatus(item,campos){
    if(updating[item.id]) return;
    setUpdating(function(p){var n={...p};n[item.id]=true;return n;});
    var tabela=item._tabela||"agenda";
    // Detectar formato antigo (novo_status + campo_tempo) ou novo (campos)
    var body;
    if(typeof campos==="string"){
      // formato antigo: atualizarStatus(item, novoStatus, campoTempo)
      body={token:token,item_id:item.id,tabela:tabela,novo_status:campos,campo_tempo:arguments[2]||null};
    }else{
      body={token:token,item_id:item.id,tabela:tabela,campos:campos};
    }
    fetch(SUPA_URL+"/functions/v1/atualizar-status-terceirizado",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d.ok){var _agora=new Date().toISOString();setDados(function(prev){if(!prev)return prev;var nRotas=prev.rotas.map(function(r){if(r.id!==item.id)return r;var u=Object.assign({},r);if(typeof campos==="object"){Object.keys(campos).forEach(function(k){u[k]=campos[k]==="NOW"?_agora:campos[k];});}return u;});return Object.assign({},prev,{rotas:nRotas});});}
        else{alert(d.error||"Erro ao atualizar");}
        setUpdating(function(p){var n={...p};delete n[item.id];return n;});
      })
      .catch(function(){alert("Erro de conexão");setUpdating(function(p){var n={...p};delete n[item.id];return n;});});
  }
  var [contatoPopup,setContatoPopup]=useState(null);
  function _gN(id){if(!id)return null;var u=usuarios.find(function(x){return x.id===id||String(x.id)===String(id);});return u?u.nome:null;}
  function _gP(id){if(!id)return null;var u=usuarios.find(function(x){return x.id===id||String(x.id)===String(id);});return u&&u.placa_veiculo?u.placa_veiculo:null;}
  function _gC(id){if(!id)return null;var u=usuarios.find(function(x){return x.id===id||String(x.id)===String(id);});return u&&u.contato?u.contato:null;}
  var _fmtH=function(ts){if(!ts)return null;var d=new Date(ts);if(isNaN(d.getTime()))return null;return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
  if(loading) return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc"}}><div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:8}}>🚛</div><div style={{fontWeight:700,fontSize:14,color:"#64748b"}}>Carregando rota...</div></div></div>);
  if(erro) return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#fef2f2",padding:20}}><div style={{textAlign:"center",maxWidth:360}}><div style={{fontSize:48,marginBottom:12}}>⚠️</div><div style={{fontWeight:800,fontSize:16,color:"#dc2626",marginBottom:8}}>Link Inválido ou Expirado</div><div style={{fontSize:13,color:"#991b1b"}}>{erro}</div></div></div>);
  var _dfmt=dados.data_servico?dados.data_servico.slice(8)+"/"+dados.data_servico.slice(5,7)+"/"+dados.data_servico.slice(0,4):"";
  var _statusFlow={"confirmado":"em_deslocamento","em_deslocamento":"em_andamento","em_andamento":"realizada"};
  var _statusLabel={"confirmado":"🚗 Em Deslocamento","em_deslocamento":"🔧 Iniciar Serviço","em_andamento":"✅ Finalizar"};
  var _statusCor={"confirmado":"#f97316","em_deslocamento":"#2563eb","em_andamento":"#16a34a"};
  var _statusBg={"confirmado":"#fff7ed","em_deslocamento":"#eff6ff","em_andamento":"#f0fdf4"};
  var _statusBadge={"confirmado":"⏳ Aguardando","em_deslocamento":"🚗 Em Deslocamento","em_andamento":"🔧 Em Andamento","realizada":"✅ Finalizada"};
  var _firstR=dados.rotas&&dados.rotas.length>0?dados.rotas[0]:null;
  return(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#1e3a8a)",padding:"20px 16px 16px",color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>TELEMIM — Mudança Terceirizada</div>
        <div style={{fontSize:18,fontWeight:900,marginTop:4}}>🚛 {_firstR?_firstR.nome:(dados.motorista_nome||"Motorista")}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",marginTop:2}}>📅 {_dfmt}{_firstR&&_firstR.horario?" · ⏰ "+_firstR.horario:""}</div>
        {dados.criado_por&&<div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:4}}>Atribuído por: {dados.criado_por}</div>}
      </div>
      <div style={{padding:"12px 12px 80px"}}>
        {(!dados.rotas||dados.rotas.length===0)?(
          <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:8}}>📭</div><div style={{fontWeight:700,fontSize:14}}>Nenhuma mudança encontrada.</div></div>
        ):(
          [...dados.rotas].sort(function(a,b){return (a.horario||"99:99").localeCompare(b.horario||"99:99");}).map(function(r){
            var st=r.status||"confirmado";
            var prox=_statusFlow[st];
            var isFinal=st==="realizada";
            var _veiculos=[r.van&&"🚐 Van",r.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"—";
            var _vanN=_gN(r.motorista_van_id);var _vanP=_gP(r.motorista_van_id);
            var _camN=_gN(r.motorista_caminhao_id);var _camP=_gP(r.motorista_caminhao_id);
            var _supN=_gN(r.supervisor_id);
            var _temEquipe=_vanN||_camN||_supN||r.assist_social;
            var _steps=[];
            _steps.push({key:"deslocamento",label:"Deslocamento p/ Origem",icon:"🚐",time:r.inicio_van_em||r.van_saiu_em||r.inicio_caminhao_em||r.caminhao_saiu_em||r.inicio_em});
            _steps.push({key:"origem",label:"Chegou na Origem",icon:"📍",time:r.chegou_origem_van_em||r.chegou_origem_cam_em});
            _steps.push({key:"carregando",label:"Carregamento Concluído",icon:"📦",time:(r.saiu_destino_van_em||r.saiu_destino_cam_em)?(r.chegou_origem_van_em||r.chegou_origem_cam_em):null});
            _steps.push({key:"rumo_destino",label:"Deslocamento ao Destino",icon:"🚚",time:r.saiu_destino_van_em||r.saiu_destino_cam_em});
            _steps.push({key:"destino",label:"Chegou no Destino",icon:"🏠",time:r.chegada_van_em||r.chegada_caminhao_em});
            _steps.push({key:"concluido",label:"Mudança Concluída",icon:"🏁",time:r.termino_em||r.termino_van_em||r.termino_caminhao_em});
            var _activeIdx=-1;
            for(var si=_steps.length-1;si>=0;si--){if(_steps[si].time){_activeIdx=si;break;}}
            if(isFinal)_activeIdx=5;
            return(
              <div key={r.id} style={{marginBottom:14}}>
                {!isFinal&&<div style={{textAlign:"center",marginBottom:10}}>
                  <div style={{display:"inline-block",padding:"6px 18px",borderRadius:20,fontWeight:800,fontSize:13,background:_statusBg[st]||"#f8fafc",color:_statusCor[st]||"#64748b",border:"2px solid "+(_statusCor[st]||"#e2e8f0")}}>{_statusBadge[st]||st}</div>
                </div>}
                <div style={{background:isFinal?"#f0fdf4":"#fff",borderRadius:14,border:"2px solid "+(isFinal?"#86efac":"#e2e8f0"),padding:"16px",marginBottom:10,boxShadow:isFinal?"0 4px 16px rgba(22,163,74,0.15)":"0 2px 8px rgba(0,0,0,0.06)"}}>
                  {isFinal&&<div style={{background:"linear-gradient(135deg,#16a34a,#15803d)",borderRadius:10,padding:"12px 14px",textAlign:"center",marginBottom:14,boxShadow:"0 2px 8px rgba(22,163,74,0.4)"}}>
                    <div style={{fontSize:18,fontWeight:900,color:"#fff",letterSpacing:2}}>✅ FINALIZADA</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.85)",marginTop:3,fontWeight:600}}>Mudança concluída com sucesso</div>
                  </div>}
                  <div style={{fontSize:11,fontWeight:700,color:isFinal?"#15803d":"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>📋 Detalhes da Mudança</div>
                  <div style={{fontWeight:800,fontSize:18,color:"#1e293b",marginBottom:12}}>{r.nome||"Sem nome"}</div>
                  <div style={{display:"grid",gap:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📅</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>DATA</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{_dfmt}{r.horario?" às "+r.horario:""}</div></div></div>
                    {r.comunidade&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🏘️</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>HABITACIONAL</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{r.comunidade}</div></div></div>}
                    {r.selo&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🏷️</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>SELO</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{r.selo}</div></div></div>}
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📦</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>ORIGEM</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{r.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.origem)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none"}}>{r.origem} 🗺️</a>:"—"}</div></div></div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🏠</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>DESTINO</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{r.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.destino)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none"}}>{r.destino} 🗺️</a>:"—"}</div></div></div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🚗</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>VEÍCULOS</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{_veiculos}</div></div></div>
                    {r.contato&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📱</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>CONTATO BENEFICIÁRIO</div><div style={{fontSize:14,fontWeight:700,color:"#2563eb"}}><a href={"tel:"+r.contato} style={{color:"#2563eb",textDecoration:"none"}}>{r.contato}</a></div></div></div>}
                    {(r.observacao||r.observacoes)&&<div style={{display:"flex",alignItems:"flex-start",gap:8}}><span style={{fontSize:16}}>📝</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>OBSERVAÇÕES</div><div style={{fontSize:13,color:"#475569",fontStyle:"italic"}}>{r.observacao||r.observacoes}</div></div></div>}
                  </div>
                </div>
                {_temEquipe&&<div style={{background:"#fff",borderRadius:14,border:"2px solid #e2e8f0",padding:"16px",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>👥 Equipe</div>
                  <div style={{display:"grid",gap:8}}>
                    {_vanN&&<div onClick={function(){setContatoPopup({nome:_vanN,contato:_gC(r.motorista_van_id),tipo:"🚐 Motorista Van"});}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{background:"#eff6ff",borderRadius:8,padding:"4px 8px",fontSize:12}}>🚐</span><div><div style={{fontSize:13,fontWeight:700,color:"#2563eb",textDecoration:"underline",textDecorationStyle:"dotted"}}>{_vanN}</div>{_vanP&&<div style={{fontSize:10,color:"#94a3b8"}}>{_vanP}</div>}</div></div>}
                    {_camN&&<div onClick={function(){setContatoPopup({nome:_camN,contato:_gC(r.motorista_caminhao_id),tipo:"🚚 Motorista Caminhão"});}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{background:"#f5f3ff",borderRadius:8,padding:"4px 8px",fontSize:12}}>🚚</span><div><div style={{fontSize:13,fontWeight:700,color:"#7c3aed",textDecoration:"underline",textDecorationStyle:"dotted"}}>{_camN}</div>{_camP&&<div style={{fontSize:10,color:"#94a3b8"}}>{_camP}</div>}</div></div>}
                    {_supN&&<div onClick={function(){setContatoPopup({nome:_supN,contato:_gC(r.supervisor_id),tipo:"👷 Supervisor"});}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{background:"#fef3c7",borderRadius:8,padding:"4px 8px",fontSize:12}}>👷</span><div><div style={{fontSize:13,fontWeight:700,color:"#92400e",textDecoration:"underline",textDecorationStyle:"dotted"}}>{_supN}</div></div></div>}
                    {r.assist_social&&<div onClick={function(){var _as=assistSociais.find(function(s){return s.nome===r.assist_social;});setContatoPopup({nome:r.assist_social,contato:_as&&_as.contato||null,tipo:"👩‍⚕️ Assistente Social"});}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{background:"#fdf4ff",borderRadius:8,padding:"4px 8px",fontSize:12}}>👩‍⚕️</span><div><div style={{fontSize:13,fontWeight:700,color:"#7c3aed",textDecoration:"underline",textDecorationStyle:"dotted"}}>{r.assist_social}</div></div></div>}
                  </div>
                </div>}
                {_activeIdx>=0&&<div style={{background:"#fff",borderRadius:14,border:"2px solid #e2e8f0",padding:"16px 10px",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",overflowX:"auto"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>📡 Progresso</div>
                  <div style={{display:"flex",alignItems:"flex-start",gap:0,minWidth:420}}>
                    {_steps.map(function(step,idx){
                      var isDone=idx<_activeIdx;var isActive=idx===_activeIdx;var _h=_fmtH(step.time);
                      return(
                        <div key={step.key} style={{display:"flex",alignItems:"flex-start",flex:1}}>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:0,minWidth:42}}>
                            <div style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,background:isDone?"#16a34a":isActive?"#2563eb":"#e2e8f0",color:isDone||isActive?"#fff":"#94a3b8",fontWeight:800,boxShadow:isActive?"0 0 0 3px rgba(37,99,235,0.25)":"none",border:isActive?"2px solid #93c5fd":"2px solid "+(isDone?"#16a34a":"#e2e8f0")}}>{isDone?"✓":step.icon}</div>
                            <div style={{fontSize:8,fontWeight:isDone||isActive?700:500,color:isDone?"#16a34a":isActive?"#2563eb":"#94a3b8",marginTop:3,textAlign:"center",whiteSpace:"nowrap"}}>{step.label}</div>
                            {_h?<div style={{fontSize:10,fontWeight:900,color:isDone?"#15803d":isActive?"#1d4ed8":"#64748b",marginTop:1}}>{_h}</div>:<div style={{fontSize:8,color:"#cbd5e1",marginTop:1}}>—</div>}
                          </div>
                          {idx<_steps.length-1&&<div style={{flex:1,height:3,background:isDone?"#16a34a":"#e2e8f0",borderRadius:2,margin:"0 2px",marginTop:15}}></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>}
                {(function(){
                  var _isVan=dados.motorista_id&&r.motorista_van_id&&String(dados.motorista_id)===String(r.motorista_van_id);
                  var _isCam=dados.motorista_id&&r.motorista_caminhao_id&&String(dados.motorista_id)===String(r.motorista_caminhao_id);
                  var _proxBtn=null;
                  if(_isVan){
                    if(!r.inicio_van_em) _proxBtn={label:"🚗 Em Deslocamento",campos:{inicio_van_em:"NOW",van_saiu_em:"NOW"},bg:"#f97316",_waMsg:"desloc_origem_van_promorar"};
                    else if(!r.chegou_origem_van_em) _proxBtn={label:"📍 Cheguei na Origem",campos:{chegou_origem_van_em:"NOW"},bg:"#2563eb"};
                    else if(!r.saiu_destino_van_em) _proxBtn={label:"🚚 Rumo ao Destino",campos:{saiu_destino_van_em:"NOW"},bg:"#7c3aed"};
                    else if(!r.chegada_van_em) _proxBtn={label:"🏠 Cheguei no Destino",campos:{chegada_van_em:"NOW"},bg:"#0891b2"};
                    else if(!r.termino_van_em) _proxBtn={label:"✅ Finalizar Mudança",campos:{termino_van_em:"NOW",termino_em:"NOW",status:"concluida"},bg:"#16a34a"};
                  } else if(_isCam){
                    if(!r.inicio_caminhao_em) _proxBtn={label:"🚗 Em Deslocamento",campos:{inicio_caminhao_em:"NOW",caminhao_saiu_em:"NOW"},bg:"#f97316",_waMsg:"desloc_origem"};
                    else if(!r.chegou_origem_cam_em) _proxBtn={label:"📍 Cheguei na Origem",campos:{chegou_origem_cam_em:"NOW"},bg:"#2563eb"};
                    else if(!r.saiu_destino_cam_em) _proxBtn={label:"🚚 Rumo ao Destino",campos:{saiu_destino_cam_em:"NOW"},bg:"#7c3aed"};
                    else if(!r.chegada_caminhao_em) _proxBtn={label:"🏠 Cheguei no Destino",campos:{chegada_caminhao_em:"NOW"},bg:"#0891b2"};
                    else if(!r.termino_caminhao_em) _proxBtn={label:"✅ Finalizar Mudança",campos:{termino_caminhao_em:"NOW",termino_em:"NOW",status:"concluida"},bg:"#16a34a"};
                  } else if(!isFinal&&prox){
                    _proxBtn={label:_statusLabel[st]||"Avançar",campos:{status:prox},bg:_statusCor[st]||"#3b82f6"};
                  }
                  var _isFinalNow=(_isVan&&!!r.termino_van_em)||(_isCam&&!!r.termino_caminhao_em)||(!_isVan&&!_isCam&&isFinal);
                  if(_isFinalNow) return(<div style={{textAlign:"center",padding:"14px",background:"#dcfce7",borderRadius:12,border:"2px solid #86efac",marginBottom:10}}><div style={{fontSize:14,fontWeight:800,color:"#15803d"}}>✅ Mudança Finalizada!</div></div>);
                  if(!_proxBtn) return null;
                  var _handleClickProm=async function(){
                    atualizarStatus({id:r.id,_tabela:"agenda"},_proxBtn.campos);
                    // Envio automático de mensagem para o morador quando caminhão sai p/ origem
                    if(_proxBtn._waMsg==="desloc_origem"){
                      if(!r.contato){
                        setMsgSentStatus(function(p){var n={...p};n[r.id]="⚠️ Morador sem contato — não foi possível enviar";return n;});
                        setTimeout(function(){setMsgSentStatus(function(p){var n={...p};delete n[r.id];return n;});},4500);
                        return;
                      }
                      var _supNomeP=(function(){var _s=r.supervisor_id?usuarios.find(function(u){return String(u.id)===String(r.supervisor_id);}):null;return _s?_s.nome:(r.approved_by_supervisor||"");})();
                      setSendingMsg(r.id);
                      setMsgSentStatus(function(p){var n={...p};n[r.id]="📡 Calculando ETA...";return n;});
                      var _etaP=await calcETAGpsParaEndereco(r.origem||"",{timeout:6000});
                      var _etaLinhaP=_etaP
                        ?"🚚 Previsão de chegada: *"+_etaP.etaStr+"* (em "+_etaP.durMin+" min)"
                        :"🚚 Previsão de chegada: *em alguns minutos*";
                      var _msgMorP="Olá *"+(r.nome||"")+"*! 👋\n\nBoas notícias! 🎉 Estamos a caminho da sua casa\npara iniciar a sua mudança.\n\n"+_etaLinhaP+"\n📍 Endereço: "+(r.origem||"—")+(_supNomeP?"\n👷 Supervisor: *"+_supNomeP+"*":"")+(r.assist_social?"\n👩‍⚕️ Assistente Social: *"+r.assist_social+"*":"")+"\n\nPode ir se preparando! 📦\n\n— Telemim Mudanças";
                      var _waResP=await enviarWAPublico(r.contato,_msgMorP);
                      if(_waResP&&_waResP.ok){
                        setMsgSentStatus(function(p){var n={...p};n[r.id]="✅ Mensagem enviada para "+r.contato;return n;});
                      }else{
                        setMsgSentStatus(function(p){var n={...p};n[r.id]="⚠️ Falha ao enviar: "+(_waResP&&_waResP.error||"erro");return n;});
                      }
                      setTimeout(function(){setMsgSentStatus(function(p){var n={...p};delete n[r.id];return n;});},4500);
                      setSendingMsg(null);
                    }
                    // ── BRANCH: VAN em deslocamento → notifica Promorar + Assistente Social ──
                    if(_proxBtn._waMsg==="desloc_origem_van_promorar"){
                      setSendingMsg(r.id);
                      setMsgSentStatus(function(p){var n={...p};n[r.id]="📡 Calculando ETA + buscando contatos...";return n;});
                      // 1) Busca destinatários AO VIVO no banco (anon key — leitura pública)
                      var _anonH={apikey:SUPA_KEY,Authorization:"Bearer "+SUPA_KEY};
                      var _destinatarios=[];
                      try{
                        var _prRes=await fetch(SUPA_URL+"/rest/v1/usuarios?perfil=eq.promorar&ativo=eq.true&select=nome,contato",{headers:_anonH});
                        var _prList=await _prRes.json();
                        if(Array.isArray(_prList)){
                          _prList.forEach(function(u){if(u.contato)_destinatarios.push({nome:u.nome,contato:u.contato,tipo:"Promorar"});});
                        }
                      }catch(_e1){console.warn("[van-desloc] erro buscando promorar:",_e1);}
                      if(r.assist_social){
                        try{
                          var _asRes=await fetch(SUPA_URL+"/rest/v1/assistentes_social?nome=eq."+encodeURIComponent(r.assist_social)+"&ativo=eq.true&select=nome,contato",{headers:_anonH});
                          var _asList=await _asRes.json();
                          if(Array.isArray(_asList)&&_asList[0]&&_asList[0].contato){
                            _destinatarios.push({nome:_asList[0].nome,contato:_asList[0].contato,tipo:"Social"});
                          }
                        }catch(_e2){console.warn("[van-desloc] erro buscando social:",_e2);}
                      }
                      if(_destinatarios.length===0){
                        setMsgSentStatus(function(p){var n={...p};n[r.id]="⚠️ Nenhum destinatário cadastrado (Promorar/Social)";return n;});
                        setTimeout(function(){setMsgSentStatus(function(p){var n={...p};delete n[r.id];return n;});},4500);
                        setSendingMsg(null);
                        return;
                      }
                      // 2) Calcula ETA
                      var _etaV=await calcETAGpsParaEndereco(r.origem||"",{timeout:6000});
                      var _etaLinhaV=_etaV
                        ?"🚐 Previsão de chegada na origem: *"+_etaV.etaStr+"* (em "+_etaV.durMin+" min)"
                        :"🚐 Previsão de chegada na origem: *em alguns minutos*";
                      // 3) Resolve dados da equipe pra colocar na mensagem
                      var _motNomeV=dados.motorista_nome||"Motorista";
                      var _supNomeV=(function(){var _s=r.supervisor_id?usuarios.find(function(u){return String(u.id)===String(r.supervisor_id);}):null;return _s?_s.nome:(r.approved_by_supervisor||"");})();
                      // 4) Monta mensagem
                      var _msgV="🚐 *Van em deslocamento Origem*\n\nA van da Telemim está saindo agora para a casa da família\n*"+(r.nome||"")+"* iniciar a mudança.\n\n"+_etaLinhaV+"\n📍 Endereço: "+(r.origem||"—")+"\n👨‍✈️ Motorista: *"+_motNomeV+"*"+(_supNomeV?"\n👷 Supervisor: *"+_supNomeV+"*":"")+(r.assist_social?"\n👩‍⚕️ Assistente Social: *"+r.assist_social+"*":"")+"\n\n— Telemim Mudanças";
                      // 5) Envia em paralelo pra todos os destinatários
                      var _envios=await Promise.all(_destinatarios.map(function(d){
                        return enviarWAPublico(d.contato,_msgV).then(function(res){return Object.assign({},d,{ok:res&&res.ok,error:res&&res.error});});
                      }));
                      var _okList=_envios.filter(function(e){return e.ok;});
                      var _failList=_envios.filter(function(e){return !e.ok;});
                      var _statusTxt="";
                      if(_okList.length>0){
                        _statusTxt="✅ Enviada para "+_okList.length+" destinatário(s): "+_okList.map(function(e){return e.nome+" ("+e.tipo+")";}).join(", ");
                      }
                      if(_failList.length>0){
                        if(_statusTxt)_statusTxt+=" • ";
                        _statusTxt+="⚠️ Falha em "+_failList.length+": "+_failList.map(function(e){return e.nome;}).join(", ");
                      }
                      // Determina cor do feedback baseado em qualquer sucesso
                      var _prefix=_okList.length>0?"✅ ":"⚠️ ";
                      setMsgSentStatus(function(p){var n={...p};n[r.id]=_prefix+_statusTxt.replace(/^[✅⚠️] /,"");return n;});
                      setTimeout(function(){setMsgSentStatus(function(p){var n={...p};delete n[r.id];return n;});},6000);
                      setSendingMsg(null);
                    }
                  };
                  return(<div>
                    <button onClick={_handleClickProm} disabled={!!updating[r.id]||sendingMsg===r.id} style={{width:"100%",padding:14,background:(updating[r.id]||sendingMsg===r.id)?"#94a3b8":_proxBtn.bg,color:"#fff",border:"none",borderRadius:12,fontWeight:800,fontSize:14,cursor:(updating[r.id]||sendingMsg===r.id)?"not-allowed":"pointer",boxShadow:"0 4px 12px rgba(0,0,0,0.15)",marginBottom:msgSentStatus[r.id]?6:10}}>{updating[r.id]?"⏳ Atualizando...":(sendingMsg===r.id?"📡 Enviando...":_proxBtn.label)}</button>
                    {msgSentStatus[r.id]&&<div style={{padding:"8px 12px",borderRadius:10,fontSize:12,fontWeight:700,textAlign:"center",marginBottom:10,background:msgSentStatus[r.id].startsWith("✅")?"#dcfce7":msgSentStatus[r.id].startsWith("⚠️")?"#fef3c7":"#eff6ff",color:msgSentStatus[r.id].startsWith("✅")?"#15803d":msgSentStatus[r.id].startsWith("⚠️")?"#92400e":"#1e40af",border:"1px solid "+(msgSentStatus[r.id].startsWith("✅")?"#86efac":msgSentStatus[r.id].startsWith("⚠️")?"#fcd34d":"#bfdbfe")}}>{msgSentStatus[r.id]}</div>}
                  </div>);
                })()}
                {r.contato&&<a href={"https://wa.me/55"+(r.contato||"").replace(/\D/g,"")} target="_blank" rel="noopener" style={{display:"block",textAlign:"center",padding:14,background:"#25d366",color:"#fff",borderRadius:12,fontWeight:800,fontSize:14,textDecoration:"none",boxShadow:"0 4px 12px rgba(37,211,102,0.3)",marginBottom:10}}>📱 WhatsApp do Beneficiário</a>}
              </div>
            );
          })
        )}
        <div style={{marginTop:12,textAlign:"center",padding:"10px",background:"#fffbeb",borderRadius:10,border:"1px solid #fcd34d"}}>
          <div style={{fontSize:11,color:"#92400e",fontWeight:600}}>⚠️ Este link expira à meia-noite de {_dfmt}.</div>
        </div>
        <div style={{textAlign:"center",fontSize:10,color:"#94a3b8",marginTop:8}}>🔄 Atualiza automaticamente a cada 30s</div>
      </div>
      {contatoPopup&&<div onClick={function(){setContatoPopup(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div onClick={function(e){e.stopPropagation();}} style={{background:"#fff",borderRadius:20,padding:"24px 20px",width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}><div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:12,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>{contatoPopup.tipo}</div><div style={{fontSize:20,fontWeight:900,color:"#1e293b"}}>{contatoPopup.nome}</div></div>{contatoPopup.contato?<div><div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:12,padding:"12px 16px",textAlign:"center",marginBottom:16}}><div style={{fontSize:11,fontWeight:600,color:"#64748b",marginBottom:4}}>📞 Telefone</div><div style={{fontSize:18,fontWeight:800,color:"#15803d"}}>{contatoPopup.contato}</div></div><div style={{display:"flex",gap:10}}><a href={"tel:"+contatoPopup.contato} style={{flex:1,display:"block",textAlign:"center",padding:"12px 0",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:800,fontSize:14,textDecoration:"none",boxShadow:"0 4px 12px rgba(37,99,235,0.3)"}}>📞 Ligar</a><a href={"https://wa.me/55"+(contatoPopup.contato||"").replace(/\D/g,"")} target="_blank" style={{flex:1,display:"block",textAlign:"center",padding:"12px 0",background:"#25d366",color:"#fff",borderRadius:12,fontWeight:800,fontSize:14,textDecoration:"none",boxShadow:"0 4px 12px rgba(37,211,102,0.3)"}}>📲 WhatsApp</a></div></div>:<div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"12px 16px",textAlign:"center",marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:"#dc2626"}}>📵 Telefone não cadastrado</div></div>}<button onClick={function(){setContatoPopup(null);}} style={{width:"100%",marginTop:12,padding:"10px 0",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer"}}>✕ Fechar</button></div></div>}
    </div>
  );
}
function MudancaTerceirizada({token}){
  var [dados,setDados]=useState(null);
  var [erro,setErro]=useState(null);
  var [loading,setLoading]=useState(true);
  var [aba,setAba]=useState("detalhes");
  var [iniciando,setIniciando]=useState(false);
  function carregarDados(){
    fetch(SUPA_URL+"/functions/v1/consumir-link-mudanca?token="+encodeURIComponent(token),{headers:{"apikey":SUPA_KEY}})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok){setDados(d);}else if(!dados){setErro(d.error||"Link inválido.");}setLoading(false);})
      .catch(function(){if(!dados)setErro("Erro de conexão.");setLoading(false);});
  }
  useEffect(function(){carregarDados();},[token]);
  // Auto-refresh a cada 30s
  useEffect(function(){var iv=setInterval(carregarDados,30000);return function(){clearInterval(iv);};},[token]);
  function handleIniciar(){
    setIniciando(true);
    fetch(SUPA_URL+"/functions/v1/iniciar-mudanca-terceirizada",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({token:token})})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok&&d.mudanca){setDados(function(prev){return Object.assign({},prev,{mudanca:d.mudanca});});}else{alert(d.error||"Erro ao iniciar");}setIniciando(false);})
      .catch(function(){alert("Erro de conexão");setIniciando(false);});
  }
  if(loading) return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc"}}><div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:8}}>🏠</div><div style={{fontWeight:700,fontSize:14,color:"#64748b"}}>Carregando mudança...</div></div></div>);
  if(erro) return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#fef2f2",padding:20}}><div style={{textAlign:"center",maxWidth:360}}><div style={{fontSize:48,marginBottom:12}}>⚠️</div><div style={{fontWeight:800,fontSize:16,color:"#dc2626",marginBottom:8}}>Link Inválido ou Expirado</div><div style={{fontSize:13,color:"#991b1b"}}>{erro}</div></div></div>);
  var m=dados.mudanca;
  var _dfmt=m.data?m.data.slice(8)+"/"+m.data.slice(5,7)+"/"+m.data.slice(0,4):"";
  var _veiculos=[m.van&&"🚐 Van",m.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"—";
  var _expFmt=dados.expira_em?(function(){var p=(dados.expira_em||"").slice(0,10).split("-");return p[2]+"/"+p[1]+"/"+p[0]+" às 23:59";})():"";
  var _conclStatuses=["Concluido","Concluído","concluido","concluida","realizado","realizada"];
  var _isConcl=_conclStatuses.indexOf(m.status)>=0||m.termino_em;
  var _isIniciada=m.status==="Realizando"||m.inicio_mudanca_em;
  // Step tracker
  var _fmtH=function(ts){if(!ts)return null;var d=new Date(ts);if(isNaN(d.getTime()))return null;return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
  var _steps=[
    {key:"deslocamento",label:"Rumo à Origem",icon:"🚐",time:m.inicio_van_em||m.van_saiu_em||m.inicio_caminhao_em||m.caminhao_saiu_em||m.inicio_mudanca_em},
    {key:"origem",label:"Na Origem",icon:"📍",time:m.chegou_origem_van_em||m.chegou_origem_cam_em},
    {key:"carregando",label:"Carregando",icon:"📦",time:m.saiu_destino_van_em||m.saiu_destino_cam_em?m.chegou_origem_van_em||m.chegou_origem_cam_em:null},
    {key:"destino",label:"Rumo Destino",icon:"🚚",time:m.saiu_destino_van_em||m.saiu_destino_cam_em},
    {key:"descarregando",label:"No Destino",icon:"📦",time:m.chegada_van_em||m.chegada_caminhao_em},
    {key:"concluido",label:"Concluído",icon:"🏁",time:m.termino_em||m.termino_van_em||m.termino_caminhao_em}
  ];
  var _activeIdx=-1;
  for(var si=_steps.length-1;si>=0;si--){if(_steps[si].time){_activeIdx=si;break;}}
  if(_isConcl)_activeIdx=5;
  return(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#7c3aed)",padding:"20px 16px 16px",color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>TELEMIM — Mudança Terceirizada</div>
        <div style={{fontSize:18,fontWeight:900,marginTop:4}}>🏠 {m.nome||"Beneficiário"}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",marginTop:2}}>📅 {_dfmt}{m.horario?" · ⏰ "+m.horario:""}</div>
        {dados.criado_por&&<div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:4}}>Compartilhado por: {dados.criado_por}</div>}
      </div>
      {/* Abas */}
      <div style={{display:"flex",background:"#fff",borderBottom:"2px solid #e2e8f0"}}>
        <button onClick={function(){setAba("detalhes");}} style={{flex:1,padding:"12px 0",border:"none",background:aba==="detalhes"?"#fff":"#f8fafc",borderBottom:aba==="detalhes"?"3px solid #7c3aed":"3px solid transparent",fontWeight:800,fontSize:13,color:aba==="detalhes"?"#7c3aed":"#94a3b8",cursor:"pointer"}}>📋 Detalhes</button>
        <button onClick={function(){setAba("monitoramento");}} style={{flex:1,padding:"12px 0",border:"none",background:aba==="monitoramento"?"#fff":"#f8fafc",borderBottom:aba==="monitoramento"?"3px solid #7c3aed":"3px solid transparent",fontWeight:800,fontSize:13,color:aba==="monitoramento"?"#7c3aed":"#94a3b8",cursor:"pointer"}}>📡 Monitoramento</button>
      </div>
      <div style={{padding:"16px 12px 80px"}}>
        {_isConcl&&<div style={{background:"linear-gradient(135deg,#16a34a,#15803d)",borderRadius:10,padding:"12px 14px",textAlign:"center",marginBottom:14,boxShadow:"0 2px 8px rgba(22,163,74,0.4)"}}>
          <div style={{fontSize:18,fontWeight:900,color:"#fff",letterSpacing:2}}>✅ FINALIZADA</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.85)",marginTop:3,fontWeight:600}}>Mudança concluída com sucesso</div>
        </div>}
        {aba==="detalhes"&&(
          <div>
            <div style={{background:_isConcl?"#f0fdf4":"#fff",borderRadius:14,border:"2px solid "+(_isConcl?"#86efac":"#e2e8f0"),padding:"16px",marginBottom:12,boxShadow:_isConcl?"0 4px 16px rgba(22,163,74,0.15)":"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontWeight:800,fontSize:18,color:"#1e293b",marginBottom:12}}>{m.nome||"Sem nome"}</div>
              {m.selo&&<div style={{display:"inline-block",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:700,color:"#0369a1",marginBottom:10}}>🏷️ {m.selo}</div>}
              <div style={{display:"grid",gap:10,marginTop:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📅</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>DATA</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{_dfmt}{m.horario?" às "+m.horario:""}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📍</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>COMUNIDADE</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{m.comunidade||"—"}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📦</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>ORIGEM</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{m.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(m.origem)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none"}}>{m.origem} 🗺️</a>:"—"}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🏠</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>DESTINO</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{m.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(m.destino)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none"}}>{m.destino} 🗺️</a>:"—"}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🚗</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>VEÍCULOS</div><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{_veiculos}</div></div></div>
                {m.contato&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📱</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>CONTATO BENEFICIÁRIO</div><div style={{fontSize:14,fontWeight:700,color:"#2563eb"}}><a href={"tel:"+m.contato} style={{color:"#2563eb",textDecoration:"none"}}>{m.contato}</a></div></div></div>}
                {m.observacao&&<div style={{display:"flex",alignItems:"flex-start",gap:8}}><span style={{fontSize:16}}>📝</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>OBSERVAÇÕES</div><div style={{fontSize:13,color:"#475569",fontStyle:"italic"}}>{m.observacao}</div></div></div>}
                {m.assist_social&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>👩‍⚕️</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>ASSISTENTE SOCIAL</div><div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>{m.assist_social}</div></div></div>}
              </div>
              {m.contato&&<a href={"https://wa.me/55"+(m.contato||"").replace(/\D/g,"")} target="_blank" rel="noopener" style={{display:"block",marginTop:16,textAlign:"center",padding:14,background:"#25d366",color:"#fff",borderRadius:12,fontWeight:800,fontSize:14,textDecoration:"none",boxShadow:"0 4px 12px rgba(37,211,102,0.3)"}}>📱 WhatsApp do Beneficiário</a>}
            </div>
          </div>
        )}
        {aba==="monitoramento"&&(
          <div>
            {/* Status Badge */}
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{display:"inline-block",padding:"8px 20px",borderRadius:20,fontWeight:800,fontSize:14,background:_isConcl?"#dcfce7":_isIniciada?"#eff6ff":"#fff7ed",color:_isConcl?"#15803d":_isIniciada?"#1d4ed8":"#c2410c",border:"2px solid "+(_isConcl?"#86efac":_isIniciada?"#93c5fd":"#fed7aa")}}>{_isConcl?"✅ Concluída":_isIniciada?"🔧 Em Andamento":"⏳ Aguardando Início"}</div>
            </div>
            {/* Step Tracker */}
            <div style={{background:"#fff",borderRadius:14,border:"2px solid #e2e8f0",padding:"16px 10px",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",overflowX:"auto"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>📡 Progresso da Mudança</div>
              <div style={{display:"flex",alignItems:"flex-start",gap:0,minWidth:500}}>
                {_steps.map(function(step,idx){
                  var isDone=idx<_activeIdx;
                  var isActive=idx===_activeIdx;
                  var _h=_fmtH(step.time);
                  return(
                    <div key={step.key} style={{display:"flex",alignItems:"flex-start",flex:1}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:0,minWidth:48}}>
                        <div style={{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,background:isDone?"#16a34a":isActive?"#2563eb":"#e2e8f0",color:isDone||isActive?"#fff":"#94a3b8",fontWeight:800,boxShadow:isActive?"0 0 0 4px rgba(37,99,235,0.25)":"none",border:isActive?"3px solid #93c5fd":"2px solid "+(isDone?"#16a34a":"#e2e8f0")}}>{isDone?"✓":step.icon}</div>
                        <div style={{fontSize:9,fontWeight:isDone||isActive?700:500,color:isDone?"#16a34a":isActive?"#2563eb":"#94a3b8",marginTop:4,textAlign:"center",whiteSpace:"nowrap"}}>{step.label}</div>
                        {_h?<div style={{fontSize:11,fontWeight:900,color:isDone?"#15803d":isActive?"#1d4ed8":"#64748b",marginTop:2}}>{_h}</div>:<div style={{fontSize:9,color:"#cbd5e1",marginTop:2}}>—</div>}
                      </div>
                      {idx<_steps.length-1&&<div style={{flex:1,height:3,background:isDone?"#16a34a":"#e2e8f0",borderRadius:2,margin:"0 2px",marginTop:17}}></div>}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Info rápido */}
            <div style={{background:"#fff",borderRadius:14,border:"2px solid #e2e8f0",padding:"16px",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{display:"grid",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📦</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>ORIGEM</div><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{m.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(m.origem)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none"}}>{m.origem} 🗺️</a>:"—"}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🏠</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>DESTINO</div><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{m.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(m.destino)} target="_blank" rel="noopener" style={{color:"#2563eb",textDecoration:"none"}}>{m.destino} 🗺️</a>:"—"}</div></div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>🚗</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>VEÍCULOS</div><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{_veiculos}</div></div></div>
                {m.contato&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📱</span><div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>CONTATO</div><div style={{fontSize:13,fontWeight:700}}><a href={"tel:"+m.contato} style={{color:"#2563eb",textDecoration:"none"}}>{m.contato}</a></div></div></div>}
              </div>
            </div>
            {/* Botão Iniciar — só aparece se não iniciada e não concluída */}
            {!_isConcl&&!_isIniciada&&(
              <button onClick={handleIniciar} disabled={iniciando} style={{width:"100%",padding:"16px 0",borderRadius:12,border:"none",background:iniciando?"#94a3b8":"#7c3aed",color:"#fff",fontWeight:900,fontSize:15,cursor:iniciando?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 4px 16px rgba(124,58,237,0.35)",marginBottom:12}}>
                {iniciando?"⏳ Iniciando...":"🔧 Iniciar Mudança"}
              </button>
            )}
            {_isIniciada&&!_isConcl&&(
              <div style={{textAlign:"center",padding:"14px",background:"#eff6ff",borderRadius:12,border:"2px solid #93c5fd",marginBottom:12}}>
                <div style={{fontSize:14,fontWeight:800,color:"#1d4ed8"}}>🔧 Mudança em Andamento</div>
                <div style={{fontSize:11,color:"#3b82f6",marginTop:4}}>Iniciada às {_fmtH(m.inicio_mudanca_em)||"—"}</div>
              </div>
            )}
            {_isConcl&&(
              <div style={{textAlign:"center",padding:"14px",background:"#dcfce7",borderRadius:12,border:"2px solid #86efac",marginBottom:12}}>
                <div style={{fontSize:14,fontWeight:800,color:"#15803d"}}>✅ Mudança Concluída</div>
              </div>
            )}
            <div style={{textAlign:"center",fontSize:10,color:"#94a3b8",marginTop:8}}>🔄 Atualiza automaticamente a cada 30s</div>
          </div>
        )}
        {/* Expira */}
        <div style={{marginTop:16,textAlign:"center",padding:"10px",background:"#fffbeb",borderRadius:10,border:"1px solid #fcd34d"}}>
          <div style={{fontSize:11,color:"#92400e",fontWeight:600}}>⚠️ Este link expira em: {_expFmt}</div>
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
  const [confirmDeleteMotivo,setConfirmDeleteMotivo]=useState("");
  const [cadastroWarnings,setCadastroWarnings]=useState(null);
  // Auditoria (Item 1)
  const [auditSubTab,setAuditSubTab]=useState("lixeira");
  const [auditLixeira,setAuditLixeira]=useState([]);
  const [auditErros,setAuditErros]=useState([]);
  const [auditHist,setAuditHist]=useState([]);
  const [auditLoading,setAuditLoading]=useState(false);
  const [auditFiltro,setAuditFiltro]=useState({periodo:"30d",supervisor:"",busca:""});
  const [auditHistQuery,setAuditHistQuery]=useState("");
  const [confirmRestore,setConfirmRestore]=useState(null);
  const [auditSaude,setAuditSaude]=useState(null);
  const [auditMoradorQuery,setAuditMoradorQuery]=useState("");
  const [auditMorador,setAuditMorador]=useState(null);
  const [confirmReenvio,setConfirmReenvio]=useState(null);
  function _confirmarReenvio(opts){
    return new Promise(function(resolve){
      setConfirmReenvio(Object.assign({},opts,{
        onConfirm:function(){setConfirmReenvio(null);resolve(true);},
        onCancel:function(){setConfirmReenvio(null);resolve(false);}
      }));
    });
  }
  const [reagendarModal,setReagendarModal]=useState(null);
  const [reagendarData,setReagendarData]=useState("");
  const [reagendarMotivo,setReagendarMotivo]=useState("");
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
  const [isDesktop,setIsDesktop]=useState(typeof window!=="undefined"&&window.innerWidth>=1024);
  useEffect(function(){function _onResize(){setIsDesktop(window.innerWidth>=1024);}window.addEventListener("resize",_onResize);return function(){window.removeEventListener("resize",_onResize);};},[]);
  const [periodoFin,setPeriodoFin]=useState("semana");
  const [periodoFinMot,setPeriodoFinMot]=useState("semana");
  const [despPend,setDespPend]=useState({});
  const [calMes,setCalMes]=useState(new Date().getMonth());
  const [calAno,setCalAno]=useState(new Date().getFullYear());
  const [calDiaSel,setCalDiaSel]=useState(null);
  const [magicToken,setMagicToken]=useState(null);
  const [magicLoading,setMagicLoading]=useState(false);
  const [magicData,setMagicData]=useState(null);
  const [terceirizarModal,setTerceirizarModal]=useState(null);
  const [terceirizarSel,setTerceirizarSel]=useState("");
  const [terceirizarSaving,setTerceirizarSaving]=useState(false);
  const [mudLinkToken,setMudLinkToken]=useState(null);
  const [mudLinkLoading,setMudLinkLoading]=useState(false);
  const [tercInlineId,setTercInlineId]=useState(null);
  const [tercInlineLoading,setTercInlineLoading]=useState(null);
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
    atribuida:{ativo:false,dest:["mot_van","mot_caminhao","supervisor"],msg:"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDE9B *MUDAN\u00C7A ATRIBU\u00CDDA*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDCDE Contato: {contato}\n\uD83D\uDCC5 Data: *{data}*\n\u23F0 Hora: *{hora}*\n\n\uD83D\uDCCD *Origem:*\n{origem}\n\uD83D\uDDFA\uFE0F {mapa_origem}\n\n\uD83D\uDCCD *Destino:*\n{destino}\n\uD83D\uDDFA\uFE0F {mapa_destino}\n\n\uD83D\uDC77 *Supervisor:* {supervisor}\n\uD83D\uDD27 TELEMIM - PROMORAR - *VERIFIQUE O APP!*"},
    iniciada:{ativo:false,dest:["admin","supervisor","cliente"],msg:"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDE80 *MUDAN\u00C7A INICIADA*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDCC5 Data: *{data}*\n\uD83D\uDE9A Motorista: *{motorista}*\n\uD83D\uDD27 TELEMIM - PROMORAR"},
    deslocamento:{ativo:false,dest:["admin","supervisor","cliente","assist_social"],msg:"\uD83D\uDE9A *Sua mudan\u00E7a est\u00E1 a caminho!*\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDCCD Saindo de: {origem}\n\uD83C\uDFE0 Indo para: {destino}\n\uD83D\uDE97 Motorista: *{motorista}*\n\uD83D\uDC77 Supervisor: *{supervisor}*\n\uD83D\uDCCF Dist\u00E2ncia: {distancia}\n\u23F1\uFE0F Tempo estimado: {tempo}\n\uD83D\uDD50 Previs\u00E3o de chegada: *{previsao}*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDD27 TELEMIM - PROMORAR"},
    no_destino:{ativo:false,dest:["admin","supervisor","cliente"],msg:"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDCCD *MOTORISTA NO DESTINO*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDE9A Motorista: *{motorista}*\n\uD83D\uDD27 TELEMIM - PROMORAR"},
    finalizada:{ativo:false,dest:["admin","supervisor","cliente"],msg:"\u2705 Mudanca finalizada!\nCliente: {cliente}\nMotorista: {motorista}\n\uD83D\uDD27 TELEMIM - PROMORAR"},
    lembrete:{ativo:false,dest:["mot_van","mot_caminhao","supervisor","cliente"],msg:"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\u23F0 *LEMBRETE DE MUDAN\u00C7A*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDC64 Cliente: *{cliente}*\n\uD83D\uDCC5 Amanh\u00E3: *{data}*\n\u23F0 Hora: *{hora}*\n\uD83D\uDCCD Origem: {origem}\n\uD83D\uDCCD Destino: {destino}\n\uD83D\uDC77 Supervisor: {supervisor}\n\uD83D\uDD27 TELEMIM - PROMORAR - *VERIFIQUE O APP!*"},
    deslocamento_morador:{ativo:true,dest:["assist_social"],msg:"Ol\u00E1, {assistente}! \uD83D\uDE9A\nPassando para avisar que a nossa equipe de mudan\u00E7a j\u00E1 est\u00E1 a caminho da resid\u00EAncia da *{cliente}*. Eu (*{supervisor}*) j\u00E1 estou me deslocando para l\u00E1 tamb\u00E9m. Nos encontramos no local para acompanhar tudo de perto. At\u00E9 j\u00E1!"}
  });
  const [isUploading,setIsUploading]=useState(false);
  const [isApproving,setIsApproving]=useState({});
  const [waLoading,setWaLoading]=useState(false);
  const [configuracoes,setConfiguracoes]=useState([]);
  const [showViewPDF,setShowViewPDF]=useState(false);
  const [mudViewPDF,setMudViewPDF]=useState(null);
  const [confirmFinAg,setConfirmFinAg]=useState(null);
  const [cancelModal,setCancelModal]=useState(null);
  const [cancelMotivo,setCancelMotivo]=useState("");
  const [pendModal,setPendModal]=useState(null);
  const [pendMotivo,setPendMotivo]=useState("");
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
          if(soundEnabled)playNotifSound('insert');
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
          if(soundEnabled)playNotifSound('insert');
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'agenda'},function(p){
          var _oldA=null;setAgenda(function(prev){_oldA=prev.find(function(a){return a.id===p.new.id;});if(prev.some(function(a){return a.id===p.new.id;})){return prev.map(function(a){return a.id===p.new.id?Object.assign({},a,p.new):a;});}return [p.new].concat(prev);});
          if(soundEnabled){var _cs=['concluida','concluido','realizada','realizado','Concluido'];if(_cs.indexOf(p.new.status)>=0)playNotifSound('concluida');else if(_oldA&&_oldA.status!==p.new.status)playNotifSound('status');}
        })
        .on('postgres_changes',{event:'DELETE',schema:'public',table:'agenda'},function(p){
          setAgenda(function(prev){return prev.filter(function(a){return a.id!==p.old.id;});});
        })
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'gps_tracking'},function(p){
          if(p.new){setGpsPositions(function(prev){var _found=false;var _updated=prev.map(function(g){if(g.motorista_id===p.new.motorista_id&&g.agenda_id===p.new.agenda_id){_found=true;return p.new;}return g;});if(!_found)_updated.push(p.new);return _updated;});}
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
  const [soundEnabled,setSoundEnabled]=useState(true);
  const [equipeSalvaMsg,setEquipeSalvaMsg]=useState("");
  const [contasPagar,setContasPagar]=useState([]);
  const [contasHist,setContasHist]=useState([]);
  const [novaContaForm,setNovaContaForm]=useState({tipo:'van',descricao:'',valor:'',beneficiario:'',telefone:'',vencimento:''});
  const [showNovaConta,setShowNovaConta]=useState(false);
  const [contasSemana,setContasSemana]=useState([]);
  const [custosSemana,setCustosSemana]=useState([]);
  const [contasFilter,setContasFilter]=useState("todas");
  const [contaEditId,setContaEditId]=useState(null);const [totalEditId,setTotalEditId]=useState(null);const [totalEditVal,setTotalEditVal]=useState("");
  const [solicitacoesFin,setSolicitacoesFin]=useState([]);
  const [solicitacoesLoaded,setSolicitacoesLoaded]=useState(false);
  const [supFinEditMode,setSupFinEditMode]=useState(null);// {pId,idx,data,numMud,numAj,val,cargo}
  const [supFinMotivo,setSupFinMotivo]=useState("");
  const [supFinDelConfirm,setSupFinDelConfirm]=useState(null);// {scope:"dia"|"ajudante",ajId,ajNome,data,numMud,valor}
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
  const [liveMapOpen,setLiveMapOpen]=useState(true);
  const [liveMapVehicles,setLiveMapVehicles]=useState([]);// [{motId,nome,veiculo,lat,lng,speed,clienteNome,origem,destino,eta,route,destCoords}]
  const [etaRotaCache,setEtaRotaCache]=useState({});// cache: {"origem|destino":{distKm,durMin,previsao}}

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

  // ── GPS: Traccar device ID — unique per motorista ─────────────────────────
  function _traccarDevId(userId){
    return userId?userId.substring(0,8).toUpperCase():"UNKNOWN";
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
      var _devId=_traccarDevId(motoristaId||(usuario&&usuario.id));
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

  // ── GPS: Clean address for geocoding ────────────────────────────────────────
  function _cleanAddressForGeo(addr){
    if(!addr)return "";
    var c=addr.replace(/,?\s*s\/n[º°]?\b/gi,"").replace(/,?\s*n[º°]\s*\d+/gi,"").replace(/,?\s*nº\s*\d+/gi,"").replace(/\bRef[\.:]\s*[^,]*/gi,"").replace(/\bCom\.\s*/gi,"").replace(/\bComunidade\s+(do|da|de|dos|das)?\s*/gi,"").replace(/\bpróx\.?\s*[^,]*/gi,"").replace(/\b\d+[ªºa]?\s*Travessa\b/gi,"Travessa").replace(/\s{2,}/g," ").replace(/,\s*,/g,",").replace(/,\s*$/,"").trim();
    if(!/recife|jaboatão|olinda|paulista|camaragibe|cabo/i.test(c))c+=", Recife PE";
    return c;
  }

  // ── GPS: Fetch ETA via Mapbox Directions ───────────────────────────────────
  async function gpsCalcEta(fromLat,fromLng,toAddress){
    try{
      // Geocode destination address (cleaned + proximity to Recife)
      var _cleanAddr=_cleanAddressForGeo(toAddress);
      var geoUrl="https://api.mapbox.com/geocoding/v5/mapbox.places/"+encodeURIComponent(_cleanAddr)+".json?access_token="+MAPBOX_TOKEN+"&limit=1&country=BR&proximity=-34.87,-8.05&bbox=-35.2,-8.3,-34.7,-7.8";
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

  // ── Calcular distância e duração entre Origem e Destino (Google Distance Matrix via Worker) ──
  var ETA_PROXY_URL="https://telemim-eta-proxy.telemim-app.workers.dev";
  async function calcRotaGoogle(origem,destino,horario){
    if(!origem||!destino) return null;
    var _key=origem.trim().toLowerCase()+"|"+destino.trim().toLowerCase();
    if(etaRotaCache[_key]) return etaRotaCache[_key];
    try{
      var _resp=await fetch(ETA_PROXY_URL+"?origem="+encodeURIComponent(origem)+"&destino="+encodeURIComponent(destino));
      var _data=await _resp.json();
      if(_data.error) return null;
      var _previsao="";
      if(horario){
        var _hp=horario.split(":");
        var _hm=parseInt(_hp[0]||"0")*60+parseInt(_hp[1]||"0")+_data.durMin;
        var _hh=Math.floor(_hm/60);var _mm=_hm%60;
        _previsao=String(_hh).padStart(2,"0")+":"+String(_mm).padStart(2,"0")+"h";
      }
      var _res={distKm:_data.distKm,durMin:_data.durMin,durTxt:_data.durTxt,previsao:_previsao};
      setEtaRotaCache(function(prev){var n=Object.assign({},prev);n[_key]=_res;return n;});
      return _res;
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
  // ── SOLICITAÇÕES FINANCEIRAS ───────────────────────────────────────────
  async function loadSolicitacoesFin(){
    try{
      var res=await fetch(SUPA_URL+"/rest/v1/solicitacoes_financeiras?order=criado_em.desc&limit=100",{headers:getH()});
      if(!res.ok)return;
      var dados=await res.json();
      if(dados&&Array.isArray(dados)){setSolicitacoesFin(dados);setSolicitacoesLoaded(true);}
    }catch(e){}
  }
  async function criarSolicitacao(sol){
    try{
      var res=await fetch(SUPA_URL+"/rest/v1/solicitacoes_financeiras",{method:"POST",headers:{...getH(),"Prefer":"return=representation"},body:JSON.stringify([sol])});
      if(res.ok){var d=await res.json();if(d&&d[0])setSolicitacoesFin(function(p){return [d[0],...p];});return true;}
    }catch(e){}
    return false;
  }
  async function responderSolicitacao(id,status,adminId,adminNome){
    try{
      var body={status:status,admin_id:adminId,admin_nome:adminNome,respondido_em:new Date().toISOString()};
      await fetch(SUPA_URL+"/rest/v1/solicitacoes_financeiras?id=eq."+id,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify(body)});
      setSolicitacoesFin(function(p){return p.map(function(s){return s.id===id?{...s,...body}:s;});});
    }catch(e){}
  }

  // ═══ AUDITORIA (Item 1) ═══════════════════════════════════════════
  async function loadAuditLixeira(){
    setAuditLoading(true);
    try{
      var _dt=new Date();
      var _dias=auditFiltro.periodo==="7d"?7:auditFiltro.periodo==="30d"?30:auditFiltro.periodo==="90d"?90:365;
      _dt.setDate(_dt.getDate()-_dias);
      var _iso=_dt.toISOString();
      var _h=getH();
      var _q="deleted_at=not.is.null&deleted_at=gte."+_iso+"&order=deleted_at.desc&limit=200";
      var _r1=await fetch(SUPA_URL+"/rest/v1/mudancas?"+_q,{headers:_h});
      var _r2=await fetch(SUPA_URL+"/rest/v1/agenda?"+_q,{headers:_h});
      var _muds=_r1.ok?await _r1.json():[];
      var _ags=_r2.ok?await _r2.json():[];
      var _list=_muds.map(function(m){return Object.assign({},m,{_tipo:"mudanca"});}).concat(_ags.map(function(a){return Object.assign({},a,{_tipo:"agenda"});}));
      _list.sort(function(a,b){return (b.deleted_at||"").localeCompare(a.deleted_at||"");});
      setAuditLixeira(_list);
    }catch(e){try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"loadAuditLixeira"}});}catch(_){}}
    setAuditLoading(false);
  }
  async function loadAuditErros(){
    setAuditLoading(true);
    try{
      var _dt=new Date();_dt.setDate(_dt.getDate()-30);
      var _r=await fetch(SUPA_URL+"/rest/v1/auditoria?acao=in.(trigger_sync_agenda_to_mudancas_erro,sync_erro,trigger_erro)&criado_em=gte."+_dt.toISOString()+"&order=criado_em.desc&limit=200",{headers:getH()});
      if(_r.ok)setAuditErros(await _r.json());
    }catch(e){try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"loadAuditErros"}});}catch(_){}}
    setAuditLoading(false);
  }
  async function loadAuditHist(query){
    if(!query||query.length<2){setAuditHist([]);return;}
    setAuditLoading(true);
    try{
      var _q=/^\d+$/.test(query)?"registro_id=eq."+query:"or=(dados_antes.ilike.*"+query+"*,dados_depois.ilike.*"+query+"*)";
      var _r=await fetch(SUPA_URL+"/rest/v1/auditoria?"+_q+"&order=criado_em.desc&limit=100",{headers:getH()});
      if(_r.ok)setAuditHist(await _r.json());
    }catch(e){try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"loadAuditHist"}});}catch(_){}}
    setAuditLoading(false);
  }
  async function restaurarItem(item){
    try{
      var _tbl=item._tipo==="mudanca"?"mudancas":"agenda";
      var _r=await fetch(SUPA_URL+"/rest/v1/"+_tbl+"?id=eq."+item.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({deleted_at:null,deleted_by:null})});
      if(_r.ok){
        setAuditLixeira(function(p){return p.filter(function(x){return!(x._tipo===item._tipo&&x.id===item.id);});});
        if(item._tipo==="mudanca"){var _rl=await fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+item.id,{headers:getH()});if(_rl.ok){var _d=await _rl.json();if(_d&&_d[0])setMudancas(function(p){return [_d[0]].concat(p.filter(function(x){return x.id!==item.id;}));});}}
        else {var _ra=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+item.id,{headers:getH()});if(_ra.ok){var _da=await _ra.json();if(_da&&_da[0])setAgenda(function(p){return [_da[0]].concat(p.filter(function(x){return x.id!==item.id;}));});}}
        setSyncStatus("✅ Restaurado!");
      } else { alert("Erro ao restaurar (HTTP "+_r.status+")"); }
    }catch(e){alert("Erro: "+e.message);try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"restaurarItem"}});}catch(_){}}
  }
  async function loadAuditSaude(){
    setAuditLoading(true);
    try{
      var _h=getH();
      var _hj=new Date();var _ini7=new Date(_hj);_ini7.setDate(_ini7.getDate()-7);
      var _iso7=_ini7.toISOString().slice(0,10);
      var _ini24=new Date(_hj);_ini24.setHours(_ini24.getHours()-24);
      var _iso24=_ini24.toISOString();
      var _rm=await fetch(SUPA_URL+"/rest/v1/mudancas?data=gte."+_iso7+"&deleted_at=is.null&select=id,data,nome,status,medicao&limit=2000",{headers:_h});
      var _ra=await fetch(SUPA_URL+"/rest/v1/agenda?data=gte."+_iso7+"&deleted_at=is.null&select=id,data,nome,status,medicao,supervisor_id&limit=2000",{headers:_h});
      var _re=await fetch(SUPA_URL+"/rest/v1/auditoria?acao=in.(trigger_sync_agenda_to_mudancas_erro,sync_erro)&criado_em=gte."+_iso24+"&select=id,criado_em&limit=500",{headers:_h});
      var _mud7=_rm.ok?await _rm.json():[];
      var _ag7=_ra.ok?await _ra.json():[];
      var _err24=_re.ok?await _re.json():[];
      var _concl=["concluida","concluída","concluido","concluído","realizada","realizado","executada","executado"];
      var _agsConcl=_ag7.filter(function(a){return _concl.includes(String(a.status||"").toLowerCase());});
      var _orphans=[];
      _agsConcl.forEach(function(a){
        var _k=(a.nome||"").toLowerCase().trim();
        var _exists=_mud7.some(function(m){return m.data===a.data&&(m.nome||"").toLowerCase().trim()===_k;});
        if(!_exists)_orphans.push(a);
      });
      var _health=_agsConcl.length>0?Math.round(((_agsConcl.length-_orphans.length)/_agsConcl.length)*100):100;
      var _porDia={};
      for(var i=6;i>=0;i--){var d=new Date(_hj);d.setDate(d.getDate()-i);var k=d.toISOString().slice(0,10);_porDia[k]={data:k,mud:0,m3:0};}
      _mud7.forEach(function(m){if(_porDia[m.data])_porDia[m.data].mud++;if(_porDia[m.data])_porDia[m.data].m3+=Number(m.medicao||0);});
      setAuditSaude({orphans:_orphans,triggerHealth:_health,erros24h:_err24.length,mudancasSemana:_mud7.length,m3Semana:_mud7.reduce(function(s,m){return s+Number(m.medicao||0);},0),agendasConcluidasSemana:_agsConcl.length,porDia:Object.values(_porDia)});
    }catch(e){try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"loadAuditSaude"}});}catch(_){}}
    setAuditLoading(false);
  }
  async function loadAuditMorador(query){
    if(!query||query.trim().length<3){setAuditMorador(null);return;}
    setAuditLoading(true);
    try{
      var _h=getH();
      var _q=encodeURIComponent("*"+query.trim()+"*");
      var _rm=await fetch(SUPA_URL+"/rest/v1/mudancas?nome=ilike."+_q+"&order=data.desc&limit=200",{headers:_h});
      var _ra=await fetch(SUPA_URL+"/rest/v1/agenda?nome=ilike."+_q+"&order=data.desc&limit=200",{headers:_h});
      var _muds=_rm.ok?await _rm.json():[];
      var _ags=_ra.ok?await _ra.json():[];
      var _agsNew=_ags.filter(function(a){return !_muds.some(function(m){return m.data===a.data&&(m.nome||"").toLowerCase().trim()===(a.nome||"").toLowerCase().trim();});});
      setAuditMorador({query:query,mudancas:_muds,agendas:_agsNew});
    }catch(e){try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"loadAuditMorador"}});}catch(_){}}
    setAuditLoading(false);
  }
  function exportAuditCSV(){
    var rows=[["Tipo","ID","Nome","Data","Status","m³","Deletado em","Por (motivo)"]];
    auditLixeira.forEach(function(it){rows.push([it._tipo,it.id,it.nome||"",it.data||"",it.status||"",it.medicao||"",it.deleted_at||"",it.deleted_by||""]);});
    var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
    var blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"});
    var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="auditoria_lixeira_"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url);
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
      // PROTOCOLO: Cancelada ou Pendente NUNCA são ativas no monitoramento
      var _st=item.status;
      if(_st==="cancelada"||_st==="pendente"||_st==="pendente_social") return false;
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
      // PROTOCOLO: Itens cancelados não aparecem no monitoramento
      if(item.status==="cancelada") return;
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
  useEffect(function(){if(prestadores.length===0)loadPrestadores();if((isAdmin||isPromorar||isSocial||isSupervisor)&&listaUsuarios.length===0&&(tab==="dashboard"||tab==="monitoramento"||tab==="agenda"||tab==="lista"||tab==="contas"||tab==="financeiro"||tab==="financeiro_sup"))carregarUsuarios();if(isMotorista&&(tab==="dashboard"||tab==="fin_mot"||tab==="registros_mot")){_ensureAuth().catch(function(){}).then(function(){loadMud();loadAg();});}if((tab==="financeiro_sup"||tab==="financeiro"||tab==="contas")&&!solicitacoesLoaded)loadSolicitacoesFin();if(tab==="auditoria"&&isAdmin){if(auditSubTab==="lixeira"&&auditLixeira.length===0)loadAuditLixeira();else if(auditSubTab==="erros"&&auditErros.length===0)loadAuditErros();else if(auditSubTab==="saude"&&!auditSaude)loadAuditSaude();}if(tab==="financeiro_sup"||(tab==="equipe"&&isSupervisor)){loadAjudantes();loadEquipeDia();loadEquipePadrao();}if(tab==="equipe"||tab==="config"||tab==="social"||tab==="dashboard")loadAssistentesSocial();},[tab]);
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
        loadSolicitacoesAlmoco();
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
    /* Polling fallback: aumentado de 30s para 5min (Realtime via WebSocket cobre o caso normal) */
    var pollId=setInterval(function(){if(document.visibilityState==="visible"){loadMud();loadAg();}},5*60*1000);
    // GPS positions auto-refresh every 15s for monitoring
    var gpsPollId=setInterval(function(){
      if(document.visibilityState!=="visible") return;
      var _hj2=new Date().toISOString().slice(0,10);
      (agenda||[]).filter(function(a){return a.data===_hj2&&!a.deleted_at&&a.supervisor_id;}).forEach(function(a){
        var _motId=a.motorista_van_id||a.motorista_caminhao_id;
        if(_motId){
          gpsLoadPositions(a.id,_motId).then(function(pos){
            if(pos){setGpsPositions(function(prev){var _found=false;var _updated=prev.map(function(g){if(g.agenda_id===a.id){_found=true;return Object.assign({},pos,{agenda_id:a.id,motorista_id:_motId});}return g;});if(!_found)_updated.push(Object.assign({},pos,{agenda_id:a.id,motorista_id:_motId}));return _updated;});}
          }).catch(function(){});
        }
      });
    },15000);
    var onVisible=function(){if(document.visibilityState==="visible"){loadMud();loadAg();}};
    document.addEventListener("visibilitychange",onVisible);
    return function(){clearInterval(pollId);clearInterval(gpsPollId);document.removeEventListener("visibilitychange",onVisible);if(ws&&ws.readyState===1)ws.close();};
  },[]);
  async function loadMud(){try{const r=await dbGet("mudancas","deleted_at=is.null");if(r){setMudancas(r);idbSet("mudancas",r);}}catch(e){var cached=await idbGet("mudancas");if(cached)setMudancas(cached);}}
  async function loadAg(){try{const r=await dbGet("agenda");if(r){var mapped=r.map(function(x){return {...x,_dbId:x.id};});setAgenda(mapped);idbSet("agenda",mapped);}}catch(e){var cached=await idbGet("agenda");if(cached)setAgenda(cached);}}
  async function loadCfgWA(){
    try{
      await _ensureAuth();
      var r=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=in.(admin_whatsapp,supervisor_whatsapp,whatsapp_ativo,evolution_api_url,evolution_api_key,evolution_instance,wa_auto_config)&select=chave,valor",{headers:getH()});
      if(!r.ok) return;
      var rows=await r.json();
      if(!Array.isArray(rows)) return;
      // If empty, try once more after re-auth
      if(rows.length===0){
        await _ensureAuth();
        var r1b=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=in.(admin_whatsapp,supervisor_whatsapp,whatsapp_ativo,evolution_api_url,evolution_api_key,evolution_instance,wa_auto_config)&select=chave,valor",{headers:getH()});
        if(r1b.ok){var rows1b=await r1b.json();if(Array.isArray(rows1b)&&rows1b.length>0)rows=rows1b;}
      }
      var obj={};
      rows.forEach(function(row){obj[row.chave]=row.valor||"";});
      setCfgWA(function(prev){return {...prev,...obj};});
      if(obj.wa_auto_config){try{var _parsed=JSON.parse(obj.wa_auto_config);
        // Migrate old format (atribuida_motorista/atribuida_supervisor) to new (atribuida)
        if(_parsed.atribuida_motorista&&!_parsed.atribuida){
          var _oldAM=_parsed.atribuida_motorista||{};var _oldAS=_parsed.atribuida_supervisor||{};
          _parsed.atribuida={ativo:_oldAM.ativo||_oldAS.ativo||false,dest:[].concat(_oldAM.dest||[],_oldAS.dest||[]).filter(function(v,i,a){return a.indexOf(v)===i;}),msg:_oldAM.msg||_oldAS.msg||""};
          delete _parsed.atribuida_motorista;delete _parsed.atribuida_supervisor;
        }
        if(_parsed.deslocamento_admin&&!_parsed.deslocamento){
          var _dA=_parsed.deslocamento_admin||{};var _dC=_parsed.deslocamento_cliente||{};var _dS=_parsed.deslocamento_supervisor||{};
          _parsed.deslocamento={ativo:_dA.ativo||_dC.ativo||_dS.ativo||false,dest:[].concat(_dA.dest||[],_dC.dest||[],_dS.dest||[]).filter(function(v,i,a){return a.indexOf(v)===i;}),msg:_dA.msg||_dS.msg||_dC.msg||""};
          delete _parsed.deslocamento_admin;delete _parsed.deslocamento_cliente;delete _parsed.deslocamento_supervisor;
        }
        if(_parsed.finalizada_admin&&!_parsed.finalizada){
          var _fA=_parsed.finalizada_admin||{};var _fC=_parsed.finalizada_cliente||{};var _fS=_parsed.finalizada_supervisor||{};
          _parsed.finalizada={ativo:_fA.ativo||_fC.ativo||_fS.ativo||false,dest:[].concat(_fA.dest||[],_fC.dest||[],_fS.dest||[]).filter(function(v,i,a){return a.indexOf(v)===i;}),msg:_fA.msg||_fS.msg||_fC.msg||""};
          delete _parsed.finalizada_admin;delete _parsed.finalizada_cliente;delete _parsed.finalizada_supervisor;
        }
        setCfgWAauto(_parsed);}catch(e){}}
    }catch(e){console.warn("loadCfgWA:",e);}
    // Also load restaurant config
    try{
      var r2=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=in.(restaurante_nome,restaurante_contato)&select=chave,valor",{headers:getH()});
      if(r2.ok){var rows2=await r2.json();if(Array.isArray(rows2))setConfiguracoes(function(prev){return prev.concat(rows2);});}
    }catch(e2){console.warn("loadRestCfg:",e2);}
  }
  // ── ENVIAR WHATSAPP VIA EVOLUTION API ─────────────────────────────────────────
  async function enviarWA(numero,mensagem){
    if(!numero||!mensagem){console.warn("[WA] sem numero/mensagem");return false;}
    var clean=numero.replace(/\D/g,"");
    if(!clean){console.warn("[WA] numero invalido apos limpeza");return false;}
    try{
      await _ensureAuth();
      var _r=await fetch(SUPA_URL+"/functions/v1/enviar-whatsapp",{method:"POST",headers:{...getH(),"Content-Type":"application/json"},body:JSON.stringify({numero:clean,mensagem:mensagem})});
      if(!_r.ok){
        var _err=await _r.text().catch(function(){return "";});
        console.warn("[WA] HTTP "+_r.status,_err);
        setSyncStatus("⚠️ WhatsApp falhou (HTTP "+_r.status+")");
        setTimeout(function(){setSyncStatus("✅ Sincronizado");},4000);
        return false;
      }
      return true;
    }catch(e){
      console.warn("[WA] envio falhou:",e);
      setSyncStatus("⚠️ WhatsApp: erro de conexão");
      setTimeout(function(){setSyncStatus("✅ Sincronizado");},4000);
      return false;
    }
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
      if(d==="admin"){var _aw=cfgWA.admin_whatsapp;if(!_aw){var _au=listaUsuarios.find(function(x){return x.perfil==="admin"&&x.ativo&&x.contato;});if(_au)_aw=_au.contato;}if(_aw)nums.push(_aw);}
      if(d==="supervisor"&&ag.supervisor_id){var u=listaUsuarios.find(function(x){return x.id===ag.supervisor_id;});if(u&&u.contato)nums.push(u.contato);}
      if(d==="promorar"){listaUsuarios.filter(function(x){return x.perfil==="promorar"&&x.ativo&&x.contato;}).forEach(function(x){nums.push(x.contato);});}
      if(d==="social"){listaUsuarios.filter(function(x){return x.perfil==="social"&&x.ativo&&x.contato;}).forEach(function(x){nums.push(x.contato);});}
      if(d==="cliente"&&ag.contato){nums.push(ag.contato);}
      if(d==="assist_social"&&ag.assist_social){var _asFind=assistSocialList.find(function(x){return x.nome===ag.assist_social;});if(_asFind&&_asFind.contato)nums.push(_asFind.contato);}
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
      for(var i=0;i<ts.length;i++){var m=ts[i];var row={id:m.id,nome:m.nome,selo:m.selo||"",comunidade:m.comunidade||"",data:m.data,origem:m.origem||"",destino:m.destino||"",medicao:m.medicao||0,van:m.van||false,contato:m.contato||"",observacao:m.observacao||"",confirmed_promorar:m.confirmed_promorar||false,confirmed_telemim:m.confirmed_telemim||false,adm_approved:m.adm_approved||false,promorar_approved:m.promorar_approved||false,social_approved:m.social_approved||false,status:m.status||"Registrado",signature_data:(m.signature_data!=null&&m.signature_data!="")?m.signature_data:null,assinado_em:m.assinado_em||null};row.created_by=m.created_by||(usuario&&(usuario.nome||usuario.email))||null;row.creator_role=m.creator_role||(usuario&&usuario.perfil)||null;await fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:{...getH(),"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(row)});}
      setSyncStatus("✅ Sinc");window.__mudancas=list;
    }catch(e){
      setMudancas(_prevMud); // Rollback optimista
      setSyncStatus("⚠️ Falha ao guardar. A repor...");
      console.error("[saveMud]",e);
    }
  }
  async function handleLogin(){if(!loginForm.email||!loginForm.senha){setLoginErro("Preencha email e senha");return;}setLoginLoad(true);setLoginErro("");try{const res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:loginForm.email,password:loginForm.senha})});const d=await res.json();if(!res.ok||!d.access_token){setLoginErro("Email ou senha incorretos");setLoginLoad(false);return;}const pr=await fetch(SUPA_URL+"/rest/v1/usuarios?id=eq."+d.user.id+"&select=*",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+d.access_token}});const pd=await pr.json();if(!pd||!pd[0]||pd[0].ativo===false){setLoginErro("Sem acesso. Contate o administrador.");setLoginLoad(false);return;}const u={id:d.user.id,email:d.user.email,nome:pd[0].nome,perfil:pd[0].perfil,tipo_veiculo:pd[0].tipo_veiculo||null,token:d.access_token,refresh_token:d.refresh_token||null};setUsuario(u);setTab("dashboard");localStorage.setItem('tmim_u',JSON.stringify(u));try{window.__SENTRY_SET_USER__&&window.__SENTRY_SET_USER__(u);}catch(_){}/* Reload data with fresh JWT */try{var _mr=await dbGet("mudancas","deleted_at=is.null");setMudancas(_mr||[]);var _ar=await dbGet("agenda");if(_ar)setAgenda(_ar.map(function(x){return{...x,_dbId:x.id};}));var _cr=await dbGetCustos();if(_cr)setCustosDiarios(_cr);loadContasSemana();loadPrestadores();}catch(_le){}}catch(e){setLoginErro("Erro.");}setLoginLoad(false);}
  function handleLogout(){setUsuario(null);localStorage.removeItem('tmim_u');setLoginForm({email:"",senha:""});}
  const perfil=usuario?.perfil||"";const isAdmin=perfil==="admin";const isPromorar=perfil==="promorar";const isSocial=perfil==="social"||perfil==="coordenador";const isMotorista=perfil==="motorista";const isSupervisor=perfil==="supervisor";const temFin=isAdmin;const podeEditar=isAdmin||isPromorar||isSupervisor;const verMed=isAdmin||isPromorar||isSupervisor;
  useEffect(function(){if(isAdmin)loadNotificacoes();},[usuario]);
  // ── PWA Badge no ícone (Android Chrome/Edge) ──────────────────────────────
  useEffect(function(){
    if(!usuario||!('setAppBadge' in navigator))return;
    var _hoje=_fmtDate(new Date());
    var _count=0;
    if(isMotorista){
      _count=(agenda||[]).filter(function(a){
        if(!a||a.deleted_at||a.data!==_hoje)return false;
        var _eu=(a.motorista_van_id===usuario.id)||(a.motorista_caminhao_id===usuario.id);
        if(!_eu)return false;
        var _fim=a.termino_van_em||a.termino_caminhao_em||a.termino_em;
        return !_fim;
      }).length;
    } else if(isSupervisor){
      _count=(agenda||[]).filter(function(a){
        if(!a||a.deleted_at||a.data!==_hoje)return false;
        if(a.supervisor_id!==usuario.id)return false;
        var _semMot=(a.van&&!a.motorista_van_id)||(a.caminhao&&!a.motorista_caminhao_id);
        var _fim=a.termino_van_em||a.termino_caminhao_em||a.termino_em;
        return _semMot||!_fim;
      }).length;
    } else if(isAdmin||isPromorar){
      _count=(notificacoes||[]).filter(function(n){return !n.lido;}).length;
    }
    try{
      if(_count>0)navigator.setAppBadge(_count);
      else if('clearAppBadge' in navigator)navigator.clearAppBadge();
    }catch(e){}
  },[usuario,agenda,mudancas,notificacoes,isMotorista,isSupervisor,isAdmin,isPromorar]);
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

  // ── LIVE MAP: Auto-poll all active vehicles every 10s ──────────────────────
  useEffect(function(){
    if(tab!=="monitoramento"||!liveMapOpen) return;
    var _cancelled=false;
    function _getActiveVehicles(){
      var _hj3=new Date().toISOString().slice(0,10);
      var _all3=[...(agenda||[]).filter(function(a){return a.data===_hj3&&!a.deleted_at;}),
        ...(mudancas||[]).filter(function(m){return m.data===_hj3&&!m.deleted_at;})];
      var _seen3={};var _vehs=[];
      _all3.forEach(function(am){
        var k3=(am.nome||"").toLowerCase().trim()+"|"+am.data;if(_seen3[k3])return;_seen3[k3]=true;
        if((am.inicio_van_em||am.van_saiu_em)&&!am.chegada_van_em&&am.motorista_van_id){
          _vehs.push({agId:am.id,motId:am.motorista_van_id,veiculo:"van",devId:_traccarDevId(am.motorista_van_id),destino:am.destino||""});
        }
        if((am.inicio_caminhao_em||am.caminhao_saiu_em)&&!am.chegada_caminhao_em&&am.motorista_caminhao_id){
          _vehs.push({agId:am.id,motId:am.motorista_caminhao_id,veiculo:"cam",devId:_traccarDevId(am.motorista_caminhao_id),destino:am.destino||""});
        }
      });
      return _vehs;
    }
    function _updateMapMarkers(vehicles){
      var el=document.getElementById("live-map-container");
      if(!el||!el._liveMap) return;
      var map=el._liveMap;
      vehicles.forEach(function(v){
        if(!v.lat||!v.lng) return;
        var key=v.motId+"_"+v.veiculo;
        // Update or create marker
        if(el._liveMarkers[key]){
          el._liveMarkers[key].setLngLat([v.lng,v.lat]);
          // Update popup
          el._liveMarkers[key].getPopup().setHTML(
            "<div style='font-family:sans-serif;padding:4px 2px;'><div style='font-weight:800;font-size:13px;'>"+(v.veiculo==="van"?"🚐":"🚚")+" "+(v.nome||"Motorista")+"</div>"+
            (v.eta?"<div style='font-size:12px;font-weight:700;color:#059669;margin-top:4px;'>⏱️ ETA: "+v.eta.etaStr+" ("+v.eta.durMin+"min)</div>":"")+
            (v.speed?"<div style='font-size:10px;color:#94a3b8;'>🏎️ "+Math.round(v.speed)+" km/h</div>":"")+
            "</div>"
          );
        }else{
          var mEl=document.createElement("div");
          mEl.style.cssText="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.3);cursor:pointer;background:"+(v.veiculo==="van"?"#2563eb":"#7c3aed")+";";
          mEl.innerHTML=v.veiculo==="van"?"🚐":"🚚";
          var popup=new window.mapboxgl.Popup({offset:25,closeButton:false}).setHTML("<div style='font-family:sans-serif;'><b>"+(v.nome||"")+"</b></div>");
          el._liveMarkers[key]=new window.mapboxgl.Marker({element:mEl}).setLngLat([v.lng,v.lat]).setPopup(popup).addTo(map);
        }
        // Update route
        if(v.route&&map.isStyleLoaded()){
          var srcId="liveRoute_"+key;
          if(map.getSource(srcId)){map.getSource(srcId).setData({type:"Feature",geometry:v.route});}
          else{
            try{
              map.addSource(srcId,{type:"geojson",data:{type:"Feature",geometry:v.route}});
              map.addLayer({id:srcId,type:"line",source:srcId,layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":v.veiculo==="van"?"#2563eb":"#7c3aed","line-width":4,"line-opacity":0.7,"line-dasharray":[2,1]}});
            }catch(e){}
          }
        }
        // Dest marker
        if(v.destCoords&&!el._liveDestMarkers[key]){
          var dEl=document.createElement("div");dEl.innerHTML="📍";dEl.style.fontSize="28px";
          el._liveDestMarkers[key]=new window.mapboxgl.Marker({element:dEl}).setLngLat(v.destCoords).addTo(map);
        }else if(v.destCoords&&el._liveDestMarkers[key]){
          el._liveDestMarkers[key].setLngLat(v.destCoords);
        }
      });
      // Fit bounds
      var _allWithPos=vehicles.filter(function(v){return v.lat&&v.lng;});
      if(_allWithPos.length>1){
        var bounds=new window.mapboxgl.LngLatBounds();
        _allWithPos.forEach(function(v){bounds.extend([v.lng,v.lat]);if(v.destCoords)bounds.extend(v.destCoords);});
        map.fitBounds(bounds,{padding:50,duration:800,maxZoom:15});
      }else if(_allWithPos.length===1){
        map.easeTo({center:[_allWithPos[0].lng,_allWithPos[0].lat],duration:800});
      }
    }
    async function _pollAll(){
      if(_cancelled) return;
      var vehs=_getActiveVehicles();
      if(vehs.length===0){setLiveMapVehicles([]);return;}
      var results=[];
      for(var i=0;i<vehs.length;i++){
        var v=vehs[i];
        try{
          var pos=await gpsLoadPositions(v.agId,v.motId);
          var entry={motId:v.motId,veiculo:v.veiculo,lat:pos?pos.lat:null,lng:pos?pos.lng:null,speed:pos?pos.speed:null,nome:v.nome||"",eta:null,route:null,destCoords:null};
          if(pos&&v.destino){
            var eta=await gpsCalcEta(pos.lat,pos.lng,v.destino);
            if(eta){entry.eta=eta;entry.route=eta.route;entry.destCoords=eta.destCoords;}
          }
          results.push(entry);
        }catch(e){results.push({motId:v.motId,veiculo:v.veiculo,lat:null,lng:null});}
      }
      if(!_cancelled){
        // Merge names from listaUsuarios
        results.forEach(function(r){
          var u=listaUsuarios.find(function(x){return x.id===r.motId;});
          if(u) r.nome=u.nome;
        });
        setLiveMapVehicles(results);
        _updateMapMarkers(results);
      }
    }
    setTimeout(_pollAll,1200);
    var _tid2=setInterval(_pollAll,10000);
    return function(){_cancelled=true;clearInterval(_tid2);};
  },[tab,liveMapOpen,agenda,mudancas]);

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
  async function carregarUsuarios(){if((!isAdmin&&!isPromorar&&!isSocial&&!isSupervisor)||!usuario?.token)return;try{if(isAdmin||isSupervisor){const _tk3=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);const r=await fetch(SUPA_URL+"/functions/v1/listar-usuarios",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk3||"")}});const d=await r.json();if(d.ok&&Array.isArray(d.usuarios)){setListaUsuarios(d.usuarios);idbSet("listaUsuarios",d.usuarios);}}else{var _tk4=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);var r2=await fetch(SUPA_URL+"/rest/v1/usuarios?perfil=in.(motorista,social)&ativo=eq.true&select=id,nome,perfil,tipo_veiculo,placa_veiculo,ativo,contato",{headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk4||SUPA_KEY)}});if(r2.ok){var d2=await r2.json();if(Array.isArray(d2)){setListaUsuarios(d2);idbSet("listaUsuarios",d2);}}}}catch(e){var cached=await idbGet("listaUsuarios");if(cached)setListaUsuarios(cached);}}
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
  const [novoAjudante,setNovoAjudante]=useState({nome:"",telefone:"",pix:""});
  const [subEquipe,setSubEquipe]=useState("cadastro");
  const [equipeDiaList,setEquipeDiaList]=useState([]);
  const [equipeDiaSel,setEquipeDiaSel]=useState(()=>{var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");});
  const [equipeDiaCheck,setEquipeDiaCheck]=useState([]);
  const [equipeFinMes,setEquipeFinMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [editAjudante,setEditAjudante]=useState(null);
  const [equipePadrao,setEquipePadrao]=useState([]);
  const [assistSocialList,setAssistSocialList]=useState([]);
  const [showAddAssistSocial,setShowAddAssistSocial]=useState(false);
  const [novoAssistSocial,setNovoAssistSocial]=useState({nome:"",contato:""});
  const [editAssistSocial,setEditAssistSocial]=useState(null);
  const [adminRelSup,setAdminRelSup]=useState("");
  const [adminRelMes,setAdminRelMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [pagamentos,setPagamentos]=useState([]);
  const [pagMes,setPagMes]=useState(()=>new Date().toISOString().slice(0,7));
  const [pagSemIni,setPagSemIni]=useState(function(){var _h=new Date();var _dw=_h.getDay();var _m=new Date(_h.getFullYear(),_h.getMonth(),_h.getDate()-_dw);return _m.getFullYear()+"-"+String(_m.getMonth()+1).padStart(2,"0")+"-"+String(_m.getDate()).padStart(2,"0");});
  const [pagSup,setPagSup]=useState("");
  const [pagCam,setPagCam]=useState("");
  const [pagVan,setPagVan]=useState("");
  const [pagFiltro,setPagFiltro]=useState("todos");
  const [pagPeriodo,setPagPeriodo]=useState("semana");
  const [supFinPeriodo,setSupFinPeriodo]=useState("semana");

  // ── SOLICITAÇÃO DE ALMOÇO ──────────────────────────────────────────────────
  const [solicitacoesAlmoco,setSolicitacoesAlmoco]=useState([]);
  const [almocoItens,setAlmocoItens]=useState([{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1}]);
  const [almocoObs,setAlmocoObs]=useState("");
  const [almocoExtras,setAlmocoExtras]=useState([{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1}]);

  async function loadSolicitacoesAlmoco(){
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/solicitacoes_almoco?select=*&order=created_at.desc&limit=50",{headers:getH()});
      var d=await r.json();if(Array.isArray(d))setSolicitacoesAlmoco(d);
    }catch(e){}
  }
  async function enviarSolicitacaoAlmoco(){
    await _ensureAuth();
    var _todosItens=[].concat(almocoItens,almocoExtras).filter(function(it){return it.tipo&&it.tipo.trim()&&it.qtd>0;});
    if(_todosItens.length===0){setSyncStatus("⚠️ Adicione pelo menos 1 item");return;}
    var _supNome=(usuario&&usuario.nome)||"Supervisor";
    var _hoje=new Date();var _p2=function(n){return String(n).padStart(2,"0");};
    var _dataHoje=_hoje.getFullYear()+"-"+_p2(_hoje.getMonth()+1)+"-"+_p2(_hoje.getDate());
    var novaS={data:_dataHoje,supervisor_id:usuario.id,supervisor_nome:_supNome,itens:JSON.stringify(_todosItens),observacao:almocoObs||"",status:"pendente"};
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/solicitacoes_almoco",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),body:JSON.stringify([novaS])});
      var d=await r.json();
      if(Array.isArray(d)&&d[0]){setSolicitacoesAlmoco(function(prev){return[d[0]].concat(prev);});setSyncStatus("✅ Solicitação enviada!");setAlmocoItens([{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1}]);setAlmocoExtras([{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1},{tipo:"",qtd:1}]);setAlmocoObs("");
        // Push para admins
        var admins=(listaUsuarios||[]).filter(function(u){return u.perfil==="admin";}).map(function(u){return u.id;});
        if(admins.length>0)sendPushNotification(admins,"🍽️ Solicitação de Almoço","👷 "+_supNome+" solicitou almoço para "+_dataHoje.split("-").reverse().join("/"));
      }
    }catch(e){setSyncStatus("⚠️ Erro ao enviar solicitação");}
  }
  async function aprovarAlmoco(solId,aprovar){
    await _ensureAuth();
    var _status=aprovar?"aprovado":"rejeitado";
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/solicitacoes_almoco?id=eq."+solId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),body:JSON.stringify({status:_status,aprovado_por:usuario.id,aprovado_em:new Date().toISOString()})});
      var d=await r.json();
      if(Array.isArray(d)&&d[0]){
        setSolicitacoesAlmoco(function(prev){return prev.map(function(s){return s.id===solId?d[0]:s;});});
        setSyncStatus(aprovar?"✅ Almoço aprovado!":"❌ Almoço rejeitado");
        // Se aprovado, abrir WhatsApp para restaurante e notificar supervisor
        if(aprovar){
          var _sol=d[0];
          var _itens=[];try{_itens=typeof _sol.itens==="string"?JSON.parse(_sol.itens):(_sol.itens||[]);}catch(e2){_itens=[];}
          // Push para supervisor
          if(_sol.supervisor_id)sendPushNotification([_sol.supervisor_id],"✅ Almoço Aprovado!","Seu pedido de almoço foi aprovado pelo admin");
          // WhatsApp restaurante
          var _cfg=(configuracoes||[]).find(function(c){return c.chave==="restaurante_contato";});
          var _telRest=_cfg?(_cfg.valor||"").replace(/\D/g,""):"";
          if(_telRest){
            var _dpS=(_sol.data||"").split("-");var _dataFmt=_dpS[2]+"/"+_dpS[1]+"/"+_dpS[0];
            var _msgRest="🍽️ *Pedido de Almoço — Promorar*\n📅 "+_dataFmt+"\n👷 Equipe: "+(_sol.supervisor_nome||"Supervisor")+"\n\n*Pedidos:*\n"+_itens.map(function(it){return"• "+it.qtd+"x "+it.tipo;}).join("\n")+(_sol.observacao?"\n\n📝 Obs: "+_sol.observacao:"")+"\n\nTotal de itens: "+_itens.reduce(function(s,it){return s+(parseInt(it.qtd)||0);},0)+"\n🤝 Promorar";
            enviarWA(_telRest,_msgRest);
          }
          // WhatsApp admin (auto)
          var _adminU=(listaUsuarios||[]).find(function(u){return u.perfil==="admin"&&u.contato;});
          if(_adminU&&_adminU.contato){
            var _telAdmin=(_adminU.contato||"").replace(/\D/g,"");
            if(_telAdmin){
              var _dpA=(_sol.data||"").split("-");var _dataFmtA=_dpA[2]+"/"+_dpA[1]+"/"+_dpA[0];
              var _msgAdmin="✅ *Almoço Aprovado*\n📅 "+_dataFmtA+"\n👷 "+(_sol.supervisor_nome||"")+"\n\n"+_itens.map(function(it){return"• "+it.qtd+"x "+it.tipo;}).join("\n")+"\n\n🤝 Promorar";
              enviarWA(_telAdmin,_msgAdmin);
            }
          }
        }
      }
    }catch(e){setSyncStatus("⚠️ Erro ao processar solicitação");}
  }

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
    try{var _body={nome:novoAjudante.nome.trim()};if(novoAjudante.telefone.trim())_body.telefone=novoAjudante.telefone.trim();if(novoAjudante.pix.trim())_body.pix=novoAjudante.pix.trim();var r=await fetch(SUPA_URL+"/rest/v1/ajudantes",{method:"POST",headers:Object.assign({},getH(),{"Prefer":"return=representation"}),body:JSON.stringify(_body)});if(r.ok){await loadAjudantes();setNovoAjudante({nome:"",telefone:"",pix:""});setShowAddAjudante(false);}}catch(e){}
  }
  async function editarAjudanteFn(){
    if(!editAjudante)return;
    try{var _body={nome:editAjudante.nome.trim()};if(editAjudante.telefone)_body.telefone=editAjudante.telefone.trim();_body.pix=editAjudante.pix?editAjudante.pix.trim():"";await fetch(SUPA_URL+"/rest/v1/ajudantes?id=eq."+editAjudante.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_body)});await loadAjudantes();setEditAjudante(null);setSyncStatus("✅ Ajudante atualizado!");}catch(e){setSyncStatus("⚠️ Erro ao editar");}
  }
  async function desativarAjudante(ajId){
    try{await fetch(SUPA_URL+"/rest/v1/ajudantes?id=eq."+ajId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({ativo:false})});await loadAjudantes();setSyncStatus("✅ Ajudante removido!");}catch(e){setSyncStatus("⚠️ Erro ao remover");}
  }
  async function loadAssistentesSocial(){
    try{var r=await fetch(SUPA_URL+"/rest/v1/assistentes_social?select=*&ativo=eq.true&order=nome",{headers:getH()});var d=await r.json();if(Array.isArray(d))setAssistSocialList(d);}catch(e){}
  }
  async function criarAssistSocial(){
    if(!novoAssistSocial.nome.trim()){alert("Informe o nome.");return;}
    try{await fetch(SUPA_URL+"/rest/v1/assistentes_social",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({nome:novoAssistSocial.nome.trim(),contato:novoAssistSocial.contato.trim()})});setNovoAssistSocial({nome:"",contato:""});setShowAddAssistSocial(false);loadAssistentesSocial();}catch(e){alert("Erro: "+e.message);}
  }
  async function editarAssistSocialFn(){
    if(!editAssistSocial||!editAssistSocial.nome.trim())return;
    try{await fetch(SUPA_URL+"/rest/v1/assistentes_social?id=eq."+editAssistSocial.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({nome:editAssistSocial.nome.trim(),contato:editAssistSocial.contato.trim()})});setEditAssistSocial(null);loadAssistentesSocial();}catch(e){alert("Erro: "+e.message);}
  }
  async function desativarAssistSocial(asId){
    try{await fetch(SUPA_URL+"/rest/v1/assistentes_social?id=eq."+asId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({ativo:false})});loadAssistentesSocial();}catch(e){alert("Erro: "+e.message);}
  }
  async function loadEquipeDia(){
    try{var r=await fetch(SUPA_URL+"/rest/v1/equipe_dia?select=*&order=data.desc",{headers:getH()});var d=await r.json();if(Array.isArray(d))setEquipeDiaList(d);}catch(e){}
  }
  // 🛡️ Dedupe array de ajudantes por id E por (nome+telefone normalizado)
  function _dedupeAjs(arr){
    if(!Array.isArray(arr))return [];
    var seenIds={};var seenKeys={};var out=[];
    arr.forEach(function(aj){
      if(!aj)return;
      var _id=aj.id!=null?String(aj.id):"";
      var _normNome=(aj.nome||"").toLowerCase().trim();
      var _normTel=(aj.telefone||"").replace(/\D/g,"");
      var _key=_normNome+"|"+_normTel;
      if(_id&&seenIds[_id])return;
      if(_normNome&&seenKeys[_key])return;
      if(_id)seenIds[_id]=true;
      if(_normNome)seenKeys[_key]=true;
      out.push(aj);
    });
    return out;
  }
  async function salvarEquipeDia(data,ajudantesArr){
    // 🛡️ Camada 1: dedupe antes de enviar (defesa em profundidade)
    var _ajsLimpos=_dedupeAjs(ajudantesArr);
    // Upsert via on_conflict=data para evitar erro de unique constraint independente do estado local
    var _hd=Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=representation"});
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/equipe_dia?on_conflict=data",{method:"POST",headers:_hd,body:JSON.stringify({data:data,ajudantes:_ajsLimpos})});
      if(r.ok){
        var d=await r.json();
        if(Array.isArray(d)&&d[0]){
          setEquipeDiaList(function(prev){var nxt=prev.filter(function(e){return e.data!==data;});nxt.push(d[0]);return nxt;});
        } else {
          // Fallback: atualizar estado local e recarregar
          setEquipeDiaList(function(prev){var nxt=prev.filter(function(e){return e.data!==data;});nxt.push({data:data,ajudantes:_ajsLimpos});return nxt;});
          setTimeout(function(){loadEquipeDia();},1500);
        }
        // Atualiza state local com a versão deduplicada
        setEquipeDiaCheck(_ajsLimpos);
        setSyncStatus("✅ Equipe do dia salva!");
        setEquipeSalvaMsg("✅ Equipe salva com sucesso!");
        setTimeout(function(){setEquipeSalvaMsg("");},3000);
      } else {
        var _errBody="";
        try{var _errD=await r.json();_errBody=_errD.message||_errD.error||JSON.stringify(_errD);}catch(e2){}
        setSyncStatus("⚠️ Erro ao salvar equipe do dia");
        setEquipeSalvaMsg("⚠️ Erro ao salvar"+((_errBody)?" ("+_errBody+")":""));
        setTimeout(function(){setEquipeSalvaMsg("");},5000);
      }
    }catch(e){setSyncStatus("⚠️ Erro ao salvar equipe do dia");setEquipeSalvaMsg("⚠️ Erro de conexão: "+e.message);setTimeout(function(){setEquipeSalvaMsg("");},5000);}
  }
  // ── Equipe Padrão (banco configuracoes) ──
  async function loadEquipePadrao(){
    if(!usuario||!usuario.id)return;
    try{var r=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.equipe_padrao_"+usuario.id+"&select=valor",{headers:getH()});var d=await r.json();if(Array.isArray(d)&&d[0]&&d[0].valor){var _p=JSON.parse(d[0].valor);if(Array.isArray(_p))setEquipePadrao(_p);}}catch(e){}
  }
  async function salvarEquipePadrao(arr){
    if(!usuario||!usuario.id)return;
    var _k="equipe_padrao_"+usuario.id;
    try{await fetch(SUPA_URL+"/rest/v1/configuracoes",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}),body:JSON.stringify({chave:_k,valor:JSON.stringify(arr)})});setEquipePadrao(arr);alert("⭐ Equipe padrão salva no banco com sucesso!");}catch(e){alert("⚠️ Erro ao salvar equipe padrão");}
  }
  async function limparEquipePadrao(){
    if(!usuario||!usuario.id)return;
    var _k="equipe_padrao_"+usuario.id;
    try{await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+_k,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({valor:"[]"})});setEquipePadrao([]);alert("🗑️ Equipe padrão removida!");}catch(e){alert("⚠️ Erro ao limpar equipe padrão");}
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
  async function excluirUsuario(u){if(!window.confirm("Excluir "+u.nome+"?\nEsta ação não pode ser desfeita!"))return;try{var _tk=await _getValidToken(usuario,SUPA_URL,SUPA_KEY);var _r=await fetch(SUPA_URL+"/functions/v1/deletar-usuario",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+(_tk||""),"Content-Type":"application/json"},body:JSON.stringify({id:u.id})});var _d=await _r.json();if(_d.ok){setListaUsuarios(function(prev){return prev.filter(function(x){return x.id!==u.id;});});setSyncStatus("✅ Usuário excluído!");}else{alert("⚠️ Erro: "+(_d.error||_d.message||"Erro desconhecido"));}}catch(e){alert("⚠️ Erro: "+e.message);}}
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
    var _p=usuario&&usuario.perfil||"";var _isSocial=_p==="social"||_p==="coordenador";var _isPromorar=_p==="promorar";var _isAdm=_p==="admin"||_p==="telemim";var _nomeUser=usuario&&(usuario.nome||usuario.email)||"";const nova={...form,id:Date.now(),medicao:parseFloat(form.medicao)||0,requires_validation:true,social_approved:_isSocial,social_approved_by:_isSocial?_nomeUser:null,promorar_approved:_isPromorar,promorar_approved_by:_isPromorar?_nomeUser:null,adm_approved:_isAdm,adm_approved_by:_isAdm?_nomeUser:null,created_by:_nomeUser,creator_role:_p};
    setMudancas(prev=>[nova,...prev]);
    await saveMud([nova,...mudancas],nova);
    setForm(initForm); setFlash("✅ Salvo!"); setTimeout(()=>setFlash(""),1800); setTab("lista");
  }
  async function handleDelMud(id,motivo){
    if(!usuario||usuario.perfil!=="admin"){setSyncStatus("⛔ Apenas o administrador pode excluir mudânças.");return;}
    var nome=usuario&&usuario.nome?usuario.nome:"Admin";
    var _delBy=motivo?nome+" — "+motivo:nome;
    var prevMud=mudancas.slice();
    setMudancas(function(m){return m.filter(function(x){return x.id!==id;});});
    setSyncStatus("⌛ Apagando...");
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+id,
        {method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
        body:JSON.stringify({deleted_at:new Date().toISOString(),deleted_by:_delBy})});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("🗑️ OS apagada (mantida para auditoria).");
    }catch(e){
      setMudancas(prevMud);
      setSyncStatus("⚠️ Erro ao apagar: "+e.message);
      try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"handleDelMud"},extra:{id:id}});}catch(_){}
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
  // Item 2: validações de cadastro
  function _validarCadastroAg(form){
    var _ws=[];
    if(form.data){
      var _hj=new Date();_hj.setHours(0,0,0,0);
      var _alvo=new Date(form.data+"T12:00:00");
      var _diffDias=Math.round((_alvo-_hj)/(1000*60*60*24));
      if(_diffDias<-30) _ws.push({tipo:"data_antiga",msg:"📅 Data é "+Math.abs(_diffDias)+" dias no passado. Confirma?"});
      else if(_diffDias>90) _ws.push({tipo:"data_futura",msg:"📅 Data é "+_diffDias+" dias no futuro. Confirma?"});
    }
    if(form.contato){
      var _tel=String(form.contato).replace(/\D/g,"");
      if(_tel.length>0&&_tel.length<10) _ws.push({tipo:"tel_curto",msg:"📞 Telefone parece incompleto ("+_tel.length+" dígitos). Confirma?"});
    }
    if(form.nome&&form.nome.trim().length<6) _ws.push({tipo:"nome_curto",msg:"👤 Nome parece incompleto. Confirma?"});
    if(!form.origem||form.origem.trim().length<8) _ws.push({tipo:"origem_curta",msg:"📦 Endereço de origem vazio/curto. Confirma?"});
    if(!form.destino||form.destino.trim().length<8) _ws.push({tipo:"destino_curto",msg:"🏠 Endereço de destino vazio/curto. Confirma?"});
    return _ws;
  }
  async function handleAddAg(){
    if(!agForm.nome||!agForm.data) return;
    var _warnings=_validarCadastroAg(agForm);
    if(_warnings.length>0){
      setCadastroWarnings({warnings:_warnings,onConfirm:function(){setCadastroWarnings(null);_doAddAg();},onCancel:function(){setCadastroWarnings(null);}});
      return;
    }
    return _doAddAg();
  }
  async function _doAddAg(){
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
    var _pa=usuario&&usuario.perfil||"";var _na=usuario&&(usuario.nome||usuario.email)||"";var _isSocialAg=_pa==="social"||_pa==="coordenador";const nova={...agForm,id:Date.now(),requires_validation:true,social_approved:_isSocialAg,social_approved_by:_isSocialAg?_na:null,promorar_approved:_pa==="promorar",promorar_approved_by:_pa==="promorar"?_na:null,adm_approved:_pa==="admin"||_pa==="telemim",adm_approved_by:(_pa==="admin"||_pa==="telemim")?_na:null,status:_isSocialAg?"pendente_social":"confirmado"};
    // POST directo para nova agenda — email + flash SÓ após confirmação do banco
    setSyncStatus("⏳ Salvando...");
    (async function(){
      var _maxRetries=2;var _tentativa=0;var _saved=false;
      while(_tentativa<=_maxRetries&&!_saved){
        try{
          await _ensureAuth();
          // Validar token antes do POST
          var _hTest=getH();
          if(_hTest.Authorization==="Bearer "+SUPA_KEY){
            // Token expirado mesmo após refresh — forçar re-login
            throw new Error("TOKEN_EXPIRED");
          }
          var _nomeLog=usuario&&(usuario.nome||usuario.email)||"";var _perfilLog=usuario&&usuario.perfil||"";
          var rowNova={nome:nova.nome,selo:nova.selo||"",comunidade:nova.comunidade||"",data:nova.data,horario:nova.horario||"",origem:nova.origem||"",destino:nova.destino||"",contato:nova.contato||"",van:nova.van||false,caminhao:nova.caminhao||false,medicao:nova.medicao||0,ajudantes:nova.ajudantes||0,status:nova.status||"confirmado",observacao:nova.observacao||"",social_approved:nova.social_approved||false,promorar_approved:nova.promorar_approved||false,adm_approved:nova.adm_approved||false,requires_validation:nova.requires_validation||false,created_by:_nomeLog,creator_role:_perfilLog};
          var rNova=await fetch(SUPA_URL+"/rest/v1/agenda",{
            method:"POST",
            headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),
            body:JSON.stringify(rowNova)
          });
          if(!rNova.ok){var _errBody="";try{_errBody=await rNova.text();}catch(e){}throw new Error("POST agenda HTTP "+rNova.status+" "+_errBody);}
          var rData=await rNova.json();
          var _bdId=rData&&rData[0]&&rData[0].id;
          setAgenda(function(prev){
            var sem=prev.filter(function(x){return x.id!==nova.id;});
            return [{...nova,id:_bdId||nova.id},...sem];
          });
          _saved=true;
          // Email SÓ após POST confirmado no banco
          try{
            fetch(SUPA_URL+'/functions/v1/enviar-email-agendamento',{
              method:'POST',
              headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY},
              body:JSON.stringify({agenda:{...nova,id:_bdId||nova.id},agendadoPor:{nome:usuario&&usuario.nome,email:usuario&&usuario.email,perfil:usuario&&usuario.perfil}})
            }).catch(function(e){console.warn('[email agendamento]',e);});
          }catch(eE){}
          setAgForm({...initForm,status:"confirmado"});
          setFlash(_isSocialAg?"⏳ Enviado! Aguardando aprovação do Promorar.":"✅ Agendado!");setTimeout(function(){setFlash("");},3000);
          setTab("agenda");
          setSyncStatus("✅ Sinc");
        }catch(eN){
          _tentativa++;
          if(eN.message==="TOKEN_EXPIRED"&&_tentativa<=_maxRetries){
            // Tentar forçar refresh do token
            try{var _su2=JSON.parse(localStorage.getItem('tmim_u')||'{}');if(_su2.refresh_token){var _res=await fetch(SUPA_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:_su2.refresh_token})});var _rd=await _res.json();if(_rd.access_token){_su2.token=_rd.access_token;_su2.refresh_token=_rd.refresh_token||_su2.refresh_token;localStorage.setItem('tmim_u',JSON.stringify(_su2));setUsuario(function(p){return{...p,token:_su2.token};});continue;}}}catch(eR){}
          }
          if(_tentativa>_maxRetries){
            setSyncStatus("❌ Erro ao agendar! Verifique sua conexão e tente novamente.");
            setFlash("❌ Falha ao salvar. Faça logout/login e tente novamente.");setTimeout(function(){setFlash("");},5000);
            console.error("[novaAgenda] FALHA DEFINITIVA após "+_maxRetries+" tentativas:",eN);
          }
        }
      }
    })();
  }
  async function handleDelAg(id,motivo){
    if(!usuario||usuario.perfil!=="admin"){setSyncStatus("⛔ Apenas o administrador pode excluir agendas.");return;}
    // PROTEÇÃO: Bloquear exclusão de mudanças concluídas ou em andamento
    var _agItem=agenda.find(function(a){return a.id===id;});
    if(_agItem){
      if(_agItem.status==="concluida"||_agItem.status==="realizada"){setSyncStatus("⛔ Não é possível excluir — mudança já concluída.");return;}
      if(_agItem.inicio_van_em||_agItem.van_saiu_em||_agItem.inicio_caminhao_em||_agItem.caminhao_saiu_em||_agItem.inicio_mudanca_em){setSyncStatus("⛔ Não é possível excluir — veículos já em operação.");return;}
      if(_agItem.termino_em||_agItem.termino_van_em||_agItem.termino_caminhao_em){setSyncStatus("⛔ Não é possível excluir — mudança já finalizada.");return;}
      // Confirmar se tem motoristas atribuídos
      if((_agItem.motorista_van_id||_agItem.motorista_caminhao_id)&&!window.confirm("⚠️ Esta agenda tem motoristas atribuídos ("+(_agItem.nome||"?")+"). Deseja realmente excluir?")){return;}
    }
    var nome=usuario&&usuario.nome?usuario.nome:"Admin";
    var _delBy=motivo?nome+" — "+motivo:nome;
    var prevAg=agenda.slice();
    setAgenda(function(a){return a.filter(function(x){return x.id!==id;});});
    setSyncStatus("⌛ Apagando...");
    try{
      var r=await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+id,
        {method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),
        body:JSON.stringify({deleted_at:new Date().toISOString(),deleted_by:_delBy})});
      if(!r.ok) throw new Error("HTTP "+r.status);
      setSyncStatus("🗑️ Agenda apagada (mantida para auditoria).");
    }catch(e){
      setAgenda(prevAg);
      setSyncStatus("⚠️ Erro ao apagar: "+e.message);
      try{window.Sentry&&window.Sentry.captureException(e,{tags:{op:"handleDelAg"},extra:{id:id}});}catch(_){}
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
      _addPDFHeader(doc,'CANHOTO DE MUDANÇA','Contrato: PROMORAR');
      doc.setTextColor(0,0,0);doc.setFontSize(11);doc.setFont("helvetica","bold");
      doc.text("DADOS DA MUDANÇA",15,35);
      doc.setFont("helvetica","normal");doc.setFontSize(10);
      doc.text("Morador: "+(ag.nome||""),15,42);
      doc.text("Selo: "+(ag.selo||"")+" | Comunidade: "+(ag.comunidade||""),15,49);
      doc.text("Data: "+(ag.data||"")+" | Horario: "+(ag.horario||""),15,56);
      doc.setFont("helvetica","bold");doc.text("ASSINATURA DO MORADOR",15,78);
      try{doc.addImage(assinB64,"PNG",15,82,100,30);}catch(e){}
      doc.line(15,115,140,115);
      var _canhotoNow=new Date();var _canhotoStr=_canhotoNow.toLocaleDateString('pt-BR')+' '+_canhotoNow.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      _addPDFFooter(doc,_canhotoStr);
      const pdfFinal=doc.output("datauristring").split(",")[1];
      const nm="Canhoto_"+(ag.nome||"morador").replace(/\s+/g,"_")+"_"+(ag.data||"sem-data")+".pdf";
      await salvarCanhotoNoDrive(ag.id,pdfFinal,nm);
    }catch(err){console.warn("[assinatura-pdf]",err);}
  }
  function converterEmMudanca(ag){
    if(!ag.medicao){alert('Informe a medição (m³) antes de finalizar.');return;}
    pedirFinalizacao(ag);
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
    var fmt=["exec"];
    function _resetBtns(){bExec.style.border="1.5px solid #e2e8f0";bExec.style.background="#f8fafc";bExec.children[1].style.color="#64748b";bPdf.style.border="1.5px solid #e2e8f0";bPdf.style.background="#f8fafc";bPdf.children[1].style.color="#64748b";bWpp.style.border="1.5px solid #e2e8f0";bWpp.style.background="#f8fafc";bWpp.children[1].style.color="#64748b";}
    var bExec=mk("button","flex:1;padding:14px 8px;border-radius:12px;border:2.5px solid #2563eb;background:#eff6ff;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer");
    bExec.appendChild(mk("span","font-size:26px","📊"));bExec.appendChild(mk("span","font-size:11px;font-weight:800;color:#2563eb","Executivo"));bExec.appendChild(mk("span","font-size:9px;color:#94a3b8","KPIs + Equipes"));
    var bPdf=mk("button","flex:1;padding:14px 8px;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer");
    bPdf.appendChild(mk("span","font-size:26px","📄"));bPdf.appendChild(mk("span","font-size:11px;font-weight:800;color:#64748b","Detalhado"));bPdf.appendChild(mk("span","font-size:9px;color:#94a3b8","Todas mudanças"));
    var bWpp=mk("button","flex:1;padding:14px 8px;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer");
    bWpp.appendChild(mk("span","font-size:26px","💬"));bWpp.appendChild(mk("span","font-size:11px;font-weight:800;color:#64748b","WhatsApp"));bWpp.appendChild(mk("span","font-size:9px;color:#94a3b8","Copiar texto"));
    var bAc=mk("button","flex:2;padding:12px 0;border-radius:12px;border:none;background:#2563eb;color:#fff;font-weight:800;font-size:13px;cursor:pointer","📥 Baixar Executivo");
    bExec.onclick=function(){fmt[0]="exec";_resetBtns();bExec.style.border="2.5px solid #2563eb";bExec.style.background="#eff6ff";bExec.children[1].style.color="#2563eb";bAc.textContent="📥 Baixar Executivo";bAc.style.background="#2563eb";};
    bPdf.onclick=function(){fmt[0]="pdf";_resetBtns();bPdf.style.border="2.5px solid #3b82f6";bPdf.style.background="#eff6ff";bPdf.children[1].style.color="#3b82f6";bAc.textContent="📥 Baixar Detalhado";bAc.style.background="#3b82f6";};
    bWpp.onclick=function(){fmt[0]="wpp";_resetBtns();bWpp.style.border="2.5px solid #25d366";bWpp.style.background="#f0fdf4";bWpp.children[1].style.color="#25d366";bAc.textContent="💬 Gerar Texto p/Copiar";bAc.style.background="#25d366";};
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
        },100);}else if(fmt[0]==="exec"){var listaE=_filterByPeriod(window.__mudancas||[],iI.value,iF.value);if(!listaE.length){alert("Nenhuma mudança neste período.");return;}gerarPDFExecutivo(listaE,iI.value,iF.value,bAc);close();}else{gerarPDFRelatorio(_filterByPeriod(window.__mudancas||[],iI.value,iF.value),iI.value,iF.value,bAc);close();}
    };
    var r1=mk("div","display:flex;gap:6px;margin-bottom:10px");
    function bS(txt2,fn2){var b=mk("button","flex:1;padding:7px 2px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;font-size:11px;font-weight:700;cursor:pointer;color:#334155",txt2);b.onclick=fn2;return b;}
    r1.appendChild(bS("Hoje",function(){var d=new Date().toISOString().slice(0,10);iI.value=d;iF.value=d;}));r1.appendChild(bS("Semana",function(){var d=new Date();var dw=d.getDay();var dif=dw===0?6:dw-1;var s0=new Date(d.getFullYear(),d.getMonth(),d.getDate()-dif);var s6=new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()+6);var _p2=function(n){return String(n).padStart(2,"0");};iI.value=s0.getFullYear()+"-"+_p2(s0.getMonth()+1)+"-"+_p2(s0.getDate());iF.value=s6.getFullYear()+"-"+_p2(s6.getMonth()+1)+"-"+_p2(s6.getDate());}));r1.appendChild(bS("Mês",function(){var d=new Date();var y=d.getFullYear();var m=String(d.getMonth()+1).padStart(2,"0");iI.value=y+"-"+m+"-01";iF.value=d.toISOString().slice(0,10);}));r1.appendChild(bS("Tudo",function(){iI.value="";iF.value="";}));
    var rD=mk("div","display:flex;gap:6px;align-items:center;margin-bottom:18px");rD.appendChild(iI);rD.appendChild(mk("span","color:#94a3b8;font-size:11px","a"));rD.appendChild(iF);
    var rF=mk("div","display:flex;gap:10px;margin-bottom:20px");rF.appendChild(bExec);rF.appendChild(bPdf);rF.appendChild(bWpp);
    var rA=mk("div","display:flex;gap:8px");var bCn=mk("button","flex:1;padding:12px 0;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#64748b;font-weight:700;font-size:13px;cursor:pointer","Cancelar");bCn.onclick=close;rA.appendChild(bCn);rA.appendChild(bAc);
    box.appendChild(mk("div","font-weight:800;font-size:16px;color:#1e293b;margin-bottom:16px;text-align:center","📊 Gerar Relatório"));
    box.appendChild(mk("div","font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase","Período"));
    box.appendChild(r1);box.appendChild(rD);
    box.appendChild(mk("div","font-size:11px;font-weight:700;color:#64748b;margin-bottom:10px;text-transform:uppercase","Tipo de Relatório"));
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

  // ── PAPEL TIMBRADO (logo + rodapé corporativo) ──────────────────────────────
  var _LOGO_B64='data:image/png;base64,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';
  var _FOOTER_EMPRESA='G. DE SOUZA ADMINISTRAÇÃO DE OBRAS LTDA.';
  var _FOOTER_ENDERECO='Rua Floriano Peixoto, 85, Sala: 423 - Santo Antônio - Recife - CEP: 50.020-065';
  var _FOOTER_CONTATO='Fone: (81) 99244.0900 - telemimmudancas@gmail.com - CNPJ: 04.130.817/0001-35';
  function _addPDFHeader(doc,titulo,subtitulo){
    var pgW=doc.internal.pageSize.getWidth();
    // Logo centralizado no topo
    var logoH=18;var logoW=logoH*1.41;
    doc.addImage(_LOGO_B64,'PNG',(pgW-logoW)/2,3,logoW,logoH);
    // Título abaixo do logo
    doc.setFontSize(13);doc.setFont('helvetica','bold');doc.setTextColor(17,24,39);
    doc.text(titulo,pgW/2,26,{align:'center'});
    if(subtitulo){doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(100,116,139);
      doc.text(subtitulo,pgW/2,31,{align:'center'});}
    doc.setTextColor(30,41,59);
  }
  function _addPDFFooter(doc,extractStr){
    var pgW=doc.internal.pageSize.getWidth();
    var pgH=doc.internal.pageSize.getHeight();
    var pN=doc.internal.getNumberOfPages();
    var cur=doc.internal.getCurrentPageInfo().pageNumber;
    // Linha separadora
    doc.setDrawColor(200,200,200);doc.setLineWidth(0.3);doc.line(14,pgH-18,pgW-14,pgH-18);
    // Dados corporativos centralizados
    doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(17,24,39);
    doc.text(_FOOTER_EMPRESA,pgW/2,pgH-14,{align:'center'});
    doc.setFont('helvetica','normal');doc.setTextColor(100,116,139);doc.setFontSize(6);
    doc.text(_FOOTER_ENDERECO,pgW/2,pgH-10.5,{align:'center'});
    doc.text(_FOOTER_CONTATO,pgW/2,pgH-7.5,{align:'center'});
    // Gerado em + página
    doc.setFontSize(6);
    doc.text('Gerado em: '+extractStr,14,pgH-4);
    doc.text('Página '+cur+' de '+pN,pgW-14,pgH-4,{align:'right'});
    doc.setTextColor(30,41,59);
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
      // Cabeçalho timbrado
      _addPDFHeader(doc,'RELATÓRIO DE OPERAÇÕES — TELEMIM','Contrato: PROMORAR  |  Período: '+perStr+'  |  Total: '+lista.length+' mudança'+(lista.length!==1?'s':''));
      // Tabela
      doc.autoTable({
        startY:30,
        margin:{bottom:22},
        head:[['Data','Hora','Cliente','Origem','Destino','m³','Veículo','Validações']],
        body:_buildTableRows(lista),
        theme:'grid',
        styles:{fontSize:8,cellPadding:2,overflow:'linebreak',font:'helvetica'},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold',fontSize:9},
        alternateRowStyles:{fillColor:[248,250,252]},
        columnStyles:{0:{cellWidth:20,halign:'center'},1:{cellWidth:14,halign:'center'},2:{cellWidth:40},3:{cellWidth:40},4:{cellWidth:40},5:{cellWidth:16,halign:'center'},6:{cellWidth:20,halign:'center'},7:{cellWidth:30,halign:'center'}},
        didDrawPage:function(data){_addPDFFooter(doc,extractStr);}
      });
      doc.save(_pdfFileName(now));
    }finally{
      if(btnRef){btnRef.disabled=false;btnRef.textContent='📥 Baixar PDF';}
    }
  }

  // ── RELATÓRIO EXECUTIVO PDF ──────────────────────────────────────────────────
  async function gerarPDFExecutivo(lista,dataIni,dataFim,btnRef){
    if(btnRef){btnRef.disabled=true;btnRef.textContent='⏳ A gerar...';}
    try{
      var JsPDF=await _loadJsPDF();
      var doc=new JsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      var pgW=doc.internal.pageSize.getWidth();
      var pgH=doc.internal.pageSize.getHeight();
      var now=new Date();
      var M=16;var Y=0;
      var extractStr=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      var perStr=dataIni&&dataFim?(_fmtDateISO(dataIni)+' a '+_fmtDateISO(dataFim)):dataIni?('A partir de '+_fmtDateISO(dataIni)):dataFim?('Até '+_fmtDateISO(dataFim)):'Todo o período';
      // Cabeçalho timbrado
      _addPDFHeader(doc,'RELATÓRIO EXECUTIVO — TELEMIM','Contrato: PROMORAR  |  Período: '+perStr);
      Y=32;
      // KPIs
      var totalMud=lista.length;
      var totalMet=0;var totalCusto=0;
      lista.forEach(function(m){totalMet+=parseFloat(m.medicao)||0;});
      // Try to get custos from custosDiarios
      (custosDiarios||[]).forEach(function(c){
        if(!c.data)return;
        if(dataIni&&c.data<dataIni)return;
        if(dataFim&&c.data>dataFim)return;
        totalCusto+=parseFloat(c.valor||c.custo||0);
      });
      doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(30,41,59);
      doc.text('RESUMO EXECUTIVO',M,Y);Y+=2;
      doc.setDrawColor(37,99,235);doc.setLineWidth(0.8);doc.line(M,Y,M+50,Y);Y+=6;
      // KPI boxes
      var kpiW=(pgW-M*2-12)/3;
      var kpis=[
        {num:String(totalMud),label:'Mudanças',color:[37,99,235]},
        {num:totalMet.toFixed(1)+' m³',label:'Metragem Total',color:[5,150,105]},
        {num:'R$ '+totalCusto.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),label:'Custo Total',color:[217,119,6]}
      ];
      kpis.forEach(function(kpi,i){
        var x=M+i*(kpiW+6);
        doc.setFillColor(248,250,252);doc.roundedRect(x,Y,kpiW,20,3,3,'F');
        doc.setDrawColor(226,232,240);doc.roundedRect(x,Y,kpiW,20,3,3,'S');
        doc.setTextColor(kpi.color[0],kpi.color[1],kpi.color[2]);doc.setFontSize(16);doc.setFont('helvetica','bold');
        doc.text(kpi.num,x+kpiW/2,Y+10,{align:'center'});
        doc.setTextColor(100,116,139);doc.setFontSize(7);doc.setFont('helvetica','normal');
        doc.text(kpi.label.toUpperCase(),x+kpiW/2,Y+16,{align:'center'});
      });
      Y+=28;
      // Performance por Supervisor
      doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(30,41,59);
      doc.text('PERFORMANCE POR SUPERVISOR',M,Y);Y+=2;
      doc.setDrawColor(37,99,235);doc.line(M,Y,M+60,Y);Y+=4;
      var supStats={};
      lista.forEach(function(m){
        var sid=m.supervisor_id||'sem_sup';
        if(!supStats[sid]) supStats[sid]={nome:'Sem Supervisor',count:0,met:0};
        var sup=listaUsuarios.find(function(u){return u.id===sid;});
        if(sup) supStats[sid].nome=sup.nome;
        supStats[sid].count++;
        supStats[sid].met+=parseFloat(m.medicao)||0;
      });
      var supRows=Object.values(supStats).sort(function(a,b){return b.count-a.count;}).map(function(s){
        return [s.nome,String(s.count),s.met.toFixed(1)+' m³'];
      });
      doc.autoTable({
        startY:Y,margin:{left:M,right:M},
        head:[['Supervisor','Mudanças','Metragem']],
        body:supRows,
        theme:'grid',
        styles:{fontSize:9,cellPadding:3,font:'helvetica'},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold'},
        alternateRowStyles:{fillColor:[248,250,252]},
        columnStyles:{0:{cellWidth:70},1:{cellWidth:30,halign:'center'},2:{cellWidth:35,halign:'center'}}
      });
      Y=doc.lastAutoTable.finalY+10;
      // Performance por Motorista
      if(Y>pgH-60){doc.addPage();Y=16;}
      doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(30,41,59);
      doc.text('PERFORMANCE POR MOTORISTA',M,Y);Y+=2;
      doc.setDrawColor(37,99,235);doc.line(M,Y,M+60,Y);Y+=4;
      var motStats={};
      lista.forEach(function(m){
        if(m.motorista_van_id){
          var k='van_'+m.motorista_van_id;
          if(!motStats[k]) motStats[k]={nome:'?',veiculo:'Van',count:0};
          var mv=listaUsuarios.find(function(u){return u.id===m.motorista_van_id;});
          if(mv) motStats[k].nome=mv.nome;
          motStats[k].count++;
        }
        if(m.motorista_caminhao_id){
          var k2='cam_'+m.motorista_caminhao_id;
          if(!motStats[k2]) motStats[k2]={nome:'?',veiculo:'Caminhão',count:0};
          var mc=listaUsuarios.find(function(u){return u.id===m.motorista_caminhao_id;});
          if(mc) motStats[k2].nome=mc.nome;
          motStats[k2].count++;
        }
      });
      var motRows=Object.values(motStats).sort(function(a,b){return b.count-a.count;}).map(function(s){
        return [s.nome,s.veiculo,String(s.count)];
      });
      if(motRows.length>0){
        doc.autoTable({
          startY:Y,margin:{left:M,right:M},
          head:[['Motorista','Veículo','Viagens']],
          body:motRows,
          theme:'grid',
          styles:{fontSize:9,cellPadding:3,font:'helvetica'},
          headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold'},
          alternateRowStyles:{fillColor:[248,250,252]},
          columnStyles:{0:{cellWidth:70},1:{cellWidth:35,halign:'center'},2:{cellWidth:30,halign:'center'}}
        });
        Y=doc.lastAutoTable.finalY+10;
      }
      // Detalhamento
      if(Y>pgH-40){doc.addPage();Y=16;}
      doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(30,41,59);
      doc.text('DETALHAMENTO POR MUDANÇA',M,Y);Y+=2;
      doc.setDrawColor(37,99,235);doc.line(M,Y,M+60,Y);Y+=4;
      var detRows=lista.map(function(m){
        return [_fmtDateISO(m.data),m.nome||'-',(m.origem||'?')+' → '+(m.destino||'?'),m.medicao?(Number(m.medicao).toFixed(1)):'-',m.van&&m.caminhao?'V+C':m.van?'Van':'Cam'];
      });
      doc.autoTable({
        startY:Y,margin:{left:M,right:M,bottom:22},
        head:[['Data','Cliente','Origem → Destino','m³','Veíc.']],
        body:detRows,
        theme:'grid',
        styles:{fontSize:8,cellPadding:2.5,overflow:'linebreak',font:'helvetica'},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold',fontSize:9},
        alternateRowStyles:{fillColor:[248,250,252]},
        columnStyles:{0:{cellWidth:20,halign:'center'},1:{cellWidth:40},2:{cellWidth:65},3:{cellWidth:14,halign:'center'},4:{cellWidth:14,halign:'center'}},
        didDrawPage:function(){_addPDFFooter(doc,extractStr);}
      });
      doc.save('Telemim_Executivo_'+perStr.replace(/\s+/g,'_').replace(/\//g,'-')+'.pdf');
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
      // Cabeçalho timbrado
      var extractStr=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      _addPDFHeader(doc,'ORDEM DE SERVIÇO — TELEMIM','Contrato: PROMORAR  |  Gerado em: '+now.toLocaleDateString('pt-BR'));
      // Tabela de dados do card
      doc.autoTable({
        startY:32,
        margin:{bottom:22},
        head:[['Campo','Detalhe']],
        body:_buildSingleCardRows(move),
        theme:'grid',
        styles:{fontSize:10,cellPadding:4},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold'},
        columnStyles:{0:{cellWidth:40,fontStyle:'bold',fillColor:[248,250,252]},1:{cellWidth:130}},
        didDrawPage:function(){
          _addPDFFooter(doc,extractStr);
        }
      });
      doc.save(_singleCardFileName(move));
    }finally{
      if(btnRef){btnRef.disabled=false;btnRef.textContent='📄 PDF';}
    }
  }

  

  async function gerarPDFDetalheRegistro(m,btnRef){
    if(btnRef){btnRef.disabled=true;btnRef.textContent='\u23F3';}
    try{
      var JsPDF=await _loadJsPDF();
      var doc=new JsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      var now=new Date();
      var extractStr=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      _addPDFHeader(doc,'DETALHAMENTO DE MUDANÇA','Contrato: PROMORAR');
      var _dp=m.data?(function(){var p=m.data.split('-');return p[2]+'/'+p[1]+'/'+p[0];})():'—';
      var _diasSem=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
      var _diaW='';if(m.data){var _dtObj=new Date(m.data+'T12:00:00');_diaW=_diasSem[_dtObj.getDay()]||'';}
      var _supM=m.supervisor_id?listaUsuarios.find(function(u){return u.id===m.supervisor_id;}):null;
      var _mvM=m.motorista_van_id?listaUsuarios.find(function(u){return u.id===m.motorista_van_id;}):null;
      var _mcM=m.motorista_caminhao_id?listaUsuarios.find(function(u){return u.id===m.motorista_caminhao_id;}):null;
      var _criadoTxt=m.criado_em?new Date(m.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      var _concTxt=m.termino_em?new Date(m.termino_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):_criadoTxt;
      var veiculo='';if(m.van&&m.caminhao)veiculo='Van + Caminhão';else if(m.van)veiculo='Van';else if(m.caminhao)veiculo='Caminhão';else veiculo='—';
      var rows=[
        ['Nome',m.nome||'—'],
        ['Selo',m.selo||'—'],
        ['Data',_dp+(_diaW?' ('+_diaW+')':'')],
        ['Comunidade',m.comunidade||'—'],
        ['Origem',m.origem||'—'],
        ['Destino',m.destino||'—'],
        ['Medição',m.medicao?m.medicao+' m³':'—'],
        ['Veículo',veiculo],
        ['Status',m.status||'—'],
        ['Assistente Social',m.assist_social||'—'],
        ['Supervisor',_supM?_supM.nome:'—'],
        ['Motorista Van',_mvM?_mvM.nome:'—'],
        ['Motorista Caminhão',_mcM?(_mcM.nome+(_mcM.placa_veiculo?' · '+_mcM.placa_veiculo:'')):'—'],
        ['Horário',m.horario?m.horario+'h':'—'],
        ['Concluído em',_concTxt],
      ];
      if(m.contato&&m.contato.trim())rows.splice(3,0,['Telefone',m.contato.trim()]);
      if(m.observacao&&m.observacao.trim())rows.push(['Observação',m.observacao.trim()]);
      doc.autoTable({
        startY:34,
        margin:{bottom:22},
        head:[['Campo','Detalhe']],
        body:rows,
        theme:'grid',
        styles:{fontSize:10,cellPadding:4},
        headStyles:{fillColor:[17,24,39],textColor:[255,255,255],fontStyle:'bold'},
        columnStyles:{0:{cellWidth:45,fontStyle:'bold',fillColor:[248,250,252]},1:{cellWidth:125}},
        didParseCell:function(data){if(data.section==='body'&&data.row.index===0&&data.column.index===1){data.cell.styles.fontStyle='bold';data.cell.styles.fontSize=12;}},
        didDrawPage:function(){_addPDFFooter(doc,extractStr);}
      });
      var n=(m.nome||'').replace(/\s+/g,'_')||'Cliente';
      doc.save('Detalhe_'+n+'.pdf');
    }finally{
      if(btnRef){btnRef.disabled=false;btnRef.textContent='📑';}
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
      // WA auto: iniciada (motorista começou)
      if(novoStatus==="Em Deslocamento"&&cfgWA.whatsapp_ativo==="true"){
        var _evI=cfgWAauto.iniciada;if(_evI&&_evI.ativo){
          var _iVars={cliente:ag.nome||"",data:ag.data||"",hora:ag.horario||"",origem:ag.origem||"",destino:ag.destino||"",motorista:(usuario&&usuario.nome)||"Motorista",metragem:ag.medicao||"",assistente:ag.assist_social||"",supervisor:(function(){if(ag.supervisor_id){var s=listaUsuarios.find(function(u){return u.id===ag.supervisor_id;});return s?s.nome:"";}return "";})()};
          var _iNums=resolverDestinatariosWA(_evI.dest,ag);
          _iNums.forEach(function(n){enviarWA(n,substituirVarsWA(_evI.msg,_iVars));});
        }
      }
      // WA auto: no_destino (motorista chegou ao destino)
      if(novoStatus==="Descarregando"&&cfgWA.whatsapp_ativo==="true"){
        var _evND=cfgWAauto.no_destino;if(_evND&&_evND.ativo){
          var _ndVars={cliente:ag.nome||"",data:ag.data||"",hora:ag.horario||"",origem:ag.origem||"",destino:ag.destino||"",motorista:(usuario&&usuario.nome)||"Motorista",metragem:ag.medicao||"",assistente:ag.assist_social||"",supervisor:(function(){if(ag.supervisor_id){var s=listaUsuarios.find(function(u){return u.id===ag.supervisor_id;});return s?s.nome:"";}return "";})()};
          var _ndNums=resolverDestinatariosWA(_evND.dest,ag);
          _ndNums.forEach(function(n){enviarWA(n,substituirVarsWA(_evND.msg,_ndVars));});
        }
      }
      // If concluded, create mudancas record for Registros tab
      if(novoStatus==="Concluido"||novoStatus==="realizado"){
        var _merged=Object.assign({},ag,body);
        var _novaM={nome:_merged.nome||"",selo:_merged.selo||"",comunidade:_merged.comunidade||"",data:_merged.data,origem:_merged.origem||"",destino:_merged.destino||"",contato:_merged.contato||null,van:_merged.van||false,caminhao:_merged.caminhao||false,medicao:parseFloat(_merged.medicao)||0,ajudantes:parseInt(_merged.ajudantes)||0,observacao:_merged.observacao||"",status:"Concluído",termino_em:agora,criado_em:agora,motorista_van_id:_merged.motorista_van_id||null,motorista_caminhao_id:_merged.motorista_caminhao_id||null,supervisor_id:_merged.supervisor_id||null,approved_by_admin:_merged.approved_by_admin||null,approved_by_social:_merged.approved_by_social||null,approved_by_promorar:_merged.approved_by_promorar||null,approved_by_supervisor:_merged.approved_by_supervisor||null,inicio_van_em:_merged.inicio_van_em||null,chegou_origem_van_em:_merged.chegou_origem_van_em||null,saiu_destino_van_em:_merged.saiu_destino_van_em||null,chegada_van_em:_merged.chegada_van_em||null,inicio_caminhao_em:_merged.inicio_caminhao_em||null,chegou_origem_cam_em:_merged.chegou_origem_cam_em||null,saiu_destino_cam_em:_merged.saiu_destino_cam_em||null,chegada_caminhao_em:_merged.chegada_caminhao_em||null};
        fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation"}),body:JSON.stringify(_novaM)}).then(function(r2){return r2.json();}).then(function(d){if(Array.isArray(d)&&d[0]){setMudancas(function(prev){return[d[0]].concat(prev);});}}).catch(function(){});
        // Push notification: mudança finalizada → admin + supervisor
        var _fNotifIds=[];var _fAdmins=listaUsuarios.filter(function(u){return u.perfil==="admin"&&u.ativo;});_fAdmins.forEach(function(a){_fNotifIds.push(a.id);});if(ag.supervisor_id)_fNotifIds.push(ag.supervisor_id);
        if(_fNotifIds.length>0){var _hora=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  sendPushNotification(_fNotifIds,"✅ Mudança concluída!","👤 "+(ag.nome||"Mudança")+" · 📐 "+(ag.medicao||"0")+" m³ · 🕐 Finalizada às "+_hora);}
        // WA auto: finalizada
        if(cfgWA.whatsapp_ativo==="true"){
          var _fVars={cliente:ag.nome||"",data:ag.data||"",origem:ag.origem||"",destino:ag.destino||"",motorista:(usuario&&usuario.nome)||"Motorista",metragem:ag.medicao||"",assistente:ag.assist_social||""};
          var _evF=cfgWAauto.finalizada;if(_evF&&_evF.ativo){
            var _nums=resolverDestinatariosWA(_evF.dest,ag);
            _nums.forEach(function(n){enviarWA(n,substituirVarsWA(_evF.msg,_fVars));});
          }
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
      // WA auto: deslocamento (com ETA)
      if(cfgWA.whatsapp_ativo==="true"){
        (async function(){
          var _etaData=null;
          try{_etaData=await calcRotaGoogle(ag.origem,ag.destino,ag.horario);}catch(e){}
          var _previsao=_etaData&&_etaData.previsao?_etaData.previsao:"a confirmar";
          var _distancia=_etaData?_etaData.distKm+" km":"a calcular";
          var _tempo=_etaData?_etaData.durTxt:"a calcular";
          var _supUser=ag.supervisor_id?listaUsuarios.find(function(u){return u.id===ag.supervisor_id;}):null;var _dVars={cliente:ag.nome||"",data:ag.data||"",origem:ag.origem||"",destino:ag.destino||"",motorista:(usuario&&usuario.nome)||"Motorista",supervisor:_supUser?_supUser.nome:"",metragem:ag.medicao||"",assistente:ag.assist_social||"",previsao:_previsao,distancia:_distancia,tempo:_tempo,hora:ag.horario||"",contato:ag.contato||""};
          var _evD=cfgWAauto.deslocamento;if(_evD&&_evD.ativo){
            var _nums=resolverDestinatariosWA(_evD.dest,ag);
            _nums.forEach(function(n){enviarWA(n,substituirVarsWA(_evD.msg,_dVars));});
          }
        })();
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
    if(usuario&&usuario.perfil==='coordenador') updatePayload.approved_by_social=usuario.nome;

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
    await _ensureAuth();
    var prevAgenda=agenda.slice();
    _setAgendaRemovidaIds(function(prev){var s=new Set(prev);s.add(ag.id);return s;});
    setAgenda(function(prev){return prev.filter(function(x){return x.id!==ag.id;});});
    try{
      var novaOS={nome:ag.nome,data:ag.data,horario:ag.horario||null,selo:ag.selo||null,van:ag.van||false,caminhao:ag.caminhao||false,comunidade:ag.comunidade||null,observacao:ag.observacao||null,origem:ag.origem||null,destino:ag.destino||null,contato:ag.contato||null,medicao:parseFloat(ag.medicao)||0,ajudantes:parseInt(ag.ajudantes)||0,status:"Registrado",requested_by:ag.requested_by||null,approved_by_admin:ag.approved_by_admin||null,approved_by_social:ag.approved_by_social||null,approved_by_promorar:ag.approved_by_promorar||null,approved_by_supervisor:ag.approved_by_supervisor||null,motorista_van_id:ag.motorista_van_id||null,motorista_caminhao_id:ag.motorista_caminhao_id||null,supervisor_id:ag.supervisor_id||null,equipa_confirmada:ag.equipa_confirmada||[],created_by:usuario&&(usuario.nome||usuario.email)||"George"};
      var r1=await fetch(SUPA_URL+"/rest/v1/mudancas?on_conflict=nome,data",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation,resolution=merge-duplicates"}),body:JSON.stringify(novaOS)});
      if(!r1.ok){await _ensureAuth();r1=await fetch(SUPA_URL+"/rest/v1/mudancas?on_conflict=nome,data",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=representation,resolution=merge-duplicates"}),body:JSON.stringify(novaOS)});}
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
    if(usuario&&usuario.perfil==='coordenador') updatePayload.approved_by_social=usuario.nome;
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
  // PROTOCOLO: Campos de monitoramento limpos ao cancelar/pendenciar
  var _monitorClearFields={inicio_van_em:null,van_saiu_em:null,chegada_van_em:null,termino_van_em:null,chegou_origem_van_em:null,saiu_destino_van_em:null,inicio_caminhao_em:null,caminhao_saiu_em:null,chegada_caminhao_em:null,termino_caminhao_em:null,chegou_origem_cam_em:null,saiu_destino_cam_em:null};
  async function handleCancelarDireto(agId){
    await _ensureAuth();
    var _clearPayload=Object.assign({status:"cancelada",cancelamento_solicitado:false},_monitorClearFields);
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,_clearPayload):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_clearPayload)});
      try{_addNotif("cancelamento","Mudança cancelada pelo admin",(agenda.find(function(a){return a.id===agId;})||{}).nome||"");}catch(e){}
      setSyncStatus("✅ Mudança cancelada!");
    }catch(e){setSyncStatus("⚠️ Erro ao cancelar");}
  }
  async function handleAutorizarCancelamento(agId){
    await _ensureAuth();
    var _clearPayload=Object.assign({status:"cancelada",cancelamento_solicitado:false},_monitorClearFields);
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,_clearPayload):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_clearPayload)});
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
  // PROTOCOLO: Solicitar Pendência (não-admin) ou executar direto (admin)
  async function handleSolicitarPendencia(agId,motivo){
    await _ensureAuth();
    var _nome=usuario?(usuario.nome||usuario.email):"";
    var _perfil=usuario?usuario.perfil:"";
    var payload={pendencia_solicitada:true,pendencia_motivo:motivo,pendencia_por:_nome,pendencia_perfil:_perfil,pendencia_em:new Date().toISOString()};
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,payload):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(payload)});
      try{_addNotif("pendencia","Solicitação de pendência por "+_nome,(agenda.find(function(a){return a.id===agId;})||{}).nome||"");}catch(e){}
      setSyncStatus("✅ Solicitação de pendência enviada ao Admin!");
    }catch(e){setSyncStatus("⚠️ Erro ao solicitar pendência");}
    setPendModal(null);setPendMotivo("");
  }
  // PROTOCOLO: Mover para Pendente — salva histórico de tentativa e limpa timestamps
  async function handleMoverPendente(agId,motivo){
    await _ensureAuth();
    var _ag=agenda.find(function(a){return a.id===agId;});
    // Salvar tentativa no histórico
    var _hist=(_ag&&Array.isArray(_ag.historico_tentativas)?_ag.historico_tentativas:[]).slice();
    var _temTimestamps=_ag&&(_ag.inicio_van_em||_ag.van_saiu_em||_ag.inicio_caminhao_em||_ag.caminhao_saiu_em||_ag.inicio_mudanca_em);
    if(_ag&&_temTimestamps){
      _hist.push({data_original:_ag.data||null,motivo:motivo||"Sem motivo informado",quem:usuario?(usuario.nome||usuario.email):"",registrado_em:new Date().toISOString(),timestamps:{inicio_van_em:_ag.inicio_van_em||null,van_saiu_em:_ag.van_saiu_em||null,chegou_origem_van_em:_ag.chegou_origem_van_em||null,saiu_destino_van_em:_ag.saiu_destino_van_em||null,chegada_van_em:_ag.chegada_van_em||null,inicio_caminhao_em:_ag.inicio_caminhao_em||null,caminhao_saiu_em:_ag.caminhao_saiu_em||null,chegou_origem_cam_em:_ag.chegou_origem_cam_em||null,saiu_destino_cam_em:_ag.saiu_destino_cam_em||null,chegada_caminhao_em:_ag.chegada_caminhao_em||null}});
    }
    var _clearPayload=Object.assign({status:"pendente",pendencia_solicitada:false,pendencia_motivo:null,pendencia_por:null,pendencia_perfil:null,pendencia_em:null,historico_tentativas:_hist},_monitorClearFields);
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,_clearPayload):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_clearPayload)});
      setSyncStatus("✅ Movida para Pendente"+(motivo?" — "+motivo:"")+" — monitoramento encerrado.");
    }catch(e){setSyncStatus("⚠️ Erro ao mover para pendente");}
  }
  async function handleReagendar(agId,novaData,motivo){
    if(!agId||!novaData) return;
    await _ensureAuth();
    var _ag=agenda.find(function(a){return a.id===agId;});
    var _hist=(_ag&&Array.isArray(_ag.historico_tentativas)?_ag.historico_tentativas:[]).slice();
    _hist.push({data_original:_ag?_ag.data:null,nova_data:novaData,motivo:motivo||"Reagendamento",quem:usuario?(usuario.nome||usuario.email):"",tipo:"reagendamento",registrado_em:new Date().toISOString()});
    // 🛡️ Reagendamento limpa TODOS timestamps de monitoramento — timeline volta ao zero
    var _payload=Object.assign({data:novaData,status:"confirmado",historico_tentativas:_hist,inicio_em:null,termino_em:null},_monitorClearFields);
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,_payload):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_payload)});
      var _dpOld=_ag&&_ag.data?_ag.data.split("-").reverse().join("/"):"";
      var _dpNew=novaData.split("-").reverse().join("/");
      setSyncStatus("✅ Reagendada: "+_dpOld+" → "+_dpNew+(motivo?" — "+motivo:""));
      // WA auto notify about reschedule
      if(cfgWA.whatsapp_ativo==="true"&&_ag){
        var _msg="📅 *MUDANÇA REAGENDADA*\n━━━━━━━━━━━━\n👤 Cliente: *"+(_ag.nome||"")+("*\n📅 Data anterior: *"+_dpOld+"*\n📅 Nova data: *"+_dpNew+"*")+(motivo?"\n📝 Motivo: "+motivo:"")+"\n━━━━━━━━━━━━\n🔧 TELEMIM - PROMORAR";
        if(_ag.contato)enviarWA(_ag.contato,_msg);
        if(_ag.supervisor_id){var _su=listaUsuarios.find(function(u){return u.id===_ag.supervisor_id;});if(_su&&_su.contato)enviarWA(_su.contato,_msg);}
      }
    }catch(e){setSyncStatus("⚠️ Erro ao reagendar");}
    setReagendarModal(null);setReagendarData("");setReagendarMotivo("");
  }
  async function handleAutorizarPendencia(agId){
    var _ag=agenda.find(function(a){return a.id===agId;});
    var _motivo=_ag?_ag.pendencia_motivo:"";
    await handleMoverPendente(agId,_motivo);
  }
  async function handleRecusarPendencia(agId){
    await _ensureAuth();
    setAgenda(function(prev){return prev.map(function(a){return a.id===agId?Object.assign({},a,{pendencia_solicitada:false,pendencia_motivo:null,pendencia_por:null,pendencia_perfil:null,pendencia_em:null}):a;});});
    try{
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({pendencia_solicitada:false,pendencia_motivo:null,pendencia_por:null,pendencia_perfil:null,pendencia_em:null})});
      setSyncStatus("✅ Solicitação de pendência recusada!");
    }catch(e){setSyncStatus("⚠️ Erro ao recusar");}
  }
  // ── REENVIAR mensagem ao motorista sem alterar banco (botão "📲 Reenviar")
  async function reenviarMensagensMotorista(agId,motoristaId,tipo){
    if(!motoristaId){setSyncStatus("⚠️ Selecione um motorista");return;}
    var _mot=listaUsuarios.find(function(u){return u.id===motoristaId;});
    if(!_mot){setSyncStatus("⚠️ Motorista não encontrado");return;}
    if(!_mot.contato){setSyncStatus("⚠️ Motorista sem contato cadastrado");return;}
    var _ag=agenda.find(function(a){return a.id===agId;});
    if(!_ag){setSyncStatus("⚠️ Mudança não encontrada");return;}
    var _ok=await _confirmarReenvio({
      icone:tipo==="VAN"?"🚐":"🚚",
      titulo:"Reenviar rota para o motorista?",
      destinatario:{nome:_mot.nome||"",contato:_mot.contato,tipo:tipo==="VAN"?"🚐 Motorista da Van":"🚚 Motorista do Caminhão"},
      contexto:{cliente:_ag.nome||"",data:_ag.data||"",horario:_ag.horario||"",comunidade:_ag.comunidade||""},
      acaoLabel:"📲 Reenviar mensagem"
    });
    if(!_ok)return;
    setSyncStatus("📲 Reenviando mensagem...");
    try{
      var _dataR=_ag.data||_fmtDate(new Date());
      var _nomeUR=usuario&&(usuario.nome||usuario.email)||"Sistema";
      var _r2=await fetch(SUPA_URL+"/functions/v1/gerar-magic-link",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({motorista_id:_mot.id,motorista_nome:_mot.nome||"",data_servico:_dataR,criado_por:_nomeUR})});
      var _d2=await _r2.json();
      if(_d2&&_d2.ok&&_d2.token){
        var _linkR=location.origin+"/?ml="+_d2.token;
        var _icoR=tipo==="VAN"?"🚐":"🚚";
        var _mudsHR=(agenda||[]).filter(function(a){return a.data===_dataR&&(a.motorista_van_id===_mot.id||a.motorista_caminhao_id===_mot.id);});
        var _qtdR=_mudsHR.length||1;
        var _dFR=_dataR.split("-");var _dataFmtR=_dFR.length===3?(_dFR[2]+"/"+_dFR[1]+"/"+_dFR[0]):_dataR;
        var _resR="\n📋 *"+_qtdR+" mudança"+(_qtdR>1?"s":"")+":*\n";
        _resR+="\n👤 *"+(_ag.nome||"")+"*";
        if(_ag.contato)_resR+="\n📞 "+_ag.contato;
        _resR+="\n📅 "+_dataFmtR+"\n⏰ "+(_ag.horario||"—")+(_ag.horario?"h":"")+"\n📍 "+(_ag.comunidade||"—");
        var _eqR="";
        var _supR="";if(_ag.supervisor_id){var _sUR=listaUsuarios.find(function(u){return u.id===_ag.supervisor_id;});if(_sUR)_supR=_sUR.nome||"";}
        if(_supR)_eqR+="\n👷 Supervisor: "+_supR;
        if(tipo==="VAN"){
          if(_ag.assist_social)_eqR+="\n👩‍⚕️ Assist. Social: "+_ag.assist_social;
          if(_ag.motorista_caminhao_id){var _mcR=listaUsuarios.find(function(u){return u.id===_ag.motorista_caminhao_id;});if(_mcR)_eqR+="\n🚚 Caminhão: "+(_mcR.nome||"");}
        } else {
          if(_ag.motorista_van_id){var _mvR=listaUsuarios.find(function(u){return u.id===_ag.motorista_van_id;});if(_mvR)_eqR+="\n🚐 Van: "+(_mvR.nome||"");}
        }
        if(_eqR)_resR+="\n\n👥 *Equipe:*"+_eqR;
        if(_qtdR>1)_resR+="\n\n_(+"+(_qtdR-1)+" outra"+(_qtdR>2?"s":"")+" no link)_";
        var _msgRotaR=_icoR+" *TELEMIM — SUA ROTA*\n━━━━━━━━━━━━━━\nOlá *"+(_mot.nome||"")+"*!\n\nVocê foi designado(a) como motorista "+(tipo==="VAN"?"da *VAN*":"do *CAMINHÃO*")+"."+_resR+"\n\n🔗 *Ver detalhes completos:*\n"+_linkR+"\n━━━━━━━━━━━━━━\n_Link válido até meia-noite_";
        enviarWA(_mot.contato,_msgRotaR);
      }
      setSyncStatus("📲 Mensagem reenviada para "+(_mot.nome||"")+"!");
      setTimeout(function(){setSyncStatus("✅ Sincronizado");},3500);
    }catch(e){console.warn("[reenviar]",e);setSyncStatus("⚠️ Erro ao reenviar");}
  }
  // ── REENVIAR mensagem ao supervisor sem alterar banco
  async function reenviarMensagensSupervisor(agId,supId){
    if(!supId){setSyncStatus("⚠️ Selecione um supervisor");return;}
    var _sup=listaUsuarios.find(function(u){return u.id===supId;});
    if(!_sup){setSyncStatus("⚠️ Supervisor não encontrado");return;}
    if(!_sup.contato){setSyncStatus("⚠️ Supervisor sem contato cadastrado");return;}
    var _ag=agenda.find(function(a){return a.id===agId;});
    if(!_ag){setSyncStatus("⚠️ Mudança não encontrada");return;}
    var _ok=await _confirmarReenvio({
      icone:"👷",
      titulo:"Reenviar mensagem ao supervisor?",
      destinatario:{nome:_sup.nome||"",contato:_sup.contato,tipo:"👷 Supervisor"},
      contexto:{cliente:_ag.nome||"",data:_ag.data||"",horario:_ag.horario||"",comunidade:_ag.comunidade||""},
      acaoLabel:"📲 Reenviar mensagem"
    });
    if(!_ok)return;
    setSyncStatus("📲 Reenviando mensagem...");
    try{
      if(cfgWA.whatsapp_ativo==="true"&&cfgWAauto.atribuida&&cfgWAauto.atribuida.ativo){
        var _motVanS="";if(_ag.motorista_van_id){var _mvS=listaUsuarios.find(function(u){return u.id===_ag.motorista_van_id;});if(_mvS)_motVanS=_mvS.nome||"";}
        var _motCamS="";if(_ag.motorista_caminhao_id){var _mcS=listaUsuarios.find(function(u){return u.id===_ag.motorista_caminhao_id;});if(_mcS)_motCamS=_mcS.nome||"";}
        var _oriS=encodeURIComponent((_ag.origem||"").replace(/\s+/g," ").trim());
        var _dstS=encodeURIComponent((_ag.destino||"").replace(/\s+/g," ").trim());
        var _vS={cliente:_ag.nome||"",data:_ag.data||"",hora:_ag.horario||"",origem:_ag.origem||"",destino:_ag.destino||"",motorista:"",supervisor:_sup.nome||"",metragem:_ag.metragem||"",caminhao:_motCamS,van:_motVanS,contato:_ag.contato||"",assistente:_ag.assist_social||"",mapa_origem:_oriS?"https://www.google.com/maps/search/?api=1&query="+_oriS:"",mapa_destino:_dstS?"https://www.google.com/maps/search/?api=1&query="+_dstS:""};
        enviarWA(_sup.contato,substituirVarsWA(cfgWAauto.atribuida.msg,_vS));
      } else {
        var _dpSup=(_ag.data||"");var _dpSupF=_dpSup.split("-");if(_dpSupF.length===3)_dpSup=_dpSupF[2]+"/"+_dpSupF[1]+"/"+_dpSupF[0];
        var _msgSupR="Olá "+(_sup.nome||"")+"! Você foi designado para supervisionar a mudança:\n👤 "+(_ag.nome||"")+" \n📅 "+_dpSup+(_ag.horario?" às "+_ag.horario+"h":"")+"\n📦 De: "+(_ag.origem||"?")+"\n🏘️ Para: "+(_ag.destino||"?")+"\n👷 TELEMIM";
        enviarWA(_sup.contato,_msgSupR);
      }
      setSyncStatus("📲 Mensagem reenviada para "+(_sup.nome||"")+"!");
      setTimeout(function(){setSyncStatus("✅ Sincronizado");},3500);
    }catch(e){console.warn("[reenviar-sup]",e);setSyncStatus("⚠️ Erro ao reenviar");}
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
        // AUTO: Gera link de rota + envia WA unica ao motorista
        try{
          var _motR=listaUsuarios.find(function(u){return u.id===mid;});
          if(_motR&&_motR.contato){
            var _dataR=(_agItem&&_agItem.data)||_fmtDate(new Date());
            var _nomeUserR=usuario&&(usuario.nome||usuario.email)||"Sistema";
            fetch(SUPA_URL+"/functions/v1/gerar-magic-link",{
              method:"POST",
              headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},
              body:JSON.stringify({motorista_id:_motR.id,motorista_nome:_motR.nome||"",data_servico:_dataR,criado_por:_nomeUserR})
            }).then(function(r){return r.json();}).then(function(d){
              if(!d||!d.ok||!d.token)return;
              var _linkUrl=location.origin+"/?ml="+d.token;
              var _ico=tipo==="VAN"?"🚐":"🚚";
              var _mudsHoje=(agenda||[]).filter(function(a){return a.data===_dataR&&(a.motorista_van_id===mid||a.motorista_caminhao_id===mid);});
              var _qtd=_mudsHoje.length||1;
              var _dF=_dataR.split("-");var _dataFmt=_dF.length===3?(_dF[2]+"/"+_dF[1]+"/"+_dF[0]):_dataR;
              var _resumo="";
              if(_agItem){
                _resumo="\n📋 *"+_qtd+" mudança"+(_qtd>1?"s":"")+":*\n";
                _resumo+="\n👤 *"+(_agItem.nome||"")+"*";
                if(_agItem.contato)_resumo+="\n📞 "+_agItem.contato;
                _resumo+="\n📅 "+_dataFmt+"\n⏰ "+(_agItem.horario||"—")+(_agItem.horario?"h":"")+"\n📍 "+(_agItem.comunidade||"—");
                var _equipe="";
                var _supN="";if(_agItem.supervisor_id){var _sU=listaUsuarios.find(function(u){return u.id===_agItem.supervisor_id;});if(_sU)_supN=_sU.nome||"";}
                if(_supN)_equipe+="\n👷 Supervisor: "+_supN;
                if(tipo==="VAN"){
                  if(_agItem.assist_social)_equipe+="\n👩‍⚕️ Assist. Social: "+_agItem.assist_social;
                  if(_agItem.motorista_caminhao_id){var _mc=listaUsuarios.find(function(u){return u.id===_agItem.motorista_caminhao_id;});if(_mc)_equipe+="\n🚚 Caminhão: "+(_mc.nome||"");}
                } else {
                  if(_agItem.motorista_van_id){var _mv=listaUsuarios.find(function(u){return u.id===_agItem.motorista_van_id;});if(_mv)_equipe+="\n🚐 Van: "+(_mv.nome||"");}
                }
                if(_equipe)_resumo+="\n\n👥 *Equipe:*"+_equipe;
                if(_qtd>1)_resumo+="\n\n_(+"+(_qtd-1)+" outra"+(_qtd>2?"s":"")+" no link)_";
              }
              var _msgRota=_ico+" *TELEMIM — SUA ROTA*\n━━━━━━━━━━━━━━\nOlá *"+(_motR.nome||"")+"*!\n\nVocê foi designado(a) como motorista "+(tipo==="VAN"?"da *VAN*":"do *CAMINHÃO*")+"."+_resumo+"\n\n🔗 *Ver detalhes completos:*\n"+_linkUrl+"\n━━━━━━━━━━━━━━\n_Link válido até meia-noite_";
              enviarWA(_motR.contato,_msgRota);
            }).catch(function(e){console.warn("[auto-magic-link]",e);});
          }
        }catch(e){console.warn("[auto-magic-link]",e);}
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
        // WA auto: atribuida (supervisor dispatch)
        if(cfgWA.whatsapp_ativo==="true"&&cfgWAauto.atribuida&&cfgWAauto.atribuida.ativo){
          var _supU=listaUsuarios.find(function(u){return u.id===sid;});
          var _motVanNome="";var _motCamNome="";if(_ag.motorista_van_id){var _mvU=listaUsuarios.find(function(u){return u.id===_ag.motorista_van_id;});if(_mvU)_motVanNome=_mvU.nome||"";}if(_ag.motorista_caminhao_id){var _mcU=listaUsuarios.find(function(u){return u.id===_ag.motorista_caminhao_id;});if(_mcU)_motCamNome=_mcU.nome||"";}
          var _oriEnc2=encodeURIComponent((_ag.origem||"").replace(/\s+/g," ").trim());
          var _dstEnc2=encodeURIComponent((_ag.destino||"").replace(/\s+/g," ").trim());
          var _vars2={cliente:_ag.nome||"",data:_ag.data||"",hora:_ag.horario||"",origem:_ag.origem||"",destino:_ag.destino||"",motorista:"",supervisor:(_supU&&_supU.nome)||"",metragem:_ag.metragem||"",caminhao:_motCamNome,van:_motVanNome,contato:_ag.contato||"",assistente:_ag.assist_social||"",mapa_origem:_oriEnc2?"https://www.google.com/maps/search/?api=1&query="+_oriEnc2:"",mapa_destino:_dstEnc2?"https://www.google.com/maps/search/?api=1&query="+_dstEnc2:""};
          var _nums2=resolverDestinatariosWA(cfgWAauto.atribuida.dest,Object.assign({},_ag,{supervisor_id:sid}));
          _nums2.forEach(function(n){enviarWA(n,substituirVarsWA(cfgWAauto.atribuida.msg,_vars2));});
        }}
      if(sid&&_ag){var _sup=listaUsuarios.find(function(u){return u.id===sid;});if(_sup&&_sup.email){try{await fetch(SUPA_URL+"/functions/v1/enviar-email-agendamento",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({to:_sup.email,subject:"📋 Designação de Supervisão — "+(_ag.nome||"Mudança"),html:"<h2>Olá "+(_sup.nome||"Supervisor")+"!</h2><p>Você foi designado(a) para supervisionar a seguinte mudança:</p><p><b>👤 Cliente:</b> "+(_ag.nome||"—")+"</p><p><b>📅 Data:</b> "+(_ag.data||"—")+(_ag.horario?" às "+_ag.horario+"h":"")+"</p><p><b>🏷️ Selo:</b> "+(_ag.selo||"—")+"</p><p><b>📦 Saída:</b> "+(_ag.origem||"—")+"</p><p><b>🏘️ Destino:</b> "+(_ag.destino||"—")+"</p><br><p>Acesse o app para mais detalhes.</p><p><b>TELEMIM — PROMORAR</b></p>"})});} catch(e){}}}
    }catch(e){loadAg();setSyncStatus("⚠️ Erro ao designar");}
  }

  async function _gerarPDFComAssinatura(m,assinaturaB64,obs){
    var LOGO='data:image/jpeg;base64,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'
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
      // CABEÇALHO timbrado
      _addPDFHeader(doc,'DECLARAÇÃO DE RECEBIMENTO','Contrato: PROMORAR');
      Y=32;
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
      // Rodapé timbrado
      var _osNow=new Date();var _osStr=_osNow.toLocaleDateString('pt-BR')+' '+_osNow.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      _addPDFFooter(doc,_osStr);
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

  // ── TERCEIRIZAR MUDANÇA ──────────────────────────────────────────────────
  async function salvarAssistSocial(agId,nomeAssist,contatoAssist){
    setTerceirizarSaving(true);
    var _ag=terceirizarModal;
    try{
      setAgenda(function(prev){return prev.map(function(x){return x.id===agId?Object.assign({},x,{assist_social:nomeAssist}):x;});});
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({assist_social:nomeAssist})});
      setSyncStatus("✅ Assistente vinculada!");
      setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);
      // Enviar WhatsApp para a assistente
      if(contatoAssist&&_ag){
        var tel=contatoAssist.replace(/\D/g,"");
        if(tel.length>=10){
          var veiculos=[_ag.van&&"🚐 Van",_ag.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"—";
          var _nomeUser=usuario&&(usuario.nome||usuario.email)||"Sistema";
          var texto="🚛 *TELEMIM — MUDANÇA ATRIBUÍDA*\n━━━━━━━━━━━━━━━━━\nOlá *"+nomeAssist+"*! 👋\nVocê foi vinculada à mudança:\n\n👤 *Beneficiário:* "+_ag.nome+"\n🏷️ *Selo:* "+(_ag.selo||"—")+"\n📅 *Data:* "+fmtDate(_ag.data)+(_ag.horario?" ⏰ "+_ag.horario:"")+"\n📍 *Comunidade:* "+(_ag.comunidade||"—")+"\n📦 *Saída:* "+(_ag.origem||"—")+"\n🏠 *Chegada:* "+(_ag.destino||"—")+"\n🚗 *Veículos:* "+veiculos+(_ag.contato?"\n📞 *Contato beneficiário:* "+_ag.contato:"")+"\n━━━━━━━━━━━━━━━━━\n_Atribuído por: "+_nomeUser+"_\n_TELEMIM_";
          enviarWA(tel,texto);
        }
      }
    }catch(e){setSyncStatus("⚠️ Erro ao vincular");}
    setTerceirizarSaving(false);
    setTerceirizarModal(null);
    setTerceirizarSel("");
  }
  function terceirizarWhatsApp(a){
    var veiculos=[a.van&&"🚐 Van",a.caminhao&&"🚚 Caminhão"].filter(Boolean).join(" + ")||"—";
    var _nomeUser=usuario&&(usuario.nome||usuario.email)||"Sistema";
    var _perfLabel=isPromorar?"Promorar":isAdmin?"Admin":isSupervisor?"Supervisor":perfil==="coordenador"?"Coordenador":isSocial?"Social":"Usuário";
    var texto="🚛 *TELEMIM — TERCEIRIZAR MUDANÇA*\n━━━━━━━━━━━━━━━━━\n👤 *Beneficiário:* "+a.nome+"\n🏷️ *Selo:* "+(a.selo||"—")+"\n📅 *Data:* "+fmtDate(a.data)+(a.horario?" ⏰ "+a.horario:"")+"\n📍 *Comunidade:* "+(a.comunidade||"—")+"\n📦 *Saída:* "+(a.origem||"—")+"\n🏠 *Chegada:* "+(a.destino||"—")+"\n🚗 *Veículos:* "+veiculos+(a.contato?"\n📞 *Contato:* "+a.contato:"")+"\n━━━━━━━━━━━━━━━━━\n_Terceirizado por: "+_nomeUser+" ("+_perfLabel+")_\n_TELEMIM_";
    window.open("https://wa.me/?text="+encodeURIComponent(texto),"_blank");
  }
  async function gerarLinkMudanca(agId){
    setMudLinkLoading(true);
    try{
      var _nomeUser=usuario&&(usuario.nome||usuario.email)||"Sistema";
      var res=await fetch(SUPA_URL+"/functions/v1/gerar-link-mudanca",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({mudanca_id:agId,criado_por:_nomeUser})});
      var d=await res.json();
      if(d.ok&&d.token){setMudLinkToken(d.token);}else{alert("Erro: "+(d.error||"falha"));}
    }catch(e){alert("Erro de conexão");}
    setMudLinkLoading(false);
  }

  // ── INLINE TERCEIRIZAR: vincular + gerar link + WhatsApp ──
  async function vincularAssistEEnviarLink(agItem,nomeAssist,contatoAssist){
    setTercInlineLoading(agItem.id);
    try{
      setAgenda(function(prev){return prev.map(function(x){return x.id===agItem.id?Object.assign({},x,{assist_social:nomeAssist}):x;});});
      await fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+agItem.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({assist_social:nomeAssist})});
      var _nomeUser=usuario&&(usuario.nome||usuario.email)||"Sistema";
      var res=await fetch(SUPA_URL+"/functions/v1/gerar-link-mudanca",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({mudanca_id:agItem.id,criado_por:_nomeUser})});
      if(!res.ok){
        var _txt=await res.text();
        alert("Erro ao gerar link (HTTP "+res.status+"): "+_txt.substring(0,200));
        setTercInlineLoading(null);setTercInlineId(null);setTerceirizarSel("");
        return;
      }
      var d=await res.json();
      if(d.ok&&d.token){
        var url=location.origin+"/?mm="+d.token;
        var tel=contatoAssist?(contatoAssist+"").replace(/\D/g,""):"";
        var texto="🏠 *Mudança — Acesso Temporário*\n━━━━━━━━━━━━━━━━━\n👤 *Beneficiário:* "+(agItem.nome||"")+"\n📅 *Data:* "+fmtDate(agItem.data)+(agItem.horario?" ⏰ "+agItem.horario:"")+"\n📍 *Comunidade:* "+(agItem.comunidade||"—")+"\n📦 *Saída:* "+(agItem.origem||"—")+"\n🏠 *Chegada:* "+(agItem.destino||"—")+"\n━━━━━━━━━━━━━━━━━\n🔗 *Acesse o link:*\n"+url+"\n_Válido até meia-noite_\n_TELEMIM_";
        if(tel.length>=10){
          enviarWA(tel,texto);
          setSyncStatus("✅ Assistente vinculada + link enviado para "+tel);
        }else{
          try{
            if(navigator.clipboard&&navigator.clipboard.writeText){
              await navigator.clipboard.writeText(texto);
              alert("✅ Assistente vinculada!\n\n⚠️ Sem contato cadastrado para envio automático. O link foi copiado para a área de transferência.");
            }else{
              alert("✅ Assistente vinculada!\n\n⚠️ Sem contato cadastrado. Link gerado:\n"+url);
            }
          }catch(_e){
            alert("✅ Assistente vinculada!\n\n⚠️ Sem contato cadastrado. Link gerado:\n"+url);
          }
          setSyncStatus("⚠️ Vinculada — link copiado (sem contato)");
        }
        setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);
      }else{
        alert("Erro ao gerar link: "+(d.error||d.message||"falha desconhecida"));
      }
    }catch(e){
      console.error("[vincularAssistEEnviarLink]",e);
      alert("Erro: "+e.message);
    }
    setTercInlineLoading(null);setTercInlineId(null);setTerceirizarSel("");
  }
  async function enviarLinkWhatsApp(agItem,contatoAssist){
    setTercInlineLoading(agItem.id);
    try{
      var _nomeUser=usuario&&(usuario.nome||usuario.email)||"Sistema";
      var res=await fetch(SUPA_URL+"/functions/v1/gerar-link-mudanca",{method:"POST",headers:{"apikey":SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({mudanca_id:agItem.id,criado_por:_nomeUser})});
      if(!res.ok){
        var _txt=await res.text();
        alert("Erro ao gerar link (HTTP "+res.status+"): "+_txt.substring(0,200));
        setTercInlineLoading(null);
        return;
      }
      var d=await res.json();
      if(d.ok&&d.token){
        var url=location.origin+"/?mm="+d.token;
        var tel=contatoAssist?(contatoAssist+"").replace(/\D/g,""):"";
        var texto="🏠 *Mudança — Acesso Temporário*\n━━━━━━━━━━━━━━━━━\n👤 *Beneficiário:* "+(agItem.nome||"")+"\n📅 *Data:* "+fmtDate(agItem.data)+(agItem.horario?" ⏰ "+agItem.horario:"")+"\n📍 *Comunidade:* "+(agItem.comunidade||"—")+"\n📦 *Saída:* "+(agItem.origem||"—")+"\n🏠 *Chegada:* "+(agItem.destino||"—")+"\n━━━━━━━━━━━━━━━━━\n🔗 *Acesse o link:*\n"+url+"\n_Válido até meia-noite_\n_TELEMIM_";
        if(tel.length>=10){
          enviarWA(tel,texto);
          setSyncStatus("✅ Link enviado para "+tel);
          setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);
        }else{
          // Sem contato: copia o link pra área de transferência e avisa
          try{
            if(navigator.clipboard&&navigator.clipboard.writeText){
              await navigator.clipboard.writeText(texto);
              alert("⚠️ Assistente social sem contato cadastrado.\n\n📋 O link foi copiado para a área de transferência. Cole no WhatsApp manualmente.\n\nPara enviar automaticamente, cadastre o telefone da assistente em: Config → Social.");
            }else{
              alert("⚠️ Assistente social sem contato cadastrado.\n\nCadastre o telefone em: Config → Social.\n\nLink gerado:\n"+url);
            }
          }catch(_clipErr){
            alert("⚠️ Assistente social sem contato cadastrado.\n\nCadastre o telefone em: Config → Social.\n\nLink gerado:\n"+url);
          }
          setSyncStatus("⚠️ Assistente sem contato — link copiado");
          setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);
        }
      }else{
        alert("Erro ao gerar link: "+(d.error||d.message||"falha desconhecida"));
      }
    }catch(e){
      console.error("[enviarLinkWhatsApp]",e);
      alert("Erro de conexão: "+e.message);
    }
    setTercInlineLoading(null);
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
      // PROTOCOLO: Somente itens CONCLUÍDOS vão para Registros/Financeiro.
      // Itens "ativos" (caminhão saiu, em andamento) mas NÃO concluídos ficam na Agenda.
      // Isso evita que mudanças em progresso apareçam como realizadas em Registros.
      if(!_done) return;
      var key=(a.nome||"").toLowerCase().trim()+"|"+a.data;
      if(_seenKeys[key]) return;
      _seenKeys[key]=true;
      _list.push(Object.assign({},a,{_fromAgenda:true,status:"Concluído",termino_em:a.termino_em||a.termino_van_em||a.termino_caminhao_em||null,criado_em:a.criado_em||a.termino_em||null}));
    });
    return _list;
  })();
  // _allForDespesa: TODAS as mudanças agendadas (não-deletadas, não-canceladas)
  // Usada para cálculo de DESPESAS (custos reais: caminhão saiu, ajudante trabalhou)
  const _allForDespesa=(function(){
    var _list2=[].concat(mudancas||[]).filter(function(m){return !m.deleted_at;});
    var _seen2={};
    _list2.forEach(function(m){if(m.nome&&m.data)_seen2[(m.nome||"").toLowerCase().trim()+"|"+m.data]=true;});
    (agenda||[]).forEach(function(a){
      if(a.deleted_at||!a.data||a.status==="cancelada"||a.status==="pendente"||a.status==="pendente_social") return;
      var key2=(a.nome||"").toLowerCase().trim()+"|"+a.data;
      if(_seen2[key2]) return;
      _seen2[key2]=true;
      _list2.push(Object.assign({},a,{_fromAgenda:true}));
    });
    return _list2;
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

  // PROTOCOLO: Contagem de mudanças para Financeiro inclui TODAS as agendadas
  // (não apenas concluídas), pois ajudantes trabalham independente de conclusão.
  // Exclui apenas canceladas e deletadas.
  var _countMudFinanceiro=function(data){
    var _seenF={};var count=0;
    (mudancas||[]).forEach(function(m){if(!m.deleted_at&&m.data===data){var k=(m.nome||"").toLowerCase().trim()+"|"+m.data;_seenF[k]=true;count++;}});
    (agenda||[]).forEach(function(a){if(!a.deleted_at&&a.data===data&&a.status!=="cancelada"&&a.status!=="pendente"&&a.status!=="pendente_social"){var k=(a.nome||"").toLowerCase().trim()+"|"+a.data;if(!_seenF[k]){_seenF[k]=true;count++;}}});
    return count;
  };
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
  const proximas=agendaOrdenada.filter(a=>a.data>=hoje&&a.status!=="pendente");
  const passadas=agendaOrdenada.filter(a=>a.status==="pendente"||a.data<hoje);
  const _statusRealizados=["realizado","realizada","realizado","executado","executada","concluido","concluida","Realizado","Realizada"];
  // Excluir também itens que já existem em mudancas (foram sincronizados como realizados)
  const _jaEmMudancas=function(a){return mudancas.some(function(m){return m.data===a.data&&(m.nome||"").toLowerCase().trim()===(a.nome||"").toLowerCase().trim();});};
  // PROTOCOLO: Cancelada/Pendente não aparece no card do Dashboard
  const mudancasHoje=agendaOrdenada.filter(a=>a.data===hoje&&a.status!=="cancelada"&&a.status!=="pendente"&&a.status!=="pendente_social"&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a));
  const mudancasAmanha=agendaOrdenada.filter(a=>a.data===amanha&&a.status!=="cancelada"&&a.status!=="pendente"&&a.status!=="pendente_social"&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a));
  const mudancasFuturas=isMotorista?agendaOrdenada.filter(a=>a.data>amanha&&!_statusRealizados.includes(a.status)&&!_jaEmMudancas(a)):[];
  const _mesAtual=new Date().getMonth();
  const _anoAtual=new Date().getFullYear();
  const _mesesNome=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const _realizadasMes=isMotorista?(function(){var _hj2=new Date();var _dw2=_hj2.getDay();var _dif2=_dw2===0?6:_dw2-1;var _s0w=new Date(_hj2.getFullYear(),_hj2.getMonth(),_hj2.getDate()-_dif2);var _s1w=new Date(_s0w.getFullYear(),_s0w.getMonth(),_s0w.getDate()+6);var _pad2=function(n){return String(n).padStart(2,"0");};var _siW=_s0w.getFullYear()+"-"+_pad2(_s0w.getMonth()+1)+"-"+_pad2(_s0w.getDate());var _sfW=_s1w.getFullYear()+"-"+_pad2(_s1w.getMonth()+1)+"-"+_pad2(_s1w.getDate());return new Set((_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data>=_siW&&m.data<=_sfW;}).map(function(m){return m.data;})).size;})():(_allForFiltered||[]).filter(function(m){var d=new Date(m.data+"T12:00:00");return !m.deleted_at&&d.getMonth()===_mesAtual&&d.getFullYear()===_anoAtual;}).length;
  const _pendentesMes=agenda.filter(a=>{const d=new Date(a.data+"T12:00:00");const hoje=new Date();hoje.setHours(0,0,0,0);return !a.deleted_at&&d>=hoje&&(a.status==="confirmado"||a.status==="pendente");}).length;
  const _mudHoje=agendaOrdenada.filter(a=>a.data===hoje&&a.status!=="realizado");

  const statusColor={confirmado:"#3b82f6",pendente:"#f59e0b",realizado:"#16a34a",concluida:"#16a34a",concluido:"#16a34a",Concluido:"#16a34a",realizada:"#16a34a",cancelada:"#ef4444",pendente_social:"#8b5cf6",Realizando:"#f97316"};
  const statusBg={confirmado:"#eff6ff",pendente:"#fffbeb",realizado:"#f0fdf4",concluida:"#f0fdf4",concluido:"#f0fdf4",Concluido:"#f0fdf4",realizada:"#f0fdf4",cancelada:"#fef2f2",pendente_social:"#f5f3ff",Realizando:"#fff7ed"};
  const statusLabel={confirmado:"✅ Confirmado",pendente:"⏳ Pendente",realizado:"✔ Realizado"};

  const [painelTV,setPainelTV]=useState(false);
  const TABS=isMotorista?[
    {id:"dashboard",label:"🚚 Minha Operação"},
    {id:"registros_mot",label:"📋 Meus Registros"},
    {id:"fin_mot",label:"💰 Financeiro"},
  ]:isSupervisor?[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"lista",label:"📋 Registros"},
    {id:"equipe",label:"👷 Equipe"},
    {id:"financeiro_sup",label:"💰 Financeiro"},
    {id:"config",label:"⚙️ Config"},
  ]:isSocial?[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"monitoramento",label:"📡 Monitor"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"lista",label:"📋 Registros"},
    {id:"importar_mud",label:"+ Mudanças"},
    {id:"social",label:"👩‍⚕️ Social"},
  ]:[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"monitoramento",label:"📡 Monitor"},
    {id:"agenda",label:"📅 Agenda"},
    {id:"lista",label:"📋 Registros"},
    {id:"importar_mud",label:"+ Mudanças"},
    ...(!isAdmin?[{id:"social",label:"👩‍⚕️ Social"}]:[]),
    ...(isAdmin?[{id:"contas",label:"💸 Contas"},{id:"financeiro",label:"💰 Financeiro"},{id:"auditoria",label:"🗄️ Auditoria"},{id:"config",label:"⚙️ Config"}]:[]),
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
    var _mmParam=(function(){try{var u=new URL(window.location.href);return u.searchParams.get("mm")||null;}catch(e){return null;}})();
    if(_mmParam) return <MudancaTerceirizada token={_mmParam}/>;

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
        <div style={{maxWidth:isDesktop?1200:640,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{background:COLORS.accent,borderRadius:12,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🚛</div>
            <div>
              <div style={{fontSize:20,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>TELEMIM</div>
              <div style={{fontSize:10,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase"}}>CONTRATO: PROMORAR</div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
              </div>
              <span style={{fontSize:10,color:syncStatus.includes("✅")?"#4ade80":syncStatus.includes("🔄")?"#fbbf24":"#f87171",fontWeight:700}}>{syncStatus}</span><div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}><span style={{background:isAdmin?"#dbeafe":isPromorar?"#dcfce7":isSupervisor?"#fef3c7":isMotorista?"#ede9fe":"#fef9c3",border:"1px solid "+(isAdmin?"#93c5fd":isPromorar?"#86efac":isSupervisor?"#f59e0b":isMotorista?"#c4b5fd":"#fde047"),borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:800,color:isAdmin?"#1d4ed8":isPromorar?"#15803d":isSupervisor?"#92400e":isMotorista?"#7c3aed":"#a16207"}}>{isAdmin?"🛡️ Admin":isPromorar?"🏢 Promorar":isSupervisor?"👷 Supervisor":isMotorista?"🚚 Motorista":perfil==="coordenador"?"📋 Coordenador":"🌟 Social"}</span><span style={{fontSize:11,color:"#64748b",maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{usuario?.nome?.split(" ")[0]}</span><button onClick={function(){setSoundEnabled(function(p){return !p;});}} title={soundEnabled?"Desativar som":"Ativar som"} style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>{soundEnabled?"🔊":"🔇"}</button><button onClick={registrarPush} title="Notificacoes" style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>🔔</button><button onClick={function(){localStorage.getItem('tmim_bio_enabled')==='true'?desativarBiometria():ativarBiometria();}} title="Biometria" style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:8,padding:"4px 10px",color:"#fff",cursor:"pointer",fontSize:16,marginRight:4}}>🔐</button><button onClick={handleLogout} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 8px",fontSize:10,fontWeight:700,color:"#64748b",cursor:"pointer"}}>Sair</button></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:isDesktop?1200:640,margin:"0 auto",padding:isDesktop?"0 24px":"0 12px"}}>

        {/* Alertas */}
       
        {/* Tabs */}
        <div style={{marginTop:8,marginBottom:0}}>
          {isDesktop?<div style={{display:"flex",gap:8}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>t.id==="importar_mud"?(setTab("novaAgenda"),setShowImportAg(true)):(setTab(t.id),t.id==="registros_mot"&&setAbaMotorista('registros'))} style={{flex:1,padding:"11px 8px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:12,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>:<><div style={{display:"flex",gap:6,marginBottom:6}}>
            {TABS.slice(0,4).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            {TABS.slice(4).map(t=>(
              <button key={t.id} onClick={()=>t.id==="importar_mud"?(setTab("novaAgenda"),setShowImportAg(true)):(setTab(t.id),t.id==="registros_mot"&&setAbaMotorista('registros'))} style={{flex:1,padding:"10px 2px",borderRadius:12,border:`1.5px solid ${tab===t.id?COLORS.accent:COLORS.cardBorder}`,background:tab===t.id?COLORS.accent:"#fff",color:tab===t.id?"#fff":COLORS.muted,fontWeight:800,fontSize:11,cursor:"pointer",transition:"all 0.2s",boxShadow:tab===t.id?"0 2px 8px rgba(230,126,34,0.25)":"none"}}>{t.label}</button>
            ))}
          </div></>}
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
        {(()=>{var _p=usuario&&usuario.perfil||"";var _campoMeu=_p==="admin"?"approved_by_admin":_p==="promorar"?"approved_by_promorar":_p==="supervisor"?"approved_by_supervisor":(_p==="social"||_p==="coordenador")?"approved_by_social":null;if(!_campoMeu)return null;var _pend=[...agenda].filter(function(x){if(!x.data||x.deleted_at)return false;if(x.status==="pendente_social")return false;if(x[_campoMeu])return false;return true;});if(!_pend.length)return null;return(<div style={{margin:"0 12px 16px",background:"#fffbeb",border:"2.5px solid #f59e0b",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(245,158,11,0.25)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>🔔</span><div><div style={{fontWeight:800,fontSize:14,color:"#92400e"}}>Notificações ({_pend.length})</div><div style={{fontWeight:600,fontSize:11,color:"#b45309"}}>Confirme o recebimento das mudanças agendadas</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pend.map(function(x){var _quem=x.created_by||x.approved_by_admin||x.approved_by_social||x.approved_by_promorar||"Sistema";var _perfQuem=x.creator_role||"";return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #fcd34d",borderRadius:12,padding:"10px 12px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>👤 {x.nome}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} · 🏷️ {x.selo||"—"}</div><div style={{fontSize:10,color:"#64748b",marginTop:1}}>Agendado por: <strong>{_quem}</strong>{_perfQuem?" ("+_perfQuem+")":""}</div></div><button onClick={function(e){e.stopPropagation();handleApproveAgenda(x.id);}} disabled={!!isApproving[x.id]} style={{padding:"7px 14px",background:isApproving[x.id]?"#94a3b8":"#16a34a",color:"#fff",border:"none",borderRadius:999,fontWeight:800,fontSize:11,cursor:isApproving[x.id]?"not-allowed":"pointer",whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 2px 8px rgba(22,163,74,0.3)"}}>{isApproving[x.id]?"⏳":"✅ Confirmar"}</button></div></div>);})}</div></div>);})()}
        {(isAdmin||isPromorar)&&(function(){
          var _pendSocial=agenda.filter(function(a){return !a.deleted_at&&a.status==="pendente_social";});
          if(_pendSocial.length===0)return null;
          function _aprovarSocial(xId){_ensureAuth().then(function(){fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+xId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({status:"confirmado"})}).then(function(r){if(r.ok){setAgenda(function(prev){return prev.map(function(a){return a.id===xId?Object.assign({},a,{status:"confirmado"}):a;});});}}).catch(function(){alert("Erro ao aprovar.");});});}
          function _recusarSocial(xId,xNome){if(!confirm("Recusar agendamento de "+xNome+"?"))return;_ensureAuth().then(function(){fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+xId,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify({status:"cancelada",deleted_at:new Date().toISOString()})}).then(function(r){if(r.ok){setAgenda(function(prev){return prev.map(function(a){return a.id===xId?Object.assign({},a,{status:"cancelada",deleted_at:new Date().toISOString()}):a;});});}}).catch(function(){alert("Erro ao recusar.");});});}
          return(<div style={{margin:"0 12px 16px",background:"#eff6ff",border:"2.5px solid #3b82f6",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(59,130,246,0.15)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>👩‍⚕️</span><div><div style={{fontWeight:800,fontSize:14,color:"#1e40af"}}>Aprovações Social ({_pendSocial.length})</div><div style={{fontWeight:600,fontSize:11,color:"#3b82f6"}}>Mudanças agendadas pelo Social aguardando autorização</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pendSocial.map(function(x){return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #bfdbfe",borderRadius:12,padding:"10px 12px"}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",marginBottom:3}}>👤 {x.nome}</div><div style={{fontSize:10,color:"#64748b"}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} · 🏷️ {x.selo||"—"}{x.horario?" · ⏰ "+x.horario:""}</div><div style={{fontSize:10,color:"#64748b",marginTop:1}}>📦 {x.origem||"—"} → 🏠 {x.destino||"—"}</div><div style={{fontSize:10,color:"#64748b",marginTop:1}}>📝 Agendado por: <strong>{x.created_by||"Social"}</strong> ({x.creator_role||"social"})</div><div style={{display:"flex",gap:6,marginTop:8}}><button onClick={function(){_aprovarSocial(x.id);}} style={{flex:1,padding:"8px 10px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Aprovar</button><button onClick={function(){_recusarSocial(x.id,x.nome);}} style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Recusar</button></div></div>);})}</div></div>);})()}
        {isAdmin&&(function(){var _pendCanc=agenda.filter(function(a){return !a.deleted_at&&a.cancelamento_solicitado;});if(_pendCanc.length===0)return null;return(<div style={{margin:"0 12px 16px",background:"#fef2f2",border:"2.5px solid #dc2626",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(220,38,38,0.15)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>🚨</span><div><div style={{fontWeight:800,fontSize:14,color:"#991b1b"}}>Solicitações de Cancelamento ({_pendCanc.length})</div><div style={{fontWeight:600,fontSize:11,color:"#b91c1c"}}>Autorize ou recuse os pedidos abaixo</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pendCanc.map(function(x){return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #fecaca",borderRadius:12,padding:"10px 12px"}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",marginBottom:3}}>📦 {x.nome}</div><div style={{fontSize:10,color:"#64748b"}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} · ⏰ {x.horario||"?"}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>👤 Solicitado por: <strong>{x.cancelamento_por}</strong> ({x.cancelamento_perfil})</div>{x.cancelamento_motivo&&<div style={{fontSize:10,color:"#991b1b",marginTop:2}}>💬 {x.cancelamento_motivo}</div>}<div style={{display:"flex",gap:6,marginTop:8}}><button onClick={function(){handleRecusarCancelamento(x.id);}} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Recusar</button><button onClick={function(){handleAutorizarCancelamento(x.id);}} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Autorizar Cancelamento</button></div></div>);})}</div></div>);})()}
        {isAdmin&&(function(){var _pendPend=agenda.filter(function(a){return !a.deleted_at&&a.pendencia_solicitada;});if(_pendPend.length===0)return null;return(<div style={{margin:"0 12px 16px",background:"#fffbeb",border:"2.5px solid #f59e0b",borderRadius:16,padding:"14px 16px",boxShadow:"0 4px 20px rgba(245,158,11,0.15)"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:22}}>⏳</span><div><div style={{fontWeight:800,fontSize:14,color:"#92400e"}}>Solicitações de Pendência ({_pendPend.length})</div><div style={{fontWeight:600,fontSize:11,color:"#b45309"}}>Autorize ou recuse os pedidos abaixo</div></div></div><div style={{display:"flex",flexDirection:"column",gap:8}}>{_pendPend.map(function(x){return(<div key={x.id} style={{background:"#fff",border:"1.5px solid #fde68a",borderRadius:12,padding:"10px 12px"}}><div style={{fontWeight:800,fontSize:13,color:"#1e293b",marginBottom:3}}>📦 {x.nome}</div><div style={{fontSize:10,color:"#64748b"}}>📅 {x.data?new Date(x.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}):"?"} · ⏰ {x.horario||"?"}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>👤 Solicitado por: <strong>{x.pendencia_por}</strong> ({x.pendencia_perfil})</div>{x.pendencia_motivo&&<div style={{fontSize:10,color:"#92400e",marginTop:2}}>💬 {x.pendencia_motivo}</div>}{(function(){var _ht=x.historico_tentativas||[];if(_ht.length>0)return <div style={{fontSize:9,color:"#b45309",marginTop:3}}>📜 {_ht.length} tentativa{_ht.length>1?"s":""} anterior{_ht.length>1?"es":""}</div>;return null;})()}<div style={{display:"flex",gap:6,marginTop:8}}><button onClick={function(){handleRecusarPendencia(x.id);}} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Recusar</button><button onClick={function(){handleAutorizarPendencia(x.id);}} style={{flex:1,padding:"6px 10px",borderRadius:8,border:"none",background:"#f59e0b",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Autorizar Pendência</button></div></div>);})}</div></div>);})()}
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
                    {(a.approved_by_supervisor||a.supervisor_id)&&(function(){var _supNome=(function(){var _s=listaUsuarios.find(function(u){return u.id===a.supervisor_id;});return _s?_s.nome:(a.approved_by_supervisor||null);})();return _supNome?<div style={{fontSize:_dest?13:12,marginTop:8,fontWeight:700,color:"#065f46",background:"#ecfdf5",borderRadius:8,padding:"5px 10px",border:"1px solid #a7f3d0"}}>👷 Supervisor: {_supNome}</div>:null;})()}
                    {a.assist_social&&<div style={{fontSize:_dest?13:12,marginTop:8,fontWeight:700,color:"#7c2d12",background:"#fff7ed",borderRadius:8,padding:"5px 10px",border:"1px solid #fed7aa"}}>👩‍⚕️ Assist. Social: {a.assist_social}</div>}
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
                  {/* ── SUPERVISOR: Deslocamento Morador ── */}
                  {isSupervisor&&(function(){
                    var _isConcl2=_statusRealizados.includes(a.status)||a.termino_em||(_stMot==="Concluido");
                    var _isIniciada2=a.status==="Realizando"||a.inicio_mudanca_em;
                    if(_isConcl2||_isIniciada2||a.deslocamento_morador_em) return null;
                    return <button onClick={function(){var agora=new Date().toISOString();var body={deslocamento_morador_em:agora};
                      setAgenda(function(prev){return prev.map(function(x){return x.id===a.id?Object.assign({},x,body):x;});});
                      fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)}).then(function(r){if(r.ok){setSyncStatus("✅ Deslocamento registrado!");
                        if(cfgWA.whatsapp_ativo==="true"){var _evDM=cfgWAauto.deslocamento_morador;if(_evDM&&_evDM.ativo){var _supNome=(usuario&&usuario.nome)||"Supervisor";var _dmVars={cliente:a.nome||"",data:a.data||"",hora:a.horario||"",origem:a.origem||"",destino:a.destino||"",motorista:"",supervisor:_supNome,assistente:a.assist_social||"",metragem:a.medicao||"",contato:a.contato||""};var _dmNums=resolverDestinatariosWA(_evDM.dest,a);_dmNums.forEach(function(n){enviarWA(n,substituirVarsWA(_evDM.msg,_dmVars));});}}
                      }setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);}).catch(function(){setSyncStatus("⚠️ Erro");});
                    }} style={{width:"100%",background:"#ea580c",border:"none",borderRadius:_dest?12:10,padding:_dest?"14px 0":"10px 0",fontSize:_dest?15:13,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:8}}>
                      🏠 Deslocamento Morador
                    </button>;
                  })()}
                  {isSupervisor&&a.deslocamento_morador_em&&!a.inicio_mudanca_em&&!((_statusRealizados.includes(a.status)||a.termino_em||_stMot==="Concluido"))&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff7ed",border:"1.5px solid #fb923c",borderRadius:_dest?10:8,padding:_dest?"10px 14px":"8px 12px",marginBottom:8}}>
                      <span style={{fontSize:_dest?14:12}}>🏠</span>
                      <span style={{fontSize:_dest?12:11,fontWeight:700,color:"#c2410c"}}>Deslocamento registrado às {new Date(a.deslocamento_morador_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                  )}
                  {/* ── ADMIN/SUPERVISOR/PROMORAR: Iniciar / Finalizar ── */}
                  {!isMotorista&&!isSocial&&(function(){
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
                  {/* ── TERCEIRIZAR MUDANÇA INLINE ── */}
                  {(isPromorar||isAdmin||isSupervisor||isSocial)&&!((_statusRealizados.includes(a.status)||a.termino_em||_stMot==="Concluido"))&&(
                    <div style={{marginTop:8,background:"#fff7ed",border:"1.5px solid #f97316",borderRadius:12,padding:"10px 12px"}}>
                      <div style={{fontSize:11,fontWeight:800,color:"#c2410c",marginBottom:6,letterSpacing:0.5}}>👩‍⚕️ TERCEIRIZAR MUDANÇA</div>
                      {a.assist_social&&tercInlineId!==a.id?(
                        <div>
                          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#15803d"}}>✅ {a.assist_social}</div>
                            {(function(){var _as=assistSocialList.find(function(s){return s.nome===a.assist_social;});return _as&&_as.contato?<div style={{fontSize:11,color:"#64748b",marginTop:2}}>📞 {_as.contato}</div>:null;})()}
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={function(){var _as=assistSocialList.find(function(s){return s.nome===a.assist_social;});enviarLinkWhatsApp(a,_as&&_as.contato||"");}} disabled={tercInlineLoading===a.id} style={{flex:2,padding:"9px 0",borderRadius:8,border:"none",background:tercInlineLoading===a.id?"#94a3b8":"#25d366",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                              {tercInlineLoading===a.id?"⏳...":"📲 Reenviar Link WhatsApp"}
                            </button>
                            <button onClick={function(){setTercInlineId(a.id);setTerceirizarSel("");}} style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>🔄 Trocar</button>
                          </div>
                        </div>
                      ):(
                        <div>
                          <select value={tercInlineId===a.id?terceirizarSel:""} onChange={function(e){setTercInlineId(a.id);setTerceirizarSel(e.target.value);}} style={{width:"100%",padding:"9px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:12,fontWeight:700,background:"#fff",color:"#1e293b",cursor:"pointer",boxSizing:"border-box",marginBottom:6}}>
                            <option value="">Selecione assistente...</option>
                            {assistSocialList.map(function(s){return <option key={s.id} value={s.nome}>{s.nome}{s.contato?" ("+s.contato+")":""}</option>;})}
                          </select>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={function(){if(!terceirizarSel){alert("Selecione uma assistente.");return;}var _su=assistSocialList.find(function(s){return s.nome===terceirizarSel;});vincularAssistEEnviarLink(a,terceirizarSel,_su&&_su.contato||"");}} disabled={tercInlineLoading===a.id||!terceirizarSel} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:tercInlineLoading===a.id?"#94a3b8":terceirizarSel?"#16a34a":"#94a3b8",color:"#fff",fontWeight:700,fontSize:11,cursor:terceirizarSel?"pointer":"not-allowed"}}>
                              {tercInlineLoading===a.id?"⏳ Gerando...":"✅ OK"}
                            </button>
                            <button onClick={function(){enviarLinkWhatsApp(a,"");}} disabled={tercInlineLoading===a.id} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:tercInlineLoading===a.id?"#94a3b8":"#25d366",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                              {tercInlineLoading===a.id?"⏳...":"📲 WhatsApp"}
                            </button>
                          </div>
                          {tercInlineId===a.id&&a.assist_social&&<button onClick={function(){setTercInlineId(null);}} style={{width:"100%",marginTop:4,padding:"6px 0",borderRadius:6,border:"1px solid #e2e8f0",background:"transparent",color:"#64748b",fontSize:10,fontWeight:600,cursor:"pointer"}}>Cancelar</button>}
                        </div>
                      )}
                    </div>
                  )}
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
                    {a.contato&&<div style={{fontSize:12,marginTop:8,fontWeight:700,color:"#1e40af",background:"#eff6ff",borderRadius:8,padding:"5px 10px",border:"1px solid #93c5fd"}}>📞 Morador: {a.contato}</div>}
                    {(a.approved_by_supervisor||a.supervisor_id)&&(function(){var _supNome=(function(){var _s=listaUsuarios.find(function(u){return u.id===a.supervisor_id;});return _s?_s.nome:(a.approved_by_supervisor||null);})();return _supNome?<div style={{fontSize:12,marginTop:4,fontWeight:700,color:"#065f46",background:"#ecfdf5",borderRadius:8,padding:"5px 10px",border:"1px solid #a7f3d0"}}>👷 Supervisor: {_supNome}</div>:null;})()}
                  </div>
                  <div style={{background:"#ffedd5",border:"1px solid #fed7aa",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#c2410c",whiteSpace:"nowrap"}}>⏳ Amanhã</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{background:"#fff",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",fontWeight:600,textAlign:"center"}}>
                  🛠️ {isSupervisor||isPromorar?"Prepare a sua equipe para amanhã!":(usuario&&usuario.tipo_veiculo==="CAMINHAO"?"Prepare o caminhão para amanhã!":"Prepare a van para amanhã!")}
                </div>
                {/* ── TERCEIRIZAR MUDANÇA INLINE (AMANHÃ) ── */}
                  {(isPromorar||isAdmin||isSupervisor||isSocial)&&(
                    <div style={{background:"#fff7ed",border:"1.5px solid #f97316",borderRadius:12,padding:"10px 12px"}}>
                      <div style={{fontSize:11,fontWeight:800,color:"#c2410c",marginBottom:6,letterSpacing:0.5}}>👩‍⚕️ TERCEIRIZAR MUDANÇA</div>
                      {a.assist_social&&tercInlineId!==a.id?(
                        <div>
                          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#15803d"}}>✅ {a.assist_social}</div>
                            {(function(){var _as=assistSocialList.find(function(s){return s.nome===a.assist_social;});return _as&&_as.contato?<div style={{fontSize:11,color:"#64748b",marginTop:2}}>📞 {_as.contato}</div>:null;})()}
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={function(){var _as=assistSocialList.find(function(s){return s.nome===a.assist_social;});enviarLinkWhatsApp(a,_as&&_as.contato||"");}} disabled={tercInlineLoading===a.id} style={{flex:2,padding:"9px 0",borderRadius:8,border:"none",background:tercInlineLoading===a.id?"#94a3b8":"#25d366",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                              {tercInlineLoading===a.id?"⏳...":"📲 Reenviar Link WhatsApp"}
                            </button>
                            <button onClick={function(){setTercInlineId(a.id);setTerceirizarSel("");}} style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:11,cursor:"pointer"}}>🔄 Trocar</button>
                          </div>
                        </div>
                      ):(
                        <div>
                          <select value={tercInlineId===a.id?terceirizarSel:""} onChange={function(e){setTercInlineId(a.id);setTerceirizarSel(e.target.value);}} style={{width:"100%",padding:"9px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:12,fontWeight:700,background:"#fff",color:"#1e293b",cursor:"pointer",boxSizing:"border-box",marginBottom:6}}>
                            <option value="">Selecione assistente...</option>
                            {assistSocialList.map(function(s){return <option key={s.id} value={s.nome}>{s.nome}{s.contato?" ("+s.contato+")":""}</option>;})}
                          </select>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={function(){if(!terceirizarSel){alert("Selecione uma assistente.");return;}var _su=assistSocialList.find(function(s){return s.nome===terceirizarSel;});vincularAssistEEnviarLink(a,terceirizarSel,_su&&_su.contato||"");}} disabled={tercInlineLoading===a.id||!terceirizarSel} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:tercInlineLoading===a.id?"#94a3b8":terceirizarSel?"#16a34a":"#94a3b8",color:"#fff",fontWeight:700,fontSize:11,cursor:terceirizarSel?"pointer":"not-allowed"}}>
                              {tercInlineLoading===a.id?"⏳ Gerando...":"✅ OK"}
                            </button>
                            <button onClick={function(){enviarLinkWhatsApp(a,"");}} disabled={tercInlineLoading===a.id} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:tercInlineLoading===a.id?"#94a3b8":"#25d366",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                              {tercInlineLoading===a.id?"⏳...":"📲 WhatsApp"}
                            </button>
                          </div>
                          {tercInlineId===a.id&&a.assist_social&&<button onClick={function(){setTercInlineId(null);}} style={{width:"100%",marginTop:4,padding:"6px 0",borderRadius:6,border:"1px solid #e2e8f0",background:"transparent",color:"#64748b",fontSize:10,fontWeight:600,cursor:"pointer"}}>Cancelar</button>}
                        </div>
                      )}
                    </div>
                  )}
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
                    {(a.approved_by_supervisor||a.supervisor_id)&&(function(){var _supNome=(function(){var _s=listaUsuarios.find(function(u){return u.id===a.supervisor_id;});return _s?_s.nome:(a.approved_by_supervisor||null);})();return _supNome?<div style={{fontSize:12,marginTop:8,fontWeight:700,color:"#065f46",background:"#ecfdf5",borderRadius:8,padding:"5px 10px",border:"1px solid #a7f3d0"}}>👷 Supervisor: {_supNome}</div>:null;})()}
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
                        {!isSocial&&m.medicao>0&&<span style={{fontSize:10,fontWeight:600,color:"#7c3aed",background:"#ede9fe",borderRadius:6,padding:"2px 7px"}}>📐 {m.medicao} m³</span>}
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
  // Função unificada para detectar item concluído (agenda ou mudança)
  var _isCalConcl=function(x){var _s=(x.status||"").toLowerCase();return _s==="concluida"||_s==="concluido"||_s==="concluído"||_s==="realizado"||_s==="realizada"||_s==="registrado"||!!x.termino_em||!!x.termino_van_em||!!x.termino_caminhao_em;};
  // Mesclar agenda (não-deletados) + mudanças (para itens que foram soft-deleted da agenda)
  var _agMes=(agenda||[]).filter(function(a){return a.data&&a.data.slice(0,7)===_prefix&&!a.deleted_at;});
  var _seenCal={};
  _agMes.forEach(function(a){_seenCal[(a.nome||"").toLowerCase().trim()+"|"+a.data]=true;});
  (mudancas||[]).forEach(function(m){if(!m.data||m.deleted_at||m.data.slice(0,7)!==_prefix)return;var key=(m.nome||"").toLowerCase().trim()+"|"+m.data;if(_seenCal[key])return;_seenCal[key]=true;_agMes.push(Object.assign({},m,{_fromMud:true,status:m.status||"Concluído"}));});
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
                  background:_info.items.some(function(x){return x.status==="cancelada";})?"#dc2626":_info.items.every(function(x){return _isCalConcl(x);})?"#047857":"#f59e0b",
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
                  <div style={{width:8,height:8,borderRadius:"50%",background:_isCalConcl(a)?"#047857":a.status==="cancelada"?"#dc2626":"#f59e0b",marginRight:10,flexShrink:0}}></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nome}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{a.comunidade||a.origem||""}{a.horario?<span> - <b style={{color:"#334155"}}>{a.horario.replace(":00","")+"h"}</b></span>:""}</div>
                  </div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:700,color:_isCalConcl(a)?"#047857":a.status==="cancelada"?"#dc2626":"#d97706"}}>{_isCalConcl(a)?"✅":a.status==="cancelada"?"❌":"⏳"}</span>
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
                {/* ── Deslocamento Morador (supervisor, calendário) ── */}
                {isSupervisor&&calDiaSel===_hjStr&&!_isCalConcl(a)&&a.status!=="cancelada"&&!a._fromMud&&!a.deslocamento_morador_em&&!a.inicio_mudanca_em&&a.status!=="Realizando"&&a.status!=="em_andamento"&&(
                  <button onClick={function(e){e.stopPropagation();var agora=new Date().toISOString();var body={deslocamento_morador_em:agora};
                    setAgenda(function(prev){return prev.map(function(x){return x.id===a.id?Object.assign({},x,body):x;});});
                    fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+a.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(body)}).then(function(r){if(r.ok){setSyncStatus("✅ Deslocamento registrado!");
                      if(cfgWA.whatsapp_ativo==="true"){var _evDM=cfgWAauto.deslocamento_morador;if(_evDM&&_evDM.ativo){var _supNome=(usuario&&usuario.nome)||"Supervisor";var _dmVars={cliente:a.nome||"",data:a.data||"",hora:a.horario||"",origem:a.origem||"",destino:a.destino||"",motorista:"",supervisor:_supNome,assistente:a.assist_social||"",metragem:a.medicao||"",contato:a.contato||""};var _dmNums=resolverDestinatariosWA(_evDM.dest,a);_dmNums.forEach(function(n){enviarWA(n,substituirVarsWA(_evDM.msg,_dmVars));});}}
                    }setTimeout(function(){setSyncStatus("✅ Sincronizado");},2500);}).catch(function(){setSyncStatus("⚠️ Erro");});
                  }} style={{width:"100%",background:"#ea580c",color:"#fff",border:"none",borderRadius:6,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:4,marginBottom:4}}>🏠 Deslocamento Morador</button>
                )}
                {isSupervisor&&a.deslocamento_morador_em&&!a.inicio_mudanca_em&&!_isCalConcl(a)&&(
                  <div style={{fontSize:9,fontWeight:700,color:"#c2410c",background:"#fff7ed",borderRadius:5,padding:"3px 6px",marginTop:4}}>🏠 Desloc. {new Date(a.deslocamento_morador_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>
                )}
                {/* ── Iniciar / Finalizar Mudança (admin, supervisor, promorar, social) ── */}
                {(isAdmin||isSupervisor||isPromorar)&&calDiaSel===_hjStr&&!_isCalConcl(a)&&a.status!=="cancelada"&&!a._fromMud&&(
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
  if(painelTV){
    var _hjStr2=new Date().toISOString().slice(0,10);
    var _hjFmt2=(function(){var p=_hjStr2.split("-");return p[2]+"/"+p[1]+"/"+p[0];})();
    var _hora2=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    var _fmtH=function(ts){if(!ts)return null;var d=new Date(ts);if(isNaN(d.getTime()))return null;return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
    var _totalAtivas=monitorData.reduce(function(s,g){return s+(g.activeMove?1:0);},0);
    var _totalPend=monitorData.reduce(function(s,g){return s+g.pendingMoves.length;},0);
    var _totalConc=monitorData.reduce(function(s,g){return s+g.completedMoves.length;},0);
    return(<div style={{position:"fixed",inset:0,zIndex:10000,background:"#0f172a",color:"#fff",overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",background:"linear-gradient(135deg,#1e3a8a,#1e40af)",borderBottom:"2px solid #3b82f6"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:28}}>📺</span>
          <div><div style={{fontSize:22,fontWeight:900,letterSpacing:1}}>TELEMIM — PROMORAR</div><div style={{fontSize:13,opacity:0.8}}>Painel de Monitoramento em Tempo Real</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:"#fbbf24"}}>{_totalAtivas}</div><div style={{fontSize:10,fontWeight:700,opacity:0.7}}>EM ANDAMENTO</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:"#93c5fd"}}>{_totalPend}</div><div style={{fontSize:10,fontWeight:700,opacity:0.7}}>AGUARDANDO</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:"#4ade80"}}>{_totalConc}</div><div style={{fontSize:10,fontWeight:700,opacity:0.7}}>CONCLUÍDAS</div></div>
          <div style={{borderLeft:"1px solid rgba(255,255,255,0.3)",paddingLeft:16}}>
            <div style={{fontSize:20,fontWeight:900}}>{_hora2}</div>
            <div style={{fontSize:12,opacity:0.7}}>{_hjFmt2}</div>
          </div>
          <button onClick={function(){setPainelTV(false);}} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✖ Fechar</button>
        </div>
      </div>
      <div style={{padding:20,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:16}}>
        {monitorData.map(function(g){
          var sup=listaUsuarios.find(function(u){return u.id===g.supervisorId;});
          var am=g.activeMove;
          var _statusTxt=am?(function(){
            if(am.termino_van_em||am.termino_caminhao_em)return{txt:"CONCLUÍDA",bg:"#16a34a",icon:"✅"};
            if(am.chegada_van_em||am.chegada_caminhao_em)return{txt:"DESCARREGANDO",bg:"#f59e0b",icon:"📦"};
            if(am.saiu_destino_van_em||am.saiu_destino_cam_em)return{txt:"RUMO AO DESTINO",bg:"#7c3aed",icon:"🚚"};
            if(am.chegou_origem_van_em||am.chegou_origem_cam_em)return{txt:"NA ORIGEM",bg:"#2563eb",icon:"📍"};
            if(am.inicio_van_em||am.van_saiu_em||am.inicio_caminhao_em||am.caminhao_saiu_em)return{txt:"EM DESLOCAMENTO",bg:"#f97316",icon:"🚗"};
            return{txt:"AGUARDANDO",bg:"#64748b",icon:"⏳"};
          })():{txt:"SEM ATIVIDADE",bg:"#334155",icon:"💤"};
          return(<div key={g.supervisorId} style={{background:"#1e293b",borderRadius:16,border:"1px solid #334155",overflow:"hidden"}}>
            <div style={{padding:"12px 16px",background:am?"linear-gradient(135deg,"+_statusTxt.bg+","+_statusTxt.bg+"cc)":"#334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:20}}>{_statusTxt.icon}</span>
                <div><div style={{fontSize:14,fontWeight:900}}>{sup?sup.nome:"👷 Supervisor"}</div><div style={{fontSize:11,opacity:0.8}}>{_statusTxt.txt}</div></div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,opacity:0.7}}>Pendentes: {g.pendingMoves.length}</div>
                <div style={{fontSize:11,opacity:0.7}}>Concluídas: {g.completedMoves.length}</div>
              </div>
            </div>
            {am&&<div style={{padding:"14px 16px"}}>
              <div style={{fontSize:18,fontWeight:900,marginBottom:6}}>👤 {am.nome||"—"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12,lineHeight:1.8}}>
                <div>🏷️ <strong>Selo:</strong> {am.selo||"—"}</div>
                <div>⏰ <strong>Horário:</strong> {am.horario||"—"}</div>
                <div style={{gridColumn:"1/3"}}>📦 <strong>Saída:</strong> {am.origem||"—"}</div>
                <div style={{gridColumn:"1/3"}}>🏠 <strong>Chegada:</strong> {am.destino||"—"}</div>
              </div>
              {(function(){var _ek=am.origem&&am.destino?(am.origem.trim().toLowerCase()+"|"+am.destino.trim().toLowerCase()):null;var _eta=_ek?etaRotaCache[_ek]:null;if(_eta)return(<div style={{background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:8,padding:"8px 10px",marginTop:8}}><span style={{fontSize:12,fontWeight:800,color:"#4ade80"}}>{"🛣️ "+_eta.distKm+" km · ⏱️ ~"+_eta.durMin+" min"}</span>{_eta.previsao&&<span style={{fontSize:11,color:"#86efac",marginLeft:8}}>{"🕐 Previsão: "+_eta.previsao}</span>}</div>);return null;})()}
              <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                {am.van&&<span style={{background:"rgba(37,99,235,0.2)",border:"1px solid #3b82f6",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#93c5fd"}}>🚐 Van{am.inicio_van_em?" ✔":""}</span>}
                {am.caminhao&&<span style={{background:"rgba(124,58,237,0.2)",border:"1px solid #7c3aed",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#c4b5fd"}}>🚚 Caminhão{am.inicio_caminhao_em?" ✔":""}</span>}
                {am.medicao&&<span style={{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#fcd34d"}}>📏 {am.medicao} m³</span>}
              </div>
            </div>}
            {!am&&<div style={{padding:"20px 16px",textAlign:"center",color:"#64748b",fontSize:13}}>💤 Nenhuma mudança ativa</div>}
            {g.pendingMoves.length>0&&<div style={{borderTop:"1px solid #334155",padding:"8px 16px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:4}}>PRÓXIMAS ({g.pendingMoves.length})</div>
              {g.pendingMoves.slice(0,3).map(function(p){return <div key={p.id} style={{fontSize:11,color:"#cbd5e1",padding:"2px 0"}}>👤 {p.nome||"—"} · ⏰ {p.horario||"—"}</div>;})}
            </div>}
          </div>);
        })}
      </div>
    </div>);
  }
  return null;
})()}
{tab==="monitoramento"&&!isMotorista&&!painelTV&&(function(){
  var _hjStr=new Date().toISOString().slice(0,10);
  var _hjFmt=(function(){var p=_hjStr.split("-");return p[2]+"/"+p[1]+"/"+p[0];})();
  var _hora=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  // Step Tracker component
  var _fmtHora=function(ts){if(!ts)return null;var d=new Date(ts);if(isNaN(d.getTime()))return null;return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
  var StepTracker=function(props){
    var status=props.status||"confirmado";
    var ts=props.timestamps||{};
    var steps=[
      {key:"deslocamento",label:"Rumo à Origem",icon:"🚐",time:ts.saiu},
      {key:"origem",label:"Na Origem",icon:"📍",time:ts.chegou_origem},
      {key:"carregando",label:"Carregando",icon:"📦",time:ts.carregando},
      {key:"destino",label:"Rumo ao Destino",icon:"🚚",time:ts.saiu_destino},
      {key:"descarregando",label:"Descarregando",icon:"📦",time:ts.chegou_destino},
      {key:"chegou",label:"Concluído",icon:"🏁",time:ts.concluido}
    ];
    var _map={"Em Deslocamento":0,"Na Origem":1,"Carregando":2,"Realizando":2,"Deslocamento Destino":3,"Descarregando":4,"No Destino":4,"Concluido":5,"Concluído":5,"concluido":5,"concluida":5,"realizado":5,"realizada":5};
    var activeIdx=_map[status]!==undefined?_map[status]:-1;
    return(
      <div style={{display:"flex",alignItems:"center",gap:0,padding:"12px 0"}}>
        {steps.map(function(step,idx){
          var isDone=idx<activeIdx;
          var isActive=idx===activeIdx;
          var isFuture=idx>activeIdx;
          var _h=_fmtHora(step.time);
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
                {_h?<div style={{fontSize:11,fontWeight:900,color:isDone?"#15803d":isActive?"#1d4ed8":"#64748b",marginTop:2,textAlign:"center",letterSpacing:0.5}}>{_h}</div>
                :(isDone||isActive)?null
                :<div style={{fontSize:9,color:"#cbd5e1",marginTop:2,textAlign:"center"}}>⏳</div>}
              </div>
              {idx<steps.length-1&&(
                <div style={{flex:1,height:3,background:isDone?"#16a34a":"#e2e8f0",borderRadius:2,margin:"0 4px",marginBottom:32,alignSelf:"flex-start",marginTop:17}}></div>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  // Totais gerais do dia
  var _allToday=[...(agenda||[]).filter(function(a){return a.data===_hjStr&&!a.deleted_at&&a.status!=="cancelada";}),
    ...(mudancas||[]).filter(function(m){return m.data===_hjStr&&!m.deleted_at&&m.status!=="cancelada";})];
  var _statusAtivo2=function(s){return s==="Em Deslocamento"||s==="Realizando";};
  var _statusConcl2=function(s){return["Concluido","Concluído","concluido","concluida","realizado","realizada"].indexOf(s)>=0;};
  // PROTOCOLO: Pendente não conta como ativo mesmo com timestamps
  var _isAtivo2=function(x){return x.status!=="pendente"&&x.status!=="cancelada"&&(_statusAtivo2(x.status)||(x.inicio_van_em||x.van_saiu_em||x.inicio_caminhao_em||x.caminhao_saiu_em)&&!(x.termino_em||x.termino_van_em||x.termino_caminhao_em));};
  var _totalAtivas=_allToday.filter(function(x){return _isAtivo2(x);}).length;
  var _isConcl2=function(x){return !_isAtivo2(x)&&(_statusConcl2(x.status)||x.termino_em||x.termino_van_em||x.termino_caminhao_em);};
  var _totalConcl=_allToday.filter(function(x){return _isConcl2(x);}).length;
  var _totalPend=_allToday.filter(function(x){return !_isAtivo2(x)&&!_isConcl2(x);}).length;

  return(
    <div style={{padding:"0 0 80px"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f)",padding:"20px 16px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:1.5,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Torre de Controle</div>
            <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>📡 Monitoramento</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={function(){setPainelTV(true);}} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontWeight:800,fontSize:12,cursor:"pointer",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>📺 Painel TV</button>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>📅 {_hjFmt}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>⏰ {_hora}</div>
            </div>
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

      {/* ══ MAPA AO VIVO ══ */}
      {(function(){
        var _activeVehicles=[];
        var _hj2=new Date().toISOString().slice(0,10);
        var _allToday2=[...(agenda||[]).filter(function(a){return a.data===_hj2&&!a.deleted_at;}),
          ...(mudancas||[]).filter(function(m){return m.data===_hj2&&!m.deleted_at;})];
        var _seen2={};
        _allToday2.forEach(function(am){
          var key2=(am.nome||"").toLowerCase().trim()+"|"+am.data;
          if(_seen2[key2])return;_seen2[key2]=true;
          // PROTOCOLO: Cancelada ou Pendente não rastreia veículos
          if(am.status==="cancelada"||am.status==="pendente") return;
          // Van in transit?
          var _vanTransit=((am.inicio_van_em||am.van_saiu_em)&&!am.chegada_van_em);
          var _camTransit=((am.inicio_caminhao_em||am.caminhao_saiu_em)&&!am.chegada_caminhao_em);
          if(_vanTransit&&am.motorista_van_id){
            var _vm=listaUsuarios.find(function(u){return u.id===am.motorista_van_id;});
            _activeVehicles.push({agId:am.id,motId:am.motorista_van_id,nome:_vm?_vm.nome:"Motorista",veiculo:"van",clienteNome:am.nome||"",origem:am.origem||"",destino:am.destino||"",devId:_traccarDevId(am.motorista_van_id)});
          }
          if(_camTransit&&am.motorista_caminhao_id){
            var _cm=listaUsuarios.find(function(u){return u.id===am.motorista_caminhao_id;});
            _activeVehicles.push({agId:am.id,motId:am.motorista_caminhao_id,nome:_cm?_cm.nome:"Motorista",veiculo:"cam",clienteNome:am.nome||"",origem:am.origem||"",destino:am.destino||"",devId:_traccarDevId(am.motorista_caminhao_id)});
          }
        });
        var _hasActive2=_activeVehicles.length>0;
        // Merge live positions from liveMapVehicles state
        var _merged=_activeVehicles.map(function(v){
          var lv=liveMapVehicles.find(function(x){return x.motId===v.motId&&x.veiculo===v.veiculo;});
          if(lv) return Object.assign({},v,{lat:lv.lat,lng:lv.lng,speed:lv.speed,eta:lv.eta,route:lv.route,destCoords:lv.destCoords});
          return v;
        });
        var _withPos=_merged.filter(function(v){return v.lat&&v.lng;});
        return(
          <div style={{margin:"12px 12px 0",borderRadius:16,overflow:"hidden",border:_hasActive2?"2px solid #2563eb":"1.5px solid #e2e8f0",boxShadow:_hasActive2?"0 4px 20px rgba(37,99,235,0.15)":"none",background:"#fff"}}>
            <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e40af)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={function(){setLiveMapOpen(!liveMapOpen);}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {_hasActive2&&<div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",animation:"pulse 1.5s infinite"}}></div>}
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>🗺️ Mapa ao Vivo</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{_hasActive2?_activeVehicles.length+" veículo"+((_activeVehicles.length>1?"s":""))+" ativo"+((_activeVehicles.length>1?"s":""))+" • atualiza 10s":"Nenhum veículo em trânsito"}</div>
                </div>
              </div>
              <div style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:10,fontWeight:700}}>{liveMapOpen?"▲ Recolher":"▼ Expandir"}</div>
            </div>
            {liveMapOpen&&(
              <div>
                <div id="live-map-container" style={{width:"100%",height:isDesktop?320:220,background:"#e2e8f0",position:"relative"}} ref={function(el){
                  if(!el||!window.mapboxgl||el._liveMapReady) return;
                  el._liveMapReady=true;
                  window.mapboxgl.accessToken=MAPBOX_TOKEN;
                  var _center=_withPos.length>0?[_withPos[0].lng,_withPos[0].lat]:[-34.87,-8.05];// Recife default
                  var map=new window.mapboxgl.Map({container:el,style:"mapbox://styles/mapbox/streets-v12",center:_center,zoom:12});
                  map.addControl(new window.mapboxgl.NavigationControl(),"top-right");
                  el._liveMap=map;
                  el._liveMarkers={};
                  el._liveRoutes={};
                  el._liveDestMarkers={};
                  // Render initial markers
                  _withPos.forEach(function(v){
                    var mEl=document.createElement("div");
                    mEl.style.cssText="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.3);cursor:pointer;background:"+(v.veiculo==="van"?"#2563eb":"#7c3aed")+";";
                    mEl.innerHTML=v.veiculo==="van"?"🚐":"🚚";
                    var popup=new window.mapboxgl.Popup({offset:25,closeButton:false}).setHTML(
                      "<div style='font-family:sans-serif;padding:4px 2px;'><div style='font-weight:800;font-size:13px;'>"+(v.veiculo==="van"?"🚐":"🚚")+" "+v.nome+"</div>"+
                      "<div style='font-size:11px;color:#475569;margin-top:3px;'>👤 "+v.clienteNome+"</div>"+
                      "<div style='font-size:11px;color:#475569;'>📍 "+v.origem+" → "+v.destino+"</div>"+
                      (v.eta?"<div style='font-size:12px;font-weight:700;color:#059669;margin-top:4px;'>⏱️ ETA: "+v.eta.etaStr+" ("+v.eta.durMin+"min)</div>":"")+
                      (v.speed?"<div style='font-size:10px;color:#94a3b8;'>🏎️ "+Math.round(v.speed)+" km/h</div>":"")+
                      "</div>"
                    );
                    var marker=new window.mapboxgl.Marker({element:mEl}).setLngLat([v.lng,v.lat]).setPopup(popup).addTo(map);
                    el._liveMarkers[v.motId+"_"+v.veiculo]=marker;
                  });
                  // Fit bounds if multiple
                  if(_withPos.length>1){
                    var bounds=new window.mapboxgl.LngLatBounds();
                    _withPos.forEach(function(v){bounds.extend([v.lng,v.lat]);if(v.destCoords)bounds.extend(v.destCoords);});
                    map.fitBounds(bounds,{padding:50,duration:1000});
                  }
                  // Draw routes
                  map.on("load",function(){
                    _withPos.forEach(function(v){
                      if(v.route){
                        var srcId="liveRoute_"+v.motId+"_"+v.veiculo;
                        map.addSource(srcId,{type:"geojson",data:{type:"Feature",geometry:v.route}});
                        map.addLayer({id:srcId,type:"line",source:srcId,layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":v.veiculo==="van"?"#2563eb":"#7c3aed","line-width":4,"line-opacity":0.7,"line-dasharray":[2,1]}});
                        el._liveRoutes[srcId]=true;
                      }
                      if(v.destCoords){
                        var dEl=document.createElement("div");dEl.innerHTML="📍";dEl.style.fontSize="28px";
                        el._liveDestMarkers[v.motId+"_"+v.veiculo]=new window.mapboxgl.Marker({element:dEl}).setLngLat(v.destCoords).addTo(map);
                      }
                    });
                  });
                }}></div>
                {/* Legend */}
                <div style={{display:"flex",gap:10,padding:"8px 14px",background:"#f8fafc",borderTop:"1px solid #e2e8f0",alignItems:"center",justifyContent:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#475569"}}><div style={{width:10,height:10,borderRadius:"50%",background:"#2563eb"}}></div>Van</div>
                  <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#475569"}}><div style={{width:10,height:10,borderRadius:"50%",background:"#7c3aed"}}></div>Caminhão</div>
                  <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#475569"}}><div style={{width:10,height:10,borderRadius:"50%",background:"#22c55e"}}></div>Em trânsito</div>
                  <div style={{fontSize:14}}>📍 <span style={{fontSize:10,fontWeight:700,color:"#475569"}}>Destino</span></div>
                </div>
                {/* Vehicle chips */}
                {_merged.length>0&&(
                  <div style={{display:"flex",gap:6,padding:"8px 14px 10px",overflowX:"auto"}}>
                    {_merged.map(function(v,idx){
                      var _isVan2=v.veiculo==="van";
                      return(
                        <div key={idx} onClick={function(){
                          // Click chip → center map on vehicle or open GPS modal
                          var el=document.getElementById("live-map-container");
                          if(el&&el._liveMap&&v.lat&&v.lng){
                            el._liveMap.easeTo({center:[v.lng,v.lat],zoom:14,duration:800});
                            var mk=el._liveMarkers[v.motId+"_"+v.veiculo];
                            if(mk&&!mk.getPopup().isOpen()) mk.togglePopup();
                          }else{
                            // No position yet — open individual GPS modal
                            var _ag2=(agenda||[]).find(function(a){return a.id===v.agId;});
                            if(_ag2){
                              var _a2=Object.assign({},_ag2,{_trackMotoristaId:v.motId,_trackVeiculo:v.veiculo});
                              setGpsMapAgenda(_a2);setShowGpsMap(true);setGpsEta(null);
                              gpsLoadPositions(v.agId,v.motId).then(function(pos){if(pos&&_ag2.destino){gpsCalcEta(pos.lat,pos.lng,_ag2.destino).then(function(eta){setGpsEta(eta);});}setGpsPositions(pos?[pos]:[]);});
                            }
                          }
                        }} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:10,fontSize:11,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",flexShrink:0,
                          background:_isVan2?"#dbeafe":"#ede9fe",border:"1.5px solid "+(_isVan2?"#93c5fd":"#c4b5fd"),color:_isVan2?"#1d4ed8":"#7c3aed"}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:v.lat?"#22c55e":"#94a3b8",animation:v.lat?"pulse 1.5s infinite":"none"}}></div>
                          {_isVan2?"🚐":"🚚"} {v.nome} — {v.origem||"?"} → {v.destino||"?"}
                          {v.eta&&<span style={{fontSize:9,color:_isVan2?"#60a5fa":"#a78bfa"}}>{v.eta.durMin}min</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!_hasActive2&&(
                  <div style={{padding:"20px 16px",textAlign:"center",color:"#94a3b8"}}>
                    <div style={{fontSize:28,marginBottom:4}}>🗺️</div>
                    <div style={{fontSize:12,fontWeight:600}}>Nenhum veículo em trânsito agora</div>
                    <div style={{fontSize:11,color:"#cbd5e1",marginTop:2}}>Os veículos aparecerão aqui quando estiverem em deslocamento</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
                        {!isSocial&&am.medicao>0&&<span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"2px 8px"}}>📐 {am.medicao} m³</span>}
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
                        <div style={{fontSize:12,color:"#1e293b",fontWeight:700,marginBottom:4}}>{am.origem||"?"}</div>
                        {/* ETA Card — distância e previsão */}
                        {(function(){
                          var _ek=am.origem&&am.destino?(am.origem.trim().toLowerCase()+"|"+am.destino.trim().toLowerCase()):null;
                          var _eta=_ek?etaRotaCache[_ek]:null;
                          if(_ek&&!_eta&&!etaRotaCache["_loading_"+_ek]){
                            etaRotaCache["_loading_"+_ek]=true;
                            calcRotaGoogle(am.origem,am.destino,am.horario);
                          }
                          if(_eta) return(
                            <div style={{background:"#ecfdf5",border:"1.5px solid #86efac",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                              <div style={{fontSize:12,fontWeight:800,color:"#15803d"}}>{"🛣️ "+_eta.distKm+" km  ·  ⏱️ ~"+_eta.durMin+" min"}</div>
                              {_eta.previsao&&<div style={{fontSize:11,fontWeight:700,color:"#166534",marginTop:2}}>{"🕐 Previsão de chegada: "+_eta.previsao}</div>}
                            </div>
                          );
                          if(_ek) return(<div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"6px 10px",marginBottom:6}}><div style={{fontSize:10,color:"#0284c7",fontWeight:600}}>⏳ Calculando rota...</div></div>);
                          return null;
                        })()}
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
                      // Build timestamps object for StepTracker
                      var _tsObj={
                        saiu:am.inicio_van_em||am.van_saiu_em||am.inicio_caminhao_em||am.caminhao_saiu_em||am.inicio_mudanca_em||null,
                        chegou_origem:am.chegou_origem_van_em||am.chegou_origem_cam_em||null,
                        carregando:am.chegou_origem_van_em||am.chegou_origem_cam_em||null,
                        saiu_destino:am.saiu_destino_van_em||am.saiu_destino_cam_em||null,
                        chegou_destino:am.chegada_van_em||am.chegada_caminhao_em||null,
                        concluido:am.termino_em||am.termino_van_em||am.termino_caminhao_em||null
                      };
                      return(
                        <div style={{background:"#f8fafc",borderRadius:12,padding:"8px 12px",marginTop:4,border:"1px solid #e2e8f0"}}>
                          <StepTracker status={_st4} timestamps={_tsObj}/>
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
            <div style={{padding:'8px 12px 0'}}><div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>{setFiltroMes('semana');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes==='semana'&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes==='semana'&&!filtroDataIni?'#fff':'#475569'}}>Semana</button><button onClick={()=>{setFiltroMes('mes_atual');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes==='mes_atual'&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes==='mes_atual'&&!filtroDataIni?'#fff':'#475569'}}>Mês Atual</button><button onClick={()=>{setFiltroMes('');setFiltroDataIni('');setFiltroDataFim('');}} style={{padding:'6px 14px',borderRadius:16,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:filtroMes===''&&!filtroDataIni?'#1e40af':'#e2e8f0',color:filtroMes===''&&!filtroDataIni?'#fff':'#475569'}}>Todos</button></div><div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}><input type='date' value={filtroDataIni} onChange={e=>{setFiltroDataIni(e.target.value);setFiltroMes('datas');}} style={{flex:1,padding:'5px 8px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,color:'#334155'}} /><span style={{fontSize:11,color:'#94a3b8',whiteSpace:'nowrap'}}>até</span><input type='date' value={filtroDataFim} onChange={e=>{setFiltroDataFim(e.target.value);setFiltroMes('datas');}} style={{flex:1,padding:'5px 8px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,color:'#334155'}} /></div>{isAdmin&&<div style={{display:'flex',gap:6,alignItems:'center',marginBottom:6,marginTop:6}}><select value={filtroSup} onChange={function(e){setFiltroSup(e.target.value);}} style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1.5px solid '+(filtroSup?'#b45309':'#e2e8f0'),background:filtroSup?'#fef3c7':'#f8fafc',fontSize:12,fontWeight:600,color:filtroSup?'#92400e':'#64748b',cursor:'pointer'}}><option value="">👷 Supervisor: Todos</option>{listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;}).map(function(s){return <option key={s.id} value={s.id}>{s.nome}</option>;})}</select><button onClick={function(){var _fList=filtered;var _supNm=filtroSup?(listaUsuarios.find(function(u){return u.id===filtroSup;})||{}).nome||"":"Todos";var NL="%0A";var t="📊 *REGISTROS"+(filtroSup?" - "+_supNm.toUpperCase():"")+("*"+NL+"🗓️ "+(_fList.length)+" mudança"+(_fList.length!==1?"s":"")+NL+NL);var _byDate={};_fList.forEach(function(m){var d=m.data||"sem-data";if(!_byDate[d])_byDate[d]=[];_byDate[d].push(m);});Object.keys(_byDate).sort(function(a,b){return b.localeCompare(a);}).forEach(function(d){var p=d.split("-");t+="📅 "+(p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d)+NL;_byDate[d].forEach(function(m){t+="  👤 "+(m.nome||"—")+" · ⏰ "+(m.horario||"—")+"h · 📐 "+(m.medicao||"0")+" m³"+NL;});t+=NL;});t+="━━━━━━━━━━━━"+NL+"Total: "+_fList.length+" mudança"+(_fList.length!==1?"s":"")+NL+"— TELEMIM Mudanças";window.open("https://wa.me/?text="+encodeURIComponent(t),"_blank");}} style={{padding:'7px 10px',borderRadius:8,border:'none',background:'#25d366',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer'}}>📲</button><button onClick={function(){var _fList=filtered;var _supNm=filtroSup?(listaUsuarios.find(function(u){return u.id===filtroSup;})||{}).nome||"":"Todos";var NL="\n";var t="📊 REGISTROS"+(filtroSup?" - "+_supNm.toUpperCase():"")+NL+"Total: "+_fList.length+" mudança"+(_fList.length!==1?"s":"")+NL+NL;var _byDate={};_fList.forEach(function(m){var d=m.data||"sem-data";if(!_byDate[d])_byDate[d]=[];_byDate[d].push(m);});Object.keys(_byDate).sort(function(a,b){return b.localeCompare(a);}).forEach(function(d){var p=d.split("-");t+="📅 "+(p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d)+NL;_byDate[d].forEach(function(m){t+="  👤 "+(m.nome||"—")+" · ⏰ "+(m.horario||"—")+"h · 📐 "+(m.medicao||"0")+" m³"+NL;});t+=NL;});t+="━━━━━━━━━━━━━━━━━━"+NL+"Total: "+_fList.length+" mudança"+(_fList.length!==1?"s":"")+NL+NL+"— TELEMIM Mudanças";var _w=window.open("","_blank");_w.document.write("<html><head><title>Registros"+(filtroSup?" - "+_supNm:"")+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");_w.document.close();}} style={{padding:'7px 10px',borderRadius:8,border:'none',background:'#1e40af',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer'}}>📄</button><button onClick={function(){var _fList=filtered;if(_fList.length===0){alert("Nenhuma mudança encontrada no período selecionado.");return;}var _supNm=filtroSup?(listaUsuarios.find(function(u){return u.id===filtroSup;})||{}).nome||"":"";var _periodoTxt="";if(filtroDataIni&&filtroDataFim){var _pi=filtroDataIni.split("-");var _pf=filtroDataFim.split("-");_periodoTxt=_pi[2]+"/"+_pi[1]+"/"+_pi[0]+" a "+_pf[2]+"/"+_pf[1]+"/"+_pf[0];}else if(filtroDataIni){var _pi2=filtroDataIni.split("-");_periodoTxt="A partir de "+_pi2[2]+"/"+_pi2[1]+"/"+_pi2[0];}else if(filtroDataFim){var _pf2=filtroDataFim.split("-");_periodoTxt="Até "+_pf2[2]+"/"+_pf2[1]+"/"+_pf2[0];}else if(filtroMes==="semana"){_periodoTxt="Semana Atual";}else if(filtroMes==="mes_atual"){_periodoTxt="Mês Atual";}else{_periodoTxt="Todos os Registros";}var _diasSem=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];var _geradoEm=new Date();var _geradoTxt=String(_geradoEm.getDate()).padStart(2,"0")+"/"+String(_geradoEm.getMonth()+1).padStart(2,"0")+"/"+_geradoEm.getFullYear()+" às "+String(_geradoEm.getHours()).padStart(2,"0")+":"+String(_geradoEm.getMinutes()).padStart(2,"0");var _pages="";_fList.forEach(function(m,idx){var _dp=m.data?(function(){var p=m.data.split("-");return p[2]+"/"+p[1]+"/"+p[0];})():"—";var _diaW="";if(m.data){var _dtObj=new Date(m.data+"T12:00:00");_diaW=_diasSem[_dtObj.getDay()]||"";}var _supM=m.supervisor_id?listaUsuarios.find(function(u){return u.id===m.supervisor_id;}):null;var _mvM=m.motorista_van_id?listaUsuarios.find(function(u){return u.id===m.motorista_van_id;}):null;var _mcM=m.motorista_caminhao_id?listaUsuarios.find(function(u){return u.id===m.motorista_caminhao_id;}):null;var _criadoTxt=m.criado_em?new Date(m.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—";var _row=function(icon,label,val,sz){var _fs=sz||11;return '<tr><td style="padding:5px 10px;font-size:11px;color:#64748b;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f1f5f9;width:160px;">'+icon+" "+label+'</td><td style="padding:5px 10px;font-size:'+Math.max(_fs,11)+'px;font-weight:'+(_fs>13?800:600)+';color:#1e293b;border-bottom:1px solid #f1f5f9;">'+(val||"—")+"</td></tr>";};_pages+='<div style="page-break-after:'+(idx<_fList.length-1?"always":"auto")+';padding:10px 25px;max-width:800px;margin:0 auto;">';_pages+='<div style="text-align:center;border-bottom:2px solid #1e40af;padding-bottom:8px;margin-bottom:12px;">';_pages+='<img src="'+_LOGO_B64+'" style="height:103px;margin-bottom:6px;" />';_pages+='<div style="font-size:14px;font-weight:700;color:#000;margin-top:2px;">Cliente: PROMORAR - Relatório de Mudanças Realizadas</div>';_pages+='<div style="font-size:11px;color:#000;margin-top:2px;">Período: '+_periodoTxt+(_supNm?" · Supervisor: "+_supNm:"")+"</div>";_pages+="</div>";_pages+='<div style="background:linear-gradient(135deg,#1e3a8a,#1e40af);color:#fff;text-align:center;padding:8px 14px;border-radius:10px;margin-bottom:12px;box-shadow:0 4px 12px rgba(30,64,175,0.3);">';_pages+='<div style="font-size:16px;font-weight:900;">📅 '+_dp+"</div>";if(_diaW)_pages+='<div style="font-size:11px;opacity:0.9;margin-top:1px;">'+_diaW+"</div>";_pages+="</div>";_pages+='<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">';_pages+=_row("👤","Nome",m.nome||"—",15);_pages+=_row("🏷️","Selo",m.selo||"—");_pages+=_row("📅","Data",_dp);_pages+=_row("📦","Origem",m.origem||"—");_pages+=_row("🏠","Destino",m.destino||"—");_pages+=_row("📐","Medição",m.medicao?m.medicao+" m³":"—");_pages+=_row("🚐","Van",m.van?"Sim":"Não");_pages+=_row("🚚","Caminhão",m.caminhao?"Sim":"Não");_pages+=_row("📌","Status",m.status||"—");_pages+=_row("👩‍⚕️","Assistente Social",m.assist_social||"—");_pages+=_row("👷","Supervisor",_supM?_supM.nome:"—");_pages+=_row("🚐","Motorista Van",_mvM?_mvM.nome:"—");_pages+=_row("🚚","Motorista Caminhão",_mcM?_mcM.nome+(_mcM.placa_veiculo?" · "+_mcM.placa_veiculo:""):"—");_pages+=_row("🕐","Criado em",_criadoTxt);_pages+="</table>";_pages+='<div style="margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;">';_pages+='<div style="font-size:10px;color:#94a3b8;margin-bottom:28px;">Gerado em: '+_geradoTxt+"</div>";_pages+='<div style="display:flex;justify-content:space-between;gap:40px;">';_pages+='<div style="flex:1;text-align:center;"><div style="border-top:2px solid #1e293b;padding-top:8px;font-size:13px;font-weight:700;color:#1e293b;">Telemim (George Jr)</div></div>';_pages+='<div style="flex:1;text-align:center;"><div style="border-top:2px solid #1e293b;padding-top:8px;font-size:13px;font-weight:700;color:#1e293b;">PROMORAR</div></div>';_pages+="</div></div>";_pages+='<div style="text-align:center;margin-top:30px;padding-top:10px;border-top:1px solid #e2e8f0;">';_pages+='<div style="font-size:11px;font-weight:700;color:#1e293b;">G. DE SOUZA ADMINISTRAÇÃO DE OBRAS LTDA.</div>';_pages+='<div style="font-size:9px;color:#64748b;margin-top:2px;">Rua Floriano Peixoto, 85, Sala: 423 - Santo Antônio - Recife - CEP: 50.020-065</div>';_pages+='<div style="font-size:9px;color:#64748b;margin-top:1px;">Fone: (81) 99244.0900 - telemimmudancas@gmail.com - CNPJ: 04.130.817/0001-35</div>';_pages+="</div>";_pages+='<div style="text-align:right;margin-top:8px;font-size:11px;color:#94a3b8;">Mudança '+(idx+1)+" de "+_fList.length+"</div>";_pages+="</div>";});var _w=window.open("","_blank");_w.document.write('<html><head><title>Relatório Detalhado'+(filtroSup?" - "+_supNm:"")+'</title><style>@media print{button.no-print{display:none!important;}}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;background:#f8fafc;color:#1e293b;}@page{margin:10mm;}</style></head><body><div style="text-align:center;padding:20px;"><button class="no-print" onclick="window.print()" style="padding:14px 32px;background:#1e40af;color:#fff;border:none;border-radius:10px;font-size:15px;cursor:pointer;font-weight:800;box-shadow:0 4px 12px rgba(30,64,175,0.3);">🖨️ Imprimir / Salvar PDF</button></div>'+_pages+"</body></html>");_w.document.close();}} style={{padding:'7px 10px',borderRadius:8,border:'none',background:'#7c3aed',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer'}}>📊</button></div>}</div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar nome, selo ou comunidade..."
              style={{width:"100%",background:"#fff",border:`1.5px solid ${COLORS.cardBorder}`,borderRadius:12,color:COLORS.text,padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:12,boxShadow:COLORS.shadow}}/>
            <div style={isDesktop?{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}:{}}>
            {filtered.map(m=>(
              <Card key={m.id} style={{marginBottom:isDesktop?0:10,padding:0,overflow:"hidden"}}>
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
                </div>
                {/* ── Validação 3 vias ── */}
                {m.requires_validation&&<div style={{display:"flex",gap:3,padding:"6px 16px",borderTop:"1px solid #f1f5f9",flexWrap:"wrap"}}>{m.social_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Social</span>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Social</span>}{m.promorar_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Promorar</span>:usuario&&usuario.perfil==="promorar"?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"promorar");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Promorar</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Promorar</span>}{m.adm_approved?<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#dcfce7",color:"#15803d"}}>✅ Adm</span>:usuario&&(usuario.perfil==="admin"||usuario.perfil==="telemim")?<button onClick={function(e){e.stopPropagation();handleValidar3vias(m.id,"adm");}} style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,border:"none",background:"#facc15",color:"#713f12",cursor:"pointer"}}>👆 Validar Adm</button>:<span style={{padding:"2px 8px",borderRadius:999,fontSize:10,fontWeight:700,background:"#f1f5f9",color:"#94a3b8",border:"1px solid #e2e8f0"}}>⏳ Adm</span>}</div>}
                {/* ── Barra de ações ── */}
                <div style={{display:"flex",gap:6,padding:"8px 16px 12px",borderTop:"1px solid #e2e8f0",flexWrap:"wrap",alignItems:"center"}}>
                  {m.contato&&<button onClick={()=>{var tel=(m.contato||"").replace(/\D/g,"");var txt="\uD83D\uDE9A *TELEMIM — Sua Mudan\u00E7a*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nOl\u00E1 *"+m.nome+"*! \uD83D\uDC4B\nConfirmamos sua mudan\u00E7a:\n\uD83D\uDCC5 *Data:* "+fmtDate(m.data)+"\n\uD83D\uDCCD *Sa\u00EDda:* "+(m.comunidade||m.origem||"-")+"\n\uD83D\uDCCD *Destino:* "+(m.destino||"-")+"\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nEm caso de d\u00FAvidas, entre em contacto. \uD83D\uDE0A\n_TELEMIM_";window.open("https://wa.me/55"+tel+"?text="+encodeURIComponent(txt),"_blank");}} style={{background:"#25d366",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}}>📱</button>}
                  <button onClick={()=>setViewMud(m)} style={{background:"#f0f9ff",border:"1.5px solid #0ea5e9",color:"#0ea5e9",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}}>👁️</button>
                  <button onClick={()=>compartilharMudanca(m)} style={{...btnGreen,borderRadius:8,padding:"6px 10px",fontSize:13}}>📲</button>
                  <button onClick={function(e){gerarPDFDetalheRegistro(m,e.currentTarget);}} style={{background:"#f0fdf4",border:"1.5px solid #16a34a",color:"#16a34a",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}} title="PDF Detalhado">📑</button>
                  {(isAdmin||isPromorar)&&<button onClick={()=>setEditMud((function(){var _cd=(custosDiarios||[]).find(function(x){return x.data===m.data;});return {...m,_qtdAj:_cd?parseInt(_cd.ajudantes)||1:1};})())} style={{...btnBlue,borderRadius:8,padding:"6px 10px",fontSize:13}}>✏️</button>}
                  {(usuario&&usuario.perfil==="admin")&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:m.id,nome:m.nome,tipo:"mud",data:m.data,status:m.status,medicao:m.medicao});setConfirmDeleteMotivo("");}} style={{...btnRed,borderRadius:8,padding:"6px 10px",fontSize:13}}>✕</button>}
                  {(isAdmin||isSupervisor)&&<button onClick={function(){var _eq=equipeDiaList.find(function(e){return e.data===m.data;});setViewEquipeAg({nome:m.nome,data:m.data,ajudantes:_eq&&Array.isArray(_eq.ajudantes)?_eq.ajudantes:[]});}} style={{background:"#fef9c3",border:"1.5px solid #fde047",color:"#92400e",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,fontWeight:700}} title="Ver equipe do dia">👷</button>}
                </div>
              </Card>
            ))}
            </div>
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
                {!isSocial&&<button onClick={_openRelModal} style={{background:COLORS.accent,border:"none",color:"#fff",borderRadius:10,padding:"7px 12px",fontWeight:800,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📊 Gerar Relatório</button>}
                <button onClick={()=>setTab("novaAgenda")} style={{background:COLORS.purple,color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontWeight:800,fontSize:12,cursor:"pointer",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>+ Agendar</button>
              </div>
            </div>
            {proximas.length>0&&(
              <div style={isDesktop?{marginBottom:16,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}:{marginBottom:16}}>
                {proximas.map(a=>(
                  <div id={"move-card-"+a.id}><Card key={a.id} style={{marginBottom:isDesktop?0:9,padding:"14px 16px",borderLeft:"4px solid "+(statusColor[a.status]||"#3b82f6"),background:statusBg[a.status]||"#fff"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:900,fontSize:24,color:COLORS.text,marginBottom:8}}>👤 {a.nome}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                          <TagSelo v={a.selo}/><TagData v={a.data}/><TagHora v={a.horario}/><TagCom v={a.comunidade}/>{a.status==="pendente_social"&&<span style={{background:"#fef3c7",border:"1.5px solid #fcd34d",borderRadius:8,padding:"3px 8px",fontSize:10,fontWeight:800,color:"#92400e"}}>⏳ Aguardando Promorar</span>}
                        </div>
                        <div style={{fontSize:12,lineHeight:1.9,background:"#f8fafc",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                          <div>📦 <strong>Saída:</strong> {a.origem?<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.origem)}`} target="_blank" style={{color:COLORS.blue,textDecoration:"none",fontWeight:600}}>{a.origem} 🗺️</a>:<span style={{color:COLORS.muted}}>—</span>}</div>
                          <div>🏠 <strong>Chegada:</strong> {a.destino?<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.destino)}`} target="_blank" style={{color:COLORS.blue,textDecoration:"none",fontWeight:600}}>{a.destino} 🗺️</a>:<span style={{color:COLORS.muted}}>—</span>}</div>
                          {a.contato&&<div>📞 <strong>Contato:</strong> <a href={`tel:${a.contato.replace(/\D/g,"")}`} style={{color:COLORS.green,textDecoration:"none",fontWeight:700}}>{a.contato} 📲</a></div>}
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>🚗 Veículos</div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={isSocial?undefined:()=>toggleAgField(a.id,"van")} style={{padding:"7px 14px",borderRadius:10,border:`2px solid ${a.van?COLORS.blue:"#e2e8f0"}`,background:a.van?"#eff6ff":"#f8fafc",color:a.van?COLORS.blue:COLORS.muted,fontWeight:800,fontSize:13,cursor:isSocial?"default":"pointer",opacity:isSocial?0.7:1,transition:"all 0.2s"}}>🚐 Van {a.van?"✓":"✗"}</button>
                            <button onClick={isSocial?undefined:()=>toggleAgField(a.id,"caminhao")} style={{padding:"7px 14px",borderRadius:10,border:`2px solid ${a.caminhao?COLORS.accent:"#e2e8f0"}`,background:a.caminhao?"#fff7ed":"#f8fafc",color:a.caminhao?COLORS.accent:COLORS.muted,fontWeight:800,fontSize:13,cursor:isSocial?"default":"pointer",opacity:isSocial?0.7:1,transition:"all 0.2s"}}>🚚 Caminhão {a.caminhao?"✓":"✗"}</button>
                          </div>
                        </div>
                        {!isAdmin&&(a.motorista_van_id||a.motorista_caminhao_id)&&(function(){var _vn=null,_cn=null;if(a.motorista_van_id){var _f=listaUsuarios.find(function(u){return u.id===a.motorista_van_id;});if(_f)_vn=_f;}if(a.motorista_caminhao_id){var _f2=listaUsuarios.find(function(u){return u.id===a.motorista_caminhao_id;});if(_f2)_cn=_f2;}if(!_vn&&!_cn)return null;return(<div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:6,fontSize:11}}>{_vn&&<span><b style={{color:"#2563eb"}}>🚐 {_vn.nome}</b>{_vn.placa_veiculo?" · "+_vn.placa_veiculo:""}</span>}{_cn&&<span><b style={{color:"#7c3aed"}}>🚚 {_cn.nome}</b>{_cn.placa_veiculo?" · "+_cn.placa_veiculo:""}</span>}</div>);})()}
                        {(isAdmin||isSupervisor)&&(function(){var _motsV=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="VAN";});var _motsC=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="CAMINHAO";});var _selStyle={flex:1,padding:"8px 10px",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"};var _okStyle={padding:"8px 12px",borderRadius:9,border:"none",fontWeight:800,fontSize:12,cursor:"pointer",color:"#fff",whiteSpace:"nowrap"};var _kV=a.id+"_VAN";var _kC=a.id+"_CAM";var _valV=despPend[_kV]!==undefined?despPend[_kV]:(a.motorista_van_id||"");var _valC=despPend[_kC]!==undefined?despPend[_kC]:(a.motorista_caminhao_id||"");var _changedV=despPend[_kV]!==undefined&&despPend[_kV]!==(a.motorista_van_id||"");var _changedC=despPend[_kC]!==undefined&&despPend[_kC]!==(a.motorista_caminhao_id||"");return(<div style={{marginBottom:10}}><div style={{color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>🚚 Despachar Motoristas</div>{a.van&&_motsV.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><select value={_valV} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kV]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valV?"#2563eb":"#e2e8f0"),background:_valV?"#eff6ff":"#f8fafc",color:_valV?"#2563eb":"#64748b"})}><option value="">🚐 Sem motorista Van</option>{_motsV.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}{mt.placa_veiculo?" · "+mt.placa_veiculo:""}</option>);})}</select><button onClick={function(){if(_changedV){handleDespachar(a.id,_valV||null,"VAN");setDespPend(function(p){var n=Object.assign({},p);delete n[_kV];return n;});}else{reenviarMensagensMotorista(a.id,_valV,"VAN");}}} disabled={!_valV} style={Object.assign({},_okStyle,{background:_valV?(_changedV?"#2563eb":"#f97316"):"#94a3b8",cursor:_valV?"pointer":"not-allowed"})}>{_valV?(_changedV?"✓ OK":"📲"):"✓"}</button></div>}{a.caminhao&&_motsC.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><select value={_valC} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kC]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valC?"#7c3aed":"#e2e8f0"),background:_valC?"#f5f3ff":"#f8fafc",color:_valC?"#7c3aed":"#64748b"})}><option value="">🚚 Sem motorista Caminhão</option>{_motsC.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}{mt.placa_veiculo?" · "+mt.placa_veiculo:""}</option>);})}</select><button onClick={function(){if(_changedC){handleDespachar(a.id,_valC||null,"CAMINHAO");setDespPend(function(p){var n=Object.assign({},p);delete n[_kC];return n;});}else{reenviarMensagensMotorista(a.id,_valC,"CAMINHAO");}}} disabled={!_valC} style={Object.assign({},_okStyle,{background:_valC?(_changedC?"#7c3aed":"#f97316"):"#94a3b8",cursor:_valC?"pointer":"not-allowed"})}>{_valC?(_changedC?"✓ OK":"📲"):"✓"}</button></div>}{(function(){var _sups=listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;});if(_sups.length===0)return null;var _kS=a.id+"_SUP";var _valS=despPend[_kS]!==undefined?despPend[_kS]:(a.supervisor_id||"");var _changedS=despPend[_kS]!==undefined&&despPend[_kS]!==(a.supervisor_id||"");return(<div style={{display:"flex",gap:6,alignItems:"center"}}><select value={_valS} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kS]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valS?"#b45309":"#e2e8f0"),background:_valS?"#fef3c7":"#f8fafc",color:_valS?"#92400e":"#64748b"})}><option value="">👷 Sem supervisor</option>{_sups.map(function(s){return(<option key={s.id} value={s.id}>{s.nome}</option>);})}</select><button onClick={function(){if(_changedS){handleDespacharSup(a.id,_valS||null);setDespPend(function(p){var n=Object.assign({},p);delete n[_kS];return n;});}else{reenviarMensagensSupervisor(a.id,_valS);}}} disabled={!_valS} style={Object.assign({},_okStyle,{background:_valS?(_changedS?"#b45309":"#f97316"):"#94a3b8",cursor:_valS?"pointer":"not-allowed"})}>{_valS?(_changedS?"✓ OK":"📲"):"✓"}</button></div>);})()}</div>);})()}
                        {!isSocial&&<div style={{display:"grid",gridTemplateColumns:(usuario&&(usuario.perfil==="admin"||usuario.perfil==="supervisor"))?"1fr 1fr":"1fr",gap:8,marginBottom:10}}>{!isSocial&&<div>
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
                            {!isSocial&&<button onClick={function(){pedirFinalizacao(a);}} disabled={_agendaRemovidaIds.has(a.id)} style={{background:_agendaRemovidaIds.has(a.id)?"#059669":"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:_agendaRemovidaIds.has(a.id)?"default":"pointer"}}>{_agendaRemovidaIds.has(a.id)?"✅ Concluído":"✅ Finalizar"}</button>}
                            <button onClick={function(){setReagendarModal(a);setReagendarData("");setReagendarMotivo("");}} style={{background:"#eff6ff",border:"1.5px solid #93c5fd",color:"#2563eb",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📅 Reagendar</button>
                            {(isSupervisor||isPromorar)&&!a.cancelamento_solicitado&&<button onClick={function(){setCancelModal(a);setCancelMotivo("");}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Cancelar</button>}
                            {isAdmin&&!a.cancelamento_solicitado&&<button onClick={function(){if(confirm("Cancelar mudança de "+a.nome+"?\nEsta ação não pode ser desfeita.")){handleCancelarDireto(a.id);}}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Cancelar</button>}
                          </div>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {!isSocial&&a.medicao&&<Badge color={COLORS.green}>📐 {a.medicao} m³</Badge>}
                            {a.ajudantes&&parseInt(a.ajudantes)>0&&<Badge color="#b45309">👷 {a.ajudantes} {parseInt(a.ajudantes)===1?"ajudante":"ajudantes"}</Badge>}
                            <button onClick={()=>compartilharWhatsApp(a)} style={{...btnGreen,fontSize:14,padding:"6px 10px"}}>📲</button>
                            {!isSocial&&<button onClick={e=>gerarPDFAgendamento(a,e.currentTarget)} style={{...btnRed,background:"#fff1f0",fontSize:14,padding:"6px 10px"}}>📄</button>}
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:9}}>
                        {!isSocial&&<button onClick={()=>converterEmMudanca(a)} style={{background:"#f0fdf4",border:"none",color:COLORS.green,borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Converter em mudança">✅</button>}
                        {!isSocial&&<button onClick={function(){var _emOp=a.inicio_van_em||a.van_saiu_em||a.inicio_caminhao_em||a.caminhao_saiu_em||a.inicio_mudanca_em;if(_emOp&&!isAdmin){setPendModal(a);setPendMotivo("");}else if(isAdmin&&_emOp){setPendModal(a);setPendMotivo("");}else if(isAdmin){handleMoverPendente(a.id,"");}else{setPendModal(a);setPendMotivo("");}}} style={{background:a.pendencia_solicitada?"#fef3c7":"#fffbeb",border:a.pendencia_solicitada?"1.5px solid #f59e0b":"none",color:"#b45309",borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title={a.pendencia_solicitada?"Pendência solicitada":"Mover para Pendente"}>{a.pendencia_solicitada?"🔔":"⏳"}</button>}
                        <button onClick={()=>setEditAg({...a})} style={btnBlue}>✏️</button>
                        {(usuario&&usuario.perfil==="admin")&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:a.id,nome:a.nome,tipo:"ag",data:a.data,status:a.status,medicao:a.medicao});setConfirmDeleteMotivo("");}} style={btnRed}>✕</button>}
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
                        {usuario&&(usuario.perfil==="social"||usuario.perfil==="coordenador")&&!a.approved_by_social&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#10b981",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}
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
            {passadas.length>0&&(
              <div style={{marginTop:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{fontSize:14,fontWeight:900,color:"#b45309"}}>⏳ Pendente ({passadas.length})</div>
                  <div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Aguardando confirmação de conclusão</div>
                </div>
                <div style={isDesktop?{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}:{}}>
                  {passadas.map(function(a){return(
                    <div key={a.id} id={"move-card-"+a.id}><Card style={{marginBottom:isDesktop?0:9,padding:"14px 16px",borderLeft:"4px solid "+(statusColor[a.status]||"#f59e0b"),background:statusBg[a.status]||"#fffbeb"}}>
                    {a.data<hoje&&<div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"6px 10px",marginBottom:10,fontSize:10,fontWeight:700,color:"#92400e"}}>⏳ Adicionada em {a.criado_em?new Date(a.criado_em).toLocaleDateString("pt-BR"):""} para data {a.data?new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR"):""}</div>}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:900,fontSize:24,color:COLORS.text,marginBottom:8}}>👤 {a.nome}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                          <TagSelo v={a.selo}/><TagData v={a.data}/><TagHora v={a.horario}/><TagCom v={a.comunidade}/>{a.status==="pendente_social"&&<span style={{background:"#fef3c7",border:"1.5px solid #fcd34d",borderRadius:8,padding:"3px 8px",fontSize:10,fontWeight:800,color:"#92400e"}}>⏳ Aguardando Promorar</span>}
                        </div>
                        <div style={{fontSize:12,lineHeight:1.9,background:"#fff",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                          <div>📦 <strong>Saída:</strong> {a.origem?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.origem)} target="_blank" style={{color:COLORS.blue,textDecoration:"none",fontWeight:600}}>{a.origem} 🗺️</a>:<span style={{color:COLORS.muted}}>—</span>}</div>
                          <div>🏠 <strong>Chegada:</strong> {a.destino?<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a.destino)} target="_blank" style={{color:COLORS.blue,textDecoration:"none",fontWeight:600}}>{a.destino} 🗺️</a>:<span style={{color:COLORS.muted}}>—</span>}</div>
                          {a.contato&&<div>📞 <strong>Contato:</strong> <a href={"tel:"+a.contato.replace(/\D/g,"")} style={{color:COLORS.green,textDecoration:"none",fontWeight:700}}>{a.contato} 📲</a></div>}
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>🚗 Veículos</div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={isSocial?undefined:function(){toggleAgField(a.id,"van");}} style={{padding:"7px 14px",borderRadius:10,border:"2px solid "+(a.van?COLORS.blue:"#e2e8f0"),background:a.van?"#eff6ff":"#f8fafc",color:a.van?COLORS.blue:COLORS.muted,fontWeight:800,fontSize:13,cursor:isSocial?"default":"pointer",opacity:isSocial?0.7:1}}>🚐 Van {a.van?"✓":"✗"}</button>
                            <button onClick={isSocial?undefined:function(){toggleAgField(a.id,"caminhao");}} style={{padding:"7px 14px",borderRadius:10,border:"2px solid "+(a.caminhao?COLORS.accent:"#e2e8f0"),background:a.caminhao?"#fff7ed":"#f8fafc",color:a.caminhao?COLORS.accent:COLORS.muted,fontWeight:800,fontSize:13,cursor:isSocial?"default":"pointer",opacity:isSocial?0.7:1}}>🚚 Caminhão {a.caminhao?"✓":"✗"}</button>
                          </div>
                        </div>
                        {(isAdmin||isSupervisor)&&(function(){var _motsV=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="VAN";});var _motsC=listaUsuarios.filter(function(u){return u.perfil==="motorista"&&u.ativo&&u.tipo_veiculo==="CAMINHAO";});var _selStyle={flex:1,padding:"8px 10px",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"};var _okStyle={padding:"8px 12px",borderRadius:9,border:"none",fontWeight:800,fontSize:12,cursor:"pointer",color:"#fff",whiteSpace:"nowrap"};var _kV=a.id+"_VAN";var _kC=a.id+"_CAM";var _valV=despPend[_kV]!==undefined?despPend[_kV]:(a.motorista_van_id||"");var _valC=despPend[_kC]!==undefined?despPend[_kC]:(a.motorista_caminhao_id||"");var _changedV=despPend[_kV]!==undefined&&despPend[_kV]!==(a.motorista_van_id||"");var _changedC=despPend[_kC]!==undefined&&despPend[_kC]!==(a.motorista_caminhao_id||"");return(<div style={{marginBottom:10}}><div style={{color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>🚚 Despachar Motoristas</div>{a.van&&_motsV.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><select value={_valV} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kV]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valV?"#2563eb":"#e2e8f0"),background:_valV?"#eff6ff":"#fff",color:_valV?"#2563eb":"#64748b"})}><option value="">🚐 Sem motorista Van</option>{_motsV.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}{mt.placa_veiculo?" · "+mt.placa_veiculo:""}</option>);})}</select><button onClick={function(){if(_changedV){handleDespachar(a.id,_valV||null,"VAN");setDespPend(function(p){var n=Object.assign({},p);delete n[_kV];return n;});}else{reenviarMensagensMotorista(a.id,_valV,"VAN");}}} disabled={!_valV} style={Object.assign({},_okStyle,{background:_valV?(_changedV?"#2563eb":"#f97316"):"#94a3b8",cursor:_valV?"pointer":"not-allowed"})}>{_valV?(_changedV?"✓ OK":"📲"):"✓"}</button></div>}{a.caminhao&&_motsC.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}><select value={_valC} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kC]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valC?"#7c3aed":"#e2e8f0"),background:_valC?"#f5f3ff":"#fff",color:_valC?"#7c3aed":"#64748b"})}><option value="">🚚 Sem motorista Caminhão</option>{_motsC.map(function(mt){return(<option key={mt.id} value={mt.id}>{mt.nome}{mt.placa_veiculo?" · "+mt.placa_veiculo:""}</option>);})}</select><button onClick={function(){if(_changedC){handleDespachar(a.id,_valC||null,"CAMINHAO");setDespPend(function(p){var n=Object.assign({},p);delete n[_kC];return n;});}else{reenviarMensagensMotorista(a.id,_valC,"CAMINHAO");}}} disabled={!_valC} style={Object.assign({},_okStyle,{background:_valC?(_changedC?"#7c3aed":"#f97316"):"#94a3b8",cursor:_valC?"pointer":"not-allowed"})}>{_valC?(_changedC?"✓ OK":"📲"):"✓"}</button></div>}{(function(){var _sups=listaUsuarios.filter(function(u){return u.perfil==="supervisor"&&u.ativo;});if(_sups.length===0)return null;var _kS=a.id+"_SUP";var _valS=despPend[_kS]!==undefined?despPend[_kS]:(a.supervisor_id||"");var _changedS=despPend[_kS]!==undefined&&despPend[_kS]!==(a.supervisor_id||"");return(<div style={{display:"flex",gap:6,alignItems:"center"}}><select value={_valS} onChange={function(e){setDespPend(function(p){var n=Object.assign({},p);n[_kS]=e.target.value;return n;});}} style={Object.assign({},_selStyle,{border:"1.5px solid "+(_valS?"#b45309":"#e2e8f0"),background:_valS?"#fef3c7":"#fff",color:_valS?"#92400e":"#64748b"})}><option value="">👷 Sem supervisor</option>{_sups.map(function(s){return(<option key={s.id} value={s.id}>{s.nome}</option>);})}</select><button onClick={function(){if(_changedS){handleDespacharSup(a.id,_valS||null);setDespPend(function(p){var n=Object.assign({},p);delete n[_kS];return n;});}else{reenviarMensagensSupervisor(a.id,_valS);}}} disabled={!_valS} style={Object.assign({},_okStyle,{background:_valS?(_changedS?"#b45309":"#f97316"):"#94a3b8",cursor:_valS?"pointer":"not-allowed"})}>{_valS?(_changedS?"✓ OK":"📲"):"✓"}</button></div>);})()}</div>);})()}
                        {!isSocial&&<div style={{display:"grid",gridTemplateColumns:(usuario&&(usuario.perfil==="admin"||usuario.perfil==="supervisor"))?"1fr 1fr":"1fr",gap:8,marginBottom:10}}>{!isSocial&&<div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>📐 Medição (m³)</label>
                            <input type="number" placeholder="Ex: 27" value={a.medicao||""} onChange={function(e){updateAgField(a.id,"medicao",e.target.value);}}
                              style={{width:"100%",background:"#fff",border:"1.5px solid "+(a.medicao?COLORS.green:COLORS.cardBorder),borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                          </div>}
                          {(usuario&&(usuario.perfil==="admin"||usuario.perfil==="supervisor"))&&<div>
                            <label style={{display:"block",color:COLORS.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>👷 Ajudantes</label>
                            <input type="number" placeholder="Ex: 3" value={a.ajudantes||""} onChange={function(e){updateAgField(a.id,"ajudantes",e.target.value);}}
                              style={{width:"100%",background:"#fff",border:"1.5px solid "+(a.ajudantes?COLORS.green:COLORS.cardBorder),borderRadius:9,color:COLORS.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                          </div>}
                        </div>}
                        {(isAdmin||isSupervisor)&&(function(){var _eqD=equipeDiaList.find(function(e){return e.data===a.data;});var _eqAj=_eqD&&Array.isArray(_eqD.ajudantes)?_eqD.ajudantes:[];return _eqAj.length>0?<div style={{marginBottom:8}}><div style={{display:"flex",flexWrap:"wrap",gap:4}}><span style={{fontSize:11,fontWeight:700,color:"#92400e"}}>👷 Equipe ({_eqAj.length}):</span>{_eqAj.map(function(aj){return <span key={aj.id} style={{background:"#dcfce7",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700,color:"#15803d"}}>{aj.nome}</span>;})}</div></div>:null;})()}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                          <div style={{display:"flex",gap:5}}>
                            {!isSocial&&<button onClick={function(){pedirFinalizacao(a);}} disabled={_agendaRemovidaIds.has(a.id)} style={{background:_agendaRemovidaIds.has(a.id)?"#059669":"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:_agendaRemovidaIds.has(a.id)?"default":"pointer"}}>{_agendaRemovidaIds.has(a.id)?"✅ Concluído":"✅ Finalizar"}</button>}
                            <button onClick={function(){setReagendarModal(a);setReagendarData("");setReagendarMotivo("");}} style={{background:"#eff6ff",border:"1.5px solid #93c5fd",color:"#2563eb",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📅 Reagendar</button>
                            {isAdmin&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:a.id,nome:a.nome,tipo:"ag",data:a.data,status:a.status,medicao:a.medicao});setConfirmDeleteMotivo("");}} style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#dc2626",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Cancelar</button>}
                          </div>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {!isSocial&&a.medicao&&<Badge color={COLORS.green}>📐 {a.medicao} m³</Badge>}
                            {a.ajudantes&&parseInt(a.ajudantes)>0&&<Badge color="#b45309">👷 {a.ajudantes} {parseInt(a.ajudantes)===1?"ajudante":"ajudantes"}</Badge>}
                            <button onClick={function(){compartilharWhatsApp(a);}} style={{...btnGreen,fontSize:14,padding:"6px 10px"}}>📲</button>
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:9}}>
                        {!isSocial&&<button onClick={function(){converterEmMudanca(a);}} style={{background:"#f0fdf4",border:"none",color:COLORS.green,borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Converter em mudança">✅</button>}
                        <button onClick={function(){setEditAg({...a});}} style={btnBlue}>✏️</button>
                        {isAdmin&&<button onClick={function(e){e.stopPropagation();setConfirmDelete({id:a.id,nome:a.nome,tipo:"ag",data:a.data,status:a.status,medicao:a.medicao});setConfirmDeleteMotivo("");}} style={btnRed}>✕</button>}
                        {(isAdmin||isSupervisor)&&<button onClick={function(){var _eq=equipeDiaList.find(function(e){return e.data===a.data;});setViewEquipeAg({nome:a.nome,data:a.data,ajudantes:_eq&&Array.isArray(_eq.ajudantes)?_eq.ajudantes:[]});}} style={{background:"#fef9c3",border:"none",color:"#92400e",borderRadius:8,padding:"5px 7px",cursor:"pointer",fontSize:10,fontWeight:800}} title="Ver equipe do dia">👷</button>}
                      </div>
                    </div>
                    {(a.approved_by_admin||a.approved_by_social||a.approved_by_promorar||a.approved_by_supervisor||a.requested_by||(usuario&&['admin','social','promorar','supervisor','coordenador'].includes(usuario.perfil)))&&(
                    <div style={{borderTop:"1px solid #e2e8f0",marginTop:6,paddingTop:5,fontSize:11,color:"#475569"}}>
                      <div style={{marginBottom:3}}>📝 <b>Solicitado por:</b> {a.created_by||a.requested_by||"Sistema"}{a.criado_em?" · "+new Date(a.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span>Promorar: {a.approved_by_promorar?<b style={{color:"#16a34a"}}>✅ {a.approved_by_promorar}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>{usuario&&usuario.perfil==="promorar"&&!a.approved_by_promorar&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#7e22ce",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span>Admin: {a.approved_by_admin?<b style={{color:"#16a34a"}}>✅ {a.approved_by_admin}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>{usuario&&usuario.perfil==="admin"&&!a.approved_by_admin&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#1e40af",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span>Social: {a.approved_by_social?<b style={{color:"#16a34a"}}>✅ {a.approved_by_social}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>{usuario&&(usuario.perfil==="social"||usuario.perfil==="coordenador")&&!a.approved_by_social&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#10b981",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>Supervisor: {a.approved_by_supervisor?<b style={{color:"#16a34a"}}>✅ {a.approved_by_supervisor}</b>:<span style={{color:"#ea580c"}}>⏳ Pendente</span>}</span>{usuario&&usuario.perfil==="supervisor"&&!a.approved_by_supervisor&&(<button onClick={function(){handleApproveAgenda(a.id);}} disabled={!!isApproving[a.id]} style={{padding:"2px 8px",fontSize:10,fontWeight:700,background:isApproving[a.id]?"#94a3b8":"#b45309",color:"#fff",border:"none",borderRadius:5,cursor:isApproving[a.id]?"not-allowed":"pointer"}}>{isApproving[a.id]?"⏳":"Confirmar"}</button>)}</div>
                    </div>)}
                    </Card></div>
                  );})}
                </div>
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
            <InpEndereco label="Saída" icon="📦" value={agForm.origem||""} onChange={v=>setAgForm(f=>({...f,origem:v}))} placeholder="Endereço de origem" mapboxToken={MAPBOX_TOKEN}/>
            <InpEndereco label="Chegada" icon="🏠" value={agForm.destino||""} onChange={v=>setAgForm(f=>({...f,destino:v}))} placeholder="Endereço de destino" mapboxToken={MAPBOX_TOKEN}/>
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
            <InpEndereco label="Origem" icon="📦" value={form.origem} onChange={v=>setForm(f=>({...f,origem:v}))} placeholder="Endereço de origem" mapboxToken={MAPBOX_TOKEN}/>
            <InpEndereco label="Destino" icon="🏠" value={form.destino} onChange={v=>setForm(f=>({...f,destino:v}))} placeholder="Endereço de destino" mapboxToken={MAPBOX_TOKEN}/>
            <Inp label="Telef. Morador" icon="📱" value={form.contato} onChange={v=>setForm(f=>({...f,contato:v}))} placeholder="Ex: 81 9 8888-1234" type="tel"/>
            <Inp label="Medição (m³)" icon="📐" type="number" value={form.medicao} onChange={v=>setForm(f=>({...f,medicao:v}))} placeholder="Ex: 27"/>
            <Tog label="🚐 Van" value={form.van} onChange={v=>setForm(f=>({...f,van:v}))}/>
            <button onClick={handleAddMud} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:COLORS.accent,color:"#fff",fontWeight:900,fontSize:15,cursor:"pointer",boxShadow:"0 2px 8px rgba(230,126,34,0.3)"}}>
              {flash||"💾 Salvar Mudança"}
            </button>
          </Card>
        )}

        {/* ══ ADMIN: SOLICITAÇÕES FINANCEIRAS PENDENTES ══ */}
        {tab==="financeiro"&&isAdmin&&(function(){
          var _pend=solicitacoesFin.filter(function(s){return s.status==="pendente";});
          if(_pend.length===0) return null;
          var _fvA=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2});};
          return(
            <div style={{margin:"0 12px 12px",background:"#fffbeb",border:"2px solid #f59e0b",borderRadius:14,overflow:"hidden"}}>
              <div style={{background:"#fef3c7",padding:"10px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid #fcd34d"}}>
                <span style={{fontSize:18}}>🔔</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#92400e"}}>{_pend.length} Solicitação(ões) Pendente(s)</div>
                  <div style={{fontSize:10,color:"#a16207"}}>Supervisores solicitaram alterações financeiras</div>
                </div>
              </div>
              <div style={{padding:"8px 12px"}}>
                {_pend.map(function(s){
                  return <div key={s.id} style={{background:"#fff",border:"1.5px solid #fcd34d",borderRadius:12,padding:"12px",marginBottom:8,boxShadow:"0 2px 8px rgba(245,158,11,0.1)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:12,color:"#1e293b"}}>{s.tipo==="editar_valor"?"✏️ Edição de Valor":(s.tipo==="remover_dia"?"🗑️ Remoção de Dia":"🗑️ Remoção de Ajudante")}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Por: <strong>{s.supervisor_nome}</strong></div>
                      </div>
                      <span style={{background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700,color:"#92400e"}}>⏳ Pendente</span>
                    </div>
                    {s.tipo==="editar_valor"&&<div style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                      <div style={{fontSize:11,color:"#475569"}}><strong>{s.prestador_nome}</strong> · {s.data_ref?String(s.data_ref).split("-").reverse().join("/"):""}</div>
                      <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center"}}>
                        <span style={{background:"#fef2f2",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,color:"#dc2626"}}>{_fvA(s.valor_antigo)}</span>
                        <span style={{color:"#94a3b8",fontSize:12}}>→</span>
                        <span style={{background:"#f0fdf4",borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,color:"#16a34a"}}>{_fvA(s.valor_novo)}</span>
                      </div>
                      {s.num_aj_antigo!=null&&s.num_aj_novo!=null&&<div style={{fontSize:10,color:"#64748b",marginTop:4}}>Ajudantes: {s.num_aj_antigo} → {s.num_aj_novo}</div>}
                    </div>}
                    {s.tipo==="remover_ajudante"&&<div style={{background:"#fef2f2",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                      <div style={{fontSize:11,color:"#dc2626",fontWeight:700}}>Remover: {s.ajudante_nome}</div>
                      <div style={{fontSize:10,color:"#991b1b",marginTop:2}}>De todo o período</div>
                    </div>}
                    {s.tipo==="remover_dia"&&<div style={{background:"#fef2f2",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                      <div style={{fontSize:11,color:"#dc2626",fontWeight:700}}>Remover: {s.prestador_nome}</div>
                      <div style={{fontSize:10,color:"#991b1b",marginTop:2}}>Dia: {s.data_ref?String(s.data_ref).split("-").reverse().join("/"):""} · {s.num_mud_antigo||0} mud · {_fvA(s.valor_antigo)}</div>
                    </div>}
                    <div style={{fontSize:10,color:"#64748b",marginBottom:8}}>💬 Motivo: {s.motivo}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={function(){
                        if(!confirm("Aprovar esta solicitação?"))return;
                        responderSolicitacao(s.id,"aprovado",usuario.id,usuario.nome);
                      }} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:"#16a34a",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>✅ Aprovar</button>
                      <button onClick={function(){
                        if(!confirm("Rejeitar esta solicitação?"))return;
                        responderSolicitacao(s.id,"rejeitado",usuario.id,usuario.nome);
                      }} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:"#dc2626",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>❌ Rejeitar</button>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          );
        })()}
        {/* ══ RELATÓRIO ══ */}
        {tab==="financeiro"&&isAdmin&&periodoFin!=="simples"&&periodoFin!=="completo"&&(function(){
          var _now=new Date();
          var _am=_now.getFullYear()+"-"+(String(_now.getMonth()+1).padStart(2,"0"));
          var _fv=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
          var _fvs=function(v){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v||0);};
          var _nm=new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^./,function(s){return s.toUpperCase();});
          // Filtrar dados do mês — usar slice(0,7) === _am (formato ISO YYYY-MM)
          var _mudM=(_allForFiltered||[]).filter(function(m){return m.data&&m.data.slice(0,7)===_am;});
          var _mudMDesp=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===_am;});
          var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===_am;});
          var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===_am;});
          // Usar função centralizada — receita de concluídas, despesas de todas agendadas
          var _eqM=(equipeDiaList||[]).filter(function(e){return e.data&&e.data.slice(0,7)===_am;});
          var _r=_calcCustos(_mudM,_cdM,_cpM,RULES,_mudMDesp,_eqM,solicitacoesFin);
          return (
            <div style={{padding:"12px 12px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>📊 Gerencial — {_nm}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={function(){exportarPDF(_r,_nm,_r.detAjudantes,_r.detCamDias,_r.detVanDias,"Promorar");}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:10,fontWeight:700,cursor:"pointer"}}>📄 PDF</button>
                  <button onClick={function(){exportarExcel(_r,_nm,_r.detAjudantes,_r.detCamDias,_r.detVanDias,_mudM,"Promorar");}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #16a34a",background:"#f0fdf4",color:"#16a34a",fontSize:10,fontWeight:700,cursor:"pointer"}}>📊 Excel</button>
                </div>
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
  var _mudSemDesp=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data>=_si2&&m.data<=_sf2;});
  var _eqSem2=(equipeDiaList||[]).filter(function(e){return e.data>=_si2&&e.data<=_sf2;});
  var _rSem=_calcCustos(_mudSem,(custosDiarios||[]).filter(function(cd){return cd.data>=_si2&&cd.data<=_sf2;}),(contasPagar||[]).filter(function(cp){return cp.data&&cp.data>=_si2&&cp.data<=_sf2;}),RULES,_mudSemDesp,_eqSem2,solicitacoesFin);
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
              {/* ── KPIs ── */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div style={{background:"linear-gradient(135deg,#eff6ff,#dbeafe)",border:"2px solid #60a5fa",borderRadius:14,padding:"12px 12px 10px"}}>
                  <div style={{fontSize:10,color:"#2563eb",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>📏 Média m³/Mudança</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#1d4ed8"}}>{_r.numMud>0?(_r.m3Total/_r.numMud).toFixed(1):"0"} <span style={{fontSize:12,fontWeight:600}}>m³</span></div>
                  <div style={{fontSize:10,color:"#1e40af",marginTop:4,background:"rgba(37,99,235,0.08)",borderRadius:6,padding:"2px 6px",display:"inline-block"}}>{_r.numMud} mudanças • {_r.m3Total.toFixed(0)} m³ total</div>
                </div>
                <div style={{background:"linear-gradient(135deg,#fefce8,#fef9c3)",border:"2px solid #facc15",borderRadius:14,padding:"12px 12px 10px"}}>
                  <div style={{fontSize:10,color:"#a16207",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>💰 Custo Médio/Mudança</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#854d0e"}}>{_r.numMudDesp>0?_fv(_r.despTotal/_r.numMudDesp):"R$ 0"}</div>
                  <div style={{fontSize:10,color:"#713f12",marginTop:4,background:"rgba(161,98,7,0.08)",borderRadius:6,padding:"2px 6px",display:"inline-block"}}>{_r.numMudDesp} mudanças com despesa</div>
                </div>
                <div style={{background:"linear-gradient(135deg,#ecfdf5,#d1fae5)",border:"2px solid #34d399",borderRadius:14,padding:"12px 12px 10px"}}>
                  <div style={{fontSize:10,color:"#059669",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>📈 Margem de Lucro</div>
                  <div style={{fontSize:22,fontWeight:900,color:_r.fatBruto>0&&(_r.lucroLiq/_r.fatBruto*100)>=30?"#047857":"#dc2626"}}>{_r.fatBruto>0?(_r.lucroLiq/_r.fatBruto*100).toFixed(1):"0"}%</div>
                  <div style={{fontSize:10,color:"#065f46",marginTop:4,background:"rgba(5,150,105,0.08)",borderRadius:6,padding:"2px 6px",display:"inline-block"}}>{_r.fatBruto>0&&(_r.lucroLiq/_r.fatBruto*100)>=30?"✅ Saudável":"⚠️ Abaixo de 30%"}</div>
                </div>
                {(function(){var _agMes=(agenda||[]).filter(function(a){return !a.deleted_at&&a.data&&a.data.slice(0,7)===_am;});var _canc=_agMes.filter(function(a){return a.status==="cancelada";}).length;var _total=_agMes.length;var _perc=_total>0?(_canc/_total*100).toFixed(1):"0";return(
                <div style={{background:"linear-gradient(135deg,#fdf2f8,#fce7f3)",border:"2px solid #f472b6",borderRadius:14,padding:"12px 12px 10px"}}>
                  <div style={{fontSize:10,color:"#be185d",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>❌ Cancelamentos</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#9d174d"}}>{_canc} <span style={{fontSize:12,fontWeight:600}}>({_perc}%)</span></div>
                  <div style={{fontSize:10,color:"#831843",marginTop:4,background:"rgba(190,24,93,0.08)",borderRadius:6,padding:"2px 6px",display:"inline-block"}}>{_total} agendadas no mês</div>
                </div>);})()}
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
      var _mudSem2=(_allForFiltered||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data>=_sem2.si&&m.data<=_sem2.sf;});
      var _mudSem2Desp=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data>=_sem2.si&&m.data<=_sem2.sf;});
      var _cdSem2=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data>=_sem2.si&&cd.data<=_sem2.sf;});
      var _eqSem3=(equipeDiaList||[]).filter(function(e){return e.data&&e.data>=_sem2.si&&e.data<=_sem2.sf;});
      var _rSem2=_calcCustos(_mudSem2,_cdSem2,[],RULES,_mudSem2Desp,_eqSem3,solicitacoesFin);
      var _calcMap2={caminhao:_rSem2.cCam,van:_rSem2.cVan,ajudante:_rSem2.cAj,almoco:_rSem2.cAlm};
      var _totalSem2=_tipos2.reduce(function(s,t){return s+(_calcMap2[t.tp]||0);},0);
      return(
        <div key={_sem2.si} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:700,fontSize:12,color:"#64748b"}}>📆 {_fD3(_sem2.si)} a {_fD3(_sem2.sf)}</span><span style={{fontWeight:800,fontSize:13,color:_totalSem2>0?"#dc2626":"#94a3b8"}}>{_fV3(_totalSem2)}</span></div>
          {_tipos2.map(function(_t2){
            var _val2=_calcMap2[_t2.tp]||0;
            return(
              <div key={_t2.tp} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                <span style={{fontSize:16,minWidth:24}}>{_t2.ico}</span>
                <span style={{flex:1,fontSize:12,color:"#334155",fontWeight:600}}>{_t2.lbl}</span>
                <span style={{fontSize:13,fontWeight:700,color:_val2>0?"#1e293b":"#94a3b8"}}>{_fV3(_val2)}</span>
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
  var _ms=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data>=_si&&m.data<=_sf;});
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
    var _mudMD=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===mes.ym;});
    var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===mes.ym;});
    var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===mes.ym;});
    var _eqM4=(equipeDiaList||[]).filter(function(e){return e.data&&e.data.slice(0,7)===mes.ym;});
    var r=_calcCustos(_mudM,_cdM,_cpM,RULES,_mudMD,_eqM4,solicitacoesFin);
    return {lbl:mes.lbl,ym:mes.ym,receita:r.fatBruto,despesa:r.despTotal,lucro:r.fatBruto-r.despTotal,numMud:_mudM.length};
  });
  var _totRec=_rows.reduce(function(s,r){return s+r.receita;},0);
  var _totDesp=_rows.reduce(function(s,r){return s+r.despesa;},0);
  var _totLuc=_totRec-_totDesp;

  function _gerarPdfSimples(){
    _loadJsPDF().then(function(JsPDF){
      var doc=new JsPDF({unit:"mm",format:"a4"});
      var _fsNow=new Date();var _fsStr=_fsNow.toLocaleDateString('pt-BR')+' '+_fsNow.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      _addPDFHeader(doc,'RELATÓRIO FINANCEIRO - SIMPLES','Contrato: PROMORAR');
      var head=[["Mês","Mudanças","Receita","Despesa","Lucro"]];
      var body=_rows.map(function(r){return [r.lbl,String(r.numMud),_fvR(r.receita),_fvR(r.despesa),_fvR(r.lucro)];});
      body.push(["TOTAL",String(_rows.reduce(function(s,r){return s+r.numMud;},0)),_fvR(_totRec),_fvR(_totDesp),_fvR(_totLuc)]);
      doc.autoTable({head:head,body:body,startY:32,margin:{bottom:22},styles:{fontSize:10,cellPadding:3},headStyles:{fillColor:[30,64,175]},footStyles:{fillColor:[241,245,249]},alternateRowStyles:{fillColor:[248,250,252]},didDrawPage:function(){_addPDFFooter(doc,_fsStr);}});
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
    var _mudMD=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===mes.ym;});
    var _cdM=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===mes.ym;});
    var _cpM=(contasPagar||[]).filter(function(cp){return cp.data&&cp.data.slice(0,7)===mes.ym;});
    var _eqM5=(equipeDiaList||[]).filter(function(e){return e.data&&e.data.slice(0,7)===mes.ym;});
    var r=_calcCustos(_mudM,_cdM,_cpM,RULES,_mudMD,_eqM5,solicitacoesFin);
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
      var _fcNow=new Date();var _fcStr=_fcNow.toLocaleDateString('pt-BR')+' '+_fcNow.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      _addPDFHeader(doc,'RELATÓRIO FINANCEIRO - COMPLETO','Contrato: PROMORAR');
      var head=[["Mês","Viag.","m³","Dias","Rec.Bruta","Impostos","Rec.Líq.","Caminhão","Van","Ajud.","Almoço","Extras","Desp.Total","Lucro"]];
      var body=_dados.map(function(d){return [d.lbl,String(d.numMud),d.m3.toFixed(0),String(d.diasTrab),_fvR(d.fatBruto),_fvR(d.imposto),_fvR(d.fatLiq),_fvR(d.cCam),_fvR(d.cVan),_fvR(d.cAj),_fvR(d.cAlm),_fvR(d.cDesp+d.cExtra),_fvR(d.despTotal),_fvR(d.lucro)];});
      body.push(["TOTAL",String(_tot.numMud),_tot.m3.toFixed(0),String(_tot.diasTrab),_fvR(_tot.fatBruto),_fvR(_tot.imposto),_fvR(_tot.fatLiq),_fvR(_tot.cCam),_fvR(_tot.cVan),_fvR(_tot.cAj),_fvR(_tot.cAlm),_fvR(_tot.cDesp+_tot.cExtra),_fvR(_tot.despTotal),_fvR(_tot.lucro)]);
      doc.autoTable({head:head,body:body,startY:32,margin:{left:6,right:6,bottom:22},styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[30,64,175]},alternateRowStyles:{fillColor:[248,250,252]},didDrawPage:function(){_addPDFFooter(doc,_fcStr);}});
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
{tab==="contas"&&<ResumoSemanal mudancas={_allForFiltered} mudDesp={_allForDespesa} RULES={RULES} prestadores={prestadores} custosDiarios={custosDiarios} setCustosDiarios={setCustosDiarios} setContasSemana={setContasSemana} equipeDiaList={equipeDiaList} solicitacoesFin={solicitacoesFin}/>}
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
    var numMud=_countMudFinanceiro(ed.data);
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
      _ajFinArr2.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Nenhuma equipe escalada neste período</div>:
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
  // ── Semana navegável (dom–sáb) ──
  var _pcW=function(n){return String(n).padStart(2,"0");};
  var _s0W=new Date(pagSemIni+"T12:00:00");
  var _s1W=new Date(pagSemIni+"T12:00:00");_s1W.setDate(_s1W.getDate()+6);
  var _siW=pagSemIni;
  var _sfW=_s1W.getFullYear()+"-"+_pcW(_s1W.getMonth()+1)+"-"+_pcW(_s1W.getDate());
  var _semLabelW=_pcW(_s0W.getDate())+"/"+_pcW(_s0W.getMonth()+1)+" – "+_pcW(_s1W.getDate())+"/"+_pcW(_s1W.getMonth()+1)+"/"+_s1W.getFullYear();
  // ── Chave do período de pagamento ──
  var _pagPeriodoKey=pagPeriodo==="semana"?pagSemIni:pagMes;
  // ── Filtro de dados: semana ou mês ──
  var _dataOk=pagPeriodo==="semana"?function(d){return d>=_siW&&d<=_sfW;}:function(d){return d&&d.slice(0,7)===pagMes;};
  // FONTE ÚNICA: _calcCustos para ajudantes, caminhão e van
  var _mudMesP=(_allForFiltered||[]).filter(function(m){return m.data&&_dataOk(m.data);});
  var _mudMesPDesp=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&_dataOk(m.data);});
  var _eqMesP=equipeDiaList.filter(function(e){return e.data&&_dataOk(e.data)&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
  var _cdMesP=(custosDiarios||[]).filter(function(cd){return cd.data&&_dataOk(cd.data);});
  var _rPag=_calcCustos(_mudMesP,_cdMesP,[],RULES,_mudMesPDesp,_eqMesP,solicitacoesFin);
  // Ajudantes: consumir detAjudantes do _calcCustos
  var _ajMapP=_rPag.detAjudantes;
  // Aplicar num_mud_novo para display (sem alterar valor — já aplicado no _calcCustos)
  var _aprovP=solicitacoesFin.filter(function(s){return s.status==="aprovado"&&s.tipo==="editar_valor";});
  Object.values(_ajMapP).forEach(function(aj){
    aj.dias.forEach(function(d){
      var aprov=_aprovP.find(function(s){return s.prestador_nome===aj.nome&&s.data_ref===d.data;});
      if(aprov&&aprov.num_mud_novo!=null)d.numMud=parseInt(aprov.num_mud_novo);
    });
  });
  var _ajListP=Object.values(_ajMapP).sort(function(a,b){return a.nome.localeCompare(b.nome);});
  var _totalEquipe=_ajListP.reduce(function(s,aj){return s+aj.total;},0);
  var _totalDiasEquipe=_ajListP.reduce(function(s,aj){return s+aj.dias.length;},0);
  // Motorista costs: só trabalho realizado (exclui "confirmado"), filtra por motorista_*_id
  var _mudMesPReal=_mudMesPDesp.filter(function(m){return (m.status||"").toLowerCase()!=="confirmado";});
  var _camDias=[];var _camTotal=0;
  var _vanDias=[];var _vanTotal=0;
  if(pagCam){
    var _diasCamU=[...new Set(_mudMesPReal.map(function(m){return m.data;}))];
    _diasCamU.forEach(function(data){
      var hasMot=_mudMesPReal.some(function(m){return m.data===data&&m.motorista_caminhao_id===pagCam;});
      if(!hasMot) return;
      var numTotal=_mudMesPReal.filter(function(m){return m.data===data&&(m.caminhao||m.motorista_caminhao_id||(!m.caminhao&&!m.van&&!m.motorista_van_id));}).length;
      var val=_calcDiario(numTotal,0,"caminhao",RULES);_camTotal+=val;_camDias.push({data:data,numMud:numTotal,valor:val});
    });
  }
  if(pagVan){
    var _diasVanU=[...new Set(_mudMesPReal.map(function(m){return m.data;}))];
    _diasVanU.forEach(function(data){
      var hasMot=_mudMesPReal.some(function(m){return m.data===data&&m.motorista_van_id===pagVan;});
      if(!hasMot) return;
      var numMot=_mudMesPReal.filter(function(m){return m.data===data&&m.motorista_van_id===pagVan;}).length;
      var val=_calcDiario(numMot,0,"van",RULES);_vanTotal+=val;_vanDias.push({data:data,numMud:numMot,valor:val});
    });
  }
  var _numMudCamP=_camDias.reduce(function(s,d){return s+d.numMud;},0);
  var _numMudVanP=_vanDias.reduce(function(s,d){return s+d.numMud;},0);
  // Get payment status
  var _getPag=function(tipo,refId){return (pagamentos||[]).find(function(p){return p.tipo===tipo&&p.ref_id===refId&&p.periodo===_pagPeriodoKey;})||null;};
  var _statusColor=function(s){return s==="pago"?"#16a34a":s==="parcial"?"#f59e0b":"#dc2626";};
  var _statusBg=function(s){return s==="pago"?"#f0fdf4":s==="parcial"?"#fffbeb":"#fef2f2";};
  var _statusLabel=function(s){return s==="pago"?"✅ Pago":s==="parcial"?"⚠️ Parcial":"⏳ Pendente";};
  // Month label
  var _mesDP=new Date(pagMes+"-15");
  var _nomesMesP=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var _mesLabelP=_nomesMesP[_mesDP.getMonth()]+"/"+_mesDP.getFullYear();
  // Unified period label
  var _periodoLabel=pagPeriodo==="semana"?_semLabelW:_mesLabelP;
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
          return <div key={i} style={{fontSize:10,color:"#475569",padding:"2px 0"}}>{_fdShort(d.data)}{d.numMud!=null?" · "+d.numMud+" mud":""} · {_fvP(d.valor)}</div>;
        })}
      </div>}
      {_pag&&_pag.data_pagamento&&<div style={{fontSize:10,color:"#64748b",marginBottom:6}}>📅 Pago em: {_fdP(_pag.data_pagamento)}{_pag.metodo?" · "+_pag.metodo:""}</div>}
      <div style={{display:"flex",gap:6}}>
        {_st!=="pago"&&<button onClick={function(){
          salvarPagamento({id:_pag?_pag.id:undefined,tipo:tipo,ref_id:refId,ref_nome:nome,periodo:_pagPeriodoKey,valor:valor,status:"pago",data_pagamento:new Date().toISOString().slice(0,10),metodo:"PIX",criado_em:_pag?_pag.criado_em:new Date().toISOString()});
        }} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Marcar Pago</button>}
        {_st!=="parcial"&&_st!=="pago"&&<button onClick={function(){
          salvarPagamento({id:_pag?_pag.id:undefined,tipo:tipo,ref_id:refId,ref_nome:nome,periodo:_pagPeriodoKey,valor:valor,status:"parcial",data_pagamento:new Date().toISOString().slice(0,10),metodo:"",criado_em:_pag?_pag.criado_em:new Date().toISOString()});
        }} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:"#f59e0b",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚠️ Parcial</button>}
        {_st==="pago"&&<button onClick={function(){
          salvarPagamento({id:_pag.id,tipo:tipo,ref_id:refId,ref_nome:nome,periodo:_pagPeriodoKey,valor:valor,status:"pendente",data_pagamento:null,metodo:"",criado_em:_pag.criado_em});
        }} style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>↩️ Desfazer</button>}
      </div>
    </div>;
  };
  var _supNome2=pagSup?(listaUsuarios.find(function(u){return u.id===pagSup;})||{}).nome||"":"";
  return(
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"14px 14px 16px",marginTop:10,marginBottom:10}}>
      <div style={{fontWeight:800,fontSize:14,color:"#1e293b",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>💰 Gestão de Pagamentos</div>
      {/* Semana / Mês toggle */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={function(){setPagPeriodo("semana");}} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"2px solid "+(pagPeriodo==="semana"?"#1e40af":"#e2e8f0"),background:pagPeriodo==="semana"?"#1e40af":"#f8fafc",color:pagPeriodo==="semana"?"#fff":"#64748b",fontSize:12,fontWeight:800,cursor:"pointer"}}>📅 Semana</button>
        <button onClick={function(){setPagPeriodo("mes");}} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"2px solid "+(pagPeriodo==="mes"?"#1e40af":"#e2e8f0"),background:pagPeriodo==="mes"?"#1e40af":"#f8fafc",color:pagPeriodo==="mes"?"#fff":"#64748b",fontSize:12,fontWeight:800,cursor:"pointer"}}>📆 Mês</button>
      </div>
      {/* Period nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:4}}>
        <button onClick={function(){if(pagPeriodo==="semana"){var d=new Date(pagSemIni+"T12:00:00");d.setDate(d.getDate()-7);setPagSemIni(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"));}else{var d2=new Date(pagMes+"-15");d2.setMonth(d2.getMonth()-1);setPagMes(d2.toISOString().slice(0,7));}}} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>◀</button>
        <div style={{fontSize:13,fontWeight:800,color:"#1e40af"}}>📅 {_periodoLabel}</div>
        <button onClick={function(){if(pagPeriodo==="semana"){var d=new Date(pagSemIni+"T12:00:00");d.setDate(d.getDate()+7);setPagSemIni(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"));}else{var d2=new Date(pagMes+"-15");d2.setMonth(d2.getMonth()+1);setPagMes(d2.toISOString().slice(0,7));}}} style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:700}}>▶</button>
      </div>
      <div style={{textAlign:"center",fontSize:10,color:"#94a3b8",marginBottom:12}}>{pagPeriodo==="semana"?"semana dom–sáb · ◀ ▶ para navegar":"mês · ◀ ▶ para navegar"}</div>
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
        {pagSup&&_ajListP.length===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma equipe escalada neste período</div>}
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
                salvarPagamento({id:_pag?_pag.id:undefined,tipo:"ajudante",ref_id:aj.id,ref_nome:"👷 "+aj.nome,periodo:_pagPeriodoKey,valor:aj.total,status:"pago",data_pagamento:new Date().toISOString().slice(0,10),metodo:"PIX",criado_em:_pag?_pag.criado_em:new Date().toISOString()});
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
        {pagCam&&_camTotal>0&&_renderPagItem("caminhao",pagCam,"🚚 "+(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).nome||"",(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).contato||"",_camTotal,_camDias)}
        {pagCam&&_camTotal>0&&<div style={{background:"#92400e",borderRadius:10,padding:"10px 14px",marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>🚚 {_camDias.length} dia{_camDias.length!==1?"s":""} · {_numMudCamP} mudança{_numMudCamP!==1?"s":""}</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:900}}>TOTAL: {_fvP(_camTotal)}</div>
          </div>
        </div>}
        {pagCam&&_camTotal>0&&(function(){var _camNome=(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).nome||"";var _camTel=(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).contato||"";return <div style={{display:"flex",gap:6,marginTop:8}}>
          <button onClick={function(){
            var NL="%0A";var t="📊 *CAMINHÃO - "+_camNome.toUpperCase()+"*"+NL+"🗓️ "+_mesLabelP+NL+NL;
            _camDias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="   📅 "+_fdShort(d.data)+" · "+d.numMud+" mud · "+_fvP(d.valor)+NL;});
            t+=NL+"🚚 "+_camDias.length+" dia"+(_camDias.length!==1?"s":"")+" · "+_numMudCamP+" mudança"+(_numMudCamP!==1?"s":"")+NL;
            t+="💰 *TOTAL: "+_fvP(_camTotal)+"*"+NL+NL+"— TELEMIM Mudanças";
            var _ph=_camTel?(_camTel.replace(/\D/g,"").length<=11?"55"+_camTel.replace(/\D/g,""):_camTel.replace(/\D/g,"")):"";
            window.open("https://wa.me/"+_ph+"?text="+encodeURIComponent(t),"_blank");
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📲 WhatsApp</button>
          <button onClick={function(){
            var NL="\n";var t="📊 CAMINHÃO - "+_camNome.toUpperCase()+NL+"🗓️ "+_mesLabelP+NL+NL;
            _camDias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="   📅 "+_fdShort(d.data)+" · "+d.numMud+" mud · "+_fvP(d.valor)+NL;});
            t+=NL+"🚚 "+_camDias.length+" dia"+(_camDias.length!==1?"s":"")+" · "+_numMudCamP+" mudança"+(_numMudCamP!==1?"s":"")+NL;
            t+="💰 TOTAL: "+_fvP(_camTotal)+NL+NL+"— TELEMIM Mudanças";
            var _w=window.open("","_blank");
            _w.document.write("<html><head><title>Caminhão - "+_camNome+" - "+_mesLabelP+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
            _w.document.close();
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📄 PDF</button>
        </div>;})()}
        {pagCam&&_camTotal===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma mudança neste período</div>}
      </div>

      {/* ═══ BLOCO 3: VAN ═══ */}
      <div style={{borderTop:"3px solid #1e40af",paddingTop:12,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:800,color:"#1e40af",marginBottom:8}}>🚐 VAN</div>
        <select value={pagVan} onChange={function(e){setPagVan(e.target.value);}} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,fontWeight:600,color:pagVan?"#1e293b":"#94a3b8",background:"#f8fafc",cursor:"pointer",boxSizing:"border-box",marginBottom:10}}>
          <option value="">Selecione o motorista...</option>
          {_motsVan.map(function(m){return <option key={m.id} value={m.id}>{m.nome}{m.placa_veiculo?" · "+m.placa_veiculo:""}</option>;})}
        </select>
        {pagVan&&_vanTotal>0&&_renderPagItem("van",pagVan,"🚐 "+(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).nome||"",(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).contato||"",_vanTotal,_vanDias)}
        {pagVan&&_vanTotal>0&&<div style={{background:"#1e40af",borderRadius:10,padding:"10px 14px",marginTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:11}}>🚐 {_vanDias.length} dia{_vanDias.length!==1?"s":""}</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:900}}>TOTAL: {_fvP(_vanTotal)}</div>
          </div>
        </div>}
        {pagVan&&_vanTotal>0&&(function(){var _vanNome=(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).nome||"";var _vanTel=(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).contato||"";return <div style={{display:"flex",gap:6,marginTop:8}}>
          <button onClick={function(){
            var NL="%0A";var t="📊 *VAN - "+_vanNome.toUpperCase()+"*"+NL+"🗓️ "+_mesLabelP+NL+NL;
            _vanDias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="   📅 "+_fdShort(d.data)+" · "+_fvP(d.valor)+NL;});
            t+=NL+"🚐 "+_vanDias.length+" dia"+(_vanDias.length!==1?"s":"")+NL;
            t+="💰 *TOTAL: "+_fvP(_vanTotal)+"*"+NL+NL+"— TELEMIM Mudanças";
            var _ph=_vanTel?(_vanTel.replace(/\D/g,"").length<=11?"55"+_vanTel.replace(/\D/g,""):_vanTel.replace(/\D/g,"")):"";
            window.open("https://wa.me/"+_ph+"?text="+encodeURIComponent(t),"_blank");
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📲 WhatsApp</button>
          <button onClick={function(){
            var NL="\n";var t="📊 VAN - "+_vanNome.toUpperCase()+NL+"🗓️ "+_mesLabelP+NL+NL;
            _vanDias.sort(function(a,b){return a.data.localeCompare(b.data);}).forEach(function(d){t+="   📅 "+_fdShort(d.data)+" · "+_fvP(d.valor)+NL;});
            t+=NL+"🚐 "+_vanDias.length+" dia"+(_vanDias.length!==1?"s":"")+NL;
            t+="💰 TOTAL: "+_fvP(_vanTotal)+NL+NL+"— TELEMIM Mudanças";
            var _w=window.open("","_blank");
            _w.document.write("<html><head><title>Van - "+_vanNome+" - "+_mesLabelP+"</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;font-size:14px;} @media print{button{display:none!important;}}</style></head><body>"+t.replace(/\n/g,"<br>")+"<br><br><button onclick='window.print()' style='padding:12px 24px;background:#1e40af;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;'>🖨️ Imprimir / Salvar PDF</button></body></html>");
            _w.document.close();
          }} style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",background:"#1e40af",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>📄 PDF</button>
        </div>;})()}
        {pagVan&&_vanTotal===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:12}}>Nenhuma mudança neste período</div>}
      </div>

      {/* Export button */}
      <button onClick={function(){
        var csv="Nome,Tipo,Periodo,Valor,Status,Data Pagamento,Metodo\n";
        _ajListP.forEach(function(aj){var _pag=_getPag("ajudante",aj.id);var _st=_pag?_pag.status:"pendente";csv+='"'+aj.nome+'","Ajudante","'+_mesLabelP+'","'+aj.total.toFixed(2)+'","'+_st+'","'+(_pag&&_pag.data_pagamento?_fdP(_pag.data_pagamento):"")+'","'+(_pag&&_pag.metodo?_pag.metodo:"")+'"'+"\n";});
        if(pagCam){var pC2=_getPag("caminhao",pagCam);var nC=(listaUsuarios.find(function(u){return u.id===pagCam;})||{}).nome||"";csv+='"'+nC+'","Caminhão","'+_mesLabelP+'","'+_camTotal.toFixed(2)+'","'+(pC2?pC2.status:"pendente")+'","'+(pC2&&pC2.data_pagamento?_fdP(pC2.data_pagamento):"")+'","'+(pC2&&pC2.metodo?pC2.metodo:"")+'"'+"\n";}
        if(pagVan){var pV2=_getPag("van",pagVan);var nV=(listaUsuarios.find(function(u){return u.id===pagVan;})||{}).nome||"";csv+='"'+nV+'","Van","'+_mesLabelP+'","'+_vanTotal.toFixed(2)+'","'+(pV2?pV2.status:"pendente")+'","'+(pV2&&pV2.data_pagamento?_fdP(pV2.data_pagamento):"")+'","'+(pV2&&pV2.metodo?pV2.metodo:"")+'"'+"\n";}
        var blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
        var url=URL.createObjectURL(blob);
        var a=document.createElement("a");a.href=url;a.download="pagamentos_"+_pagPeriodoKey+".csv";a.click();URL.revokeObjectURL(url);
      }} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"#475569",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>📥 Exportar Excel (CSV)</button>
    </div>
  );
})()}
        {/* ══ ABA EQUIPE ══ */}
        {tab==="equipe"&&isSupervisor&&(function(){
          var _fv=function(v){return "R$ "+parseFloat(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
          var _fd=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]:d;};
          var _fdFull=function(d){if(!d)return"";var p=(typeof d==="string"?d:"").split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d;};
          // Escalar: mudancas do dia selecionado (ALL non-deleted, non-cancelled)
          var _numMudDia=_countMudFinanceiro(equipeDiaSel);
          var _seenMD={};var _mudDia=[];
          (mudancas||[]).forEach(function(m){if(!m.deleted_at&&m.data===equipeDiaSel){var k=(m.nome||"").toLowerCase().trim()+"|"+m.data;_seenMD[k]=true;_mudDia.push(m);}});
          (agenda||[]).forEach(function(a){if(!a.deleted_at&&a.data===equipeDiaSel&&a.status!=="cancelada"&&a.status!=="pendente"){var k=(a.nome||"").toLowerCase().trim()+"|"+a.data;if(!_seenMD[k]){_seenMD[k]=true;_mudDia.push(a);}}});
          var _eqDia=equipeDiaList.find(function(e){return e.data===equipeDiaSel;});
          var _eqAjArr=_eqDia&&Array.isArray(_eqDia.ajudantes)?_eqDia.ajudantes:[];
          // Custo preview
          var _aj1a=parseFloat(RULES.aj1a)||80;
          var _ajAdd=parseFloat(RULES.ajAdd)||20;
          var _custoPorAj=_numMudDia>0?_aj1a+Math.max(0,_numMudDia-1)*_ajAdd:0;
          var _custoTotalDia=_custoPorAj*equipeDiaCheck.length;
          // Financeiro — FONTE ÚNICA via _calcCustos
          var _mesFin=equipeFinMes;
          var _eqMes=equipeDiaList.filter(function(e){return e.data&&e.data.slice(0,7)===_mesFin&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
          var _mudFinDesp=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&m.data.slice(0,7)===_mesFin;});
          var _mudFinConc=(_allForFiltered||[]).filter(function(m){return m.data&&m.data.slice(0,7)===_mesFin;});
          var _cdFin=(custosDiarios||[]).filter(function(cd){return cd.data&&cd.data.slice(0,7)===_mesFin;});
          var _rFin=_calcCustos(_mudFinConc,_cdFin,[],RULES,_mudFinDesp,_eqMes,solicitacoesFin);
          var _ajMap=_rFin.detAjudantes;
          var _ajFinArr=Object.values(_ajMap).sort(function(a,b){return a.nome.localeCompare(b.nome);});
          var _totalGeralDias=0;var _totalGeralValor=0;
          _ajFinArr.forEach(function(a){_totalGeralDias+=a.dias.length;a.dias.forEach(function(d){_totalGeralValor+=d.valor;});});
          // ── Helpers para edit/delete por dia (subEquipe=financeiro) ──
          var _aj1aF2=parseFloat(RULES.aj1a)||80;
          var _ajAddF2=parseFloat(RULES.ajAdd)||20;
          var _mySolsF=solicitacoesFin.filter(function(s){return s.supervisor_id===(usuario&&usuario.id);});
          var _pendentesF=_mySolsF.filter(function(s){return s.status==="pendente";});
          function _temSolPendF(ajNome,data){return _pendentesF.some(function(s){return((s.tipo==="editar_valor"||s.tipo==="remover_dia")&&s.prestador_nome===ajNome&&s.data_ref===data)||(s.tipo==="remover_ajudante"&&s.ajudante_nome===ajNome);});}
          function _supSolicEditAjF(aj,diaIdx){
            var d=aj.dias[diaIdx];
            var motivo=supFinMotivo.trim();
            if(!motivo){alert("Informe o motivo.");return;}
            criarSolicitacao({
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"editar_valor",
              data_ref:d.data,prestador_nome:aj.nome,cargo:"ajudante",
              valor_antigo:parseFloat(d.valor)||0,valor_novo:parseFloat(supFinEditMode.val)||0,
              num_mud_antigo:parseInt(d.numMud)||0,num_mud_novo:parseInt(supFinEditMode.numMud)||0,
              motivo:motivo,status:"pendente"
            }).then(function(ok){if(ok){setSupFinEditMode(null);setSupFinMotivo("");alert("Solicitação enviada!");}else alert("Erro.");});
          }
          function _supConfirmRemF(){
            var c=supFinDelConfirm;if(!c)return;
            var motivo=supFinMotivo.trim();
            if(!motivo){alert("Informe o motivo.");return;}
            var sol=c.scope==="dia"?{
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"remover_dia",
              data_ref:c.data,prestador_nome:c.ajNome,cargo:"ajudante",
              valor_antigo:parseFloat(c.valor)||0,num_mud_antigo:parseInt(c.numMud)||0,
              motivo:motivo,status:"pendente"
            }:{
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"remover_ajudante",
              ajudante_nome:c.ajNome,motivo:motivo,status:"pendente"
            };
            criarSolicitacao(sol).then(function(ok){if(ok){setSupFinDelConfirm(null);setSupFinMotivo("");alert("Solicitação enviada!");}else alert("Erro.");});
          }
          // Mes navigation
          var _mesD=new Date(_mesFin+"-15");
          var _nomesMes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          var _mesLabel=_nomesMes[_mesD.getMonth()]+" "+_mesD.getFullYear();
          var _mesAnterior=function(){var d=new Date(_mesFin+"-15");d.setMonth(d.getMonth()-1);setEquipeFinMes(d.toISOString().slice(0,7));};
          var _mesProximo=function(){var d=new Date(_mesFin+"-15");d.setMonth(d.getMonth()+1);setEquipeFinMes(d.toISOString().slice(0,7));};
          return <div style={{paddingBottom:80}}>
            <div style={{background:"#1e293b",padding:"20px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Gerenciamento</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>👷 Equipe</div></div>
            <div style={{display:"flex",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
              {[{id:"cadastro",l:"📋 Cadastro"},{id:"escalar",l:"📅 Escalar"},{id:"financeiro",l:"💰 Financeiro"},{id:"social",l:"👩‍⚕️ Social"}].concat(isSupervisor||isAdmin?[{id:"almoco",l:"🍽️ Almoço"}]:[]).map(function(t){return <button key={t.id} onClick={function(){setSubEquipe(t.id);loadAjudantes();if(t.id==="social")loadAssistentesSocial();if(t.id!=="cadastro")loadEquipeDia();if(t.id==="almoco")loadSolicitacoesAlmoco();if(t.id==="escalar"){loadEquipePadrao();var _f=equipeDiaList.find(ed=>ed.data===equipeDiaSel);if(_f&&Array.isArray(_f.ajudantes)){setEquipeDiaCheck(_dedupeAjs(_f.ajudantes));}else if(equipePadrao.length>0){setEquipeDiaCheck(_dedupeAjs(equipePadrao));}else{setEquipeDiaCheck([]);}}}} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subEquipe===t.id?700:500,background:"transparent",borderBottom:subEquipe===t.id?"3px solid #065f46":"3px solid transparent",color:subEquipe===t.id?"#065f46":"#64748b"}}>{t.l}</button>;})}
            </div>
            {/* SUB: CADASTRO */}
            {subEquipe==="cadastro"&&<div style={{padding:16}}>
              <Card style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>👷 Ajudantes Cadastrados ({ajudantesList.length})</div>
                  <button onClick={function(){setShowAddAjudante(!showAddAjudante);}} style={{padding:"7px 14px",borderRadius:10,border:"1.5px solid #16a34a",background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Novo</button>
                </div>
                {showAddAjudante&&<div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px",marginBottom:14}}>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <input placeholder="Nome" value={novoAjudante.nome} onChange={function(e){setNovoAjudante(function(p){return{...p,nome:e.target.value};});}} style={{flex:2,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                      <input type="tel" placeholder="Telefone" value={novoAjudante.telefone} onChange={function(e){setNovoAjudante(function(p){return{...p,telefone:e.target.value};});}} style={{flex:1.5,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <input placeholder="Chave PIX (CPF, email, telefone...)" value={novoAjudante.pix} onChange={function(e){setNovoAjudante(function(p){return{...p,pix:e.target.value};});}} style={{flex:1,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                      <button onClick={criarAjudante} style={{padding:"9px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>✓</button>
                    </div>
                  </div>
                </div>}
                {ajudantesList.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhum ajudante cadastrado</div>:ajudantesList.map(function(aj){
                  return <div key={aj.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{aj.nome}</div>{aj.telefone&&<div style={{fontSize:11,color:"#64748b"}}>📞 {aj.telefone}</div>}{aj.pix&&<div style={{fontSize:11,color:"#64748b"}}>💳 {aj.pix}</div>}</div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={function(){setEditAjudante({id:aj.id,nome:aj.nome,telefone:aj.telefone||"",pix:aj.pix||""});}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                      <button onClick={function(){if(confirm("Remover "+aj.nome+"?"))desativarAjudante(aj.id);}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #ef4444",background:"#fef2f2",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button>
                    </div>
                  </div>;
                })}
              </Card>
              {editAjudante&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditAjudante(null);}}>
                <div style={{background:"#fff",borderRadius:16,padding:"20px 16px",width:"100%",maxWidth:360}} onClick={function(e){e.stopPropagation();}}>
                  <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>✏️ Editar Ajudante</div>
                  <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Nome</div><input value={editAjudante.nome} onChange={function(e){setEditAjudante(function(p){return{...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                  <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Telefone</div><input type="tel" value={editAjudante.telefone} onChange={function(e){setEditAjudante(function(p){return{...p,telefone:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                  <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Chave PIX</div><input value={editAjudante.pix||""} onChange={function(e){setEditAjudante(function(p){return{...p,pix:e.target.value};});}} placeholder="CPF, email, telefone..." style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                  <div style={{display:"flex",gap:8}}><button onClick={function(){setEditAjudante(null);}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarAjudanteFn} style={{flex:2,padding:11,borderRadius:10,background:"#16a34a",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>✅ Salvar</button></div>
                </div>
              </div>}
            </div>}
            {/* SUB: ESCALAR */}
            {subEquipe==="escalar"&&<div style={{padding:16}}>
              {equipePadrao.length>0&&<Card style={{marginBottom:16,background:"linear-gradient(135deg,#fffbeb,#fef3c7)",border:"2px solid #f59e0b"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#92400e",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>⭐ EQUIPE PADRÃO ATUAL</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>{equipePadrao.map(function(aj){return <span key={aj.id} style={{background:"#fff",border:"1.5px solid #f59e0b",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,color:"#92400e"}}>👷 {aj.nome}</span>;})}</div>
                <div style={{display:"flex",gap:8}}><div style={{flex:1,fontSize:11,color:"#b45309",fontWeight:600,display:"flex",alignItems:"center"}}>{equipePadrao.length} ajudante{equipePadrao.length>1?"s":""}</div><button onClick={function(){if(confirm("Remover equipe padrão?"))limparEquipePadrao();}} style={{padding:"5px 14px",borderRadius:8,border:"1.5px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️ Limpar</button></div>
              </Card>}
              <Card style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>📅 DATA</div>
                <input type="date" value={equipeDiaSel} onChange={function(e){
                  setEquipeDiaSel(e.target.value);
                  var _found=equipeDiaList.find(function(ed){return ed.data===e.target.value;});
                  if(_found&&Array.isArray(_found.ajudantes)){setEquipeDiaCheck(_dedupeAjs(_found.ajudantes));}
                  else if(equipePadrao.length>0){setEquipeDiaCheck(_dedupeAjs(equipePadrao));}
                  else{setEquipeDiaCheck([]);}
                }} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontWeight:700,color:"#1e293b",boxSizing:"border-box"}}/>
                {(function(){var _found2=equipeDiaList.find(function(ed){return ed.data===equipeDiaSel;});if(!_found2&&equipePadrao.length>0&&equipeDiaCheck.length>0){return <div style={{background:"#eff6ff",border:"1px solid #93c5fd",borderRadius:8,padding:"6px 10px",marginTop:8,fontSize:11,color:"#1e40af",fontWeight:600}}>⭐ Equipe padrão carregada automaticamente</div>;}return null;})()}
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
                <button onClick={function(){if(equipeDiaCheck.length===0){alert("Selecione pelo menos 1 ajudante!");return;}salvarEquipePadrao(equipeDiaCheck);}} style={{width:"100%",padding:11,borderRadius:12,background:"#fbbf24",color:"#78350f",fontWeight:800,fontSize:13,border:"none",cursor:"pointer",marginTop:8}}>⭐ Salvar como Equipe Padrão</button>
                {equipeSalvaMsg&&<div style={{marginTop:10,padding:"12px 14px",borderRadius:10,background:equipeSalvaMsg.includes("✅")?"#f0fdf4":"#fef2f2",border:"1.5px solid "+(equipeSalvaMsg.includes("✅")?"#bbf7d0":"#fecaca"),textAlign:"center",fontSize:13,fontWeight:700,color:equipeSalvaMsg.includes("✅")?"#065f46":"#dc2626",animation:"fadeIn 0.3s ease"}}>{equipeSalvaMsg}</div>}
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
              {_ajFinArr.length===0?<Card><div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhuma equipe escalada neste período</div></Card>:_ajFinArr.map(function(aj){
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
                      var _isEditing=supFinEditMode&&supFinEditMode.pId===aj.id&&supFinEditMode.idx===i&&supFinEditMode._src==="subFin";
                      var _pend=_temSolPendF(aj.nome,d.data);
                      if(_isEditing){
                        return <div key={i} style={{padding:"6px 0",borderBottom:"1px solid #f8fafc",fontSize:12,background:"#eff6ff"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{color:"#475569",flex:1}}>{_fd(d.data)}</span>
                            <input type="number" min="0" value={supFinEditMode.numMud} onChange={function(e){var nm=parseInt(e.target.value)||0;setSupFinEditMode(function(v){return Object.assign({},v,{numMud:nm,val:nm>0?_aj1aF2+Math.max(0,nm-1)*_ajAddF2:0});});}} style={{width:50,padding:"3px",border:"1.5px solid #93c5fd",borderRadius:6,fontSize:11,textAlign:"center"}}/>
                            <span style={{fontSize:10,color:"#64748b"}}>mud</span>
                            <input type="number" step="0.01" value={supFinEditMode.val} onChange={function(e){setSupFinEditMode(function(v){return Object.assign({},v,{val:e.target.value});});}} style={{width:80,padding:"3px",border:"1.5px solid #93c5fd",borderRadius:6,fontSize:11,textAlign:"right"}}/>
                          </div>
                          <input type="text" value={supFinMotivo} onChange={function(e){setSupFinMotivo(e.target.value);}} placeholder="Motivo *" style={{width:"100%",padding:"6px",marginTop:6,border:"1.5px solid #93c5fd",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                          <div style={{display:"flex",gap:4,marginTop:6}}>
                            <button onClick={function(){_supSolicEditAjF(aj,i);}} style={{flex:2,padding:"6px",background:"#2563eb",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:11,cursor:"pointer"}}>📩 Solicitar</button>
                            <button onClick={function(){setSupFinEditMode(null);setSupFinMotivo("");}} style={{flex:1,padding:"6px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:6,fontWeight:700,fontSize:11,cursor:"pointer"}}>Cancelar</button>
                          </div>
                        </div>;
                      }
                      return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f8fafc",fontSize:12,background:_pend?"#fef2f2":"transparent"}}>
                        <span style={{color:_pend?"#dc2626":"#475569",flex:1}}>{_fd(d.data)}  ·  {d.numMud} mud</span>
                        <span style={{fontWeight:700,color:_pend?"#dc2626":"#065f46",marginRight:8}}>{_fv(d.valor)}</span>
                        {_pend?<span style={{fontSize:9,fontWeight:700,color:"#dc2626"}}>⏳</span>:<>
                          <button onClick={function(){setSupFinEditMode({pId:aj.id,idx:i,data:d.data,numMud:d.numMud,val:d.valor,cargo:"ajudante",_src:"subFin"});setSupFinMotivo("");}} style={{background:"#eff6ff",color:"#2563eb",border:"none",borderRadius:6,padding:"3px 6px",fontSize:10,fontWeight:700,cursor:"pointer",marginRight:3}} title="Editar">✏️</button>
                          <button onClick={function(){setSupFinDelConfirm({scope:"dia",ajId:aj.id,ajNome:aj.nome,data:d.data,numMud:d.numMud,valor:d.valor});setSupFinMotivo("");}} style={{background:"#fef2f2",color:"#dc2626",border:"none",borderRadius:6,padding:"3px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}} title="Remover este dia">🗑️</button>
                        </>}
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
              {/* MODAL — Confirmação de remoção (sub-aba Financeiro) */}
              {supFinDelConfirm&&<div onClick={function(){setSupFinDelConfirm(null);setSupFinMotivo("");}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:1000}}>
                <div onClick={function(e){e.stopPropagation();}} style={{background:"#fff",borderRadius:14,padding:"18px",maxWidth:380,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,0.3)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{fontSize:28}}>⚠️</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:900,color:"#dc2626"}}>Confirmar remoção</div>
                      <div style={{fontSize:11,color:"#64748b"}}>Só será aplicada após aprovação do admin</div>
                    </div>
                  </div>
                  <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                    {supFinDelConfirm.scope==="dia"?<>
                      <div style={{fontSize:12,color:"#7f1d1d"}}>Solicitar remoção de <strong>{supFinDelConfirm.ajNome}</strong> do dia <strong>{String(supFinDelConfirm.data).split("-").reverse().join("/")}</strong>?</div>
                      <div style={{fontSize:11,color:"#991b1b",marginTop:4}}>{supFinDelConfirm.numMud} mud · {_fv(supFinDelConfirm.valor)}</div>
                    </>:<>
                      <div style={{fontSize:12,color:"#7f1d1d"}}>Solicitar remoção de <strong>{supFinDelConfirm.ajNome}</strong> de todo o período?</div>
                    </>}
                  </div>
                  <div style={{fontSize:10,fontWeight:700,color:"#dc2626",marginBottom:6}}>Motivo *</div>
                  <input type="text" value={supFinMotivo} onChange={function(e){setSupFinMotivo(e.target.value);}} placeholder="Ex: ajudante faltou..." style={{width:"100%",padding:"9px 11px",border:"1.5px solid #fca5a5",borderRadius:8,fontSize:12,boxSizing:"border-box",marginBottom:10}} autoFocus/>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={function(){setSupFinDelConfirm(null);setSupFinMotivo("");}} style={{flex:1,padding:"10px",background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cancelar</button>
                    <button onClick={_supConfirmRemF} style={{flex:2,padding:"10px",background:"#dc2626",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}>🗑️ Sim, solicitar</button>
                  </div>
                </div>
              </div>}
            </div>}
          </div>;
        })()}
        {/* ══ SUPERVISOR FINANCEIRO ══ */}
        {tab==="financeiro_sup"&&isSupervisor&&(function(){
          var _fv2=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
          var _aj1a=parseFloat(RULES.aj1a)||80;
          var _ajAdd=parseFloat(RULES.ajAdd)||20;
          // FONTE ÚNICA via _calcCustos — mesma lógica de todos os cards
          var _mesFin=equipeFinMes;
          var _mesD=new Date(_mesFin+"-15");
          var _nomesMes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          var _mesLabel=_nomesMes[_mesD.getMonth()]+" "+_mesD.getFullYear();
          var _mesAnterior=function(){var d=new Date(_mesFin+"-15");d.setMonth(d.getMonth()-1);setEquipeFinMes(d.toISOString().slice(0,7));};
          var _mesProximo=function(){var d=new Date(_mesFin+"-15");d.setMonth(d.getMonth()+1);setEquipeFinMes(d.toISOString().slice(0,7));};
          // ── Calcular semana atual (seg-dom) ──
          var _pcS=function(n){return String(n).padStart(2,"0");};
          var _hjS=new Date();var _dwS=_hjS.getDay();var _difS=_dwS===0?6:_dwS-1;
          var _s0S=new Date(_hjS.getFullYear(),_hjS.getMonth(),_hjS.getDate()-_difS);
          var _s1S=new Date(_s0S.getFullYear(),_s0S.getMonth(),_s0S.getDate()+6);
          var _siS=_s0S.getFullYear()+"-"+_pcS(_s0S.getMonth()+1)+"-"+_pcS(_s0S.getDate());
          var _sfS=_s1S.getFullYear()+"-"+_pcS(_s1S.getMonth()+1)+"-"+_pcS(_s1S.getDate());
          var _semLabelS=_pcS(_s0S.getDate())+"/"+_pcS(_s0S.getMonth()+1)+" a "+_pcS(_s1S.getDate())+"/"+_pcS(_s1S.getMonth()+1);
          // ── Filtro de dados: semana ou mês ──
          var _dataOkS=supFinPeriodo==="semana"?function(d){return d>=_siS&&d<=_sfS;}:function(d){return d&&d.slice(0,7)===_mesFin;};
          var _eqMes=equipeDiaList.filter(function(e){return e.data&&_dataOkS(e.data)&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
          var _mudSupDesp=(_allForDespesa||[]).filter(function(m){return !m.deleted_at&&m.data&&_dataOkS(m.data);});
          var _mudSupConc=(_allForFiltered||[]).filter(function(m){return m.data&&_dataOkS(m.data);});
          var _cdSup=(custosDiarios||[]).filter(function(cd){return cd.data&&_dataOkS(cd.data);});
          var _rSup=_calcCustos(_mudSupConc,_cdSup,[],RULES,_mudSupDesp,_eqMes,solicitacoesFin);
          var _ajMap=_rSup.detAjudantes;
          // Aplicar num_mud_novo para display
          var _aprovadas=solicitacoesFin.filter(function(s){return s.status==="aprovado"&&s.tipo==="editar_valor";});
          Object.values(_ajMap).forEach(function(aj){
            aj.dias.forEach(function(d){
              var aprov=_aprovadas.find(function(s){return s.prestador_nome===aj.nome&&s.data_ref===d.data;});
              if(aprov&&aprov.num_mud_novo!=null)d.numMud=parseInt(aprov.num_mud_novo);
            });
          });
          var _ajFinArr=Object.values(_ajMap).sort(function(a,b){return a.nome.localeCompare(b.nome);});
          var _totalGeralDias=0;var _totalGeralValor=0;
          _ajFinArr.forEach(function(a){_totalGeralDias+=a.dias.length;a.dias.forEach(function(d){_totalGeralValor+=d.valor;});});
          var _mySols=solicitacoesFin.filter(function(s){return s.supervisor_id===usuario.id;});
          var _pendentes=_mySols.filter(function(s){return s.status==="pendente";});
          var _historico=_mySols.filter(function(s){return s.status!=="pendente";}).slice(0,10);
          function _temSolPendente(ajNome,data){return _pendentes.some(function(s){return((s.tipo==="editar_valor"||s.tipo==="remover_dia")&&s.prestador_nome===ajNome&&s.data_ref===data)||(s.tipo==="remover_ajudante"&&s.ajudante_nome===ajNome);});}
          function _temRemPendente(ajNome){return _pendentes.some(function(s){return s.tipo==="remover_ajudante"&&s.ajudante_nome===ajNome;});}
          function _supConfirmarRemocao(){
            var c=supFinDelConfirm;if(!c)return;
            var motivo=supFinMotivo.trim();
            if(!motivo){alert("Informe o motivo da remoção.");return;}
            var sol=c.scope==="dia"?{
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"remover_dia",
              data_ref:c.data,prestador_nome:c.ajNome,cargo:"ajudante",
              valor_antigo:parseFloat(c.valor)||0,num_mud_antigo:parseInt(c.numMud)||0,
              motivo:motivo,status:"pendente"
            }:{
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"remover_ajudante",
              ajudante_nome:c.ajNome,motivo:motivo,status:"pendente"
            };
            criarSolicitacao(sol).then(function(ok){
              if(ok){setSupFinDelConfirm(null);setSupFinMotivo("");alert("Solicitação enviada!");}
              else{alert("Erro ao enviar solicitação.");}
            });
          }
          var _editM=supFinEditMode;
          function _supSolicitarEditAj(aj,diaIdx){
            var d=aj.dias[diaIdx];
            var motivo=supFinMotivo.trim();
            if(!motivo){alert("Informe o motivo da alteração.");return;}
            var sol={
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"editar_valor",
              data_ref:d.data,prestador_nome:aj.nome,cargo:"ajudante",
              valor_antigo:parseFloat(d.valor)||0,valor_novo:parseFloat(_editM.val)||0,
              num_mud_antigo:parseInt(d.numMud)||0,num_mud_novo:parseInt(_editM.numMud)||0,
              motivo:motivo,status:"pendente"
            };
            criarSolicitacao(sol).then(function(ok){
              if(ok){setSupFinEditMode(null);setSupFinMotivo("");alert("Solicitação enviada! Aguarde aprovação do admin.");}
              else{alert("Erro ao enviar solicitação.");}
            });
          }
          function _supSolicitarRemAj(ajNome){
            var motivo=prompt("Motivo para remover "+ajNome+":");
            if(!motivo||!motivo.trim())return;
            criarSolicitacao({
              supervisor_id:usuario.id,supervisor_nome:usuario.nome,tipo:"remover_ajudante",
              ajudante_nome:ajNome,motivo:motivo.trim(),status:"pendente"
            }).then(function(ok){if(ok)alert("Solicitação enviada!");else alert("Erro ao enviar.");});
          }
          return(
            <div style={{paddingBottom:80}}>
              <div style={{background:"linear-gradient(135deg,#065f46,#047857)",padding:"20px 16px 24px"}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>FINANCEIRO</div>
                <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>👷 Ajudantes</div>
                {/* Semana / Mês toggle */}
                <div style={{display:"flex",gap:6,marginTop:10}}>
                  <button onClick={function(){setSupFinPeriodo("semana");}} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"2px solid "+(supFinPeriodo==="semana"?"#fff":"rgba(255,255,255,0.2)"),background:supFinPeriodo==="semana"?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"}}>📅 Semana</button>
                  <button onClick={function(){setSupFinPeriodo("mes");}} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"2px solid "+(supFinPeriodo==="mes"?"#fff":"rgba(255,255,255,0.2)"),background:supFinPeriodo==="mes"?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"}}>📆 Mês</button>
                </div>
                {supFinPeriodo==="semana"?(
                  <div style={{textAlign:"center",fontSize:12,fontWeight:800,color:"rgba(255,255,255,0.9)",marginTop:8,background:"rgba(255,255,255,0.1)",borderRadius:8,padding:"6px 0"}}>📅 Semana: {_semLabelS}</div>
                ):(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:10}}>
                    <button onClick={_mesAnterior} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700}}>◀</button>
                    <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{_mesLabel}</div>
                    <button onClick={_mesProximo} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700}}>▶</button>
                  </div>
                )}
              </div>
              {_pendentes.length>0&&<div style={{margin:"8px 12px",background:"#fffbeb",border:"2px solid #fcd34d",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>⏳</span>
                <div>
                  <div style={{fontWeight:800,fontSize:12,color:"#92400e"}}>{_pendentes.length} solicitação(ões) pendente(s)</div>
                  <div style={{fontSize:10,color:"#a16207"}}>Aguardando aprovação do administrador</div>
                </div>
              </div>}
              {/* Total banner */}
              {_ajFinArr.length>0&&<div style={{margin:"8px 12px",background:"linear-gradient(135deg,#065f46,#047857)",borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{supFinPeriodo==="semana"?"TOTAL SEMANA":"TOTAL MÊS"}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.8)"}}>{_ajFinArr.length} ajudante(s) · {_totalGeralDias} dia(s)</div></div>
                <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>{_fv2(_totalGeralValor)}</div>
              </div>}
              <div style={{padding:"12px"}}>
                {_ajFinArr.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:12}}>{supFinPeriodo==="semana"?"Nenhum ajudante escalado nesta semana.":"Nenhum ajudante escalado neste mês."}<br/>Use a aba Equipe → Escalar para registrar.</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {_ajFinArr.map(function(aj){
                    var ajTotal=aj.dias.reduce(function(s,d){return s+d.valor;},0);
                    return(
                      <div key={aj.id} style={{background:"#f0fdf4",borderRadius:12,border:"1px solid #bbf7d0",overflow:"hidden"}}>
                        <div style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                          <div style={{fontSize:22}}>👷</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:13,color:_temRemPendente(aj.nome)?"#dc2626":"#065f46"}}>{aj.nome}</div>
                            <div style={{fontSize:10,color:_temRemPendente(aj.nome)?"#dc2626":"#64748b"}}>{aj.dias.length} dia(s) trabalhado(s){aj.telefone?" · 📞 "+aj.telefone:""}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{fontWeight:800,fontSize:14,color:_temRemPendente(aj.nome)?"#dc2626":"#065f46"}}>{_fv2(ajTotal)}</div>
                            <button onClick={function(){setSupFinDelConfirm({scope:"ajudante",ajId:aj.id,ajNome:aj.nome});setSupFinMotivo("");}} style={{background:"#fef2f2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}} title="Remover ajudante de toda a semana/mês">🗑️</button>
                          </div>
                        </div>
                        <div style={{borderTop:"1px solid #d1fae5",background:"#fff",padding:"8px 12px"}}>
                          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                            <thead><tr style={{background:"#f8fafc"}}>
                              <th style={{padding:"5px 6px",textAlign:"left",color:"#64748b",fontWeight:600}}>Data</th>
                              <th style={{padding:"5px 4px",textAlign:"center",color:"#64748b",fontWeight:600}}>Mud.</th>
                              <th style={{padding:"5px 6px",textAlign:"right",color:"#64748b",fontWeight:600}}>Valor</th>
                              <th style={{padding:"5px 4px",textAlign:"center",width:64}}></th>
                            </tr></thead>
                            <tbody>
                            {aj.dias.map(function(d,i){
                              var pts=String(d.data).split("-");
                              var dfmt=pts[2]+"/"+pts[1];
                              var isEditing=_editM&&_editM.pId===aj.id&&_editM.idx===i;
                              if(isEditing){
                                return(
                                  <tr key={i} style={{background:"#eff6ff"}}>
                                    <td style={{padding:"6px"}}><span style={{fontWeight:600}}>{dfmt}</span></td>
                                    <td style={{padding:"4px",textAlign:"center"}}><input type="number" min="0" value={_editM.numMud} onChange={function(e){var nm=parseInt(e.target.value)||0;setSupFinEditMode(function(v){return{...v,numMud:nm,val:nm>0?_aj1a+Math.max(0,nm-1)*_ajAdd:0};});}} style={{width:40,padding:"4px",border:"1.5px solid #93c5fd",borderRadius:6,fontSize:12,textAlign:"center"}}/></td>
                                    <td style={{padding:"4px 6px",textAlign:"right"}}><input type="number" step="0.01" value={_editM.val} onChange={function(e){setSupFinEditMode(function(v){return{...v,val:e.target.value};});}} style={{width:70,padding:"4px",border:"1.5px solid #93c5fd",borderRadius:6,fontSize:12,textAlign:"right"}}/></td>
                                    <td></td>
                                  </tr>
                                );
                              }
                              var _pend=_temSolPendente(aj.nome,d.data);
                              return(
                                <tr key={i} style={{borderBottom:"1px solid #f1f5f9",background:_pend?"#fef2f2":"transparent"}}>
                                  <td style={{padding:"5px 6px",fontWeight:500,color:_pend?"#dc2626":"#334155"}}>{dfmt}</td>
                                  <td style={{padding:"5px 4px",textAlign:"center",color:_pend?"#dc2626":"#475569"}}>{d.numMud}</td>
                                  <td style={{padding:"5px 6px",textAlign:"right",fontWeight:600,color:_pend?"#dc2626":"#065f46"}}>{_fv2(d.valor)}</td>
                                  <td style={{padding:"5px 4px",textAlign:"center",whiteSpace:"nowrap"}}>
                                    <button onClick={function(){setSupFinEditMode({pId:aj.id,idx:i,data:d.data,numMud:d.numMud,val:d.valor,cargo:"ajudante"});setSupFinMotivo("");}} style={{background:"#eff6ff",color:"#2563eb",border:"none",borderRadius:6,padding:"3px 6px",fontSize:10,fontWeight:700,cursor:"pointer",marginRight:3}} title="Editar">✏️</button>
                                    <button onClick={function(){setSupFinDelConfirm({scope:"dia",ajId:aj.id,ajNome:aj.nome,data:d.data,numMud:d.numMud,valor:d.valor});setSupFinMotivo("");}} style={{background:"#fef2f2",color:"#dc2626",border:"none",borderRadius:6,padding:"3px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}} title="Remover este dia">🗑️</button>
                                  </td>
                                </tr>
                              );
                            })}
                            </tbody>
                            <tfoot><tr style={{borderTop:"2px solid #d1fae5",background:"#f0fdf4"}}>
                              <td colSpan={2} style={{padding:"6px",fontWeight:800,fontSize:11}}>TOTAL</td>
                              <td style={{padding:"6px",textAlign:"right",fontWeight:800,fontSize:13,color:"#065f46"}}>{_fv2(ajTotal)}</td>
                              <td></td>
                            </tr></tfoot>
                          </table>
                          {_editM&&_editM.pId===aj.id&&(
                            <div style={{marginTop:8,background:"#eff6ff",border:"2px solid #93c5fd",borderRadius:10,padding:"10px 12px"}}>
                              <div style={{fontSize:10,fontWeight:700,color:"#2563eb",marginBottom:6}}>Motivo da alteração *</div>
                              <input type="text" value={supFinMotivo} onChange={function(e){setSupFinMotivo(e.target.value);}} placeholder="Ex: ajudante faltou, valor incorreto..." style={{width:"100%",padding:"8px 10px",border:"1.5px solid #93c5fd",borderRadius:8,fontSize:12,boxSizing:"border-box",marginBottom:8}}/>
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={function(){_supSolicitarEditAj(aj,_editM.idx);}} style={{flex:2,padding:"8px",background:"#2563eb",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}>📩 Solicitar Alteração</button>
                                <button onClick={function(){setSupFinEditMode(null);setSupFinMotivo("");}} style={{flex:1,padding:"8px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Regra info */}
              <div style={{margin:"0 12px 12px",background:"#f1f5f9",borderRadius:10,padding:"10px 14px"}}>
                <div style={{fontSize:10,color:"#64748b"}}>Regra: 1ª mud R${_aj1a} + R${_ajAdd} por mud adicional</div>
              </div>
              {/* Minhas Solicitações */}
              {(_pendentes.length>0||_historico.length>0)&&<div style={{padding:"0 12px",marginBottom:16}}>
                <div style={{fontWeight:800,fontSize:13,color:"#1e293b",marginBottom:8}}>📋 Minhas Solicitações</div>
                {_pendentes.map(function(s){
                  var _lblP=s.tipo==="editar_valor"?"✏️ Edição":(s.tipo==="remover_dia"?"🗑️ Remover dia":"🗑️ Remover ajudante");
                  return <div key={s.id} style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:10,padding:"10px 12px",marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#92400e"}}>{_lblP} — {s.prestador_nome||s.ajudante_nome||""}</span>
                      <span style={{background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700,color:"#92400e"}}>⏳ Pendente</span>
                    </div>
                    <div style={{fontSize:10,color:"#a16207",marginTop:4}}>Motivo: {s.motivo}</div>
                    {s.data_ref&&<div style={{fontSize:10,color:"#a16207"}}>Data: {String(s.data_ref).split("-").reverse().join("/")}</div>}
                    {s.tipo==="editar_valor"&&s.valor_antigo!=null&&<div style={{fontSize:10,color:"#a16207"}}>{_fv2(s.valor_antigo)} → {_fv2(s.valor_novo)}</div>}
                    {s.tipo==="remover_dia"&&s.valor_antigo!=null&&<div style={{fontSize:10,color:"#a16207"}}>Valor: {_fv2(s.valor_antigo)} ({s.num_mud_antigo||0} mud.)</div>}
                  </div>;
                })}
                {_historico.map(function(s){
                  var isAprov=s.status==="aprovado";
                  var _lblH=s.tipo==="editar_valor"?"✏️ Edição":(s.tipo==="remover_dia"?"🗑️ Remover dia":"🗑️ Remover ajudante");
                  return <div key={s.id} style={{background:isAprov?"#f0fdf4":"#fef2f2",border:"1px solid "+(isAprov?"#bbf7d0":"#fecaca"),borderRadius:10,padding:"10px 12px",marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:isAprov?"#15803d":"#dc2626"}}>{_lblH} — {s.prestador_nome||s.ajudante_nome||""}</span>
                      <span style={{fontSize:9,fontWeight:700,color:isAprov?"#15803d":"#dc2626"}}>{isAprov?"✅ Aprovado":"❌ Rejeitado"}</span>
                    </div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:2}}>Por: {s.admin_nome||"Admin"} · {s.respondido_em?new Date(s.respondido_em).toLocaleDateString("pt-BR"):""}</div>
                  </div>;
                })}
              </div>}
              {/* MODAL — Confirmação de remoção */}
              {supFinDelConfirm&&<div onClick={function(){setSupFinDelConfirm(null);setSupFinMotivo("");}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:1000}}>
                <div onClick={function(e){e.stopPropagation();}} style={{background:"#fff",borderRadius:14,padding:"18px",maxWidth:380,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,0.3)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{fontSize:28}}>⚠️</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:900,color:"#dc2626"}}>Confirmar remoção</div>
                      <div style={{fontSize:11,color:"#64748b"}}>Só será aplicada após aprovação do admin</div>
                    </div>
                  </div>
                  <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                    {supFinDelConfirm.scope==="dia"?<>
                      <div style={{fontSize:12,color:"#7f1d1d"}}>Solicitar remoção de <strong>{supFinDelConfirm.ajNome}</strong> do dia <strong>{String(supFinDelConfirm.data).split("-").reverse().join("/")}</strong>?</div>
                      <div style={{fontSize:11,color:"#991b1b",marginTop:4}}>{supFinDelConfirm.numMud} mud · {_fv2(supFinDelConfirm.valor)}</div>
                    </>:<>
                      <div style={{fontSize:12,color:"#7f1d1d"}}>Solicitar remoção de <strong>{supFinDelConfirm.ajNome}</strong> de todo o período?</div>
                    </>}
                  </div>
                  <div style={{fontSize:10,fontWeight:700,color:"#dc2626",marginBottom:6}}>Motivo *</div>
                  <input type="text" value={supFinMotivo} onChange={function(e){setSupFinMotivo(e.target.value);}} placeholder="Ex: ajudante faltou..." style={{width:"100%",padding:"9px 11px",border:"1.5px solid #fca5a5",borderRadius:8,fontSize:12,boxSizing:"border-box",marginBottom:10}} autoFocus/>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={function(){setSupFinDelConfirm(null);setSupFinMotivo("");}} style={{flex:1,padding:"10px",background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cancelar</button>
                    <button onClick={_supConfirmarRemocao} style={{flex:2,padding:"10px",background:"#dc2626",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}>🗑️ Sim, solicitar</button>
                  </div>
                </div>
              </div>}
            </div>
          );
        })()}
        {/* ══ SUB: ALMOÇO (supervisor) ══ */}
        {tab==="equipe"&&isSupervisor&&subEquipe==="almoco"&&(function(){
          var _p2=function(n){return String(n).padStart(2,"0");};
          var _hj=new Date();var _hoje=_hj.getFullYear()+"-"+_p2(_hj.getMonth()+1)+"-"+_p2(_hj.getDate());
          var _eqHoje=equipeDiaList.find(function(e){return e.data===_hoje;});
          var _numAj=_eqHoje&&Array.isArray(_eqHoje.ajudantes)?_eqHoje.ajudantes.length:0;
          var _minhasSol=solicitacoesAlmoco.filter(function(s){return s.supervisor_id===usuario.id;});
          var _solHoje=_minhasSol.find(function(s){return s.data===_hoje;});
          return <div style={{padding:16}}>
            <Card style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:800,color:"#1e293b",marginBottom:12}}>🍽️ Solicitar Almoço — {_hoje.split("-").reverse().join("/")}</div>
              <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:12,color:"#065f46"}}>👷 Ajudantes escalados hoje: <strong>{_numAj}</strong></div>
              </div>
              {_solHoje&&_solHoje.status==="pendente"&&<div style={{background:"#fef9c3",border:"1.5px solid #facc15",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:700,color:"#a16207"}}>⏳ Já existe uma solicitação pendente para hoje</div>
              </div>}
              {_solHoje&&_solHoje.status==="aprovado"&&<div style={{background:"#dcfce7",border:"1.5px solid #4ade80",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:700,color:"#15803d"}}>✅ Almoço aprovado para hoje!</div>
              </div>}
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8}}>PEDIDOS ({_numAj} ajudantes)</div>
              {almocoItens.map(function(it,i){return <div key={"ai"+i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                <span style={{fontSize:11,color:"#94a3b8",minWidth:20}}>#{i+1}</span>
                <input placeholder="Tipo (ex: Marmita carne)" value={it.tipo} onChange={function(e){setAlmocoItens(function(prev){var n=[].concat(prev);n[i]={tipo:e.target.value,qtd:n[i].qtd};return n;});}} style={{flex:2,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                <input type="number" min="1" value={it.qtd} onChange={function(e){setAlmocoItens(function(prev){var n=[].concat(prev);n[i]={tipo:n[i].tipo,qtd:parseInt(e.target.value)||1};return n;});}} style={{width:50,padding:"9px 6px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,textAlign:"center"}}/>
              </div>;})}
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,marginTop:14}}>EXTRAS</div>
              {almocoExtras.map(function(it,i){return <div key={"ae"+i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                <span style={{fontSize:11,color:"#94a3b8",minWidth:20}}>+{i+1}</span>
                <input placeholder="Ex: Água, Suco, Refrigerante" value={it.tipo} onChange={function(e){setAlmocoExtras(function(prev){var n=[].concat(prev);n[i]={tipo:e.target.value,qtd:n[i].qtd};return n;});}} style={{flex:2,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                <input type="number" min="1" value={it.qtd} onChange={function(e){setAlmocoExtras(function(prev){var n=[].concat(prev);n[i]={tipo:n[i].tipo,qtd:parseInt(e.target.value)||1};return n;});}} style={{width:50,padding:"9px 6px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,textAlign:"center"}}/>
              </div>;})}
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📝 Observação</div>
                <input placeholder="Ex: Sem pimenta, entregar na obra..." value={almocoObs} onChange={function(e){setAlmocoObs(e.target.value);}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <button onClick={enviarSolicitacaoAlmoco} style={{width:"100%",marginTop:16,padding:13,borderRadius:12,background:"#f97316",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:"pointer"}}>📤 Enviar para Aprovação</button>
            </Card>
            {_minhasSol.length>0&&<Card>
              <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:10}}>📋 Histórico de Solicitações</div>
              {_minhasSol.slice(0,10).map(function(s){
                var _it=[];try{_it=typeof s.itens==="string"?JSON.parse(s.itens):(s.itens||[]);}catch(e2){_it=[];}
                var _dp=(s.data||"").split("-");var _df=_dp[2]+"/"+_dp[1]+"/"+_dp[0];
                return <div key={s.id} style={{padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>📅 {_df}</div>
                    <span style={{background:s.status==="aprovado"?"#dcfce7":s.status==="rejeitado"?"#fef2f2":"#fef9c3",borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700,color:s.status==="aprovado"?"#15803d":s.status==="rejeitado"?"#dc2626":"#a16207"}}>{s.status==="aprovado"?"✅ Aprovado":s.status==="rejeitado"?"❌ Rejeitado":"⏳ Pendente"}</span>
                  </div>
                  <div style={{fontSize:11,color:"#475569"}}>{_it.map(function(it){return it.qtd+"x "+it.tipo;}).join(" • ")}</div>
                  {s.observacao&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>📝 {s.observacao}</div>}
                </div>;
              })}
            </Card>}
          </div>;
        })()}
        {/* ══ APROVAÇÃO ALMOÇO (admin no dashboard) ══ */}
        {tab==="equipe"&&isAdmin&&subEquipe==="almoco"&&(function(){
          var _pendentes=solicitacoesAlmoco.filter(function(s){return s.status==="pendente";});
          var _historico=solicitacoesAlmoco.filter(function(s){return s.status!=="pendente";});
          return <div style={{padding:16}}>
            <Card style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:800,color:"#1e293b",marginBottom:12}}>🍽️ Solicitações de Almoço</div>
              {_pendentes.length===0&&<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhuma solicitação pendente</div>}
              {_pendentes.map(function(s){
                var _it=[];try{_it=typeof s.itens==="string"?JSON.parse(s.itens):(s.itens||[]);}catch(e2){_it=[];}
                var _dp=(s.data||"").split("-");var _df=_dp[2]+"/"+_dp[1]+"/"+_dp[0];
                var _totalItens=_it.reduce(function(acc,it){return acc+(parseInt(it.qtd)||0);},0);
                return <div key={s.id} style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:12,padding:"14px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div><div style={{fontSize:13,fontWeight:700,color:"#92400e"}}>👷 {s.supervisor_nome||"Supervisor"}</div><div style={{fontSize:11,color:"#a16207"}}>📅 {_df} • {_totalItens} itens</div></div>
                    <span style={{background:"#fef3c7",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#a16207"}}>⏳ Pendente</span>
                  </div>
                  <div style={{background:"#fff",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                    {_it.map(function(it,i){return <div key={i} style={{fontSize:11,color:"#475569",padding:"2px 0"}}>• {it.qtd}x {it.tipo}</div>;})}
                  </div>
                  {s.observacao&&<div style={{fontSize:11,color:"#64748b",marginBottom:8}}>📝 {s.observacao}</div>}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={function(){aprovarAlmoco(s.id,true);}} style={{flex:1,padding:10,borderRadius:10,background:"#16a34a",color:"#fff",fontWeight:700,fontSize:12,border:"none",cursor:"pointer"}}>✅ Aprovar</button>
                    <button onClick={function(){aprovarAlmoco(s.id,false);}} style={{flex:1,padding:10,borderRadius:10,background:"#dc2626",color:"#fff",fontWeight:700,fontSize:12,border:"none",cursor:"pointer"}}>❌ Rejeitar</button>
                  </div>
                </div>;
              })}
            </Card>
            {_historico.length>0&&<Card>
              <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:10}}>📋 Histórico</div>
              {_historico.slice(0,15).map(function(s){
                var _it=[];try{_it=typeof s.itens==="string"?JSON.parse(s.itens):(s.itens||[]);}catch(e2){_it=[];}
                var _dp=(s.data||"").split("-");var _df=_dp[2]+"/"+_dp[1]+"/"+_dp[0];
                return <div key={s.id} style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,color:"#1e293b"}}><strong>{s.supervisor_nome}</strong> · {_df}</div>
                    <span style={{background:s.status==="aprovado"?"#dcfce7":"#fef2f2",borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700,color:s.status==="aprovado"?"#15803d":"#dc2626"}}>{s.status==="aprovado"?"✅":"❌"} {s.status}</span>
                  </div>
                  <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{_it.map(function(it){return it.qtd+"x "+it.tipo;}).join(" • ")}</div>
                </div>;
              })}
            </Card>}
          </div>;
        })()}
        {tab==="equipe"&&(isSupervisor||isAdmin)&&subEquipe==="social"&&(function(){
          return <div style={{padding:16,paddingBottom:80}}>
            <Card style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>👩‍⚕️ Assistentes Sociais ({assistSocialList.length})</div>
                <button onClick={function(){setShowAddAssistSocial(!showAddAssistSocial);}} style={{padding:"7px 14px",borderRadius:10,border:"1.5px solid #7c3aed",background:"#f5f3ff",color:"#7c3aed",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nova</button>
              </div>
              {showAddAssistSocial&&<div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px",marginBottom:14}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <input placeholder="Nome" value={novoAssistSocial.nome} onChange={function(e){setNovoAssistSocial(function(p){return{...p,nome:e.target.value};});}} style={{flex:2,minWidth:100,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                  <input type="tel" placeholder="Telefone" value={novoAssistSocial.contato} onChange={function(e){setNovoAssistSocial(function(p){return{...p,contato:e.target.value};});}} style={{flex:1.5,minWidth:90,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                  <button onClick={criarAssistSocial} style={{padding:"9px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>✓</button>
                </div>
              </div>}
              {assistSocialList.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhuma assistente social cadastrada</div>:assistSocialList.map(function(as){
                return <div key={as.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{as.nome}</div>{as.contato&&<div style={{fontSize:11,color:"#64748b"}}>📞 {as.contato}</div>}</div>
                  <div style={{display:"flex",gap:6}}>
                    {as.contato&&<a href={"https://wa.me/55"+(as.contato||"").replace(/\D/g,"")} target="_blank" rel="noopener" style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #25d366",background:"#f0fdf4",color:"#25d366",fontSize:11,fontWeight:700,textDecoration:"none",cursor:"pointer"}}>📲</a>}
                    <button onClick={function(){setEditAssistSocial({id:as.id,nome:as.nome,contato:as.contato||""});}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                    <button onClick={function(){if(confirm("Remover "+as.nome+"?"))desativarAssistSocial(as.id);}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #ef4444",background:"#fef2f2",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button>
                  </div>
                </div>;
              })}
            </Card>
            {editAssistSocial&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditAssistSocial(null);}}>
              <div style={{background:"#fff",borderRadius:16,padding:"20px 16px",width:"100%",maxWidth:360}} onClick={function(e){e.stopPropagation();}}>
                <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>✏️ Editar Assistente Social</div>
                <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Nome</div><input value={editAssistSocial.nome} onChange={function(e){setEditAssistSocial(function(p){return{...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Telefone</div><input type="tel" value={editAssistSocial.contato} onChange={function(e){setEditAssistSocial(function(p){return{...p,contato:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{display:"flex",gap:8}}><button onClick={function(){setEditAssistSocial(null);}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarAssistSocialFn} style={{flex:2,padding:11,borderRadius:10,background:"#7c3aed",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>✅ Salvar</button></div>
              </div>
            </div>}
          </div>;
        })()}
        {tab==="social"&&!isSupervisor&&!isAdmin&&(function(){
          return <div style={{paddingBottom:80}}>
            <div style={{background:"#1e293b",padding:"20px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Cadastro</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>👩‍⚕️ Assistentes Sociais</div></div>
            <div style={{padding:16}}>
            <Card style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>👩‍⚕️ Assistentes ({assistSocialList.length})</div>
                <button onClick={function(){setShowAddAssistSocial(!showAddAssistSocial);}} style={{padding:"7px 14px",borderRadius:10,border:"1.5px solid #7c3aed",background:"#f5f3ff",color:"#7c3aed",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nova</button>
              </div>
              {showAddAssistSocial&&<div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px",marginBottom:14}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <input placeholder="Nome" value={novoAssistSocial.nome} onChange={function(e){setNovoAssistSocial(function(p){return{...p,nome:e.target.value};});}} style={{flex:2,minWidth:100,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                  <input type="tel" placeholder="Telefone" value={novoAssistSocial.contato} onChange={function(e){setNovoAssistSocial(function(p){return{...p,contato:e.target.value};});}} style={{flex:1.5,minWidth:90,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                  <button onClick={criarAssistSocial} style={{padding:"9px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>✓</button>
                </div>
              </div>}
              {assistSocialList.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhuma assistente social cadastrada</div>:assistSocialList.map(function(as){
                return <div key={as.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{as.nome}</div>{as.contato&&<div style={{fontSize:11,color:"#64748b"}}>📞 {as.contato}</div>}</div>
                  <div style={{display:"flex",gap:6}}>
                    {as.contato&&<a href={"https://wa.me/55"+(as.contato||"").replace(/\D/g,"")} target="_blank" rel="noopener" style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #25d366",background:"#f0fdf4",color:"#25d366",fontSize:11,fontWeight:700,textDecoration:"none",cursor:"pointer"}}>📲</a>}
                    <button onClick={function(){setEditAssistSocial({id:as.id,nome:as.nome,contato:as.contato||""});}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                    <button onClick={function(){if(confirm("Remover "+as.nome+"?"))desativarAssistSocial(as.id);}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #ef4444",background:"#fef2f2",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button>
                  </div>
                </div>;
              })}
            </Card>
            {editAssistSocial&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditAssistSocial(null);}}>
              <div style={{background:"#fff",borderRadius:16,padding:"20px 16px",width:"100%",maxWidth:360}} onClick={function(e){e.stopPropagation();}}>
                <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>✏️ Editar Assistente Social</div>
                <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Nome</div><input value={editAssistSocial.nome} onChange={function(e){setEditAssistSocial(function(p){return{...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Telefone</div><input type="tel" value={editAssistSocial.contato} onChange={function(e){setEditAssistSocial(function(p){return{...p,contato:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{display:"flex",gap:8}}><button onClick={function(){setEditAssistSocial(null);}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarAssistSocialFn} style={{flex:2,padding:11,borderRadius:10,background:"#7c3aed",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>✅ Salvar</button></div>
              </div>
            </div>}
            </div>
          </div>;
        })()}
        {/* ═══════ AUDITORIA (admin) ═══════ */}
        {tab==="auditoria"&&isAdmin&&(function(){
          var _fd=function(d){if(!d)return"";var s=String(d);if(s.includes("T")){var dt=new Date(s);return dt.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});}var p=s.split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:s;};
          var _lixFiltrada=auditLixeira.filter(function(it){
            if(auditFiltro.busca){var b=auditFiltro.busca.toLowerCase();if(!(it.nome||"").toLowerCase().includes(b)&&!(it.deleted_by||"").toLowerCase().includes(b))return false;}
            if(auditFiltro.supervisor&&it.supervisor_id!==auditFiltro.supervisor)return false;
            return true;
          });
          var _sups=listaUsuarios.filter(function(u){return u.perfil==="supervisor";});
          return(
            <div style={{paddingBottom:80}}>
              <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",padding:"20px 16px 16px"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Administração</div>
                <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>🗄️ Auditoria</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:4}}>Lixeira, erros do sistema e histórico de alterações</div>
              </div>
              <div style={{display:"flex",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
                {[{id:"saude",l:"🩺 Saúde"},{id:"lixeira",l:"🗑️ Lixeira"},{id:"erros",l:"⚠️ Erros"},{id:"morador",l:"👤 Morador"},{id:"historico",l:"📜 Histórico"}].map(function(s){
                  return <button key={s.id} onClick={function(){setAuditSubTab(s.id);if(s.id==="lixeira"&&auditLixeira.length===0)loadAuditLixeira();else if(s.id==="erros"&&auditErros.length===0)loadAuditErros();else if(s.id==="saude"&&!auditSaude)loadAuditSaude();}} style={{flex:1,padding:"10px 2px",border:"none",cursor:"pointer",fontSize:11,fontWeight:auditSubTab===s.id?700:500,background:"transparent",borderBottom:auditSubTab===s.id?"3px solid #334155":"3px solid transparent",color:auditSubTab===s.id?"#334155":"#64748b"}}>{s.l}</button>;
                })}
              </div>
              {auditSubTab==="saude"&&<div style={{padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>🩺 Saúde do sistema</div>
                  <button onClick={loadAuditSaude} disabled={auditLoading} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #334155",background:"#fff",color:"#334155",fontSize:11,fontWeight:700,cursor:"pointer"}}>{auditLoading?"⏳":"🔄"}</button>
                </div>
                {!auditSaude?<div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>{auditLoading?"⏳ Carregando...":"💡 Clique 🔄 pra atualizar"}</div>:<>
                  <div style={{background:auditSaude.triggerHealth>=95?"#f0fdf4":auditSaude.triggerHealth>=80?"#fffbeb":"#fef2f2",border:"2px solid "+(auditSaude.triggerHealth>=95?"#bbf7d0":auditSaude.triggerHealth>=80?"#fcd34d":"#fecaca"),borderRadius:12,padding:"14px 16px",marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:auditSaude.triggerHealth>=95?"#15803d":auditSaude.triggerHealth>=80?"#92400e":"#dc2626"}}>SAÚDE DO TRIGGER (7 dias)</div>
                        <div style={{fontSize:10,color:"#64748b",marginTop:2}}>% de agendas concluídas que viraram mudança</div>
                      </div>
                      <div style={{fontSize:32,fontWeight:900,color:auditSaude.triggerHealth>=95?"#16a34a":auditSaude.triggerHealth>=80?"#f59e0b":"#dc2626"}}>{auditSaude.triggerHealth}%</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"12px"}}><div style={{fontSize:10,color:"#64748b",fontWeight:700}}>MUDANÇAS</div><div style={{fontSize:24,fontWeight:900,color:"#15803d"}}>{auditSaude.mudancasSemana}</div><div style={{fontSize:10,color:"#94a3b8"}}>últimos 7 dias</div></div>
                    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"12px"}}><div style={{fontSize:10,color:"#64748b",fontWeight:700}}>M³ TOTAL</div><div style={{fontSize:24,fontWeight:900,color:"#1e40af"}}>{auditSaude.m3Semana.toFixed(0)}</div><div style={{fontSize:10,color:"#94a3b8"}}>últimos 7 dias</div></div>
                    <div style={{background:auditSaude.orphans.length>0?"#fef2f2":"#f0fdf4",border:"1.5px solid "+(auditSaude.orphans.length>0?"#fecaca":"#bbf7d0"),borderRadius:10,padding:"12px"}}><div style={{fontSize:10,color:auditSaude.orphans.length>0?"#dc2626":"#15803d",fontWeight:700}}>ÓRFÃOS</div><div style={{fontSize:24,fontWeight:900,color:auditSaude.orphans.length>0?"#dc2626":"#16a34a"}}>{auditSaude.orphans.length}</div><div style={{fontSize:10,color:"#94a3b8"}}>agenda sem mudança</div></div>
                    <div style={{background:auditSaude.erros24h>0?"#fef2f2":"#f0fdf4",border:"1.5px solid "+(auditSaude.erros24h>0?"#fecaca":"#bbf7d0"),borderRadius:10,padding:"12px"}}><div style={{fontSize:10,color:auditSaude.erros24h>0?"#dc2626":"#15803d",fontWeight:700}}>ERROS 24H</div><div style={{fontSize:24,fontWeight:900,color:auditSaude.erros24h>0?"#dc2626":"#16a34a"}}>{auditSaude.erros24h}</div><div style={{fontSize:10,color:"#94a3b8"}}>triggers falhos</div></div>
                  </div>
                  <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"12px",marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#475569",marginBottom:8}}>📊 Mudanças por dia (últimos 7)</div>
                    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
                      {auditSaude.porDia.map(function(d,i){
                        var _max=Math.max.apply(null,auditSaude.porDia.map(function(x){return x.mud;}))||1;
                        var _h=Math.round((d.mud/_max)*70)+5;
                        var _dt=new Date(d.data+"T12:00:00");
                        return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                          <div style={{fontSize:9,fontWeight:700,color:"#1e40af",marginBottom:2}}>{d.mud}</div>
                          <div style={{width:"100%",background:"linear-gradient(180deg,#3b82f6,#1e40af)",borderRadius:"4px 4px 0 0",height:_h}}/>
                          <div style={{fontSize:9,color:"#94a3b8",marginTop:3}}>{_dt.getDate()}/{_dt.getMonth()+1}</div>
                        </div>;
                      })}
                    </div>
                  </div>
                  {auditSaude.orphans.length>0&&<div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,padding:"12px"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#dc2626",marginBottom:8}}>⚠️ Agendas órfãs ({auditSaude.orphans.length})</div>
                    <div style={{fontSize:10,color:"#991b1b",marginBottom:8}}>Agenda concluída mas sem mudança correspondente</div>
                    {auditSaude.orphans.slice(0,10).map(function(o){
                      var _pts=String(o.data).split("-");
                      return <div key={o.id} style={{background:"#fff",border:"1px solid #fecaca",borderRadius:8,padding:"8px 10px",marginBottom:6,fontSize:11}}><div style={{fontWeight:700,color:"#7f1d1d"}}>{o.nome}</div><div style={{fontSize:10,color:"#991b1b",marginTop:2}}>📅 {_pts[2]+"/"+_pts[1]+"/"+_pts[0]} · status: {o.status}{o.medicao?" · "+o.medicao+" m³":""}</div></div>;
                    })}
                    {auditSaude.orphans.length>10&&<div style={{fontSize:10,color:"#94a3b8",textAlign:"center",fontStyle:"italic"}}>+{auditSaude.orphans.length-10} outros...</div>}
                  </div>}
                </>}
              </div>}
              {auditSubTab==="morador"&&<div style={{padding:14}}>
                <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#1e40af",marginBottom:8}}>👤 Buscar histórico do morador</div>
                  <input type="text" value={auditMoradorQuery} onChange={function(e){setAuditMoradorQuery(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")loadAuditMorador(auditMoradorQuery);}} placeholder="Nome completo ou parte (mín 3 chars)" style={{width:"100%",padding:"8px 10px",border:"1.5px solid #bfdbfe",borderRadius:8,fontSize:12,boxSizing:"border-box",marginBottom:6}}/>
                  <button onClick={function(){loadAuditMorador(auditMoradorQuery);}} disabled={auditLoading||auditMoradorQuery.trim().length<3} style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:auditMoradorQuery.trim().length>=3?"#1e40af":"#94a3b8",color:"#fff",fontSize:12,fontWeight:800,cursor:auditMoradorQuery.trim().length>=3?"pointer":"not-allowed"}}>{auditLoading?"⏳ Buscando...":"🔍 Buscar"}</button>
                </div>
                {!auditMorador?<div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>💡 Digite o nome do morador pra ver TODAS as mudanças e agendas dele</div>:<>
                  <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
                    <div style={{fontSize:11,color:"#64748b"}}>Buscando: <strong>{auditMorador.query}</strong></div>
                    <div style={{fontSize:11,color:"#15803d",marginTop:2}}>{auditMorador.mudancas.length} mudança(s) · {auditMorador.agendas.length} agenda(s) não realizada(s)</div>
                  </div>
                  {(function(){
                    var _all=auditMorador.mudancas.map(function(m){return Object.assign({},m,{_tipo:"mudanca"});}).concat(auditMorador.agendas.map(function(a){return Object.assign({},a,{_tipo:"agenda"});}));
                    _all.sort(function(a,b){return (b.data||"").localeCompare(a.data||"");});
                    if(_all.length===0)return <div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>Nenhum registro encontrado.</div>;
                    return _all.map(function(it){
                      var _pts=String(it.data||"").split("-");var _dfmt=_pts.length===3?_pts[2]+"/"+_pts[1]+"/"+_pts[0]:it.data;
                      var _del=it.deleted_at;
                      var _bg=_del?"#fef2f2":it._tipo==="mudanca"?"#f0fdf4":"#fffbeb";
                      var _bd=_del?"#fecaca":it._tipo==="mudanca"?"#bbf7d0":"#fcd34d";
                      var _ic=_del?"🗑️":it._tipo==="mudanca"?"✅":"📅";
                      var _sup=listaUsuarios.find(function(u){return u.id===it.supervisor_id;});
                      return <div key={it._tipo+"-"+it.id} style={{background:_bg,border:"1px solid "+_bd,borderRadius:10,padding:"10px 12px",marginBottom:8,opacity:_del?0.7:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{_ic}</span><span style={{fontWeight:800,fontSize:12,color:"#1e293b"}}>{_dfmt}</span><span style={{fontSize:9,fontWeight:700,background:_del?"#fee2e2":it._tipo==="mudanca"?"#dcfce7":"#fef3c7",color:_del?"#dc2626":it._tipo==="mudanca"?"#15803d":"#92400e",padding:"2px 6px",borderRadius:4}}>{_del?"DELETADO":it._tipo==="mudanca"?"REALIZADA":"AGENDA"}</span></div>
                        <div style={{fontSize:11,color:"#475569",marginLeft:20}}>{it.status||"?"}{it.medicao&&Number(it.medicao)>0?" · "+it.medicao+" m³":""}{_sup?" · 👤 "+_sup.nome:""}</div>
                        {it.origem&&<div style={{fontSize:10,color:"#64748b",marginLeft:20,marginTop:2}}>📦 {String(it.origem).substring(0,60)}{String(it.origem).length>60?"...":""}</div>}
                        {it.destino&&<div style={{fontSize:10,color:"#64748b",marginLeft:20}}>🏠 {String(it.destino).substring(0,60)}{String(it.destino).length>60?"...":""}</div>}
                        {_del&&<div style={{fontSize:10,color:"#dc2626",marginLeft:20,marginTop:2}}>🗑️ {it.deleted_by||"?"}</div>}
                      </div>;
                    });
                  })()}
                </>}
              </div>}
              {auditSubTab==="lixeira"&&<div style={{padding:14}}>
                <div style={{background:"#f8fafc",borderRadius:12,padding:12,marginBottom:12,display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:6}}>
                    {["7d","30d","90d","tudo"].map(function(p){return <button key={p} onClick={function(){setAuditFiltro(function(f){return Object.assign({},f,{periodo:p});});setTimeout(loadAuditLixeira,50);}} style={{flex:1,padding:"7px 4px",borderRadius:8,border:"1.5px solid "+(auditFiltro.periodo===p?"#334155":"#e2e8f0"),background:auditFiltro.periodo===p?"#1e293b":"#fff",color:auditFiltro.periodo===p?"#fff":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>{p==="tudo"?"📅 Tudo":"📅 "+p}</button>;})}
                  </div>
                  <input type="text" value={auditFiltro.busca} onChange={function(e){setAuditFiltro(function(f){return Object.assign({},f,{busca:e.target.value});});}} placeholder="🔍 Buscar por nome ou quem apagou..." style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,boxSizing:"border-box"}}/>
                  <select value={auditFiltro.supervisor} onChange={function(e){setAuditFiltro(function(f){return Object.assign({},f,{supervisor:e.target.value});});}} style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}>
                    <option value="">👤 Todos supervisores</option>
                    {_sups.map(function(s){return <option key={s.id} value={s.id}>{s.nome}</option>;})}
                  </select>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={loadAuditLixeira} disabled={auditLoading} style={{flex:1,padding:"8px",borderRadius:8,border:"1.5px solid #334155",background:"#f1f5f9",color:"#334155",fontSize:11,fontWeight:700,cursor:auditLoading?"not-allowed":"pointer"}}>{auditLoading?"⏳ Carregando...":"🔄 Atualizar"}</button>
                    <button onClick={exportAuditCSV} disabled={_lixFiltrada.length===0} style={{flex:1,padding:"8px",borderRadius:8,border:"1.5px solid #16a34a",background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,cursor:_lixFiltrada.length===0?"not-allowed":"pointer",opacity:_lixFiltrada.length===0?0.5:1}}>📊 Exportar CSV</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                  <div style={{background:"#fef2f2",borderRadius:10,padding:"10px",textAlign:"center",border:"1px solid #fecaca"}}><div style={{fontSize:10,color:"#dc2626",fontWeight:700}}>MUDANÇAS</div><div style={{fontSize:18,fontWeight:900,color:"#dc2626"}}>{_lixFiltrada.filter(function(it){return it._tipo==="mudanca";}).length}</div></div>
                  <div style={{background:"#fffbeb",borderRadius:10,padding:"10px",textAlign:"center",border:"1px solid #fcd34d"}}><div style={{fontSize:10,color:"#92400e",fontWeight:700}}>AGENDAS</div><div style={{fontSize:18,fontWeight:900,color:"#92400e"}}>{_lixFiltrada.filter(function(it){return it._tipo==="agenda";}).length}</div></div>
                </div>
                {_lixFiltrada.length===0?<div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>{auditLoading?"⏳ Carregando...":"✨ Nada na lixeira (com esses filtros)"}</div>:
                _lixFiltrada.map(function(it){
                  var _bgT=it._tipo==="mudanca"?"#fef2f2":"#fffbeb";var _bdT=it._tipo==="mudanca"?"#fecaca":"#fcd34d";var _icT=it._tipo==="mudanca"?"🏠":"📅";
                  return <div key={it._tipo+"-"+it.id} style={{background:_bgT,border:"1px solid "+_bdT,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:14}}>{_icT}</span><span style={{fontWeight:800,fontSize:12,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis"}}>{it.nome||"(sem nome)"}</span></div>
                        <div style={{fontSize:10,color:"#64748b",marginLeft:20}}>📅 {_fd(it.data)}{it.status?" · "+it.status:""}{it.medicao&&Number(it.medicao)>0?" · "+it.medicao+" m³":""}</div>
                        <div style={{fontSize:10,color:"#94a3b8",marginLeft:20,marginTop:2}}>🗑️ {_fd(it.deleted_at)} por {it.deleted_by||"?"}</div>
                      </div>
                      <button onClick={function(){setConfirmRestore(it);}} style={{padding:"6px 10px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0}}>♻️ Restaurar</button>
                    </div>
                  </div>;
                })}
              </div>}
              {auditSubTab==="erros"&&<div style={{padding:14}}>
                <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{fontSize:11,fontWeight:800,color:"#dc2626"}}>⚠️ Erros silenciosos do sistema (últimos 30 dias)</div><div style={{fontSize:10,color:"#991b1b"}}>Triggers que falharam ao sincronizar agenda → mudanças</div></div>
                    <button onClick={loadAuditErros} disabled={auditLoading} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #dc2626",background:"#fff",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>{auditLoading?"⏳":"🔄"}</button>
                  </div>
                </div>
                {auditErros.length===0?<div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>{auditLoading?"⏳ Carregando...":"✨ Nenhum erro nos últimos 30 dias"}</div>:
                auditErros.map(function(e){
                  var _dd=(function(){try{return typeof e.dados_depois==="string"?JSON.parse(e.dados_depois):(e.dados_depois||{});}catch(_){return{};}})();
                  return <div key={e.id} style={{background:"#fff",border:"1.5px solid #fecaca",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>📅 {_fd(e.criado_em)} · 🗂️ {e.tabela}#{e.registro_id}</div>
                    <div style={{fontWeight:700,fontSize:12,color:"#dc2626",marginBottom:4}}>⚠️ {_dd.erro||"erro sem detalhes"}</div>
                    {_dd.nome&&<div style={{fontSize:11,color:"#64748b"}}>👤 {_dd.nome} · 📅 {_dd.data||"?"}</div>}
                    {_dd.sqlstate&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>SQLSTATE: {_dd.sqlstate}</div>}
                  </div>;
                })}
              </div>}
              {auditSubTab==="historico"&&<div style={{padding:14}}>
                <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#1e40af",marginBottom:8}}>📜 Busca no histórico</div>
                  <input type="text" value={auditHistQuery} onChange={function(e){setAuditHistQuery(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")loadAuditHist(auditHistQuery);}} placeholder="ID do registro ou nome do morador..." style={{width:"100%",padding:"8px 10px",border:"1.5px solid #bfdbfe",borderRadius:8,fontSize:12,boxSizing:"border-box",marginBottom:6}}/>
                  <button onClick={function(){loadAuditHist(auditHistQuery);}} disabled={auditLoading||auditHistQuery.length<2} style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:auditHistQuery.length>=2?"#1e40af":"#94a3b8",color:"#fff",fontSize:12,fontWeight:800,cursor:auditHistQuery.length>=2?"pointer":"not-allowed"}}>{auditLoading?"⏳ Buscando...":"🔍 Buscar"}</button>
                </div>
                {auditHist.length===0?<div style={{textAlign:"center",padding:30,color:"#94a3b8",fontSize:13}}>{auditLoading?"⏳ Carregando...":"💡 Digite ID numérico ou nome (mín 2 chars)"}</div>:
                auditHist.map(function(h){
                  var _antes=(function(){try{return typeof h.dados_antes==="string"?JSON.parse(h.dados_antes):(h.dados_antes||{});}catch(_){return{};}})();
                  var _depois=(function(){try{return typeof h.dados_depois==="string"?JSON.parse(h.dados_depois):(h.dados_depois||{});}catch(_){return{};}})();
                  var _diff=[];Object.keys(_depois||{}).forEach(function(k){if(JSON.stringify(_antes[k])!==JSON.stringify(_depois[k])){_diff.push({campo:k,antes:_antes[k],depois:_depois[k]});}});
                  var _corA=h.acao==="INSERT"?"#16a34a":h.acao==="UPDATE"?"#1e40af":"#dc2626";
                  return <div key={h.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:11,fontWeight:800,color:_corA,background:_corA+"22",padding:"2px 8px",borderRadius:6}}>{h.acao}</span><span style={{fontSize:10,color:"#94a3b8"}}>{_fd(h.criado_em)}</span></div>
                    <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>🗂️ {h.tabela}#{h.registro_id} · 👤 {h.usuario_nome||"sistema"}</div>
                    {_diff.length>0?<div style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px",fontSize:10}}>{_diff.slice(0,5).map(function(d,i){return <div key={i} style={{marginBottom:3}}><strong style={{color:"#475569"}}>{d.campo}:</strong> <span style={{color:"#dc2626",textDecoration:"line-through"}}>{JSON.stringify(d.antes)}</span> → <span style={{color:"#16a34a"}}>{JSON.stringify(d.depois)}</span></div>;})}{_diff.length>5&&<div style={{color:"#94a3b8",fontStyle:"italic"}}>+{_diff.length-5} campos</div>}</div>:h.acao==="INSERT"?<div style={{fontSize:11,color:"#16a34a"}}>✨ Criado: {_depois.nome||_depois.id}</div>:<div style={{fontSize:10,color:"#94a3b8"}}>(sem diff visível)</div>}
                  </div>;
                })}
              </div>}
              {confirmRestore&&<div onClick={function(){setConfirmRestore(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                <div onClick={function(e){e.stopPropagation();}} style={{background:"#fff",borderRadius:20,padding:"22px",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{fontSize:30}}>♻️</div><div><div style={{fontWeight:900,fontSize:15,color:"#16a34a"}}>Restaurar este item?</div><div style={{fontSize:11,color:"#64748b"}}>Vai voltar à lista ativa</div></div></div>
                  <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"10px 12px",marginBottom:14}}><div style={{fontWeight:700,fontSize:13,color:"#14532d"}}>{confirmRestore._tipo==="mudanca"?"🏠 Mudança":"📅 Agenda"}: {confirmRestore.nome}</div><div style={{fontSize:11,color:"#15803d",marginTop:2}}>📅 {_fd(confirmRestore.data)}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>🗑️ Apagado em {_fd(confirmRestore.deleted_at)} por {confirmRestore.deleted_by||"?"}</div></div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={function(){setConfirmRestore(null);}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:800,fontSize:13,cursor:"pointer"}}>Cancelar</button>
                    <button onClick={function(){restaurarItem(confirmRestore);setConfirmRestore(null);}} style={{flex:2,padding:"12px 0",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:900,fontSize:13,cursor:"pointer"}}>♻️ Sim, restaurar</button>
                  </div>
                </div>
              </div>}
            </div>
          );
        })()}

        {tab==="config"&&<div style={{paddingBottom:80}}><div style={{background:"#1e293b",padding:"20px 16px 14px"}}><div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Sistema</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>⚙️ Configuração</div></div><div style={{display:"flex",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}><button onClick={()=>setSubConfig("usuarios")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="usuarios"?700:500,background:"transparent",borderBottom:subConfig==="usuarios"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="usuarios"?"#1e40af":"#64748b"}}>👥 Usuários</button>{isAdmin&&<button onClick={()=>setSubConfig("regras")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="regras"?700:500,background:"transparent",borderBottom:subConfig==="regras"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="regras"?"#1e40af":"#64748b"}}>📊 Regras</button>}{isAdmin&&<button onClick={function(){setSubConfig("social");loadAssistentesSocial();}} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="social"?700:500,background:"transparent",borderBottom:subConfig==="social"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="social"?"#1e40af":"#64748b"}}>👩‍⚕️ Social</button>}</div>{isAdmin&&<button onClick={()=>setSubConfig("backup")} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:subConfig==="backup"?700:500,background:"transparent",borderBottom:subConfig==="backup"?"3px solid #1e40af":"3px solid transparent",color:subConfig==="backup"?"#1e40af":"#64748b"}}>💾 Backup</button>}{subConfig==="social"&&isAdmin&&(<div style={{padding:16,paddingBottom:80}}>
            <Card style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>👩‍⚕️ Assistentes Sociais ({assistSocialList.length})</div>
                <button onClick={function(){setShowAddAssistSocial(!showAddAssistSocial);}} style={{padding:"7px 14px",borderRadius:10,border:"1.5px solid #7c3aed",background:"#f5f3ff",color:"#7c3aed",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nova</button>
              </div>
              {showAddAssistSocial&&<div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px",marginBottom:14}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <input placeholder="Nome" value={novoAssistSocial.nome} onChange={function(e){setNovoAssistSocial(function(p){return{...p,nome:e.target.value};});}} style={{flex:2,minWidth:100,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                  <input type="tel" placeholder="Telefone" value={novoAssistSocial.contato} onChange={function(e){setNovoAssistSocial(function(p){return{...p,contato:e.target.value};});}} style={{flex:1.5,minWidth:90,padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                  <button onClick={criarAssistSocial} style={{padding:"9px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>✓</button>
                </div>
              </div>}
              {assistSocialList.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:20}}>Nenhuma assistente social cadastrada</div>:assistSocialList.map(function(as){
                return <div key={as.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{as.nome}</div>{as.contato&&<div style={{fontSize:11,color:"#64748b"}}>📞 {as.contato}</div>}</div>
                  <div style={{display:"flex",gap:6}}>
                    {as.contato&&<a href={"https://wa.me/55"+(as.contato||"").replace(/\D/g,"")} target="_blank" rel="noopener" style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #25d366",background:"#f0fdf4",color:"#25d366",fontSize:11,fontWeight:700,textDecoration:"none",cursor:"pointer"}}>📲</a>}
                    <button onClick={function(){setEditAssistSocial({id:as.id,nome:as.nome,contato:as.contato||""});}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer"}}>✏️</button>
                    <button onClick={function(){if(confirm("Remover "+as.nome+"?"))desativarAssistSocial(as.id);}} style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid #ef4444",background:"#fef2f2",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button>
                  </div>
                </div>;
              })}
            </Card>
            {editAssistSocial&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditAssistSocial(null);}}>
              <div style={{background:"#fff",borderRadius:16,padding:"20px 16px",width:"100%",maxWidth:360}} onClick={function(e){e.stopPropagation();}}>
                <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>✏️ Editar Assistente Social</div>
                <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Nome</div><input value={editAssistSocial.nome} onChange={function(e){setEditAssistSocial(function(p){return{...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Telefone</div><input type="tel" value={editAssistSocial.contato} onChange={function(e){setEditAssistSocial(function(p){return{...p,contato:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{display:"flex",gap:8}}><button onClick={function(){setEditAssistSocial(null);}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarAssistSocialFn} style={{flex:2,padding:11,borderRadius:10,background:"#7c3aed",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>✅ Salvar</button></div>
              </div>
            </div>}
          </div>)}{subConfig==="usuarios"&&(isAdmin||isSupervisor)&&(<div style={{paddingBottom:80}} onMouseEnter={()=>listaUsuarios.length===0&&carregarUsuarios()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:16,fontWeight:900}}>👥 Gerenciar Usuários</div><button onClick={carregarUsuarios} style={{background:"#eff6ff",border:"1px solid #3b82f6",color:"#3b82f6",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔄 Atualizar</button></div><Card style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>USUÁRIOS ({listaUsuarios.length})</div>{listaUsuarios.length===0?<div style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>Clique em Atualizar</div>:(function(){function _pRank(u){if(u.perfil==="supervisor")return 0;if(u.perfil==="motorista"&&u.tipo_veiculo==="VAN")return 1;if(u.perfil==="motorista"&&u.tipo_veiculo==="CAMINHAO")return 2;if(u.perfil==="admin")return 3;return 4;}return[...listaUsuarios].sort(function(a,b){var ra=_pRank(a),rb=_pRank(b);if(ra!==rb)return ra-rb;return(a.nome||"").localeCompare(b.nome||"","pt-BR");});})().map(u=>(<div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}><div><div style={{fontWeight:700,fontSize:13}}>{u.nome}</div><div style={{fontSize:11,color:"#94a3b8"}}>{u.email}{u.contato?" · 📞 "+u.contato:""}</div><span style={{display:"inline-block",marginTop:3,background:u.perfil==="admin"?"#dbeafe":u.perfil==="promorar"?"#dcfce7":u.perfil==="motorista"?"#ede9fe":"#fef9c3",borderRadius:12,padding:"2px 8px",fontSize:10,fontWeight:800,color:u.perfil==="admin"?"#1d4ed8":u.perfil==="promorar"?"#15803d":u.perfil==="motorista"?"#7c3aed":"#a16207"}}>{u.perfil==="admin"?"👑 Admin":u.perfil==="promorar"?"🏢 Promorar":u.perfil==="supervisor"?"👷 Supervisor":u.perfil==="coordenador"?"📋 Coordenador":u.perfil==="motorista"?"🚚 Motorista":"🤝 Social"}</span>{u.perfil==="motorista"&&(u.tipo_veiculo||u.placa_veiculo)&&<span style={{display:"inline-block",marginTop:3,marginLeft:4,background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:12,padding:"2px 8px",fontSize:10,fontWeight:600,color:"#6d28d9"}}>{u.tipo_veiculo==="VAN"?"🚐 Van":u.tipo_veiculo==="CAMINHAO"?"🚛 Caminhão":u.tipo_veiculo||""}{u.placa_veiculo?" · "+u.placa_veiculo:""}</span>}</div><button onClick={function(){setEditUser({id:u.id,nome:u.nome,email:u.email,senha:"",perfil:u.perfil,ativo:u.ativo,tipo_veiculo:u.tipo_veiculo||"",placa_veiculo:u.placa_veiculo||"",contato:u.contato||""});setEditMsg("");}} style={{padding:"6px 12px",borderRadius:8,border:"1.5px solid #3b82f6",background:"#eff6ff",color:"#1e40af",fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>✏️ Editar</button>{isAdmin&&<button onClick={()=>toggleAtivoUser(u)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(u.ativo?"#ef4444":"#22c55e"),background:u.ativo?"#fef2f2":"#f0fdf4",color:u.ativo?"#ef4444":"#22c55e",fontSize:11,fontWeight:700,cursor:"pointer"}}>{u.ativo?"🚫 Desativar":"✅ Ativar"}</button>}{isAdmin&&<button onClick={function(){excluirUsuario(u);}} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #dc2626",background:"#fff0f0",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer",marginLeft:4}}>🗑️</button>}</div>))}</Card><Card><div style={{fontSize:11,fontWeight:800,color:"#94a3b8",marginBottom:12}}>+ NOVO USUÁRIO</div><Inp label="Nome" icon="👤" value={novoUser.nome} onChange={v=>setNovoUser(f=>({...f,nome:v}))}/><Inp label="Email" icon="📧" value={novoUser.email} onChange={v=>setNovoUser(f=>({...f,email:v}))}/><Inp label="Senha" icon="🔒" value={novoUser.senha} onChange={v=>setNovoUser(f=>({...f,senha:v}))}/><Inp label="Contato (telefone)" icon="📞" value={novoUser.contato} onChange={v=>setNovoUser(f=>({...f,contato:v}))}/><div style={{marginBottom:12}}><label style={{display:"block",color:"#94a3b8",fontSize:11,fontWeight:700,marginBottom:5}}>PERFIL</label><div style={{display:"flex",gap:8}}>{(isAdmin?[["admin","👑 Admin"],["promorar","🏢 Promorar"],["social","🤝 Social"],["motorista","🚚 Motorista"],["supervisor","👷 Supervisor"],["coordenador","📋 Coordenador"]]:[["motorista","🚚 Motorista"],["supervisor","👷 Supervisor"],["coordenador","📋 Coordenador"],["social","🤝 Social"]]).map(([val,lab])=>(<button key={val} onClick={()=>setNovoUser(f=>({...f,perfil:val,tipo_veiculo:val!=="motorista"?"":f.tipo_veiculo,placa_veiculo:val!=="motorista"?"":f.placa_veiculo}))} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1.5px solid "+(novoUser.perfil===val?"#f97316":"#e2e8f0"),background:novoUser.perfil===val?"#fff7ed":"#f8fafc",color:novoUser.perfil===val?"#f97316":"#94a3b8",fontWeight:800,fontSize:11,cursor:"pointer"}}>{lab}</button>))}</div></div>{novoUser.perfil==="motorista"&&<div style={{marginBottom:12,padding:"12px 14px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12}}><div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:0.5,marginBottom:10}}>🚗 DADOS DO VEÍCULO</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Tipo de Veículo *</label><select value={novoUser.tipo_veiculo} onChange={function(e){setNovoUser(function(f){return Object.assign({},f,{tipo_veiculo:e.target.value});});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid "+(novoUser.tipo_veiculo?"#7c3aed":"#e2e8f0"),borderRadius:9,fontSize:13,fontWeight:700,color:novoUser.tipo_veiculo?"#7c3aed":"#94a3b8",background:novoUser.tipo_veiculo?"#f5f3ff":"#fff",cursor:"pointer",boxSizing:"border-box"}}><option value="">Selecione...</option><option value="VAN">Van</option><option value="CAMINHAO">Caminhão</option></select></div><div><label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Placa (Opcional)</label><input type="text" placeholder="Ex: ABC-1D23" value={novoUser.placa_veiculo} onChange={function(e){setNovoUser(function(f){return Object.assign({},f,{placa_veiculo:e.target.value});});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontWeight:600,color:"#1e293b",textTransform:"uppercase",boxSizing:"border-box"}}/></div></div></div>}{userMsg&&<div style={{background:userMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:userMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{userMsg}</div>}<button onClick={criarUsuario} disabled={savingUser} style={{width:"100%",padding:13,borderRadius:12,background:savingUser?"#94a3b8":"#f97316",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:savingUser?"not-allowed":"pointer"}}>{savingUser?"⏳ Criando...":"➕ Criar Usuário"}</button></Card></div>)}{editUser&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setEditUser(null);}}><div style={{background:"#fff",borderRadius:16,padding:"20px 16px 24px",width:"100%",maxWidth:420}} onClick={function(e){e.stopPropagation();}}><div style={{fontSize:15,fontWeight:800,color:"#1e293b",marginBottom:14}}>✏️ Editar Usuário</div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>👤 NOME</div><input value={editUser.nome} onChange={function(e){setEditUser(function(p){return {...p,nome:e.target.value};});}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Nome"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📧 EMAIL</div><input value={editUser.email} onChange={function(e){setEditUser(function(p){return {...p,email:e.target.value};});}} type="email" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Email"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📞 CONTATO</div><input value={editUser.contato||""} onChange={function(e){setEditUser(function(p){return {...p,contato:e.target.value};});}} type="tel" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Ex: 81999990000"/></div><div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>🔒 NOVA SENHA <span style={{fontSize:10,color:"#94a3b8"}}>(vazio = manter)</span></div><input value={editUser.senha||""} onChange={function(e){setEditUser(function(p){return {...p,senha:e.target.value};});}} type="password" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} placeholder="Nova senha (opcional)"/></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6}}>PERFIL</div><div style={{display:"flex",gap:8}}>{[{v:"admin",l:"👑 Admin"},{v:"promorar",l:"🏢 Promorar"},{v:"social",l:"🤝 Social"},{v:"motorista",l:"🚚 Motorista"},{v:"supervisor",l:"👷 Sup."},{v:"coordenador",l:"📋 Coord."}].map(function(p){return <button key={p.v} onClick={function(){setEditUser(function(u){return {...u,perfil:p.v,tipo_veiculo:p.v!=="motorista"?"":u.tipo_veiculo,placa_veiculo:p.v!=="motorista"?"":u.placa_veiculo};});}} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"2px solid "+(editUser.perfil===p.v?"#1e40af":"#e2e8f0"),background:editUser.perfil===p.v?"#eff6ff":"#f8fafc",color:editUser.perfil===p.v?"#1e40af":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>{p.l}</button>;})}</div></div>{editUser.perfil==="motorista"&&<div style={{marginBottom:14,padding:"12px 14px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12}}><div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:0.5,marginBottom:10}}>🚗 DADOS DO VEÍCULO</div><div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Tipo de Veículo *</div><select value={editUser.tipo_veiculo||""} onChange={function(e){setEditUser(function(u){return {...u,tipo_veiculo:e.target.value};});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid "+(editUser.tipo_veiculo?"#7c3aed":"#e2e8f0"),borderRadius:9,fontSize:13,fontWeight:700,color:editUser.tipo_veiculo?"#7c3aed":"#94a3b8",background:editUser.tipo_veiculo?"#f5f3ff":"#fff",cursor:"pointer",boxSizing:"border-box"}}><option value="">Selecione...</option><option value="VAN">Van</option><option value="CAMINHAO">Caminhão</option></select></div><div><div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Placa (Opcional)</div><input type="text" placeholder="Ex: ABC-1D23" value={editUser.placa_veiculo||""} onChange={function(e){setEditUser(function(u){return {...u,placa_veiculo:e.target.value};});}} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontWeight:600,color:"#1e293b",textTransform:"uppercase",boxSizing:"border-box"}}/></div></div>}{editMsg&&<div style={{background:editMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"8px 12px",fontSize:12,color:editMsg.startsWith("✅")?"#15803d":"#dc2626",marginBottom:10}}>{editMsg}</div>}<div style={{display:"flex",gap:8}}><button onClick={function(){setEditUser(null);setEditMsg("");}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Cancelar</button><button onClick={editarUsuario} disabled={savingEdit} style={{flex:2,padding:11,borderRadius:10,background:savingEdit?"#94a3b8":"#1e40af",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:savingEdit?"not-allowed":"pointer"}}>{savingEdit?"⏳ Salvando...":"✅ Salvar"}</button></div></div></div>}{subConfig==="backup"&&<div style={{padding:16,paddingBottom:16}}><div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:12}}>💾 Backup Automático → Google Drive</div><div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>Backup Ativado</div><div style={{fontSize:10,color:"#64748b"}}>Semanal (seg) + Mensal (dia 1)</div></div><button onClick={async function(){const nv=!backupCfg.ativo;await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq.backup_ativo",{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor:nv?"true":"false"})});setBackupCfg(function(p){return{...p,ativo:nv};});}} style={{padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:backupCfg.ativo?"#16a34a":"#e2e8f0",color:backupCfg.ativo?"#fff":"#64748b"}}>{backupCfg.ativo?"✅ Ativo":"❌ Inativo"}</button></div><div style={{background:"#eff6ff",borderRadius:10,padding:"12px 14px",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:8}}>🔗 Google OAuth2</div><div style={{marginBottom:6}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Client ID</div><input type="text" value={backupCfg.clientId} onChange={function(e){setBackupCfg(function(p){return{...p,clientId:e.target.value};});}} placeholder="xxxxxx.apps.googleusercontent.com" style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><div style={{marginBottom:6}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Client Secret</div><input type="password" value={backupCfg.clientSecret} onChange={function(e){setBackupCfg(function(p){return{...p,clientSecret:e.target.value};});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><div style={{marginBottom:8}}><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Refresh Token</div><input type="password" value={backupCfg.refreshToken} onChange={function(e){setBackupCfg(function(p){return{...p,refreshToken:e.target.value};});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:11,boxSizing:"border-box"}} /></div><button onClick={async function(){const pairs=[["backup_gdrive_client_id",backupCfg.clientId],["backup_gdrive_client_secret",backupCfg.clientSecret],["backup_gdrive_refresh_token",backupCfg.refreshToken]];for(const [k,v] of pairs){await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+k,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor:v})});}alert("✅ Credenciais salvas!");}} style={{width:"100%",padding:"8px",background:"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>Salvar Credenciais</button></div><div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:"#16a34a",marginBottom:4}}>📅 Agendamento Automático</div><div style={{fontSize:11,color:"#475569",marginBottom:2}}>🔁 Semanal: toda segunda-feira às 06:00h</div><div style={{fontSize:11,color:"#475569",marginBottom:2}}>📆 Mensal: dia 1º de cada mês às 06:00h</div><div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Pasta: APP Telemim → [Ano] → Semanal / Mensal</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}><button onClick={async function(){setBackupLoading(true);try{const res=await fetch("https://netoufukpmmfhzwirogi.supabase.co/functions/v1/backup-gdrive?tipo=semanal&force=1",{method:"POST",headers:{"Content-Type":"application/json"}});const j=await res.json();alert(j.ok?"✅ Backup semanal!\n"+j.arquivo:"❌ "+(j.erro||j.msg));}catch(e){alert("❌ "+e.message);}setBackupLoading(false);}} disabled={backupLoading} style={{padding:"10px",background:backupLoading?"#94a3b8":"#059669",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{backupLoading?"⏳...":"🚀 Rodar Semanal"}</button><button onClick={async function(){setBackupLoading(true);try{const res=await fetch("https://netoufukpmmfhzwirogi.supabase.co/functions/v1/backup-gdrive?tipo=mensal&force=1",{method:"POST",headers:{"Content-Type":"application/json"}});const j=await res.json();alert(j.ok?"✅ Backup mensal!\n"+j.arquivo:"❌ "+(j.erro||j.msg));}catch(e){alert("❌ "+e.message);}setBackupLoading(false);}} disabled={backupLoading} style={{padding:"10px",background:backupLoading?"#94a3b8":"#1e40af",color:"#fff",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{backupLoading?"⏳...":"🚀 Rodar Mensal"}</button></div><div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>Histórico de Backups</div>{backupHist.length===0?<div style={{fontSize:11,color:"#94a3b8",textAlign:"center",padding:16}}>Nenhum backup realizado ainda</div>:backupHist.map(function(h){return <div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",marginBottom:8,background:h.status==="ok"?"#f0fdf4":"#fef2f2",borderRadius:8,border:"1px solid "+(h.status==="ok"?"#bbf7d0":"#fecaca")}}><div><div style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{h.tipo==="semanal"?"🔁":"📆"} {h.periodo_ref}</div><div style={{fontSize:10,color:"#64748b"}}>{h.arquivo_nome||h.erro_msg}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#94a3b8"}}>{h.executado_em?new Date(h.executado_em).toLocaleString("pt-BR"):""}</div>{h.gdrive_link&&<a href={h.gdrive_link} target="_blank" style={{fontSize:10,color:"#1e40af"}}>🔗 Ver</a>}</div></div>;})}</div>}{subConfig==="regras"&&<div style={{padding:"12px 12px 80px"}}><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚛 Caminhão</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>1ª Mudança (R$)</label><input type="number" value={cfgEdit.cam1a||350} onChange={e=>setCfgEdit(p=>({...p,cam1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.camAdd||130} onChange={e=>setCfgEdit(p=>({...p,camAdd:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>👷 Ajudante</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>1º Ajudante (R$)</label><input type="number" value={cfgEdit.aj1a||80} onChange={e=>setCfgEdit(p=>({...p,aj1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>+ Acréscimo (R$)</label><input type="number" value={cfgEdit.ajAdd||20} onChange={e=>setCfgEdit(p=>({...p,ajAdd:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🚐 Van</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Custo Operacional (R$)</label><input type="number" value={cfgEdit.vanCusto||400} onChange={e=>setCfgEdit(p=>({...p,vanCusto:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Valor Cobrado (R$)</label><input type="number" value={cfgEdit.van1a||1000} onChange={e=>setCfgEdit(p=>({...p,van1a:Number(e.target.value)}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div></div></div></div><div style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🮾 Imposto e Vigência</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Imposto (%)</label><input type="number" value={Math.round((cfgEdit.imposto||0.16)*100)} onChange={e=>setCfgEdit(p=>({...p,imposto:Number(e.target.value)/100}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,boxSizing:"border-box"}}/></div><div><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>📅 Data Início</label><input type="date" value={cfgEdit.dataInicioRegra||""} onChange={e=>setCfgEdit(p=>({...p,dataInicioRegra:e.target.value}))} style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,boxSizing:"border-box",color:"#334155"}}/></div></div></div></div>{(()=>{const _c1=cfgEdit.cam1a||350;const _cA=cfgEdit.camAdd||130;const _a1=cfgEdit.aj1a||80;const _aA=cfgEdit.ajAdd||20;const _v1=cfgEdit.van1a||1000;const _vC=cfgEdit.vanCusto||400;return <div style={{background:"#f1f5f9",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:12,color:"#475569"}}><div style={{fontWeight:700,marginBottom:6}}>Simulação:</div><div>🚛 1 mud: R${_c1} | 2 mud: R${_c1+_cA} | 3 mud: R${_c1+2*_cA}</div><div>👷 1 aj/1 mud: R${_a1} | 1 aj/2 mud: R${_a1+_aA}</div><div>🚐 Van cobra R${_v1} | custa R${_vC}</div></div>;})()}<button onClick={async()=>{try{const rows=[{chave:"cam_1a_mudanca",valor:String(cfgEdit.cam1a||350)},{chave:"cam_adicional",valor:String(cfgEdit.camAdd||130)},{chave:"ajudante_1a_mudanca",valor:String(cfgEdit.aj1a||80)},{chave:"ajudante_adicional",valor:String(cfgEdit.ajAdd||20)},{chave:"custo_van_dia",valor:String(cfgEdit.vanCusto||400)},{chave:"ganho_van_dia",valor:String(cfgEdit.van1a||1000)},{chave:"van_1a_mudanca",valor:String(cfgEdit.van1a||1000)},{chave:"imposto_pct",valor:String(Math.round((cfgEdit.imposto||0.16)*100))},{chave:"data_inicio_regra",valor:cfgEdit.dataInicioRegra||""}];let ok2=true;for(const row of rows){const res=await fetch(SUPA_URL+"/rest/v1/configuracoes?chave=eq."+row.chave,{method:"PATCH",headers:{...getH(),"Prefer":"return=minimal"},body:JSON.stringify({valor:row.valor})});if(!res.ok){ok2=false;}}if(ok2){alert("Regras salvas!");}else{alert("Erro ao salvar.");}}catch(e){alert("Erro: "+e.message);}}} style={{width:"100%",padding:"14px",background:"#1e40af",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>💾 Salvar Regras</button><div style={{marginTop:20,marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🍽️ Restaurante (Almoço)</div><div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"14px"}}>{(function(){var _cfgRest=(configuracoes||[]).find(function(c){return c.chave==="restaurante_contato";});var _cfgNome=(configuracoes||[]).find(function(c){return c.chave==="restaurante_nome";});return <div><div style={{marginBottom:8}}><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>Nome do Restaurante</label><input type="text" defaultValue={_cfgNome?_cfgNome.valor:""} id="_inp_rest_nome" placeholder="Ex: Restaurante Sabor Caseiro" style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,boxSizing:"border-box"}}/></div><div style={{marginBottom:8}}><label style={{fontSize:11,fontWeight:600,color:"#64748b",display:"block",marginBottom:4}}>WhatsApp do Restaurante</label><input type="tel" defaultValue={_cfgRest?_cfgRest.valor:""} id="_inp_rest_tel" placeholder="Ex: 81999998888" style={{width:"100%",padding:"9px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,boxSizing:"border-box"}}/></div><button onClick={async function(){var _nome=document.getElementById("_inp_rest_nome").value;var _tel=document.getElementById("_inp_rest_tel").value;await fetch(SUPA_URL+"/rest/v1/configuracoes",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}),body:JSON.stringify({chave:"restaurante_nome",valor:_nome})});await fetch(SUPA_URL+"/rest/v1/configuracoes",{method:"POST",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"}),body:JSON.stringify({chave:"restaurante_contato",valor:_tel})});alert("✅ Restaurante salvo!");}} style={{width:"100%",padding:"10px",background:"#f97316",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>💾 Salvar Restaurante</button></div>;})()}</div></div></div>}</div>}
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
                  {key:"atribuida",label:"Mudança Atribuída"},
                  {key:"iniciada",label:"Mudança Iniciada"},
                  {key:"deslocamento",label:"Motorista em Deslocamento"},
                  {key:"no_destino",label:"Motorista no Destino"},
                  {key:"finalizada",label:"Mudança Finalizada"},
                  {key:"lembrete",label:"Lembrete 1 dia antes"},
                  {key:"deslocamento_morador",label:"🏠 Deslocamento Morador (Supervisor)"}
                ].map(function(ev){
                  var cfg=cfgWAauto[ev.key]||{ativo:false,dest:[],msg:""};
                  var _dest=cfg.dest||[];
                  var _chips=[{id:"mot_van",label:"🚐 Mot. Van"},{id:"mot_caminhao",label:"🚚 Mot. Caminhão"},{id:"admin",label:"👑 Admin"},{id:"supervisor",label:"👷 Supervisor"},{id:"promorar",label:"📋 Promorar"},{id:"social",label:"🏛 Social"},{id:"cliente",label:"🏠 Morador"},{id:"assist_social",label:"👩‍⚕️ Assist. Social"}];
                  return <div key={ev.key} style={{marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <input type="checkbox" checked={cfg.ativo} onChange={function(){setCfgWAauto(function(p){var n=Object.assign({},p);n[ev.key]=Object.assign({},n[ev.key],{ativo:!cfg.ativo});return n;});}} style={{width:16,height:16,cursor:"pointer"}}/>
                      <span style={{fontSize:12,fontWeight:700,color:cfg.ativo?"#15803d":"#374151"}}>{ev.label}</span>
                    </div>
                    <div style={{background:"#fff",borderRadius:8,border:"1px solid #d1fae5",padding:"10px 12px"}}>
                      <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>Enviar para:</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                        {_chips.map(function(ch){var sel=_dest.indexOf(ch.id)!==-1;return <button key={ch.id} type="button" onClick={function(){setCfgWAauto(function(p){var n=Object.assign({},p);var cur=(n[ev.key]&&n[ev.key].dest)||[];var nDest=sel?cur.filter(function(x){return x!==ch.id;}):cur.concat([ch.id]);n[ev.key]=Object.assign({},n[ev.key],{dest:nDest});return n;});}} style={{padding:"4px 10px",borderRadius:12,border:sel?"1.5px solid #16a34a":"1.5px solid #d1d5db",background:sel?"#dcfce7":"#f9fafb",color:sel?"#15803d":"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>{ch.label}</button>;})}
                      </div>
                      <textarea value={cfg.msg} onChange={function(e){setCfgWAauto(function(p){var n=Object.assign({},p);n[ev.key]=Object.assign({},n[ev.key],{msg:e.target.value});return n;});}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1fae5",fontSize:11,minHeight:50,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace"}}/>
                    </div>
                  </div>;
                })}
                <div style={{fontSize:10,color:"#64748b",background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:10}}>
                  Variáveis: {"{cliente}"} {"{motorista}"} {"{data}"} {"{origem}"} {"{destino}"} {"{metragem}"} {"{supervisor}"} {"{contato}"} {"{assistente}"} {"{mapa_origem}"} {"{mapa_destino}"}
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
              {/* Aviso visual se algum campo crítico estiver vazio */}
              {(function(){
                var _faltam=[];
                if(!(cfgWA.evolution_api_url||"").trim())_faltam.push("URL Evolution API");
                if(!(cfgWA.evolution_api_key||"").trim())_faltam.push("Chave Evolution API");
                if(!(cfgWA.evolution_instance||"").trim())_faltam.push("Instância Evolution");
                if(_faltam.length===0)return null;
                return(<div style={{marginTop:10,padding:"10px 12px",background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,fontSize:12,color:"#991b1b"}}>
                  ⚠️ <b>Campos obrigatórios em branco:</b> {_faltam.join(", ")}.<br/>
                  <span style={{fontSize:11}}>Sem essas configurações, o envio automático de WhatsApp não funciona.</span>
                </div>);
              })()}
              <button onClick={async function(){
                // PROTEÇÃO: bloqueia salvar se campos críticos estão vazios
                var _faltando=[];
                if(!(cfgWA.evolution_api_url||"").trim())_faltando.push("URL Evolution API");
                if(!(cfgWA.evolution_api_key||"").trim())_faltando.push("Chave Evolution API");
                if(!(cfgWA.evolution_instance||"").trim())_faltando.push("Instância Evolution");
                if(_faltando.length>0){
                  if(!window.confirm("⚠️ Atenção!\n\nOs seguintes campos estão em branco:\n• "+_faltando.join("\n• ")+"\n\nSalvar mesmo assim vai DESATIVAR o envio automático de WhatsApp.\n\nDeseja continuar?")){
                    return;
                  }
                }
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
            {/* ══ MODAL CONFIRMAR REENVIO WHATSAPP ══ */}
      {confirmReenvio&&(
        <div onClick={confirmReenvio.onCancel} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={function(e){e.stopPropagation();}} style={{background:"#fff",borderRadius:24,padding:0,maxWidth:400,width:"100%",boxShadow:"0 25px 70px rgba(0,0,0,0.35)",overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#f97316,#ea580c)",padding:"24px 20px 20px",textAlign:"center",color:"#fff"}}>
              <div style={{fontSize:48,marginBottom:6,filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.2))"}}>{confirmReenvio.icone||"📲"}</div>
              <div style={{fontSize:18,fontWeight:900,letterSpacing:0.3,textShadow:"0 1px 2px rgba(0,0,0,0.15)"}}>{confirmReenvio.titulo||"Reenviar mensagem WhatsApp?"}</div>
            </div>
            <div style={{padding:"22px 20px"}}>
              {confirmReenvio.destinatario&&(
                <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:14,padding:"14px 16px",marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#15803d",letterSpacing:1.2,textTransform:"uppercase",marginBottom:5}}>📬 Destinatário</div>
                  <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{confirmReenvio.destinatario.tipo||""}</div>
                  <div style={{fontSize:17,fontWeight:900,color:"#1e293b"}}>{confirmReenvio.destinatario.nome||"—"}</div>
                  {confirmReenvio.destinatario.contato&&(
                    <div style={{fontSize:13,color:"#16a34a",fontWeight:700,marginTop:5,display:"flex",alignItems:"center",gap:5}}>📞 {confirmReenvio.destinatario.contato}</div>
                  )}
                </div>
              )}
              {confirmReenvio.contexto&&confirmReenvio.contexto.cliente&&(
                <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px",marginBottom:18}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#64748b",letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>📋 Mudança</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#1e293b",marginBottom:6}}>👤 {confirmReenvio.contexto.cliente}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,fontSize:11,color:"#475569"}}>
                    {confirmReenvio.contexto.data&&(
                      <span style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px"}}>📅 {(function(){var d=confirmReenvio.contexto.data.split("-");return d.length===3?(d[2]+"/"+d[1]+"/"+d[0]):confirmReenvio.contexto.data;})()}</span>
                    )}
                    {confirmReenvio.contexto.horario&&(
                      <span style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px"}}>⏰ {confirmReenvio.contexto.horario}h</span>
                    )}
                    {confirmReenvio.contexto.comunidade&&(
                      <span style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px"}}>📍 {confirmReenvio.contexto.comunidade}</span>
                    )}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={confirmReenvio.onCancel} style={{flex:1,padding:"13px 0",borderRadius:12,border:"2px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontWeight:800,fontSize:14,cursor:"pointer"}}>✕ Cancelar</button>
                <button onClick={confirmReenvio.onConfirm} style={{flex:1.4,padding:"13px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",boxShadow:"0 4px 14px rgba(249,115,22,0.4)"}}>{confirmReenvio.acaoLabel||"📲 Reenviar"}</button>
              </div>
            </div>
          </div>
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
                <b>Device ID:</b> <span style={{userSelect:"all",background:"#dcfce7",padding:"1px 6px",borderRadius:4,fontFamily:"monospace",letterSpacing:1}}>{_traccarDevId(usuario&&usuario.id)}</span><br/>
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
                var _agora=new Date().toISOString();
                var _isAgenda=agenda.some(function(a){return a.id===_mId;});
                if(_isAgenda){
                  // Item veio da agenda: marcar agenda como concluída + criar registro em mudancas
                  setAgenda(function(prev){return prev.map(function(a){return a.id===_mId?{...a,status:"concluida"}:a;});});
                  fetch(SUPA_URL+"/rest/v1/agenda?id=eq."+_mId,{method:"PATCH",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({status:"concluida"})}).catch(function(e){console.warn("agenda status patch:",e);});
                  var _agItem=agenda.find(function(a){return a.id===_mId;});
                  if(_agItem){
                    var _novaM={nome:_agItem.nome,selo:_agItem.selo||"",comunidade:_agItem.comunidade||"",data:_agItem.data,origem:_agItem.origem||"",destino:_agItem.destino||"",contato:_agItem.contato||null,van:_agItem.van||false,caminhao:_agItem.caminhao||false,medicao:parseFloat(_agItem.medicao)||0,ajudantes:parseInt(_agItem.ajudantes)||0,observacao:_agItem.observacao||"",status:"Concluído",signature_data:_sigB64,assinado_em:_agora,motorista_van_id:_agItem.motorista_van_id||null,motorista_caminhao_id:_agItem.motorista_caminhao_id||null,supervisor_id:_agItem.supervisor_id||null,approved_by_admin:_agItem.approved_by_admin||null,approved_by_social:_agItem.approved_by_social||null,approved_by_promorar:_agItem.approved_by_promorar||null,approved_by_supervisor:_agItem.approved_by_supervisor||null};
                    fetch(SUPA_URL+"/rest/v1/mudancas",{method:"POST",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(_novaM)}).then(function(r){return r.json();}).then(function(d){if(Array.isArray(d)&&d[0]){setMudancas(function(prev){return[d[0]].concat(prev);});}}).catch(function(e){console.warn("create mud from agenda:",e);});
                  }
                } else {
                  // Item já existe em mudancas: PATCH direto com signature_data + assinado_em
                  setMudancas(function(prev){return prev.map(function(m){return m.id===_mId?{...m,status:"Concluído",signature_data:_sigB64,assinado_em:_agora}:m;});});
                  fetch(SUPA_URL+"/rest/v1/mudancas?id=eq."+_mId,{method:"PATCH",headers:{...getH(),"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({status:"Concluído",signature_data:_sigB64,assinado_em:_agora})}).catch(function(e){console.warn("sig patch:",e);});
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
              {!isSocial&&_row("Medição",v.medicao?v.medicao+" m³":"","📐")}
              {_row("Van",v.van?"Sim":"Não","🚐")}
              {_row("Caminhão",v.caminhao?"Sim":"Não","🚚")}
              {_row("Status",v.status,"📌")}
              {_row("Observação",v.observacao,"📝")}
              {(function(){var _sup=v.supervisor_id?listaUsuarios.find(function(u){return u.id===v.supervisor_id;}):null;return _row("Supervisor",_sup?_sup.nome:null,"👷");})()}
              {(function(){var _mv=v.motorista_van_id?listaUsuarios.find(function(u){return u.id===v.motorista_van_id;}):null;return _row("Motorista Van",_mv?_mv.nome+(_mv.placa_veiculo?" · "+_mv.placa_veiculo:""):null,"🚐");})()}
              {(function(){var _mc=v.motorista_caminhao_id?listaUsuarios.find(function(u){return u.id===v.motorista_caminhao_id;}):null;return _row("Motorista Caminhão",_mc?_mc.nome+(_mc.placa_veiculo?" · "+_mc.placa_veiculo:""):null,"🚚");})()}
              {_row("Criado por",v.created_by,"✍️")}
              {_row("Perfil criador",v.creator_role,"🔑")}
              {_row("Criado em",v.criado_em?new Date(v.criado_em).toLocaleString("pt-BR"):null,"🕐")}
              <div style={{borderTop:"1px solid #e2e8f0",marginTop:10,paddingTop:8,fontSize:11,color:"#475569"}}>
                <div style={{fontWeight:700,marginBottom:4}}>Aprovações:</div>
                <div style={{marginBottom:2}}>Admin: {v.approved_by_admin?<b style={{color:"#16a34a"}}>✅ {v.approved_by_admin}</b>:<span style={{color:"#9ca3af"}}>⏳ Pendente</span>}</div>
                <div style={{marginBottom:2}}>Social: {v.approved_by_social?<b style={{color:"#16a34a"}}>✅ {v.approved_by_social}</b>:<span style={{color:"#9ca3af"}}>⏳ Pendente</span>}</div>
                <div>Promorar: {v.approved_by_promorar?<b style={{color:"#16a34a"}}>✅ {v.approved_by_promorar}</b>:<span style={{color:"#9ca3af"}}>⏳ Pendente</span>}</div>
              </div>
              {/* ── TIMELINE DE ATIVIDADES ── */}
              {(function(){
                var _tlFmt=function(ts){if(!ts)return null;var d=new Date(ts);if(isNaN(d.getTime()))return null;var _p=function(n){return String(n).padStart(2,"0");};return _p(d.getDate())+"/"+_p(d.getMonth()+1)+" às "+_p(d.getHours())+":"+_p(d.getMinutes());};
                var _durBetween=function(t1,t2){if(!t1||!t2)return null;var d1=new Date(t1);var d2=new Date(t2);if(isNaN(d1)||isNaN(d2))return null;var diffMs=d2-d1;if(diffMs<0)return null;var mins=Math.round(diffMs/60000);if(mins<60)return mins+"min";var h=Math.floor(mins/60);var m=mins%60;return h+"h"+(m>0?String(m).padStart(2,"0")+"min":"");};
                var _vanMot=v.motorista_van_id?listaUsuarios.find(function(u){return u.id===v.motorista_van_id;}):null;
                var _camMot=v.motorista_caminhao_id?listaUsuarios.find(function(u){return u.id===v.motorista_caminhao_id;}):null;
                var _supU=v.supervisor_id?listaUsuarios.find(function(u){return u.id===v.supervisor_id;}):null;
                // Build timeline steps from timestamps
                var steps=[];
                // 1. Atribuida (criado_em or approved_by_admin)
                steps.push({icon:"📋",label:"Mudança Atribuída",time:v.criado_em||v.created_at||null,detail:(v.approved_by_admin?"por "+v.approved_by_admin:"")+((_supU||_vanMot||_camMot)?" — "+[_supU?"👷 "+_supU.nome:null,_vanMot?"🚐 "+_vanMot.nome:null,_camMot?"🚚 "+_camMot.nome:null].filter(Boolean).join(", "):"")});
                // 2. Van saiu
                var _vanSaiu=v.inicio_van_em||v.van_saiu_em;
                if(v.motorista_van_id) steps.push({icon:"🚐",label:"Van Saiu p/ Origem",time:_vanSaiu,who:_vanMot?_vanMot.nome:null});
                // 3. Caminhão saiu
                var _camSaiu=v.inicio_caminhao_em||v.caminhao_saiu_em;
                if(v.motorista_caminhao_id) steps.push({icon:"🚚",label:"Caminhão Saiu p/ Origem",time:_camSaiu,who:_camMot?_camMot.nome:null});
                // 4. Chegou origem
                var _chegOrigem=v.chegou_origem_van_em||v.chegou_origem_cam_em;
                if(_vanSaiu||_camSaiu) steps.push({icon:"📍",label:"Chegou na Origem",time:_chegOrigem,dur:_durBetween(_vanSaiu||_camSaiu,_chegOrigem)});
                // 5. Saiu p/ destino (carregamento concluído)
                var _saiuDest=v.saiu_destino_van_em||v.saiu_destino_cam_em;
                if(_chegOrigem||_saiuDest) steps.push({icon:"📦",label:"Carregamento Concluído",time:_saiuDest,dur:_durBetween(_chegOrigem,_saiuDest)});
                // 6. Chegou destino
                var _chegDest=v.chegada_van_em||v.chegada_caminhao_em;
                if(_saiuDest||_chegDest) steps.push({icon:"🏠",label:"Chegou no Destino",time:_chegDest,dur:_durBetween(_saiuDest,_chegDest)});
                // 7. Concluída
                var _concl=v.termino_em||v.termino_van_em||v.termino_caminhao_em;
                var _isConcl2=_concl||["Concluido","Concluído","concluido","concluida","realizado","realizada"].indexOf(v.status)>=0;
                if(_chegDest||_isConcl2) steps.push({icon:"🏁",label:"Mudança Concluída",time:_concl,dur:_durBetween(_chegDest,_concl),detail:v.signature_data?"✍️ Assinatura coletada":null});
                // If no vehicle timestamps, use general status flow
                if(steps.length<=1){
                  if(v.inicio_mudanca_em) steps.push({icon:"🚀",label:"Mudança Iniciada",time:v.inicio_mudanca_em});
                  if(v.status==="Em Deslocamento"||v.status==="Realizando"||v.inicio_mudanca_em) steps.push({icon:"📦",label:"Em Andamento",time:v.inicio_mudanca_em,detail:"Status: "+(v.status||"—")});
                  if(_isConcl2) steps.push({icon:"🏁",label:"Concluída",time:_concl});
                }
                if(steps.length<=1) return null;
                // Determine active index
                var _activeIdx=0;
                for(var si=0;si<steps.length;si++){if(steps[si].time)_activeIdx=si;}
                return(
                  <div style={{borderTop:"2px solid #e2e8f0",marginTop:12,paddingTop:10}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#1e293b",letterSpacing:0.5,marginBottom:12,textTransform:"uppercase"}}>📜 Histórico de Atividades</div>
                    {steps.map(function(step,idx){
                      var isDone=step.time&&idx<_activeIdx;
                      var isActive=step.time&&idx===_activeIdx;
                      var isFuture=!step.time;
                      var dotBg=isDone?"#16a34a":isActive?"#2563eb":"#e2e8f0";
                      var dotBorder=isDone?"#86efac":isActive?"#93c5fd":"#e2e8f0";
                      var dotColor=isDone||isActive?"#fff":"#94a3b8";
                      var titleColor=isDone?"#16a34a":isActive?"#2563eb":"#94a3b8";
                      return(
                        <div key={idx} style={{display:"flex",gap:12,position:"relative"}}>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:24,flexShrink:0}}>
                            <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:isDone?11:12,background:dotBg,color:dotColor,border:"2px solid "+dotBorder,boxShadow:isActive?"0 0 0 4px rgba(37,99,235,0.15)":"none",zIndex:2,flexShrink:0}}>{isDone?"✓":step.icon}</div>
                            {idx<steps.length-1&&<div style={{width:2,flex:1,minHeight:16,background:isDone?"#16a34a":"#e2e8f0"}}></div>}
                          </div>
                          <div style={{flex:1,paddingBottom:idx<steps.length-1?12:0}}>
                            <div style={{fontSize:12,fontWeight:800,color:titleColor}}>{step.label}</div>
                            {step.time&&<div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{_tlFmt(step.time)}{step.who?" — "+step.who:""}{step.dur?<span style={{color:"#059669",fontWeight:700}}>{" · "+step.dur}</span>:""}</div>}
                            {!step.time&&<div style={{fontSize:11,color:"#cbd5e1",marginTop:1}}>Aguardando...</div>}
                            {step.detail&&<div style={{fontSize:10,color:"#64748b",marginTop:3,background:"#f8fafc",borderRadius:6,padding:"3px 7px",display:"inline-block"}}>{step.detail}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
            <InpEndereco label="Origem" icon="📦" value={editMud.origem||""} onChange={v=>setEditMud(f=>({...f,origem:v}))} placeholder="Endereço de origem" mapboxToken={MAPBOX_TOKEN}/>
            <InpEndereco label="Destino" icon="🏠" value={editMud.destino||""} onChange={v=>setEditMud(f=>({...f,destino:v}))} placeholder="Endereço de destino" mapboxToken={MAPBOX_TOKEN}/>
            <Inp label="Medição (m³)" icon="📐" type="number" value={editMud.medicao} onChange={v=>setEditMud(f=>({...f,medicao:v}))} placeholder="Ex: 27"/>
            <Tog label="🚐 Van" value={editMud.van} onChange={v=>setEditMud(f=>({...f,van:v}))}/>
            <Tog label="🚚 Caminhão" value={editMud.caminhao} onChange={v=>setEditMud(f=>({...f,caminhao:v}))}/>
            {isAdmin&&<div style={{marginTop:8,padding:"10px 12px",background:"#fefce8",borderRadius:10,border:"1px solid #fef08a"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:6}}>👷 Qtd. Ajudantes <span style={{fontSize:9,background:"#f59e0b",color:"#fff",borderRadius:4,padding:"1px 5px",marginLeft:4}}>ADMIN</span></div>
              <input type="number" min="0" value={editMud._qtdAj===0?"":editMud._qtdAj||""} onChange={function(e){var raw=e.target.value;setEditMud(function(f){return {...f,_qtdAj:raw===""?"":(parseInt(raw)||0)};});}} style={{width:"100%",padding:"6px 10px",borderRadius:8,border:"1px solid #fcd34d",fontSize:13,fontWeight:600,background:"#fffbeb"}} placeholder="Ex: 3"/>
              <div style={{fontSize:10,color:"#78716c",marginTop:4}}>Apenas administradores podem alterar este valor.</div>
            </div>}
            {isAdmin&&(editMud.inicio_van_em||editMud.inicio_caminhao_em||editMud.chegada_van_em||editMud.chegada_caminhao_em||editMud.termino_em||editMud.termino_van_em||editMud.termino_caminhao_em)&&(
              <div style={{marginTop:12,padding:"12px 14px",background:"#fef2f2",borderRadius:10,border:"1.5px solid #fecaca"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#991b1b",marginBottom:4}}>🔄 Resetar Timeline <span style={{fontSize:9,background:"#dc2626",color:"#fff",borderRadius:4,padding:"1px 5px",marginLeft:4}}>ADMIN</span></div>
                <div style={{fontSize:10,color:"#7f1d1d",marginBottom:8,lineHeight:1.4}}>Apaga TODOS os timestamps de monitoramento (Em Deslocamento, Cheguei na Origem, Rumo ao Destino, etc.) e o status volta pra "confirmado". Use quando a mudança ficou com etapas antigas presas de uma tentativa anterior.</div>
                <button onClick={async function(){
                  if(!window.confirm("⚠️ Resetar Timeline de "+(editMud.nome||"")+"?\n\nTodos os timestamps (Em Deslocamento, Cheguei na Origem, etc.) serão APAGADOS e o status volta pra confirmado.\n\nUse só se a mudança ficou com etapas antigas presas. Não desfaz a mudança, só zera a timeline."))return;
                  await _ensureAuth();
                  var _tbl=editMud._fromAgenda?"agenda":"mudancas";
                  var _payload=Object.assign({status:"confirmado",inicio_em:null,termino_em:null},_monitorClearFields);
                  try{
                    var _r=await fetch(SUPA_URL+"/rest/v1/"+_tbl+"?id=eq."+editMud.id,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_payload)});
                    if(!_r.ok){var _t=await _r.text();throw new Error("HTTP "+_r.status+": "+_t.substring(0,200));}
                    if(_tbl==="agenda"){
                      setAgenda(function(prev){return prev.map(function(a){return a.id===editMud.id?Object.assign({},a,_payload):a;});});
                    }else{
                      setMudancas(function(prev){return prev.map(function(m){return m.id===editMud.id?Object.assign({},m,_payload):m;});});
                    }
                    var _outraTbl=_tbl==="agenda"?"mudancas":"agenda";
                    try{
                      await fetch(SUPA_URL+"/rest/v1/"+_outraTbl+"?nome=eq."+encodeURIComponent(editMud.nome||"")+"&data=eq."+editMud.data,{method:"PATCH",headers:Object.assign({},getH(),{"Content-Type":"application/json","Prefer":"return=minimal"}),body:JSON.stringify(_payload)});
                    }catch(_e){}
                    setSyncStatus("🔄 Timeline resetada: "+(editMud.nome||""));
                    setTimeout(function(){setSyncStatus("✅ Sincronizado");},3000);
                    setEditMud(null);
                  }catch(e){alert("Erro ao resetar timeline:\n"+e.message);}
                }} style={{width:"100%",padding:"10px 0",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>🔄 Resetar Timeline</button>
              </div>
            )}
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
      {editAg&&(podeEditar||isSocial)&&(
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
              <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{aj.nome}</div>{aj.telefone&&<div style={{fontSize:11,color:"#64748b"}}>📞 {aj.telefone}</div>}{aj.pix&&<div style={{fontSize:11,color:"#64748b"}}>💳 {aj.pix}</div>}</div>
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
    {/* ══ MODAL SOLICITAR PENDÊNCIA ══ */}
    {pendModal&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setPendModal(null);setPendMotivo("");}}>
        <div style={{background:"#fff",borderRadius:16,padding:"24px 20px",width:"100%",maxWidth:380}} onClick={function(e){e.stopPropagation();}}>
          <div style={{fontSize:16,fontWeight:900,color:"#b45309",marginBottom:14}}>⏳ {isAdmin?"Mover para Pendente":"Solicitar Pendência"}</div>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:4}}>📦 {pendModal.nome}</div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>📅 {pendModal.data?fmtDate(pendModal.data):""} · ⏰ {pendModal.horario||"?"}</div>
          {(function(){var _ht=pendModal.historico_tentativas||[];if(_ht.length>0)return <div style={{fontSize:10,color:"#b45309",marginBottom:10,background:"#fef3c7",borderRadius:6,padding:"5px 8px"}}>📜 Esta mudança já teve <strong>{_ht.length}</strong> tentativa{_ht.length>1?"s":""} anterior{_ht.length>1?"es":""}.</div>;return null;})()}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Motivo da pendência:</div>
            <textarea value={pendMotivo} onChange={function(e){setPendMotivo(e.target.value);}} rows={3} placeholder="Ex: Cliente não estava em casa, endereço incorreto..." style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
          </div>
          {!isAdmin&&<div style={{background:"#fef9c3",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#92400e",marginBottom:14}}>O Admin será notificado e precisará autorizar a pendência. Os dados de monitoramento desta tentativa serão salvos no histórico.</div>}
          {isAdmin&&<div style={{background:"#ecfdf5",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#065f46",marginBottom:14}}>Como Admin, a mudança será movida diretamente para Pendente. Os dados de monitoramento desta tentativa serão salvos no histórico.</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){setPendModal(null);setPendMotivo("");}} style={{flex:1,padding:11,borderRadius:10,background:"#f1f5f9",color:"#64748b",fontWeight:700,fontSize:13,border:"none",cursor:"pointer"}}>Voltar</button>
            <button onClick={function(){if(!pendMotivo.trim()){alert("Informe o motivo da pendência.");return;}if(isAdmin){handleMoverPendente(pendModal.id,pendMotivo.trim());setPendModal(null);setPendMotivo("");}else{handleSolicitarPendencia(pendModal.id,pendMotivo.trim());}}} style={{flex:2,padding:11,borderRadius:10,background:"#f59e0b",color:"#fff",fontWeight:900,fontSize:13,border:"none",cursor:"pointer"}}>{isAdmin?"⏳ Mover para Pendente":"📩 Solicitar Pendência"}</button>
          </div>
        </div>
      </div>
    )}
    {reagendarModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setReagendarModal(null);}}><div style={{background:"#fff",borderRadius:20,padding:"28px 24px",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={function(e){e.stopPropagation();}}>
      <div style={{fontSize:28,textAlign:"center",marginBottom:8}}>📅</div>
      <div style={{fontWeight:900,fontSize:17,color:"#1e293b",textAlign:"center",marginBottom:4}}>Reagendar Mudança</div>
      <div style={{fontSize:13,color:"#64748b",textAlign:"center",marginBottom:16}}>{reagendarModal.nome}</div>
      <div style={{marginBottom:12}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Nova Data *</label>
        <input type="date" value={reagendarData} onChange={function(e){setReagendarData(e.target.value);}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,boxSizing:"border-box",color:"#1e293b"}} />
      </div>
      <div style={{marginBottom:16}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Motivo *</label>
        <select value={reagendarMotivo} onChange={function(e){setReagendarMotivo(e.target.value);}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box",color:"#1e293b",marginBottom:8}}>
          <option value="">Selecione o motivo...</option>
          <option value="Cliente ausente">Cliente ausente</option>
          <option value="Chuva/clima">Chuva / Condições climáticas</option>
          <option value="Veículo quebrado">Veículo quebrado</option>
          <option value="Falta de equipe">Falta de equipe</option>
          <option value="Solicitação do cliente">Solicitação do cliente</option>
          <option value="Endereço incorreto">Endereço incorreto</option>
          <option value="Problema de acesso">Problema de acesso no local</option>
          <option value="Outro">Outro</option>
        </select>
        {reagendarMotivo==="Outro"&&<input type="text" placeholder="Descreva o motivo..." value={""} onChange={function(e){setReagendarMotivo(e.target.value);}} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,boxSizing:"border-box"}} />}
      </div>
      {reagendarModal.data&&<div style={{background:"#fef3c7",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#92400e"}}><strong>Data atual:</strong> {(function(){var p=reagendarModal.data.split("-");return p[2]+"/"+p[1]+"/"+p[0];})()}{reagendarData&&" → "}{reagendarData&&<strong style={{color:"#1e40af"}}>{(function(){var p=reagendarData.split("-");return p[2]+"/"+p[1]+"/"+p[0];})()}</strong>}</div>}
      <div style={{display:"flex",gap:10}}>
        <button onClick={function(){setReagendarModal(null);}} style={{flex:1,padding:"11px 0",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button>
        <button onClick={function(){if(!reagendarData){alert("Selecione a nova data.");return;}if(!reagendarMotivo){alert("Selecione o motivo.");return;}handleReagendar(reagendarModal.id,reagendarData,reagendarMotivo);}} disabled={!reagendarData||!reagendarMotivo} style={{flex:2,padding:"11px 0",borderRadius:12,border:"none",background:reagendarData&&reagendarMotivo?"#2563eb":"#94a3b8",color:"#fff",fontWeight:900,fontSize:13,cursor:reagendarData&&reagendarMotivo?"pointer":"not-allowed"}}>📅 Reagendar</button>
      </div>
    </div></div>}
        {cadastroWarnings&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){if(cadastroWarnings.onCancel)cadastroWarnings.onCancel();}}><div style={{background:"#fff",borderRadius:20,padding:"22px",maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{fontSize:30}}>⚠️</div>
            <div>
              <div style={{fontWeight:900,fontSize:15,color:"#92400e"}}>Atenção — revise antes de salvar</div>
              <div style={{fontSize:11,color:"#64748b"}}>{cadastroWarnings.warnings.length} item(s) suspeito(s)</div>
            </div>
          </div>
          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"10px 12px",marginBottom:14}}>
            {cadastroWarnings.warnings.map(function(w,i){return <div key={i} style={{fontSize:12,color:"#78350f",padding:"4px 0",borderBottom:i<cadastroWarnings.warnings.length-1?"1px solid #fde68a":"none"}}>{w.msg}</div>;})}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={function(){if(cadastroWarnings.onCancel)cadastroWarnings.onCancel();}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:800,fontSize:13,cursor:"pointer"}}>↩️ Voltar e corrigir</button>
            <button onClick={function(){if(cadastroWarnings.onConfirm)cadastroWarnings.onConfirm();}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:"#f59e0b",color:"#fff",fontWeight:900,fontSize:13,cursor:"pointer"}}>✅ Salvar assim</button>
          </div>
        </div></div>}
        {confirmDelete&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setConfirmDelete(null);setConfirmDeleteMotivo("");}}><div style={{background:"#fff",borderRadius:20,padding:"24px 22px",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{fontSize:32}}>⚠️</div>
            <div>
              <div style={{fontWeight:900,fontSize:16,color:"#dc2626"}}>Apagar {confirmDelete.tipo==="mud"?"mudança":"agenda"}?</div>
              <div style={{fontSize:11,color:"#64748b"}}>Ação reversível só via Auditoria</div>
            </div>
          </div>
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,color:"#7f1d1d"}}>👤 {confirmDelete.nome}</div>
            {confirmDelete.data&&<div style={{fontSize:11,color:"#991b1b",marginTop:2}}>📅 {String(confirmDelete.data).split("-").reverse().join("/")}{confirmDelete.status?" · "+confirmDelete.status:""}</div>}
            {confirmDelete.medicao!=null&&Number(confirmDelete.medicao)>0&&<div style={{fontSize:11,color:"#991b1b",marginTop:2}}>📐 {confirmDelete.medicao} m³</div>}
          </div>
          <div style={{fontSize:11,fontWeight:700,color:"#dc2626",marginBottom:6}}>Motivo da exclusão * <span style={{color:"#94a3b8",fontWeight:500}}>(mín. 5 caracteres)</span></div>
          <input type="text" value={confirmDeleteMotivo} onChange={function(e){setConfirmDeleteMotivo(e.target.value);}} placeholder="Ex: morador cancelou, duplicata, ..." style={{width:"100%",padding:"10px 12px",border:"1.5px solid #fca5a5",borderRadius:10,fontSize:13,boxSizing:"border-box",marginBottom:14}} autoFocus/>
          <div style={{display:"flex",gap:10}}>
            <button onClick={function(){setConfirmDelete(null);setConfirmDeleteMotivo("");}} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:800,fontSize:13,cursor:"pointer"}}>Cancelar</button>
            <button disabled={confirmDeleteMotivo.trim().length<5} onClick={function(){
              var _motivo=confirmDeleteMotivo.trim();
              if(_motivo.length<5){alert("Informe o motivo (mín. 5 caracteres).");return;}
              var _cd=confirmDelete;
              if(_cd.tipo==="mud")handleDelMud(_cd.id,_motivo);
              else handleDelAg(_cd.id,_motivo);
              setConfirmDelete(null);setConfirmDeleteMotivo("");
            }} style={{flex:2,padding:"12px 0",borderRadius:12,border:"none",background:confirmDeleteMotivo.trim().length>=5?"#dc2626":"#fca5a5",color:"#fff",fontWeight:900,fontSize:13,cursor:confirmDeleteMotivo.trim().length>=5?"pointer":"not-allowed"}}>🗑️ Apagar</button>
          </div>
        </div></div>}
    {/* ── MODAL TERCEIRIZAR MUDANÇA ── */}
    {terceirizarModal&&(
      <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setTerceirizarModal(null);setTerceirizarSel("");}}>
        <div style={{background:"#fff",borderRadius:20,padding:"24px 20px",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:28,marginBottom:6}}>👩‍⚕️</div>
            <div style={{fontWeight:900,fontSize:16,color:"#1e293b"}}>Terceirizar Mudança</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{terceirizarModal.nome} · {terceirizarModal.data?fmtDate(terceirizarModal.data):""}</div>
          </div>
          {(function(){var _sociais=assistSocialList;
            return _sociais.length>0?(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>📋 Assistente Cadastrada</div>
                <select value={terceirizarSel} onChange={function(e){setTerceirizarSel(e.target.value);}} style={{width:"100%",padding:"11px 12px",borderRadius:10,border:"1.5px solid #e2e8f0",fontSize:13,fontWeight:700,background:"#f8fafc",color:"#1e293b",cursor:"pointer",boxSizing:"border-box"}}>
                  <option value="">Selecione...</option>
                  {_sociais.map(function(s){return <option key={s.id} value={s.nome}>{s.nome}{s.contato?" ("+s.contato+")":""}</option>;})}
                </select>
                <button onClick={function(){if(!terceirizarSel){alert("Selecione uma assistente.");return;}var _su=_sociais.find(function(s){return s.nome===terceirizarSel;});salvarAssistSocial(terceirizarModal.id,terceirizarSel,_su&&_su.contato||"");}} disabled={terceirizarSaving||!terceirizarSel} style={{width:"100%",marginTop:8,padding:"11px 0",borderRadius:10,border:"none",background:terceirizarSel?"#16a34a":"#94a3b8",color:"#fff",fontWeight:800,fontSize:13,cursor:terceirizarSel?"pointer":"not-allowed"}}>
                  {terceirizarSaving?"⏳ Salvando...":"✅ Vincular"}
                </button>
              </div>
            ):(
              <div style={{marginBottom:16,background:"#f1f5f9",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:12,color:"#64748b",fontWeight:600}}>Nenhuma assistente social cadastrada.</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Cadastre na aba 👩‍⚕️ Social.</div>
              </div>
            );
          })()}
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"12px 0"}}>
            <div style={{flex:1,height:1,background:"#e2e8f0"}}></div>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8"}}>ou</div>
            <div style={{flex:1,height:1,background:"#e2e8f0"}}></div>
          </div>
          <button onClick={function(){terceirizarWhatsApp(terceirizarModal);}} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:"#25d366",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 2px 8px rgba(37,211,102,0.3)"}}>
            📲 Enviar no WhatsApp
          </button>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"12px 0"}}>
            <div style={{flex:1,height:1,background:"#e2e8f0"}}></div>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8"}}>ou</div>
            <div style={{flex:1,height:1,background:"#e2e8f0"}}></div>
          </div>
          {!mudLinkToken?(
            <button onClick={function(){gerarLinkMudanca(terceirizarModal.id);}} disabled={mudLinkLoading} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:mudLinkLoading?"#94a3b8":"#7c3aed",color:"#fff",fontWeight:800,fontSize:13,cursor:mudLinkLoading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>
              {mudLinkLoading?"⏳ Gerando...":"🔗 Gerar Link Temporário (24h)"}
            </button>
          ):(
            <div>
              <div style={{background:"#f5f3ff",border:"1.5px solid #c4b5fd",borderRadius:10,padding:"10px 12px",marginBottom:8,fontSize:11,color:"#6d28d9",fontWeight:600,wordBreak:"break-all"}}>
                ✅ Link gerado! Expira em 24h<br/>{location.origin+"/?mm="+mudLinkToken}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={function(){navigator.clipboard.writeText(location.origin+"/?mm="+mudLinkToken);alert("📋 Link copiado!");}} style={{flex:1,padding:10,background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>📋 Copiar</button>
                <button onClick={function(){var url=location.origin+"/?mm="+mudLinkToken;var _ag=terceirizarModal;window.open("https://wa.me/?text="+encodeURIComponent("🏠 *Mudança — Acesso Temporário*\n"+(_ag.nome||"")+" · "+fmtDate(_ag.data)+"\nAcesse o link (válido por 24h):\n"+url+"\n_TELEMIM_"),"_blank");}} style={{flex:1,padding:10,background:"#25d366",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>📲 Zap</button>
              </div>
            </div>
          )}
          <button onClick={function(){setTerceirizarModal(null);setTerceirizarSel("");setMudLinkToken(null);}} style={{width:"100%",marginTop:10,padding:"10px 0",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Fechar
          </button>
        </div>
      </div>
    )}
    </div>
  );
}
