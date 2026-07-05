(function () {
  // ── State ────────────────────────────────────────────────────────────────────
  let _nfc = null;          // active NDEFReader instance
  let _scanning = false;
  let _onRead = null;       // callback set before each scan

  // ── NFC availability check ───────────────────────────────────────────────────
  function isSupported() { return 'NDEFReader' in window; }

  // ── Core: start a one-shot scan, call cb({ uid, records }) ──────────────────
  async function startScan(cb) {
    if (!isSupported()) throw new Error('Web NFC no disponible. Usa Chrome en Android.');
    if (_scanning && _nfc) { _nfc.onreading = null; _nfc.onreadingerror = null; }
    _nfc = new NDEFReader();
    _scanning = true;
    return new Promise((resolve, reject) => {
      _nfc.onreading = (e) => {
        _scanning = false;
        const uid = e.serialNumber || '';
        const records = e.message?.records || [];
        cb({ uid, records });
        resolve({ uid, records });
      };
      _nfc.onreadingerror = (e) => {
        _scanning = false;
        reject(new Error('Error leyendo etiqueta NFC'));
      };
      _nfc.scan().catch(err => { _scanning = false; reject(err); });
    });
  }

  async function writeTag(records) {
    if (!isSupported()) throw new Error('Web NFC no disponible. Usa Chrome en Android.');
    const writer = new NDEFReader();
    await writer.write({ records });
  }

  // ── Parse URL from NDEF records ──────────────────────────────────────────────
  function parseNfcUrl(records) {
    for (const r of records) {
      if (r.recordType === 'url' || r.recordType === 'absolute-url') {
        try { return new TextDecoder().decode(r.data); } catch {}
      }
      if (r.recordType === 'smart-poster') {
        // Try to decode inner URL
        try { return new TextDecoder().decode(r.data); } catch {}
      }
    }
    return null;
  }

  // ── Extract filament ID from our URL format (/nfc/:id) ──────────────────────
  function filIdFromUrl(url) {
    if (!url) return null;
    const m = url.match(/\/nfc\/(\d+)/);
    return m ? parseInt(m[1]) : null;
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────
  function nfcStatusHtml(state, msg) {
    const icons = { idle:'📡', scanning:'🔄', success:'✅', error:'❌', writing:'✍️' };
    const colors = { idle:'var(--text-muted)', scanning:'var(--accent)', success:'#10b981', error:'#ef4444', writing:'#f59e0b' };
    return `<div style="text-align:center;padding:20px 0">
      <div style="font-size:48px;margin-bottom:8px">${icons[state]||'📡'}</div>
      <div style="font-size:14px;color:${colors[state]||'var(--text-muted)'};font-weight:600">${msg}</div>
    </div>`;
  }

  // ── Modal: Registrar (write filament ID to tag) ──────────────────────────────
  window.nfcRegistrar = async function(filId, filNombre) {
    if (!isSupported()) { showToast('Web NFC solo funciona en Chrome para Android', 'error'); return; }

    const appUrl = `${location.origin}/nfc/${filId}`;
    let phase = 'confirm';

    function renderModal() {
      const body = document.getElementById('nfc-modal-body');
      if (!body) return;
      if (phase === 'confirm') {
        body.innerHTML = `
          <div style="margin-bottom:16px;background:var(--surface);border-radius:10px;padding:12px;font-size:13px">
            <div style="color:var(--text-muted);font-size:11px;margin-bottom:4px">Filamento</div>
            <strong>${filNombre}</strong>
            <div style="color:var(--text-muted);font-size:11px;margin-top:8px;margin-bottom:2px">URL que se grabará</div>
            <code style="font-size:10px;word-break:break-all;color:var(--accent)">${appUrl}</code>
          </div>
          ${nfcStatusHtml('idle','Acerca la etiqueta NFC al teléfono y presiona Escribir')}
          <div class="form-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" id="nfc-write-btn" onclick="nfcDoWrite(${filId},'${filNombre.replace(/'/g,"\\'")}')">📡 Escribir etiqueta</button>
          </div>`;
      }
    }

    openModal(`📡 Registrar NFC — ${filNombre}`,
      `<div id="nfc-modal-body"></div>`);
    renderModal();
  };

  window.nfcDoWrite = async function(filId, filNombre) {
    const body = document.getElementById('nfc-modal-body');
    if (!body) return;
    const appUrl = `${location.origin}/nfc/${filId}`;
    body.innerHTML = nfcStatusHtml('writing', 'Acerca la etiqueta ahora…') +
      `<div style="text-align:center;color:var(--text-muted);font-size:12px">Mantén el teléfono cerca de la etiqueta NFC</div>`;
    try {
      // Scan first to get UID, then write URL
      const scanPromise = new Promise((resolve, reject) => {
        const r = new NDEFReader();
        r.onreading = async (e) => {
          const uid = e.serialNumber || '';
          try {
            await writeTag([{ recordType: 'url', data: appUrl }]);
            resolve(uid);
          } catch(err) { reject(err); }
        };
        r.onreadingerror = () => reject(new Error('No se pudo leer la etiqueta'));
        r.scan().catch(reject);
      });

      const uid = await scanPromise;
      // Save UID to filament record
      await api('PUT', `/api/filaments/${filId}`, { tiene_nfc: 1, uid_nfc: uid });
      body.innerHTML = nfcStatusHtml('success', '¡Etiqueta grabada correctamente!') +
        `<div style="text-align:center;font-size:11px;color:var(--text-muted);margin-bottom:16px">UID: ${uid}</div>
        <div class="form-actions"><button class="btn btn-primary" onclick="closeModal();invLoad&&invLoad()">Listo</button></div>`;
      showToast('Etiqueta NFC registrada');
    } catch(err) {
      body.innerHTML = nfcStatusHtml('error', err.message || 'Error al escribir') +
        `<div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="nfcDoWrite(${filId},'${filNombre.replace(/'/g,"\\'")}')">🔄 Reintentar</button>
        </div>`;
    }
  };

  // ── Modal: Leer etiqueta (identify tag) ─────────────────────────────────────
  window.nfcLeer = async function() {
    if (!isSupported()) { showToast('Web NFC solo funciona en Chrome para Android', 'error'); return; }
    openModal('🔍 Leer etiqueta NFC',
      `<div id="nfc-modal-body">${nfcStatusHtml('scanning','Acerca una etiqueta NFC al teléfono…')}</div>`);
    try {
      const { uid, records } = await startScan(({ uid, records }) => {});
      const url = parseNfcUrl(records);
      const filId = filIdFromUrl(url);
      const body = document.getElementById('nfc-modal-body');
      if (!body) return;

      let filInfo = '';
      if (filId) {
        try {
          const fil = await api('GET', `/api/filaments/${filId}`);
          filInfo = `<div style="background:var(--surface);border-radius:10px;padding:12px;margin:12px 0;font-size:13px">
            <div style="color:var(--text-muted);font-size:11px;margin-bottom:4px">Filamento vinculado</div>
            <strong>${fil.marca||''} ${fil.nombre_comercial||''}</strong>
            <div style="color:var(--text-muted);font-size:11px;margin-top:4px">${fil.material||''} · ${fil.color||''} · ${fil.peso_actual_g||0}g disponibles</div>
          </div>`;
        } catch { filInfo = '<div style="color:#f59e0b;font-size:12px;margin:8px 0">Filamento no encontrado en la base de datos</div>'; }
      }

      body.innerHTML = nfcStatusHtml('success','¡Etiqueta leída!') +
        `<div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:-8px;margin-bottom:8px">UID: ${uid||'N/A'}</div>
        ${filInfo}
        ${url ? `<div style="font-size:11px;color:var(--text-muted);word-break:break-all;margin-bottom:12px">URL: ${url}</div>` : '<div style="color:var(--text-muted);font-size:12px;margin-bottom:12px">La etiqueta no tiene URL grabada</div>'}
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
          ${filId ? `<button class="btn btn-primary" onclick="closeModal();navigate('inventory')">Ver en inventario</button>` : ''}
        </div>`;
    } catch(err) {
      const body = document.getElementById('nfc-modal-body');
      if (body) body.innerHTML = nfcStatusHtml('error', err.message) +
        `<div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="nfcLeer()">🔄 Reintentar</button>
        </div>`;
    }
  };

  // ── Modal: Borrar etiqueta (clear NDEF) ──────────────────────────────────────
  window.nfcBorrar = async function(filId) {
    if (!isSupported()) { showToast('Web NFC solo funciona en Chrome para Android', 'error'); return; }
    openModal('🗑️ Borrar etiqueta NFC',
      `<div id="nfc-modal-body">
        ${nfcStatusHtml('idle','Esto borrará el contenido NDEF de la etiqueta')}
        <div style="text-align:center;color:var(--text-muted);font-size:12px;margin-bottom:16px">El filamento también quedará desvinculado del sistema</div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-danger" onclick="nfcDoBorrar(${filId||'null'})">🗑️ Acercar y borrar</button>
        </div>
      </div>`);
  };

  window.nfcDoBorrar = async function(filId) {
    const body = document.getElementById('nfc-modal-body');
    if (!body) return;
    body.innerHTML = nfcStatusHtml('writing','Acerca la etiqueta para borrarla…');
    try {
      await writeTag([]);
      if (filId) {
        await api('PUT', `/api/filaments/${filId}`, { tiene_nfc: 0, uid_nfc: '' });
      }
      body.innerHTML = nfcStatusHtml('success','Etiqueta borrada correctamente') +
        `<div class="form-actions"><button class="btn btn-primary" onclick="closeModal();invLoad&&invLoad()">Listo</button></div>`;
      showToast('Etiqueta NFC borrada');
    } catch(err) {
      body.innerHTML = nfcStatusHtml('error', err.message || 'Error al borrar') +
        `<div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-danger" onclick="nfcDoBorrar(${filId||'null'})">🔄 Reintentar</button>
        </div>`;
    }
  };

  // ── Passive scan: when app is open, auto-navigate on tag read ────────────────
  window.nfcStartPassive = async function() {
    if (!isSupported()) return;
    try {
      const reader = new NDEFReader();
      reader.onreading = (e) => {
        const url = parseNfcUrl(e.message?.records || []);
        const filId = filIdFromUrl(url);
        if (filId) {
          // Navigate to inventory and highlight the filament
          localStorage.setItem('mm_nfc_open', filId);
          if (window.navigate) navigate('inventory');
        }
      };
      await reader.scan();
    } catch { /* NFC permission denied or unavailable, fail silently */ }
  };

  // Start passive scan once app is loaded
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(nfcStartPassive, 2000);
  });

})();
