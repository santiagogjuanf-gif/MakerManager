(function () {
  let allJobs = [], allClients = [], allPrinters = [], allFilaments = [];
  let jobSearch = '', jobViewMode = 'kanban';
  let _appCfg = {};

  // Per-column pagination state
  const colPage = { Solicitud:1, Levantamiento:1, Producción:1, Cierre:1 };
  const COL_PAGE_SIZE = 10;

  const STAGES = [
    { key: 'Solicitud',     label: 'Solicitud',     color: 'badge-default',   next: 'Levantamiento' },
    { key: 'Levantamiento', label: 'Levantamiento', color: 'badge-regular',   next: 'Producción' },
    { key: 'Producción',    label: 'Producción',    color: 'badge-frecuente', next: 'Cierre' },
    { key: 'Cierre',        label: 'Cierre',        color: 'badge-vip',       next: null },
  ];
  function stageIndex(e) { const i=STAGES.findIndex(s=>s.key===(e||'Solicitud')); return i===-1?0:i; }
  function stageBadge(e) { const s=STAGES[stageIndex(e)]; return `<span class="badge ${s.color}">${s.label}</span>`; }
  function parseLev(raw) { try { return typeof raw==='string'?JSON.parse(raw):(raw||{}); } catch { return {}; } }
  function fmtH(n) { n=parseFloat(n)||0; return n>=1?`${Math.floor(n)}h ${Math.round((n%1)*60)}min`:n>0?`${Math.round(n*60)}min`:'-'; }
  function parseTime(str) { if(!str)return 0; const hm=String(str).match(/^(\d+):(\d+)h?$/); if(hm)return parseInt(hm[1])*60+parseInt(hm[2]); return Math.round(parseFloat(str)*60)||0; }
  function formatTime(min) { min=parseInt(min)||0; return `${Math.floor(min/60)}:${String(min%60).padStart(2,'0')}h`; }
  function tierBadge(tier) { const m={unitario:['badge-default','Unitario'],menudeo:['badge-regular','Menudeo'],mayoreo:['badge-frecuente','Mayoreo']}; const [c,l]=m[tier]||['badge-default',tier]; return `<span class="badge ${c}">${l}</span>`; }
  function spoolCard(f,size=60) {
    if (typeof makeSpool==='function'&&f.material) {
      // Lookup real stock from allFilaments; fall back to full spool if not found
      const full=allFilaments.find(x=>x.id==(f.id||f.filamento_id))||{};
      return makeSpool({
        marca:f.marca||'',material:f.material||'',color:f.color||'',
        color_hex:f.color_hex||'',acabado:f.acabado||'',
        peso_actual_g: full.peso_actual_g??f.peso_actual_g??1000,
        peso_inicial_g: full.peso_inicial_g??f.peso_inicial_g??1000,
      },size);
    }
    const hex=f.color_hex||colorHex(f.color||'');
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${hex};border:3px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.18)}px;color:#fff;font-weight:700">${(f.material||'').substring(0,3)}</div>`;
  }
  // Build a clean display name from filament data without duplicating parts
  function filName(f) {
    const parts=[];
    if (f.marca) parts.push(f.marca);
    if (f.nombre_comercial&&f.nombre_comercial!==f.marca) parts.push(f.nombre_comercial);
    if (f.material) parts.push(f.material);
    if (f.color) parts.push(f.color);
    return parts.join(' ')||f.nombre||'—';
  }

  // ─── PAGE LOADER ─────────────────────────────────────────────────────────────

  pageLoaders['jobs'] = async function loadJobs() {
    const el=document.getElementById('page-jobs');
    el.innerHTML=`
      <div class="page-header">
        <div><div class="page-title">Trabajos</div><div class="page-subtitle">Órdenes de producción</div></div>
      </div>
      <div class="fil-toolbar-top" style="margin-bottom:12px">
        <button class="btn btn-secondary" onclick="openCalculator()">🧮 Calculadora</button>
        <button class="btn btn-primary" onclick="jobOpenForm()">＋ Nuevo Trabajo</button>
        <input class="search-input form-control" style="flex:1;max-width:300px" id="job-search-input" placeholder="Buscar en todos los tableros..." oninput="jobSearch2(this.value)" autocomplete="off">
        <div style="display:flex;gap:2px;background:var(--surface);border-radius:8px;padding:3px;border:1px solid var(--border)">
          <button id="job-view-list"   class="btn btn-sm ${jobViewMode==='list'?'btn-primary':'btn-secondary'}"   onclick="jobSetView('list')"   style="padding:4px 10px">☰ Lista</button>
          <button id="job-view-kanban" class="btn btn-sm ${jobViewMode==='kanban'?'btn-primary':'btn-secondary'}" onclick="jobSetView('kanban')" style="padding:4px 10px">📋 Tablero</button>
        </div>
      </div>
      <div id="job-cards"></div>
      <div class="pagination" id="job-pagination"></div>`;
    await refreshJobs();
    if (window._jobToOpen) { const id=window._jobToOpen; delete window._jobToOpen; setTimeout(()=>jobView(id),150); }
  };

  async function refreshJobs() {
    try {
      [allJobs,allClients,allPrinters,allFilaments,_appCfg]=await Promise.all([
        api('GET','/api/jobs'), api('GET','/api/clients'), api('GET','/api/printers'),
        api('GET','/api/filaments'), api('GET','/api/config').catch(()=>({})),
      ]);
    } catch(e) { allJobs=[]; allClients=[]; allPrinters=[]; allFilaments=[]; }
    renderJobs();
  }

  window.jobSetView=function(mode){
    jobViewMode=mode;
    ['list','kanban'].forEach(m=>{ document.getElementById(`job-view-${m}`)?.classList.toggle('btn-primary',mode===m); document.getElementById(`job-view-${m}`)?.classList.toggle('btn-secondary',mode!==m); });
    renderJobs();
  };

  // ─── TABLERO ─────────────────────────────────────────────────────────────────

  const BOARD_COLS=[
    {key:'Solicitud',icon:'📥',color:'#6366f1'},
    {key:'Levantamiento',icon:'📐',color:'#f59e0b'},
    {key:'Producción',icon:'🖨️',color:'#3b82f6'},
    {key:'Cierre',icon:'✅',color:'#22c55e'},
  ];

  function renderKanban(filtered) {
    const byStage={};
    BOARD_COLS.forEach(s=>byStage[s.key]=[]);
    filtered.forEach(j=>{ const k=j.estado||'Solicitud'; (byStage[k]||byStage['Solicitud']).push(j); });

    const cols=BOARD_COLS.map(st=>{
      const all=byStage[st.key]||[];
      const pg=colPage[st.key]||1;
      const totalPgs=Math.max(1,Math.ceil(all.length/COL_PAGE_SIZE));
      const items=all.slice((pg-1)*COL_PAGE_SIZE,pg*COL_PAGE_SIZE);

      const cards=items.length===0
        ?`<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 8px">${all.length===0?'Sin trabajos':'Sin resultados'}</div>`
        :items.map(j=>{
          const total=parseInt(j.camas_total)||0,done=parseInt(j.camas_done)||0;
          const pct=total>0?Math.round(done/total*100):null;
          const printerName=j.impresora_id?(allPrinters.find(p=>p.id===j.impresora_id)?.nombre||''):'';
          return `<div onclick="jobView(${j.id})" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color .15s"
            onmouseover="this.style.borderColor='${st.color}'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">
              <div style="font-size:12px;font-weight:700;line-height:1.3;flex:1">${j.nombre_proyecto||'Sin nombre'}</div>
              ${printerName?`<div style="font-size:10px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:2px 7px;white-space:nowrap;color:var(--text-muted);flex-shrink:0">🖨️ ${printerName}</div>`:''}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">👥 ${j.cliente_nombre||'—'}</div>
            ${j.canal_venta?`<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${({'Shopify':'🛍️','Mercado Libre':'🟡','Etsy':'🧡','Amazon':'📦','WhatsApp':'💬','Presencial':'🏪'})[j.canal_venta]||'🔗'} ${j.canal_venta}${j.orden_id?` · <span style="color:var(--accent-light)">#${j.orden_id}</span>`:''}</div>`:''}
            ${j.precio_final?`<div style="font-size:13px;font-weight:800;color:${st.color};margin-bottom:6px">${fmtMoney(j.precio_final)}</div>`:''}
            ${pct!==null?`<div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:3px"><span>${done}/${total} camas</span><span>${pct}%</span></div>
              <div style="height:5px;background:var(--border);border-radius:3px"><div style="height:100%;background:${st.color};border-radius:3px;width:${pct}%;transition:width .4s"></div></div>
            </div>`:''}
            <div style="display:flex;gap:4px;margin-top:8px" onclick="event.stopPropagation()">
              <button class="btn btn-secondary btn-sm" style="padding:3px 8px;font-size:11px" onclick="jobOpenForm(${j.id})">✏️</button>
              <button class="btn btn-danger btn-sm" style="padding:3px 8px;font-size:11px" onclick="jobDelete(${j.id})">🗑️</button>
            </div>
          </div>`;
        }).join('');

      // Column pagination
      let pagHtml='';
      if (totalPgs>1) {
        const prev=pg>1?`<button onclick="colPg('${st.key}',${pg-1})" style="background:none;border:1px solid var(--border);border-radius:6px;padding:2px 8px;cursor:pointer;color:var(--text-muted);font-size:12px">‹</button>`:'<span style="width:26px"></span>';
        const next=pg<totalPgs?`<button onclick="colPg('${st.key}',${pg+1})" style="background:none;border:1px solid var(--border);border-radius:6px;padding:2px 8px;cursor:pointer;color:var(--text-muted);font-size:12px">›</button>`:'<span style="width:26px"></span>';
        pagHtml=`<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
          ${prev}<span style="font-size:11px;color:var(--text-muted)">${pg}/${totalPgs}</span>${next}
        </div>`;
      }

      return `<div style="flex:1 1 280px;min-width:260px;max-width:100%">
        <div style="background:${st.color}22;border:1px solid ${st.color}44;border-radius:12px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>${st.icon}</span>
          <span style="font-size:13px;font-weight:700;color:${st.color}">${st.key}</span>
          <span style="margin-left:auto;background:${st.color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px">${all.length}</span>
        </div>
        ${cards}${pagHtml}
      </div>`;
    }).join('');

    return `<div style="display:flex;flex-wrap:wrap;gap:16px;padding-bottom:12px;align-items:flex-start">${cols}</div>`;
  }

  window.colPg=function(stage,page){ colPage[stage]=page; renderJobs(); };

  // ─── LISTA ───────────────────────────────────────────────────────────────────

  let _listPage=1;
  function renderJobs() {
    const q=jobSearch.toLowerCase();
    const filtered=allJobs.filter(j=>`${j.nombre_proyecto} ${j.cliente_nombre} ${j.id}`.toLowerCase().includes(q));
    const container=document.getElementById('job-cards');
    if (!container) return;

    if (jobViewMode==='kanban') {
      // Reset col pages on new search
      container.innerHTML=renderKanban(filtered);
      document.getElementById('job-pagination').innerHTML='';
      return;
    }

    // List view with single pagination
    const perPage=12;
    const totalPgs=Math.max(1,Math.ceil(filtered.length/perPage));
    _listPage=Math.min(_listPage,totalPgs);
    const items=filtered.slice((_listPage-1)*perPage,_listPage*perPage);

    if (!items.length) { container.innerHTML='<div class="empty-state"><div class="empty-state-icon">📋</div>Sin trabajos</div>'; document.getElementById('job-pagination').innerHTML=''; return; }

    container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
    ${items.map(j=>{
      const total=parseInt(j.camas_total)||0,done=parseInt(j.camas_done)||0,pct=total>0?Math.round(done/total*100):null;
      const fallo=j.fallo?'<span class="badge badge-low" style="margin-left:4px">Falló</span>':'';
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:all .2s" onclick="jobView(${j.id})" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="font-weight:700;font-size:14px;flex:1">${j.nombre_proyecto||'Sin nombre'}${fallo}</div>${stageBadge(j.estado)}
        </div>
        <div style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between"><span>👥 ${j.cliente_nombre||'—'}</span><span>📅 ${j.fecha?j.fecha.substring(0,10):'-'}</span></div>
        <div style="font-size:16px;font-weight:800;color:var(--accent-light)">${fmtMoney(j.precio_final)}</div>
        ${pct!==null?`<div><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:3px"><span>Camas ${done}/${total}</span><span>${pct}%</span></div><div style="height:5px;background:var(--border);border-radius:3px"><div style="height:100%;background:var(--accent);border-radius:3px;width:${pct}%"></div></div></div>`:''}
        <div style="display:flex;gap:6px;margin-top:2px" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="jobView(${j.id})">👁️ Ver</button>
          <button class="btn btn-secondary btn-sm" style="padding:4px 8px" onclick="jobOpenForm(${j.id})">✏️</button>
          <button class="btn btn-danger btn-sm" style="padding:4px 8px" onclick="jobDelete(${j.id})">🗑️ Eliminar</button>
        </div>
      </div>`;
    }).join('')}</div>`;

    // Pagination
    const pg=document.getElementById('job-pagination'); pg.innerHTML='';
    if (totalPgs>1) {
      const mk=(l,p,d,a)=>{const b=document.createElement('button');b.className='page-btn'+(a?' active':'');b.textContent=l;b.disabled=d;if(!d)b.addEventListener('click',()=>{_listPage=p;renderJobs();});pg.appendChild(b);};
      mk('‹',_listPage-1,_listPage===1,false);
      for(let i=1;i<=totalPgs;i++){if(totalPgs>7&&i>2&&i<totalPgs-1&&Math.abs(i-_listPage)>1){if(i===3||i===totalPgs-2){const s=document.createElement('span');s.className='page-info';s.textContent='…';pg.appendChild(s);}continue;}mk(String(i),i,false,i===_listPage);}
      mk('›',_listPage+1,_listPage===totalPgs,false);
    }
  }

  window.jobSearch2=function(q){ jobSearch=q; Object.keys(colPage).forEach(k=>colPage[k]=1); _listPage=1; renderJobs(); };

  // ─── VIEW MODAL ──────────────────────────────────────────────────────────────

  window.jobView=async function(id) {
    try {
      const j=await api('GET',`/api/jobs/${id}`);
      const idx=stageIndex(j.estado);
      const clienteName=allClients.find(c=>c.id===j.cliente_id)?.nombre||'-';
      const printerName=allPrinters.find(p=>p.id===j.impresora_id)?.nombre||'-';
      const lev=parseLev(j.levantamiento_datos);
      openModal(`#${j.id} — ${j.nombre_proyecto||'Sin nombre'} ${stageBadge(j.estado)}`, buildJobViewHtml(j,idx,clienteName,printerName,lev));
    } catch(e) { showToast('Error: '+e.message,'error'); }
  };

  function buildJobViewHtml(j,idx,clienteName,printerName,lev) {
    const camas=j.camas||[];
    const _canalIcons={'Shopify':'🛍️','Mercado Libre':'🟡','Etsy':'🧡','Amazon':'📦','WhatsApp':'💬','Facebook':'👤','Instagram':'📸','Presencial':'🏪','WooCommerce':'🛒','Wix':'🌐','Otro':'🔗'};
    let html=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <div style="font-size:13px">👥 <strong>${clienteName}</strong></div>
      <div style="font-size:12px;color:var(--text-muted)">📅 ${j.fecha?j.fecha.substring(0,10):'-'}</div>
      ${j.tipo_precio?tierBadge(j.tipo_precio):''}
      ${j.canal_venta?`<div style="font-size:11px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:2px 8px">${_canalIcons[j.canal_venta]||'🔗'} ${j.canal_venta}</div>`:''}
      ${j.orden_id?`<div style="font-size:11px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:20px;padding:2px 8px;color:var(--accent-light)"># ${j.orden_id}</div>`:''}
      ${j.impresora_id?`<div style="font-size:11px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:2px 8px">🖨️ ${printerName}</div>`:''}
    </div>
    ${j.descripcion?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">${j.descripcion}</div>`:''}`;

    if (idx>=1) {
      const fils=(lev.filamentos||j.filaments||[]).filter(f=>(f.gramos||f.gramos_pieza||0)>0);
      if (fils.length) {
        html+=`<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">🧵 FILAMENTOS</div>
          <div style="display:flex;flex-wrap:wrap;gap:14px">
            ${fils.map(f=>{
              const g=f.gramos||f.gramos_pieza||0;
              const inv=allFilaments.find(af=>af.id===(f.fil_id||f.filamento_id));
              const stock=inv?inv.peso_actual_g:null;
              const warn=stock!==null&&stock<g;
              return `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;min-width:72px">
                ${spoolCard(f,62)}
                <div style="font-size:10px;font-weight:700;text-align:center;max-width:80px;line-height:1.3">${filName(f)}</div>
                <div style="font-size:11px;color:var(--accent);font-weight:700">${fmtNum(g,1)}g</div>
                ${warn?`<div style="font-size:9px;background:#ef444422;color:#ef4444;border-radius:4px;padding:1px 5px">⚠️ Stock: ${fmtNum(stock,0)}g</div>`
                     :(stock!==null?`<div style="font-size:9px;color:var(--text-muted)">✓ ${fmtNum(stock,0)}g</div>`:'')}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }

      const hImp=lev.tiempo_h!==undefined?(parseFloat(lev.tiempo_h||0)+parseFloat(lev.tiempo_m||0)/60):(j.tiempo_impresion_min||0)/60;
      const hMO=lev.mo_h!==undefined?(parseFloat(lev.mo_h||0)+parseFloat(lev.mo_m||0)/60):0;
      html+=`<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">📐 LEVANTAMIENTO</div>
        <div class="cost-breakdown">
          ${printerName!=='-'?`<div class="cost-row"><span>🖨️ Impresora</span><strong>${printerName}</strong></div>`:''}
          ${hImp>0?`<div class="cost-row"><span>⏱️ Tiempo impresión</span><strong>${fmtH(hImp)}</strong></div>`:''}
          ${hMO>0?`<div class="cost-row"><span>👷 Mano de obra</span><strong>${fmtH(hMO)}</strong></div>`:''}
          ${j.precio_final?`<div class="cost-row total"><span>Precio final · ${j.tipo_precio||''}</span><strong>${fmtMoney(j.precio_final)}</strong></div>`:''}
        </div>
      </div>
      ${j.notas?`<div class="alert alert-info" style="margin-bottom:12px">${j.notas}</div>`:''}`;
    }

    if (camas.length>0) {
      const done=camas.filter(c=>c.completada).length, pct=Math.round(done/camas.length*100);
      html+=`<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px" id="job-camas-box">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">🛏️ CAMAS (${done}/${camas.length})</div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px"><span>${pct}% completado</span><span>${done}/${camas.length}</span></div>
          <div style="height:8px;background:var(--border);border-radius:4px"><div id="job-camas-bar" style="height:100%;background:var(--accent);border-radius:4px;width:${pct}%;transition:width .4s"></div></div>
        </div>
        <div id="job-camas-list">
          ${camasListHtml(camas, j.id, idx)}
        </div>
        ${idx>=2?'<div style="font-size:10px;color:var(--text-muted);margin-top:8px;text-align:center">Toca una cama para marcarla completa</div>':''}
      </div>`;
    }

    if (idx>=2&&j.notas_produccion) html+=`<div class="alert alert-warning" style="margin-bottom:12px">${j.notas_produccion}</div>`;

    if (idx>=3) {
      const prods=(j.products||[]).map(p=>`<div class="cost-row"><span>${p.descripcion||'-'}</span><strong>×${p.cantidad}</strong></div>`).join('');
      const exts=(j.extras||[]).map(x=>`<div class="cost-row"><span>${x.nombre_extra||'-'} ×${x.cantidad}</span><strong>${fmtMoney(x.costo_total)}</strong></div>`).join('');
      if (prods||exts) html+=`<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">✅ CIERRE</div>
        ${prods?`<div class="cost-breakdown">${prods}</div>`:''}
        ${exts?`<div class="cost-breakdown" style="margin-top:8px">${exts}</div>`:''}
      </div>`;
      if (j.requiere_factura) html+=`<div class="alert alert-warning">⚠️ Requiere factura</div>`;
    }

    const nextStage=STAGES[idx].next;
    const allCamasDone=camas.length>0&&camas.every(c=>c.completada);

    let advanceBtn='';
    if (nextStage==='Levantamiento') advanceBtn=`<button class="btn btn-primary" onclick="closeModal();jobGoToLevantamiento(${j.id})">📐 Levantamiento →</button>`;
    else if (nextStage==='Producción') advanceBtn=`<button class="btn btn-primary" onclick="closeModal();jobJustAdvance(${j.id},'Producción')">🖨️ Pasar a Producción</button>`;
    else if (nextStage==='Cierre') advanceBtn=`<button id="view-cerrar-btn" class="btn btn-success" onclick="jobJustAdvance(${j.id},'Cierre')" ${allCamasDone?'':'style="display:none"'}>✅ Cerrar trabajo</button>`;

    return `${html}<div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal();jobOpenForm(${j.id})">✏️ Editar</button>
      ${advanceBtn}
      <button class="btn btn-danger" onclick="jobDelete(${j.id})">🗑️ Eliminar</button>
    </div>`;
  }

  function camasListHtml(camas, jobId, idx) {
    return camas.map(c=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);${idx>=2?'cursor:pointer':''}"
        ${idx>=2?`onclick="jobToggleCama(${jobId},${c.id})"`:''}>
        <span style="font-size:20px;transition:opacity .2s">${c.completada?'✅':'⬜'}</span>
        <span style="flex:1;font-size:13px;transition:all .2s;${c.completada?'text-decoration:line-through;opacity:0.45':''}">Cama ${c.numero}</span>
        ${c.completada_at?`<span style="font-size:10px;color:var(--text-muted)">${c.completada_at}</span>`:''}
      </div>`).join('');
  }

  // Toggle cama WITHOUT closing/reopening the modal — update in place
  window.jobToggleCama=async function(jobId, camaId) {
    try {
      const result=await api('PATCH',`/api/jobs/${jobId}/camas/${camaId}`,{});
      // Re-fetch camas only and update the DOM in place
      const j=await api('GET',`/api/jobs/${jobId}`);
      const camas=j.camas||[];
      const done=camas.filter(c=>c.completada).length;
      const pct=Math.round(done/camas.length*100);
      // Update bar
      const bar=document.getElementById('job-camas-bar');
      if (bar) bar.style.width=pct+'%';
      // Update list
      const listEl=document.getElementById('job-camas-list');
      if (listEl) listEl.innerHTML=camasListHtml(camas,jobId,stageIndex(j.estado));
      // Update header text
      const box=document.getElementById('job-camas-box');
      if (box) { const h=box.querySelector('div');if(h)h.querySelector('div').textContent=`🛏️ CAMAS (${done}/${camas.length})`; }
      // Show/hide "Cerrar trabajo" based on all camas done (edit form or view modal)
      const allDone=camas.length>0&&camas.every(c=>c.completada);
      const cerrarBtn=document.getElementById('prod-cerrar-btn');
      if (cerrarBtn) cerrarBtn.style.display=allDone?'':'none';
      const viewCerrarBtn=document.getElementById('view-cerrar-btn');
      if (viewCerrarBtn) viewCerrarBtn.style.display=allDone?'':'none';
      // Refresh background list (tablero) silently
      api('GET','/api/jobs').then(jobs=>{ allJobs=jobs; renderJobs(); }).catch(()=>{});
    } catch(e) { showToast('Error: '+e.message,'error'); }
  };

  window.jobGoToLevantamiento=async function(id){ try { await api('PUT',`/api/jobs/${id}`,{estado:'Levantamiento'}); await jobOpenForm(id); } catch(e){showToast('Error: '+e.message,'error');} };
  window.jobJustAdvance=async function(id,stage){ try { await api('PUT',`/api/jobs/${id}`,{estado:stage}); showToast(`Avanzado a ${stage}`); await refreshJobs(); } catch(e){showToast('Error: '+e.message,'error');} };

  // ─── SOLICITUD ───────────────────────────────────────────────────────────────

  const CANALES_VENTA = ['Presencial','WhatsApp','Shopify','Mercado Libre','Etsy','Amazon','Wix','WooCommerce','Facebook','Instagram','Otro'];

  function renderSolicitudFields(j) {
    const co=allClients.map(c=>`<option value="${c.id}" ${j.cliente_id==c.id?'selected':''}>${c.nombre}</option>`).join('');
    const canales=CANALES_VENTA.map(c=>`<option value="${c}" ${j.canal_venta===c?'selected':''}>${c}</option>`).join('');
    const isOnline=j.canal_venta&&j.canal_venta!=='Presencial'&&j.canal_venta!=='WhatsApp';
    return `<div style="font-weight:700;color:var(--accent-light);margin-bottom:12px">📥 Solicitud</div>
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group form-full"><label>Nombre del proyecto *</label><input class="form-control" name="nombre_proyecto" value="${j.nombre_proyecto||''}" required autocomplete="off"></div>
        <div class="form-group"><label>Cliente</label><select class="form-control" name="cliente_id"><option value="">— Sin cliente —</option>${co}</select></div>
        <div class="form-group"><label>Fecha</label><input class="form-control" name="fecha" type="date" value="${j.fecha?j.fecha.substring(0,10):new Date().toISOString().substring(0,10)}" autocomplete="off"></div>
        <div class="form-group">
          <label>Canal de venta</label>
          <select class="form-control" name="canal_venta" id="sol-canal" onchange="jobCanalChange()">
            <option value="">— Sin canal —</option>${canales}
          </select>
        </div>
        <div class="form-group" id="sol-orden-wrap" style="${isOnline?'':'display:none'}">
          <label>ID / Nº de orden</label>
          <input class="form-control" name="orden_id" value="${j.orden_id||''}" placeholder="Ej: #1234, MLA12345..." autocomplete="off">
        </div>
        <div class="form-group form-full"><label>Descripción</label><textarea class="form-control" name="descripcion" rows="2" autocomplete="off">${j.descripcion||''}</textarea></div>
      </div>`;
  }

  window.jobCanalChange=function(){
    const v=document.getElementById('sol-canal')?.value||'';
    const w=document.getElementById('sol-orden-wrap');
    if(w) w.style.display=(v&&v!=='Presencial'&&v!=='WhatsApp')?'':'none';
  };

  // ─── LEVANTAMIENTO ───────────────────────────────────────────────────────────

  let _jlevFilCount=0;

  function jlevFilRowHtml(i,selId,grams) {
    const opts=allFilaments.map(f=>`<option value="${f.id}" ${f.id==selId?'selected':''}>${f.marca||''} ${f.nombre_comercial||''} — ${f.material} ${f.color}</option>`).join('');
    const fil=selId?allFilaments.find(f=>f.id==selId):null;
    const stock=fil?fil.peso_actual_g:null;
    const warn=stock!==null&&parseFloat(grams)>0&&stock<parseFloat(grams);
    const spool=fil?spoolCard({...fil},48):`<div style="width:48px;height:48px;border-radius:50%;background:var(--border);border:2px solid var(--border)"></div>`;
    return `<div id="jlev-fil-${i}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div id="jlev-spool-${i}" style="flex-shrink:0">${spool}</div>
        <div style="flex:1;min-width:120px">
          <select class="form-control" id="jlev-fil-sel-${i}" onchange="jlevFilChange(${i})" style="margin-bottom:6px">
            <option value="">— Seleccionar filamento —</option>${opts}
          </select>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="form-control" id="jlev-fil-g-${i}" type="number" step="any" value="${grams||''}" placeholder="gramos" style="flex:1" oninput="jlevRecalc()">
            <span style="font-size:12px;color:var(--text-muted)">g</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <button type="button" class="btn btn-danger btn-sm" onclick="jlevRemFil(${i})" style="padding:3px 7px">✕</button>
          <div id="jlev-stock-${i}" style="font-size:10px;${warn?'color:#ef4444':'color:var(--text-muted)'}">
            ${stock!==null?(warn?`⚠️ Stock: ${fmtNum(stock,0)}g`:`✓ ${fmtNum(stock,0)}g`):''}
          </div>
        </div>
      </div>
    </div>`;
  }

  window.jlevFilChange=function(i){
    const sel=document.getElementById(`jlev-fil-sel-${i}`);
    const fil=sel?.value?allFilaments.find(f=>f.id==sel.value):null;
    const spEl=document.getElementById(`jlev-spool-${i}`);
    if(spEl) spEl.innerHTML=fil?spoolCard({...fil},48):`<div style="width:48px;height:48px;border-radius:50%;background:var(--border);border:2px solid var(--border)"></div>`;
    jlevRecalc();
    const gEl=document.getElementById(`jlev-fil-g-${i}`),stock=fil?fil.peso_actual_g:null,g=parseFloat(gEl?.value)||0;
    const stEl=document.getElementById(`jlev-stock-${i}`);
    if(stEl){const w=stock!==null&&g>0&&stock<g;stEl.style.color=w?'#ef4444':'var(--text-muted)';stEl.textContent=stock!==null?(w?`⚠️ Stock: ${fmtNum(stock,0)}g`:`✓ ${fmtNum(stock,0)}g`):'';}
  };
  window.jlevAddFil=function(){ const l=document.getElementById('jlev-fils');if(!l)return;const w=document.createElement('div');w.innerHTML=jlevFilRowHtml(_jlevFilCount,null,'');l.appendChild(w.firstChild);_jlevFilCount++; };
  window.jlevRemFil=function(i){ document.getElementById(`jlev-fil-${i}`)?.remove(); jlevRecalc(); };

  window.jlevRecalc=function(){
    const prSel=document.getElementById('jlev-printer-sel');
    const pr=prSel?.value?allPrinters.find(p=>p.id==prSel.value):null;
    const hImp=(parseFloat(document.getElementById('jlev-h')?.value)||0)+(parseFloat(document.getElementById('jlev-m')?.value)||0)/60;
    const hMO=(parseFloat(document.getElementById('jlev-mo-h')?.value)||0)+(parseFloat(document.getElementById('jlev-mo-m')?.value)||0)/60;
    let cFil=0;
    for(let i=0;i<_jlevFilCount;i++){
      const sel=document.getElementById(`jlev-fil-sel-${i}`),gEl=document.getElementById(`jlev-fil-g-${i}`);
      if(!sel?.value||!gEl)continue;
      const fil=allFilaments.find(f=>f.id==sel.value),g=parseFloat(gEl.value)||0;
      if(fil) cFil+=g*(fil.costo_por_gramo||0);
      const stEl=document.getElementById(`jlev-stock-${i}`);
      if(stEl&&fil){const w=fil.peso_actual_g<g&&g>0;stEl.style.color=w?'#ef4444':'var(--text-muted)';stEl.textContent=w?`⚠️ Stock: ${fmtNum(fil.peso_actual_g,0)}g`:`✓ ${fmtNum(fil.peso_actual_g,0)}g`;}
    }
    const kwh=pr?((pr.consumo_promedio_watts||0)/1000)*hImp:0;
    const cLuz=kwh*(parseFloat(_appCfg.costo_kwh)||0.18), cMaq=pr?hImp*(pr.costo_por_hora||0):0;
    const cEmb=parseFloat(document.getElementById('jlev-embalaje')?.value)||0;
    const cMO=hMO*(parseFloat(_appCfg.tarifa_hora)||25);
    const cBase=cFil+cLuz+cMaq+cMO+cEmb;
    const t={mu:parseFloat(_appCfg.margen_unitario)||2.2,mm:parseFloat(_appCfg.margen_menudeo)||1.9,mmay:parseFloat(_appCfg.margen_mayoreo)||1.5};
    const tier=document.getElementById('jlev-tier')?.value||'menudeo';
    const margin=tier==='unitario'?t.mu:tier==='mayoreo'?t.mmay:t.mm;
    const precio=cBase*margin;
    const s=id=>document.getElementById(id);
    if(s('js-fil'))  s('js-fil').textContent=fmtMoney(cFil);
    if(s('js-luz'))  s('js-luz').textContent=fmtMoney(cLuz);
    if(s('js-maq'))  s('js-maq').textContent=fmtMoney(cMaq);
    if(s('js-mo'))   s('js-mo').textContent=fmtMoney(cMO);
    if(s('js-emb'))  s('js-emb').textContent=fmtMoney(cEmb);
    if(s('js-base')) s('js-base').textContent=fmtMoney(cBase);
    if(s('js-prec')) s('js-prec').textContent=fmtMoney(precio);
    const pf=document.getElementById('jlev-precio-final');
    if(pf&&!pf.dataset.manual) pf.value=precio.toFixed(2);
  };

  function renderLevantamientoFields(j) {
    const lev=parseLev(j.levantamiento_datos);
    const prOpts=allPrinters.map(p=>`<option value="${p.id}" ${(lev.printer_id?lev.printer_id==p.id:j.impresora_id==p.id)?'selected':''}>${p.nombre}</option>`).join('');
    const fils=(lev.filamentos?.length?lev.filamentos:(j.filaments||[]));
    _jlevFilCount=Math.max(fils.length,1);
    const filRows=Array.from({length:_jlevFilCount},(_,i)=>{const f=fils[i]||{};return jlevFilRowHtml(i,f.fil_id||f.filamento_id,f.gramos||f.gramos_pieza||'');}).join('');
    const hImp=lev.tiempo_h!==undefined?lev.tiempo_h:Math.floor((j.tiempo_impresion_min||0)/60);
    const mImp=lev.tiempo_m!==undefined?lev.tiempo_m:(j.tiempo_impresion_min||0)%60;
    const hMO=lev.mo_h!==undefined?lev.mo_h:Math.floor((j.tiempo_diseno_min||0)/60);
    const mMO=lev.mo_m!==undefined?lev.mo_m:(j.tiempo_diseno_min||0)%60;
    const tier=lev.tier||j.tipo_precio||'menudeo';
    const emb=lev.embalaje||'';
    const t={mu:parseFloat(_appCfg.margen_unitario)||2.2,mm:parseFloat(_appCfg.margen_menudeo)||1.9,mmay:parseFloat(_appCfg.margen_mayoreo)||1.5};
    const nCamas=(j.camas||[]).length||1;

    return `<div style="font-weight:700;color:var(--accent-light);margin:4px 0 16px;font-size:13px">📐 Levantamiento</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- COL 1 -->
      <div>
        <div class="form-group" style="margin-bottom:14px">
          <label>🖨️ Impresora *</label>
          <select class="form-control" id="jlev-printer-sel" onchange="jlevRecalc()">
            <option value="">— Seleccionar impresora —</option>${prOpts}
          </select>
        </div>
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:8px">⏱️ Tiempos</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div class="form-group" style="margin:0"><label style="font-size:11px">Impresión h</label><input class="form-control" id="jlev-h" type="number" min="0" value="${hImp}" placeholder="0" oninput="jlevRecalc()"></div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">Impresión min</label><input class="form-control" id="jlev-m" type="number" min="0" max="59" value="${mImp}" placeholder="0" oninput="jlevRecalc()"></div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">Mano de obra h</label><input class="form-control" id="jlev-mo-h" type="number" min="0" value="${hMO}" placeholder="0" oninput="jlevRecalc()"></div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">Mano de obra min</label><input class="form-control" id="jlev-mo-m" type="number" min="0" max="59" value="${mMO}" placeholder="0" oninput="jlevRecalc()"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div class="form-group" style="margin:0"><label style="font-size:11px">📦 Embalaje ($)</label><input class="form-control" id="jlev-embalaje" type="number" step="any" value="${emb}" placeholder="0.00" oninput="jlevRecalc()"></div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">💰 Tier</label>
            <select class="form-control" id="jlev-tier" onchange="jlevRecalc()">
              <option value="unitario" ${tier==='unitario'?'selected':''}>Unitario ×${t.mu}</option>
              <option value="menudeo" ${tier==='menudeo'||!tier?'selected':''}>Menudeo ×${t.mm}</option>
              <option value="mayoreo" ${tier==='mayoreo'?'selected':''}>Mayoreo ×${t.mmay}</option>
            </select>
          </div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">💵 Precio final ($)</label>
            <input class="form-control" id="jlev-precio-final" name="precio_final" type="number" step="any" value="${j.precio_final||''}" placeholder="0.00" oninput="this.dataset.manual='1'">
          </div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">🛏️ Núm. de camas</label>
            <input class="form-control" id="jlev-n-camas" type="number" min="1" value="${nCamas}">
          </div>
        </div>
        <div style="background:var(--surface);border-radius:10px;padding:12px;font-size:12px;margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Desglose</div>
          <div class="cost-row"><span>Filamentos</span><strong id="js-fil">$0.00</strong></div>
          <div class="cost-row"><span>Electricidad</span><strong id="js-luz">$0.00</strong></div>
          <div class="cost-row"><span>Depreciación</span><strong id="js-maq">$0.00</strong></div>
          <div class="cost-row"><span>Mano de obra</span><strong id="js-mo">$0.00</strong></div>
          <div class="cost-row"><span>Embalaje</span><strong id="js-emb">$0.00</strong></div>
          <div class="cost-row" style="border-top:1px solid var(--border);padding-top:5px;margin-top:3px"><span>Costo base</span><strong id="js-base">$0.00</strong></div>
          <div class="cost-row total"><span>Precio sugerido</span><strong id="js-prec" style="color:var(--accent)">$0.00</strong></div>
        </div>
        <div class="form-group"><label style="font-size:11px">📝 Notas</label><textarea class="form-control" name="notas" rows="2" autocomplete="off">${j.notas||''}</textarea></div>
      </div>
      <!-- COL 2: Filamentos -->
      <div>
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:10px">🧵 Filamentos</div>
        <div id="jlev-fils">${filRows}</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="jlevAddFil()" style="width:100%;margin-top:4px">＋ Agregar filamento</button>
      </div>
    </div>`;
  }

  // ─── PRODUCCIÓN ──────────────────────────────────────────────────────────────

  function renderProduccionFields(j) {
    const lev=parseLev(j.levantamiento_datos);
    const prOpts=allPrinters.map(p=>`<option value="${p.id}" ${(lev.printer_id?lev.printer_id==p.id:j.impresora_id==p.id)?'selected':''}>${p.nombre}</option>`).join('');
    const camas=j.camas||[];
    const done=camas.filter(c=>c.completada).length;
    const pct=camas.length?Math.round(done/camas.length*100):0;

    // Stock info from levantamiento filaments
    const fils=(lev.filamentos||j.filaments||[]).filter(f=>(f.gramos||f.gramos_pieza||0)>0);
    const stockInfo=fils.length?`<div style="background:var(--surface);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">🧵 Stock de filamentos</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${fils.map(f=>{
          const g=f.gramos||f.gramos_pieza||0;
          const inv=allFilaments.find(af=>af.id===(f.fil_id||f.filamento_id));
          const stock=inv?inv.peso_actual_g:null;
          const warn=stock!==null&&stock<g;
          return `<div style="display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid ${warn?'#ef4444':'var(--border)'};border-radius:8px;padding:6px 10px">
            ${spoolCard(f,32)}
            <div>
              <div style="font-size:11px;font-weight:700">${fmtNum(g,1)}g necesarios</div>
              ${stock!==null?`<div style="font-size:10px;${warn?'color:#ef4444;font-weight:700':'color:var(--text-muted)'}">${warn?'⚠️':'✓'} Stock: ${fmtNum(stock,0)}g</div>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:'';

    return `<div style="font-weight:700;color:var(--accent-light);margin:4px 0 12px">🖨️ Producción</div>
      ${stockInfo}
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group"><label>🖨️ Impresora</label>
          <select class="form-control" name="impresora_id"><option value="">— Sin impresora —</option>${prOpts}</select>
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <label><input type="checkbox" name="fallo" value="1" ${j.fallo?'checked':''} autocomplete="off"> ⚠️ Trabajo fallido</label>
        </div>
        <div class="form-group form-full"><label>📝 Notas de producción</label>
          <textarea class="form-control" name="notas_produccion" rows="2" autocomplete="off">${j.notas_produccion||''}</textarea>
        </div>
      </div>
      <!-- Camas editables -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase">🛏️ Camas de impresión</div>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:11px;color:var(--text-muted)">Total camas:</label>
          <input type="number" min="1" id="prod-n-camas" value="${camas.length||1}" data-orig="${camas.length||1}" style="width:60px" class="form-control">
        </div>
      </div>
      ${camas.length?`
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px"><span>${pct}%</span><span>${done}/${camas.length}</span></div>
          <div style="height:8px;background:var(--border);border-radius:4px"><div style="height:100%;background:var(--accent);border-radius:4px;width:${pct}%;transition:width .3s"></div></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Toca una cama para marcarla completa</div>
        ${camas.map(c=>`<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer" onclick="jobToggleCama(${j.id},${c.id})">
          <span style="font-size:22px">${c.completada?'✅':'⬜'}</span>
          <span style="flex:1;font-size:13px;${c.completada?'text-decoration:line-through;opacity:0.5':''}">Cama ${c.numero}</span>
          <span style="font-size:11px;font-weight:700;color:var(--accent)">${Math.round(100/camas.length)}%</span>
          ${c.completada_at?`<span style="font-size:10px;color:var(--text-muted)">${c.completada_at}</span>`:''}
        </div>`).join('')}
      `:`<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Guarda para generar las camas</div>`}`;
  }

  // ─── CIERRE ──────────────────────────────────────────────────────────────────

  function renderCierreFields(j) {
    const prods=(j.products||[]).map(p=>`<div class="extra-item"><input class="form-control" name="prod_desc[]" value="${p.descripcion||''}" placeholder="Descripción" style="flex:2" autocomplete="off"><input class="form-control" name="prod_qty[]" type="number" min="1" value="${p.cantidad||1}" style="width:70px" autocomplete="off"><button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button></div>`).join('');
    const exts=(j.extras||[]).map(x=>`<div class="extra-item"><input class="form-control" name="extra_nombre[]" value="${x.nombre_extra||''}" placeholder="Nombre" style="flex:2" autocomplete="off"><input class="form-control" name="extra_qty[]" type="number" value="${x.cantidad||1}" style="width:60px" autocomplete="off"><input class="form-control" name="extra_costo[]" type="number" step="any" value="${x.costo_unitario||''}" placeholder="$/u" style="width:80px" autocomplete="off"><button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button></div>`).join('');
    return `<div style="font-weight:700;color:var(--accent-light);margin:4px 0 12px">✅ Cierre</div>
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group"><label>Preparación</label><input class="form-control" name="tiempo_preparacion" placeholder="0:30h" value="${j.tiempo_preparacion_min?formatTime(j.tiempo_preparacion_min):''}" autocomplete="off"></div>
        <div class="form-group"><label>Postproceso</label><input class="form-control" name="tiempo_postproceso" placeholder="0:15h" value="${j.tiempo_postproceso_min?formatTime(j.tiempo_postproceso_min):''}" autocomplete="off"></div>
      </div>
      <div style="font-weight:600;color:var(--accent-light);margin-bottom:6px">Productos</div>
      <div id="products-list" style="margin-bottom:6px">${prods}</div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddProduct()" style="margin-bottom:14px">＋ Producto</button>
      <div style="font-weight:600;color:var(--accent-light);margin-bottom:6px">Extras</div>
      <div id="extras-list" style="margin-bottom:6px">${exts}</div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddExtra()" style="margin-bottom:14px">＋ Extra</button>
      <div class="form-group"><label><input type="checkbox" name="requiere_factura" value="1" ${j.requiere_factura?'checked':''} autocomplete="off"> Requiere factura</label></div>`;
  }

  // ─── OPEN FORM ───────────────────────────────────────────────────────────────

  window.jobOpenForm=async function(id,calcPrefill){
    let j={};
    if(id){try{j=await api('GET',`/api/jobs/${id}`);}catch(e){}}
    if(calcPrefill&&!id) j.precio_final=calcPrefill.precio_final;
    const idx=id?stageIndex(j.estado):0;
    let bodyHtml,buttonsHtml,title;

    if(!id){
      title='Nuevo Trabajo';
      bodyHtml=renderSolicitudFields(j);
      buttonsHtml=`<button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button><button type="button" class="btn btn-primary" onclick="jobSave(null)">Guardar</button>`;
    } else {
      const stage=STAGES[idx];
      title=`#${id} — ${j.nombre_proyecto||'Trabajo'} · ${stage.label}`;
      if(stage.key==='Solicitud'){
        bodyHtml=renderSolicitudFields(j);
        buttonsHtml=`<button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button><button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button>`;
      } else if(stage.key==='Levantamiento'){
        bodyHtml=renderSolicitudFields(j)+renderLevantamientoFields(j);
        buttonsHtml=`<button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button><button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button><button type="button" class="btn btn-success" onclick="jobSave(${id},'Producción')">🖨️ Guardar y pasar a Producción</button>`;
      } else if(stage.key==='Producción'){
        const camas=j.camas||[];
        const allDone=camas.length>0&&camas.every(c=>c.completada);
        bodyHtml=renderProduccionFields(j);
        buttonsHtml=`<button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button><button type="button" class="btn btn-primary" onclick="jobSaveInPlace(${id})">💾 Guardar</button>${allDone?`<button type="button" id="prod-cerrar-btn" class="btn btn-success" onclick="jobSave(${id},'Cierre')">✅ Cerrar trabajo</button>`:`<button type="button" id="prod-cerrar-btn" class="btn btn-success" onclick="jobSave(${id},'Cierre')" style="display:none">✅ Cerrar trabajo</button>`}`;
      } else {
        bodyHtml=renderSolicitudFields(j)+renderCierreFields(j);
        buttonsHtml=`<button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button><button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button>`;
      }
    }

    openModal(title,`<form id="job-form">${bodyHtml}<div class="form-actions">${buttonsHtml}</div></form>`);
    if(id&&STAGES[idx].key==='Levantamiento') setTimeout(jlevRecalc,80);
  };

  window.jobAddProduct=function(){const l=document.getElementById('products-list');if(!l)return;const r=document.createElement('div');r.className='extra-item';r.innerHTML=`<input class="form-control" name="prod_desc[]" placeholder="Descripción" style="flex:2" autocomplete="off"><input class="form-control" name="prod_qty[]" type="number" min="1" value="1" style="width:70px" autocomplete="off"><button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;l.appendChild(r);};
  window.jobAddExtra=function(){const l=document.getElementById('extras-list');if(!l)return;const r=document.createElement('div');r.className='extra-item';r.innerHTML=`<input class="form-control" name="extra_nombre[]" placeholder="Nombre" style="flex:2" autocomplete="off"><input class="form-control" name="extra_qty[]" type="number" value="1" style="width:60px" autocomplete="off"><input class="form-control" name="extra_costo[]" type="number" step="any" placeholder="$/u" style="width:80px" autocomplete="off"><button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;l.appendChild(r);};

  // ─── SAVE ────────────────────────────────────────────────────────────────────

  window.jobSave=async function(id,advanceTo){
    const form=document.getElementById('job-form');
    if(!form.checkValidity()){form.reportValidity();return;}

    const prSel=document.getElementById('jlev-printer-sel');
    if(prSel&&!prSel.value){showToast('Selecciona una impresora antes de guardar','error');prSel.focus();return;}

    const body={};
    const fd=new FormData(form);
    for(const[k,v]of fd.entries()){if(!k.endsWith('[]'))body[k]=v;}

    if(document.getElementById('products-list')){
      const ds=[...form.querySelectorAll('[name="prod_desc[]"]')].map(e=>e.value).filter(Boolean);
      const qs=[...form.querySelectorAll('[name="prod_qty[]"]')].map(e=>e.value);
      body.products=ds.map((d,i)=>({descripcion:d,cantidad:qs[i]||1}));
    }
    if(document.getElementById('extras-list')){
      const ns=[...form.querySelectorAll('[name="extra_nombre[]"]')].map(e=>e.value).filter(Boolean);
      const qs=[...form.querySelectorAll('[name="extra_qty[]"]')].map(e=>e.value);
      const cs=[...form.querySelectorAll('[name="extra_costo[]"]')].map(e=>e.value);
      body.extras=ns.map((n,i)=>({nombre_extra:n,cantidad:qs[i]||1,costo_unitario:cs[i]||0,costo_total:(parseFloat(qs[i])||1)*(parseFloat(cs[i])||0)}));
    }
    if('tiempo_preparacion'in body){body.tiempo_preparacion_min=parseTime(body.tiempo_preparacion);delete body.tiempo_preparacion;}
    if('tiempo_postproceso'in body){body.tiempo_postproceso_min=parseTime(body.tiempo_postproceso);delete body.tiempo_postproceso;}
    if(form.querySelector('[name=fallo]'))            body.fallo=form.querySelector('[name=fallo]').checked?1:0;
    if(form.querySelector('[name=requiere_factura]')) body.requiere_factura=form.querySelector('[name=requiere_factura]').checked?1:0;

    // Producción: allow changing N camas
    const prodNCamas=document.getElementById('prod-n-camas');
    if(prodNCamas){
      const n=parseInt(prodNCamas.value)||1;
      body.camas=Array.from({length:n},(_,i)=>({numero:i+1,descripcion:'',tiempo_min:0,completada:0}));
    }

    if(prSel){
      const prId=prSel.value||null;
      const hImp=parseFloat(document.getElementById('jlev-h')?.value)||0, mImp=parseFloat(document.getElementById('jlev-m')?.value)||0;
      const hMO=parseFloat(document.getElementById('jlev-mo-h')?.value)||0,  mMO=parseFloat(document.getElementById('jlev-mo-m')?.value)||0;
      const emb=parseFloat(document.getElementById('jlev-embalaje')?.value)||0;
      const tier=document.getElementById('jlev-tier')?.value||'menudeo';
      const nCamas=parseInt(document.getElementById('jlev-n-camas')?.value)||1;
      const pr=prId?allPrinters.find(p=>p.id==prId):null;
      const fils=[];
      for(let i=0;i<_jlevFilCount;i++){
        const sel=document.getElementById(`jlev-fil-sel-${i}`),gEl=document.getElementById(`jlev-fil-g-${i}`);
        if(!sel?.value)continue;
        const fil=allFilaments.find(f=>f.id==sel.value);
        fils.push({fil_id:parseInt(sel.value),filamento_id:parseInt(sel.value),gramos:parseFloat(gEl?.value)||0,gramos_pieza:parseFloat(gEl?.value)||0,
          nombre:fil?filName(fil):'',color:fil?.color||'',color_hex:fil?.color_hex||'',material:fil?.material||'',acabado:fil?.acabado||'',marca:fil?.marca||'',nombre_comercial:fil?.nombre_comercial||''});
      }
      body.filaments=fils.map(f=>({filamento_id:f.fil_id,gramos_pieza:f.gramos}));
      body.camas=Array.from({length:nCamas},(_,i)=>({numero:i+1,descripcion:'',tiempo_min:0,completada:0}));
      body.tiempo_impresion_min=Math.round(hImp*60+mImp);
      body.tiempo_diseno_min=Math.round(hMO*60+mMO);
      body.impresora_id=prId?parseInt(prId):null;
      body.tipo_precio=tier;
      const pfEl=document.getElementById('jlev-precio-final');
      if(pfEl?.value) body.precio_final=parseFloat(pfEl.value);
      body.levantamiento_datos={printer_id:prId?parseInt(prId):null,printer:pr?.nombre||'',tiempo_h:hImp,tiempo_m:mImp,mo_h:hMO,mo_m:mMO,embalaje:emb,tier,filamentos:fils};
    }

    if(advanceTo) body.estado=advanceTo;

    try{
      if(id) await api('PUT',`/api/jobs/${id}`,body);
      else   await api('POST','/api/jobs',body);
      closeModal();
      showToast(id?'Trabajo actualizado':'Trabajo creado');
      await refreshJobs();
    } catch(err){showToast('Error: '+err.message,'error');}
  };

  // Save production form without closing the modal
  window.jobSaveInPlace=async function(id){
    const form=document.getElementById('job-form');
    if(!form||!id) return;
    const notasProd=form.querySelector('[name="notas_produccion"]')?.value||'';
    const nCamas=parseInt(document.getElementById('prod-n-camas')?.value)||0;
    const body={notas_produccion:notasProd};
    // Only rebuild camas if user explicitly changed the count
    const origN=parseInt(document.getElementById('prod-n-camas')?.dataset.orig||0);
    if(nCamas>0&&nCamas!==origN){
      body.camas=Array.from({length:nCamas},(_,i)=>({numero:i+1,descripcion:'',tiempo_min:0,completada:0}));
    }
    try {
      await api('PUT',`/api/jobs/${id}`,body);
      showToast('Guardado');
      await refreshJobs();
      // Return to the view modal with updated data
      await jobView(id);
    } catch(err){showToast('Error: '+err.message,'error');}
  };

  window.jobDelete=function(id){
    const j=allJobs.find(x=>x.id===id);
    confirmModal(`¿Eliminar trabajo "${j?.nombre_proyecto||'#'+id}"?`,async()=>{
      try{await api('DELETE',`/api/jobs/${id}`);closeModal();showToast('Eliminado');await refreshJobs();}
      catch(err){showToast('Error: '+err.message,'error');}
    },'🗑️');
  };

  window.jobOpenFormWithPrice=function(c){jobOpenForm(null,c);};
  window.jobPDF=function(id,tipo){window.open(`/api/pdf/${id}?tipo=${tipo}`,'_blank');};
})();
