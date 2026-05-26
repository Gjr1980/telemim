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
  var fatBruto=diasU.length*_fv(RULES.van1a)+m3Total*_fv(RULES.medicaoPorM3);
  var imposto=fatBruto*_fv(RULES.imposto);
  var fatLiq=fatBruto-imposto;
  // --- CUSTOS (todas realizadas, não-canceladas, não-pendentes) ---
  var diasDesp=[...new Set(_desp.map(function(m){return m.data;}))];
  var cCam=0;var cVan=0;var cAj=0;var cAlm=0;var cDesp=0;
  var _aj1a=_fv(RULES.aj1a)||80;var _ajAdd=_fv(RULES.ajAdd)||20;
  var _aprovList=(solFin||[]).filter(function(s){return s.status==="aprovado"&&s.tipo==="editar_valor";});
  var _ajMap={};var _camDias=[];var _vanDias=[];
  diasDesp.forEach(function(data){
    var mudDia=_desp.filter(function(m){return m.data===data;});
    var numMud=mudDia.length;
    if(numMud===0) return;
    var cdDia=(cdP||[]).find(function(cd){return cd.data===data;})||{custo_almoco:0,despesa_extra:0};
    // VEÍCULOS: só cobra se teve veículo naquele dia
    var numMudCam=mudDia.filter(function(m){return m.caminhao||m.motorista_caminhao_id;}).length;
    var numMudVan=mudDia.filter(function(m){return m.van||m.motorista_van_id;}).length;
    if(numMudCam>0){var camVal=_calcDiario(numMudCam,0,"caminhao",RULES);cCam+=camVal;_camDias.push({data:data,numMud:numMudCam,valor:camVal});}
    if(numMudVan>0){var vanVal=_calcDiario(numMudVan,0,"van",RULES);cVan+=vanVal;_vanDias.push({data:data,numMud:numMudVan,valor:vanVal});}
    // AJUDANTES: só se tem equipe_dia (sem fallback inventado)
    var _eqDia=(eqDiaP||[]).find(function(e){return e.data===data&&Array.isArray(e.ajudantes)&&e.ajudantes.length>0;});
    if(_eqDia){
      var valPorAj=_aj1a+Math.max(0,numMud-1)*_ajAdd;
      _eqDia.ajudantes.forEach(function(aj){
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
    cCam,cVan,cAj,cAlm,cDesp,cExtra,despTotal,
    fatBruto,fatLiq,imposto,lucroLiq,
    numMud:mudP.length,numMudDesp:_desp.length,m3Total,diasU,diasDesp,numVan,
    detAjudantes:_ajMap,detCamDias:_camDias,detVanDias:_vanDias
  };
}
