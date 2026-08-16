(() => {
  'use strict';

  const CURR = window.CURRICULUM;
  const STORAGE_KEY = 'materiales_ebr_primaria_v1';
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'];
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  const debounce = (fn, delay=350) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args),delay); }; };

  const competenceIndex = {};
  const areaIndex = {};
  const planningAreas = CURR.areas.filter(area => area.id !== 'transversal');
  CURR.areas.forEach(area => {
    areaIndex[area.id] = area;
    area.competencies.forEach(comp => competenceIndex[comp.id] = {...comp, areaId:area.id, areaName:area.name});
  });

  const createDefaultState = () => ({
    meta: { schoolName:'', teacherName:'', year:2026, schoolType:'Unidocente', grades:[1], vision:'', mission:'' },
    workflow: {
      mode:'create',
      importText:'',
      importValidated:false,
      importData:{ grades:[1], year:2026, teacherName:'', schoolName:'', periodType:'Bimestres', summary:'', units:[] }
    },
    sources: {
      diagnosis:{ text:'', fileName:'' },
      calendar:{ text:'', fileName:'' },
      identity:{ text:'', fileName:'' }
    },
    context: { problems:[], potential:[], needs:[], events:[], validated:false },
    programming: {
      start:'2026-03-16', end:'2026-12-20', periodType:'Bimestres', unitCount:8,
      units:[], matrix:{},
      studyPlan: CURR.areas.filter(a=>a.id!=='transversal').map(a=>({areaId:a.id, name:a.name, III:a.defaultHours, IV:a.defaultHours, V:a.defaultHours})).concat([{areaId:'tutoria',name:'Tutoría y convivencia',III:2,IV:2,V:2}]),
      values:[
        {id:uid('val'), value:'Respeto', attitudes:'Tolerancia, amabilidad, cortesía y consideración.'},
        {id:uid('val'), value:'Responsabilidad', attitudes:'Puntualidad, perseverancia, orden y organización.'},
        {id:uid('val'), value:'Honestidad', attitudes:'Transparencia, veracidad, lealtad y confianza.'},
        {id:uid('val'), value:'Identidad', attitudes:'Pertenencia, originalidad, voluntad y compromiso.'}
      ],
      evaluation:'La evaluación será permanente, flexible y criterial. Permitirá recoger y analizar evidencias relevantes sobre los aprendizajes para retroalimentar oportunamente a los estudiantes y tomar decisiones pedagógicas. Los instrumentos se seleccionarán según la evidencia y los criterios de evaluación de cada unidad y sesión.'
    },
    confirmations: {
      annual: { confirmed:false },
      units: {},
      sessionDraft: { confirmed:false }
    },
    unitsData:{},
    sessions:[]
  });

  let state = loadState();
  let currentView = 'inicio';
  let currentUnitId = '';
  let didacticPhases = [];
  let instrumentCriteria = [];

  function currentProgrammingArea(){
    return planningAreas[0] || CURR.areas[0];
  }
  function currentProgrammingCompetencies(){
    return planningAreas.flatMap(area => area.competencies || []);
  }
  function getUnitArea(unitId){
    const unit=state.programming.units.find(item=>item.id===unitId);
    return areaIndex[unit?.areaId] || null;
  }

  function ensureConfirmationState(){
    state.confirmations ??= { annual:{ confirmed:false }, units:{}, sessionDraft:{ confirmed:false } };
    state.confirmations.annual ??= { confirmed:false };
    state.confirmations.units ??= {};
    state.confirmations.sessionDraft ??= { confirmed:false };
  }
  function ensureWorkflowState(){
    state.workflow ??= createDefaultState().workflow;
    state.workflow.importData ??= createDefaultState().workflow.importData;
  }
  function isAnnualConfirmed(){ ensureConfirmationState(); return !!state.confirmations.annual.confirmed; }
  function isUnitConfirmed(id=currentUnitId){ ensureConfirmationState(); return !!(id && state.confirmations.units[id]?.confirmed); }
  function isSessionConfirmed(){ ensureConfirmationState(); return !!state.confirmations.sessionDraft.confirmed; }
  function invalidateAnnualConfirmation(){ ensureConfirmationState(); state.confirmations.annual={ confirmed:false }; renderAnnualPreviewStatus(); }
  function invalidateUnitConfirmation(id=currentUnitId){ ensureConfirmationState(); if(!id)return; state.confirmations.units[id]={ confirmed:false }; renderUnitPreviewStatus(id); }
  function invalidateSessionConfirmation(){ ensureConfirmationState(); state.confirmations.sessionDraft={ confirmed:false }; renderSessionPreviewStatus(); }

  function loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      return mergeDefaults(createDefaultState(), parsed);
    } catch(e){ return createDefaultState(); }
  }
  function mergeDefaults(base, incoming){
    if(Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
    if(base && typeof base==='object'){
      const out={...base};
      if(incoming && typeof incoming==='object') Object.keys(incoming).forEach(k=>{
        out[k] = k in base ? mergeDefaults(base[k], incoming[k]) : incoming[k];
      });
      return out;
    }
    return incoming ?? base;
  }
  function saveState(show=false){
    syncMetaFromForm();
    syncProgrammingBasics();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if(show) toast('Proyecto guardado localmente.');
    updateMetrics();
  }
  const autoSave = debounce(()=>saveState(false), 500);

  function toast(message){
    const el=$('#toast'); el.textContent=message; el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'),2200);
  }

  function cyclesFromGrades(grades=state.meta.grades){
    const set=new Set();
    grades.forEach(g=>{ if(g<=2)set.add('III'); else if(g<=4)set.add('IV'); else set.add('V'); });
    return ['III','IV','V'].filter(c=>set.has(c));
  }

  function periodMeta(type=state.programming.periodType){
    const isBim=type==='Bimestres';
    return {count:isBim?4:3, singular:isBim?'bimestre':'trimestre', plural:isBim?'bimestres':'trimestres'};
  }
  function periodLabel(n,type=state.programming.periodType){
    const meta=periodMeta(type);
    const ord=n===1?'1.er':n===3?'3.er':`${n}.°`;
    return `${ord} ${meta.singular}`;
  }
  function assignPeriodsToUnits(force=false){
    const units=state.programming.units||[];
    if(!units.length)return;
    const meta=periodMeta();
    const invalid=units.some(u=>!Number.isInteger(Number(u.period))||Number(u.period)<1||Number(u.period)>meta.count);
    if(!force&&!invalid)return;
    const base=Math.floor(units.length/meta.count), remainder=units.length%meta.count;
    let cursor=0;
    for(let p=1;p<=meta.count;p++){
      const size=base+(p>meta.count-remainder?1:0);
      for(let i=0;i<size&&cursor<units.length;i++,cursor++)units[cursor].period=p;
    }
    while(cursor<units.length){units[cursor].period=meta.count;cursor++}
  }
  function updatePeriodUI(reassign=false){
    const meta=periodMeta($('#periodType')?.value||state.programming.periodType);
    const display=$('#periodCountDisplay');
    if(display)display.value=`${meta.count} ${meta.plural}`;
    const unitInput=$('#unitCount');
    if(unitInput){unitInput.min=meta.count;if(Number(unitInput.value)<meta.count)unitInput.value=meta.count;state.programming.unitCount=Number(unitInput.value)||meta.count;}
    const summary=$('#periodSummary');
    if(summary){
      const start=$('#annualStart')?.value || state.programming.start;
      const end=$('#annualEnd')?.value || state.programming.end;
      summary.textContent=`La programación se organizará en ${meta.count} ${meta.plural} entre ${start} y ${end}. La distribución usa el calendario real del año lectivo y luego puedes ajustarla manualmente.`;
    }
    if(reassign){syncProgrammingBasics();assignPeriodsToUnits(true);saveState(false);renderUnitsEditor();renderCurriculumMatrix();}
  }

  function init(){
    ensureConfirmationState();
    ensureWorkflowState();
    if(window.pdfjsLib){
      try{ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }catch(e){}
    }
    bindNavigation();
    bindGlobalActions();
    hydrateForms();
    bindSourceInputs();
    bindProgramming();
    bindUnitModule();
    bindSessionModule();
    bindCurriculumBrowser();
    renderAll();
  }

  function bindNavigation(){
    $$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
    $$('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.goto)));
  }
  function showView(name){
    currentView=name;
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
    const activeStep=name==='sesion'||name==='unidad'?3:name==='programacion'?2:1;
    $$('.workflow-step').forEach((step,index)=>step.classList.toggle('active',index===activeStep-1));
    const titles={inicio:'Plataforma de Primaria',fuentes:'1. Información',programacion:'2. Programación anual',unidad:'3. Unidades',sesion:'4. Sesiones',curriculo:'Opciones avanzadas'};
    $('#viewTitle').textContent=titles[name]||'Materiales EBR';
    if(name==='unidad') refreshUnitSelectors();
    if(name==='sesion') refreshSessionSelectors();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function bindGlobalActions(){
    $('#btnStartCreate').addEventListener('click',()=>{setWorkflowMode('create');showView('fuentes');});
    $('#btnStartImport').addEventListener('click',()=>{setWorkflowMode('import');showView('fuentes');});
    $('#btnSave').addEventListener('click',()=>saveState(true));
    $('#btnExport').addEventListener('click',exportProject);
    $('#projectImport').addEventListener('change',importProject);
    $('#btnConfirmAnnualPreview').addEventListener('click',confirmAnnualPreview);
    $('#btnConfirmUnitPreview').addEventListener('click',confirmUnitPreview);
    $('#btnConfirmSessionPreview').addEventListener('click',confirmSessionPreview);
    $('#btnDownloadUnits').addEventListener('click',downloadUnitsBundle);
    $('#btnDownloadSessions').addEventListener('click',downloadSessionsBundle);
    $('#btnEditAnnualPreview').addEventListener('click',()=>scrollToSectionTop('view-programacion'));
    $('#btnEditUnitPreview').addEventListener('click',()=>scrollToSectionTop('view-unidad'));
    $('#btnEditSessionPreview').addEventListener('click',()=>scrollToSectionTop('view-sesion'));
    $('#btnPrint').addEventListener('click',()=>{
      if(currentView==='programacion'){ if(!$('#annualPreview').innerHTML || $('#annualPreviewPanel')?.classList.contains('preview-hidden')){ toast('Primero genera la vista previa de la programación.'); return; } printTarget('annualPreview'); }
      else if(currentView==='unidad'){ if(!$('#unitPreview').innerHTML){ toast('Primero genera la vista previa de la unidad.'); return; } printTarget('unitPreview'); }
      else if(currentView==='sesion'){ if(!$('#sessionPreview').innerHTML){ toast('Primero genera la vista previa de la sesión.'); return; } printTarget('sessionPreview'); }
      else { toast('Abre una programación, unidad o sesión para imprimir.'); }
    });
    $$('[data-print-target]').forEach(btn=>btn.addEventListener('click',()=>printTarget(btn.dataset.printTarget)));
    $$('input,textarea,select').forEach(el=>el.addEventListener('input',autoSave));
    bindConfirmationInvalidators();
  }

  function setWorkflowMode(mode){
    ensureWorkflowState();
    state.workflow.mode=mode;
    if(mode==='import') state.context.validated=false;
    renderWorkflowMode();
    saveState(false);
  }

  function renderWorkflowMode(){
    ensureWorkflowState();
    const mode=state.workflow.mode || 'create';
    $('#workflowModeBadge').textContent=mode==='import'?'Ruta B':'Ruta A';
    ['modeCreateCard','modeImportCard'].forEach(id=>$("#"+id)?.classList.toggle('active', $("#"+id)?.dataset.mode===mode));
    $('#importPanel')?.classList.toggle('is-hidden',mode!=='import');
    $('#importReviewPanel')?.classList.toggle('is-hidden',mode!=='import');
  }

  function bindConfirmationInvalidators(){
    const register=(viewId,handler)=>{
      const root=$(`#${viewId}`);
      if(!root) return;
      ['input','change'].forEach(evt=>root.addEventListener(evt,e=>{
        if(e.target.closest('.preview-toolbar') || e.target.closest('.document-preview')) return;
        handler();
      }));
    };
    register('view-programacion',()=>invalidateAnnualConfirmation());
    register('view-unidad',()=>invalidateUnitConfirmation());
    register('view-sesion',()=>invalidateSessionConfirmation());
  }

  function exportProject(){
    saveState(false);
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`materiales_ebr_primaria_${state.meta.year}.json`; a.click(); URL.revokeObjectURL(url);
    toast('Proyecto exportado en JSON.');
  }

  function downloadHtmlDocument(filename,title,content){
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;background:#eef2f5;margin:0;padding:20px} .document-preview{max-width:1400px;margin:0 auto} .doc-page{background:#fff;margin:0 auto 20px;padding:15mm 14mm;box-shadow:0 8px 24px rgba(0,0,0,.12)} .doc-page.landscape{max-width:297mm} .doc-page.portrait{max-width:210mm} table{border-collapse:collapse;width:100%} th,td{border:1px solid #333;padding:6px;vertical-align:top} h1,h2,h3{margin:0 0 8px} .doc-title,.doc-subtitle{text-align:center} .doc-note,.doc-box{border:1px solid #bbb;padding:8px;margin-top:8px;background:#f8fafb} .doc-signature{text-align:center;margin-top:40px} .doc-signature-line{display:inline-block;min-width:240px;border-top:1px solid #222;padding-top:6px} .source-list{margin:0;padding-left:18px}</style></head><body><div class="document-preview">${content}</div></body></html>`;
    const blob=new Blob([html],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadUnitsBundle(){
    if(!isAnnualConfirmed()){ toast('Primero valida la programación anual.'); return; }
    const unitIds=state.programming.units.map(unit=>unit.id);
    const docs=[];
    unitIds.forEach(id=>{
      currentUnitId=id;
      saveCurrentUnit(false);
      if(!validateUnitData(id).errors.length){
        const previous=$('#unitPreview').innerHTML;
        generateUnitPreview();
        docs.push($('#unitPreview').innerHTML);
        $('#unitPreview').innerHTML=previous;
      }
    });
    if(!docs.length){ toast('No hay unidades listas para descargar.'); return; }
    downloadHtmlDocument(`unidades_primaria_${state.meta.year}.html`,'Unidades de Primaria',docs.join(''));
    refreshUnitSelectors();
    toast('Se descargó el paquete de unidades en HTML imprimible.');
  }

  function downloadSessionsBundle(){
    if(!isAnnualConfirmed()){ toast('Primero valida la programación anual.'); return; }
    const docs=[];
    state.sessions.forEach(session=>{
      if(validateSessionData(session).errors.length) return;
      const comp=competenceIndex[session.compId];
      const cycles=cyclesFromGrades();
      const unit=state.programming.units.find(u=>u.id===session.unitId);
      const criteriaRows=cycles.map(cy=>`<th>Criterio ${cy}</th>`).join('');
      const criteriaVals=cycles.map(cy=>`<td>${esc(session.criteria[cy]||'Pendiente')}</td>`).join('');
      docs.push(`<div class="doc-page landscape page-dense"><div class="doc-title">SESIÓN DE APRENDIZAJE</div><div class="doc-subtitle">${esc(session.date||'Fecha pendiente')}</div><div class="doc-section"><h3>I. Título</h3><p><b>${esc(session.title||'Pendiente')}</b></p></div><div class="doc-section"><h3>II. Aprendizaje esperado</h3><table class="doc-table"><tr><th>Área</th><th>Competencia</th><th>Propósito</th>${criteriaRows}<th>Evidencia</th><th>Instrumento</th></tr><tr><td>${esc(comp.areaName)}</td><td>${esc(comp.name)}</td><td>${esc(session.purpose||'Pendiente')}</td>${criteriaVals}<td>${esc(session.evidence||'Pendiente')}</td><td>${esc(session.instrument)}</td></tr></table><div class="doc-note">Unidad de procedencia: ${esc(unit?.title||session.unitId)}</div></div></div>`);
    });
    if(!docs.length){ toast('No hay sesiones guardadas y válidas para descargar.'); return; }
    downloadHtmlDocument(`sesiones_primaria_${state.meta.year}.html`,'Sesiones de Primaria',docs.join(''));
    toast('Se descargó el paquete de sesiones en HTML imprimible.');
  }
  async function importProject(ev){
    const file=ev.target.files?.[0]; if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      state=mergeDefaults(createDefaultState(),parsed); saveState(false); hydrateForms(); renderAll(); toast('Proyecto importado.');
    }catch(e){ toast('No se pudo importar el proyecto.'); }
    ev.target.value='';
  }

  function printTarget(id){
    const target=$(`#${id}`); if(!target || !target.innerHTML.trim()){ toast('Genera primero la vista previa.'); return; }
    if(id==='annualPreview' && !isAnnualConfirmed()){ toast('Confirma primero que la vista previa de la programación está conforme.'); $('#btnConfirmAnnualPreview')?.focus(); return; }
    if(id==='unitPreview' && !isUnitConfirmed()){ toast('Confirma primero que la vista previa de la unidad está conforme.'); $('#btnConfirmUnitPreview')?.focus(); return; }
    if(id==='sessionPreview' && !isSessionConfirmed()){ toast('Confirma primero que la vista previa de la sesión está conforme.'); $('#btnConfirmSessionPreview')?.focus(); return; }
    const view=target.closest('.view');
    view.classList.add('printing');
    document.body.classList.add('printing-mode');
    const panel=target.closest('.preview-panel'); panel.classList.add('print-target');
    setTimeout(()=>{window.print(); setTimeout(()=>{view.classList.remove('printing');panel.classList.remove('print-target');document.body.classList.remove('printing-mode');},250);},80);
  }

  function scrollToSectionTop(id){
    const root=$(`#${id}`);
    if(!root) return;
    root.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function hydrateForms(){
    $('#schoolName').value=state.meta.schoolName;
    $('#teacherName').value=state.meta.teacherName;
    $('#schoolYear').value=state.meta.year;
    $('#schoolType').value=state.meta.schoolType;
    $('#visionText').value=state.meta.vision||'';
    $('#missionText').value=state.meta.mission||'';
    $$('#gradeChecks input').forEach(c=>c.checked=state.meta.grades.includes(Number(c.value)));
    $('#diagnosisText').value=state.sources.diagnosis.text;
    $('#calendarText').value=state.sources.calendar.text;
    $('#identityText').value=state.sources.identity.text;
    updateSourceStates();
    $('#sourcePeriodType').value=state.programming.periodType;
    $('#annualStart').value=state.programming.start;
    $('#annualEnd').value=state.programming.end;
    $('#periodType').value=state.programming.periodType;
    $('#unitCount').value=state.programming.unitCount;
    $('#annualEvaluation').value=state.programming.evaluation;
    $('#importGrades').value=(state.workflow.importData.grades||[]).join(', ');
    $('#importYear').value=state.workflow.importData.year || state.meta.year;
    $('#importPeriodType').value=state.workflow.importData.periodType || 'Bimestres';
    $('#importSchoolName').value=state.workflow.importData.schoolName || '';
    $('#importTeacherName').value=state.workflow.importData.teacherName || '';
    $('#importSummaryText').value=state.workflow.importData.summary || '';
    renderAnnualAreaSummary();
    updatePeriodUI(false);
    renderWorkflowMode();
  }

  function syncMetaFromForm(){
    state.meta.schoolName=$('#schoolName').value.trim();
    state.meta.teacherName=$('#teacherName').value.trim();
    state.meta.year=Number($('#schoolYear').value)||new Date().getFullYear();
    state.meta.schoolType=$('#schoolType').value;
    state.meta.vision=$('#visionText').value.trim();
    state.meta.mission=$('#missionText').value.trim();
    state.meta.grades=$$('#gradeChecks input:checked').map(c=>Number(c.value));
    state.sources.diagnosis.text=$('#diagnosisText').value;
    state.sources.calendar.text=$('#calendarText').value;
    const identityText=$('#identityText').value.trim();
    state.sources.identity.text=identityText || ['Visión: '+state.meta.vision,'Misión: '+state.meta.mission].filter(line=>!line.endsWith(': ')).join('\n');
  }
  function syncProgrammingBasics(){
    state.programming.start=$('#annualStart')?.value||state.programming.start;
    state.programming.end=$('#annualEnd')?.value||state.programming.end;
    state.programming.periodType=$('#periodType')?.value||$('#sourcePeriodType')?.value||state.programming.periodType;
    state.programming.unitCount=Number($('#unitCount')?.value)||state.programming.unitCount;
    state.programming.evaluation=$('#annualEvaluation')?.value||state.programming.evaluation;
  }

  function bindSourceInputs(){
    $('#sourcePeriodType').addEventListener('change',()=>{state.programming.periodType=$('#sourcePeriodType').value; $('#periodType').value=state.programming.periodType; updatePeriodUI(true);});
    ['modeCreateCard','modeImportCard'].forEach(id=>$('#'+id).addEventListener('click',()=>setWorkflowMode($('#'+id).dataset.mode)));
    $('#btnClearInformation').addEventListener('click',clearProjectInformation);
    [['diagnosisFile','diagnosis','diagnosisText'],['calendarFile','calendar','calendarText'],['identityFile','identity','identityText']].forEach(([inputId,key,textId])=>{
      $(`#${inputId}`).addEventListener('change',async ev=>{
        const file=ev.target.files?.[0]; if(!file)return;
        await loadSourceFile(file,key,textId);
      });
    });
    $$('.drop-zone').forEach(zone=>{
      zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});
      zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
      zone.addEventListener('drop',async e=>{
        e.preventDefault();zone.classList.remove('drag'); const file=e.dataTransfer.files?.[0]; if(!file)return;
        const key=zone.dataset.drop; const textId=key==='diagnosis'?'diagnosisText':key==='calendar'?'calendarText':'identityText';
        await loadSourceFile(file,key,textId);
      });
    });
    $('#btnAnalyzeSources').addEventListener('click',structureSources);
    $('#btnValidateContext').addEventListener('click',()=>{state.context.validated=true;saveState(false);renderContext();toast('Contexto marcado como validado.');});
    $('#btnAddContext').addEventListener('click',()=>openContextModal());
    $('#btnConfirmContext').addEventListener('click',confirmContextItem);
    $$('[data-close-modal]').forEach(b=>b.addEventListener('click',closeContextModal));
    $('#programmingImportFile').addEventListener('change',async ev=>{
      const file=ev.target.files?.[0];
      if(file) await loadImportedProgramming(file);
    });
    $('#btnValidateImport').addEventListener('click',validateImportedProgramming);
    $('#btnLoadImportIntoForm').addEventListener('click',loadImportDataIntoForm);
  }

  function clearProjectInformation(){
    state=createDefaultState();
    ensureConfirmationState();
    ensureWorkflowState();
    currentUnitId='';
    didacticPhases=[];
    instrumentCriteria=[];
    localStorage.removeItem(STORAGE_KEY);
    hydrateForms();
    renderAll();
    showView('fuentes');
    toast('Se limpió el contenido guardado de la generación anterior.');
  }

  async function loadSourceFile(file,key,textId){
    const stateEl=$(`#${key}State`); stateEl.textContent=`Leyendo ${file.name}...`;
    try{
      const text=await extractTextFromFile(file);
      if(!text.trim()) throw new Error('sin texto');
      $(`#${textId}`).value=text.trim(); state.sources[key]={text:text.trim(),fileName:file.name};
      updateSourceStates(); saveState(false); toast(`Fuente cargada: ${file.name}`);
    }catch(e){
      stateEl.textContent=`No se pudo extraer texto de ${file.name}. Puedes pegarlo manualmente.`; stateEl.classList.remove('loaded');
    }
  }
  async function extractTextFromFile(file){
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='txt'||ext==='csv') return await file.text();
    if(ext==='docx'){
      if(!window.mammoth) throw new Error('Mammoth no disponible');
      const buf=await file.arrayBuffer(); const res=await mammoth.extractRawText({arrayBuffer:buf}); return res.value;
    }
    if(ext==='pdf'){
      if(!window.pdfjsLib) throw new Error('PDF.js no disponible');
      const data=new Uint8Array(await file.arrayBuffer()); const pdf=await pdfjsLib.getDocument({data}).promise; let out='';
      for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const content=await page.getTextContent(); out+=content.items.map(x=>x.str).join(' ')+'\n'; }
      return out;
    }
    if(['xlsx','xls'].includes(ext)){
      if(!window.XLSX) throw new Error('SheetJS no disponible');
      const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:'array'}); let out='';
      wb.SheetNames.forEach(name=>{ out+=`\n[${name}]\n`; out+=XLSX.utils.sheet_to_csv(wb.Sheets[name]); }); return out;
    }
    throw new Error('Formato no compatible');
  }
  function updateSourceStates(){
    ['diagnosis','calendar','identity'].forEach(key=>{
      const src=state.sources[key]; const el=$(`#${key}State`);
      if(src.fileName||src.text.trim()){el.classList.add('loaded');el.textContent=src.fileName?`Fuente cargada: ${src.fileName}`:'Texto ingresado manualmente';}
      else {el.classList.remove('loaded');el.textContent='Sin fuente cargada';}
    });
  }

  function detectGradesFromText(text=''){
    const matches=[...text.matchAll(/([1-6])\s*(?:\.°|°|o)?/g)].map(match=>Number(match[1])).filter(n=>n>=1&&n<=6);
    return [...new Set(matches)].sort((a,b)=>a-b);
  }

  function extractImportedUnits(text=''){
    const lines=text.replace(/\r/g,'\n').split(/\n+/).map(line=>line.trim()).filter(Boolean);
    const units=[];
    const unitRegex=/(unidad|experiencia)\s*(?:de aprendizaje)?\s*(\d{1,2}|[ivx]+)?/i;
    lines.forEach((line,index)=>{
      if(unitRegex.test(line)){
        const next=lines[index+1]||'';
        const title=line.replace(unitRegex,'').replace(/^[:\-.\s]+/,'').trim() || next;
        units.push({
          id:`U${String(units.length+1).padStart(2,'0')}`,
          index:units.length+1,
          month:MONTHS[units.length%MONTHS.length],
          days:20,
          title:title || `Unidad ${units.length+1}`,
          event:'',
          events:[],
          problem:'',
          potential:'',
          need:'',
          problems:[],
          potentials:[],
          needs:[],
          context:'',
          situation:next.length>24?next:'Situación significativa pendiente de revisión docente.',
          approaches:[]
        });
      }
    });
    return units.slice(0,12);
  }

  async function loadImportedProgramming(file){
    $('#programmingImportState').textContent=`Leyendo ${file.name}...`;
    try{
      const text=(await extractTextFromFile(file)).trim();
      if(!text) throw new Error('sin texto');
      const grades=detectGradesFromText(text);
      const periodType=/bimestre/i.test(text)?'Bimestres':'Trimestres';
      const units=extractImportedUnits(text);
      const yearMatch=text.match(/20\d{2}/);
      state.workflow.importText=text;
      state.workflow.importValidated=false;
      state.workflow.importData={
        grades:grades.length?grades:[1],
        year:yearMatch?Number(yearMatch[0]):state.meta.year,
        teacherName:state.meta.teacherName,
        schoolName:state.meta.schoolName,
        periodType,
        summary:text.slice(0,1600),
        units
      };
      hydrateForms();
      $('#programmingImportState').textContent=`Programación cargada: ${file.name}`;
      $('#programmingImportState').classList.add('loaded');
      $('#importBadge').textContent='Analizada';
      toast('Programación importada. Revisa la información detectada antes de validarla.');
    }catch(e){
      $('#programmingImportState').textContent='No se pudo extraer la programación. Puedes volver a intentar con otro archivo o seguir por la Ruta A.';
      $('#programmingImportState').classList.remove('loaded');
    }
  }

  function loadImportDataIntoForm(){
    ensureWorkflowState();
    const grades=($('#importGrades').value.match(/[1-6]/g)||[]).map(Number);
    state.programming.periodType=$('#importPeriodType').value;
    state.meta.grades=grades.length?[...new Set(grades)]:state.meta.grades;
    state.meta.year=Number($('#importYear').value)||state.meta.year;
    state.meta.schoolName=$('#importSchoolName').value.trim()||state.meta.schoolName;
    state.meta.teacherName=$('#importTeacherName').value.trim()||state.meta.teacherName;
    hydrateForms();
    renderProgramming();
    toast('Los datos detectados se pasaron al formulario principal.');
  }

  function validateImportedProgramming(){
    const grades=($('#importGrades').value.match(/[1-6]/g)||[]).map(Number);
    state.workflow.importData.grades=grades.length?[...new Set(grades)]:[1];
    state.workflow.importData.year=Number($('#importYear').value)||state.meta.year;
    state.workflow.importData.periodType=$('#importPeriodType').value;
    state.workflow.importData.schoolName=$('#importSchoolName').value.trim();
    state.workflow.importData.teacherName=$('#importTeacherName').value.trim();
    state.workflow.importData.summary=$('#importSummaryText').value.trim();
    state.workflow.importValidated=true;
    state.programming.periodType=state.workflow.importData.periodType;
    state.meta.grades=state.workflow.importData.grades;
    if(state.workflow.importData.schoolName) state.meta.schoolName=state.workflow.importData.schoolName;
    if(state.workflow.importData.teacherName) state.meta.teacherName=state.workflow.importData.teacherName;
    if(state.workflow.importData.year) state.meta.year=state.workflow.importData.year;
    if(state.workflow.importData.units.length){
      state.programming.units=state.workflow.importData.units.map((unit,index)=>({
        ...unit,
        period:Math.min(periodMeta(state.workflow.importData.periodType).count, Number(unit.period)||((index%periodMeta(state.workflow.importData.periodType).count)+1))
      }));
      state.programming.unitCount=state.programming.units.length;
      state.programming.matrix={};
      applyAreaDefaultsToUnits();
    }
    hydrateForms();
    renderProgramming();
    $('#importReviewBadge').textContent='Validada';
    saveState(false);
    toast('Programación importada validada. Ahora puedes generar la programación anual.');
  }

  function splitSourceText(text){
    return text.replace(/\r/g,'\n').split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/).map(s=>s.replace(/^[-•*\s]+/,'').trim()).filter(s=>s.length>12 && s.length<420);
  }
  function uniqueLimited(items,limit=14){
    const seen=new Set(); const out=[];
    items.forEach(x=>{const key=x.toLowerCase().replace(/\s+/g,' ');if(!seen.has(key)){seen.add(key);out.push(x)}});return out.slice(0,limit);
  }
  function structureSources(){
    syncMetaFromForm();
    const diag=splitSourceText(state.sources.diagnosis.text);
    const problemRx=/(problema|dificult|bajo|escaso|riesgo|insegur|machismo|contamina|desliz|interrup|deficien|carencia|pérdida|violencia|incremento|afecta|vulnerab|poco|insuficien)/i;
    const potentialRx=/(potencial|fortaleza|cuenta con|dispone|accesib|comprometid|producción|recursos|oportunidad|riqueza|tradición|cultiva|organiza|participa)/i;
    const needRx=/(necesidad|interés|mejorar|desarrollar|fortalecer|incrementar|hábito|requiere|necesita|comprensión|razonamiento|prevención|aprendizaje)/i;
    state.context.problems=uniqueLimited(diag.filter(x=>problemRx.test(x)));
    state.context.potential=uniqueLimited(diag.filter(x=>potentialRx.test(x) && !problemRx.test(x)));
    state.context.needs=uniqueLimited(diag.filter(x=>needRx.test(x) && !problemRx.test(x)));
    state.context.events=uniqueLimited(parseCalendarLines(state.sources.calendar.text),30);
    state.context.validated=false; saveState(false); renderContext(); toast('Fuentes estructuradas. Revisa y valida antes de generar.');
  }
  function parseCalendarLines(text){
    const lines=text.replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    const likely=lines.filter(l=>/\d{1,2}[\/\-.]\d{1,2}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre|día|semana|aniversario|fiesta|feria|siembra|cosecha/i.test(l));
    return likely.length?likely:lines.filter(l=>l.length>5&&l.length<220);
  }
  function renderContext(){
    const map=[['problems','#contextProblems'],['potential','#contextPotential'],['needs','#contextNeeds'],['events','#contextEvents']];
    map.forEach(([key,sel])=>{
      const root=$(sel); const arr=state.context[key]; root.innerHTML=arr.length?arr.map((v,i)=>`<div class="token"><span>${esc(v)}</span><button data-remove-context="${key}" data-index="${i}" title="Quitar">×</button></div>`).join(''):`<div class="empty-state"><strong>Sin elementos</strong><span>Agrega o extrae información de las fuentes.</span></div>`;
    });
    $$('[data-remove-context]').forEach(b=>b.addEventListener('click',()=>{state.context[b.dataset.removeContext].splice(Number(b.dataset.index),1);state.context.validated=false;saveState(false);renderContext()}));
    const badge=$('#structuredContextPanel .badge'); badge.textContent=state.context.validated?'Validado':'Borrador';badge.className=`badge ${state.context.validated?'valid':'draft'}`;
    updateMetrics();
  }
  function openContextModal(){ $('#contextValue').value=''; $('#contextModal').classList.add('open'); $('#contextModal').setAttribute('aria-hidden','false'); }
  function closeContextModal(){ $('#contextModal').classList.remove('open'); $('#contextModal').setAttribute('aria-hidden','true'); }
  function confirmContextItem(){ const key=$('#contextType').value; const value=$('#contextValue').value.trim(); if(!value)return; state.context[key].push(value);state.context.validated=false;saveState(false);renderContext();closeContextModal(); }

  function bindProgramming(){
    $('#btnBuildUnits').addEventListener('click',buildUnitsFromContext);
    $('#btnGenerateAnnual').addEventListener('click',generateAnnualProgramming);
    $('#periodType').addEventListener('change',()=>{syncProgrammingBasics();$('#sourcePeriodType').value=state.programming.periodType;updatePeriodUI(true);toast(`Organización actualizada a ${periodMeta().count} ${periodMeta().plural}.`);});
    $('#unitCount').addEventListener('change',()=>{syncProgrammingBasics();updatePeriodUI(false);});
    $$('.tab').forEach(tab=>tab.addEventListener('click',()=>{
      $$('.tab').forEach(t=>t.classList.toggle('active',t===tab));
      $$('.prog-tab').forEach(p=>p.classList.toggle('active',p.id===`prog-${tab.dataset.progtab}`));
    }));
    $('#btnAddValue').addEventListener('click',()=>{state.programming.values.push({id:uid('val'),value:'',attitudes:''});saveState(false);renderValues()});
  }


  function normalizeText(value=''){return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function keywordsFromText(value=''){
    const stop=new Set(['para','como','desde','este','esta','estos','estas','sobre','entre','donde','cuando','porque','tambien','cada','ante','mediante','hacia','durante','nuestra','nuestro','sus','las','los','del','una','uno','unos','unas','que','con','por','sin','mas']);
    return normalizeText(value).replace(/[^a-z0-9ñ\s]/g,' ').split(/\s+/).filter(w=>w.length>4&&!stop.has(w));
  }
  function selectRelevantContext(items,seed,limit=2,fallbackIndex=0){
    if(!items?.length)return[]; const keys=new Set(keywordsFromText(seed));
    const scored=items.map((item,index)=>{const words=keywordsFromText(item);let score=0;words.forEach(w=>{if(keys.has(w))score+=2;else if([...keys].some(k=>k.includes(w)||w.includes(k)))score+=1});return{item,index,score}}).sort((a,b)=>b.score-a.score||a.index-b.index);
    const best=scored.filter(x=>x.score>0).slice(0,limit).map(x=>x.item); if(best.length)return best;
    return[items[fallbackIndex%items.length]].filter(Boolean);
  }
  function makeUnitTitle(event,problem,need,month){
    const t=normalizeText([event,problem,need].filter(Boolean).join(' '));
    if(/agua|lluvia|quebrada|desliz|desastre|riesgo/.test(t))return'Nos organizamos y actuamos con seguridad para cuidar nuestra vida y entorno';
    if(/tierra|ambiente|residuo|recicl|contamina|limpieza/.test(t))return'Cuidamos el ambiente y asumimos acciones responsables en nuestra comunidad';
    if(/madre|mujer|familia|genero/.test(t))return'Valoramos a nuestra familia y promovemos relaciones de respeto e igualdad';
    if(/campes|agric|ganad|cultiv|siembra|cosecha/.test(t))return'Valoramos el trabajo, los saberes y la producción de nuestra comunidad';
    if(/patria|independ|bandera|junin|ayacucho|historia|identidad/.test(t))return'Conocemos nuestra historia y fortalecemos nuestra identidad';
    if(/alimenta|producto|nutri|salud|comida/.test(t))return'Valoramos los productos de nuestra comunidad para vivir saludablemente';
    if(/derecho|deber|conviv|democr|responsab/.test(t))return'Ejercemos nuestros derechos y responsabilidades para convivir mejor';
    if(/feria|festiv|cautivo|turis|cultura|folclor/.test(t))return'Valoramos nuestras manifestaciones culturales y cuidamos los espacios que compartimos';
    if(/reforest|flora|fauna|biodivers|arbol|vegetal|animal/.test(t))return'Protegemos los recursos naturales y la biodiversidad de nuestra comunidad';
    if(/logro|clausura|navidad|cierre/.test(t))return'Compartimos nuestros aprendizajes y celebramos los logros alcanzados';
    const ev=event?cleanEventLabel(event):'';return ev?`Aprendemos desde ${ev}`:`Construimos aprendizajes a partir de nuestro contexto durante ${month}`;
  }
  function suggestApproaches(theme){
    const t=normalizeText(theme),out=[];const add=a=>{if(CURR.crosscuttingApproaches.includes(a)&&!out.includes(a))out.push(a)};
    if(/ambiente|agua|tierra|residuo|recicl|flora|fauna|biodivers|agric|siembra|cosecha/.test(t))add('Enfoque Ambiental');
    if(/derecho|deber|conviv|democr|particip|seguridad|igualdad/.test(t))add('Enfoque de Derechos');
    if(/mujer|madre|genero|equidad/.test(t))add('Enfoque de Igualdad de género');
    if(/cultura|folclor|tradicion|identidad|comunidad|campes|saberes/.test(t))add('Enfoque Intercultural');
    if(/divers|inclusion|discap/.test(t))add('Enfoque Inclusivo o de Atención a la diversidad');
    if(/logro|mejora|reto|aprendiz/.test(t))add('Enfoque de Búsqueda de la excelencia');
    add('Enfoque de Orientación al bien común');return out.slice(0,3);
  }
  function suggestCompetencies(theme,index){
    const t=normalizeText(theme),ids=new Set(['com_oral','com_lee','com_escribe','mat_cantidad','tic_entornos','auto_aprendizaje']);
    const mathRotation=['mat_regularidad','mat_forma','mat_datos'];ids.add(mathRotation[index%mathRotation.length]);
    if(/conviv|derecho|deber|democr|igualdad|familia|norma|responsab/.test(t)){ids.add('ps_identidad');ids.add('ps_convive')}
    if(/historia|patria|independ|bandera|junin|ayacucho|aniversario/.test(t))ids.add('ps_historia');
    if(/ambiente|agua|tierra|riesgo|desastre|reforest|flora|fauna|biodivers|territorio/.test(t)){ids.add('ps_espacio');ids.add('cyt_indaga');ids.add('cyt_explica')}
    if(/producto|comerc|ahorro|econom|agric|ganad|feria/.test(t))ids.add('ps_recursos');
    if(/alimenta|nutri|salud|producto|agric|ganad/.test(t)){ids.add('cyt_explica');ids.add('ef_salud')}
    if(/investig|problema|fenomen|ciencia|ambiente/.test(t))ids.add('cyt_indaga');
    if(/solucion|recicl|constru|tecnolog/.test(t))ids.add('cyt_disena');
    if(/arte|cultura|folclor|danza|musica|festiv|identidad|madre|familia/.test(t)){ids.add('arte_aprecia');ids.add('arte_crea')}
    if(/relig|semana santa|dios|navidad|santo|virgen/.test(t)){ids.add('rel_identidad');ids.add('rel_encuentro')}
    if(/deporte|fisica|salud|juego/.test(t)){ids.add('ef_motricidad');ids.add('ef_salud');ids.add('ef_sociomotriz')}
     return[...ids].filter(id=>competenceIndex[id]);
   }
  function suggestUnitArea(theme,index){
    const suggested=suggestCompetencies(theme,index).map(id=>competenceIndex[id]?.areaId).filter(Boolean);
    return suggested[0] || planningAreas[index % planningAreas.length]?.id || planningAreas[0]?.id || '';
  }
  function suggestAreaCompetencies(theme,index,areaId){
    const area=areaIndex[areaId] || null;
    const suggested=suggestCompetencies(theme,index).filter(id=>competenceIndex[id]?.areaId===area?.id);
    if(suggested.length) return suggested;
    return area?.competencies?.slice(0,Math.min(2,area.competencies.length)).map(comp=>comp.id) || [];
  }
  function applyAreaDefaultsToUnits(){
    (state.programming.units||[]).forEach((unit,index)=>{
      unit.areaId ||= suggestUnitArea([unit.event,unit.problem,unit.potential,unit.need,unit.context,unit.situation,unit.title].filter(Boolean).join(' '),index);
      const theme=[unit.event,unit.problem,unit.potential,unit.need,unit.context,unit.situation,unit.title].filter(Boolean).join(' ');
      state.programming.matrix[unit.id]=suggestAreaCompetencies(theme,index,unit.areaId);
    });
    Object.keys(state.unitsData||{}).forEach(unitId=>{
      const allowed=new Set(state.programming.matrix[unitId]||[]);
      const purposes=state.unitsData[unitId]?.purposes || {};
      Object.keys(purposes).forEach(compId=>{ if(!allowed.has(compId)) delete purposes[compId]; });
    });
  }
  function gradeLines(grades=state.meta.grades){const g=[...grades].sort((a,b)=>a-b).map(x=>`${x}.°`);if(g.length<=3)return[g.join(' – ')];const split=Math.ceil(g.length/2);return[g.slice(0,split).join(' – '),g.slice(split).join(' – ')];}
  function gradeDisplayHtml(grades=state.meta.grades,center=false){return `<span class="grade-display${center?' center':''}">${gradeLines(grades).map(line=>`<span class="grade-line">${esc(line)}</span>`).join('')}</span>`;}
  function relevantListHtml(items){if(!items?.length)return'<span class="doc-small">Sin información específica validada.</span>';return `<ul class="source-list">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}
  function approachActionText(approach){
    const map={'Enfoque Ambiental':'Promueve acciones responsables para el cuidado del ambiente y el uso sostenible de los recursos.','Enfoque de Derechos':'Participa respetando derechos, responsabilidades, acuerdos y normas de convivencia.','Enfoque de Igualdad de género':'Participa y asume responsabilidades sin establecer diferencias por género.','Enfoque Intercultural':'Valora los saberes, costumbres y manifestaciones culturales propias y de otros grupos.','Enfoque Inclusivo o de Atención a la diversidad':'Respeta diferencias, ritmos y formas de aprender, brindando apoyo cuando es necesario.','Enfoque de Búsqueda de la excelencia':'Se esfuerza por mejorar sus aprendizajes a partir de la reflexión y la retroalimentación.','Enfoque de Orientación al bien común':'Colabora y toma decisiones considerando el bienestar de todas las personas.'};return map[approach]||'Actitud observable pendiente de contextualizar.';
  }
  function prepareAnnualDraft(){
    if(!state.programming.units.length)buildUnitsFromContext(false);
    assignPeriodsToUnits(false);
    state.programming.units.forEach((u,i)=>{const theme=[u.event,u.problem,u.potential,u.need,u.context,u.situation,u.title].filter(Boolean).join(' ');u.areaId ||= suggestUnitArea(theme,i);if(!u.title||/^Unidad \d+|aprendizaje contextualizado|Aprendemos a partir de/i.test(u.title))u.title=makeUnitTitle(u.event,u.problem,u.need,u.month);if(!u.approaches?.length)u.approaches=suggestApproaches(theme);if(!u.situation||/pendiente de construir/i.test(u.situation))u.situation=makeSituation(u.problem,u.event,u.need,u.month,u.potential);if(!(state.programming.matrix[u.id]||[]).length)state.programming.matrix[u.id]=suggestAreaCompetencies(theme,i,u.areaId)});saveState(false);renderProgramming();
  }

  function buildUnitsFromContext(showToast=true){
    if(state.workflow.mode==='import' && state.workflow.importValidated && state.workflow.importData.units.length){
      state.programming.units=state.workflow.importData.units.map((unit,index)=>({
        ...unit,
        areaId:unit.areaId || suggestUnitArea([unit.title,unit.situation].join(' '),index),
        period:Math.min(periodMeta().count, Number(unit.period)||((index%periodMeta().count)+1))
      }));
      state.programming.unitCount=state.programming.units.length;
      applyAreaDefaultsToUnits();
      assignPeriodsToUnits(false);
      saveState(false);
      renderProgramming();
      refreshUnitSelectors();
      refreshSessionSelectors();
      if(showToast) toast('Se cargaron las unidades de la programación importada.');
      return;
    }
    syncMetaFromForm();syncProgrammingBasics();if(!state.context.validated&&(state.context.problems.length||state.context.needs.length||state.context.events.length)&&showToast)toast('El contexto aún está en borrador; las unidades se crearán como borradores editables.');
    const count=Math.max(1,Math.min(12,state.programming.unitCount||10)),start=new Date(`${state.programming.start}T12:00:00`),end=new Date(`${state.programming.end}T12:00:00`),monthNums=[];let d=new Date(start.getFullYear(),start.getMonth(),1);while(d<=end&&monthNums.length<12){monthNums.push(d.getMonth());d=new Date(d.getFullYear(),d.getMonth()+1,1)}while(monthNums.length<count)monthNums.push((monthNums[monthNums.length-1]+1)%12);
    const eventsByMonth={};state.context.events.forEach(evt=>{const m=detectMonth(evt);if(m!==null){eventsByMonth[m]??=[];eventsByMonth[m].push(evt)}});const old=Object.fromEntries(state.programming.units.map(u=>[u.id,u])),units=[];
    for(let i=0;i<count;i++){const m=monthNums[i%monthNums.length],id=`U${String(i+1).padStart(2,'0')}`,monthEvents=(eventsByMonth[m]||[]).slice(0,6),event=old[id]?.event||monthEvents.join(' · '),seed=[event,MONTHS[m]].filter(Boolean).join(' '),problems=selectRelevantContext(state.context.problems,seed,2,i),potentials=selectRelevantContext(state.context.potential,seed,2,i),needs=selectRelevantContext(state.context.needs,[seed,...problems].join(' '),2,i),problem=old[id]?.problem||problems[0]||'',potential=old[id]?.potential||potentials[0]||'',need=old[id]?.need||needs[0]||'',title=old[id]?.title||makeUnitTitle(event,problem,need,MONTHS[m]),situation=old[id]?.situation||makeSituation(problem,event,need,MONTHS[m],potential),days=old[id]?.days||countWeekdaysInMonth(start.getFullYear(),m,start,end),theme=[event,problem,potential,need,title].join(' ');
      const areaId=old[id]?.areaId || suggestUnitArea(theme,i);
      units.push({id,index:i+1,areaId,month:MONTHS[m],days,title,event,events:old[id]?.events||monthEvents,problem,potential,need,problems:old[id]?.problems||problems,potentials:old[id]?.potentials||potentials,needs:old[id]?.needs||needs,context:old[id]?.context||[problem,potential,need].filter(Boolean).join(' | '),situation,approaches:old[id]?.approaches?.length?old[id].approaches:suggestApproaches(theme)});if(!state.programming.matrix[id]?.length)state.programming.matrix[id]=suggestAreaCompetencies(theme,i,areaId)}
    state.programming.units=units;assignPeriodsToUnits(true);saveState(false);renderProgramming();refreshUnitSelectors();refreshSessionSelectors();if(showToast)toast(`${units.length} unidades base creadas y distribuidas en ${periodMeta().count} ${periodMeta().plural}.`);
  }
  function detectMonth(text){
    const lower=text.toLowerCase(); const names=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','septiembre','octubre','noviembre','diciembre'];
    for(let i=0;i<names.length;i++){if(lower.includes(names[i])) return i===9?8:i>9?i-1:i;}
    const m=text.match(/(?:^|\D)(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.]\d{2,4})?/);
    if(m){const month=Number(m[2]);if(month>=1&&month<=12)return month-1}
    return null;
  }
  function cleanEventLabel(evt){
    return evt.replace(/^\s*[-•]?\s*\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\s*[-:–]?\s*/,'').replace(/^\s*[-•]\s*/,'').trim().replace(/[.]$/,'').toLowerCase();
  }
  function makeSituation(problem,event,need,month,potential=''){
    const parts=[];
    if(problem)parts.push(`En el diagnóstico institucional se reconoce que ${problem.charAt(0).toLowerCase()+problem.slice(1)}`);
    if(event)parts.push(`Durante ${month}, el calendario comunal considera ${event.charAt(0).toLowerCase()+event.slice(1)}`);
    if(potential)parts.push(`Como potencialidad del contexto se cuenta con ${potential.charAt(0).toLowerCase()+potential.slice(1)}`);
    if(need)parts.push(`Asimismo, se ha identificado la necesidad o interés de ${need.charAt(0).toLowerCase()+need.slice(1)}`);
    if(!parts.length)return 'Situación significativa pendiente de construir a partir del diagnóstico, calendario comunal y necesidades validadas.';
    return `${parts.join(' ')} Frente a esta realidad, se propone que los estudiantes analicen la situación, movilicen aprendizajes de las áreas seleccionadas y planteen acciones o producciones pertinentes a su contexto. El reto específico y el producto final deben ser revisados y validados por el docente antes de aprobar la unidad.`;
  }
  function countWeekdaysInMonth(year,month,start,end){
    let count=0; const first=new Date(year,month,1,12); const last=new Date(year,month+1,0,12); const a=first<start?start:first; const b=last>end?end:last;
    for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)){const day=d.getDay();if(day!==0&&day!==6)count++} return count;
  }

  function renderAlertPanel(selector,{status='ok',title='',subtitle='',items=[]}={}){
    const el=$(selector);
    if(!el) return;
    if(!title && !items.length){ el.className='alert-panel'; el.innerHTML=''; return; }
    el.className=`alert-panel show ${status}`;
    el.innerHTML=`<div class="alert-panel-head"><div><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div><span class="badge ${status==='ok'?'valid':status==='warn'?'draft':'required'}">${status==='ok'?'Listo':status==='warn'?'Atención':'Faltan datos'}</span></div>${items.length?`<ul class="alert-panel-list">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}`;
  }

  function renderAnnualAreaSummary(){
    const root=$('#annualAreaSummary');
    if(!root) return;
    const compCount=planningAreas.reduce((acc,area)=>acc+(area.competencies?.length||0),0);
    const capCount=planningAreas.reduce((acc,area)=>acc+(area.competencies||[]).reduce((sum,comp)=>sum+(comp.capacities?.length||0),0),0);
    const grades=state.meta.grades.map(grade=>`${grade}.°`).join(' · ');
    const cycles=cyclesFromGrades().join(' · ');
    root.innerHTML=`<strong>Programación anual multiarea</strong><span>Grados: ${esc(grades || 'Pendiente')} · Ciclo(s): ${esc(cycles || 'Pendiente')}. La programación integra ${compCount} competencia(s) y ${capCount} capacidad(es) de las áreas curriculares cargadas.</span>`;
  }

  function updatePreviewStatus(el,status,message){
    if(!el) return;
    el.textContent=message;
    el.className=`preview-status${status==='confirmed'?' confirmed':status==='blocked'?' blocked':''}`;
  }

  function validateAnnualData(){
    const errors=[], warnings=[];
    if(!state.meta.schoolName) errors.push('Completa la institución educativa.');
    if(!state.meta.teacherName) errors.push('Completa el nombre del docente responsable.');
    if(!state.meta.grades.length) errors.push('Selecciona al menos un grado atendido.');
    if(state.workflow.mode==='import'){
      if(!state.workflow.importValidated) errors.push('Valida primero la programación importada.');
    }else{
      if(!state.sources.diagnosis.text.trim()) errors.push('Agrega el diagnóstico del contexto estudiantil.');
      if(!state.sources.calendar.text.trim()) errors.push('Agrega el calendario comunal.');
      if(!(state.meta.vision.trim() && state.meta.mission.trim()) && !state.sources.identity.text.trim()) errors.push('Agrega la visión y misión institucional.');
      if(!state.context.validated) warnings.push('Todavía falta confirmar la información estructurada del contexto.');
    }
    if(!state.programming.units.length) warnings.push('Aún no se han preparado las unidades base.');
    if(state.programming.units.some(u=>!String(u.title||'').trim())) warnings.push('Hay unidades sin título tentativo.');
    if(state.programming.units.some(u=>!Number(u.days))) warnings.push('Hay unidades sin duración en días.');
    if(state.programming.units.some(u=>!u.areaId)) warnings.push('Hay unidades sin área curricular asignada.');
    if(state.programming.units.some(u=>!(state.programming.matrix[u.id]||[]).length)) warnings.push('Hay unidades sin competencias seleccionadas.');
    if(!state.programming.values.length) warnings.push('La matriz de valores está vacía.');
    return { errors, warnings };
  }

  function validateUnitData(id=currentUnitId){
    const errors=[], warnings=[];
    if(!id){ errors.push('Selecciona una unidad de la programación.'); return { errors, warnings }; }
    const ud=ensureUnitData(id);
    const area=getUnitArea(id);
    const compIds=state.programming.matrix[id]||[];
    if(!area) errors.push('Selecciona el área curricular de la unidad.');
    if(!ud.situation.trim()) errors.push('Completa la situación significativa de la unidad.');
    if(!ud.product.trim()) warnings.push('Falta definir el producto general de la unidad.');
    if(!ud.approaches.length) warnings.push('Selecciona al menos un enfoque transversal.');
    if(!compIds.length) errors.push('La unidad no tiene competencias heredadas desde la programación.');
    compIds.forEach(cid=>{
      const comp=competenceIndex[cid];
      const purpose=ud.purposes[cid]||{purpose:'',criteria:{III:'',IV:'',V:''},evidence:''};
      if(!purpose.purpose.trim()) warnings.push(`Falta el propósito para ${comp.name}.`);
      if(!Object.values(purpose.criteria||{}).some(Boolean)) warnings.push(`Falta al menos un criterio para ${comp.name}.`);
      if(!purpose.evidence.trim()) warnings.push(`Falta la evidencia para ${comp.name}.`);
    });
    if(!ud.sessions.length) warnings.push('Aún no se han planificado sesiones para esta unidad.');
    if(!ud.evaluation.trim()) warnings.push('Falta completar la evaluación de la unidad.');
    if(!ud.resources.trim()) warnings.push('Faltan recursos o materiales de apoyo.');
    if(!ud.bibliography.trim()) warnings.push('Falta revisar la bibliografía.');
    return { errors, warnings };
  }

  function validateSessionData(data=collectSessionData()){
    const errors=[], warnings=[];
    if(!data.unitId) errors.push('Selecciona la unidad de procedencia.');
    if(data.unitId && !isUnitConfirmed(data.unitId)) errors.push('La unidad de procedencia debe estar validada.');
    if(!data.compId) errors.push('Selecciona la competencia de la sesión.');
    if(!data.title.trim()) errors.push('Completa el título de la sesión.');
    if(!data.purpose.trim()) warnings.push('Falta precisar el propósito de aprendizaje.');
    if(!Object.values(data.criteria||{}).some(Boolean)) warnings.push('Falta al menos un criterio de evaluación.');
    if(!data.evidence.trim()) warnings.push('Falta la evidencia de aprendizaje.');
    if(!data.approach) warnings.push('Selecciona un enfoque transversal.');
    if(!data.attitude.trim()) warnings.push('Precisa la acción o actitud observable.');
    if(!data.didactic.length) warnings.push('Resta revisar la secuencia didáctica.');
    if(data.didactic.some(phase=>!phase.activities.trim())) warnings.push('Hay fases didácticas sin actividades descritas.');
    if(!data.instrumentCriteria.some(text=>String(text||'').trim())) warnings.push('Agrega al menos un criterio al instrumento de evaluación.');
    return { errors, warnings };
  }

  function renderAnnualAlert(){
    const validation=validateAnnualData();
    if(validation.errors.length){
      renderAlertPanel('#programmingAlert',{status:'error',title:'La programación aún no está lista para generar documento.',subtitle:'Completa primero los datos obligatorios.',items:validation.errors.concat(validation.warnings)});
      return;
    }
    if(validation.warnings.length){
      renderAlertPanel('#programmingAlert',{status:'warn',title:'La programación puede mostrarse en vista previa, pero conviene revisar estos puntos.',subtitle:'La plataforma te avisa antes de generar el documento final.',items:validation.warnings});
      return;
    }
    renderAlertPanel('#programmingAlert',{status:'ok',title:'La programación está completa para revisar la vista previa.',subtitle:'Confirma el contenido desde la vista previa antes de imprimir o exportar.',items:['La estructura base, las unidades y la distribución curricular ya tienen información suficiente.']});
  }

  function renderUnitAlert(){
    const validation=validateUnitData();
    if(validation.errors.length){
      renderAlertPanel('#unitAlert',{status:'error',title:'La unidad aún requiere datos clave.',subtitle:'Primero completa lo imprescindible para una vista previa confiable.',items:validation.errors.concat(validation.warnings)});
      return;
    }
    if(validation.warnings.length){
      renderAlertPanel('#unitAlert',{status:'warn',title:'La unidad ya puede revisarse, pero faltan precisiones importantes.',subtitle:'Revisa estos campos antes de confirmar la vista previa.',items:validation.warnings});
      return;
    }
    renderAlertPanel('#unitAlert',{status:'ok',title:'La unidad está lista para confirmar su vista previa.',subtitle:'Cuando quedes conforme, confirma el contenido y recién después imprime.',items:['La trazabilidad con la programación anual está completa.']});
  }

  function renderSessionAlert(){
    const validation=validateSessionData();
    if(validation.errors.length){
      renderAlertPanel('#sessionAlert',{status:'error',title:'La sesión aún no está lista para generar documento.',subtitle:'Falta completar datos esenciales del aprendizaje esperado.',items:validation.errors.concat(validation.warnings)});
      return;
    }
    if(validation.warnings.length){
      renderAlertPanel('#sessionAlert',{status:'warn',title:'La sesión puede verse en borrador, pero falta afinar algunos datos.',subtitle:'Completa o corrige lo necesario antes de confirmar.',items:validation.warnings});
      return;
    }
    renderAlertPanel('#sessionAlert',{status:'ok',title:'La sesión está lista para confirmarse desde la vista previa.',subtitle:'La impresión solo se habilita después de esa conformidad.',items:['Propósito, criterios, evidencia y secuencia didáctica ya están consistentes.']});
  }

  function renderAnnualPreviewStatus(){
    const hasPreview=!!$('#annualPreview')?.innerHTML.trim() && !$('#annualPreviewPanel')?.classList.contains('preview-hidden');
    if(!hasPreview){ updatePreviewStatus($('#annualPreviewStatus'),'blocked','Genera la vista previa'); return; }
    updatePreviewStatus($('#annualPreviewStatus'),isAnnualConfirmed()?'confirmed':'pending',isAnnualConfirmed()?'Contenido confirmado':'Pendiente de confirmar');
    $('#btnConfirmAnnualPreview').disabled=!hasPreview;
    $('#btnDownloadUnits').disabled=!isAnnualConfirmed();
    $('#btnDownloadSessions').disabled=!isAnnualConfirmed();
  }

  function renderUnitPreviewStatus(id=currentUnitId){
    const hasPreview=!!$('#unitPreview')?.innerHTML.trim();
    if(!hasPreview){ updatePreviewStatus($('#unitPreviewStatus'),'blocked','Genera la vista previa'); return; }
    updatePreviewStatus($('#unitPreviewStatus'),isUnitConfirmed(id)?'confirmed':'pending',isUnitConfirmed(id)?'Contenido confirmado':'Pendiente de confirmar');
    $('#btnConfirmUnitPreview').disabled=!hasPreview;
  }

  function renderSessionPreviewStatus(){
    const hasPreview=!!$('#sessionPreview')?.innerHTML.trim();
    if(!hasPreview){ updatePreviewStatus($('#sessionPreviewStatus'),'blocked','Genera la vista previa'); return; }
    updatePreviewStatus($('#sessionPreviewStatus'),isSessionConfirmed()?'confirmed':'pending',isSessionConfirmed()?'Contenido confirmado':'Pendiente de confirmar');
    $('#btnConfirmSessionPreview').disabled=!hasPreview;
  }

  function confirmAnnualPreview(){
    const validation=validateAnnualData();
    if(validation.errors.length){ toast('Corrige primero los datos faltantes de la programación.'); renderAnnualAlert(); return; }
    ensureConfirmationState();
    state.confirmations.annual={ confirmed:true };
    saveState(false);
    renderAnnualPreviewStatus();
    toast('Programación confirmada. Ya puedes imprimir o exportar en PDF.');
  }

  function confirmUnitPreview(){
    const validation=validateUnitData();
    if(validation.errors.length){ toast('Corrige primero los datos faltantes de la unidad.'); renderUnitAlert(); return; }
    if(!currentUnitId) return;
    ensureConfirmationState();
    state.confirmations.units[currentUnitId]={ confirmed:true };
    saveState(false);
    renderUnitPreviewStatus(currentUnitId);
    toast('Unidad confirmada. Ya puedes imprimir o exportar en PDF.');
  }

  function confirmSessionPreview(){
    const validation=validateSessionData();
    if(validation.errors.length){ toast('Corrige primero los datos faltantes de la sesión.'); renderSessionAlert(); return; }
    ensureConfirmationState();
    state.confirmations.sessionDraft={ confirmed:true };
    saveState(false);
    renderSessionPreviewStatus();
    toast('Sesión confirmada. Ya puedes imprimir o exportar en PDF.');
  }

  function renderProgramming(){ renderAnnualAreaSummary(); renderUnitsEditor(); renderCurriculumMatrix(); renderStudyPlan(); renderValues(); renderAnnualAlert(); renderAnnualPreviewStatus(); }
  function renderUnitsEditor(){
    const root=$('#unitsEditor');
    if(!state.programming.units.length){root.innerHTML='<div class="empty-state"><strong>Aún no hay unidades</strong><span>Confirma la información base y pulsa “Actualizar unidades” o directamente “Generar Programación”.</span></div>';return;}
    assignPeriodsToUnits(false);
    root.innerHTML=state.programming.units.map(u=>`<div class="unit-row" data-unit-row="${u.id}">
      <div class="unit-n">${u.id}</div>
      <div class="unit-period">${esc(periodLabel(Number(u.period)||1))}</div>
      <select data-field="areaId">${planningAreas.map(area=>`<option value="${area.id}" ${area.id===u.areaId?'selected':''}>${esc(area.name)}</option>`).join('')}</select>
      <select data-field="month">${MONTHS.map(m=>`<option ${m===u.month?'selected':''}>${m}</option>`).join('')}</select>
      <input data-field="days" type="number" min="1" max="31" value="${u.days||''}" title="Días efectivos">
      <input data-field="title" type="text" value="${esc(u.title)}" placeholder="Título tentativo de la unidad">
      <input class="unit-context" data-field="event" type="text" value="${esc(u.event||'')}" placeholder="Acontecimiento / contexto principal">
      <button class="mini-delete" data-delete-unit="${u.id}" title="Eliminar unidad">×</button>
    </div>`).join('');
    $$('[data-unit-row]').forEach(row=>{
      $$('[data-field]',row).forEach(el=>el.addEventListener('change',()=>{const u=state.programming.units.find(x=>x.id===row.dataset.unitRow);u[el.dataset.field]=el.dataset.field==='days'?Number(el.value):el.value;if(el.dataset.field==='areaId'){state.programming.matrix[u.id]=suggestAreaCompetencies([u.event,u.problem,u.potential,u.need,u.context,u.situation,u.title].filter(Boolean).join(' '),u.index||0,u.areaId);}autoSave();renderCurriculumMatrix();refreshUnitSelectors();refreshSessionSelectors();}));
    });
    $$('[data-delete-unit]').forEach(b=>b.addEventListener('click',()=>{if(state.programming.units.length<=periodMeta().count){toast(`Se requiere al menos una unidad por cada ${periodMeta().singular}.`);return;}const id=b.dataset.deleteUnit;state.programming.units=state.programming.units.filter(u=>u.id!==id);delete state.programming.matrix[id];delete state.unitsData[id];state.programming.unitCount=state.programming.units.length;$('#unitCount').value=state.programming.unitCount;assignPeriodsToUnits(true);saveState(false);renderProgramming();refreshUnitSelectors();}));
  }
  function renderCurriculumMatrix(){
    const root=$('#curriculumMatrix'); const units=state.programming.units;
    if(!units.length){root.innerHTML='<div class="empty-state"><strong>Primero crea las unidades</strong></div>';return;}
    let html=`<div class="simple-help"><b>Matriz multiarea:</b> cada unidad solo habilita las competencias del área que tiene asignada. Si cambias el área de una unidad, su selección curricular se reajusta.</div><table class="curriculum-table"><thead><tr><th>Área</th><th>Competencia y capacidades clave</th>${units.map(u=>`<th title="${esc(u.title)}">${u.id}<br>${esc(areaIndex[u.areaId]?.name||'Sin área')}</th>`).join('')}</tr></thead><tbody>`;
    planningAreas.forEach(area=>area.competencies.forEach((comp,idx)=>{
      html+=`<tr>${idx===0?`<td class="area-cell" rowspan="${area.competencies.length}">${esc(area.name)}</td>`:''}<td class="comp-cell"><strong>${esc(comp.name)}</strong><br><span class="doc-small">${esc((comp.capacities||[]).slice(0,3).join(' · '))}</span></td>`;
      units.forEach(u=>{const checked=(state.programming.matrix[u.id]||[]).includes(comp.id);const enabled=u.areaId===area.id;html+=`<td class="matrix-check"><input type="checkbox" data-matrix-unit="${u.id}" data-matrix-comp="${comp.id}" ${checked?'checked':''} ${enabled?'':'disabled'}></td>`});
      html+='</tr>';
    }));
    html+='</tbody></table>'; root.innerHTML=html;
    $$('[data-matrix-unit]').forEach(c=>c.addEventListener('change',()=>{
      const arr=state.programming.matrix[c.dataset.matrixUnit]??=[]; const id=c.dataset.matrixComp;
      if(c.checked&&!arr.includes(id))arr.push(id); if(!c.checked)state.programming.matrix[c.dataset.matrixUnit]=arr.filter(x=>x!==id); else state.programming.matrix[c.dataset.matrixUnit]=arr;
      ensureUnitData(c.dataset.matrixUnit); saveState(false); refreshUnitSelectors();
    }));
  }
  function renderStudyPlan(){
    const root=$('#studyPlanEditor');
    const rows=state.programming.studyPlan.map((r,i)=>({row:r,index:i}));
    root.innerHTML=`<div class="simple-help"><b>Plan de estudios completo:</b> la programación anual de Primaria integra todas las áreas curriculares.</div><div class="study-row study-head"><strong>Área</strong><span>III</span><span>IV</span><span>V</span></div>`+rows.map(({row,index})=>`<div class="study-row" data-study="${index}"><strong>${esc(row.name)}</strong><input data-cycle="III" type="number" min="0" max="15" value="${row.III}"><input data-cycle="IV" type="number" min="0" max="15" value="${row.IV}"><input data-cycle="V" type="number" min="0" max="15" value="${row.V}"></div>`).join('');
    $$('[data-study]').forEach(row=>$$('input',row).forEach(inp=>inp.addEventListener('change',()=>{state.programming.studyPlan[Number(row.dataset.study)][inp.dataset.cycle]=Number(inp.value)||0;saveState(false)})));
  }
  function renderValues(){
    const root=$('#valuesEditor'); root.innerHTML=state.programming.values.map((v,i)=>`<div class="value-row" data-value-row="${i}"><input data-vfield="value" value="${esc(v.value)}" placeholder="Valor"><textarea data-vfield="attitudes" placeholder="Actitudes observables">${esc(v.attitudes)}</textarea><button class="mini-delete" data-remove-value="${i}">×</button></div>`).join('');
    $$('[data-value-row]').forEach(row=>$$('[data-vfield]',row).forEach(el=>el.addEventListener('change',()=>{state.programming.values[Number(row.dataset.valueRow)][el.dataset.vfield]=el.value;saveState(false)})));
    $$('[data-remove-value]').forEach(b=>b.addEventListener('click',()=>{state.programming.values.splice(Number(b.dataset.removeValue),1);saveState(false);renderValues()}));
  }


  function generateAnnualProgramming(){
    syncMetaFromForm(); syncProgrammingBasics();
    const validation=validateAnnualData();
    if(validation.errors.length){
      toast(`Falta completar: ${validation.errors.map(x=>x.replace(/\.$/,'').toLowerCase()).join(', ')}.`);
      showView(validation.errors.some(x=>/diagnóstico|calendario|visión y misión/i.test(x))?'fuentes':'inicio');
      renderAnnualAlert();
      return;
    }
    if(state.workflow.mode!=='import' && !state.context.problems.length && !state.context.potential.length && !state.context.needs.length && !state.context.events.length){
      structureSources();
      toast('Las fuentes fueron analizadas. Revisa y valida el contexto antes de generar la programación.');
      showView('fuentes');
      setTimeout(()=>$('#structuredContextPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),180);
      return;
    }
    if(state.workflow.mode!=='import' && !state.context.validated){
      toast('Valida primero el contexto estructurado para generar la programación anual.');
      showView('fuentes');
      setTimeout(()=>$('#structuredContextPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),180);
      return;
    }
    const needsRebuild=!state.programming.units.length || state.programming.units.length!==Math.max(1,Math.min(12,state.programming.unitCount||10));
    if(needsRebuild) buildUnitsFromContext(false);
    prepareAnnualDraft();
    invalidateAnnualConfirmation();
    generateAnnualPreview();
    revealAnnualPreview();
    saveState(false);
    showView('programacion');
    setTimeout(()=>$('#annualPreview')?.scrollIntoView({behavior:'smooth',block:'start'}),220);
    toast('Programación generada. Revisa la vista previa antes de continuar.');
  }

  function revealAnnualPreview(){
    const panel=$('#annualPreviewPanel');
    if(!panel) return;
    panel.classList.remove('preview-hidden');
    panel.classList.remove('preview-reveal');
    panel.setAttribute('aria-hidden','false');
    void panel.offsetWidth;
    panel.classList.add('preview-reveal');
  }

  function generateAnnualPreview(){
    syncMetaFromForm();syncProgrammingBasics();saveState(false);if(!state.programming.units.length){toast('Primero crea las unidades de la programación.');return;}prepareAnnualDraft();
    assignPeriodsToUnits(false);
    const cycles=cyclesFromGrades(),units=state.programming.units,periodInfo=periodMeta(),periodGroups=Array.from({length:periodInfo.count},(_,i)=>({number:i+1,label:periodLabel(i+1),units:units.filter(u=>Number(u.period)===i+1)})).filter(g=>g.units.length),selectedCompIds=[...new Set(Object.values(state.programming.matrix).flat())],selectedComps=selectedCompIds.map(id=>competenceIndex[id]).filter(Boolean),studyRows=state.programming.studyPlan,dataRows=[['1.1.- INSTITUCIÓN EDUCATIVA',state.meta.schoolName||'Pendiente'],['1.2.- DOCENTE RESPONSABLE',state.meta.teacherName||'Pendiente'],['1.3.- GRADOS',gradeDisplayHtml(state.meta.grades)],['1.4.- CICLOS',cycles.join(' – ')],['1.5.- TIPO DE ATENCIÓN',state.meta.schoolType],['1.6.- AÑO ESCOLAR',state.meta.year],['1.7.- NIVEL', 'Primaria']],doc=[],cycleLabel=cycles.length?cycles.map(c=>`${c} CICLO`).join(' – '):'EDUCACIÓN PRIMARIA';
    doc.push(`<div class="doc-page landscape"><div class="doc-ref-cover"><p class="cover-motto">“DECENIO DE LA IGUALDAD DE OPORTUNIDADES PARA MUJERES Y HOMBRES”</p><p class="cover-motto">PROGRAMACIÓN CURRICULAR ANUAL · EDUCACIÓN PRIMARIA</p><div class="cover-program">PROGRAMACIÓN CURRICULAR INTEGRADA</div><div class="cover-year">${esc(String(state.meta.year))}</div><div class="cover-cycles">${esc(cycleLabel)}</div><div class="cover-school">${esc(state.meta.schoolName||'INSTITUCIÓN EDUCATIVA')}<br>${gradeDisplayHtml(state.meta.grades,true)}</div><div class="cover-teacher">${esc(state.meta.teacherName||'DOCENTE RESPONSABLE')}</div><div class="cover-role">TODAS LAS ÁREAS CURRICULARES</div><p class="doc-small">Borrador generado a partir del Programa Curricular de Primaria y de las fuentes institucionales validadas.</p></div></div>`);
    doc.push(`<div class="doc-page landscape doc-compact"><div class="doc-title" style="font-size:13pt">PLANIFICACIÓN ANUAL DE INSTITUCIÓN EDUCATIVA ${esc(state.meta.schoolType.toUpperCase())}</div><div class="doc-section ref-section-title"><h3>I. DATOS INFORMATIVOS</h3><table class="doc-table ref-table">${dataRows.map(r=>`<tr><th style="width:31%;text-align:left">${esc(r[0])}</th><td>${String(r[1]).includes('grade-display')?r[1]:esc(r[1])}</td></tr>`).join('')}</table></div><div class="doc-section ref-section-title"><h3>II. DESCRIPCIÓN GENERAL</h3><p class="doc-intro"><b>CARACTERÍSTICAS DE LOS ESTUDIANTES EN CADA CICLO</b></p><table class="doc-table ref-table cycle-description-table"><thead><tr>${cycles.map(c=>`<th>${c} CICLO</th>`).join('')}</tr></thead><tbody><tr>${cycles.map(c=>`<td>${esc(CURR.cycleDescriptions[c])}</td>`).join('')}</tr></tbody></table><div class="doc-identity-note"><b>Visión:</b> ${esc(state.meta.vision||'Pendiente')}<br><b>Misión:</b> ${esc(state.meta.mission||'Pendiente')}</div></div></div>`);
    doc.push(`<div class="doc-page landscape"><div class="doc-section ref-section-title"><h3>III. ENFOQUES DE LAS ÁREAS CURRICULARES</h3><p class="doc-intro">La programación anual de Primaria integra todas las áreas curriculares. Las unidades y sesiones posteriores concretan una sola área según la selección realizada en cada unidad.</p><table class="doc-table ref-table approach-table"><thead><tr><th>ÁREA</th><th>ENFOQUE</th></tr></thead><tbody>${planningAreas.map(area=>`<tr><td>${esc(area.name.toUpperCase())}</td><td>${esc(area.approach||'Pendiente')}</td></tr>`).join('')}</tbody></table></div></div>`);
    doc.push(`<div class="doc-page landscape page-dense"><div class="doc-section ref-section-title"><h3>IV. PROPÓSITOS DE APRENDIZAJE, ORGANIZACIÓN DEL TIEMPO Y DISTRIBUCIÓN DE EXPERIENCIAS DE APRENDIZAJE</h3><table class="doc-table ref-table competency-distribution"><thead><tr><th class="col-area" rowspan="3">ÁREA</th><th class="col-num" rowspan="3">N.°</th><th class="col-comp" rowspan="3">COMPETENCIAS</th><th class="period-superhead" colspan="${units.length}">ORGANIZACIÓN Y DISTRIBUCIÓN DEL TIEMPO · ${esc(periodInfo.plural.toUpperCase())}</th></tr><tr>${periodGroups.map(g=>`<th class="period-band" colspan="${g.units.length}">${esc(g.label)}</th>`).join('')}</tr><tr>${units.map((u,i)=>`<th class="unit-head" style="width:15mm"><span class="unit-code">EdA ${String(i+1).padStart(2,'0')}</span><span class="vertical-title">${esc(u.title)}</span></th>`).join('')}</tr><tr><th colspan="3" class="subhead">DURACIÓN</th>${units.map(u=>`<th class="unit-days">${Number(u.days)||''}<br>días</th>`).join('')}</tr></thead><tbody>${planningAreas.map(area=>(area.competencies||[]).map((c,idx)=>`<tr>${idx===0?`<td class="area-band blue" rowspan="${area.competencies.length}">${esc(area.name.toUpperCase())}</td>`:''}<td class="center">${String(idx+1).padStart(2,'0')}</td><td>${esc(c.name)}</td>${units.map(u=>`<td class="center">${u.areaId===area.id && (state.programming.matrix[u.id]||[]).includes(c.id)?'X':''}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table></div></div>`);
    doc.push(`<div class="doc-page landscape"><div class="doc-section ref-section-title"><h3>ENFOQUES TRANSVERSALES</h3><p class="doc-intro">Los enfoques transversales orientan formas concretas de actuar en las interacciones de la comunidad educativa. La selección por experiencia es una propuesta automática editable, construida a partir del contexto validado.</p><table class="doc-table ref-table transversal-matrix"><thead><tr><th>DENOMINACIÓN</th>${units.map((u,i)=>`<th>EdA<br>${String(i+1).padStart(2,'0')}</th>`).join('')}</tr></thead><tbody>${CURR.crosscuttingApproaches.map(a=>`<tr><td>${esc(a)}</td>${units.map(u=>`<td>${u.approaches?.includes(a)?'X':''}</td>`).join('')}</tr>`).join('')}<tr><td><b>TUTORÍA Y ORIENTACIÓN EDUCATIVA</b></td>${units.map(()=>'<td>X</td>').join('')}</tr></tbody></table><table class="doc-table ref-table" style="margin-top:4mm"><thead><tr><th>ENFOQUE</th><th>ACCIÓN O ACTITUD ORIENTADORA</th></tr></thead><tbody>${CURR.crosscuttingApproaches.map(a=>`<tr><td>${esc(a)}</td><td>${esc(approachActionText(a))}</td></tr>`).join('')}</tbody></table><div class="doc-section ref-section-title"><h3>V. CARACTERÍSTICA FUNDAMENTAL DE LAS COMPETENCIAS</h3><p class="doc-intro">Las competencias están vinculadas entre sí y pueden movilizarse de manera articulada para enfrentar retos y situaciones de aprendizaje. La matriz anual identifica las competencias priorizadas en cada experiencia, evitando incorporarlas únicamente para completar el formato.</p></div></div>`);
    if(selectedComps.length){for(let i=0;i<selectedComps.length;i+=4){const chunk=selectedComps.slice(i,i+4);doc.push(`<div class="doc-page landscape"><div class="doc-section ref-section-title"><h3>VI. NIVEL DE DESARROLLO DE LA COMPETENCIA${i?' (continuación)':''}</h3><table class="doc-table ref-table standard-development"><thead><tr><th>ÁREA</th><th>COMPETENCIA / CAPACIDADES</th>${cycles.map(c=>`<th>ESTÁNDAR ${c} CICLO</th>`).join('')}</tr></thead><tbody>${chunk.map(c=>`<tr><td class="area-band">${esc(c.areaName.toUpperCase())}</td><td><b>${esc(c.name)}</b><ul class="standard-capacity-list">${(c.capacities||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></td>${cycles.map(cy=>`<td>${esc(c.standards[cy]||'Pendiente de fuente oficial validada.')}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="doc-note"><b>Nota pedagógica:</b> los criterios de evaluación específicos se contextualizan posteriormente en cada unidad y sesión a partir de los desempeños, propósito y evidencia; no se sustituyen por una copia literal del estándar.</div></div></div>`)}}
    const totals={III:0,IV:0,V:0};studyRows.forEach(r=>{totals.III+=Number(r.III)||0;totals.IV+=Number(r.IV)||0;totals.V+=Number(r.V)||0});doc.push(`<div class="doc-page landscape page-compact"><div class="doc-section ref-section-title"><h3>VII. PLAN DE ESTUDIOS</h3><p class="doc-intro">Se muestra la carga horaria de referencia del nivel Primaria con todas sus áreas curriculares.</p><table class="doc-table ref-table"><thead><tr><th>ÁREAS DEL CURRÍCULO</th><th>III CICLO</th><th>IV CICLO</th><th>V CICLO</th></tr></thead><tbody>${studyRows.map(r=>`<tr><td>${esc(r.name.toUpperCase())}</td><td class="center">${r.III}</td><td class="center">${r.IV}</td><td class="center">${r.V}</td></tr>`).join('')}<tr><th>TOTAL DE HORAS</th><th>${totals.III}</th><th>${totals.IV}</th><th>${totals.V}</th></tr></tbody></table><div class="doc-section ref-section-title" style="margin-top:7mm"><h3>VIII. MATRIZ DE PROGRAMACIÓN ANUAL</h3><p class="doc-intro">La matriz siguiente se construye exclusivamente con elementos detectados y validados en el diagnóstico y calendario comunal.</p></div></div>`);
    for(let i=0;i<units.length;i+=1){const chunk=units.slice(i,i+1);doc.push(`<div class="doc-page landscape annual-matrix-page"><div class="doc-section ref-section-title"><h3>VIII. MATRIZ DE PROGRAMACIÓN ANUAL${i?' (continuación)':''}</h3><table class="doc-table ref-table annual-context-matrix"><thead><tr><th>DURACIÓN</th><th>CALENDARIO COMUNAL</th><th>PROBLEMAS</th><th>POTENCIALIDADES</th><th>NECESIDADES E INTERESES</th><th>SITUACIÓN SIGNIFICATIVA</th><th>TÍTULO DE LA UNIDAD</th></tr></thead><tbody>${chunk.map(u=>`<tr><td class="center"><b>${esc(u.month)}</b><br>${Number(u.days)||''} días<br><span class="doc-small">${esc(areaIndex[u.areaId]?.name||'Sin área')}</span></td><td>${relevantListHtml(u.events?.length?u.events:(u.event?[u.event]:[]))}</td><td>${relevantListHtml(u.problems?.length?u.problems:(u.problem?[u.problem]:[]))}</td><td>${relevantListHtml(u.potentials?.length?u.potentials:(u.potential?[u.potential]:[]))}</td><td>${relevantListHtml(u.needs?.length?u.needs:(u.need?[u.need]:[]))}</td><td class="situation-cell">${esc(u.situation||'Pendiente de validar')}</td><td class="title-cell">${esc(u.title)}</td></tr>`).join('')}</tbody></table></div></div>`)}
    doc.push(`<div class="doc-page landscape"><div class="doc-section ref-section-title"><h3>IX. MATRIZ DE VALORES Y ACTITUDES</h3><table class="doc-table ref-table"><thead><tr><th style="width:30%">VALORES</th><th>ACTITUDES</th></tr></thead><tbody>${state.programming.values.map(v=>`<tr><td><b>${esc(v.value.toUpperCase())}</b></td><td>${esc(v.attitudes)}</td></tr>`).join('')}</tbody></table></div><div class="doc-section ref-section-title"><h3>X. EVALUACIÓN</h3><p style="text-align:justify">${esc(state.programming.evaluation)}</p></div><div class="doc-note">Antes de validar la programación se debe comprobar el calendario escolar efectivo, la normativa vigente, las denominaciones institucionales y la pertinencia de las situaciones significativas generadas.</div><div class="doc-signature"><div><span class="doc-signature-line">${esc(state.meta.teacherName||'Docente responsable')}</span><br><span class="doc-small">Docente responsable</span></div></div></div>`);$('#annualPreview').innerHTML=doc.join('');renderAnnualPreviewStatus();toast('Programación anual generada con la estructura del modelo de referencia.');
  }

  function bindUnitModule(){
    $('#unitSelector').addEventListener('change',()=>loadUnitIntoForm($('#unitSelector').value));
    $('#btnSaveUnit').addEventListener('click',()=>saveCurrentUnit(true));
    $('#btnPreviewUnit').addEventListener('click',generateUnitPreview);
    $('#btnAddSessionPlan').addEventListener('click',()=>{ if(!currentUnitId)return; const ud=ensureUnitData(currentUnitId); ud.sessions.push({id:uid('sp'),week:1,title:'',areaId:'',compId:''});saveState(false);renderSessionPlanEditor(); });
  }
  function refreshUnitSelectors(){
    if(!isAnnualConfirmed()){
      currentUnitId='';
      $('#unitSelector').innerHTML='<option value="">Valida primero la programación</option>';
      $('#unitPurposesEditor').innerHTML='<div class="empty-state"><strong>Primero valida la programación anual</strong><span>Las unidades solo se habilitan después de confirmar el documento madre.</span></div>';
      $('#sessionPlanEditor').innerHTML='';
      renderUnitAlert();
      renderUnitPreviewStatus('');
      return;
    }
    const units=state.programming.units; const sel=$('#unitSelector'); const previous=sel.value||currentUnitId;
    sel.innerHTML=units.length?units.map(u=>`<option value="${u.id}">${u.id} · ${esc(u.title)}</option>`).join(''):'<option value="">Sin unidades</option>';
    if(units.some(u=>u.id===previous))sel.value=previous;
    if(units.length){loadUnitIntoForm(sel.value||units[0].id)} else {currentUnitId='';$('#unitPurposesEditor').innerHTML='<div class="empty-state"><strong>No hay unidad disponible</strong></div>'; renderUnitAlert(); renderUnitPreviewStatus('');}
  }
  function ensureUnitData(id){
    if(!state.unitsData[id]) state.unitsData[id]={product:'',situation:state.programming.units.find(u=>u.id===id)?.situation||'',approaches:[],status:'Borrador',purposes:{},sessions:[],evaluation:'',resources:'',bibliography:'Currículo Nacional de la Educación Básica; Programa Curricular de Educación Primaria; Programación anual validada; fuentes institucionales pertinentes.'};
    const compIds=state.programming.matrix[id]||[];
    compIds.forEach(cid=>{if(!state.unitsData[id].purposes[cid])state.unitsData[id].purposes[cid]={purpose:'',criteria:{III:'',IV:'',V:''},evidence:'',instrument:'Lista de cotejo'};});
    return state.unitsData[id];
  }
  function loadUnitIntoForm(id){
    if(!id)return; currentUnitId=id; const ud=ensureUnitData(id); const unit=state.programming.units.find(u=>u.id===id);
    $('#unitProduct').value=ud.product||''; $('#unitStatus').value=ud.status||'Borrador'; $('#unitSituation').value=ud.situation||unit?.situation||''; $('#unitEvaluation').value=ud.evaluation||''; $('#unitResources').value=ud.resources||''; $('#unitBibliography').value=ud.bibliography||'';
    renderUnitApproaches(); renderUnitPurposes(); renderSessionPlanEditor(); renderUnitAlert(); renderUnitPreviewStatus(id);
  }
  function renderUnitApproaches(){
    const ud=ensureUnitData(currentUnitId); const root=$('#unitApproaches'); root.innerHTML=CURR.crosscuttingApproaches.map(a=>`<label><input type="checkbox" value="${esc(a)}" ${ud.approaches.includes(a)?'checked':''}>${esc(a.replace('Enfoque de ','').replace('Enfoque ','').replace(' o de Atención a la diversidad',''))}</label>`).join('');
    $$('input',root).forEach(c=>c.addEventListener('change',()=>{ud.approaches=$$('input:checked',root).map(x=>x.value);saveState(false)}));
  }
  function renderUnitPurposes(){
    const root=$('#unitPurposesEditor'); const ids=state.programming.matrix[currentUnitId]||[]; const cycles=cyclesFromGrades();
    if(!ids.length){root.innerHTML='<div class="empty-state"><strong>Esta unidad no tiene competencias seleccionadas</strong><span>Asigna competencias desde la programación anual.</span></div>';return;}
    const ud=ensureUnitData(currentUnitId);
    root.innerHTML=ids.map(cid=>{const c=competenceIndex[cid];const p=ud.purposes[cid];return `<div class="purpose-card" data-purpose="${cid}"><div class="purpose-card-head"><div><strong>${esc(c.areaName)}</strong><small>${esc(c.name)}</small></div><span class="badge source">Curricular</span></div><div class="purpose-card-body"><div class="standard-ref">${cycles.map(cy=>`<div><b>Estándar ${cy}</b>${esc(c.standards[cy]||'Pendiente')}</div>`).join('')}</div><label>Propósito de aprendizaje<textarea data-pfield="purpose" rows="3" placeholder="Formula un propósito específico para esta unidad.">${esc(p.purpose)}</textarea></label><div class="criteria-grid">${cycles.map(cy=>`<label>Criterio ciclo ${cy}<textarea data-criterion="${cy}" rows="4" placeholder="Deriva el criterio del aprendizaje que se observará.">${esc(p.criteria[cy]||'')}</textarea></label>`).join('')}</div><div class="form-grid two" style="margin-top:10px"><label>Evidencia<input data-pfield="evidence" value="${esc(p.evidence)}" placeholder="Producto o actuación observable"></label><label>Instrumento<select data-pfield="instrument"><option ${p.instrument==='Lista de cotejo'?'selected':''}>Lista de cotejo</option><option ${p.instrument==='Rúbrica'?'selected':''}>Rúbrica</option><option ${p.instrument==='Escala de valoración'?'selected':''}>Escala de valoración</option><option ${p.instrument==='Registro anecdótico'?'selected':''}>Registro anecdótico</option></select></label></div></div></div>`}).join('');
    $$('[data-purpose]').forEach(card=>{
      const p=ud.purposes[card.dataset.purpose];
      $$('[data-pfield]',card).forEach(el=>el.addEventListener('change',()=>{p[el.dataset.pfield]=el.value;saveState(false)}));
      $$('[data-criterion]',card).forEach(el=>el.addEventListener('change',()=>{p.criteria[el.dataset.criterion]=el.value;saveState(false)}));
    });
  }
  function renderSessionPlanEditor(){
    const root=$('#sessionPlanEditor'); if(!currentUnitId){root.innerHTML='';return;} const ud=ensureUnitData(currentUnitId); const compIds=state.programming.matrix[currentUnitId]||[];
    if(!ud.sessions.length){root.innerHTML='<div class="empty-state"><strong>Sin sesiones planificadas</strong><span>Agrega las sesiones que desarrollarán esta unidad.</span></div>';return;}
    root.innerHTML=ud.sessions.map((s,i)=>`<div class="session-plan-row" data-sp="${i}"><input data-sfield="week" type="number" min="1" max="8" value="${s.week||1}" title="Semana"><input data-sfield="title" value="${esc(s.title)}" placeholder="Título de la sesión"><select data-sfield="compId"><option value="">Competencia</option>${compIds.map(cid=>`<option value="${cid}" ${s.compId===cid?'selected':''}>${esc(competenceIndex[cid].areaName)} · ${esc(competenceIndex[cid].name)}</option>`).join('')}</select><button class="mini-delete" data-remove-sp="${i}">×</button></div>`).join('');
    $$('[data-sp]').forEach(row=>$$('[data-sfield]',row).forEach(el=>el.addEventListener('change',()=>{const s=ud.sessions[Number(row.dataset.sp)];s[el.dataset.sfield]=el.dataset.sfield==='week'?Number(el.value):el.value;if(el.dataset.sfield==='compId')s.areaId=competenceIndex[el.value]?.areaId||'';saveState(false);refreshSessionSelectors()})));
    $$('[data-remove-sp]').forEach(b=>b.addEventListener('click',()=>{ud.sessions.splice(Number(b.dataset.removeSp),1);saveState(false);renderSessionPlanEditor();refreshSessionSelectors()}));
  }
  function saveCurrentUnit(show=false){
    if(!currentUnitId)return; const ud=ensureUnitData(currentUnitId);
    ud.product=$('#unitProduct').value.trim();ud.status=$('#unitStatus').value;ud.situation=$('#unitSituation').value.trim();ud.evaluation=$('#unitEvaluation').value.trim();ud.resources=$('#unitResources').value.trim();ud.bibliography=$('#unitBibliography').value.trim(); saveState(false); renderUnitAlert(); if(show)toast('Unidad guardada.');
  }
  function generateUnitPreview(){
    if(!isAnnualConfirmed()){ toast('Primero valida la programación anual.'); return; }
    if(!currentUnitId){toast('Selecciona una unidad.');return;} saveCurrentUnit(false); const validation=validateUnitData(currentUnitId); if(validation.errors.length){ renderUnitAlert(); toast('Completa los datos principales de la unidad antes de generar la vista previa.'); return; } invalidateUnitConfirmation(currentUnitId); const unit=state.programming.units.find(u=>u.id===currentUnitId); const ud=ensureUnitData(currentUnitId); const cycles=cyclesFromGrades(); const ids=state.programming.matrix[currentUnitId]||[];
    const html=`<div class="doc-page landscape"><div class="doc-title">EXPERIENCIA / UNIDAD DE APRENDIZAJE ${esc(currentUnitId.replace('U',''))}</div><div class="doc-subtitle">${esc(unit?.title||'')}</div><table class="doc-table"><tr><th>Duración</th><td>${esc(unit?.month||'')} · ${unit?.days||''} días</td><th>Periodo</th><td>${esc(periodLabel(Number(unit?.period)||1))}</td></tr><tr><th>Institución</th><td>${esc(state.meta.schoolName||'Pendiente')}</td><th>Docente</th><td>${esc(state.meta.teacherName||'Pendiente')}</td></tr><tr><th>Área de la unidad</th><td colspan="3">${esc(areaIndex[unit?.areaId]?.name||'Pendiente')}</td></tr></table><div class="doc-section"><h3>I. Situación significativa</h3><p>${esc(ud.situation||'Pendiente')}</p></div><div class="doc-section"><h3>II. Producto general</h3><p>${esc(ud.product||'Pendiente')}</p></div><div class="doc-section"><h3>III. Enfoques transversales</h3><table class="doc-table"><tr><th>Enfoque</th><th>Acción o actitud</th></tr>${(ud.approaches.length?ud.approaches:['Pendiente']).map(a=>`<tr><td>${esc(a)}</td><td>${a==='Pendiente'?'Pendiente de precisar.':esc(approachActionText(a))}</td></tr>`).join('')}</table></div></div>
      <div class="doc-page landscape page-dense"><div class="doc-section"><h3>IV. Propósitos de aprendizaje</h3><table class="doc-table"><thead><tr><th>Área</th><th>Competencia</th><th>Propósito</th>${cycles.map(c=>`<th>Criterio ${c}</th>`).join('')}<th>Evidencia</th><th>Instrumento</th></tr></thead><tbody>${ids.map(cid=>{const c=competenceIndex[cid];const p=ud.purposes[cid];return `<tr><td>${esc(c.areaName)}</td><td>${esc(c.name)}</td><td>${esc(p?.purpose||'Pendiente')}</td>${cycles.map(cy=>`<td>${esc(p?.criteria?.[cy]||'Pendiente')}</td>`).join('')}<td>${esc(p?.evidence||'Pendiente')}</td><td>${esc(p?.instrument||'Pendiente')}</td></tr>`}).join('')}</tbody></table></div></div>
      <div class="doc-page landscape"><div class="doc-section"><h3>V. Secuencia didáctica de sesiones</h3><table class="doc-table"><tr><th>Semana</th><th>Sesión</th><th>Área / competencia</th></tr>${ud.sessions.length?ud.sessions.map((s,i)=>`<tr><td>Semana ${s.week||''}</td><td>Sesión ${String(i+1).padStart(2,'0')}: ${esc(s.title||'Pendiente')}</td><td>${s.compId?`${esc(competenceIndex[s.compId].areaName)} · ${esc(competenceIndex[s.compId].name)}`:'Pendiente'}</td></tr>`).join(''):'<tr><td colspan="3">Pendiente de planificar.</td></tr>'}</table></div></div>
      <div class="doc-page landscape"><div class="doc-section"><h3>VI. Evaluación</h3><p>${esc(ud.evaluation||'Pendiente')}</p></div><div class="doc-section"><h3>VII. Recursos</h3><p>${esc(ud.resources||'Pendiente')}</p></div><div class="doc-section"><h3>VIII. Bibliografía</h3><p>${esc(ud.bibliography||'Pendiente')}</p></div><div class="doc-note">La unidad conserva la trazabilidad con la programación anual. Los criterios y evidencias deben revisarse antes de cambiar el estado a “Validada”.</div></div>`;
    $('#unitPreview').innerHTML=html; renderUnitPreviewStatus(currentUnitId); renderUnitAlert(); toast('Vista previa de la unidad generada con orientación adecuada por sección.');
  }

  function bindSessionModule(){
    $('#sessionUnitSelector').addEventListener('change',()=>loadSessionUnit($('#sessionUnitSelector').value));
    $('#sessionPlanSelector').addEventListener('change',()=>applySessionPlan());
    $('#sessionArea').addEventListener('change',()=>{renderSessionCompetencies();loadSessionInheritance();resetDidactic();});
    $('#sessionCompetency').addEventListener('change',()=>{loadSessionInheritance();resetDidactic();});
    $('#btnResetDidactic').addEventListener('click',resetDidactic);
    $('#btnAddInstrumentCriterion').addEventListener('click',()=>{instrumentCriteria.push('');renderInstrumentCriteria()});
    $('#btnSaveSession').addEventListener('click',()=>saveCurrentSession(true));
    $('#btnPreviewSession').addEventListener('click',generateSessionPreview);
  }
  function refreshSessionSelectors(){
    if(!isAnnualConfirmed()){
      $('#sessionUnitSelector').innerHTML='<option value="">Valida primero la programación</option>';
      $('#sessionPlanSelector').innerHTML='<option value="">Sin sesiones</option>';
      renderSessionAlert();
      renderSessionPreviewStatus();
      return;
    }
    const sel=$('#sessionUnitSelector'); const prev=sel.value;
    sel.innerHTML=state.programming.units.length?state.programming.units.map(u=>`<option value="${u.id}">${u.id} · ${esc(u.title)}</option>`).join(''):'<option value="">Sin unidades</option>';
    if(state.programming.units.some(u=>u.id===prev))sel.value=prev;
    if(sel.value)loadSessionUnit(sel.value); else { renderSessionAlert(); renderSessionPreviewStatus(); }
  }
  function loadSessionUnit(id){
    if(!id)return;
    if(!isUnitConfirmed(id)){
      $('#sessionPlanSelector').innerHTML='<option value="">Valida primero la unidad</option>';
      $('#didacticEditor').innerHTML='<div class="empty-state"><strong>Primero valida la unidad</strong><span>Las sesiones solo se habilitan desde una unidad confirmada.</span></div>';
      renderSessionAlert();
      renderSessionPreviewStatus();
      return;
    }
    const ud=ensureUnitData(id); const plan=$('#sessionPlanSelector');
    plan.innerHTML='<option value="">Sesión libre / no planificada</option>'+ud.sessions.map((s,i)=>`<option value="${i}">Sesión ${String(i+1).padStart(2,'0')} · ${esc(s.title||'Sin título')}</option>`).join('');
    renderSessionAreas(id); applySessionPlan(); renderSessionAlert(); renderSessionPreviewStatus();
  }
  function renderSessionAreas(unitId){
    const unit=state.programming.units.find(item=>item.id===unitId);
    const areaIds=unit?.areaId?[unit.areaId]:[];
    const sel=$('#sessionArea'); const prev=sel.value; sel.innerHTML=areaIds.map(id=>`<option value="${id}">${esc(areaIndex[id].name)}</option>`).join(''); if(areaIds.includes(prev))sel.value=prev; renderSessionCompetencies();
  }
  function renderSessionCompetencies(){
    const uidv=$('#sessionUnitSelector').value; const areaId=$('#sessionArea').value; const ids=(state.programming.matrix[uidv]||[]).filter(id=>competenceIndex[id]?.areaId===areaId); const sel=$('#sessionCompetency'); const prev=sel.value; sel.innerHTML=ids.map(id=>`<option value="${id}">${esc(competenceIndex[id].name)}</option>`).join(''); if(ids.includes(prev))sel.value=prev;
  }
  function applySessionPlan(){
    const uidv=$('#sessionUnitSelector').value; if(!uidv)return; const ud=ensureUnitData(uidv); const idx=$('#sessionPlanSelector').value;
    if(idx!==''){
      const sp=ud.sessions[Number(idx)]; if(sp){$('#sessionTitle').value=sp.title||'';if(sp.areaId)$('#sessionArea').value=sp.areaId;renderSessionCompetencies();if(sp.compId)$('#sessionCompetency').value=sp.compId;}
    }
    loadSessionInheritance(); resetDidactic();
  }
  function loadSessionInheritance(){
    const uidv=$('#sessionUnitSelector').value; const cid=$('#sessionCompetency').value; if(!uidv||!cid)return; const ud=ensureUnitData(uidv); const p=ud.purposes[cid]||{purpose:'',criteria:{III:'',IV:'',V:''},evidence:'',instrument:'Lista de cotejo'};
    $('#sessionPurpose').value=p.purpose||''; $('#sessionCriterionIII').value=p.criteria?.III||''; $('#sessionCriterionIV').value=p.criteria?.IV||''; $('#sessionCriterionV').value=p.criteria?.V||''; $('#sessionEvidence').value=p.evidence||''; $('#sessionInstrument').value=p.instrument||'Lista de cotejo';
    const app=$('#sessionApproach'); app.innerHTML=(ud.approaches.length?ud.approaches:CURR.crosscuttingApproaches).map(a=>`<option>${esc(a)}</option>`).join(''); $('#sessionAttitude').value='';
    instrumentCriteria=[p.criteria?.III,p.criteria?.IV,p.criteria?.V].filter(Boolean).map((x,i)=>`Ciclo ${['III','IV','V'][i]||''}: ${x}`); if(!instrumentCriteria.length)instrumentCriteria=['','','']; renderInstrumentCriteria();
  }

  function processTemplate(areaId, compId){
    const title=$('#sessionTitle').value.trim()||'la actividad prevista';
    const intro=`Presentar una situación o recurso vinculado con “${title}”. Recuperar saberes previos mediante preguntas pertinentes, comunicar el propósito y acordar una pauta breve de convivencia.`;
    const close='Recoger conclusiones, contrastar lo aprendido con el propósito, realizar metacognición y orientar una acción de mejora o transferencia.';
    if(areaId==='comunicacion' && compId==='com_lee') return [
      ['Inicio',intro],['Antes de la lectura','Explorar el texto, propósito, título, imágenes u otros indicios; formular predicciones y activar conocimientos previos pertinentes.'],['Durante la lectura','Realizar lectura guiada y/o autónoma diferenciada por ciclo; localizar información, inferir, aclarar vocabulario y volver al texto para verificar interpretaciones.'],['Después de la lectura','Contrastar predicciones, responder preguntas de distinta demanda, organizar información y expresar una valoración sustentada en el texto.'],['Cierre',close]
    ];
    if(areaId==='comunicacion' && compId==='com_escribe') return [
      ['Inicio',intro],['Planificación','Precisar qué se escribirá, para qué, para quién, tipo textual, soporte y organización de ideas; diferenciar apoyos según ciclo.'],['Textualización','Producir una primera versión movilizando recursos lingüísticos y convenciones pertinentes al ciclo y al propósito comunicativo.'],['Revisión','Releer y revisar adecuación, coherencia, cohesión y convenciones; incorporar retroalimentación y producir una versión mejorada.'],['Cierre',close]
    ];
    if(areaId==='comunicacion') return [['Inicio',intro],['Preparación del intercambio','Precisar propósito, interlocutores, ideas y organización de la participación oral.'],['Interacción oral','Desarrollar el intercambio, exposición o diálogo usando recursos verbales, no verbales y escucha activa, con diferenciación por ciclo.'],['Reflexión sobre el texto oral','Recuperar información, interpretar lo escuchado y valorar la pertinencia de las intervenciones.'],['Cierre',close]];
    if(areaId==='matematica') return [['Inicio',intro],['Comprensión del problema','Presentar y comprender una situación problemática contextualizada; identificar datos, condiciones y pregunta.'],['Búsqueda de estrategias','Permitir que los estudiantes propongan procedimientos y representaciones; ofrecer apoyos diferenciados sin anticipar la solución.'],['Representación','Representar la situación con material concreto, gráficos, esquemas o lenguaje matemático según el ciclo.'],['Formalización','Organizar y comunicar el conocimiento matemático construido a partir de las estrategias utilizadas.'],['Reflexión y transferencia','Comparar estrategias, justificar resultados y resolver una situación semejante o variada.'],['Cierre',close]];
    if(areaId==='personal_social') return [['Inicio / problematización',intro],['Problematización','Plantear preguntas sobre una situación social, histórica, económica o territorial vinculada con la competencia y el contexto.'],['Análisis de información','Analizar fuentes pertinentes y diferenciadas; contrastar información, perspectivas o evidencias según la competencia.'],['Acuerdos o toma de decisiones','Construir explicaciones, acuerdos o propuestas de acción sustentadas en la información analizada.'],['Cierre',close]];
    if(areaId==='ciencia' && compId==='cyt_indaga') return [['Inicio',intro],['Planteamiento del problema','Formular una pregunta investigable coherente con el fenómeno que se observará o explorará.'],['Planteamiento de hipótesis','Proponer respuestas o explicaciones posibles adecuadas al ciclo y susceptibles de contrastación.'],['Plan de acción','Definir procedimiento, materiales, fuentes, medidas de seguridad y forma de registrar datos.'],['Recojo y análisis de datos','Obtener, organizar e interpretar datos o información; comparar resultados con la hipótesis.'],['Estructuración del saber','Construir conclusiones basadas en evidencias y relacionarlas con conocimiento científico pertinente.'],['Evaluación y comunicación',close]];
    if(areaId==='ciencia' && compId==='cyt_disena') return [['Inicio',intro],['Determina una alternativa','Delimitar el problema tecnológico, sus causas, requerimientos y recursos disponibles.'],['Diseña la alternativa','Representar la solución mediante esquema, secuencia, materiales, medidas y criterios de funcionamiento.'],['Implementa y valida','Construir o simular la solución, probarla con criterios de seguridad y registrar ajustes.'],['Evalúa y comunica','Valorar el funcionamiento e impactos, proponer mejoras y comunicar el proceso.'],['Cierre',close]];
    if(areaId==='ciencia') return [['Inicio',intro],['Problematización','Plantear una pregunta que requiera explicar un fenómeno o relación a partir de conocimiento científico.'],['Análisis de evidencias y modelos','Examinar observaciones, información confiable, modelos o representaciones pertinentes.'],['Construcción de la explicación','Relacionar evidencias con conceptos científicos y elaborar una explicación adecuada al ciclo.'],['Implicancias del saber científico y tecnológico','Analizar consecuencias o decisiones vinculadas con ciencia, tecnología, sociedad y ambiente cuando corresponda.'],['Cierre',close]];
    if(areaId==='arte') return [['Inicio',intro],['Observan / perciben','Observar, escuchar o explorar referentes artísticos y culturales pertinentes; describir cualidades y primeras impresiones.'],['Exploran y experimentan','Probar materiales, técnicas, elementos y posibilidades expresivas con libertad y propósito.'],['Desarrollan / crean','Planificar y producir una creación o respuesta artística ajustada a la intención y nivel de autonomía de cada ciclo.'],['Reflexionan','Compartir el proceso, explicar decisiones, valorar resultados y reconocer aspectos que pueden mejorarse.'],['Cierre',close]];
    if(areaId==='religion') return [['Inicio',intro],['Auscultar la realidad','Reconocer una experiencia o situación de la vida vinculada con el propósito formativo.'],['Iluminar','Acercarse al texto bíblico o fuente religiosa pertinente y comprender su mensaje en relación con la situación.'],['Discernir','Reflexionar sobre el significado del mensaje, contrastarlo con la vida cotidiana y construir una postura personal.'],['Actuar','Definir una acción o compromiso coherente con el aprendizaje y la convivencia respetuosa.'],['Cierre',close]];
    if(areaId==='educacion_fisica') return [['Inicio y activación',intro+' Realizar activación corporal progresiva y recordar medidas de seguridad.'],['Desarrollo motriz','Desarrollar tareas motrices progresivas, demostración, práctica guiada y práctica autónoma o cooperativa.'],['Práctica diferenciada','Ajustar consignas, reglas, distancias, materiales o roles según ciclo, posibilidades y necesidades del grupo.'],['Recuperación y autocuidado','Regular esfuerzo, hidratarse, realizar recuperación corporal y reconocer sensaciones corporales.'],['Cierre',close]];
    return [['Inicio',intro],['Desarrollo','Desarrollar actividades alineadas con la competencia, criterio y evidencia seleccionados, diferenciando la demanda por ciclo.'],['Cierre',close]];
  }
  function resetDidactic(){
    const areaId=$('#sessionArea').value; const compId=$('#sessionCompetency').value; if(!areaId||!compId){$('#didacticEditor').innerHTML='';return;}
    const template=processTemplate(areaId,compId); const total=Number($('#sessionDuration').value)||90; const start=template.length>4?15:20; const end=10; const mid=Math.max(5,Math.floor((total-start-end)/(template.length-2)));
    didacticPhases=template.map((x,i)=>({name:x[0],activities:x[1],resources:'',time:i===0?start:i===template.length-1?end:mid}));
    const sum=didacticPhases.reduce((a,b)=>a+b.time,0); if(sum!==total)didacticPhases[didacticPhases.length-2].time+=total-sum;
    renderDidactic();
  }
  function renderDidactic(){
    const root=$('#didacticEditor'); root.innerHTML=didacticPhases.map((p,i)=>`<div class="didactic-phase" data-phase="${i}"><div class="didactic-phase-head"><strong>${esc(p.name)}</strong><input data-dfield="time" type="number" min="5" max="180" value="${p.time}" title="Tiempo en minutos"><input data-dfield="resources" value="${esc(p.resources)}" placeholder="Recursos"></div><textarea data-dfield="activities" rows="5">${esc(p.activities)}</textarea></div>`).join('');
    const c=competenceIndex[$('#sessionCompetency').value]; $('#didacticTitle').textContent=c?`Procesos didácticos · ${c.areaName}`:'Secuencia metodológica'; $('#didacticHint').textContent='Estructura inicial editable basada en los modelos analizados. Ajusta actividades, recursos y tiempos al grupo real.';
    $$('[data-phase]').forEach(row=>$$('[data-dfield]',row).forEach(el=>el.addEventListener('change',()=>{const p=didacticPhases[Number(row.dataset.phase)];p[el.dataset.dfield]=el.dataset.dfield==='time'?Number(el.value):el.value})));
  }
  function renderInstrumentCriteria(){
    const root=$('#instrumentCriteriaEditor'); root.innerHTML=instrumentCriteria.map((v,i)=>`<div class="instrument-row"><input data-icrit="${i}" value="${esc(v)}" placeholder="Criterio observable"><button class="mini-delete" data-rm-icrit="${i}">×</button></div>`).join('');
    $$('[data-icrit]').forEach(el=>el.addEventListener('change',()=>instrumentCriteria[Number(el.dataset.icrit)]=el.value));
    $$('[data-rm-icrit]').forEach(b=>b.addEventListener('click',()=>{instrumentCriteria.splice(Number(b.dataset.rmIcrit),1);renderInstrumentCriteria()}));
  }
  function collectSessionData(){
    return {id:uid('ses'),unitId:$('#sessionUnitSelector').value,planIndex:$('#sessionPlanSelector').value,date:$('#sessionDate').value,title:$('#sessionTitle').value.trim(),areaId:$('#sessionArea').value,compId:$('#sessionCompetency').value,purpose:$('#sessionPurpose').value.trim(),criteria:{III:$('#sessionCriterionIII').value.trim(),IV:$('#sessionCriterionIV').value.trim(),V:$('#sessionCriterionV').value.trim()},evidence:$('#sessionEvidence').value.trim(),instrument:$('#sessionInstrument').value,approach:$('#sessionApproach').value,attitude:$('#sessionAttitude').value.trim(),duration:Number($('#sessionDuration').value)||90,didactic:didacticPhases.map(x=>({...x})),instrumentCriteria:[...instrumentCriteria]};
  }
  function saveCurrentSession(show=false){
    const data=collectSessionData(); if(!data.unitId||!data.compId||!data.title){toast('Completa unidad, competencia y título de la sesión.');renderSessionAlert();return null;}
    state.sessions.push(data);saveState(false);renderSessionAlert();if(show)toast('Sesión guardada en el proyecto.');return data;
  }
  function generateSessionPreview(){
    const data=collectSessionData(); const validation=validateSessionData(data); if(validation.errors.length){ renderSessionAlert(); toast('Completa los datos principales de la sesión antes de generar la vista previa.'); return; } invalidateSessionConfirmation(); const c=competenceIndex[data.compId]; const cycles=cyclesFromGrades(); const unit=state.programming.units.find(u=>u.id===data.unitId);
    const criteriaRows=cycles.map(cy=>`<th>Criterio ${cy}</th>`).join(''); const criteriaVals=cycles.map(cy=>`<td>${esc(data.criteria[cy]||'Pendiente')}</td>`).join('');
    const html=`<div class="doc-page landscape page-dense"><div class="doc-title">SESIÓN DE APRENDIZAJE</div><div class="doc-subtitle">${esc(data.date||'Fecha pendiente')}</div><div class="doc-section"><h3>I. Título</h3><p><b>${esc(data.title||'Pendiente')}</b></p></div><div class="doc-section"><h3>II. Aprendizaje esperado</h3><table class="doc-table"><tr><th>Área</th><th>Competencia</th><th>Propósito</th>${criteriaRows}<th>Evidencia</th><th>Instrumento</th></tr><tr><td>${esc(c.areaName)}</td><td>${esc(c.name)}</td><td>${esc(data.purpose||'Pendiente')}</td>${criteriaVals}<td>${esc(data.evidence||'Pendiente')}</td><td>${esc(data.instrument)}</td></tr></table><table class="doc-table"><tr><th>Enfoque transversal</th><th>Acción o actitud</th></tr><tr><td>${esc(data.approach||'Pendiente')}</td><td>${esc(data.attitude||'Pendiente de precisar')}</td></tr></table></div><div class="doc-section"><h3>III. Secuencia didáctica</h3><table class="doc-table"><tr><th style="width:18%">Fase / proceso</th><th>Actividades / estrategias</th><th style="width:16%">Recursos</th><th style="width:8%">Tiempo</th></tr>${data.didactic.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.activities)}</td><td>${esc(p.resources||'Según actividad')}</td><td>${p.time} min</td></tr>`).join('')}</table></div><div class="doc-note">Unidad de procedencia: ${esc(unit?.title||data.unitId)}. La sesión conserva la competencia y los criterios heredados de la unidad, pero deben revisarse antes de validar el documento.</div></div>
      <div class="doc-page landscape page-dense"><div class="doc-section"><h3>IV. Evaluación</h3><p>Instrumento: <b>${esc(data.instrument)}</b></p><table class="doc-table"><tr><th rowspan="2">N.°</th><th rowspan="2">Apellidos y nombres</th><th colspan="${Math.max(1,data.instrumentCriteria.length)}">Criterios de evaluación</th></tr><tr>${(data.instrumentCriteria.length?data.instrumentCriteria:['Criterio pendiente']).map(x=>`<th>${esc(x||'Criterio pendiente')}</th>`).join('')}</tr>${Array.from({length:15},(_,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td></td>${(data.instrumentCriteria.length?data.instrumentCriteria:['']).map(()=>'<td>Inicio / Proceso / Logrado</td>').join('')}</tr>`).join('')}</table></div><div class="doc-section"><h3>Referencia curricular</h3><p><b>Capacidades:</b> ${esc(c.capacities.join('; '))}</p>${cycles.map(cy=>`<div class="doc-box" style="margin:2mm 0"><b>Estándar ciclo ${cy}</b><p>${esc(c.standards[cy]||'Pendiente')}</p></div>`).join('')}</div></div>`;
    $('#sessionPreview').innerHTML=html; renderSessionPreviewStatus(); renderSessionAlert(); toast('Vista previa de la sesión generada.');
  }

  function bindCurriculumBrowser(){
    const areaSel=$('#browserArea'); areaSel.innerHTML=CURR.areas.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    $('#browserCycle').addEventListener('change',renderCurriculumBrowser); areaSel.addEventListener('change',()=>{populateBrowserCompetencies();renderCurriculumBrowser()}); $('#browserCompetency').addEventListener('change',renderCurriculumBrowser); populateBrowserCompetencies();
  }
  function populateBrowserCompetencies(){
    const a=areaIndex[$('#browserArea').value]; $('#browserCompetency').innerHTML=a.competencies.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  function renderCurriculumBrowser(){
    const c=competenceIndex[$('#browserCompetency').value]; const cy=$('#browserCycle').value; if(!c)return; $('#curriculumBrowser').innerHTML=`<h3>${esc(c.name)}</h3><div class="curr-source">${esc(c.areaName)} · Fuente: ${esc(c.source)}</div><p class="eyebrow">Capacidades</p><div class="capacity-list">${c.capacities.map(x=>`<span class="capacity-pill">${esc(x)}</span>`).join('')}</div><p class="eyebrow">Estándar esperado al final del ciclo ${esc(cy)}</p><div class="standard-box"><p>${esc(c.standards[cy]||'Pendiente de incorporar')}</p></div>${c.areaId==='religion'?'<div class="warning-box">En el Programa Curricular de Primaria proporcionado, el área de Educación Religiosa aparece “en proceso de ajuste por la ONDEC”. Esta V1 conserva las competencias y capacidades del modelo institucional, pero no presenta estándares como oficiales hasta incorporar una fuente validada.</div>':''}`;
  }

  function renderAll(){
    renderContext(); renderProgramming(); refreshUnitSelectors(); refreshSessionSelectors(); renderCurriculumBrowser(); renderUnitAlert(); renderUnitPreviewStatus(); renderSessionAlert(); renderSessionPreviewStatus(); updateMetrics(); updateCoherence();
  }
  function updateMetrics(){
    const sources=['diagnosis','calendar','identity'].filter(k=>state.sources[k].text.trim()).length; $('#metricSources').textContent=`${sources}/3`; $('#metricUnits').textContent=state.programming.units.length; $('#metricSessions').textContent=state.sessions.length; $('#metricCompetencies').textContent=Object.keys(competenceIndex).length;
    updateCoherence();
  }
  function updateCoherence(){
    const items=[]; const sourcesOk=['diagnosis','calendar','identity'].every(k=>state.sources[k].text.trim());
    if(state.workflow.mode==='import'){
      items.push([state.workflow.importValidated?'ok':'warn','Programación importada',state.workflow.importValidated?'La programación cargada fue revisada y validada.':'Falta validar la programación importada.']);
      items.push(['ok','Ruta activa','La plataforma trabajará desde la programación validada como documento madre.']);
    }else{
      items.push([sourcesOk?'ok':'warn','Fuentes institucionales',sourcesOk?'Las tres fuentes básicas tienen contenido.':'Falta cargar diagnóstico, calendario o misión/visión.']);
      items.push([state.context.validated?'ok':'warn','Contexto validado',state.context.validated?'La extracción contextual fue revisada por el docente.':'El contexto aún está en borrador.']);
    }
    items.push([state.programming.units.length?'ok':'warn','Programación anual',state.programming.units.length?`${state.programming.units.length} unidades creadas.`:'Aún no se han construido unidades.']);
    const compCount=Object.values(state.programming.matrix).reduce((a,b)=>a+b.length,0); items.push([compCount?'ok':'warn','Distribución curricular',compCount?`${compCount} asignaciones de competencias registradas.`:'Todavía no se asignan competencias a las unidades.']);
    const validatedUnits=Object.values(state.unitsData).filter(u=>u.status==='Validada').length; items.push([validatedUnits?'ok':'warn','Unidades validadas',validatedUnits?`${validatedUnits} unidad(es) marcada(s) como validada(s).`:'Las unidades continúan como borradores.']);
    $('#coherenceList').innerHTML=items.map(([s,t,p])=>`<div class="check-item ${s}"><span class="check-dot"></span><div><strong>${esc(t)}</strong><p>${esc(p)}</p></div></div>`).join('');
  }

  init();
})();
