/* FORGE sync: pure data transformations. No network or browser dependencies. */
export const COLLECTIONS = Object.freeze([
  'exercises', 'programs', 'workouts', 'bodyRecords', 'goals',
  'foodsCustom', 'savedMeals', 'foodLogs', 'cardioSessions', 'sleepRecords'
]);
export const SINGLETONS = Object.freeze(['favorites', 'foodFavorites', 'settings']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function recordKey(kind, id='singleton') { return `${kind}::${id}`; }
export function flatten(state) {
  const records = new Map();
  for (const kind of COLLECTIONS) {
    for (const item of Array.isArray(state[kind]) ? state[kind] : []) {
      if (item && typeof item.id === 'string' && item.id.length && item.id.length < 512) {
        records.set(recordKey(kind,item.id), {kind,entityId:item.id,value:structuredClone(item)});
      }
    }
  }
  for (const kind of SINGLETONS) {
    if (own(state,kind)) records.set(recordKey(kind),{kind,entityId:'singleton',value:structuredClone(state[kind])});
  }
  return records;
}
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function sameValue(a,b) { return JSON.stringify(canonical(a))===JSON.stringify(canonical(b)); }
export function changedRecords(before,after) {
  const left=flatten(before), right=flatten(after), result=[];
  for(const key of new Set([...left.keys(),...right.keys()])) {
    const a=left.get(key),b=right.get(key);
    if(!a || !b || !sameValue(a.value,b.value)) {
      const item=b||a;
      result.push({key,kind:item.kind,entityId:item.entityId,value:b?.value??null,deleted:!b});
    }
  }
  return result;
}
export function applyRecords(state,changes) {
  for(const change of changes) {
    const {kind,entityId,value,deleted}=change;
    if(COLLECTIONS.includes(kind)) {
      if(!Array.isArray(state[kind])) state[kind]=[];
      const index=state[kind].findIndex(x=>x?.id===entityId);
      if(deleted){if(index!==-1)state[kind].splice(index,1);}
      else if(value && typeof value==='object' && !Array.isArray(value)) {
        const item={...structuredClone(value),id:entityId};
        if(index!==-1)state[kind][index]=item;else state[kind].push(item);
      }
    } else if(kind==='settings' && !deleted && value && typeof value==='object' && !Array.isArray(value)) {
      state.settings={...state.settings,...structuredClone(value),targets:{...state.settings.targets,...value.targets}};
    } else if(['favorites','foodFavorites'].includes(kind) && !deleted && Array.isArray(value)) {
      state[kind]=structuredClone(value);
    }
  }
  return state;
}
export function validCloudRecord(rec) {
  return !!rec && typeof rec==='object' &&
    [...COLLECTIONS,...SINGLETONS].includes(rec.kind) &&
    typeof rec.entityId==='string' &&
    Number.isSafeInteger(rec.rev) && rec.rev>0 &&
    typeof rec.deleted==='boolean' &&
    (rec.deleted || rec.value !== undefined) &&
    (rec.entityId==='singleton' ? SINGLETONS.includes(rec.kind) : COLLECTIONS.includes(rec.kind));
}
export function makeInitialMerge(localState,cloudRecords,newId) {
  const local=flatten(localState), merged=structuredClone(localState),cloud=new Map();
  for(const doc of cloudRecords)if(validCloudRecord(doc))cloud.set(recordKey(doc.kind,doc.entityId),doc);
  const uploads=[],imports=[],forks=[],settingConflicts=[];
  for(const [key,doc] of cloud) {
    const localItem=local.get(key);
    if(!localItem) { if(!doc.deleted)imports.push({kind:doc.kind,entityId:doc.entityId,value:doc.value}); continue; }
    if(doc.deleted){
      if(COLLECTIONS.includes(doc.kind)) {
        const id=newId(),copy={...localItem.value,id,syncRecoveredFrom:doc.entityId};
        forks.push({kind:doc.kind,entityId:id,value:copy});
        imports.push({kind:doc.kind,entityId:doc.entityId,deleted:true});
        uploads.push({kind:doc.kind,entityId:id,value:copy,deleted:false});
      }
    }else if(!sameValue(localItem.value,doc.value)) {
      if(COLLECTIONS.includes(doc.kind)){
        const id=newId(),copy={...localItem.value,id,syncRecoveredFrom:doc.entityId};
        forks.push({kind:doc.kind,entityId:id,value:copy});
        imports.push({kind:doc.kind,entityId:doc.entityId,value:doc.value});
        uploads.push({kind:doc.kind,entityId:id,value:copy,deleted:false});
      }else if(doc.kind==='favorites'||doc.kind==='foodFavorites') {
        imports.push({kind:doc.kind,entityId:'singleton',value:[...new Set([...localItem.value,...doc.value])]});
        uploads.push({kind:doc.kind,entityId:'singleton',value:[...new Set([...localItem.value,...doc.value])],deleted:false});
      }else {
        settingConflicts.push({local:localItem.value,remote:doc.value});
        // Keep local settings and let user resolve through a later explicit conflict.
      }
    }
  }
  const existed=new Set(cloud.keys());
  for(const [key,item] of local) if(!existed.has(key)) uploads.push({...item,deleted:false});
  applyRecords(merged,imports);
  applyRecords(merged,forks);
  // Preserve original local settings when there is a conflict.
  return {merged,uploads,imports:imports.length,forks:forks.length,settingConflicts,cloud};
}
export function createPending(change, baseRev=0) {
  return {...structuredClone(change),baseRev,opId:(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)),at:new Date().toISOString()};
}
export function safeToSync(record) {
  // Firestore document size is 1 MiB; leave room for metadata and protocol overhead.
  return !!record && JSON.stringify(record.value??null).length<700000;
}
