// ── OFFLINE CACHE (IndexedDB) ─────────────────────────────────────────────────
const IDB_NAME="telemim_offline";const IDB_VER=1;
function openIDB(){return new Promise(function(resolve,reject){var req=indexedDB.open(IDB_NAME,IDB_VER);req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains("cache"))db.createObjectStore("cache");};req.onsuccess=function(e){resolve(e.target.result);};req.onerror=function(){reject();};});}

export async function idbSet(key,val){try{var db=await openIDB();var tx=db.transaction("cache","readwrite");tx.objectStore("cache").put(val,key);await new Promise(function(r){tx.oncomplete=r;});}catch(e){}}
export async function idbGet(key){try{var db=await openIDB();var tx=db.transaction("cache","readonly");var req=tx.objectStore("cache").get(key);return new Promise(function(r){req.onsuccess=function(){r(req.result||null);};req.onerror=function(){r(null);};});}catch(e){return null;}}

// ── OFFLINE SYNC QUEUE ────────────────────────────────────────────────────────
const _listeners=new Set();
export function onQueueChange(cb){_listeners.add(cb);return function(){_listeners.delete(cb);};}
function _emit(){
  idbGet("syncQueue").then(function(q){
    var n=(q||[]).length;
    _listeners.forEach(function(cb){try{cb(n);}catch(_){}});
    try{window.dispatchEvent(new CustomEvent("sync-queue-change",{detail:{count:n}}));}catch(_){}
  });
}

export async function addToSyncQueue(op){
  try{
    var q=await idbGet("syncQueue")||[];
    op._ts=op._ts||Date.now();
    op._tries=op._tries||0;
    q.push(op);
    await idbSet("syncQueue",q);
    _emit();
  }catch(e){}
}

export async function getSyncQueueCount(){
  var q=await idbGet("syncQueue");
  return (q||[]).length;
}

export async function clearSyncQueue(){
  await idbSet("syncQueue",[]);
  _emit();
}

let _processing=false;
export async function processSyncQueue(){
  if(_processing) return {ok:0,failed:0,skipped:0};
  if(!navigator.onLine) return {ok:0,failed:0,skipped:0,offline:true};
  _processing=true;
  var q=await idbGet("syncQueue");
  if(!q||q.length===0){_processing=false;return {ok:0,failed:0,skipped:0};}
  var failed=[];
  var ok=0;
  for(var i=0;i<q.length;i++){
    var op=q[i];
    try{
      var r=await fetch(op.url,{method:op.method,headers:op.headers,body:op.body?(typeof op.body==="string"?op.body:JSON.stringify(op.body)):undefined});
      if(r.ok) ok++;
      else {
        op._tries=(op._tries||0)+1;
        if(op._tries<10) failed.push(op);
        else try{window.Sentry&&window.Sentry.captureMessage("[sync] op descartada após 10 tries",{tags:{op:"processSyncQueue"},extra:{op:op}});}catch(_){}
      }
    }catch(e){
      op._tries=(op._tries||0)+1;
      if(op._tries<10) failed.push(op);
    }
  }
  await idbSet("syncQueue",failed);
  _emit();
  _processing=false;
  return {ok:ok,failed:failed.length,skipped:0};
}

if(typeof window!=="undefined"){
  window.addEventListener("online",function(){setTimeout(processSyncQueue,2000);});
  setInterval(function(){if(navigator.onLine)processSyncQueue();},60000);
}

export async function fetchWithQueue(url,opts,bodyForQueue){
  try{
    var r=await fetch(url,opts);
    if(r.ok) return {ok:true,response:r};
    return {ok:false,response:r,status:r.status};
  }catch(e){
    await addToSyncQueue({url:url,method:opts.method||"GET",headers:opts.headers,body:bodyForQueue||opts.body});
    return {ok:false,error:e,queued:true};
  }
}
