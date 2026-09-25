/* cloud.js — auto-sync page state ขึ้น GitHub secret Gist (ฟรี)
   ตั้งครั้งแรก: คลิกปุ่ม ☁️ → วาง PAT (scope: gist) → ใส่ Gist ID หรือเว้นว่างเพื่อสร้างใหม่
   token/id เก็บใน localStorage ของเบราว์เซอร์นี้เท่านั้น ไม่ได้อยู่ในโค้ด
   ทุกหน้าที่เปิด: ดึง state ล่าสุดจาก cloud (ตัวที่ใหม่กว่าชนะ) + บันทึกกลับอัตโนมัติหลังแก้ */
(function(){
  var KEYS=["afk9","afk_wl_v2","afk_rc_v1"];
  var K_TOK="cloud_tok", K_GIST="cloud_gist";
  var raw=function(k){return localStorage.getItem(k)};
  var origSet=localStorage.setItem.bind(localStorage);
  var timer=null;
  function ts(k){return parseInt(localStorage.getItem(k+"__ts")||"0",10);}
  // hook: ทุก setItem ของ state → เวลา + debounce save (หน้าเดิมไม่ต้องแก้โค้ด)
  localStorage.setItem=function(k,v){
    origSet(k,v);
    if(KEYS.indexOf(k)>=0){origSet(k+"__ts",String(Date.now()));schedule();}
  };
  function payload(){
    var d={},t={};
    KEYS.forEach(function(k){var v=raw(k);if(v!==null){d[k]=v;t[k]=ts(k);}});
    return JSON.stringify({d:d,t:t});
  }
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(save,1500);}
  function api(method,path,body){
    return fetch("https://api.github.com"+path,{method:method,headers:{
      "Authorization":"token "+raw(K_TOK),"Accept":"application/vnd.github+json"},
      body:body?JSON.stringify(body):undefined})
      .then(function(r){if(!r.ok)throw new Error(method+" "+path+" -> "+r.status);return r.json();});
  }
  function save(){
    var tok=raw(K_TOK),g=raw(K_GIST);if(!tok||!g)return;
    api("PATCH","/gists/"+g,{files:{"afk-state.json":{content:payload()}}})
      .then(function(){ui("ok");})
      .catch(function(e){ui("err");console.warn("[cloud] save failed",e);});
  }
  function load(){
    var tok=raw(K_TOK),g=raw(K_GIST);if(!tok||!g)return;
    api("GET","/gists/"+g).then(function(j){
      var f=j.files&&j.files["afk-state.json"];if(!f||!f.content)return;
      var p;try{p=JSON.parse(f.content);}catch(e){return;}
      Object.keys(p.d||{}).forEach(function(k){
        if(KEYS.indexOf(k)<0)return;
        if((p.t[k]||0)>ts(k)){origSet(k,p.d[k]);origSet(k+"__ts",String(p.t[k]||0));}
      });
      ui("ok");
    }).catch(function(e){ui("err");console.warn("[cloud] load failed",e);});
  }
  function setup(){
    var t=prompt("GitHub token (gist scope) — เก็บเฉพาะในเบราว์เซอร์นี้:",raw(K_TOK)||"");
    if(t===null)return;
    if(t.trim())origSet(K_TOK,t.trim());
    var g=prompt("Gist ID (เว้นว่าง = สร้างใหม่):",raw(K_GIST)||"");
    if(g===null)return;
    if(g.trim()){
      origSet(K_GIST,g.trim());load();
    }else{
      api("POST","/gists",{public:false,description:"afk-tracker state",
        files:{"afk-state.json":{content:payload()}}})
        .then(function(j){origSet(K_GIST,j.id);ui("ok");console.info("[cloud] gist:",j.id);})
        .catch(function(e){ui("err");console.warn("[cloud] create failed",e);});
    }
  }
  function ui(state){
    if(!btn)return;
    btn.textContent=(state==="ok"?"☁️✓":state==="err"?"☁️✗":"☁️");
    btn.title=state==="ok"?"cloud: synced":state==="err"?"cloud: error — คลิกตั้งค่าใหม่":"cloud: ยังไม่ได้ตั้งค่า";
  }
  var btn=null;
  document.addEventListener("DOMContentLoaded",function(){
    btn=document.createElement("button");
    btn.textContent="☁️";btn.title="cloud sync — คลิกเพื่อตั้งค่า";
    btn.style.cssText="position:fixed;right:12px;bottom:12px;z-index:999;width:34px;height:34px;"+
      "border-radius:50%;border:1px solid #3a4a5a;background:#1a2940;color:#e0e0e0;cursor:pointer;font-size:15px";
    btn.onclick=function(){if(raw(K_TOK)&&raw(K_GIST))save();else setup();};
    document.body.appendChild(btn);
    ui(raw(K_TOK)&&raw(K_GIST)?(timer?"wait":"ok"):"none");
    load();
  });
})();
