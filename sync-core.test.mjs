import assert from 'node:assert/strict';
import {test} from 'node:test';
import {flatten, changedRecords, applyRecords, makeInitialMerge, recordKey, safeToSync, validCloudRecord, sameValue} from './sync-core.mjs';
const newState=()=>({settings:{days:4,targets:{protein:150,calories:2400}}, favorites:[],foodFavorites:[], exercises:[],programs:[],workouts:[],bodyRecords:[],goals:[],foodsCustom:[],savedMeals:[],foodLogs:[],cardioSessions:[],sleepRecords:[],activeWorkout:null,activeCardio:null});
let n=0;const next=()=>`fork-${++n}`;
const cloud=(kind,id,value,rev=1,deleted=false)=>({kind,entityId:id,value,rev,deleted});

test('every personal record type is represented, but active sessions are local',()=>{
 const s=newState();s.activeWorkout={id:'draft'};
 for(const key of ['exercises','programs','workouts','bodyRecords','goals','foodsCustom','savedMeals','foodLogs','cardioSessions','sleepRecords'])s[key].push({id:key});
 assert.equal(flatten(s).size,13);
 assert.equal(flatten(s).has('activeWorkout::draft'),false);
});
test('diff tracks new, updated, and deleted record IDs',()=>{
 const a=newState(),b=newState();a.workouts=[{id:'old',sets:2},{id:'remove'}];b.workouts=[{id:'old',sets:3},{id:'added'}];
 const d=changedRecords(a,b);assert.equal(d.length,3);
 assert.equal(d.find(x=>x.entityId==='remove').deleted,true);
 assert.equal(d.find(x=>x.entityId==='added').deleted,false);
 assert.equal(d.find(x=>x.entityId==='old').value.sets,3);
});
test('first sync safely unions independent history',()=>{
 const a=newState();a.workouts=[{id:'mac1',name:'Mac workout'}];
 const r=makeInitialMerge(a,[cloud('workouts','phone1',{id:'phone1',name:'Phone workout'})],next);
 assert.equal(r.merged.workouts.length,2);assert.equal(r.forks,0);
 assert.equal(r.uploads.find(x=>x.entityId==='mac1')?.value.name,'Mac workout');
});
test('first sync preserves both versions of same workout ID',()=>{
 const a=newState();a.workouts=[{id:'same',name:'Edited on Mac'}];
 const r=makeInitialMerge(a,[cloud('workouts','same',{id:'same',name:'Edited on phone'},2)],next);
 assert.equal(r.merged.workouts.length,2);assert.equal(r.forks,1);
 assert.deepEqual(new Set(r.merged.workouts.map(x=>x.name)),new Set(['Edited on Mac','Edited on phone']));
 assert.equal(r.uploads[0].value.syncRecoveredFrom,'same');
});
test('cloud tombstones do not erase unknown local record during first sync',()=>{
 const a=newState();a.bodyRecords=[{id:'d1',weight:84}];
 const r=makeInitialMerge(a,[cloud('bodyRecords','d1',null,5,true)],next);
 assert.equal(r.merged.bodyRecords.length,1);assert.notEqual(r.merged.bodyRecords[0].id,'d1');
 assert.equal(r.merged.bodyRecords[0].weight,84);
});
test('favorites union and singleton settings conflicts need explicit review',()=>{
 const a=newState();a.favorites=['pushup'];
 const r=makeInitialMerge(a,[cloud('favorites','singleton',['pullup']),cloud('settings','singleton',{days:5,targets:{protein:140,calories:2200}})],next);
 assert.deepEqual(r.merged.favorites,['pushup','pullup']);
 assert.equal(r.settingConflicts.length,1);assert.equal(r.merged.settings.days,4);
});
test('remote mutations apply by stable ID without changing active session',()=>{
 const a=newState();a.activeWorkout={id:'unfinished'};a.workouts=[{id:'w1',name:'Old'},{id:'w2'}];
 applyRecords(a,[{kind:'workouts',entityId:'w1',value:{id:'w1',name:'New'}},{kind:'workouts',entityId:'w2',deleted:true},{kind:'workouts',entityId:'w3',value:{id:'w3',name:'Added'}}]);
 assert.deepEqual(a.workouts.map(w=>w.name),['New','Added']);assert.equal(a.activeWorkout.id,'unfinished');
});
test('reject unsupported and oversized documents',()=>{
 assert.equal(validCloudRecord(cloud('workouts','x',{id:'x'})),true);
 assert.equal(validCloudRecord(cloud('someOtherKind','x',{id:'x'})),false);
 assert.equal(safeToSync({value:{note:'x'.repeat(700000)}}),false);
});

test('object property insertion order does not create duplicate conflicts',()=>{
 assert.equal(sameValue({id:'w1',notes:'done',sets:[{reps:8,weight:60}]},{sets:[{weight:60,reps:8}],notes:'done',id:'w1'}),true);
});
