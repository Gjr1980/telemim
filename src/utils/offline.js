// ── OFFLINE CACHE (IndexedDB) ─────────────────────────────────────────────────
const IDB_NAME="telemim_offline";const IDB_VER=1;
function openIDB(){return new Promise(function(resolve,reject){var req=indexedDB.open(IDB_NAME,IDB_VER);req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains("cache"))db.createObjectStore("cache");};req.onsuccess=function(e){resolve(e.target.result);};req.onerror=function(){reject();};});}

export async function idbSet(key,val){try{var db=await openIDB();var tx=db.transaction("cache","readwrite");tx.objectStore("cache").put(val,key);await new Promise(function(r){tx.oncomplete=r;});}catch(e){}}
export async function idbGet(key){try{var db=await openIDB();var tx=db.transaction("cache","readonly");var req=tx.objectStore("cache").get(key);return new Promise(function(r){req.onsuccess=function(){r(req.result||null);};req.onerror=function(){r(null);};});}catch(e){return null;}}

// ── OFFLINE SYNC QUEUE ────────────────────────────────────────────────────────
export async function addToSyncQueue(op){try{var q=await idbGet("syncQueue")||[];q.push(op);await idbSet("syncQueue",q);}catch(e){}}
export async function processSyncQueue(){
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
