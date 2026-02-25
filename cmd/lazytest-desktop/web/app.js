const state={tab:'workspace',workspace:{envName:'dev',authProfile:'default-jwt'},endpoints:[],selected:null,lastRun:null,reports:[],history:[]}
const go=()=>window.go?.desktop?.App
function tab(t){state.tab=t;render()}
async function loadWorkspace(){try{state.workspace=await go().LoadWorkspace()}catch{}}
async function saveWorkspace(){await go().SaveWorkspace(state.workspace); alert('saved')}
async function pick(field,pattern){const p=await go().OpenFileDialog(pattern); if(p){state.workspace[field]=p;render()}}
async function loadSpec(){await go().SaveWorkspace(state.workspace); const sum=await go().LoadSpec(state.workspace.specPath); state.summary=sum; state.endpoints=await go().ListEndpoints({}); render()}
async function buildReq(){if(!state.selected)return; state.req=await go().BuildExampleRequest(state.selected.id,state.workspace.envName,state.workspace.authProfile,{baseURL:state.workspace.baseURL||''}); render()}
async function sendReq(){const res=await go().SendRequest(state.req); state.res=res; state.history.unshift({req:state.req,res}); render()}
async function startSmoke(all=true){const ids=all?[]:(state.selected?[state.selected.id]:[]); state.lastRun=await go().StartSmoke({runAll:all,endpointIDs:ids,workers:4,rateLimit:10,timeoutMS:5000,exportDir:'./out'});}
async function startDrift(){if(!state.selected)return; state.lastRun=await go().StartDrift({endpointID:state.selected.id,timeoutMS:5000,exportDir:'./out'})}
async function startCompare(){if(!state.selected)return; state.lastRun=await go().StartCompare({endpointID:state.selected.id,envA:document.getElementById('envA').value,envB:document.getElementById('envB').value})}
async function startLT(){const p=await go().OpenFileDialog('*.yaml'); if(!p)return; state.lastRun=await go().StartLT(p,{maxErrorPct:5,maxP95Ms:1000})}
async function startTCP(){const p=await go().OpenFileDialog('*.yaml'); if(!p)return; state.lastRun=await go().StartTCP(p,{})}
async function cancelRun(){if(state.lastRun)await go().CancelRun(state.lastRun)}
async function refreshReports(){state.reports=await go().ListReports(); render()}

if(window.runtime){runtime.EventsOn('run.progress',e=>{state.progress=e;render()});runtime.EventsOn('run.metrics',e=>{state.metrics=e;render()});runtime.EventsOn('run.done',e=>{state.done=e;refreshReports()})}

function render(){const v=document.getElementById('view');
if(state.tab==='workspace'){v.innerHTML=`<h3>Workspace</h3>
<div class=row><input value="${state.workspace.specPath||''}" oninput="state.workspace.specPath=this.value"><button onclick="pick('specPath','*.yaml;*.yml;*.json')">Spec</button></div>
<div class=row><input value="${state.workspace.envPath||''}" oninput="state.workspace.envPath=this.value"><button onclick="pick('envPath','*.yaml;*.yml')">env.yaml</button></div>
<div class=row><input value="${state.workspace.authPath||''}" oninput="state.workspace.authPath=this.value"><button onclick="pick('authPath','*.yaml;*.yml')">auth.yaml</button></div>
<div class=row><input placeholder="baseURL override" value="${state.workspace.baseURL||''}" oninput="state.workspace.baseURL=this.value"></div>
<div class=row><button onclick="saveWorkspace()">Save Workspace</button><button onclick="loadSpec()">Load Spec</button></div>
<div>${state.summary?`Loaded: ${state.summary.endpointCount} endpoints`:''}</div>`}
if(state.tab==='explorer'){v.innerHTML=`<h3>Explorer + Request Builder</h3><div class=row><input placeholder='filter' oninput='filterEp(this.value)'></div><div id='epList'></div><h4>Request</h4><button onclick='buildReq()'>Build Example</button><button onclick='sendReq()'>Send</button><pre class='mono'>${JSON.stringify(state.req||{},null,2)}</pre><h4>Response</h4><pre class='mono'>${JSON.stringify(state.res||{},null,2)}</pre>`; renderEndpoints(state.endpoints)}
if(state.tab==='smoke'){v.innerHTML=`<h3>Smoke</h3><button onclick='startSmoke(false)'>Selected</button><button onclick='startSmoke(true)'>All</button><button onclick='cancelRun()'>Cancel</button><pre class='mono'>${JSON.stringify(state.progress||{},null,2)}</pre><pre class='mono'>${JSON.stringify(state.done||{},null,2)}</pre>`}
if(state.tab==='drift'){v.innerHTML=`<h3>Drift</h3><button onclick='startDrift()'>Run Drift for Selected</button><pre class='mono'>${JSON.stringify(state.progress||{},null,2)}</pre><pre class='mono'>${JSON.stringify(state.done||{},null,2)}</pre>`}
if(state.tab==='compare'){v.innerHTML=`<h3>A/B Compare</h3><input id='envA' placeholder='envA' value='dev'><input id='envB' placeholder='envB' value='test'><button onclick='startCompare()'>Run Compare</button><pre class='mono'>${JSON.stringify(state.done||{},null,2)}</pre>`}
if(state.tab==='lt'){v.innerHTML=`<h3>Load Test</h3><button onclick='startLT()'>Select plan + Run</button><button onclick='cancelRun()'>Stop</button><pre class='mono'>${JSON.stringify(state.metrics||{},null,2)}</pre>`}
if(state.tab==='tcp'){v.innerHTML=`<h3>TCP Test</h3><button onclick='startTCP()'>Select plan + Run</button><button onclick='cancelRun()'>Stop</button><pre class='mono'>${JSON.stringify(state.progress||{},null,2)}</pre>`}
if(state.tab==='reports'){v.innerHTML=`<h3>Reports</h3><button onclick='refreshReports()'>Refresh</button><pre class='mono'>${JSON.stringify(state.reports||[],null,2)}</pre>`}
}
function filterEp(q){go().ListEndpoints({query:q}).then(e=>{state.endpoints=e;renderEndpoints(e)})}
function renderEndpoints(arr){const l=document.getElementById('epList'); if(!l)return; l.innerHTML=arr.map(e=>`<div class='list-item' onclick='sel("${e.id}")'>${e.method} ${e.path}</div>`).join('')}
function sel(id){state.selected=state.endpoints.find(e=>e.id===id); buildReq()}
loadWorkspace().then(render)
