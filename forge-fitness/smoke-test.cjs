/** Dependency-free rendering & calculation smoke tests. Run: node smoke-test.cjs */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes={'#app':{innerHTML:''},'#modal-root':{innerHTML:''},'#import-file':{addEventListener(){}}};
const shim={console:{...console,warn(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,Date,Math,JSON,Number,String,Array,Promise,Set,Map,Intl,structuredClone,crypto:require('node:crypto').webcrypto,location:{protocol:'file:'},navigator:{},confirm:()=>true,prompt:()=>null,window:{scrollTo(){}},document:{querySelector:s=>nodes[s]||null,querySelectorAll:()=>[],addEventListener(){},body:{append(){}},createElement:()=>({click(){},remove(){}})},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob};
shim.globalThis=shim;vm.createContext(shim);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8')+'\nglobalThis.test={pages,generateProgram,exercise,foodMacros,derivePRs,volume,validSets,periodReport,foodDaily};globalThis.stateRef=()=>state;',shim);
(async()=>{await Promise.resolve();await Promise.resolve();const t=shim.test,s=shim.stateRef();
 for(const [name,render]of Object.entries(t.pages)){const html=render();assert.equal(typeof html,'string',name);assert.ok(html.length>100,name)}
 const plan=t.generateProgram(4,60,'gym','beginner');assert.equal(plan.sessions.length,4);assert.ok(plan.sessions.every(x=>x.exercises.length>=3));
 const home=t.generateProgram(3,45,'home','beginner');assert.ok(home.sessions.flatMap(x=>x.exercises).every(x=>s.settings.homeEquipment.includes(t.exercise(x.exerciseId).equipment)));
 const macros=t.foodMacros({foodId:'f-chicken',amount:200,unit:'g'});assert.equal(macros.kcal,330);assert.equal(macros.protein,62);
 s.workouts.push({id:'test-session',name:'Test workout',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),durationSec:1800,exercises:[{uid:'wx',exerciseId:'db-bench',notes:'',sets:[{id:'set1',reps:10,weight:20,rpe:7,rir:3,complete:true,skipped:false}]}]});
 s.foodLogs.push({id:'food-test',foodId:'f-chicken',date:new Date().toISOString().slice(0,10),meal:'Lunch',amount:100,unit:'g'});
 assert.equal(t.validSets(s.workouts[0]),1);assert.equal(t.volume(s.workouts[0]),200);assert.equal(t.foodDaily().kcal,165);
 for(const [name,render]of Object.entries(t.pages)){assert.ok(render().length>100,name+' populated')}
 console.log('PASS: 10 pages, generated plans, equipment filtering, macros, weighted volume, populated dashboards.');
})().catch(e=>{console.error(e);process.exitCode=1});
