/* FORGE 1.2 cloud synchronization. Firebase Spark only; no billing integration. */
import {COLLECTIONS,SINGLETONS,flatten,recordKey,changedRecords,applyRecords,validCloudRecord,makeInitialMerge,createPending,safeToSync,sameValue} from './sync-core.mjs';

const host=window.FORGE_HOST;
const cfg=window.FORGE_FIREBASE_CONFIG;
const configured=!!cfg && ['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k].trim()&&!cfg[k].includes('YOUR_'));
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
let auth,fireDB,fns,user=null,meta=null,metaDb=null,dbWrite=Promise.resolve(),remoteUnsub=null;
let statusLabel=configured?'Not signed in':'Not configured',error='',busy=false,enabled=false,connected=false,lastSync=null;
let syncTimer=null,activeSync=null,runAgain=false,authReady=false,initialSettingsConflict=null,sdkStarting=false,preparedMerge=null;
const deviceId='device-'+uid();
const labels={exercises:'Exercises',programs:'Programs',workouts:'Workouts',bodyRecords:'Body',goals:'Goals',foodsCustom:'Custom foods',savedMeals:'Saved meals',foodLogs:'Food logs',cardioSessions:'Cardio',sleepRecords:'Sleep',settings:'Preferences',favorites:'Favorites',foodFavorites:'Food favorites'};

function notify(){
  const status=$safe('#forge-sync-pill');if(status){status.textContent=statusLabel;status.title=error||'';}
  if(host.activePage()==='settings')host.refresh();
}
function setStatus(label,err=''){statusLabel=label;error=err;notify();}
function $safe(s){return document.querySelector(s);}
function openMetaDB(){return new Promise((resolve,reject)=>{
  const r=indexedDB.open('forge-sync-metadata',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
function readMeta(){return new Promise((res,rej)=>{const req=metaDb.transaction('kv','readonly').objectStore('kv').get('sync');req.onsuccess=()=>res(req.result||null);req.onerror=()=>rej(req.error);});}
function putMeta(data){return new Promise((res,rej)=>{let tx=metaDb.transaction('kv','readwrite');tx.objectStore('kv').put(data,'sync');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
function saveMeta(){const snapshot=structuredClone(meta);dbWrite=dbWrite.catch(()=>{}).then(()=>putMeta(snapshot));return dbWrite;}
const cloudId=(key)=>btoa(unescape(encodeURIComponent(key))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function itemRef(key){return fns.doc(fireDB,'users',user.uid,'items',cloudId(key));}
function collectionRef(){return fns.collection(fireDB,'users',user.uid,'items');}
function clockRef(){return fns.doc(fireDB,'users',user.uid,'meta','activity');}
function updatePending(changes){
  if(!changes.length)return;
  if(!meta?.enabled||meta.uid!==user?.uid)return;
  for(const change of changes){
    if(change.kind==='settings'&&initialSettingsConflict)continue;
    const old=meta.pending[change.key];
    meta.pending[change.key]=createPending(change,old?.baseRev??meta.baseline[change.key]?.rev??0);
  }
  saveMeta().catch(e=>setStatus('Storage error',e.message));
  setStatus(navigator.onLine?'Changes pending':'Offline · pending');scheduleSync(1300);
}
function onLocalUpdate(before,after){updatePending(changedRecords(before,after));}

// Decode Firestore's documented REST Value format. This is only used for reads.
function decodeFirestoreValue(v){
  if(!v||typeof v!=='object')throw new Error('Unexpected Firestore response');
  if('nullValue' in v)return null;
  if('stringValue' in v)return v.stringValue;
  if('booleanValue' in v)return v.booleanValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return Number(v.doubleValue);
  if('timestampValue' in v)return v.timestampValue;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(decodeFirestoreValue);
  if('mapValue' in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([key,value])=>[key,decodeFirestoreValue(value)]));
  throw new Error('Unsupported Firestore field type');
}

// The REST API uses the current Firebase user's ID token AND the same security rules.
// It never falls back to stale cached data, so it is safe for first-time merge review.
async function fetchCloudViaREST(){
  if(!user)throw new Error('Please sign in before reviewing cloud data');
  const token=await user.getIdToken();
  const base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/users/${encodeURIComponent(user.uid)}/items`;
  let pageToken='',pages=0;
  const records=[];
  do{
    if(++pages>200)throw new Error('Cloud has too many pages for a safe review');
    const url=new URL(base);
    url.searchParams.set('pageSize','250');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    let response;
    try{
      response=await fetch(url.toString(),{
        headers:{Authorization:`Bearer ${token}`},
        cache:'no-store',signal:controller.signal
      });
    }finally{clearTimeout(timeout);}
    if(!response.ok){
      if(response.status===401||response.status===403)throw new Error(`Cloud access rejected (HTTP ${response.status}). Check the Firebase UID and published Firestore rules.`);
      throw new Error(`Cloud REST connection returned HTTP ${response.status}`);
    }
    const data=await response.json();
    for(const doc of data.documents||[]){
      const record=Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decodeFirestoreValue(v)]));
      if(!validCloudRecord(record))throw new Error('Cloud returned an invalid record; merge stopped for safety');
      records.push(record);
    }
    pageToken=data.nextPageToken||'';
  }while(pageToken);
  return records;
}

async function fetchCloud(){
  // The normal SDK request is preferred. On some iOS Safari versions its server
  // read fails despite successful authentication; try a fresh REST read instead.
  try{
    let timer;
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Firestore SDK server read timed out')),12000);
    });
    let snapshot;
    try{snapshot=await Promise.race([fns.getDocsFromServer(collectionRef()),timeout]);}
    finally{clearTimeout(timer);}
    const result=[];
    snapshot.forEach(s=>{const rec=s.data();if(validCloudRecord(rec))result.push(rec);});
    return result;
  }catch(sdkError){
    try{return await fetchCloudViaREST();}
    catch(restError){
      const sdkDescription=sdkError?.code||sdkError?.message||'unknown SDK error';
      throw new Error(`Live cloud read failed. SDK: ${sdkDescription}. REST: ${restError.message}. No data was merged.`);
    }
  }
}
function maybeBackup(){host.downloadBackup();}
async function prepareInitialMerge(){
  if(!user||busy||meta?.enabled)return;
  if(!confirm('FORGE will download an additional local JSON backup and inspect your cloud records. Nothing is changed or uploaded during this review. Continue?'))return;
  maybeBackup();busy=true;setStatus('Reviewing records…');
  try{
    const current=host.getState(),remote=await fetchCloud();
    const result=makeInitialMerge(current,remote,uid);
    const fresh=COLLECTIONS.every(k=>!current[k]?.length)&&!current.activeWorkout&&!current.activeCardio&&!current.favorites?.length&&!current.foodFavorites?.length;
    if(fresh){
      const remoteSettings=remote.find(x=>x.kind==='settings'&&!x.deleted);
      if(remoteSettings){result.merged.settings={...current.settings,...remoteSettings.value};result.settingConflicts=[];}
      result.uploads=result.uploads.filter(x=>x.kind!=='settings'||!remote.some(r=>r.kind==='settings'));
    }
    preparedMerge={current,remote,result,fresh};
    setStatus('Merge review ready');
  }catch(err){preparedMerge=null;setStatus('Review failed',err.message);host.toast('Nothing changed: '+err.message,'error');}
  finally{busy=false;notify();}
}
async function confirmInitialMerge(){
  if(!user||busy||meta?.enabled||!preparedMerge)return;
  const {current,remote,result}=preparedMerge;
  if(!sameValue(host.getState(),current)){
    preparedMerge=null;setStatus('Review needs refresh','Local data changed after preview. Start a new review to avoid losing it.');
    return;
  }
  busy=true;setStatus('Preparing safe merge…');
  try{
    const previous=meta;
    meta={uid:user.uid,enabled:true,pending:{},baseline:{},conflicts:{},lastSync:null,deviceId:previous?.deviceId||deviceId};
    for(const rec of remote)meta.baseline[recordKey(rec.kind,rec.entityId)]={rev:rec.rev,value:rec.value,deleted:rec.deleted};
    initialSettingsConflict=result.settingConflicts.length?{key:recordKey('settings'),kind:'settings',entityId:'singleton',local:result.settingConflicts[0].local,remote:result.settingConflicts[0].remote,remoteRev:remote.find(r=>r.kind==='settings')?.rev}:null;
    if(initialSettingsConflict)meta.conflicts[initialSettingsConflict.key]=initialSettingsConflict;
    for(const rec of result.uploads){
      const key=recordKey(rec.kind,rec.entityId);
      if(rec.kind==='settings'&&initialSettingsConflict)continue;
      meta.pending[key]=createPending({...rec,key},meta.baseline[key]?.rev??0);
    }
    // Keep both datasets on this device before starting cloud uploads.
    host.replaceFromSync(result.merged);
    enabled=true;preparedMerge=null;await saveMeta();await syncNow();subscribeClock();
    host.toast('Account linked. Existing records were preserved and merged.');
  }catch(err){setStatus('Merge failed',err.message);host.toast('Cloud merge failed. Your JSON backup is safe: '+err.message,'error');}
  finally{busy=false;notify();}
}
async function recoverOfflineChanges(){
  if(!meta?.enabled)return true;
  const current=flatten(host.getState()),baseline=meta.baseline||{};
  const missing=Object.entries(baseline).filter(([key,base])=>
    !base.deleted && !current.has(key) && COLLECTIONS.includes(key.split('::')[0]) && !meta.pending[key]);
  const knownCount=Object.entries(baseline).filter(([key,base])=>
    COLLECTIONS.includes(key.split('::')[0])&&!base.deleted).length;
  // A vanished entire IndexedDB state is more likely storage loss than intended mass deletion.
  if(knownCount>0 && missing.length===knownCount && COLLECTIONS.every(kind=>!(host.getState()[kind]||[]).length) && !Object.keys(meta.pending||{}).length){
    meta.enabled=false;enabled=false;await saveMeta();
    setStatus('Local data needs review','Many previously synced records are missing locally. Automatic uploads are paused. Export a backup and review before reconnecting.');
    return false;
  }
  let changed=false;
  for(const [key,item] of current){
    if(meta.pending[key]||meta.conflicts[key])continue;
    const base=baseline[key];
    if(!base){meta.pending[key]=createPending({...item,key,deleted:false},0);changed=true;}
    else if(Object.hasOwn(base,'value') && (base.deleted||!sameValue(item.value,base.value))){
      meta.pending[key]=createPending({...item,key,deleted:false},base.rev);changed=true;
    }
  }
  for(const [key,base] of Object.entries(baseline)){
    if(meta.pending[key]||meta.conflicts[key]||current.has(key)||base.deleted||!Object.hasOwn(base,'value'))continue;
    const [kind,entityId]=key.split('::');
    if(!COLLECTIONS.includes(kind))continue;
    meta.pending[key]=createPending({key,kind,entityId,value:null,deleted:true},base.rev);changed=true;
  }
  if(changed)await saveMeta();
  return true;
}
async function startUserSession(nextUser){
  user=nextUser;connected=false;enabled=false;initialSettingsConflict=null;preparedMerge=null;
  if(remoteUnsub){remoteUnsub();remoteUnsub=null;}
  if(!nextUser){setStatus(configured?'Not signed in':'Not configured');return;}
  try{
    meta=await readMeta();
    if(meta&&meta.uid&&meta.uid!==nextUser.uid){setStatus('Account mismatch','This device was linked to a different account. No data will be uploaded.');return;}
    if(meta?.enabled){enabled=true;initialSettingsConflict=meta.conflicts?.[recordKey('settings')]||null;const ready=await recoverOfflineChanges();if(!ready)return;setStatus(navigator.onLine?'Connecting…':'Offline');subscribeClock();scheduleSync(50);}
    else{setStatus('Review first sync');}
  }catch(err){setStatus('Storage error',err.message);}
}
async function flush(){
  let changed=false,hadConflict=false;
  for(const [key,op] of Object.entries({...meta.pending})){
    if(!navigator.onLine)throw new Error('Device is offline');
    if(!safeToSync(op)){meta.conflicts[key]={...op,error:'Record exceeds safe cloud size; preserved locally'};hadConflict=true;continue;}
    const ref=itemRef(key),result=await fns.runTransaction(fireDB,async tx=>{
      const snap=await tx.get(ref),remote=snap.exists()?snap.data():null,rev=remote?.rev||0;
      if(rev!==op.baseRev){
        if(remote&&remote.deleted===op.deleted&&sameValue(remote.value,op.value))return {ok:true,rev,remote};
        return {ok:false,remote};
      }
      const next={kind:op.kind,entityId:op.entityId,value:op.deleted?null:op.value,deleted:op.deleted,rev:rev+1,editedBy:meta.deviceId,updatedAt:fns.serverTimestamp()};
      tx.set(ref,next);return {ok:true,rev:rev+1};
    });
    if(!result.ok){
      const remote=result.remote;
      meta.conflicts[key]={key,kind:op.kind,entityId:op.entityId,local:op.value,localDeleted:op.deleted,remote:remote?.value??null,remoteDeleted:remote?.deleted||false,remoteRev:remote?.rev||0};
      hadConflict=true;
    }else{
      const current=meta.pending[key];
      meta.baseline[key]={rev:result.rev,value:op.value,deleted:op.deleted};
      if(current?.opId===op.opId)delete meta.pending[key];
      else if(current)current.baseRev=result.rev;
      delete meta.conflicts[key];changed=true;
    }
    await saveMeta();
  }
  if(changed){await fns.setDoc(clockRef(),{writer:meta.deviceId,changedAt:fns.serverTimestamp()},{merge:true});}
  return hadConflict;
}
async function pull(){
  const remote=await fetchCloud(),changes=[],existing=flatten(host.getState());
  for(const doc of remote){
    const key=recordKey(doc.kind,doc.entityId);
    const base=meta.baseline[key]?.rev||0;
    if(meta.pending[key]||meta.conflicts[key])continue;
    if(doc.rev!==base){
      const local=existing.get(key);
      if(base===0&&local && (doc.deleted || !sameValue(local.value,doc.value))){
        // Unsynced local data (e.g. created before the cloud account connected) must not disappear.
        const copy=COLLECTIONS.includes(doc.kind)?{...local.value,id:uid(),syncRecoveredFrom:doc.entityId}:null;
        if(copy){changes.push({kind:doc.kind,entityId:copy.id,value:copy});const key2=recordKey(doc.kind,copy.id);meta.pending[key2]=createPending({key:key2,kind:doc.kind,entityId:copy.id,value:copy,deleted:false},0);}
        else if(doc.kind==='settings'&&!doc.deleted){
          meta.conflicts[key]={key,kind:doc.kind,entityId:'singleton',local:local.value,remote:doc.value,remoteRev:doc.rev};continue;
        }
      }
      changes.push({kind:doc.kind,entityId:doc.entityId,value:doc.value,deleted:doc.deleted});
    }
    meta.baseline[key]={rev:doc.rev,value:doc.value,deleted:doc.deleted};
  }
  if(changes.length)host.applyCloudChanges(changes);
  await saveMeta();
}
async function syncNow(){
  if(!configured||!user||!meta?.enabled||meta.uid!==user.uid)return;
  if(activeSync){runAgain=true;return activeSync;}
  if(!navigator.onLine){setStatus('Offline · pending');return;}
  activeSync=(async()=>{
    try{
      setStatus('Syncing…');await dbWrite;
      await flush();await pull();
      meta.lastSync=new Date().toISOString();lastSync=meta.lastSync;
      await saveMeta();connected=true;
      const conflicts=Object.keys(meta.conflicts||{}).length,pending=Object.keys(meta.pending||{}).length;
      setStatus(conflicts?`${conflicts} conflict${conflicts>1?'s':''}`:pending?`${pending} pending`:'Synced');
    }catch(err){setStatus(navigator.onLine?'Sync error':'Offline · pending',err.message);}
  })();
  try{await activeSync;}finally{activeSync=null;if(runAgain){runAgain=false;scheduleSync(800);}}
}
function scheduleSync(delay=1200){if(!meta?.enabled)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>{if(document.visibilityState!=='hidden')syncNow();},delay);}
function subscribeClock(){
  if(!user||!meta?.enabled||remoteUnsub)return;
  remoteUnsub=fns.onSnapshot(clockRef(),snap=>{
    const change=snap.data();
    if(change && change.writer!==meta.deviceId && !snap.metadata.hasPendingWrites) scheduleSync(1100);
  },err=>{setStatus('Sync error',err.message)});
}
async function resolveConflict(key,choice){
  const conflict=meta.conflicts?.[key];if(!conflict)return;
  if(choice==='remote'){
    if(!conflict.remoteDeleted)host.applyCloudChanges([{kind:conflict.kind,entityId:conflict.entityId,value:conflict.remote}]);
    else host.applyCloudChanges([{kind:conflict.kind,entityId:conflict.entityId,deleted:true}]);
    delete meta.pending[key];meta.baseline[key]={rev:conflict.remoteRev,value:conflict.remote,deleted:!!conflict.remoteDeleted};
  }else if(choice==='local'){
    meta.pending[key]=createPending({key,kind:conflict.kind,entityId:conflict.entityId,value:conflict.local,deleted:!!conflict.localDeleted},conflict.remoteRev);
    meta.baseline[key]={rev:conflict.remoteRev,value:conflict.remote,deleted:!!conflict.remoteDeleted};
  }else if(choice==='both'&&COLLECTIONS.includes(conflict.kind)){
    const copy={...conflict.local,id:uid(),syncRecoveredFrom:conflict.entityId};
    host.applyCloudChanges([{kind:conflict.kind,entityId:conflict.entityId,value:conflict.remote,deleted:conflict.remoteDeleted},{kind:conflict.kind,entityId:copy.id,value:copy}]);
    const newKey=recordKey(conflict.kind,copy.id);meta.pending[newKey]=createPending({key:newKey,kind:conflict.kind,entityId:copy.id,value:copy,deleted:false},0);
    delete meta.pending[key];meta.baseline[key]={rev:conflict.remoteRev,value:conflict.remote,deleted:!!conflict.remoteDeleted};
  }else return;
  delete meta.conflicts[key];if(key===recordKey('settings'))initialSettingsConflict=null;
  await saveMeta();scheduleSync(40);notify();
}
async function onBackupRestored(){
  if(!meta?.enabled)return;
  meta.enabled=false;meta.pending={};meta.conflicts={};meta.baseline={};await saveMeta();
  enabled=false;remoteUnsub?.();remoteUnsub=null;setStatus('Review restore');
  host.toast('Backup restored locally. Review first sync before reconnecting.');
}
function onSignOut(){user=null;enabled=false;remoteUnsub?.();remoteUnsub=null;clearTimeout(syncTimer);setStatus('Not signed in');}
async function handleAction(e){
  const btn=e.target.closest('[data-sync-action]');if(!btn)return;
  e.preventDefault();const type=btn.dataset.syncAction;
  try{
    if(type==='connect')await prepareInitialMerge();
    else if(type==='merge-confirm')await confirmInitialMerge();
    else if(type==='merge-cancel'){preparedMerge=null;setStatus('Review first sync');}
    else if(type==='retry')await syncNow();
    else if(type==='logout'){
      if(!confirm('Sign out of cloud sync on this device? Your local fitness data will remain on this device.'))return;
      await fns.signOut(auth);onSignOut();
    }else if(type==='resolve'){
      const key=btn.dataset.key,choice=btn.dataset.choice;
      if(choice==='local'&&!confirm('Overwrite the cloud version with this device’s version? The cloud version may be lost.'))return;
      await resolveConflict(key,choice);
    }
  }catch(err){setStatus('Sync error',err.message);host.toast(err.message,'error');}
}
async function handleForm(e){
  const form=e.target.closest('[data-sync-form]');if(!form)return;
  e.preventDefault();if(!configured||!auth)return;
  const kind=form.dataset.syncForm,data=new FormData(form),email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');
  const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=true;
  try{
    if(kind==='login')await fns.signInWithEmailAndPassword(auth,email,password);
    form.reset();
  }catch(err){setStatus('Sign-in error',err.message);host.toast('Account: '+err.message,'error');}
  finally{if(submit?.isConnected)submit.disabled=false;}
}
function panelHTML(){
  const btn=(action,label,cls='btn',extra='')=>`<button type="button" class="${cls}" data-sync-action="${action}" ${extra}>${label}</button>`;
  const count=meta?.pending?Object.keys(meta.pending).length:0;
  const conflicts=meta?.conflicts?Object.entries(meta.conflicts):[];
  let body='';
  if(!configured)body=`<div class="info-box">Cloud sync has not been configured. Your local tracker and exports still work. Follow the included <b>FREE-SYNC-SETUP.md</b> to create a no-billing Firebase Spark project. Then add its PUBLIC web configuration to <code>firebase-config.js</code> and publish the files. Do not paste passwords or private keys into source code.</div>`;
  else if(!user)body=`<p class="micro">Sign in with the same private account on your MacBook and iPhone. Your local data remains available even when signed out.</p><form data-sync-form="login" class="stack"><label class="field">Email<input name="email" type="email" autocomplete="username" required></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><button type="submit" class="btn primary full">Sign in</button></form><p class="micro" style="margin-top:14px">Create your one private account through Firebase Console → Authentication → Users → Add user. Do not enable billing.</p>`;
  else if(meta?.uid && meta.uid!==user.uid)body=`<div class="notice error">This device was previously linked to a different cloud account. No data will upload. Sign in with the original account or preserve your local data with a JSON backup before switching accounts.</div>${btn('logout','Sign out','btn')}`;
  else if(!meta?.enabled){
    if(preparedMerge){
      const {remote,result}=preparedMerge;
      body=`<div class="info-box"><b>Review before enabling sync</b><p>Local and cloud data are still untouched. Your JSON backup was downloaded before this review.</p><div class="row between"><span>Records already in cloud</span><b>${remote.filter(x=>!x.deleted).length}</b></div><div class="row between"><span>New records to upload</span><b>${result.uploads.length}</b></div><div class="row between"><span>Conflicting versions saved as copies</span><b>${result.forks}</b></div><div class="row between"><span>Settings conflicts needing your choice</span><b>${result.settingConflicts.length}</b></div></div><div class="row wrap" style="margin-top:14px">${btn('merge-confirm','Confirm safe merge','btn primary')}${btn('merge-cancel','Cancel','btn')}</div>`;
    } else body=`<div class="info-box">Signed in as <b>${escapeHTML(user.email)}</b>. Your existing local records have NOT been uploaded or replaced. Export a backup and choose Review & safely merge when you're ready.</div><div class="stack" style="margin-top:12px">${btn('connect','Review & safely merge my data','btn primary full')}${btn('logout','Sign out','btn full ghost')}</div>`;
  }
  else{
    body=`<div class="row between wrap"><div><div class="micro">Connected account</div><b>${escapeHTML(user.email)}</b></div><span class="tag ${statusLabel==='Synced'?'lime':''}">${escapeHTML(statusLabel)}</span></div><div class="divider"></div><div class="row between"><span>Last successful sync</span><span class="micro">${meta.lastSync?escapeHTML(new Date(meta.lastSync).toLocaleString()):'Never'}</span></div><div class="row between"><span>Pending changes</span><b>${count}</b></div>${error?`<div class="notice error">${escapeHTML(error)}</div>`:''}<div class="row wrap" style="margin-top:16px">${btn('retry','↻ Sync now','btn primary')}${btn('logout','Sign out','btn')}</div>`;
    if(conflicts.length)body+=`<div class="divider"></div><h3>Records requiring your decision (${conflicts.length})</h3><p class="micro">Nothing is overwritten automatically. Export a backup before choosing Keep mine.</p>${conflicts.map(([key,c])=>`<div class="card soft" style="margin-top:10px"><b>${escapeHTML(labels[c.kind]||c.kind)} · ${escapeHTML(c.entityId)}</b><p class="micro">${escapeHTML(c.error||'Both devices changed this record. Choose which to keep, or preserve both copies.')}</p><div class="row wrap">${c.error?'':`${btn('resolve','Use cloud','btn small',`data-key="${escapeHTML(key)}" data-choice="remote"`)}${btn('resolve','Keep mine','btn small danger',`data-key="${escapeHTML(key)}" data-choice="local"`)}${COLLECTIONS.includes(c.kind)&&!c.localDeleted&&c.local?btn('resolve','Keep both','btn small',`data-key="${escapeHTML(key)}" data-choice="both"`):''}`}</div></div>`).join('')}`;
  }
  return `<div class="card" id="forge-sync-panel"><div class="card-head"><h3>Private device synchronization</h3><span class="tag">Firebase Spark · €0 plan only</span></div>${body}<p class="micro" style="margin-top:15px">GitHub Pages only hosts the app code. Fitness records stay in IndexedDB and, when connected, in your own Firebase project. No paid features are used. If the cloud is unavailable, log workouts offline and export regular JSON backups.</p></div>`;
}
async function initialize(){
  await host.ready;
  if(!configured){notify();return;}
  if(sdkStarting||fns)return;
  sdkStarting=true;
  try{
    metaDb=metaDb||await openMetaDB();
    const version='13.3.0',base=`https://www.gstatic.com/firebasejs/${version}/`;
    const [appMod,authMod,fireMod]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
    fns={...authMod,...fireMod};
    const app=appMod.initializeApp(cfg);
    auth=authMod.getAuth(app);
    // Safari/iOS can require long polling. Desktop uses the SDK default.
    // Changing this does not alter local or cloud records.
    const isIOSWebKit=/iPad|iPhone|iPod/.test(navigator.userAgent)||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    fireDB=isIOSWebKit
      ? fireMod.initializeFirestore(app,{experimentalForceLongPolling:true})
      : fireMod.getFirestore(app);
    await authMod.setPersistence(auth,authMod.browserLocalPersistence);
    authMod.onAuthStateChanged(auth,async nextUser=>{await startUserSession(nextUser);authReady=true;},err=>setStatus('Auth error',err.message));
  }catch(err){setStatus('Cloud unavailable',err.message);}
  finally{sdkStarting=false;}
}
window.FORGE_SYNC={panelHTML,status:()=>statusLabel,onLocalUpdate,onBackupRestored};
document.addEventListener('click',handleAction);
document.addEventListener('submit',handleForm);
window.addEventListener('online',()=>{if(configured&&!fns)initialize();else scheduleSync(600);});
window.addEventListener('offline',()=>{if(meta?.enabled)setStatus('Offline · pending');});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleSync(450);});
initialize();
