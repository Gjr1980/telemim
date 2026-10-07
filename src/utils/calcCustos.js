// ============================================================
// AGENTE DE PRECIFICAÇÃO — Fonte Única da Verdade
// Calcula o custo de UM DIA para UMA categoria
// Regras escalonadas exactas conforme aba Config > Regras
// ============================================================
export function _calcDiario(numMud, numAj, cargo, RULES){
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
// mudP = concluídas (para receita), mudDesp = todas agendadas (para despesas)
// eqDiaP = equipe_dia list (fonte primária para qtd ajudantes)
// solFin = solicitacoes_financeiras aprovadas (overrides por ajudante)
export function _calcCustos(mudP, cdP, cpP, RULES, mudDesp, eqDiaP, solFin){
  var _fv=function(v){return parseFloat(v)||0;};
  var _desp=mudDesp||mudP;
  // --- FATURAMENTO (só concluídas) ---
  var diasU=[...new Set(mudP.map(function(m){return m.data;}))];
  var m3Total=mudP.reduce(function(s,m){return s+_fv(m.medicao);},0);
  var numVan=mudP.filter(function(m){return m.van;}).length;
  function _taxaCaminhaoKm(km,RULES){var t=RULES.tabelaCaminhaoKm||[];for(var i=0;i<t.length;i++){if(km<=t[i].ate)return t[i].valor;}return t.length?t[t.length-1].valor:_fv(RULES.medicaoPorM3);}
  function _taxaVanKm(km,RULES){var t=RULES.tabelaVanKm||[];for(var i=0;i<t.length;i++){if(km<=t[i].ate)return t[i].valor;}return t.length?t[t.length-1].valor:0;}
  var _dataCorteKm=RULES.dataInicioTabelaKm||'9999-99-99';
  var _mudAntigasFat=mudP.filter(function(m){return m.data<_dataCorteKm;});
  var _mudNovasFat=mudP.filter(function(m){return m.data>=_dataCorteKm;});
  var _diasAntigosFat=[...new Set(_mudAntigasFat.map(function(m){return m.data;}))];
  var _m3AntigoFat=_mudAntigasFat.reduce(function(s,m){return s+_fv(m.medicao);},0);
  var _fatAntigo=_diasAntigosFat.length*_fv(RULES.van1a)+_m3AntigoFat*_fv(RULES.medicaoPorM3);
  var _fatNovo=_mudNovasFat.reduce(function(s,m){var km=_fv(m.km_calculado);var usaCam=m.caminhao||m.motorista_caminhao_id;var usaVan=m.van||m.motorista_van_id;var v=0;if(usaCam)v+=_fv(m.medicao)*_taxaCaminhaoKm(km,RULES);if(usaVan)v+=_taxaVanKm(km,RULES);return s+v;},0);
  var fatBruto=_fatAntigo+_fatNovo;
  var imposto=fatBruto*_fv(RULES.imposto);
  var fatLiq=fatBruto-imposto;
  // --- CUSTOS (todas realizadas, não-canceladas, não-pendentes) ---
  var diasDesp=[...new Set(_desp.map(function(m){return m.data;}))];
  var cCam=0;var cVan=0;var cAj=0;var cAlm=0;var cDesp=0;var cVanComb=0;
  // Custo da van por placa (KMA1E48 = R$100 motorista + R$100 combustivel por dia). Outras vans: regra geral (vanCusto).
  var _placaPorMot=(typeof window!=="undefined"&&window.__placaPorMotorista)||{};
  var _custoPlaca=RULES.vanCustoPorPlaca||{"KMA1E48":{motorista:100,combustivel:100}};
  var _normPl=function(p){return String(p||"").toUpperCase().replace(/[^A-Z0-9]/g,"");};
  var _aj1a=_fv(RULES.aj1a)||80;var _ajAdd=_fv(RULES.ajAdd)||20;
  var _aprovList=(solFin||[]).filter(function(s){return s.status==="aprovado"&&s.tipo==="editar_valor";});
  var _remDiaList=(solFin||[]).filter(function(s){return s.status==="aprovado"&&s.tipo==="remover_dia";});
  var _remAjList=(solFin||[]).filter(function(s){return s.status==="aprovado"&&s.tipo==="remover_ajudante";});
  var _norm=function(s){return(s||"").toLowerCase().trim();};
  var _remDiaSet={};_remDiaList.forEach(function(s){_remDiaSet[_norm(s.prestador_nome)+"|"+s.data_ref]=true;});
  var _remAjSet={};_remAjList.forEach(function(s){_remAjSet[_norm(s.ajudante_nome)]=true;});
  var _ajMap={};var _camDias=[];var _vanDias=[];
  diasDesp.forEach(function(data){
    var mudDia=_desp.filter(function(m){return m.data===data;});
    var numMud=mudDia.length;
    if(numMud===0) return;
    var cdDia=(cdP||[]).find(function(cd){return cd.data===data;})||{custo_almoco:0,despesa_extra:0};
    // VEÍCULOS: só cobra se teve veículo naquele dia
    var mudCamList=mudDia.filter(function(m){return m.caminhao||m.motorista_caminhao_id;});var numMudCam=mudCamList.length;var _capCam=parseFloat(RULES.capacidadeCaminhaoM3)||32;var _extraViagens=mudCamList.reduce(function(s,m){var med=_fv(m.medicao);var viag=med>_capCam?Math.ceil(med/_capCam):1;return s+Math.max(0,viag-1);},0);var _camAddViagem=_fv(RULES.camAddViagem)||120;
    var numMudVan=mudDia.filter(function(m){return m.van||m.motorista_van_id;}).length;
    if(numMudCam>0){var camVal=_calcDiario(numMudCam,0,"caminhao",RULES)+_extraViagens*_camAddViagem;cCam+=camVal;_camDias.push({data:data,numMud:numMudCam,valor:camVal,extraViagens:_extraViagens});}
    if(numMudVan>0){
      var _vanGrupos={};
      mudDia.filter(function(m){return m.van||m.motorista_van_id;}).forEach(function(m){var _pl=_normPl(_placaPorMot[m.motorista_van_id]);var _g=_custoPlaca[_pl]?_pl:"PADRAO";_vanGrupos[_g]=(_vanGrupos[_g]||0)+1;});
      Object.keys(_vanGrupos).forEach(function(_g){
        var _n=_vanGrupos[_g];
        if(_g!=="PADRAO"){var _cp=_custoPlaca[_g];var _vm=_fv(_cp.motorista),_vc=_fv(_cp.combustivel);var _vv=_vm+_vc;cVan+=_vv;cVanComb+=_vc;_vanDias.push({data:data,numMud:_n,valor:_vv,placa:_g,motorista:_vm,combustivel:_vc});}
        else{var vanVal=_calcDiario(_n,0,"van",RULES);cVan+=vanVal;_vanDias.push({data:data,numMud:_n,valor:vanVal});}
      });
    }
    // AJUDANTES: só se tem equipe_dia (sem fallback inventado)
    var _eqDia=(eqDiaP||[]).find(function(e){return e.data===data&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
    if(_eqDia){
      var valPorAj=_aj1a+Math.max(0,numMud-1)*_ajAdd+_extraViagens*_ajAdd;
      _eqDia.ajudantes.forEach(function(aj){
        var _ajKeyNorm=_norm(aj.nome);
        if(_remAjSet[_ajKeyNorm])return;
        if(_remDiaSet[_ajKeyNorm+"|"+data])return;
        var ajVal=valPorAj;
        var aprov=_aprovList.find(function(s){return s.prestador_nome===aj.nome&&s.data_ref===data;});
        if(aprov){var _nv=parseFloat(aprov.valor_novo);if(!isNaN(_nv))ajVal=_nv;}
        cAj+=ajVal;
        var ajKey=aj.id||aj.nome;
        if(!_ajMap[ajKey])_ajMap[ajKey]={id:aj.id,nome:aj.nome,telefone:aj.telefone||"",dias:[],total:0};
        _ajMap[ajKey].dias.push({data:data,numMud:numMud,valor:ajVal});
        _ajMap[ajKey].total+=ajVal;
      });
    }
    cAlm+=_fv(cdDia.custo_almoco);
    cDesp+=_fv(cdDia.despesa_extra);
  });
  var cExtra=(cpP||[]).reduce(function(s,cp){return s+_fv(cp.valor);},0);
  var despTotal=cCam+cVan+cAj+cAlm+cDesp+cExtra;
  var lucroLiq=fatLiq-despTotal;
  return {
    cCam,cVan,cVanComb,cAj,cAlm,cDesp,cExtra,despTotal,
    fatBruto,fatLiq,imposto,lucroLiq,
    numMud:mudP.length,numMudDesp:_desp.length,m3Total,diasU,diasDesp,numVan,
    detAjudantes:_ajMap,detCamDias:_camDias,detVanDias:_vanDias
  };
}
