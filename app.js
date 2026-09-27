const $ = s => document.querySelector(s);
const app = $('#app');
const KEY = 'arc-state-v12';
const VERSION = '1.2 Final';

const defaults = {
  tab: 'today',
  checkin: { feeling: 'good', legs: 'normal', time: 30, activity: 'nothing', pain: 'none' },
  mode: 'consistency',
  history: [],
  goal: '',
  goalDate: '',
  checkinDate: '',
  lastPlan: null,
  installedHint: false,
  installPrompt: null,
  setupComplete: false,
  profile: { experience: 'intermediate', weeklyMiles: 15, longestRecent: 6, preferredMinutes: 45 },
  coachNotes: []
};

let state = load();
let deferredInstallPrompt = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...defaults,
      ...saved,
      checkin: { ...defaults.checkin, ...(saved.checkin || {}) },
      history: Array.isArray(saved.history) ? saved.history : [],
      profile: { ...defaults.profile, ...(saved.profile || {}) },
      coachNotes: Array.isArray(saved.coachNotes) ? saved.coachNotes : []
    };
  } catch { return { ...defaults, checkin: { ...defaults.checkin }, history: [] }; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function toast(t) { const x = $('#toast'); if (!x) return; x.textContent = t; x.classList.add('show'); setTimeout(() => x.classList.remove('show'), 1800); }
function dateKey(d = new Date()) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
function dateFromKey(k) { return new Date(`${k}T12:00:00`); }
function fmt(k) { return dateFromKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function daysAgo(n) { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-n); return dateKey(d); }
function escapeHtml(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function weekRuns() { const cutoff = daysAgo(6); return state.history.filter(r => r.date >= cutoff); }
function weekMiles() { return weekRuns().reduce((a,r) => a + Number(r.distance || 0), 0); }
function recentMiles(days=7) { const cutoff = daysAgo(days-1); return state.history.filter(r => r.date >= cutoff).reduce((a,r) => a + Number(r.distance || 0), 0); }
function recentHard(days=3) { const cutoff = daysAgo(days-1); return state.history.filter(r => r.date >= cutoff && ['moderate','hard'].includes(r.effort)).length; }
function recentRunCount(days=7) { const cutoff=daysAgo(days-1); return state.history.filter(r=>r.date>=cutoff).length; }
function loadStatus(){ const m=recentMiles(7); const h=recentHard(7); if(h>=3 || m>=45) return {label:'Back off',class:'red',text:'Training load is already high.'}; if(h>=2 || m>=28) return {label:'Building',class:'amber',text:'You are carrying meaningful load.'}; return {label:'Stable',class:'green',text:'Room for gradual progress.'}; }
function setupView(){ return `<div class="content"><div class="hero"><div class="eyebrow">FIRST RUN SETUP</div><h1>Let's make the coach yours.</h1><p>This takes about a minute. You can change it later.</p></div><div class="card"><div class="question"><label>Running experience</label><div class="choices">${[['beginner','New'],['returning','Returning'],['intermediate','Intermediate'],['advanced','Experienced']].map(x=>`<button class="choice ${state.profile.experience===x[0]?'selected':''}" data-profile="experience" data-value="${x[0]}">${x[1]}</button>`).join('')}</div></div><div class="question"><label>Typical weekly mileage</label><input id="weeklyMiles" class="field" type="number" min="0" step="1" value="${state.profile.weeklyMiles}"></div><div class="question"><label>Longest recent run (miles)</label><input id="longestRecent" class="field" type="number" min="0" step="0.5" value="${state.profile.longestRecent}"></div><div class="question"><label>Typical time available</label><div class="choices time">${[15,30,45,60,90].map(v=>`<button class="choice ${Number(state.profile.preferredMinutes)===v?'selected':''}" data-profile="preferredMinutes" data-value="${v}">${v===90?'90+':v}<small>min</small></button>`).join('')}</div></div><button class="primary" id="finishSetup">Build my coach →</button></div><div class="micro-note">The coach uses these as starting points, not permanent limits.</div></div>`; }
function currentStreak() {
  const days = new Set(state.history.map(r => r.date));
  let streak = 0;
  for (let i=0; i<365; i++) {
    if (days.has(daysAgo(i))) streak++;
    else if (i > 0) break;
  }
  return streak;
}
function longestStreak() {
  const days = [...new Set(state.history.map(r => r.date))].sort();
  let best=0, run=0, prev=null;
  for (const d of days) {
    if (prev) { const diff=(dateFromKey(d)-dateFromKey(prev))/86400000; run = diff===1 ? run+1 : 1; }
    else run=1;
    best=Math.max(best,run); prev=d;
  }
  return best;
}
function lastRun() { return [...state.history].sort((a,b)=>b.date.localeCompare(a.date))[0]; }
function modeLabel(m) { return ({consistency:'Consistency',hyrox:'HYROX',marathon:'Marathon',mountain:'Mountain / Hybrid',fitness:'General Fitness'})[m] || 'Consistency'; }

function addCoachNote(note){ if(!note) return; state.coachNotes=[note,...state.coachNotes.filter(x=>x!==note)].slice(0,8); save(); }
function plan() {
  const c=state.checkin;
  const f={great:3,good:2,tired:1,wiped:0}[c.feeling];
  const l={great:3,normal:2,heavy:1,beatup:0}[c.legs];
  const fatigue=(3-f)+(3-l);
  const cross=['hyrox','strength','orangetheory'].includes(c.activity);
  const load7=recentMiles(7);
  const hard3=recentHard(3);
  let p={type:'Easy Run',min:1,target:c.time>=45?3:2,opt:c.time>=60?'4–5':'3',why:[],pace:'Conversational pace',focus:'Aerobic / Recovery',quality:false};

  if (c.pain === 'significant') {
    p={type:'Rest / Recovery',min:0,target:0,opt:'Walk only if comfortable',why:['Significant pain changes the risk, so running is not the prescription today.','If pain is severe, worsening, or concerning, consider appropriate medical evaluation.'],pace:'No running',focus:'Protect the habit',quality:false};
  } else if (c.pain === 'minor') {
    p={type:'Recovery / Walk-Run',min:0,target:1,opt:'2 easy',why:['You reported some pain, so today is deliberately conservative.','Only continue if symptoms stay comfortable and do not worsen.'],pace:'Walk or very easy run only if comfortable',focus:'Protect the habit',quality:false};
  } else if (c.legs==='beatup'||c.feeling==='wiped') {
    p={type:'Recovery Run',min:1,target:1,opt:'2',why:['Your recovery signals are asking for less today.','The minimum keeps the routine alive without adding unnecessary load.'],pace:'Very easy / conversational',focus:'Recovery',quality:false};
  } else if (hard3>=2 || (load7>=28 && fatigue>=2) || cross) {
    p={type:'Easy Run',min:1,target:c.time>=45?3:2,opt:c.time>=60?'4':'3',why:['Recent training already carries meaningful load.','Today protects consistency without stacking another hard session.'],pace:'Conversational pace',focus:'Aerobic / Recovery',quality:false};
  } else if (state.mode==='marathon' && c.feeling!=='tired' && c.legs!=='heavy') {
    const long = c.time>=75;
    p={type:long?'Long Easy Run':'Easy Marathon Run',min:long?3:2,target:long?Math.max(6, Math.round(Math.min(12, load7*0.65 || 6))):3,opt:long?'+'+(c.time>=90?'2':'1'):'4',why:['The marathon mode builds durable aerobic volume while respecting recent load.','The minimum protects consistency; the target is the training objective.'],pace:'Easy, controlled, conversational',focus:'Marathon Base',quality:false};
  } else if (state.mode==='hyrox'&&c.feeling==='great'&&c.legs==='great') {
    p={type:'HYROX + Run',min:2,target:c.time>=45?4:3,opt:'5',why:['You reported strong legs and good energy.','Today can carry a little quality while staying compatible with hybrid training.'],pace:'Easy with 4 × 2 min controlled hard',focus:'Hybrid',quality:true};
  } else if (state.mode==='mountain'&&c.feeling==='great'&&c.legs!=='heavy') {
    p={type:'Mountain Run',min:2,target:c.time>=60?5:4,opt:'6',why:['You have enough recovery for terrain-specific work.','Hills build useful strength without requiring a huge mileage day.'],pace:'Effort-based: easy uphill, relaxed downhill',focus:'Mountain / Hybrid',quality:true};
  } else if (c.feeling==='great'&&c.legs==='great'&&c.time>=60 && hard3===0) {
    p={type:'Progression Run',min:3,target:5,opt:'6–7',why:['You reported strong recovery and enough time.','A controlled progression gives you quality without turning every good day into a hard day.'],pace:'Easy → steady → comfortably hard finish',focus:'Aerobic Development',quality:true};
  } else {
    p={type:'Easy Run',min:1,target:c.time>=45?3:2,opt:c.time>=60?'4–5':'3',why:['Today is about consistency first.','An easy run supports aerobic development while leaving room for tomorrow.'],pace:'Conversational pace',focus:'Aerobic / Recovery',quality:false};
  }
  return p;
}

function checkinView() {
  const c=state.checkin;
  return `<div class="content"><div class="hero"><div class="eyebrow">${fmt(dateKey())} · ${modeLabel(state.mode)}</div><h1>How are you today?</h1><p>Thirty seconds. Then the coach builds today's prescription around you.</p></div>
  <div class="card">
  <div class="question"><label>Energy</label><div class="choices">${[['great','⚡','Great'],['good','🙂','Good'],['tired','😕','Tired'],['wiped','😣','Wiped']].map(x=>choice('feeling',x[0],x[1],x[2],c.feeling)).join('')}</div></div>
  <div class="question"><label>Legs</label><div class="choices">${[['great','🦵','Great'],['normal','🦵','Normal'],['heavy','🦵','Heavy'],['beatup','🦵','Beat up']].map(x=>choice('legs',x[0],x[1],x[2],c.legs)).join('')}</div></div>
  <div class="question"><label>Any pain or something that feels wrong?</label><div class="choices">${[['none','✓','No'],['minor','•','A little'],['significant','!','Significant']].map(x=>choice('pain',x[0],x[1],x[2],c.pain)).join('')}</div></div>
  <div class="question"><label>How much time do you have?</label><div class="choices time">${[15,30,45,60,90].map(v=>choice('time',v,v===90?'90+':v,v===90?'min':'min',c.time)).join('')}</div></div>
  <div class="question"><label>What else are you doing today?</label><div class="choices activity">${[['hyrox','🏋️','HYROX'],['strength','🏋️','Strength'],['orangetheory','🔥','Orangetheory'],['nothing','—','Nothing'],['other','•','Other']].map(x=>choice('activity',x[0],x[1],x[2],c.activity)).join('')}</div></div>
  <button class="primary" id="getRun">Build today's run →</button></div>
  <div class="micro-note">Your minimum run counts. Missing a day never creates a debt.</div></div>`;
}
function choice(set,val,icon,label,current){ return `<button class="choice ${String(current)===String(val)?'selected':''}" data-set="${set}" data-value="${val}">${icon}<small>${label}</small></button>`; }

function todayView() {
  const p=state.lastPlan || plan();
  const noRun=p.min===0;
  return `<div class="content"><div class="hero"><div class="eyebrow">TODAY'S PRESCRIPTION · ${modeLabel(state.mode)}</div><h1>${noRun?'Protect the habit.':`${p.target} Miles`}<br>${p.type}</h1><p>${noRun?'Today’s win is listening to the signal.':'Minimum counts. Optional is truly optional.'}</p></div>
  <div class="card run-card"><div class="run-image"></div><div class="run-body"><div class="pills"><span class="pill green">${p.focus}</span><span class="pill">${p.pace}</span></div>
  <div class="stats"><div class="stat"><b>${p.min}</b><span>MINIMUM</span></div><div class="stat"><b>${p.target}</b><span>TARGET</span></div><div class="stat"><b>${p.opt}</b><span>OPTIONAL</span></div></div>
  <p>${p.why[0]}</p>${noRun?'<button class="primary" id="restBtn">Take the recovery day</button>':'<button class="primary" id="startNrc">Run with Nike Run Club</button>'}<button class="secondary full" id="whyBtn">Why this run?</button></div></div>
  <div class="card"><h2>Last 7 days</h2>${weekStrip()}<div class="load-line"><span>${weekMiles().toFixed(1)} mi this week</span><span>${recentHard(7)} quality sessions</span></div><div class="load-status ${loadStatus().class}"><b>${loadStatus().label}</b><span>${loadStatus().text}</span></div></div>
  <div class="card"><h2>Coach note</h2>${p.why.map(w=>`<div class="why"><span class="check">✓</span><span>${w}</span></div>`).join('')}<div class="why"><span class="check">✓</span><span>You don't make up missed mileage. You adapt the next run.</span></div></div>
  <div class="navgrid"><button class="secondary" id="doneBtn">✓ I completed it</button><button class="secondary" id="recheckBtn">↻ Change workout</button></div></div>`;
}
function weekStrip(){ return `<div class="week-strip">${Array.from({length:7},(_,i)=>{const k=daysAgo(6-i), r=state.history.find(x=>x.date===k); return `<div class="day ${r?'done':''} ${k===dateKey()?'today':''}"><span>${dateFromKey(k).toLocaleDateString(undefined,{weekday:'narrow'})}</span><b>${r?r.distance.toFixed(1):'·'}</b></div>`}).join('')}</div>`; }

function planView(){ return `<div class="content"><div class="hero"><div class="eyebrow">TRAINING MODE</div><h1>Your plan follows you.</h1><p>Choose the focus. The daily prescription stays adaptive.</p></div><div class="card"><h2>Mode</h2><div class="choices activity">${[['consistency','∞','Consistency'],['hyrox','🏋️','HYROX'],['marathon','🏁','Marathon'],['mountain','⛰️','Mountain / Hybrid'],['fitness','⚡','General Fitness']].map(x=>`<button class="choice ${state.mode===x[0]?'selected':''}" data-mode="${x[0]}">${x[1]}<small>${x[2]}</small></button>`).join('')}</div></div>
  <div class="card"><h2>This week's guardrails</h2><div class="why"><span class="check">1</span><span>Protect consistency before chasing volume.</span></div><div class="why"><span class="check">2</span><span>Hard cross-training changes the run prescription.</span></div><div class="why"><span class="check">3</span><span>Pain changes the plan; it never earns a badge.</span></div><div class="why"><span class="check">4</span><span>A great day can still be an easy day.</span></div></div>
  <div class="card"><h2>Coach philosophy</h2><div class="why"><span class="check">✓</span><span>You don't follow a plan. The plan follows you.</span></div><div class="why"><span class="check">✓</span><span>Minimum runs count. Missed miles never become debt.</span></div><div class="why"><span class="check">✓</span><span>Good recovery is permission to train, not a command to go hard.</span></div></div><div class="card"><h2>Race / goal</h2><input id="goalInput" value="${escapeHtml(state.goal)}" placeholder="e.g. Mountain hybrid" class="field"><label class="field-label">Goal date <span>optional</span></label><input id="goalDate" type="date" value="${state.goalDate||''}" class="field"><button class="primary" id="saveGoal">Save goal</button>${state.goalDate?goalCountdown():''}</div></div>`; }
function goalCountdown(){ const days=Math.ceil((dateFromKey(state.goalDate)-new Date())/86400000); const msg=days>=0 ? (days+' days until '+escapeHtml(state.goal||'your goal')) : 'Goal date has passed — update it when you’re ready.'; return '<div class="goal-countdown">'+msg+'</div>'; }

function historyView(){
  const miles=state.history.reduce((a,r)=>a+Number(r.distance||0),0), runs=state.history.filter(r=>r.kind!=='recovery').length, longest=runs?Math.max(...state.history.filter(r=>r.kind!=='recovery').map(x=>Number(x.distance)||0)):0;
  return `<div class="content"><div class="hero"><div class="eyebrow">PROGRESS</div><h1>Consistency you can see.</h1><p>The coach looks backward before it looks forward.</p></div>
  <div class="metric-grid"><div class="metric"><b>${weekMiles().toFixed(1)}</b><span>This week · miles</span></div><div class="metric"><b>${currentStreak()}</b><span>Current streak · days</span></div><div class="metric"><b>${recentMiles(30).toFixed(1)}</b><span>Last 30 days · miles</span></div><div class="metric"><b>${longest.toFixed(1)}</b><span>Longest run · miles</span></div></div>
  <div class="card"><h2>Training load</h2><div class="load-grid"><div><b>${recentMiles(3).toFixed(1)}</b><small>miles / 3 days</small></div><div><b>${recentHard(7)}</b><small>quality sessions / 7 days</small></div><div><b>${longestStreak()}</b><small>longest streak</small></div></div></div>
  <div class="card"><h2>Coach memory</h2>${state.coachNotes.length?state.coachNotes.map(n=>`<div class="why"><span class="check">•</span><span>${escapeHtml(n)}</span></div>`).join(''):'<div class="empty">The coach will learn patterns as you log runs.</div>'}</div>
  <div class="card"><h2>Recent runs</h2>${state.history.length?state.history.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20).map(r=>`<div class="run-row"><div><b>${r.kind==='recovery'?'Recovery day':Number(r.distance).toFixed(1)+' mi'}</b><br><small>${fmt(r.date)} · ${escapeHtml(r.type)}${r.effort?' · '+escapeHtml(r.effort):''}</small></div><div class="row-actions"><span>${r.legsAfter==='worse'?'↘':'✓'}</span><button class="mini" data-edit-run="${r.date}">Edit</button></div></div>`).join(''):'<div class="empty">Your first run is the start of the record.</div>'}</div></div>`;
}

function coachView(){ return `<div class="content"><div class="hero"><div class="eyebrow">COACH</div><h1>Tell me what's going on.</h1><p>The rules drive the training. The coach explains the why.</p></div><div class="card"><div class="chat"><div class="bubble">“I slept like crap and my legs are heavy but I really want to run.”</div><div class="bubble">“I feel awesome and I've got an hour.”</div><div class="bubble">“I did HYROX yesterday.”</div></div></div><div class="card"><div class="chat-input"><input id="coachInput" placeholder="Tell the coach what changed…"><button class="primary send" id="sendCoach">Send</button></div><div id="coachReply" style="margin-top:12px"></div></div></div>`; }

function render(){
  let v=!state.setupComplete?setupView():state.tab==='today'?(state.checkinDate===dateKey()?todayView():checkinView()):state.tab==='plan'?planView():state.tab==='history'?historyView():coachView();
  app.innerHTML=v; syncNav(); bind();
}
function syncNav(){ document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab)); }
function bind(){
  document.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{ state.checkin[b.dataset.set]=b.dataset.set==='time'?Number(b.dataset.value):b.dataset.value; save(); render(); });
  document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{ state.profile[b.dataset.profile]=b.dataset.profile==='preferredMinutes'?Number(b.dataset.value):b.dataset.value; save(); render(); });
  document.querySelectorAll('[data-edit-run]').forEach(b=>b.onclick=()=>editRun(b.dataset.editRun));
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode; state.checkinDate=''; state.lastPlan=null; save(); render(); toast('Training mode updated');});
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;save();render();});
  $('#finishSetup')?.addEventListener('click',()=>{state.profile.weeklyMiles=Math.max(0,Number($('#weeklyMiles').value)||0);state.profile.longestRecent=Math.max(0,Number($('#longestRecent').value)||0);state.setupComplete=true;save();render();toast('Coach ready');});
  $('#getRun')?.addEventListener('click',()=>{state.lastPlan=plan();state.checkinDate=dateKey();state.tab='today';save();render();});
  $('#startNrc')?.addEventListener('click',()=>{toast('Record with NRC on your Apple Watch'); try{window.location.href='nike-run-club://'}catch{}; setTimeout(()=>toast('When you finish, come back and log the run'),900);});
  $('#whyBtn')?.addEventListener('click',()=>{const p=state.lastPlan||plan();openSheet('Why this run?',p.why.concat(['Minimum counts. If you feel worse than expected, stop at the minimum.','If you feel better, extend only if the effort stays appropriate.']))});
  $('#doneBtn')?.addEventListener('click',()=>openLogSheet());
  $('#restBtn')?.addEventListener('click',()=>{ state.history=state.history.filter(r=>r.date!==dateKey()); state.history.push({date:dateKey(),distance:0,type:'Recovery day',effort:'easy',legsAfter:'better',mode:state.mode,kind:'recovery'}); state.history.sort((a,b)=>a.date.localeCompare(b.date)); addCoachNote('Recovery days are part of the training plan, not a failure.'); save(); state.tab='history'; render(); toast('Recovery day logged — consistency maintained'); });
  $('#recheckBtn')?.addEventListener('click',()=>{state.checkinDate='';state.lastPlan=null;save();render();});
  $('#saveGoal')?.addEventListener('click',()=>{state.goal=$('#goalInput').value.trim();state.goalDate=$('#goalDate').value;save();toast('Goal saved');render();});
  $('#sendCoach')?.addEventListener('click',coachReply); $('#coachInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')coachReply();});
}
function openLogSheet(){
  const p=state.lastPlan||plan();
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="sheet"><h2>How did it go?</h2><label>Distance completed (miles)</label><input id="logDistance" type="number" min="0" step="0.1" value="${p.target||0}" class="field"><label>How hard did it feel?</label><div class="choices compact">${[['easy','Easy'],['moderate','Moderate'],['hard','Hard']].map(x=>`<button class="choice ${x[0]==='easy'?'selected':''}" data-effort="${x[0]}">${x[1]}</button>`).join('')}</div><label>How do your legs feel now?</label><div class="choices compact">${[['better','Better'],['same','Same'],['worse','Worse']].map(x=>`<button class="choice ${x[0]==='same'?'selected':''}" data-after="${x[0]}">${x[1]}</button>`).join('')}</div><div class="sheet-actions"><button class="secondary" id="cancelLog">Cancel</button><button class="primary" id="saveLog">Log run</button></div></div>`;
  document.body.appendChild(m); let effort='easy', after='same';
  m.querySelectorAll('[data-effort]').forEach(b=>b.onclick=()=>{effort=b.dataset.effort;m.querySelectorAll('[data-effort]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');});
  m.querySelectorAll('[data-after]').forEach(b=>b.onclick=()=>{after=b.dataset.after;m.querySelectorAll('[data-after]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');});
  $('#cancelLog').onclick=()=>m.remove(); $('#saveLog').onclick=()=>{const d=parseFloat($('#logDistance').value)||0;if(d<=0){toast('Enter the distance you actually ran');return;} state.history=state.history.filter(r=>r.date!==dateKey());state.history.push({date:dateKey(),distance:d,type:p.type,effort,legsAfter:after,mode:state.mode,kind:'run'});
    if(after==='worse') addCoachNote('Harder-than-expected recovery: watch the next day for heavy legs and reduce load if needed.');
    if(effort==='hard') addCoachNote('Recent hard running session: avoid stacking intensity without a recovery signal.');state.history.sort((a,b)=>a.date.localeCompare(b.date));save();m.remove();state.tab='history';render();toast('Run logged — consistency maintained');};
}
function coachReply(){
  const q=($('#coachInput')?.value||'').toLowerCase(); let r;
  if(q.includes('pain')||q.includes('hurt')) r='Pain changes the prescription. Don’t push through significant or worsening pain. Today can become recovery, walking, or rest depending on what feels safe.';
  else if(q.includes('hyrox')||q.includes('strength')||q.includes('orangetheory')) r='Treat that session as part of the training load. Keep the run easy unless the recent workload and your recovery signals support quality.';
  else if(q.includes('heavy')||q.includes('tired')||q.includes('sleep')) r=`Keep the routine, lower the cost. Start with the ${plan().min || 0} mile minimum at an easy effort. You do not need to make up mileage tomorrow.`;
  else if(q.includes('awesome')||q.includes('great')||q.includes('good')) r='Good recovery is permission to train, not a requirement to train hard. If the last few days are controlled, the engine may add quality.';
  else r=`Based on today's check-in: ${plan().min} mile minimum, ${plan().target} mile target, ${plan().opt} optional. The next prescription will also consider what you did over the previous several days.`;
  $('#coachReply').innerHTML=`<div class="bubble">${r}</div>`;
}

$('#settingsBtn').onclick=()=>settingsSheet();
function settingsSheet(){ const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="sheet"><h2>Settings</h2><p class="muted">Adaptive Run Coach · ${VERSION}</p><div class="settings-list"><button class="secondary full" id="exportData">Export my training data</button><button class="secondary full" id="importData">Import a backup</button><input id="importFile" type="file" accept="application/json" hidden><button class="secondary full" id="installApp">Add to Home Screen</button><button class="secondary full" id="redoSetup">Edit first-launch setup</button><button class="secondary full danger" id="resetData">Reset all training data</button></div><div class="why"><span class="check">i</span><span>NRC records the run on your Apple Watch. This web app stores your coaching data locally. Apple Health/HealthKit requires a native bridge.</span></div><button class="secondary full" id="closeSettings">Close</button></div>`;document.body.appendChild(m);
 m.querySelector('#closeSettings').onclick=()=>m.remove();
 m.querySelector('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify({...state,installPrompt:null},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`adaptive-run-coach-${dateKey()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup exported');};
 m.querySelector('#importData').onclick=()=>m.querySelector('#importFile').click();
 m.querySelector('#importFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const x=JSON.parse(rd.result);if(!Array.isArray(x.history))throw Error();state={...defaults,...x,checkin:{...defaults.checkin,...(x.checkin||{})},profile:{...defaults.profile,...(x.profile||{})},history:x.history};save();m.remove();render();toast('Backup imported');}catch{toast('That backup could not be read');}};rd.readAsText(f);};
 m.querySelector('#installApp').onclick=async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;}else toast('On iPhone: Share → Add to Home Screen');};
 m.querySelector('#redoSetup').onclick=()=>{state.setupComplete=false;save();m.remove();render();};
 m.querySelector('#resetData').onclick=()=>{if(confirm('Delete all training history and coaching data from this device?')){localStorage.removeItem(KEY);state=load();m.remove();render();toast('Data reset');}}; }
function editRun(date){const r=state.history.find(x=>x.date===date);if(!r)return;const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="sheet"><h2>Edit ${fmt(date)}</h2><label>Distance (miles)</label><input id="editDistance" class="field" type="number" min="0" step="0.1" value="${r.distance}"><div class="sheet-actions"><button class="secondary" id="deleteRun">Delete</button><button class="primary" id="saveEdit">Save</button></div></div>`;document.body.appendChild(m);m.querySelector('#deleteRun').onclick=()=>{state.history=state.history.filter(x=>x.date!==date);save();m.remove();render();toast('Run deleted');};m.querySelector('#saveEdit').onclick=()=>{r.distance=Math.max(0,Number(m.querySelector('#editDistance').value)||0);save();m.remove();render();toast('Run updated');}; }


window.addEventListener('beforeinstallprompt', e=>{e.preventDefault();deferredInstallPrompt=e;if(!state.installedHint){toast('You can add Adaptive Run Coach to your Home Screen');}});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
