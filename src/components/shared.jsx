import { useState, useRef, useEffect } from "react";
import { COLORS } from "../config/constants.js";

export function Badge({children,color=COLORS.accent}){
  return <span style={{background:color+"18",color,border:`1px solid ${color}33`,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
}
export function Card({children,style={}}){
  return <div style={{background:COLORS.card,border:`1px solid ${COLORS.cardBorder}`,borderRadius:16,padding:18,boxShadow:COLORS.shadow,...style}}>{children}</div>;
}
export function Inp({label,type="text",value,onChange,placeholder,icon}){
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

export function InpEndereco({label,value,onChange,placeholder,icon,mapboxToken}){
  var [sugestoes,setSugestoes]=useState([]);
  var [show,setShow]=useState(false);
  var timerRef=useRef(null);
  var wrapRef=useRef(null);

  useEffect(function(){
    function handleClick(e){if(wrapRef.current&&!wrapRef.current.contains(e.target))setShow(false);}
    document.addEventListener("mousedown",handleClick);
    return function(){document.removeEventListener("mousedown",handleClick);};
  },[]);

  function buscar(txt){
    if(timerRef.current)clearTimeout(timerRef.current);
    if(!txt||txt.length<3){setSugestoes([]);setShow(false);return;}
    timerRef.current=setTimeout(function(){
      fetch("https://api.mapbox.com/geocoding/v5/mapbox.places/"+encodeURIComponent(txt)+".json?access_token="+mapboxToken+"&limit=5&country=BR&language=pt&types=address,poi,place,locality,neighborhood")
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.features&&d.features.length>0){
            setSugestoes(d.features.map(function(f){return{place_name:f.place_name,text:f.text};}));
            setShow(true);
          }else{setSugestoes([]);setShow(false);}
        })
        .catch(function(){setSugestoes([]);setShow(false);});
    },400);
  }

  return(
    <div style={{marginBottom:12,position:"relative"}} ref={wrapRef}>
      <label style={{display:"block",color:COLORS.muted,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:5,textTransform:"uppercase"}}>{icon} {label}</label>
      <input type="text" value={value} placeholder={placeholder}
        onChange={function(e){onChange(e.target.value);buscar(e.target.value);}}
        onFocus={function(){if(sugestoes.length>0)setShow(true);}}
        style={{width:"100%",background:COLORS.inputBg,border:"1.5px solid "+COLORS.cardBorder,borderRadius:10,color:COLORS.text,padding:"10px 13px",fontSize:14,outline:"none",boxSizing:"border-box"}}
        onFocuCapture={function(e){e.target.style.border="1.5px solid "+COLORS.accent;}}
      />
      {show&&sugestoes.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:"#fff",border:"1.5px solid "+COLORS.cardBorder,borderRadius:10,marginTop:2,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",maxHeight:220,overflowY:"auto"}}>
          {sugestoes.map(function(s,i){
            return(
              <div key={i} onClick={function(){onChange(s.place_name);setShow(false);setSugestoes([]);}}
                style={{padding:"10px 13px",cursor:"pointer",borderBottom:i<sugestoes.length-1?"1px solid #f1f5f9":"none",fontSize:13,color:COLORS.text,transition:"background 0.15s"}}
                onMouseEnter={function(e){e.target.style.background="#f0f9ff";}}
                onMouseLeave={function(e){e.target.style.background="#fff";}}>
                <span style={{marginRight:6,fontSize:14}}>📍</span>{s.place_name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Notification sound system
var _audioCtx=null;
function _getAudioCtx(){
  if(!_audioCtx){try{_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}
  return _audioCtx;
}
export function playNotifSound(type){
  var ctx=_getAudioCtx();
  if(!ctx)return;
  try{
    if(ctx.state==="suspended")ctx.resume();
    var osc=ctx.createOscillator();
    var gain=ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if(type==="insert"){
      // Single ding - 800Hz 0.25s
      osc.frequency.setValueAtTime(800,ctx.currentTime);
      gain.gain.setValueAtTime(0.3,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.25);
    }else if(type==="concluida"){
      // Double ding-dong - 600Hz then 800Hz
      osc.frequency.setValueAtTime(600,ctx.currentTime);
      osc.frequency.setValueAtTime(800,ctx.currentTime+0.15);
      gain.gain.setValueAtTime(0.3,ctx.currentTime);
      gain.gain.setValueAtTime(0.3,ctx.currentTime+0.15);
      gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.4);
    }else{
      // Short beep for status change
      osc.frequency.setValueAtTime(660,ctx.currentTime);
      gain.gain.setValueAtTime(0.2,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.15);
    }
  }catch(e){}
}

export function Tog({label,value,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <label style={{color:COLORS.muted,fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</label>
      <div onClick={()=>onChange(!value)} style={{width:46,height:25,borderRadius:13,background:value?COLORS.accent:"#cbd5e1",position:"relative",cursor:"pointer",transition:"background 0.3s"}}>
        <div style={{position:"absolute",top:3,left:value?22:3,width:19,height:19,borderRadius:10,background:"#fff",transition:"left 0.3s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
      </div>
    </div>
  );
}
