/* cloud.js — ซิงก์ข้อมูลหน้า (afk9 / afk_wl_v2 / afk_rc_v1) กับไฟล์ data.js ใน repo
   เปิดหน้า: seed จาก data.js → localStorage (ไฟล์ใหม่กว่า = แทนที่ / localStorage ใหม่กว่า = งานที่ยังไม่ได้เซฟ เก็บไว้)
   เซฟ: ปุ่ม 💾 → File System Access API เขียนทับ data.js โดยตรง (Chrome/Edge)
        เบราว์เซอร์ไม่รองรับ / ยังไม่ได้เลือกไฟล์ → ดาวน์โหลด data.js แล้วแทนทับเอง
   ไม่มี token ไม่มี cloud — ข้อมูลเดินทางด้วย git (commit data.js แล้ว push) */
(function(){
  var KEYS=["afk9","afk_wl_v2","afk_rc_v1"];
  var raw=function(k){return localStorage.getItem(k);};
  var origSet=localStorage.setItem.bind(localStorage);
  function ts(k){return parseInt(localStorage.getItem(k+"__ts")||"0",10);}

  // ---- seed จาก data.js (รันตอน parse — ต้องมาก่อนสคริปต์ของหน้า) ----
  var D=window.AFK_DATA;
  if(D&&D.d){
    Object.keys(D.d).forEach(function(k){
      if(KEYS.indexOf(k)<0)return;
      var fileTs=parseInt((D.t&&D.t[k])||"0",10);
      if(fileTs>ts(k)){
        try{origSet(k,String(D.d[k]));origSet(k+"__ts",String(fileTs));}catch(e){}
      }
    });
  }

  // ---- hook: setItem ของ state → ตราประทับเวลา + เซฟอัตโนมัติ (debounce 1.5s) ----
  var timer=null;
  localStorage.setItem=function(k,v){
    origSet(k,v);
    if(KEYS.indexOf(k)>=0){origSet(k+"__ts",String(Date.now()));schedule();}
  };
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(save,1500);}
  function payload(){
    var d={},t={};
    KEYS.forEach(function(k){var v=raw(k);if(v!==null){d[k]=v;t[k]=ts(k);}});
    return "window.AFK_DATA="+JSON.stringify({v:1,savedAt:Date.now(),d:d,t:t})+";";
  }

  // ---- handle ที่ผู้ใช้เลือกไว้ (จำผ่าน IndexedDB ถ้า browser อนุญาต) ----
  var handle=null;
  function idb(){return new Promise(function(res,rej){
    try{var r=indexedDB.open("afk-tracker");
      r.onupgradeneeded=function(){r.result.createObjectStore("h");};
      r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};
    }catch(e){rej(e);}});}
  function idbGet(){return idb().then(function(db){return new Promise(function(res){
    var q=db.transaction("h","readonly").objectStore("h").get("f");
    q.onsuccess=function(){res(q.result||null);};q.onerror=function(){res(null);};});}).catch(function(){return null;});}
  function idbSet(h){idb().then(function(db){try{
    db.transaction("h","readwrite").objectStore("h").put(h,"f");}catch(e){}}).catch(function(){});}

  function writeWith(h){return h.createWritable().then(function(w){
    return w.write(payload()).then(function(){return w.close();});});}

  function save(){
    if(!handle){ui("pick");return;} // ยังไม่เคยเลือกไฟล์ → รอคลิก 💾
    if(!handle.queryPermission){ui("pick");return;}
    handle.queryPermission({mode:"readwrite"}).then(function(p){
      if(p==="granted"){writeWith(handle).then(function(){ui("ok");},function(e){ui(errName(e));});}
      else{ui("pick");} // หมดสิทธิ์ → รอคลิกเพื่อขอใหม่
    }).catch(function(){ui("pick");});
  }
  function errName(e){return (e&&e.name==="SecurityError")?"dl":"err";}

  function pickAndSave(){
    var go=function(){
      showSaveFilePicker({suggestedName:"data.js",
        types:[{description:"JavaScript",accept:{"text/javascript":[".js"]}}]}).then(function(h){
        handle=h;idbSet(h);
        return writeWith(h).then(function(){ui("ok");});
      }).catch(function(e){
        if(e&&e.name==="AbortError")return;
        if(errName(e)==="dl"){downloadFile();}else{ui("err");console.warn("[save]",e);}
      });
    };
    if(handle&&handle.requestPermission){
      handle.requestPermission({mode:"readwrite"}).then(function(p){
        if(p==="granted"){writeWith(handle).then(function(){ui("ok");},function(){go();});}
        else{go();}
      }).catch(go);
    }else{go();}
  }
  function downloadFile(){
    try{
      var b=new Blob([payload()+"\n"],{type:"text/javascript"});
      var a=document.createElement("a");
      a.href=URL.createObjectURL(b);a.download="data.js";
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(a.href);},5000);
      ui("dl");
    }catch(e){ui("err");console.warn("[save]",e);}
  }

  // ---- ปุ่ม 💾 ----
  var btn=null;
  function ui(state){
    if(!btn)return;
    var d=new Date().toTimeString().slice(0,5);
    btn.textContent=state==="ok"?"💾✓":state==="err"?"💾✗":state==="wait"?"💾…":
                    state==="dl"?"💾↓":state==="pick"?"💾":"💾";
    btn.title=state==="ok"?"data.js บันทึกแล้ว "+d+" (คลิกเพื่อบันทึกตอนนี้)"
      :state==="err"?"data.js ERROR — ดู console (F12)"
      :state==="dl"?"ดาวน์โหลด data.js แล้ว — นำไปแทนทับไฟล์ใน repo แล้ว commit"
      :state==="pick"?"data.js — คลิกเพื่อเลือกไฟล์/บันทึก"
      :"data.js — ยังไม่มีการแก้ไข";
  }
  document.addEventListener("DOMContentLoaded",function(){
    btn=document.createElement("button");
    btn.style.cssText="position:fixed;right:12px;bottom:12px;z-index:999;width:34px;height:34px;"+
      "border-radius:50%;border:1px solid #3a4a5a;background:#1a2940;color:#e0e0e0;cursor:pointer;font-size:15px";
    btn.onclick=function(){ if(window.showSaveFilePicker){pickAndSave();}else{downloadFile();} };
    document.body.appendChild(btn);
    ui("none");
    idbGet().then(function(h){
      if(!h)return;
      handle=h;
      if(h.queryPermission){
        h.queryPermission({mode:"readwrite"}).then(function(p){ui(p==="granted"?"none":"pick");}).catch(function(){ui("pick");});
      }else{ui("pick");}
    });
  });
})();
