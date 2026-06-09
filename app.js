// ─── CONFIG ───────────────────────────────────────────────────────────────────
var DRIVE_URL = "https://script.google.com/macros/s/AKfycbwykGh50QuzrF0pDcf-9uLt8yq3GvKi_Ev6ibqCouToBtVMHPAvC6vHpWA1-I73ws2rWQ/exec";
var DAYS_BETWEEN = 3, PAGE_SIZE = 50;
var NOTE_KEY = "gi_notes_v3", OP_KEY = "gi_op_v3", ASSIGN_KEY = "gi_assign_v3", SESSION_KEY = "gi_session_v3";

var STATUS_META = {
  emergenza:    {label:"🚨 Emergenza",    color:"#7F0000",bg:"#FEE2E2",border:"#FCA5A5"},
  mai_chiamato: {label:"Mai chiamato",    color:"#533AB7",bg:"#EEEDFE",border:"#AFA9EC"},
  urgente_boost:{label:"Urgente <3 ch.", color:"#A32D2D",bg:"#FCEBEB",border:"#F09595"},
  urgente:      {label:"Urgente",         color:"#854F0B",bg:"#FAEEDA",border:"#EF9F27"},
  chiamabile:   {label:"Da chiamare",     color:"#3B6D11",bg:"#EAF3DE",border:"#97C459"},
  recente:      {label:"Recente",         color:"#5F5E5A",bg:"#F1EFE8",border:"#B4B2A9"},
  esaurito:     {label:"Max contatti",    color:"#888",   bg:"#F1EFE8",border:"#B4B2A9"},
};
var STAT_DEFS = [
  {key:"tutti",        label:"Totale",         color:"#1a1a1a", field:"totale"},
  {key:"emergenza",    label:"🚨 Emergenza",    color:"#7F0000", field:"emergenza"},
  {key:"mai_chiamato", label:"Mai chiamati",   color:"#533AB7", field:"mai_chiamato"},
  {key:"urgente_boost",label:"Urgenti <3 ch.", color:"#A32D2D", field:"urgente_boost"},
  {key:"chiamabile",   label:"Da chiamare",    color:"#3B6D11", field:"chiamabili"},
];
var COLS = {
  id:"id", giorni_gestione:"in gestione da", giorni_scadenza:"giorni alla scadenza",
  n_chiamate:"nunero chiamate", data_ultima:"ultima chiata", operatore:"gestito da", company:"company"
};
var DCOLS = [
  {key:"_priority",      label:"Prio",          align:"center"},
  {key:"id",             label:"ID",            mono:true, muted:true},
  {key:"company",        label:"Company",       bold:true},
  {key:"operatore",      label:"Operatore"},
  {key:"giorni_scadenza",label:"Scadenza (gg)", align:"center"},
  {key:"n_chiamate",     label:"Chiamate",      align:"center"},
  {key:"data_ultima",    label:"Ultima chiam.", date:true},
  {key:"_status",        label:"Stato",         badge:true},
  {key:"_nota",          label:"Nota",          ns:true},
  {key:"_done",          label:"",              ns:true},
];

// ─── STATO ────────────────────────────────────────────────────────────────────
var S = {
  data:[], fileName:"", operatorList:[], currentOp:null,
  fStatus:"tutti", fOp:"tutti", fCompany:"",
  sortBy:"_priority", sortDir:"asc", page:1, assignLog:0,
  view:"lista", listaTab:null, lavTab:null,
  calY:new Date().getFullYear(), calM:new Date().getMonth(),
};
var NOTES={}, ASSIGNMENTS={}, DONE={};
var _pendingRows=null, _waitTimer=null, _pendingNavCb=null;

// ─── STORAGE ─────────────────────────────────────────────────────────────────
function ls(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
function loadStorage(){
  try{NOTES=JSON.parse(ls(NOTE_KEY)||"{}");}catch(e){NOTES={};}
  try{ASSIGNMENTS=JSON.parse(ls(ASSIGN_KEY)||"{}");}catch(e){ASSIGNMENTS={};}
}
function saveNotes(){lsSet(NOTE_KEY,JSON.stringify(NOTES));}
function saveAssignments(){lsSet(ASSIGN_KEY,JSON.stringify(ASSIGNMENTS));}
function getSavedOp(){return ls(OP_KEY);}
function saveOp(op){lsSet(OP_KEY,op);}
loadStorage();

// ─── UTILS ───────────────────────────────────────────────────────────────────
function daysSince(v){if(!v)return 999;var d=typeof v==="number"?new Date(Math.round((v-25569)*864e5)):new Date(v);if(isNaN(d.getTime()))return 999;return Math.floor((Date.now()-d.getTime())/864e5);}
function fmtDate(v){if(!v)return"—";var d=typeof v==="number"?new Date(Math.round((v-25569)*864e5)):new Date(v);if(isNaN(d.getTime()))return String(v);return d.toLocaleDateString("it-IT");}
function todayISO(){return new Date().toISOString().slice(0,10);}
function todayStr(){return new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});}
function todayFile(){return new Date().toISOString().slice(0,10);}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function pnames(s){return s.split(/[\n,;]+/).map(function(n){return n.trim();}).filter(function(n){return n.length>0;});}
function gcol(r,key){
  var c=COLS[key],ks=Object.keys(r),f=null;
  for(var i=0;i<ks.length;i++){if(ks[i].toLowerCase().trim()===c){f=ks[i];break;}}
  if(!f)for(var i=0;i<ks.length;i++){if(ks[i].toLowerCase().trim().indexOf(c)>=0){f=ks[i];break;}}
  if(!f)for(var i=0;i<ks.length;i++){if(c.indexOf(ks[i].toLowerCase().trim())>=0){f=ks[i];break;}}
  return f?r[f]:"";
}

// ─── LOGICA STATI ─────────────────────────────────────────────────────────────
function gstatus(r){
  var nc=Number(r.n_chiamate)||0,sc=Number(r.giorni_scadenza),si=daysSince(r.data_ultima);
  if(sc<=1&&nc<3)return"emergenza";
  if(sc<=1&&nc>=3)return"esaurito";
  if(nc===0)return"mai_chiamato";
  if(si<DAYS_BETWEEN)return"recente";
  if(sc<=3&&nc<3)return"urgente_boost";
  if(sc<=3)return"urgente";
  return"chiamabile";
}
function gprio(r){
  var sc=Number(r.giorni_scadenza)||9999,nc=Number(r.n_chiamate)||0,si=daysSince(r.data_ultima),ge=Number(r.giorni_gestione)||0;
  var s=r._status||gstatus(r);
  if(s==="emergenza")return 9000+nc*10+sc;
  if(s==="esaurito"||s==="recente")return-1;
  return Math.round(1000/Math.pow(sc+1,2)+(nc<3?(3-nc)*20:0)+(si>=DAYS_BETWEEN?si*3:0)+((nc===0&&ge<=1)?25:0));
}
function callable(r){return r._status!=="recente"&&r._status!=="esaurito";}
function reason(r){
  var nc=Number(r.n_chiamate)||0,sc=Number(r.giorni_scadenza),ge=Number(r.giorni_gestione)||0,si=daysSince(r.data_ultima);
  if(r._status==="emergenza")return"🚨 Scade domani, "+nc+" contatti";
  if(r._status==="mai_chiamato"&&ge<=1)return"Nuovo oggi";
  if(r._status==="mai_chiamato")return"Mai contattato ("+ge+"gg)";
  if(r._status==="urgente_boost")return"Scade in "+sc+"gg, "+nc+" contatti";
  if(r._status==="urgente")return"Scade in "+sc+"gg";
  if(r._status==="chiamabile")return nc+" contatti · "+si+"gg fa";
  return"—";
}
function scadcls(n){if(n<=3)return"sc-crit";if(n<=7)return"sc-warn";return"sc-ok";}
function isDone(id){return!!DONE[id];}

// ─── DONE ────────────────────────────────────────────────────────────────────
function markDone(id){
  var r=null;
  for(var i=0;i<S.data.length;i++){if(S.data[i].id===id){r=S.data[i];break;}}
  if(!r)return;
  DONE[id]={id:id,operatore:r.operatore,company:r.company,scadenza:r.giorni_scadenza,chiamate:r.n_chiamate,stato:STATUS_META[r._status]?STATUS_META[r._status].label:"",ts:new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})};
  refresh();
}
function unmarkDone(id){delete DONE[id];refresh();}
function refresh(){if(S.view==="lista")renderLista();else if(S.view==="lavorati")renderLavorati();else renderDash();}

// ─── SESSIONE ─────────────────────────────────────────────────────────────────
function saveSession(){
  lsSet(SESSION_KEY,JSON.stringify({
    currentOp:S.currentOp, operatorList:S.operatorList,
    done:DONE, view:S.view, listaTab:S.listaTab,
    data:S.data, fileName:S.fileName,
  }));
}
function loadSession(){try{return JSON.parse(ls(SESSION_KEY)||"null");}catch(e){return null;}}
function clearSession(){lsDel(SESSION_KEY);}

function askSave(cb){
  if(!Object.keys(DONE).length){cb();return;}
  _pendingNavCb=cb;
  showModal("modal-session");
}

// ─── ASSEGNAZIONE ─────────────────────────────────────────────────────────────
function assign(rows,ops){
  if(!ops.length)return{};
  var load={};
  ops.forEach(function(op){load[op]=0;});
  rows.forEach(function(r){var op=r.operatore||ASSIGNMENTS[r.id];if(op&&load.hasOwnProperty(op))load[op]++;});
  var ua=rows.filter(function(r){return!r.operatore&&!ASSIGNMENTS[r.id];}).sort(function(a,b){return gprio(a)-gprio(b);});
  var map={};
  ua.forEach(function(r){
    var best=ops[0];
    ops.forEach(function(op){if(load[op]<load[best])best=op;});
    map[r.id]=best;load[best]++;
  });
  return map;
}

// ─── FILE ────────────────────────────────────────────────────────────────────
function processFile(raw,fileName,fromDrive){
  _pendingRows=raw.map(function(r,i){
    return{_idx:i,id:String(gcol(r,"id")||("INC-"+(i+1))),
      giorni_gestione:gcol(r,"giorni_gestione"),giorni_scadenza:gcol(r,"giorni_scadenza"),
      n_chiamate:gcol(r,"n_chiamate"),data_ultima:gcol(r,"data_ultima"),
      operatore:gcol(r,"operatore"),company:gcol(r,"company"),
      _auto_assigned:false,_status:"",_priority:0};
  });
  S.fileName=fileName;
  var ops=[],seen={};
  _pendingRows.forEach(function(r){if(r.operatore&&!seen[r.operatore]){seen[r.operatore]=1;ops.push(r.operatore);}});
  var savedOps=[],seenS={};
  Object.values(ASSIGNMENTS).forEach(function(op){if(op&&!seenS[op]){seenS[op]=1;savedOps.push(op);}});
  var allOps=[],allSeen={};
  ops.concat(savedOps).forEach(function(op){if(!allSeen[op]){allSeen[op]=1;allOps.push(op);}});
  if(allOps.length>0){
    S.operatorList=allOps;
    applyData(_pendingRows,allOps);
    if(fromDrive)showOpsScreen();
    else enterApp("__admin__");
  } else {
    document.getElementById("setup-fname").textContent=fileName;
    document.getElementById("setup-sub").textContent=_pendingRows.length.toLocaleString("it")+" incarichi trovati.";
    document.getElementById("ops-input").value="";
    document.getElementById("ops-preview").innerHTML="";
    document.getElementById("ops-err").style.display="none";
    showScreen("screen-setup");
  }
}

function parseFile(file,fromDrive){
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:"array"});
      processFile(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""}),file.name,fromDrive);
    }catch(err){alert("Errore nel leggere il file: "+err.message);}
  };
  reader.readAsArrayBuffer(file);
}

function applyData(rows,ops){
  var map=assign(rows,ops);
  Object.keys(map).forEach(function(id){ASSIGNMENTS[id]=map[id];});
  saveAssignments();
  S.data=rows.map(function(r){
    var op=map.hasOwnProperty(r.id)?map[r.id]:(r.operatore||ASSIGNMENTS[r.id]||"");
    var row={_idx:r._idx,id:r.id,giorni_gestione:r.giorni_gestione,giorni_scadenza:r.giorni_scadenza,
      n_chiamate:r.n_chiamate,data_ultima:r.data_ultima,operatore:op,company:r.company,
      _auto_assigned:map.hasOwnProperty(r.id),_status:"",_priority:0};
    row._status=gstatus(row);row._priority=gprio(row);
    return row;
  });
  S.assignLog=Object.keys(map).length;
}

function handleAdminFile(file){
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:"array"});
      var raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
      ASSIGNMENTS={};saveAssignments();clearSession();DONE={};
      processFile(raw,file.name,false);
    }catch(err){alert("Errore: "+err.message);}
  };
  reader.readAsArrayBuffer(file);
}

// ─── DRIVE ───────────────────────────────────────────────────────────────────
var _retryCount=0,_retryTimer=null;

function startWaiting(){
  showScreen("screen-wait");
  _retryCount=0;
  tryLoadDrive();
}
function stopWaiting(){if(_retryTimer){clearInterval(_retryTimer);_retryTimer=null;}}

function tryLoadDrive(){
  _retryCount++;
  setWaitStatus("Tentativo "+_retryCount+" — connessione a Google Drive...", "");
  fetch(DRIVE_URL)
    .then(function(r){return r.json();})
    .then(function(json){
      if(json.error){
        var msg=json.error.indexOf("non ancora")>=0?"L'admin non ha ancora caricato il file di oggi.":"Errore Drive: "+json.error;
        startRetry(msg);return;
      }
      setWaitStatus("✓ File trovato! Caricamento in corso...","");
      var bin=atob(json.data),bytes=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      var blob=new Blob([bytes.buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      parseFile(new File([blob],json.fileName||"incarichi.xlsx"),true);
    })
    .catch(function(err){startRetry("Errore connessione: "+err.message);});
}

function startRetry(msg){
  var sec=10;
  setWaitStatus(msg,"Nuovo tentativo tra "+sec+" secondi...");
  _retryTimer=setInterval(function(){
    sec--;
    if(sec<=0){clearInterval(_retryTimer);tryLoadDrive();}
    else document.getElementById("wait-retry").textContent="Nuovo tentativo tra "+sec+" secondi...";
  },1000);
}

function setWaitStatus(msg,retry){
  var s=document.getElementById("wait-status"),r=document.getElementById("wait-retry");
  if(s)s.textContent=msg;if(r)r.textContent=retry;
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────
var SCREENS=["screen-resume","screen-role","screen-wait","screen-ops","screen-upload","screen-setup","screen-main"];
function showScreen(id){
  SCREENS.forEach(function(s){document.getElementById(s).classList.remove("active");});
  document.getElementById(id).classList.add("active");
}
function showModal(id){document.getElementById(id).classList.add("open");}
function hideModal(id){document.getElementById(id).classList.remove("open");}

function showOpsScreen(){
  stopWaiting();
  var ops=S.operatorList.filter(Boolean),savedOp=getSavedOp();
  document.getElementById("ops-grid").innerHTML=ops.map(function(op){
    var initials=op.split(" ").map(function(w){return w[0]||"";}).slice(0,2).join("").toUpperCase();
    var cnt=S.data.filter(function(r){return r.operatore===op&&callable(r)&&r._priority>=0&&!isDone(r.id);}).length;
    var isSaved=savedOp===op;
    return'<button class="rbtn'+(isSaved?" saved":"")+'" data-op="'+esc(op)+'">'+'<div class="ava">'+esc(initials)+'</div>'+'<div style="flex:1"><div>'+esc(op)+(isSaved?' <span style="font-size:11px;color:#533AB7"> · ultimo accesso</span>':'')+'</div><div style="font-size:12px;font-weight:400;color:#888;margin-top:2px">'+cnt+' chiamate oggi</div></div></button>';
  }).join("");
  document.getElementById("ops-grid").querySelectorAll(".rbtn[data-op]").forEach(function(btn){
    btn.addEventListener("click",function(){saveOp(btn.dataset.op);enterApp(btn.dataset.op);});
  });
  showScreen("screen-ops");
}

function enterApp(op){
  stopWaiting();
  S.currentOp=op;
  var isAdmin=(op==="__admin__");
  document.getElementById("h-op").textContent=isAdmin?"Admin":op;
  document.getElementById("tab-dash").style.display=isAdmin?"":"none";
  document.getElementById("btn-newfile").style.display=isAdmin?"":"none";
  if(S.assignLog>0){
    document.getElementById("banner").style.display="flex";
    document.getElementById("banner-txt").innerHTML="<strong>"+S.assignLog+" incarichi</strong> assegnati automaticamente.";
  }
  rebuildOpFilter();
  showScreen("screen-main");
  if(isAdmin){S.listaTab=S.listaTab||"__admin__";switchView("dashboard");}
  else{S.listaTab=S.listaTab||op;switchView("lista");}
}

function switchView(v){
  S.view=v;
  document.querySelectorAll(".ntab").forEach(function(t){t.classList.toggle("active",t.dataset.v===v);});
  document.querySelectorAll(".view").forEach(function(el){el.classList.remove("active");});
  document.getElementById("view-"+v).classList.add("active");
  if(v==="dashboard")renderDash();
  else if(v==="lista")renderLista();
  else if(v==="lavorati")renderLavorati();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function gstats(){
  var d=S.data;
  return{totale:d.length,
    emergenza:d.filter(function(r){return r._status==="emergenza";}).length,
    mai_chiamato:d.filter(function(r){return r._status==="mai_chiamato";}).length,
    urgente_boost:d.filter(function(r){return r._status==="urgente_boost";}).length,
    urgenti:d.filter(function(r){return r._status==="urgente";}).length,
    chiamabili:d.filter(function(r){return r._status==="chiamabile";}).length,
    recenti:d.filter(function(r){return r._status==="recente";}).length,
    esauriti:d.filter(function(r){return r._status==="esaurito";}).length};
}
function gload(){var m={};S.data.forEach(function(r){if(r.operatore)m[r.operatore]=(m[r.operatore]||0)+1;});return m;}
function gfiltered(){
  var res=S.data.slice();
  if(S.fStatus!=="tutti")res=res.filter(function(r){return r._status===S.fStatus;});
  if(S.fOp!=="tutti")res=res.filter(function(r){return r.operatore===S.fOp;});
  if(S.fCompany){var fc=S.fCompany.toLowerCase();res=res.filter(function(r){return String(r.company).toLowerCase().indexOf(fc)>=0;});}
  res.sort(function(a,b){
    if(S.sortBy==="_priority")return S.sortDir==="asc"?b._priority-a._priority:a._priority-b._priority;
    var va=a[S.sortBy]!==undefined?a[S.sortBy]:"",vb=b[S.sortBy]!==undefined?b[S.sortBy]:"";
    if(S.sortBy==="data_ultima"){va=daysSince(va);vb=daysSince(vb);}
    else if(!isNaN(Number(va))&&!isNaN(Number(vb))){va=Number(va);vb=Number(vb);}
    if(va<vb)return S.sortDir==="asc"?-1:1;if(va>vb)return S.sortDir==="asc"?1:-1;return 0;
  });
  return res;
}
function renderDash(){renderStats();renderLoad();renderReset();var f=gfiltered();document.getElementById("rcnt").textContent=f.length.toLocaleString("it")+" risultati";renderTable(f);renderPag(f.length);}
function renderStats(){
  var s=gstats(),fm={totale:s.totale,emergenza:s.emergenza,mai_chiamato:s.mai_chiamato,urgente_boost:s.urgente_boost,chiamabili:s.chiamabili};
  document.getElementById("stats-grid").innerHTML=STAT_DEFS.map(function(d){
    var val=fm.hasOwnProperty(d.field)?fm[d.field]:0,act=S.fStatus===d.key;
    return'<div class="scard" style="border-color:'+(act?d.color:"#e8e4dc")+'" data-key="'+d.key+'"><div class="scard-label">'+d.label+'</div><div class="scard-val" style="color:'+d.color+'">'+val.toLocaleString("it")+"</div></div>";
  }).join("");
  document.querySelectorAll(".scard").forEach(function(el){el.addEventListener("click",function(){S.fStatus=el.dataset.key;S.page=1;renderDash();syncUI();});});
}
function renderLoad(){
  var load=gload(),ops=S.operatorList.filter(Boolean),mx=0;
  ops.forEach(function(op){if((load[op]||0)>mx)mx=load[op]||0;});if(mx===0)mx=1;
  document.getElementById("op-grid").innerHTML=ops.map(function(op){
    var cnt=load[op]||0,pct=Math.round(cnt/mx*100),act=S.fOp===op;
    return'<div class="opc'+(act?" active":"")+'" data-op="'+esc(op)+'"><div class="opc-name">'+esc(op)+'</div><div class="opc-bar"><div class="opc-fill" style="width:'+pct+'%"></div></div><div class="opc-cnt">'+cnt.toLocaleString("it")+" incarichi</div></div>";
  }).join("");
  document.querySelectorAll(".opc").forEach(function(el){el.addEventListener("click",function(){S.fOp=(S.fOp===el.dataset.op)?"tutti":el.dataset.op;S.page=1;renderDash();syncUI();});});
}
function renderTable(f){
  document.getElementById("thead").innerHTML="<tr>"+DCOLS.map(function(c){
    if(c.ns)return'<th class="ns">'+c.label+"</th>";
    var cls=S.sortBy===c.key?(S.sortDir==="asc"?"sa":"sd"):"";
    return'<th class="'+cls+'" data-col="'+c.key+'">'+c.label+"</th>";
  }).join("")+"</tr>";
  document.querySelectorAll("#thead th[data-col]").forEach(function(th){
    th.addEventListener("click",function(){
      if(S.sortBy===th.dataset.col)S.sortDir=S.sortDir==="asc"?"desc":"asc";
      else{S.sortBy=th.dataset.col;S.sortDir="asc";}
      S.page=1;renderDash();
    });
  });
  var start=(S.page-1)*PAGE_SIZE,paged=f.slice(start,start+PAGE_SIZE);
  document.getElementById("tbody").innerHTML=paged.map(function(row){
    var st=STATUS_META[row._status]||STATUS_META.chiamabile;
    var bgCls=row._status==="emergenza"?"r-em":(row._status==="urgente_boost"||row._status==="urgente")?"r-urg":row._status==="mai_chiamato"?"r-mai":"";
    var n=NOTES[row.id],done=isDone(row.id);
    return'<tr class="'+bgCls+'">'+DCOLS.map(function(c){
      if(c.key==="_priority")return'<td style="text-align:center;font-family:\'Courier New\',monospace;font-size:11px;color:#bbb;font-weight:700">'+Math.round(row._priority)+"</td>";
      if(c.key==="_status")return'<td><span class="badge" style="background:'+st.bg+';color:'+st.color+';border-color:'+st.border+'">'+st.label+"</span></td>";
      if(c.key==="operatore")return'<td>'+esc(row.operatore||"—")+(row._auto_assigned?'<span class="auto-badge">AUTO</span>':"")+"</td>";
      if(c.key==="giorni_scadenza"){var nn=Number(row.giorni_scadenza);return'<td style="text-align:center;font-weight:700;color:'+(nn<=3?"#A32D2D":nn<=7?"#854F0B":"#333")+'">'+(row.giorni_scadenza!==""?row.giorni_scadenza:"—")+"</td>";}
      if(c.key==="_nota")return'<td><button class="btn-n'+(n?" on":"")+'" data-nid="'+esc(row.id)+'" data-nc="'+esc(row.company||"")+'" data-no="'+esc(row.operatore||"")+'">'+(n?"✏️":"+ Nota")+"</button></td>";
      if(c.key==="_done")return'<td><button class="'+(done?"btn-undone":"btn-done")+'" data-did="'+esc(row.id)+'">'+(done?"✓ Fatto":"Done")+"</button></td>";
      if(c.date)return'<td style="color:#888;font-size:12px">'+fmtDate(row[c.key])+"</td>";
      var style="";
      if(c.align)style+="text-align:"+c.align+";";if(c.bold)style+="font-weight:600;";
      if(c.mono)style+="font-family:'Courier New',monospace;font-size:12px;";if(c.muted)style+="color:#888;";
      return'<td style="'+style+'">'+esc(row[c.key]!==undefined&&row[c.key]!==""?row[c.key]:"—")+"</td>";
    }).join("")+"</tr>";
  }).join("");
  document.querySelectorAll("#tbody .btn-n").forEach(function(btn){btn.addEventListener("click",function(){openModal(btn.dataset.nid,btn.dataset.nc,btn.dataset.no);});});
  document.querySelectorAll("#tbody .btn-done,#tbody .btn-undone").forEach(function(btn){btn.addEventListener("click",function(){isDone(btn.dataset.did)?unmarkDone(btn.dataset.did):markDone(btn.dataset.did);});});
}
function renderPag(total){
  var pg=document.getElementById("pag"),tp=Math.ceil(total/PAGE_SIZE);
  if(tp<=1){pg.style.display="none";return;}
  pg.style.display="flex";
  pg.innerHTML='<button id="pg1" '+(S.page===1?"disabled":"")+'>«</button><button id="pg2" '+(S.page===1?"disabled":"")+'>‹</button><span>Pagina '+S.page+" di "+tp+'</span><button id="pg3" '+(S.page===tp?"disabled":"")+'>›</button><button id="pg4" '+(S.page===tp?"disabled":"")+'>»</button>';
  document.getElementById("pg1").onclick=function(){S.page=1;renderDash();};
  document.getElementById("pg2").onclick=function(){S.page--;renderDash();};
  document.getElementById("pg3").onclick=function(){S.page++;renderDash();};
  document.getElementById("pg4").onclick=function(){S.page=tp;renderDash();};
}
function renderReset(){document.getElementById("btn-reset").style.display=(S.fStatus!=="tutti"||S.fOp!=="tutti"||S.fCompany)?"inline-block":"none";}
function rebuildOpFilter(){
  var ops=[],seen={};S.data.forEach(function(r){if(r.operatore&&!seen[r.operatore]){seen[r.operatore]=1;ops.push(r.operatore);}});ops.sort();
  var sel=document.getElementById("f-op");
  sel.innerHTML='<option value="tutti">Tutti gli operatori</option>'+ops.map(function(o){return'<option value="'+esc(o)+'">'+esc(o)+"</option>";}).join("");
  sel.value=S.fOp;
}
function syncUI(){document.getElementById("f-status").value=S.fStatus;document.getElementById("f-op").value=S.fOp;document.getElementById("f-company").value=S.fCompany;renderReset();}

// ─── LISTA ───────────────────────────────────────────────────────────────────
function dailyList(op){return S.data.filter(function(r){return r.operatore===op&&callable(r)&&r._priority>=0&&!isDone(r.id);}).sort(function(a,b){return b._priority-a._priority;});}
function allCallable(){return S.data.filter(function(r){return callable(r)&&r._priority>=0&&!isDone(r.id);}).sort(function(a,b){return b._priority-a._priority;});}

function lhead(showOp){
  return'<thead><tr><th style="width:36px">#</th><th>ID</th><th>Company</th>'+(showOp?"<th>Operatore</th>":"")+'<th style="text-align:center">Scadenza</th><th style="text-align:center">Chiamate</th><th>Ultima chiam.</th><th>Stato</th><th>Motivo</th><th>Nota</th><th></th><th></th></tr></thead>';
}
function lrow(r,i,showOp){
  var st=STATUS_META[r._status]||STATUS_META.chiamabile,sc=Number(r.giorni_scadenza),n=NOTES[r.id],done=isDone(r.id);
  return'<tr>'+'<td class="num">'+(i+1)+'</td>'+'<td style="font-family:\'Courier New\',monospace;font-size:12px;color:#888">'+esc(r.id)+'</td>'+'<td style="font-weight:600">'+esc(r.company||"—")+'</td>'+(showOp?'<td>'+esc(r.operatore||"—")+'</td>':'')+'<td style="text-align:center" class="'+scadcls(sc)+'">'+(r.giorni_scadenza!==""?r.giorni_scadenza:"—")+'</td>'+'<td style="text-align:center">'+(r.n_chiamate||0)+'</td>'+'<td style="color:#888;font-size:12px">'+fmtDate(r.data_ultima)+'</td>'+'<td><span class="badge" style="background:'+st.bg+';color:'+st.color+';border-color:'+st.border+'">'+st.label+'</span></td>'+'<td style="font-size:12px;color:#555;font-style:italic">'+reason(r)+'</td>'+(n?'<td style="font-size:12px;max-width:140px;white-space:normal;color:#533AB7">'+(n.dataRichiamo?'<strong>📅 '+n.dataRichiamo+'</strong><br>':'')+'<em>'+esc(n.testo)+'</em></td>':'<td></td>')+'<td><button class="btn-n'+(n?" on":"")+'" data-nid="'+esc(r.id)+'" data-nc="'+esc(r.company||"")+'" data-no="'+esc(r.operatore||"")+'">'+(n?"✏️":"+ Nota")+"</button></td>"+'<td><button class="'+(done?"btn-undone":"btn-done")+'" data-did="'+esc(r.id)+'">'+(done?"✓":"Done")+"</button></td>"+'</tr>';
}
function attachActions(c){
  c.querySelectorAll(".btn-n").forEach(function(btn){btn.addEventListener("click",function(){openModal(btn.dataset.nid,btn.dataset.nc,btn.dataset.no);});});
  c.querySelectorAll(".btn-done,.btn-undone").forEach(function(btn){btn.addEventListener("click",function(){isDone(btn.dataset.did)?unmarkDone(btn.dataset.did):markDone(btn.dataset.did);});});
}

function renderLista(){
  document.getElementById("ldate").textContent=todayStr();
  var isAdmin=(S.currentOp==="__admin__"),ops=S.operatorList.filter(Boolean);
  var lbtns=document.getElementById("lbtns"),lcontent=document.getElementById("lcontent"),ltabs=document.getElementById("ltabs");
  if(!isAdmin){
    ltabs.innerHTML="";
    lbtns.innerHTML='<button class="btn-g" id="btn-exp-me">↓ Esporta la mia lista</button>';
    document.getElementById("btn-exp-me").addEventListener("click",function(){expOp(S.currentOp);});
    renderOpLista(lcontent,S.currentOp);
    return;
  }
  lbtns.innerHTML='<button class="btn-p" id="btn-exp-adm">↓ Recap admin</button><button class="btn-g" id="btn-exp-all">↓ Tutti gli operatori</button>';
  document.getElementById("btn-exp-adm").addEventListener("click",expAdmin);
  document.getElementById("btn-exp-all").addEventListener("click",expAll);
  if(!S.listaTab)S.listaTab="__admin__";
  ltabs.innerHTML='<button class="ltab adm'+(S.listaTab==="__admin__"?" active":"")+'" data-t="__admin__">📊 Admin</button>'+ops.map(function(op){return'<button class="ltab'+(S.listaTab===op?" active":"")+'" data-t="'+esc(op)+'">'+esc(op)+' <span style="opacity:.6;font-size:11px">('+dailyList(op).length+")</span></button>";}).join("");
  ltabs.querySelectorAll(".ltab").forEach(function(t){t.addEventListener("click",function(){S.listaTab=t.dataset.t;renderLista();});});
  if(S.listaTab==="__admin__")renderAdminRecap(lcontent);else renderOpLista(lcontent,S.listaTab);
}

function renderOpLista(container,op){
  var list=dailyList(op);
  var urg=list.filter(function(r){return r._status==="emergenza"||r._status==="urgente"||r._status==="urgente_boost";}).length;
  var mai=list.filter(function(r){return r._status==="mai_chiamato";}).length;
  container.innerHTML='<div class="opw"><div class="oph"><div><div class="ophn">'+esc(op)+'</div><div class="ophm"><span>Da chiamare: <strong>'+list.length+'</strong></span><span>Urgenti: <strong style="color:#A32D2D">'+urg+'</strong></span><span>Mai chiamati: <strong style="color:#533AB7">'+mai+'</strong></span></div></div>'+(S.currentOp==="__admin__"?'<button class="btn-g" id="btn-exp-op-a">↓ Esporta</button>':'')+'</div>'+(list.length===0?'<div class="empty">Nessun incarico da chiamare — ottimo lavoro! 🎉</div>':'<div style="overflow-x:auto"><table class="ltable">'+lhead(false)+'<tbody>'+list.map(function(r,i){return lrow(r,i,false);}).join("")+'</tbody></table></div>')+renderNotePanel(op)+'</div>';
  var eb=document.getElementById("btn-exp-op-a");if(eb)eb.addEventListener("click",function(){expOp(op);});
  attachActions(container);attachNotePanel(container,op);
}

function renderAdminRecap(container){
  var ops=S.operatorList.filter(Boolean),allC=allCallable();
  var urg=allC.filter(function(r){return r._status==="emergenza"||r._status==="urgente"||r._status==="urgente_boost";}).length;
  var mai=allC.filter(function(r){return r._status==="mai_chiamato";}).length;
  var rec=S.data.filter(function(r){return r._status==="recente";}).length;
  var rows="";
  ops.forEach(function(op){var list=dailyList(op);if(!list.length)return;rows+='<tr class="op-sec"><td colspan="12">'+esc(op)+' — '+list.length+' chiamate</td></tr>';list.forEach(function(r,i){rows+=lrow(r,i,false);});});
  container.innerHTML='<div class="adm-met"><div class="adm-m"><div class="l">Da chiamare</div><div class="v">'+allC.length.toLocaleString("it")+'</div></div><div class="adm-m"><div class="l">Urgenti</div><div class="v" style="color:#A32D2D">'+urg.toLocaleString("it")+'</div></div><div class="adm-m"><div class="l">Mai chiamati</div><div class="v" style="color:#533AB7">'+mai.toLocaleString("it")+'</div></div><div class="adm-m"><div class="l">Da saltare</div><div class="v" style="color:#888">'+rec.toLocaleString("it")+'</div></div></div><div class="opw"><div class="oph"><div><div class="ophn">Recap completo</div><div class="ophm"><span>'+ops.length+' operatori · '+allC.length.toLocaleString("it")+' incarichi</span></div></div></div><div style="overflow-x:auto"><table class="ltable">'+lhead(true)+'<tbody>'+rows+'</tbody></table></div>'+renderNotePanel("__admin__")+'</div>';
  attachActions(container);attachNotePanel(container,"__admin__");
}

// ─── LAVORATI ────────────────────────────────────────────────────────────────
function renderLavorati(){
  document.getElementById("lav-date").textContent=todayStr();
  var isAdmin=(S.currentOp==="__admin__"),ops=S.operatorList.filter(Boolean);
  var lbtns=document.getElementById("lav-btns"),lcontent=document.getElementById("lav-content"),ltabs=document.getElementById("lav-tabs");
  if(!isAdmin){
    ltabs.innerHTML="";
    var myDone=Object.values(DONE).filter(function(d){return d.operatore===S.currentOp;});
    lbtns.innerHTML=myDone.length?'<button class="btn-g" id="btn-exp-lav-me">↓ Esporta lavorati</button>':"";
    if(document.getElementById("btn-exp-lav-me"))document.getElementById("btn-exp-lav-me").addEventListener("click",function(){expLavorati(S.currentOp);});
    lcontent.innerHTML=renderLavoratiBox(S.currentOp);
    lcontent.querySelectorAll(".btn-undone").forEach(function(btn){btn.addEventListener("click",function(){unmarkDone(btn.dataset.did);});});
    return;
  }
  lbtns.innerHTML='<button class="btn-p" id="btn-exp-lav-all">↓ Esporta tutti i lavorati</button>';
  document.getElementById("btn-exp-lav-all").addEventListener("click",function(){expLavorati("__admin__");});
  if(!S.lavTab)S.lavTab="__admin__";
  ltabs.innerHTML='<button class="ltab adm'+(S.lavTab==="__admin__"?" active":"")+'" data-lt="__admin__">📊 Tutti</button>'+ops.map(function(op){var cnt=Object.values(DONE).filter(function(d){return d.operatore===op;}).length;return'<button class="ltab'+(S.lavTab===op?" active":"")+'" data-lt="'+esc(op)+'">'+esc(op)+' <span style="opacity:.6;font-size:11px">('+cnt+")</span></button>";}).join("");
  ltabs.querySelectorAll(".ltab[data-lt]").forEach(function(t){t.addEventListener("click",function(){S.lavTab=t.dataset.lt;renderLavorati();});});
  var allDone=Object.values(DONE);
  if(S.lavTab==="__admin__"){
    var met='<div class="adm-met"><div class="adm-m"><div class="l">Totale lavorati</div><div class="v" style="color:#3B6D11">'+allDone.length+'</div></div>'+ops.map(function(op){var c=allDone.filter(function(d){return d.operatore===op;}).length;return'<div class="adm-m"><div class="l">'+esc(op)+'</div><div class="v" style="color:#3B6D11">'+c+'</div></div>';}).join("")+'</div>';
    lcontent.innerHTML=met+ops.map(function(op){return renderLavoratiBox(op);}).join("");
  }else{lcontent.innerHTML=renderLavoratiBox(S.lavTab);}
  lcontent.querySelectorAll(".btn-undone").forEach(function(btn){btn.addEventListener("click",function(){unmarkDone(btn.dataset.did);});});
}

function renderLavoratiBox(op){
  var isAll=(op==="__admin__");
  var items=Object.values(DONE).filter(function(d){return isAll?true:d.operatore===op;});
  if(!items.length)return'<div class="opw" style="margin-bottom:12px"><div class="oph"><div class="ophn">'+(isAll?"Tutti":esc(op))+'</div></div><div class="empty">Nessun incarico lavorato ancora</div></div>';
  var rows=items.map(function(d,i){return'<tr><td class="num">'+(i+1)+'</td><td style="font-family:\'Courier New\',monospace;font-size:12px;color:#888">'+esc(d.id)+'</td><td style="font-weight:600">'+esc(d.company||"—")+'</td>'+(isAll?'<td>'+esc(d.operatore||"—")+'</td>':'')+'<td style="text-align:center;font-weight:600;color:#3B6D11">'+d.ts+'</td><td><span class="badge" style="background:#EAF3DE;color:#3B6D11;border-color:#97C459">✅ Fatto</span></td><td><button class="btn-undone" data-did="'+esc(d.id)+'">Annulla</button></td></tr>';}).join("");
  return'<div class="opw" style="margin-bottom:12px"><div class="oph"><div><div class="ophn">'+(isAll?"Tutti":esc(op))+'</div><div class="ophm"><span><strong style="color:#3B6D11">'+items.length+'</strong> lavorati</span></div></div></div><div style="overflow-x:auto"><table class="ltable"><thead><tr><th style="width:36px">#</th><th>ID</th><th>Company</th>'+(isAll?"<th>Operatore</th>":"")+'<th>Ora</th><th>Stato</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

// ─── NOTE ────────────────────────────────────────────────────────────────────
function renderNotePanel(op){
  var today=todayISO();
  var ns=Object.values(NOTES).filter(function(n){return op==="__admin__"?true:n.operatore===op;}).sort(function(a,b){var da=a.dataRichiamo||"9999",db=b.dataRichiamo||"9999";return da<db?-1:da>db?1:0;});
  var items=ns.length?ns.map(function(n){
    var ip=n.dataRichiamo&&n.dataRichiamo<today,it=n.dataRichiamo===today;
    var badge=n.dataRichiamo?'<span class="ndt'+(ip||it?" ov":"")+'">'+(it?"📅 Oggi":ip?"⚠️ "+n.dataRichiamo:"📅 "+n.dataRichiamo)+"</span>":"";
    return'<div class="ni'+(n.dataRichiamo?" hd":"")+(ip||it?" ov":"")+'">'+'<div class="nm"><div class="nid">'+esc(n.id)+(op==="__admin__"?" · "+esc(n.operatore):"")+'</div><div class="nco">'+esc(n.company)+'</div><div class="ntx">'+esc(n.testo)+'</div></div>'+badge+'<button class="nedit" data-nid="'+esc(n.id)+'" data-nc="'+esc(n.company||"")+'" data-no="'+esc(n.operatore||"")+'">✏️</button></div>';
  }).join(""):'<div class="empty" style="padding:12px 0">Nessuna nota</div>';
  return'<div class="npanel"><div class="nphdr"><h3>📝 Note & Richiami'+(ns.length?' <span style="color:#533AB7;font-size:12px">('+ns.length+')</span>':'')+'</h3><span>▼</span></div><div class="npbody"><div class="nlist">'+items+'</div>'+renderCal(op)+'</div></div>';
}
function attachNotePanel(c,op){
  var hdr=c.querySelector(".nphdr"),body=c.querySelector(".npbody");
  if(hdr&&body)hdr.addEventListener("click",function(){body.classList.toggle("open");});
  c.querySelectorAll(".nedit").forEach(function(btn){btn.addEventListener("click",function(){openModal(btn.dataset.nid,btn.dataset.nc,btn.dataset.no);});});
  var prev=c.querySelector(".cal-prev"),next=c.querySelector(".cal-next");
  if(prev)prev.addEventListener("click",function(){S.calM--;if(S.calM<0){S.calM=11;S.calY--;}renderLista();});
  if(next)next.addEventListener("click",function(){S.calM++;if(S.calM>11){S.calM=0;S.calY++;}renderLista();});
}
function renderCal(op){
  var MN=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  var DN=["Lu","Ma","Me","Gi","Ve","Sa","Do"],today=todayISO(),y=S.calY,m=S.calM,ev={};
  Object.values(NOTES).forEach(function(n){if(!n.dataRichiamo)return;if(op!=="__admin__"&&n.operatore!==op)return;if(!ev[n.dataRichiamo])ev[n.dataRichiamo]=[];ev[n.dataRichiamo].push(n.id+(op==="__admin__"?" ("+n.operatore+")":""));});
  var first=new Date(y,m,1),last=new Date(y,m+1,0),sdow=(first.getDay()+6)%7;
  var cells=DN.map(function(d){return'<div class="cdn">'+d+"</div>";}).join("");
  for(var i=0;i<sdow;i++)cells+='<div class="cd ot"></div>';
  for(var d=1;d<=last.getDate();d++){
    var ds=y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"),isT=ds===today,es=ev[ds]||[];
    var cls="cd"+(isT?" ct":"")+(es.length?" he":"");
    var eh=es.slice(0,3).map(function(e){return'<div class="cev'+(isT?" ct":"")+'">'+esc(e)+"</div>";}).join("");
    if(es.length>3)eh+='<div style="font-size:9px;color:#533AB7">+'+(es.length-3)+" altri</div>";
    cells+='<div class="'+cls+'"><div style="font-weight:600;font-size:11px">'+d+"</div>"+eh+"</div>";
  }
  return'<div style="margin-top:16px"><div class="cal-hdr"><button class="cal-nav cal-prev">‹</button><h4>'+MN[m]+" "+y+'</h4><button class="cal-nav cal-next">›</button></div><div class="cal-grid">'+cells+"</div></div>";
}

// ─── MODAL NOTA ──────────────────────────────────────────────────────────────
var _mid=null;
function openModal(id,co,op){
  _mid=id;var n=NOTES[id]||{};
  document.getElementById("m-title").textContent=n.testo?"Modifica nota":"Aggiungi nota";
  document.getElementById("m-sub").textContent=id+" — "+(co||"");
  document.getElementById("m-date").value=n.dataRichiamo||"";
  document.getElementById("m-text").value=n.testo||"";
  document.getElementById("m-del").style.display=n.testo?"inline-block":"none";
  showModal("modal-nota");
  setTimeout(function(){document.getElementById("m-text").focus();},50);
}
function closeModal(){hideModal("modal-nota");_mid=null;}
function saveModal(){
  if(!_mid)return;
  var txt=document.getElementById("m-text").value.trim(),dt=document.getElementById("m-date").value,r=null;
  for(var i=0;i<S.data.length;i++){if(S.data[i].id===_mid){r=S.data[i];break;}}
  if(txt)NOTES[_mid]={id:_mid,company:(r&&r.company)||"",operatore:(r&&r.operatore)||"",testo:txt,dataRichiamo:dt};
  else delete NOTES[_mid];
  saveNotes();closeModal();refresh();
}
function delModal(){if(!_mid)return;delete NOTES[_mid];saveNotes();closeModal();refresh();}

// ─── EXPORT ──────────────────────────────────────────────────────────────────
function mkrow(r,i,inclOp){
  var n=NOTES[r.id]||{},row={"#":i+1,"ID":r.id,"Company":r.company||""};
  if(inclOp)row["Operatore"]=r.operatore||"";
  row["Scadenza (gg)"]=r.giorni_scadenza;row["N. Chiamate"]=r.n_chiamate||0;
  row["Ultima chiamata"]=fmtDate(r.data_ultima);
  row["Stato"]=STATUS_META[r._status]?STATUS_META[r._status].label:"";
  row["Motivo"]=reason(r);row["Data richiamo"]=n.dataRichiamo||"";row["Nota"]=n.testo||"";
  return row;
}
function expOp(op){var list=dailyList(op),ws=XLSX.utils.json_to_sheet(list.map(function(r,i){return mkrow(r,i,false);})),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,op.slice(0,31));XLSX.writeFile(wb,"lista_"+op.replace(/\s+/g,"_")+"_"+todayFile()+".xlsx");}
function expAll(){var wb=XLSX.utils.book_new();S.operatorList.filter(Boolean).forEach(function(op){var list=dailyList(op),ws=XLSX.utils.json_to_sheet(list.length?list.map(function(r,i){return mkrow(r,i,false);}): [{"Nota":"Nessun incarico"}]);XLSX.utils.book_append_sheet(wb,ws,op.slice(0,31));});XLSX.writeFile(wb,"lista_operatori_"+todayFile()+".xlsx");}
function expAdmin(){var rows=[];S.operatorList.filter(Boolean).forEach(function(op){dailyList(op).forEach(function(r,i){rows.push(mkrow(r,i,true));});});var ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Nota":"Nessun incarico"}]),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Recap Admin");XLSX.writeFile(wb,"recap_admin_"+todayFile()+".xlsx");}
function expLavorati(op){var items=Object.values(DONE).filter(function(d){return op==="__admin__"?true:d.operatore===op;});var rows=items.map(function(d,i){return{"#":i+1,"ID":d.id,"Company":d.company||"","Operatore":d.operatore||"","Ora":d.ts,"Scadenza":d.scadenza,"Chiamate":d.chiamate,"Stato":d.stato};});var ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Nota":"Nessun lavorato"}]),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Lavorati");XLSX.writeFile(wb,"lavorati_"+(op==="__admin__"?"tutti":op.replace(/\s+/g,"_"))+"_"+todayFile()+".xlsx");}

// ─── EVENTI STATICI ──────────────────────────────────────────────────────────
// Ruolo
document.getElementById("btn-role-op").addEventListener("click",function(){startWaiting();});
document.getElementById("btn-role-admin").addEventListener("click",function(){showScreen("screen-upload");});
// Attesa
document.getElementById("btn-wait-back").addEventListener("click",function(){stopWaiting();showScreen("screen-role");});
// Ops
document.getElementById("btn-back-ops").addEventListener("click",function(){showScreen("screen-role");});
// Upload admin
document.getElementById("btn-back-upload").addEventListener("click",function(){showScreen("screen-role");});
var dz=document.getElementById("drop-zone");
dz.addEventListener("dragover",function(e){e.preventDefault();dz.classList.add("over");});
dz.addEventListener("dragleave",function(){dz.classList.remove("over");});
dz.addEventListener("drop",function(e){e.preventDefault();dz.classList.remove("over");var f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)handleAdminFile(f);});
document.getElementById("file-input").addEventListener("change",function(e){var f=e.target.files&&e.target.files[0];if(f)handleAdminFile(f);e.target.value="";});
// Setup
document.getElementById("btn-confirm").addEventListener("click",function(){
  var typed=pnames(document.getElementById("ops-input").value);
  if(!typed.length){document.getElementById("ops-err").style.display="block";return;}
  S.operatorList=typed;
  if(_pendingRows){applyData(_pendingRows,typed);enterApp("__admin__");}
});
document.getElementById("ops-input").addEventListener("input",function(){
  document.getElementById("ops-preview").innerHTML=pnames(this.value).map(function(n){return'<span class="tag" style="background:#EEEDFE;color:#533AB7;border-color:#AFA9EC">'+esc(n)+"</span>";}).join("");
  document.getElementById("ops-err").style.display="none";
});
// Nav
document.querySelectorAll(".ntab").forEach(function(t){t.addEventListener("click",function(){switchView(t.dataset.v);});});
// Filtri
document.getElementById("f-status").addEventListener("change",function(e){S.fStatus=e.target.value;S.page=1;renderDash();});
document.getElementById("f-op").addEventListener("change",function(e){S.fOp=e.target.value;S.page=1;renderDash();});
document.getElementById("f-company").addEventListener("input",function(e){S.fCompany=e.target.value;S.page=1;renderDash();});
document.getElementById("btn-reset").addEventListener("click",function(){S.fStatus="tutti";S.fOp="tutti";S.fCompany="";S.page=1;renderDash();syncUI();});
// Header
document.getElementById("banner-close").addEventListener("click",function(){document.getElementById("banner").style.display="none";});
document.getElementById("btn-change").addEventListener("click",function(){askSave(function(){DONE={};showScreen("screen-role");});});
document.getElementById("btn-newfile").addEventListener("click",function(){askSave(function(){DONE={};clearSession();ASSIGNMENTS={};saveAssignments();showScreen("screen-upload");});});
// Modal nota
document.getElementById("m-cancel").addEventListener("click",closeModal);
document.getElementById("m-save").addEventListener("click",saveModal);
document.getElementById("m-del").addEventListener("click",delModal);
document.getElementById("modal-nota").addEventListener("click",function(e){if(e.target===this)closeModal();});
// Modal sessione
document.getElementById("sess-save").addEventListener("click",function(){hideModal("modal-session");saveSession();if(_pendingNavCb){_pendingNavCb();_pendingNavCb=null;}});
document.getElementById("sess-discard").addEventListener("click",function(){hideModal("modal-session");clearSession();DONE={};if(_pendingNavCb){_pendingNavCb();_pendingNavCb=null;}});

// ─── AVVIO: controlla sessione ────────────────────────────────────────────────
(function(){
  var sess=loadSession();
  if(sess&&sess.data&&sess.data.length&&sess.currentOp){
    var isAdmin=(sess.currentOp==="__admin__");
    var doneCount=Object.keys(sess.done||{}).length;
    var info="<strong>"+(isAdmin?"Admin":esc(sess.currentOp))+"</strong> &nbsp;·&nbsp; "+sess.data.length.toLocaleString("it")+" incarichi";
    if(doneCount>0)info+=" &nbsp;·&nbsp; "+doneCount+" lavorati";
    if(sess.fileName)info+="<br><small style='color:#aaa'>"+esc(sess.fileName)+"</small>";
    document.getElementById("resume-info").innerHTML=info;
    document.getElementById("btn-resume").onclick=function(){
      S.data=sess.data;S.fileName=sess.fileName||"";S.operatorList=sess.operatorList||[];S.currentOp=sess.currentOp;
      if(sess.done)DONE=sess.done;if(sess.listaTab)S.listaTab=sess.listaTab;
      showScreen("screen-main");
      document.getElementById("h-op").textContent=isAdmin?"Admin":sess.currentOp;
      document.getElementById("tab-dash").style.display=isAdmin?"":"none";
      document.getElementById("btn-newfile").style.display=isAdmin?"":"none";
      rebuildOpFilter();
      if(isAdmin){S.listaTab=S.listaTab||"__admin__";switchView("dashboard");}
      else{S.listaTab=S.listaTab||sess.currentOp;switchView("lista");}
    };
    document.getElementById("btn-resume-new").onclick=function(){clearSession();lsDel(ASSIGN_KEY);showScreen("screen-role");};
    showScreen("screen-resume");
  }
})();
