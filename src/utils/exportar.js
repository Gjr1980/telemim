import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

// ── EXPORTAÇÃO PDF / EXCEL ──────────────────────────────────────────────────
export function exportarPDF(r, mesLabel, detAjudantes, detCamDias, detVanDias, sistema){
  var doc=new jsPDF();var _fv=function(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);};
  var _p=function(n){return String(n).padStart(2,"0");};
  var _hj=new Date();var _dataGer=_p(_hj.getDate())+"/"+_p(_hj.getMonth()+1)+"/"+_hj.getFullYear();
  doc.setFillColor(30,58,95);doc.rect(0,0,210,35,"F");
  doc.setTextColor(255,255,255);doc.setFontSize(18);doc.setFont("helvetica","bold");
  doc.text((sistema||"Promorar")+" — Fechamento "+mesLabel,14,18);
  doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Gerado em "+_dataGer,14,27);
  doc.setTextColor(0,0,0);var y=45;
  doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("Resumo Financeiro",14,y);y+=10;
  doc.autoTable({startY:y,theme:"grid",headStyles:{fillColor:[30,58,95]},
    head:[["Descrição","Valor"]],
    body:[
      ["Total de Mudanças",String(r.numMud)],["Total m³",r.m3Total.toFixed(1)+" m³"],["Média m³/Mudança",r.numMud>0?(r.m3Total/r.numMud).toFixed(1)+" m³":"0"],
      ["Faturamento Bruto",_fv(r.fatBruto)],["Impostos",_fv(r.imposto)],["Faturamento Líquido",_fv(r.fatLiq)],["",""],
      ["Custo Caminhão",_fv(r.cCam)],["Custo Van",_fv(r.cVan)],["Custo Ajudantes",_fv(r.cAj)],["Custo Supervisor",_fv(r.cSup||0)],["Almoço + Extras",_fv(r.cAlm+r.cDesp)],["Contas a Pagar",_fv(r.cExtra)],
      ["TOTAL DESPESAS",_fv(r.despTotal)],["",""],["LUCRO LÍQUIDO",_fv(r.lucroLiq)],["Margem",r.fatBruto>0?(r.lucroLiq/r.fatBruto*100).toFixed(1)+"%":"0%"]
    ]
  });
  var ajArr=Object.values(detAjudantes||{}).sort(function(a,b){return a.nome.localeCompare(b.nome);});
  if(ajArr.length>0){
    y=doc.lastAutoTable.finalY+12;if(y>250){doc.addPage();y=20;}
    doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("Prestadores — Ajudantes",14,y);y+=8;
    var ajBody=ajArr.map(function(aj){return[aj.nome,String(aj.dias.length),_fv(aj.total)];});
    ajBody.push(["TOTAL",String(ajArr.reduce(function(s,a){return s+a.dias.length;},0)),_fv(ajArr.reduce(function(s,a){return s+a.total;},0))]);
    doc.autoTable({startY:y,theme:"grid",headStyles:{fillColor:[30,58,95]},head:[["Nome","Dias","Valor"]],body:ajBody});
  }
  if((detCamDias||[]).length>0){
    y=doc.lastAutoTable.finalY+12;if(y>250){doc.addPage();y=20;}
    doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("Detalhamento — Caminhão",14,y);y+=8;
    var camBody=(detCamDias||[]).map(function(d){var dp=d.data.split("-");return[(dp[2]||"")+"/"+( dp[1]||""),String(d.numMud),_fv(d.valor)];});
    camBody.push(["TOTAL",String(detCamDias.reduce(function(s,d){return s+d.numMud;},0)),_fv(r.cCam)]);
    doc.autoTable({startY:y,theme:"grid",headStyles:{fillColor:[30,58,95]},head:[["Data","Mudanças","Valor"]],body:camBody});
  }
  if((detVanDias||[]).length>0){
    y=doc.lastAutoTable.finalY+12;if(y>250){doc.addPage();y=20;}
    doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("Detalhamento — Van",14,y);y+=8;
    var vanBody=(detVanDias||[]).map(function(d){var dp=d.data.split("-");return[(dp[2]||"")+"/"+( dp[1]||""),String(d.numMud),_fv(d.valor)];});
    vanBody.push(["TOTAL",String(detVanDias.reduce(function(s,d){return s+d.numMud;},0)),_fv(r.cVan)]);
    doc.autoTable({startY:y,theme:"grid",headStyles:{fillColor:[30,58,95]},head:[["Data","Mudanças","Valor"]],body:vanBody});
  }
  doc.save("fechamento_"+(sistema||"promorar")+"_"+mesLabel.replace(/\s/g,"_").toLowerCase()+".pdf");
}

export function exportarExcel(r, mesLabel, detAjudantes, detCamDias, detVanDias, mudancasMes, sistema){
  var _fv=function(v){return parseFloat((v||0).toFixed(2));};
  var wb=XLSX.utils.book_new();
  var resumo=[
    ["Fechamento "+(sistema||"Promorar")+" — "+mesLabel],
    [],["Descrição","Valor"],
    ["Total de Mudanças",r.numMud],["Total m³",_fv(r.m3Total)],["Média m³/Mudança",r.numMud>0?_fv(r.m3Total/r.numMud):0],
    [],["Faturamento Bruto",_fv(r.fatBruto)],["Impostos",_fv(r.imposto)],["Faturamento Líquido",_fv(r.fatLiq)],
    [],["Custo Caminhão",_fv(r.cCam)],["Custo Van",_fv(r.cVan)],["Custo Ajudantes",_fv(r.cAj)],["Custo Supervisor",_fv(r.cSup||0)],["Almoço + Extras",_fv(r.cAlm+r.cDesp)],["Contas a Pagar",_fv(r.cExtra)],
    ["TOTAL DESPESAS",_fv(r.despTotal)],[],["LUCRO LÍQUIDO",_fv(r.lucroLiq)],["Margem %",r.fatBruto>0?_fv(r.lucroLiq/r.fatBruto*100):0]
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resumo),"Resumo");
  if(mudancasMes&&mudancasMes.length>0){
    var mudRows=[["Data","Cliente","Selo","Origem","Destino","m³","Van","Caminhão","Comunidade","Status"]];
    mudancasMes.forEach(function(m){var dp=(m.data||"").split("-");mudRows.push([(dp[2]||"")+"/"+( dp[1]||"")+"/"+(dp[0]||""),m.nome||"",m.selo||"",m.origem||"",m.destino||"",parseFloat(m.medicao)||0,m.van?"Sim":"Não",m.caminhao||m.motorista_caminhao_id?"Sim":"Não",m.comunidade||"",m.status||""]);});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(mudRows),"Mudanças");
  }
  var ajArr=Object.values(detAjudantes||{}).sort(function(a,b){return a.nome.localeCompare(b.nome);});
  if(ajArr.length>0){
    var ajRows=[["Nome","Dias","Total (R$)"]];
    ajArr.forEach(function(aj){ajRows.push([aj.nome,aj.dias.length,_fv(aj.total)]);});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ajRows),"Ajudantes");
  }
  XLSX.writeFile(wb,"fechamento_"+(sistema||"promorar")+"_"+mesLabel.replace(/\s/g,"_").toLowerCase()+".xlsx");
}
