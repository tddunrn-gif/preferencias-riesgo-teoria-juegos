import { firebaseConfig } from './firebase-config.js';

const ANCHORS = { worst: -50, best: 50 };
const FRACTILES = [.5, .25, .75];
const MAX_ROUNDS = 4;
const contexts = [
  { sector: 'Expansión productiva', text: 'La empresa evalúa ampliar su capacidad para atender un nuevo mercado regional.' },
  { sector: 'Lanzamiento comercial', text: 'La empresa debe decidir si introduce una nueva línea de productos durante los próximos dos años.' },
  { sector: 'Transformación tecnológica', text: 'La empresa analiza automatizar un proceso central con una tecnología todavía no probada internamente.' },
  { sector: 'Mercado internacional', text: 'La empresa considera ingresar a un mercado extranjero con demanda todavía incierta.' },
  { sector: 'Cadena de suministro', text: 'La empresa compara un acuerdo estable con una reorganización más ambiciosa de su red logística.' },
  { sector: 'Eficiencia energética', text: 'La empresa evalúa una reconversión energética cuyos ahorros dependen de precios futuros.' }
];

const state = {
  participantCode: '', seed: 0, rng: Math.random, order: [], contextOrder: [],
  fractileIndex: 0, round: 0, lo: 0, hi: 0, candidate: 0, lotteryLow: -50, lotteryHigh: 50,
  startedAt: null, responses: [], utilities: [], isPractice: true, choiceReversed: false,
  firebase: null, saved: false, validation: [], predictionTests: [], predictionIndex: 0,
  applicationStep: 0, applicationStartedAt: null, applicationResult: null,
  gameStep: 0, gameStartedAt: null, gameResult: null
};

const $ = id => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];
function show(id){ screens.forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo({top:0,behavior:'smooth'}); }
function hashString(text){ let h=2166136261; for(const ch of text){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function mulberry32(seed){ return function(){ let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}; }
function shuffle(values,rng=state.rng){ const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
function money(value){ const rounded=Math.round(value*10)/10;if(Math.abs(rounded)<.05)return '$0 millones';const absolute=Math.abs(rounded),amount=absolute.toLocaleString('es-AR',{maximumFractionDigits:1}),unit=absolute===1?'millón':'millones';return `${rounded<0?'−':''}$${amount} ${unit}`; }
function pct(p){ return `${Math.round(p*100)} %`; }
function expectedValue(low,high,p=.5){ return p*high+(1-p)*low; }
function lossProbability(low,high,p=.5){ return (low<0?(1-p):0)+(high<0?p:0); }
function median(values){ const a=[...values].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2; }

function initParticipant(){
  const code=$('participant-code').value.trim();
  if(code.length<2){$('welcome-error').textContent='Ingresá el código indicado por el docente.';return false;}
  if(!$('consent').checked){$('welcome-error').textContent='Necesitamos que confirmes que comprendiste la actividad.';return false;}
  state.participantCode=code;state.seed=hashString(`${code.toUpperCase()}|TDD-FRACTILES-2026-R1`);state.rng=mulberry32(state.seed);
  state.order=[.5,...shuffle([.25,.75])];state.contextOrder=shuffle(contexts.map((_,i)=>i));state.startedAt=new Date().toISOString();
  $('welcome-error').textContent='';return true;
}

function renderChoice(){
  const context=state.isPractice?{sector:'Pregunta de práctica',text:'Imaginá que una empresa debe elegir entre conservar un resultado seguro o ejecutar un proyecto incierto.'}:contexts[state.contextOrder[state.fractileIndex%contexts.length]];
  const completed=state.fractileIndex*MAX_ROUNDS+state.round;
  $('phase-label').textContent=state.isPractice?'Práctica':`Fractil ${state.fractileIndex+1} de ${FRACTILES.length}`;
  $('progress-label').textContent=state.isPractice?'Pregunta de ejemplo':`Comparación ${state.round+1} de ${MAX_ROUNDS}`;
  $('progress-bar').style.width=state.isPractice?'8%':`${Math.min(100,((completed+1)/(FRACTILES.length*MAX_ROUNDS))*100)}%`;
  $('scenario-sector').textContent=context.sector;$('scenario-text').textContent=context.text;
  $('safe-value').textContent=money(state.candidate);$('best-prob').textContent='50 %';$('worst-prob').textContent='50 %';
  $('best-value').textContent=money(state.lotteryHigh);$('worst-value').textContent=money(state.lotteryLow);
  const ev=expectedValue(state.lotteryLow,state.lotteryHigh),difference=ev-state.candidate;
  $('lottery-ev').textContent=money(ev);$('loss-prob').textContent=pct(lossProbability(state.lotteryLow,state.lotteryHigh));
  $('ev-comparison').textContent=Math.abs(difference)<.05?'Su valor esperado coincide con el resultado garantizado.':`Su valor esperado es ${money(Math.abs(difference))} ${difference>0?'mayor':'menor'} que el resultado garantizado.`;
  state.choiceReversed=!state.isPractice&&state.rng()<.5;$('choice-grid').classList.toggle('reverse',state.choiceReversed);
  $('choice-safe').querySelector('.choice-letter').textContent=state.choiceReversed?'B':'A';
  $('choice-lottery').querySelector('.choice-letter').textContent=state.choiceReversed?'A':'B';
  show('screen-choice');
}

function beginPractice(){ state.isPractice=true;state.candidate=15;state.lotteryLow=-20;state.lotteryHigh=50;state.round=0;renderChoice(); }
function beginExperiment(){ state.isPractice=false;state.fractileIndex=0;state.responses=[];state.utilities=[];startFractile(); }

function startFractile(){
  const utility=state.order[state.fractileIndex];
  if(utility===.5){state.lotteryLow=ANCHORS.worst;state.lotteryHigh=ANCHORS.best;}
  else {
    const midpoint=state.utilities.find(p=>p.utility===.5).outcome;
    state.lotteryLow=utility<.5?ANCHORS.worst:midpoint;
    state.lotteryHigh=utility<.5?midpoint:ANCHORS.best;
  }
  state.lo=state.lotteryLow;state.hi=state.lotteryHigh;state.round=0;state.candidate=(state.lo+state.hi)/2;renderChoice();
}

function choose(choice){
  if(state.isPractice){show('screen-transition');return;}
  const utility=state.order[state.fractileIndex];
  state.responses.push({utility,round:state.round+1,safeOutcome:Number(state.candidate.toFixed(2)),lotteryLow:Number(state.lotteryLow.toFixed(2)),lotteryHigh:Number(state.lotteryHigh.toFixed(2)),expectedValue:Number(expectedValue(state.lotteryLow,state.lotteryHigh).toFixed(2)),choice,context:contexts[state.contextOrder[state.fractileIndex%contexts.length]].sector,sideReversed:state.choiceReversed,elapsedMs:Date.now()-new Date(state.startedAt).getTime()});
  if(choice==='equal'){finishFractile(state.candidate,'declared');return;}
  if(choice==='safe')state.hi=state.candidate;else state.lo=state.candidate;
  state.round++;
  if(state.round>=MAX_ROUNDS){finishFractile((state.lo+state.hi)/2,'interval');return;}
  state.candidate=(state.lo+state.hi)/2;renderChoice();
}

function finishFractile(outcome,method){
  state.utilities.push({outcome:Number(outcome.toFixed(2)),utility:state.order[state.fractileIndex],method,lower:Number(state.lo.toFixed(2)),upper:Number(state.hi.toFixed(2))});
  state.fractileIndex++;
  if(state.fractileIndex<FRACTILES.length){startFractile();return;}
  preparePredictions();
}

function utilityAt(outcome){
  const points=[{outcome:ANCHORS.worst,utility:0},...state.utilities,{outcome:ANCHORS.best,utility:1}].sort((a,b)=>a.outcome-b.outcome);
  const upper=Math.max(1,points.findIndex(p=>p.outcome>=outcome)),b=points[upper],a=points[upper-1];
  if(a.outcome===b.outcome)return (a.utility+b.utility)/2;
  return a.utility+(outcome-a.outcome)/(b.outcome-a.outcome)*(b.utility-a.utility);
}

function outcomeAt(utility){
  const points=[{outcome:ANCHORS.worst,utility:0},...state.utilities,{outcome:ANCHORS.best,utility:1}].sort((a,b)=>a.utility-b.utility);
  const upper=Math.max(1,points.findIndex(p=>p.utility>=utility)),b=points[upper],a=points[upper-1];
  if(a.utility===b.utility)return (a.outcome+b.outcome)/2;
  return a.outcome+(utility-a.utility)/(b.utility-a.utility)*(b.outcome-a.outcome);
}

function preparePredictions(){
  const pairs=state.seed%2===0?[[-40,30],[-20,50]]:[[-30,40],[-50,20]];
  state.predictionTests=pairs.map(([low,high],index)=>{
    const lotteryUtility=.5*utilityAt(low)+.5*utilityAt(high),ce=outcomeAt(lotteryUtility),direction=state.rng()<.5?-1:1;
    const safe=Math.max(low+1,Math.min(high-1,Math.round((ce+direction*4)*2)/2));
    return {index:index+1,low,high,safe,estimatedCE:Number(ce.toFixed(2)),predicted:safe>ce?'safe':'lottery',actual:null,correct:null,expectedValue:Number(expectedValue(low,high).toFixed(2))};
  });
  state.predictionIndex=0;state.validation=[];renderPrediction();
}

function renderPrediction(){
  const test=state.predictionTests[state.predictionIndex];
  $('prediction-phase').textContent=`Prueba ${state.predictionIndex+1} de ${state.predictionTests.length}`;
  const predictedLabel=test.predicted==='safe'?`el resultado garantizado de ${money(test.safe)}`:`el proyecto incierto entre ${money(test.low)} y ${money(test.high)}`;
  $('prediction-claim').textContent=`A partir de tu curva, nuestra predicción es que elegirías ${predictedLabel}.`;
  $('prediction-safe-value').textContent=money(test.safe);$('prediction-best-prob').textContent='50 %';$('prediction-worst-prob').textContent='50 %';
  $('prediction-best-value').textContent=money(test.high);$('prediction-worst-value').textContent=money(test.low);$('prediction-ev').textContent=money(test.expectedValue);
  $('prediction-reveal').hidden=true;$('prediction-continue').hidden=true;$('prediction-safe').disabled=false;$('prediction-lottery').disabled=false;
  show('screen-prediction');
}

function answerPrediction(actual){
  const test=state.predictionTests[state.predictionIndex];test.actual=actual;test.correct=actual===test.predicted;state.validation.push({...test});
  $('prediction-safe').disabled=true;$('prediction-lottery').disabled=true;
  const reveal=$('prediction-reveal');reveal.hidden=false;reveal.classList.toggle('miss',!test.correct);
  $('reveal-icon').textContent=test.correct?'✓':'↔';$('reveal-title').textContent=test.correct?'¡La predicción coincidió!':'Esta vez, la predicción no coincidió';
  $('reveal-text').textContent=test.correct?'La curva elicitada pudo anticipar esta elección nueva.':'Esto también informa: la preferencia puede depender del contexto o contener imprecisión.';
  $('prediction-continue').textContent=state.predictionIndex<state.predictionTests.length-1?'Ir a la segunda prueba':'Ver mi resultado completo';$('prediction-continue').hidden=false;
}

function continuePrediction(){ if(state.predictionIndex<state.predictionTests.length-1){state.predictionIndex++;renderPrediction();}else finishExperiment(); }

async function initFirebase(){
  if(!firebaseConfig)return null;
  try{
    const [{initializeApp},{getAuth,signInAnonymously},{getFirestore,doc,setDoc,serverTimestamp}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js')
    ]);
    const app=initializeApp(firebaseConfig),auth=getAuth(app),credential=await signInAnonymously(auth);
    return {db:getFirestore(app),uid:credential.user.uid,doc,setDoc,serverTimestamp};
  }catch(error){console.warn('No se pudo iniciar el almacenamiento remoto.',error);return null;}
}

function buildPayload(){
  const sorted=[{outcome:ANCHORS.worst,utility:0,method:'anchor'},...state.utilities,{outcome:ANCHORS.best,utility:1,method:'anchor'}].sort((a,b)=>a.outcome-b.outcome);
  const deltas=state.utilities.map(d=>d.utility-(d.outcome-ANCHORS.worst)/(ANCHORS.best-ANCHORS.worst));
  const score=median(deltas),classification=score>.06?'aversión al riesgo':score<-.06?'propensión al riesgo':'cercano a neutralidad';
  return {schemaVersion:4,experiment:'TDD-UNRN-riesgo-aplicacion-2026',participantCode:state.participantCode.toUpperCase(),variant:state.seed%12,startedAt:state.startedAt,completedAt:new Date().toISOString(),durationMs:Date.now()-new Date(state.startedAt).getTime(),anchors:ANCHORS,utilities:sorted,responses:state.responses,validation:state.validation,summary:{medianDeviation:Number(score.toFixed(3)),classification},userAgent:navigator.userAgent.includes('Mobile')?'mobile':'desktop'};
}

async function finishExperiment(){
  show('screen-saving');const payload=buildPayload();state.finalPayload=payload;state.firebase=await initFirebase();
  if(state.firebase){try{const f=state.firebase;await f.setDoc(f.doc(f.db,'integratedResponses',f.uid),{...payload,applicationStatus:'not_started',serverCreatedAt:f.serverTimestamp()});state.saved=true;}catch(error){console.warn('No se pudo guardar la respuesta.',error);}}
  renderResults(payload);show('screen-results');
}

function renderResults(payload){
  const label=payload.summary.classification;$('result-badge').textContent=label.charAt(0).toUpperCase()+label.slice(1);
  const descriptions={
    'aversión al riesgo':'En este rango, tus respuestas asignaron relativamente más utilidad a los resultados garantizados que la referencia neutral.',
    'propensión al riesgo':'En este rango, tus respuestas asignaron relativamente más atractivo a los proyectos inciertos que la referencia neutral.',
    'cercano a neutralidad':'En este rango, tu curva quedó cerca de la referencia que valora los resultados de manera lineal.'
  };
  $('result-description').textContent=descriptions[label];$('utility-table').innerHTML=payload.utilities.map(d=>`<div class="table-row"><span>${money(d.outcome)}</span><span>${d.utility.toFixed(2)}</span></div>`).join('');
  $('save-status').textContent=state.saved?'Tu respuesta fue guardada correctamente.':'No se pudo confirmar el guardado remoto. Descargá el archivo para conservar una copia.';drawChart(payload.utilities);
}

function drawChart(points){
  const canvas=$('utility-chart'),ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1,w=760,h=430;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const m={l:64,r:28,t:25,b:55},x=v=>m.l+(v-ANCHORS.worst)/(ANCHORS.best-ANCHORS.worst)*(w-m.l-m.r),y=u=>h-m.b-u*(h-m.t-m.b);
  ctx.font='13px system-ui';ctx.fillStyle='#5b6f7d';ctx.strokeStyle='#d7dedf';ctx.lineWidth=1;
  for(let u=0;u<=1.001;u+=.25){ctx.beginPath();ctx.moveTo(m.l,y(u));ctx.lineTo(w-m.r,y(u));ctx.stroke();ctx.fillText(u.toFixed(2),15,y(u)+4);}
  for(let v=-50;v<=50;v+=25){ctx.fillText(v===0?'$0':`${v<0?'−':''}$${Math.abs(v)} M`,x(v)-17,h-23);}
  ctx.setLineDash([6,6]);ctx.strokeStyle='#93a1a7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(-50),y(0));ctx.lineTo(x(50),y(1));ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#1f6f8b';ctx.lineWidth=4;ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.outcome),y(p.utility)):ctx.moveTo(x(p.outcome),y(p.utility)));ctx.stroke();
  points.forEach(p=>{ctx.beginPath();ctx.arc(x(p.outcome),y(p.utility),6,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#1f6f8b';ctx.lineWidth=3;ctx.stroke();});
}

function downloadResults(){ const blob=new Blob([JSON.stringify(state.finalPayload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`resultado-fractiles-${state.participantCode.replace(/[^a-z0-9-]/gi,'_')}.json`;a.click();URL.revokeObjectURL(url); }

const CASE = {
  name:'BioValle Envases', unit:'millones de pesos constantes', probabilityHigh:.65, studyCost:2,
  alternatives:[
    {id:'modular',name:'Adaptación modular',short:'Modular',high:18,low:8,color:'#25856f',description:'Adapta una línea existente. Limita la ganancia, pero conserva un piso positivo.'},
    {id:'flexible',name:'Planta flexible',short:'Flexible',high:32,low:2,color:'#1f6f8b',description:'Incorpora equipos reconfigurables. Captura crecimiento sin comprometer toda la capacidad.'},
    {id:'dedicated',name:'Planta dedicada',short:'Dedicada',high:48,low:-28,color:'#d66a3a',description:'Construye a escala industrial. Ofrece el mayor techo y la única pérdida severa.'}
  ],
  reports:[
    {id:'favorable',name:'Informe favorable',short:'Favorable',givenHigh:.85,givenLow:.25},
    {id:'unfavorable',name:'Informe desfavorable',short:'Desfavorable',givenHigh:.15,givenLow:.75}
  ]
};

const lessonSections=['Formulación','Matriz de pagos','Decisión sin probabilidades','Probabilidades previas','Valor esperado','Información muestral','Bayes','Plegado del árbol','Valor de la información','Tu función de utilidad','Utilidad esperada','Equivalentes ciertos','Síntesis y valor personal de la información'];
const TIMELINE=[
  {id:'huygens',year:1657,author:'Christiaan Huygens',label:'Esperanza matemática'},
  {id:'bernoulli',year:1738,author:'Daniel Bernoulli',label:'Utilidad y riesgo'},
  {id:'bayes',year:1763,author:'Thomas Bayes y Richard Price',label:'Probabilidad inversa'},
  {id:'cournot',year:1838,author:'Antoine A. Cournot',label:'Interdependencia estratégica'},
  {id:'vonneumann',year:1928,author:'John von Neumann',label:'Teorema minimax'},
  {id:'vnm',year:1944,author:'von Neumann y Morgenstern',label:'Juegos y utilidad esperada'},
  {id:'wald',year:1950,author:'Abraham Wald',label:'Decisión estadística'},
  {id:'nash',year:1950,author:'John Nash',label:'Equilibrio no cooperativo'},
  {id:'hurwicz',year:1951,author:'Leonid Hurwicz',label:'Criterio de optimismo'},
  {id:'savage',year:1951,author:'Leonard J. Savage',label:'Minimax arrepentimiento'},
  {id:'kuhn',year:1953,author:'Harold W. Kuhn',label:'Juegos extensivos'},
  {id:'raiffa',year:1961,author:'Raiffa y Schlaifer',label:'Información muestral'},
  {id:'pratt',year:1964,author:'John W. Pratt',label:'Prima y aversión al riesgo'},
  {id:'howard',year:1966,author:'Ronald A. Howard',label:'Análisis de decisiones'}
];
const lessonMilestones=[['howard'],['wald'],['wald','hurwicz','savage'],['huygens'],['huygens'],['raiffa'],['bayes'],['howard'],['raiffa'],['bernoulli','vnm'],['vnm'],['pratt'],['pratt','howard']];
function renderTimeline(trackId,currentId,activeIds,reachedIds=activeIds){
  const track=$(trackId),current=$(currentId),active=new Set(activeIds),reached=new Set(reachedIds);
  track.innerHTML=TIMELINE.map(item=>`<article class="timeline-item ${reached.has(item.id)?'reached':''} ${active.has(item.id)?'active':''}" data-milestone="${item.id}"><span>${item.year}</span><strong>${item.author}</strong></article>`).join('');
  const selected=TIMELINE.filter(item=>active.has(item.id));current.textContent=selected.map(item=>`${item.year} · ${item.label}`).join(' · ');
  requestAnimationFrame(()=>track.querySelector('.active')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}));
}
const num=(value,digits=2)=>Number(value).toLocaleString('es-AR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const signed=value=>`${value<0?'−':''}$${num(Math.abs(value),value%1?1:0)} M`;
const percent=value=>`${num(value*100,1)} %`;
const argmax=values=>values.reduce((best,item)=>item.value>best.value?item:best);

function caseAnalysis(){
  const p=CASE.probabilityHigh;
  const alternatives=CASE.alternatives.map(a=>{
    const ev=p*a.high+(1-p)*a.low;
    const eu=p*utilityAt(a.high)+(1-p)*utilityAt(a.low);
    const ce=outcomeAt(eu);
    return {...a,ev,eu,ce,riskPremium:ev-ce};
  });
  const reports=CASE.reports.map(r=>{
    const marginal=p*r.givenHigh+(1-p)*r.givenLow;
    const posteriorHigh=p*r.givenHigh/marginal;
    return {...r,marginal,posteriorHigh,posteriorLow:1-posteriorHigh};
  });
  const bestEv=argmax(alternatives.map(a=>({id:a.id,name:a.name,value:a.ev})));
  const bestEu=argmax(alternatives.map(a=>({id:a.id,name:a.name,value:a.eu})));
  const conditional=reports.map(r=>{
    const evOptions=CASE.alternatives.map(a=>({id:a.id,name:a.name,value:r.posteriorHigh*a.high+r.posteriorLow*a.low}));
    const euOptions=CASE.alternatives.map(a=>({id:a.id,name:a.name,value:r.posteriorHigh*utilityAt(a.high)+r.posteriorLow*utilityAt(a.low)}));
    return {...r,bestEv:argmax(evOptions),bestEu:argmax(euOptions),evOptions,euOptions};
  });
  const evWithSampleGross=conditional.reduce((sum,r)=>sum+r.marginal*r.bestEv.value,0);
  const euWithSampleGross=conditional.reduce((sum,r)=>sum+r.marginal*r.bestEu.value,0);
  const evWithPerfect=p*Math.max(...CASE.alternatives.map(a=>a.high))+(1-p)*Math.max(...CASE.alternatives.map(a=>a.low));
  const euWithPerfect=p*Math.max(...CASE.alternatives.map(a=>utilityAt(a.high)))+(1-p)*Math.max(...CASE.alternatives.map(a=>utilityAt(a.low)));
  const bestExpectedUtilityAt=(probHigh,cost=0)=>argmax(CASE.alternatives.map(a=>({id:a.id,name:a.name,value:probHigh*utilityAt(a.high-cost)+(1-probHigh)*utilityAt(a.low-cost)})));
  const sampleUtilityAtCost=cost=>conditional.reduce((sum,r)=>sum+r.marginal*bestExpectedUtilityAt(r.posteriorHigh,cost).value,0);
  const perfectUtilityAtCost=cost=>p*utilityAt(Math.max(...CASE.alternatives.map(a=>a.high))-cost)+(1-p)*utilityAt(Math.max(...CASE.alternatives.map(a=>a.low))-cost);
  const solvePrice=utilityFn=>{
    if(utilityFn(0)<=bestEu.value)return 0;
    let lo=0,hi=40;
    for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(utilityFn(mid)>bestEu.value)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  };
  const sampleWtp=solvePrice(sampleUtilityAtCost),perfectWtp=solvePrice(perfectUtilityAtCost);
  const sampleNetEu=sampleUtilityAtCost(CASE.studyCost);
  const conditionalNetEu=conditional.map(r=>({...r,bestEuNet:bestExpectedUtilityAt(r.posteriorHigh,CASE.studyCost)}));
  return {alternatives,reports,conditional,bestEv,bestEu,evWithSampleGross,evWithPerfect,euWithSampleGross,euWithPerfect,
    evsi:evWithSampleGross-bestEv.value,netEvsi:evWithSampleGross-CASE.studyCost-bestEv.value,evpi:evWithPerfect-bestEv.value,
    sampleCe:outcomeAt(euWithSampleGross),perfectCe:outcomeAt(euWithPerfect),sampleWtp,perfectWtp,sampleNetEu,
    conditionalNetEu,useStudyEu:sampleNetEu>bestEu.value,bestExpectedUtilityAt};
}

function payoffTable(analysis,mode='payoff'){
  const rows=analysis.alternatives.map(a=>{
    const extra=mode==='ev'?`<td>${signed(a.ev)}</td>`:mode==='eu'?`<td>${num(utilityAt(a.high),3)}</td><td>${num(utilityAt(a.low),3)}</td><td>${num(a.eu,3)}</td>`:mode==='ce'?`<td>${signed(a.ev)}</td><td>${num(a.eu,3)}</td><td>${signed(a.ce)}</td><td>${signed(a.riskPremium)}</td>`:'';
    const active=(mode==='ev'&&a.id===analysis.bestEv.id)||(mode!=='ev'&&['eu','ce'].includes(mode)&&a.id===analysis.bestEu.id);
    return `<tr class="${active?'optimal-row':''}"><th>${a.name}</th><td>${signed(a.high)}</td><td>${signed(a.low)}</td>${extra}</tr>`;
  }).join('');
  const extraHead=mode==='ev'?'<th>VE</th>':mode==='eu'?'<th>U(alta)</th><th>U(baja)</th><th>UE</th>':mode==='ce'?'<th>VE</th><th>UE</th><th>EC</th><th>PR</th>':'';
  return `<div class="table-wrap"><table class="decision-table"><thead><tr><th>Alternativa</th><th>Demanda alta</th><th>Demanda baja</th>${extraHead}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function criteriaTable(){
  const rows=CASE.alternatives.map(a=>{
    const laplace=(a.high+a.low)/2,hurwicz=.6*Math.max(a.high,a.low)+.4*Math.min(a.high,a.low);
    const regretHigh=48-a.high,regretLow=8-a.low,maxRegret=Math.max(regretHigh,regretLow);
    return `<tr><th>${a.name}</th><td>${signed(Math.max(a.high,a.low))}</td><td>${signed(Math.min(a.high,a.low))}</td><td>${signed(laplace)}</td><td>${signed(hurwicz)}</td><td>${signed(maxRegret)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="decision-table"><thead><tr><th>Alternativa</th><th>Optimista</th><th>Conservador</th><th>Laplace</th><th>Hurwicz α=0,60</th><th>Máx. arrep.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function recommendation(label,value,detail,tone='blue'){
  return `<div class="recommendation ${tone}"><span>${label}</span><strong>${value}</strong><p>${detail}</p></div>`;
}

function renderLesson(){
  const a=caseAnalysis(),step=state.applicationStep,content=$('lesson-content');
  const rF=a.reports[0],rD=a.reports[1],cF=a.conditional[0],cD=a.conditional[1];
  const lessons=[
    `<p class="step-label">1 · Formular antes de calcular</p><h2>La decisión y la incertidumbre son cosas distintas</h2><p>BioValle controla la <strong>escala de producción</strong>, pero no controla la demanda futura. Las tres alternativas son mutuamente excluyentes y los dos estados son exhaustivos.</p><div class="alternative-cards">${CASE.alternatives.map(x=>`<article style="--accent:${x.color}"><strong>${x.name}</strong><p>${x.description}</p></article>`).join('')}</div><div class="concept"><strong>Primera lectura:</strong> el cuadrado pertenece al decisor; los círculos, a la naturaleza.</div>`,
    `<p class="step-label">2 · Consecuencias</p><h2>La matriz reúne las seis trayectorias posibles</h2><p>Cada celda es el valor presente neto si se elige una escala y luego ocurre un estado. Todavía <strong>no hay probabilidades</strong>.</p>${payoffTable(a)}<div class="concept">La misma información aparece en el árbol: cada celda de la matriz es una hoja.</div>`,
    `<p class="step-label">3 · Incertidumbre</p><h2>Sin probabilidades no existe una única recomendación</h2><p>Cada criterio expresa una actitud informacional distinta; no son cinco estimaciones de lo mismo.</p>${criteriaTable()}<div class="recommendation-grid">${recommendation('Maximax','Planta dedicada','Elige el techo de $48 M.','orange')}${recommendation('Maximin','Adaptación modular','Protege el piso de $8 M.','green')}${recommendation('Laplace, Hurwicz y minimax arrepentimiento','Planta flexible','Producen aquí una solución intermedia.')}</div>`,
    `<p class="step-label">4 · Riesgo</p><h2>Ahora incorporamos probabilidades previas</h2><p>Antes de pedir un estudio, BioValle juzga una demanda alta con probabilidad <strong>${percent(CASE.probabilityHigh)}</strong> y una demanda baja con <strong>${percent(1-CASE.probabilityHigh)}</strong>.</p><div class="probability-strip"><span style="width:${CASE.probabilityHigh*100}%">Alta · ${percent(CASE.probabilityHigh)}</span><span style="width:${(1-CASE.probabilityHigh)*100}%">Baja · ${percent(1-CASE.probabilityHigh)}</span></div><div class="concept">Las probabilidades cambian el peso de las hojas, no los pagos de la matriz.</div>`,
    `<p class="step-label">5 · Plegado</p><h2>El valor esperado resuelve el árbol de derecha a izquierda</h2><p>En cada círculo se ponderan los pagos; en el cuadrado se conserva la rama de mayor valor.</p>${payoffTable(a,'ev')}${recommendation('Decisión por valor esperado',a.bestEv.name,`Su VE es ${signed(a.bestEv.value)}. Supera por apenas ${signed(a.bestEv.value-a.alternatives.find(x=>x.id==='dedicated').ev)} a la planta dedicada.`)}`,
    `<p class="step-label">6 · Un estudio imperfecto</p><h2>La consultora no predice el mercado: produce una señal</h2><p>El informe cuesta <strong>${signed(CASE.studyCost)}</strong>. Si la demanda será alta, informa favorable el <strong>${percent(.85)}</strong> de las veces; si será baja, también puede dar un falso favorable el <strong>${percent(.25)}</strong>.</p><div class="signal-grid"><article><span>Si la demanda será alta</span><strong>${percent(.85)} favorable</strong><small>${percent(.15)} desfavorable</small></article><article><span>Si la demanda será baja</span><strong>${percent(.25)} favorable</strong><small>${percent(.75)} desfavorable</small></article></div><div class="concept">Estas son probabilidades del informe dado el estado. Para decidir después del informe necesitamos invertir el condicionamiento.</div>`,
    `<p class="step-label">7 · Revisión bayesiana</p><h2>El informe actualiza la demanda probable</h2><p>Primero se forman conjuntas; luego se suma la probabilidad de cada señal y se normaliza.</p><div class="bayes-grid"><article><span>Informe favorable · P=${percent(rF.marginal)}</span><strong>P(alta | favorable) = ${percent(rF.posteriorHigh)}</strong><p>La probabilidad de demanda alta sube de ${percent(.65)} a ${percent(rF.posteriorHigh)}.</p></article><article><span>Informe desfavorable · P=${percent(rD.marginal)}</span><strong>P(alta | desfavorable) = ${percent(rD.posteriorHigh)}</strong><p>La probabilidad de demanda baja pasa a ${percent(rD.posteriorLow)}.</p></article></div><details><summary>Ver la cuenta del informe favorable</summary><p>Conjunta alta y favorable: 0,65 × 0,85 = 0,5525. Conjunta baja y favorable: 0,35 × 0,25 = 0,0875. Por tanto, P(favorable)=0,6400 y P(alta | favorable)=0,5525 / 0,6400 = ${num(rF.posteriorHigh,4)}.</p></details>`,
    `<p class="step-label">8 · Estrategia contingente</p><h2>Después de cada informe se vuelve a decidir</h2><p>El árbol se pliega desde las hojas. La empresa no elige hoy una planta: elige hoy una <strong>regla de acción</strong>.</p><div class="recommendation-grid">${recommendation('Si el informe es favorable',cF.bestEv.name,`VE condicional bruto: ${signed(cF.bestEv.value)}.`,'orange')}${recommendation('Si el informe es desfavorable',cD.bestEv.name,`VE condicional bruto: ${signed(cD.bestEv.value)}.`,'green')}</div><div class="strategy-line"><span>Contratar el estudio</span><b>→</b><span>Observar el informe</span><b>→</b><span>Elegir una escala distinta según la señal</span></div>`,
    `<p class="step-label">9 · Precio de reducir incertidumbre</p><h2>La información se valora antes de conocer su resultado</h2><div class="metric-grid"><article><span>VE sin información</span><strong>${signed(a.bestEv.value)}</strong></article><article><span>VE con información muestral</span><strong>${signed(a.evWithSampleGross)}</strong></article><article><span>VEIM bruto</span><strong>${signed(a.evsi)}</strong></article><article><span>VEIM neto del costo</span><strong>${signed(a.netEvsi)}</strong></article></div><p>Como ${signed(a.evsi)} supera el precio de ${signed(CASE.studyCost)}, el análisis por VE recomienda contratarlo. La información perfecta valdría como máximo <strong>${signed(a.evpi)}</strong>; por eso la información imperfecta nunca puede valer más.</p>${recommendation('Estrategia por VE','Estudiar y decidir según el informe',`Valor neto esperado: ${signed(a.evWithSampleGross-CASE.studyCost)}.`)}`,
    `<p class="step-label">10 · Tu preferencia</p><h2>Los pagos se transforman con la curva que acabás de elicitar</h2><p>Se conserva el árbol y se reemplaza cada pago <em>x</em> por <em>U(x)</em>. Las probabilidades no cambian. Tu clasificación experimental fue <strong>${state.finalPayload.summary.classification}</strong>.</p>${payoffTable(a,'eu')}<div class="concept"><strong>Importante:</strong> las utilidades son índices sin unidad monetaria. Sirven para ordenar loterías; no son pesos.</div>`,
    `<p class="step-label">11 · Nuevo plegado</p><h2>La utilidad esperada puede cambiar la escala elegida</h2>${payoffTable(a,'eu')}${recommendation('Decisión por utilidad esperada',a.bestEu.name,`UE = ${num(a.bestEu.value,3)}. ${a.bestEu.id===a.bestEv.id?'En tu caso coincide con la recomendación por VE, aunque la justificación ya incorpora el riesgo.':`En tu caso reemplaza a ${a.bestEv.name}, la recomendación por VE.`}`,a.bestEu.id==='dedicated'?'orange':a.bestEu.id==='modular'?'green':'blue')}`,
    `<p class="step-label">12 · Volver a dinero</p><h2>El equivalente cierto hace interpretable la utilidad</h2><p>El EC es el monto seguro indiferente a cada alternativa. La prima de riesgo es <strong>PR = VE − EC</strong>: cuánto valor monetario descuenta tu preferencia por la incertidumbre.</p>${payoffTable(a,'ce')}<div class="concept">Una prima positiva indica aversión local; una negativa, atracción local por el riesgo. La curva es estimada y puede mostrar comportamientos distintos en diferentes rangos.</div>`,
    `<p class="step-label">13 · Cierre</p><h2>La información también tiene un valor personal</h2><div class="metric-grid"><article><span>Valor muestral por VE</span><strong>${signed(a.evsi)}</strong><small>Decisor neutral al riesgo</small></article><article><span>Precio máximo según tu UE</span><strong>${signed(a.sampleWtp)}</strong><small>Precio que deja indiferente</small></article><article><span>Información perfecta por VE</span><strong>${signed(a.evpi)}</strong></article><article><span>Precio perfecto según tu UE</span><strong>${signed(a.perfectWtp)}</strong></article></div><p>Para tu curva, pagar ${signed(CASE.studyCost)} por el estudio <strong>${a.useStudyEu?'sí mejora':'no mejora'}</strong> la utilidad esperada respecto de decidir sin información.</p>${recommendation('Estrategia final personalizada',a.useStudyEu?`Contratar el estudio; con favorable, ${a.conditionalNetEu[0].bestEuNet.name.toLowerCase()}; con desfavorable, ${a.conditionalNetEu[1].bestEuNet.name.toLowerCase()}`:`No contratar; elegir ${a.bestEu.name.toLowerCase()}`,`El valor de la información no se obtuvo restando útiles: se buscó el precio que iguala la utilidad esperada con y sin estudio.`)}<div class="concept"><strong>La comparación central:</strong> sin probabilidades había varias respuestas defendibles; con probabilidades apareció el VE; con tu función de utilidad surgieron equivalentes ciertos, primas y un precio personal para la información.</div>`
  ];
  content.innerHTML=lessons[step];
  $('lesson-step').textContent=`Paso ${step+1} de ${lessons.length}`;$('lesson-progress-bar').style.width=`${((step+1)/lessons.length)*100}%`;
  $('lesson-section-label').textContent=lessonSections[step];$('lesson-back').disabled=step===0;$('lesson-next').textContent=step===lessons.length-1?'Ver síntesis final':'Adelante';
  renderTimeline('timeline-track','timeline-current',lessonMilestones[step],lessonMilestones.slice(0,step+1).flat());
  renderDecisionTree(step,a);
}

function svgText(x,y,text,klass='tree-text',anchor='start'){return `<text x="${x}" y="${y}" class="${klass}" text-anchor="${anchor}">${text}</text>`;}
function renderDecisionTree(step,a){
  const svg=$('case-tree');
  if(step<5){
    const showLeaves=step>=1,showProb=step>=3,showEv=step>=4;
    const rows=[130,350,570],parts=['<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>'];
    parts.push('<rect x="55" y="330" width="26" height="26" class="decision-node"/>',svgText(50,300,'Elegir escala','tree-label','start'));
    CASE.alternatives.forEach((alt,i)=>{const y=rows[i],active=showEv&&alt.id===a.bestEv.id;parts.push(`<path d="M81 343 C160 343 160 ${y} 265 ${y}" class="branch ${active?'chosen':''}" marker-end="url(#arrow)"/>`,svgText(145,(343+y)/2-7,alt.short,active?'tree-label chosen-text':'tree-label'),`<circle cx="290" cy="${y}" r="14" class="chance-node"/>`);if(showLeaves){parts.push(`<path d="M304 ${y} L590 ${y-55}" class="branch" marker-end="url(#arrow)"/>`,`<path d="M304 ${y} L590 ${y+55}" class="branch" marker-end="url(#arrow)"/>`,svgText(380,y-38,showProb?`Alta · ${percent(.65)}`:'Demanda alta','tree-small'),svgText(380,y+43,showProb?`Baja · ${percent(.35)}`:'Demanda baja','tree-small'),`<circle cx="608" cy="${y-58}" r="7" class="leaf-node"/>`,`<circle cx="608" cy="${y+58}" r="7" class="leaf-node"/>`,svgText(625,y-53,signed(alt.high),'tree-value'),svgText(625,y+63,signed(alt.low),'tree-value'));}if(showEv)parts.push(svgText(290,y+34,`VE ${signed(a.alternatives[i].ev)}`,active?'tree-badge chosen-text':'tree-badge','middle'));});
    svg.setAttribute('viewBox','0 0 820 700');svg.innerHTML=parts.join('');$('tree-title').textContent=showEv?'Árbol plegado por valor esperado':'Árbol de una decisión y un evento fortuito';return;
  }
  const useEu=step>=9,showSolved=step>=7,parts=['<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>'];
  parts.push('<rect x="38" y="485" width="26" height="26" class="decision-node"/>',svgText(28,468,'¿Estudiar?','tree-label'));
  parts.push('<path d="M64 498 C120 498 120 245 180 245" class="branch" marker-end="url(#arrow)"/>',svgText(87,352,`Sí · costo ${signed(2)}`,'tree-small'),'<circle cx="198" cy="245" r="14" class="chance-node"/>');
  parts.push('<path d="M64 498 C150 498 210 730 350 730" class="branch" marker-end="url(#arrow)"/>',svgText(120,675,'No','tree-small'));
  if(showSolved){parts.push(svgText(74,387,useEu?`UE con estudio ${num(a.sampleNetEu,3)}`:`VE con estudio ${signed(a.evWithSampleGross-CASE.studyCost)}`,'tree-badge'),svgText(142,704,useEu?`UE sin estudio ${num(a.bestEu.value,3)}`:`VE sin estudio ${signed(a.bestEv.value)}`,'tree-badge'));}
  const contexts=[
    {name:'Informe favorable',prob:a.reports[0].marginal,pHigh:a.reports[0].posteriorHigh,y:100,best:useEu?a.conditionalNetEu[0].bestEuNet:a.conditional[0].bestEv,cost:2},
    {name:'Informe desfavorable',prob:a.reports[1].marginal,pHigh:a.reports[1].posteriorHigh,y:390,best:useEu?a.conditionalNetEu[1].bestEuNet:a.conditional[1].bestEv,cost:2},
    {name:'Sin estudio',prob:1,pHigh:.65,y:700,best:useEu?a.bestEu:a.bestEv,cost:0}
  ];
  parts.push(`<path d="M212 245 C275 245 275 130 350 130" class="branch" marker-end="url(#arrow)"/>`,svgText(235,173,`F · ${percent(a.reports[0].marginal)}`,'tree-small'),`<path d="M212 245 C275 245 275 420 350 420" class="branch" marker-end="url(#arrow)"/>`,svgText(235,355,`D · ${percent(a.reports[1].marginal)}`,'tree-small'));
  contexts.forEach((ctx,ci)=>{const decisionY=ctx.y+30;parts.push(`<rect x="350" y="${decisionY-13}" width="26" height="26" class="decision-node"/>`,svgText(350,ctx.y-2,ctx.name,'tree-label'));CASE.alternatives.forEach((alt,i)=>{const y=ctx.y+i*78,chosen=showSolved&&ctx.best.id===alt.id;const high=alt.high-ctx.cost,low=alt.low-ctx.cost,nodeValue=useEu?ctx.pHigh*utilityAt(high)+(1-ctx.pHigh)*utilityAt(low):ctx.pHigh*high+(1-ctx.pHigh)*low;parts.push(`<path d="M376 ${decisionY} C445 ${decisionY} 465 ${y+30} 540 ${y+30}" class="branch ${chosen?'chosen':'muted'}" marker-end="url(#arrow)"/>`,svgText(425,(decisionY+y+30)/2-5,alt.short,chosen?'tree-small chosen-text':'tree-small'),`<circle cx="558" cy="${y+30}" r="12" class="chance-node ${chosen?'chosen-node':''}"/>`,`<path d="M570 ${y+30} L790 ${y+8}" class="branch ${chosen?'chosen':'muted'}" marker-end="url(#arrow)"/>`,`<path d="M570 ${y+30} L790 ${y+55}" class="branch ${chosen?'chosen':'muted'}" marker-end="url(#arrow)"/>`,svgText(625,y+4,`Alta ${percent(ctx.pHigh)}`,'tree-tiny'),svgText(625,y+70,`Baja ${percent(1-ctx.pHigh)}`,'tree-tiny'),`<circle cx="803" cy="${y+7}" r="6" class="leaf-node"/>`,`<circle cx="803" cy="${y+56}" r="6" class="leaf-node"/>`,svgText(818,y+12,`${signed(high)}${useEu?` · U ${num(utilityAt(high),2)}`:''}`,'tree-value'),svgText(818,y+61,`${signed(low)}${useEu?` · U ${num(utilityAt(low),2)}`:''}`,'tree-value'));if(showSolved)parts.push(svgText(558,y+58,useEu?`UE ${num(nodeValue,3)}`:`VE ${signed(nodeValue)}`,chosen?'tree-badge chosen-text':'tree-badge','middle'));});});
  svg.setAttribute('viewBox','0 0 1080 1030');svg.innerHTML=parts.join('');$('tree-title').textContent=useEu?'Árbol completo con utilidades personales':'Árbol completo con estudio y probabilidades posteriores';
}

function beginApplication(){state.applicationStep=0;state.applicationStartedAt=new Date().toISOString();$('header-status').textContent='Aplicación empresarial';show('screen-application');renderLesson();saveApplication({applicationStatus:'started',applicationStartedAt:state.applicationStartedAt});}
function openApplicationIntro(){show('screen-application-intro');}
function moveLesson(direction){
  const last=lessonSections.length-1;
  if(direction>0&&state.applicationStep===last){completeApplication();return;}
  state.applicationStep=Math.max(0,Math.min(last,state.applicationStep+direction));renderLesson();window.scrollTo({top:0,behavior:'smooth'});
}
async function saveApplication(data){if(!state.firebase)return false;try{const f=state.firebase;await f.setDoc(f.doc(f.db,'integratedResponses',f.uid),data,{merge:true});return true;}catch(error){console.warn('No se pudo guardar el avance de la aplicación.',error);return false;}}
function buildApplicationResult(){
  const a=caseAnalysis();
  return {case:'BioValle Envases',completedAt:new Date().toISOString(),durationMs:Date.now()-new Date(state.applicationStartedAt).getTime(),assumptions:{probabilityHigh:CASE.probabilityHigh,studyCost:CASE.studyCost,reliability:{favorableGivenHigh:.85,favorableGivenLow:.25}},alternatives:a.alternatives.map(x=>({id:x.id,name:x.name,high:x.high,low:x.low,expectedValue:Number(x.ev.toFixed(3)),expectedUtility:Number(x.eu.toFixed(5)),certaintyEquivalent:Number(x.ce.toFixed(3)),riskPremium:Number(x.riskPremium.toFixed(3))})),decisions:{withoutProbabilities:{maximax:'dedicated',maximin:'modular',laplace:'flexible',hurwicz:'flexible',minimaxRegret:'flexible'},expectedValue:a.bestEv.id,expectedUtility:a.bestEu.id,sampleStrategyExpectedValue:Object.fromEntries(a.conditional.map(r=>[r.id,r.bestEv.id])),sampleStrategyExpectedUtility:Object.fromEntries(a.conditionalNetEu.map(r=>[r.id,r.bestEuNet.id])),useStudyExpectedValue:a.netEvsi>0,useStudyExpectedUtility:a.useStudyEu},information:{sampleValueExpectedValue:Number(a.evsi.toFixed(3)),sampleNetExpectedValue:Number(a.netEvsi.toFixed(3)),sampleWillingnessToPayExpectedUtility:Number(a.sampleWtp.toFixed(3)),perfectValueExpectedValue:Number(a.evpi.toFixed(3)),perfectWillingnessToPayExpectedUtility:Number(a.perfectWtp.toFixed(3))}};
}
async function completeApplication(){
  state.applicationResult=buildApplicationResult();const saved=await saveApplication({applicationStatus:'completed',application:state.applicationResult,applicationCompletedAt:state.firebase?state.firebase.serverTimestamp():new Date().toISOString()});
  renderApplicationResults();$('application-save-status').textContent=saved?'La encuesta y la aplicación fueron guardadas correctamente.':'No se pudo confirmar el guardado remoto. Descargá la experiencia completa para conservarla.';show('screen-application-results');
}
function renderApplicationResults(){
  const a=caseAnalysis(),cF=a.conditional[0],cD=a.conditional[1];
  $('final-application-summary').innerHTML=`<div class="comparison-grid">${recommendation('Sin probabilidades','No hay una única decisión','Maximax elige dedicada; maximin, modular; los criterios intermedios, flexible.','orange')}${recommendation('Con probabilidades y VE',a.netEvsi>0?'Contratar el estudio':a.bestEv.name,a.netEvsi>0?`Luego: ${cF.bestEv.name.toLowerCase()} si es favorable y ${cD.bestEv.name.toLowerCase()} si es desfavorable.`:`Sin estudio: ${a.bestEv.name}.`)}${recommendation('Con tu utilidad esperada',a.useStudyEu?'Contratar el estudio':`No contratar: ${a.bestEu.name}`,a.useStudyEu?`Luego: ${a.conditionalNetEu[0].bestEuNet.name.toLowerCase()} si es favorable y ${a.conditionalNetEu[1].bestEuNet.name.toLowerCase()} si es desfavorable.`:`El costo de ${signed(2)} supera el valor personal del informe.`,a.bestEu.id==='dedicated'?'orange':a.bestEu.id==='modular'?'green':'blue')}</div><div class="panel information-comparison"><h2>Cuánto vale saber más</h2><div class="metric-grid"><article><span>Información muestral · VE</span><strong>${signed(a.evsi)}</strong></article><article><span>Información muestral · tu UE</span><strong>${signed(a.sampleWtp)}</strong></article><article><span>Información perfecta · VE</span><strong>${signed(a.evpi)}</strong></article><article><span>Información perfecta · tu UE</span><strong>${signed(a.perfectWtp)}</strong></article></div><p>El valor bajo utilidad es el precio máximo que puede descontarse de las consecuencias manteniendo indiferencia; no es una resta de utilidades.</p></div>`;
  drawApplicationChart(a);
}
function drawApplicationChart(a){
  const canvas=$('application-utility-chart'),ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1,w=1080,h=560;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const m={l:72,r:38,t:35,b:70},x=v=>m.l+(v+50)/100*(w-m.l-m.r),y=u=>h-m.b-u*(h-m.t-m.b);
  ctx.font='13px system-ui';ctx.fillStyle='#5b6f7d';ctx.strokeStyle='#d7dedf';ctx.lineWidth=1;for(let u=0;u<=1.001;u+=.25){ctx.beginPath();ctx.moveTo(m.l,y(u));ctx.lineTo(w-m.r,y(u));ctx.stroke();ctx.fillText(num(u,2),20,y(u)+4);}for(let v=-50;v<=50;v+=25)ctx.fillText(v===0?'$0':`${v<0?'−':''}$${Math.abs(v)} M`,x(v)-18,h-28);
  const points=state.finalPayload.utilities;ctx.strokeStyle='#163b5c';ctx.lineWidth=4;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.outcome),y(p.utility)):ctx.moveTo(x(p.outcome),y(p.utility)));ctx.stroke();
  a.alternatives.forEach(alt=>{[alt.low,alt.high].forEach(value=>{ctx.beginPath();ctx.arc(x(value),y(utilityAt(value)),7,0,Math.PI*2);ctx.fillStyle=alt.color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();});ctx.save();ctx.translate(x(alt.ce),y(alt.eu));ctx.rotate(Math.PI/4);ctx.fillStyle=alt.color;ctx.fillRect(-6,-6,12,12);ctx.restore();});
  $('application-chart-legend').innerHTML=a.alternatives.map(alt=>`<span><i style="background:${alt.color}"></i>${alt.name}: resultados ● y EC ◆</span>`).join('');
}

const GAME={
  assumedExpansion:.20,
  bio:[
    {id:'dedicated',name:'Planta dedicada',short:'Dedicada',maintain:{bio:42,rival:14},expand:{bio:-18,rival:34}},
    {id:'flexible',name:'Planta flexible',short:'Flexible',maintain:{bio:30,rival:23},expand:{bio:16,rival:28}},
    {id:'modular',name:'Adaptación modular',short:'Modular',maintain:{bio:20,rival:26},expand:{bio:12,rival:21}}
  ],
  rival:[{id:'maintain',name:'Mantener capacidad'},{id:'expand',name:'Expandirse'}]
};
const gameSections=['De la naturaleza al rival','Matriz estratégica','Mejores respuestas','Dominancia','Equilibrio de Nash','Probabilidad versus estrategia','Juego secuencial','Utilidad y síntesis'];
const gameMilestones=[['cournot'],['vnm'],['cournot'],['vonneumann','vnm'],['nash'],['huygens','vnm'],['kuhn'],['vnm','pratt']];

function gameAnalysis(){
  const q=GAME.assumedExpansion;
  const rows=GAME.bio.map(row=>{
    const ev=(1-q)*row.maintain.bio+q*row.expand.bio;
    const eu=(1-q)*utilityAt(row.maintain.bio)+q*utilityAt(row.expand.bio);
    return {...row,ev,eu};
  });
  const bestBio={maintain:argmax(rows.map(row=>({id:row.id,name:row.name,value:row.maintain.bio}))),expand:argmax(rows.map(row=>({id:row.id,name:row.name,value:row.expand.bio})))};
  const bestRival=Object.fromEntries(rows.map(row=>[row.id,row.expand.rival>row.maintain.rival?'expand':'maintain']));
  const nash=[];rows.forEach(row=>GAME.rival.forEach(action=>{if(bestBio[action.id].id===row.id&&bestRival[row.id]===action.id)nash.push({bio:row.id,rival:action.id,payoff:row[action.id]});}));
  const naiveEv=argmax(rows.map(row=>({id:row.id,name:row.name,value:row.ev})));
  const naiveEu=argmax(rows.map(row=>({id:row.id,name:row.name,value:row.eu})));
  const gainDedicated=utilityAt(42)-utilityAt(30),gainFlexible=utilityAt(16)-utilityAt(-18);
  const utilityThreshold=gainDedicated/(gainDedicated+gainFlexible);
  const sequential=rows.map(row=>{const response=bestRival[row.id];return {id:row.id,name:row.name,response,bio:row[response].bio,rival:row[response].rival};});
  const sequentialBest=argmax(sequential.map(row=>({id:row.id,name:row.name,value:row.bio,response:row.response,rivalValue:row.rival})));
  return {rows,bestBio,bestRival,nash,naiveEv,naiveEu,utilityThreshold,sequential,sequentialBest};
}

function gameMatrix(a,{highlight=false,eliminate=false}={}){
  const head=GAME.rival.map(action=>`<th>${action.name}</th>`).join('');
  const body=a.rows.map(row=>`<tr class="${eliminate&&row.id==='modular'?'eliminated':''}"><th>${row.name}</th>${GAME.rival.map(action=>{
    const bestBio=highlight&&a.bestBio[action.id].id===row.id,bestRival=highlight&&a.bestRival[row.id]===action.id;
    return `<td class="game-cell ${bestBio?'best-bio':''} ${bestRival?'best-rival':''} ${eliminate&&row.id==='modular'?'eliminated':''}"><span>BioValle · EcoPack</span><strong>${signed(row[action.id].bio)} · ${signed(row[action.id].rival)}</strong></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="game-matrix"><thead><tr><th>BioValle \ EcoPack</th>${head}</tr></thead><tbody>${body}</tbody></table></div>${highlight?'<div class="game-key"><span><i class="bio"></i>Mejor respuesta de BioValle</span><span><i class="rival"></i>Mejor respuesta de EcoPack</span><span><i class="nash"></i>Coincidencia: equilibrio</span></div>':''}`;
}

function renderGameVisual(step,a){
  const visual=$('game-visual');
  if(step===0){
    $('game-visual-title').textContent='Dos modelos para la misma incertidumbre';
    visual.innerHTML=`<div class="strategic-shift"><article><span>Estado de la naturaleza</span><strong>No elige ni responde</strong><p>Solo se le asignan probabilidades.</p></article><b>→</b><article><span>Competidor</span><strong>Elige según sus pagos</strong><p>Anticipa y responde a BioValle.</p></article></div><div class="concept">La flecha conceptual es el cambio central: de riesgo exógeno a interdependencia estratégica.</div>`;return;
  }
  if(step===6){
    $('game-visual-title').textContent='Árbol estratégico por inducción hacia atrás';
    visual.innerHTML=`<div class="sequence-tree"><div class="sequence-node sequence-root"><strong>BioValle elige primero</strong><small>EcoPack observa</small></div><div class="sequence-level">${a.sequential.map(x=>`<article class="sequence-node ${x.id===a.sequentialBest.id?'chosen':''}"><strong>${x.name}</strong><small>EcoPack: ${x.response==='expand'?'expandirse':'mantener'}</small><small>BioValle recibe ${signed(x.bio)}</small></article>`).join('')}</div><div class="sequence-result"><strong>Inducción hacia atrás:</strong> EcoPack responde óptimamente a cada planta; BioValle anticipa esas respuestas y elige <strong>${a.sequentialBest.name}</strong>.</div></div>`;return;
  }
  $('game-visual-title').textContent=step===5?'Pagos y valor bajo una creencia fija':step===7?'Pagos estratégicos y utilidad personal':'Matriz de pagos de ambos jugadores';
  visual.innerHTML=gameMatrix(a,{highlight:step>=2,eliminate:step===3});
  if(step===5)visual.innerHTML+=`<div class="metric-grid"><article><span>Supuesto fijo</span><strong>${percent(GAME.assumedExpansion)} de expansión</strong></article><article><span>Mejor VE</span><strong>${a.naiveEv.name}</strong><small>${signed(a.naiveEv.value)}</small></article></div>`;
  if(step===7)visual.innerHTML+=`<div class="utility-threshold"><span>Umbral personal Dedicada/Flexible</span><strong>${percent(a.utilityThreshold)} de expansión</strong><p>Por encima de ese valor, tu utilidad esperada prefiere Flexible entre esas dos plantas.</p></div>`;
}

function renderGameLesson(){
  const a=gameAnalysis(),step=state.gameStep,content=$('game-content'),equilibrium=a.nash[0];
  const lessons=[
    `<p class="step-label">1 · Cambio de modelo</p><h2>La demanda ya no es completamente exógena</h2><p>BioValle descubre que EcoPack Sur puede ampliar su capacidad y capturar contratos. Esa acción modifica los VPN de ambas empresas.</p><div class="strategic-shift"><article><span>Antes</span><strong>Demanda alta o baja</strong><p>Un evento sin objetivos propios.</p></article><b>→</b><article><span>Ahora</span><strong>Mantenerse o expandirse</strong><p>Una elección con incentivos propios.</p></article></div><div class="concept"><strong>Pregunta estratégica:</strong> no solo “¿qué puede ocurrir?”, sino “¿qué le conviene hacer al otro?”.</div>`,
    `<p class="step-label">2 · Forma normal</p><h2>Cada celda contiene dos resultados</h2><p>BioValle elige una fila y EcoPack una columna. El primer VPN de cada celda pertenece a BioValle; el segundo, a EcoPack.</p>${gameMatrix(a)}<div class="concept">No se suman los pagos: cada jugador ordena las celdas con su propio resultado.</div>`,
    `<p class="step-label">3 · Racionalidad estratégica</p><h2>Buscamos la mejor respuesta de cada jugador</h2><p>Para cada columna, BioValle elige su mayor VPN. Para cada fila, EcoPack elige el suyo. Las marcas muestran esas respuestas condicionales.</p>${gameMatrix(a,{highlight:true})}<div class="concept">Un equilibrio requiere que ambas mejores respuestas coincidan en la misma celda.</div>`,
    `<p class="step-label">4 · Simplificación</p><h2>La planta flexible domina estrictamente a la modular</h2><p>Flexible entrega más a BioValle tanto si EcoPack mantiene capacidad (${signed(30)} &gt; ${signed(20)}) como si se expande (${signed(16)} &gt; ${signed(12)}). Modular puede eliminarse en el juego simultáneo.</p>${gameMatrix(a,{highlight:true,eliminate:true})}<p>En el juego reducido, expandirse es la mejor respuesta de EcoPack frente a las dos filas restantes.</p>`,
    `<p class="step-label">5 · Solución simultánea</p><h2>El equilibrio de Nash es Flexible–Expandirse</h2><p>En <strong>${a.rows.find(x=>x.id===equilibrium.bio).name} / ${equilibrium.rival==='expand'?'EcoPack se expande':'EcoPack mantiene'}</strong>, ningún jugador mejora cambiando unilateralmente.</p>${gameMatrix(a,{highlight:true})}<div class="concept">Equilibrio no significa mejor resultado conjunto ni acuerdo: significa ausencia de una desviación unilateral rentable.</div>`,
    `<p class="step-label">6 · Contraste</p><h2>Asignar una probabilidad no reemplaza modelar incentivos</h2><p>Si BioValle tratara la expansión como naturaleza y le asignara solo ${percent(GAME.assumedExpansion)}, el VE recomendaría <strong>${a.naiveEv.name}</strong>. Pero EcoPack tiene un incentivo fuerte para expandirse frente a esa planta.</p><div class="recommendation-grid">${recommendation('Como estado aleatorio',a.naiveEv.name,`VE ${signed(a.naiveEv.value)} con P(expansión)=${percent(GAME.assumedExpansion)}.`,'orange')}${recommendation('Como juego simultáneo','Planta flexible',`EcoPack se expande; BioValle obtiene ${signed(16)}.`)}${recommendation('Lección','La probabilidad sola es incompleta','El rival reacciona a la alternativa elegida.','green')}</div>`,
    `<p class="step-label">7 · Orden de las jugadas</p><h2>Si EcoPack observa primero, cambia la recomendación</h2><p>EcoPack se expande frente a Dedicada y Flexible, pero mantiene capacidad frente a Modular. BioValle anticipa esas respuestas.</p><div class="metric-grid">${a.sequential.map(x=>`<article><span>${x.name}</span><strong>${x.response==='expand'?'EcoPack se expande':'EcoPack mantiene'}</strong><small>BioValle: ${signed(x.bio)}</small></article>`).join('')}</div>${recommendation('Equilibrio por inducción hacia atrás',a.sequentialBest.name,`EcoPack responde manteniendo capacidad y BioValle obtiene ${signed(a.sequentialBest.value)}.`,'green')}`,
    `<p class="step-label">8 · Tu utilidad en el juego</p><h2>La utilidad importa cuando todavía existe incertidumbre</h2><p>En una celda segura, una transformación creciente de los VPN conserva las mejores respuestas: por eso tu curva no altera el equilibrio puro. Si no sabés con certeza cómo responderá EcoPack, sí corresponde comparar utilidades esperadas.</p><div class="utility-threshold"><span>Tu umbral entre Dedicada y Flexible</span><strong>${percent(a.utilityThreshold)} de probabilidad de expansión</strong><p>Con la creencia didáctica de ${percent(GAME.assumedExpansion)}, tu UE elegiría <strong>${a.naiveEu.name}</strong>; el análisis estratégico simultáneo elige Flexible y el secuencial elige Modular.</p></div><div class="concept"><strong>Cierre:</strong> riesgo y estrategia no compiten entre sí. La utilidad modela tus preferencias; la teoría de juegos modela que los demás también eligen.</div>`
  ];
  content.innerHTML=lessons[step];
  $('game-step').textContent=`Paso ${step+1} de ${lessons.length}`;$('game-progress-bar').style.width=`${((step+1)/lessons.length)*100}%`;
  $('game-section-label').textContent=gameSections[step];$('game-back').disabled=step===0;$('game-next').textContent=step===lessons.length-1?'Ver síntesis final':'Adelante';
  renderTimeline('game-timeline-track','game-timeline-current',gameMilestones[step],[...lessonMilestones.flat(),...gameMilestones.slice(0,step+1).flat()]);renderGameVisual(step,a);
}

function openGameIntro(){show('screen-game-intro');}
function beginGame(){state.gameStep=0;state.gameStartedAt=new Date().toISOString();$('header-status').textContent='Interacción estratégica';show('screen-game');renderGameLesson();saveApplication({gameStatus:'started',gameStartedAt:state.gameStartedAt});}
function moveGame(direction){
  const last=gameSections.length-1;if(direction>0&&state.gameStep===last){completeGame();return;}
  state.gameStep=Math.max(0,Math.min(last,state.gameStep+direction));renderGameLesson();window.scrollTo({top:0,behavior:'smooth'});
}
function buildGameResult(){
  const a=gameAnalysis(),eq=a.nash[0];
  return {case:'BioValle Envases frente a EcoPack Sur',completedAt:new Date().toISOString(),durationMs:Date.now()-new Date(state.gameStartedAt).getTime(),assumedExpansionProbability:GAME.assumedExpansion,payoffs:a.rows.map(row=>({id:row.id,maintain:row.maintain,expand:row.expand})),decisions:{treatedAsNatureExpectedValue:a.naiveEv.id,treatedAsNatureExpectedUtility:a.naiveEu.id,simultaneousNash:{bioValle:eq.bio,ecoPack:eq.rival,payoff:eq.payoff},sequentialBackwardInduction:{bioValle:a.sequentialBest.id,ecoPack:a.sequentialBest.response,bioVallePayoff:a.sequentialBest.value,rivalPayoff:a.sequentialBest.rivalValue},personalExpansionThreshold:Number(a.utilityThreshold.toFixed(5))}};
}
async function completeGame(){
  state.gameResult=buildGameResult();const saved=await saveApplication({gameStatus:'completed',game:state.gameResult,gameCompletedAt:state.firebase?state.firebase.serverTimestamp():new Date().toISOString()});
  renderGameResults();$('game-save-status').textContent=saved?'La encuesta, la aplicación y la extensión estratégica fueron guardadas correctamente.':'No se pudo confirmar el guardado remoto. Descargá la experiencia completa para conservarla.';show('screen-game-results');
}
function renderGameResults(){
  const a=gameAnalysis();$('final-game-summary').innerHTML=`<div class="game-conclusion"><article><span>Competidor como naturaleza</span><strong>${a.naiveEv.name}</strong><small>Con P(expansión)=${percent(GAME.assumedExpansion)}, el VE es ${signed(a.naiveEv.value)}.</small></article><article><span>Juego simultáneo</span><strong>Flexible · Expandirse</strong><small>Único equilibrio de Nash: ${signed(16)} para BioValle y ${signed(28)} para EcoPack.</small></article><article><span>BioValle mueve primero</span><strong>Modular · Mantener</strong><small>Inducción hacia atrás: ${signed(20)} para BioValle y ${signed(26)} para EcoPack.</small></article></div><div class="concept"><strong>Resultado revelador:</strong> el “estado” no tenía una probabilidad estable independiente de BioValle. EcoPack responde a la planta elegida y el orden de las decisiones modifica el resultado.</div>`;
  $('final-timeline').innerHTML=`<div class="timeline-track">${TIMELINE.map(item=>`<article class="timeline-item reached"><span>${item.year}</span><strong>${item.author}</strong></article>`).join('')}</div>`;
}

function downloadComplete(){const complete={survey:state.finalPayload,application:state.applicationResult??buildApplicationResult(),game:state.gameResult},blob=new Blob([JSON.stringify(complete,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`experiencia-decision-juegos-${state.participantCode.replace(/[^a-z0-9-]/gi,'_')}.json`;a.click();URL.revokeObjectURL(url);}

$('start-button').addEventListener('click',()=>{if(initParticipant())show('screen-instructions');});$('participant-code').addEventListener('keydown',e=>{if(e.key==='Enter')$('start-button').click();});
$('practice-button').addEventListener('click',beginPractice);$('experiment-button').addEventListener('click',beginExperiment);
$('choice-safe').addEventListener('click',()=>choose('safe'));$('choice-lottery').addEventListener('click',()=>choose('lottery'));$('choice-equal').addEventListener('click',()=>choose('equal'));
$('prediction-safe').addEventListener('click',()=>answerPrediction('safe'));$('prediction-lottery').addEventListener('click',()=>answerPrediction('lottery'));$('prediction-continue').addEventListener('click',continuePrediction);
$('download-button').addEventListener('click',downloadResults);$('restart-button').addEventListener('click',()=>location.reload());
$('application-button').addEventListener('click',openApplicationIntro);$('application-start').addEventListener('click',beginApplication);
$('lesson-back').addEventListener('click',()=>moveLesson(-1));$('lesson-next').addEventListener('click',()=>moveLesson(1));
$('tree-key-button').addEventListener('click',()=>{const legend=$('tree-legend'),open=legend.hidden;legend.hidden=!open;$('tree-key-button').setAttribute('aria-expanded',String(open));});
$('download-complete-button').addEventListener('click',downloadComplete);$('review-application-button').addEventListener('click',()=>{state.applicationStep=0;show('screen-application');renderLesson();});$('finish-button').addEventListener('click',()=>location.reload());
$('game-button').addEventListener('click',openGameIntro);$('game-start').addEventListener('click',beginGame);
$('game-back').addEventListener('click',()=>moveGame(-1));$('game-next').addEventListener('click',()=>moveGame(1));
$('download-full-button').addEventListener('click',downloadComplete);$('review-game-button').addEventListener('click',()=>{state.gameStep=0;show('screen-game');renderGameLesson();});$('finish-game-button').addEventListener('click',()=>location.reload());
document.addEventListener('keydown',e=>{if(!$('screen-choice').classList.contains('active'))return;if(e.key==='1')choose(state.choiceReversed?'lottery':'safe');if(e.key==='2')choose(state.choiceReversed?'safe':'lottery');if(e.key==='3')choose('equal');});
window.addEventListener('resize',()=>{if(state.finalPayload)drawChart(state.finalPayload.utilities);if($('screen-application-results').classList.contains('active'))drawApplicationChart(caseAnalysis());});
