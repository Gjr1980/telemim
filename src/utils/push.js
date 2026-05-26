import { SUPA_URL, SUPA_KEY } from "../config/supabase.js";
import { VAPID_PUBLIC } from "../config/constants.js";

export function urlBase64ToUint8Array(base64String){var padding="=".repeat((4-base64String.length%4)%4);var base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");var rawData=window.atob(base64);var outputArray=new Uint8Array(rawData.length);for(var i=0;i<rawData.length;++i){outputArray[i]=rawData.charCodeAt(i);}return outputArray;}

export async function subscribePush(userId){
  if(!("serviceWorker" in navigator)||!("PushManager" in window))return null;
  try{
    var reg=await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC)});
    var keys=sub.toJSON();
    await fetch(SUPA_URL+"/rest/v1/push_subscriptions",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({usuario_id:userId,endpoint:keys.endpoint,p256dh:keys.keys.p256dh,auth:keys.keys.auth})});
    return sub;
  }catch(e){return null;}
}

export async function sendPushNotification(userIds,title,body){
  try{
    await fetch(SUPA_URL+"/functions/v1/send-push",{method:"POST",headers:{"apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY,"Content-Type":"application/json"},body:JSON.stringify({user_ids:userIds,title:title,body:body})});
  }catch(e){}
}
