/* ==== CONFIG (ENDPOINTS) ==== */
const VALIDATE_URL = "https://primary-production-2aed.up.railway.app/webhook/validar-trabajador";
const WEBHOOK      = "https://primary-production-2aed.up.railway.app/webhook/fichaje-qr";

/* ==== KEYS LOCALSTORAGE ==== */
const LS_DATOS    = "sb_fq_datos";     // {nombre, uido}
const LS_FICHAJES = "sb_fq_fichajes";  // []
const LS_NOTA     = "sb_fq_nota";      // string
const LS_ULTIMO   = "sb_fq_ultimo";    // {tipo, fecha, hora, pendiente}

/* ==== HELPERS DOM / LS ==== */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);

const LS = {
  get(k, d=null){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
  del(k){ localStorage.removeItem(k); },
};

/* ==== FECHA/HORA ==== */
function ahoraISO(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,'0');
  return {
    iso: d.toISOString(),
    fecha: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    hora:  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    tz:    Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid",
  };
}

/* ==== NORMALIZADORES (alineados con n8n) ==== */
const normSpaces = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[\u000A\u000D\u2028\u2029]/g,'')
  .replace(/\s+/g,' ').trim().toUpperCase();

const normNoSpaces = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[\u000A\u000D\u2028\u2029]/g,'')
  .replace(/\s+/g,'').trim().toUpperCase();

/* ==== FICHAJES LOCALES ==== */
function loadFichajes(){ return LS.get(LS_FICHAJES, []); }
function saveFichajes(arr){ LS.set(LS_FICHAJES, arr); renderControl(arr); }

/* ==== RENDER CONTROL (solo trabajador activo) ==== */
function renderControl(items){
  const tbody = $('#tabla-control tbody');
  if(!tbody) return;

  const activo = LS.get(LS_DATOS, {nombre:'',uido:''});
  const propios = items.filter(it => it.nombre === activo?.nombre && it.uido === activo?.uido);

  tbody.innerHTML = "";
  propios.slice().reverse().forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.fecha || ""}</td>
      <td>${it.hora || ""}</td>
      <td>${(it.tipo||"").toUpperCase()}</td>
      <td>${it.nombre || ""}</td>
      <td>${it.uido || ""}</td>
      <td>${it.enviado ? "Sí" : "No"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==== API: VALIDACIÓN (POST FormData) ==== */
async function validarAcceso(nombre, uido){
  const fd = new FormData();
  fd.append("nombre", normSpaces(nombre));
  fd.append("uido",   normNoSpaces(uido));
  fd.append("origen", "PWA");

  const r = await fetch(VALIDATE_URL, { method: "POST", body: fd });
  if (!r.ok) return false;

  let j = {};
  try { j = await r.json(); } catch { j = {}; }

  // acepta varias formas: ok, found, encontrado
  return j.ok === true || j.found === true || j.encontrado === true;
}


/* ==== API: ENVIAR FICHAJE (POST FormData) ==== */
async function enviarFichaje({tipo, nombre, uido}){
  const t = ahoraISO();
  const fd = new FormData();
  fd.append('tipo',   (tipo || 'entrada').toString().toLowerCase());
  fd.append('nombre', normSpaces(nombre));
  fd.append('uido',   normNoSpaces(uido));
  fd.append('fecha_iso', t.iso);
  fd.append('fecha',     t.fecha);
  fd.append('hora',      t.hora);
  fd.append('tz',        t.tz);
  fd.append('origen',    'pwa-fichaje-qr');

  const r = await fetch(WEBHOOK, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`WEBHOOK HTTP ${r.status}`);

  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

/* ==== UTIL: último fichaje de un trabajador ==== */
function ultimoDelTrabajador(nombre, uido){
  const arr = loadFichajes();
  return arr.slice().reverse().find(it => it.nombre === nombre && it.uido === uido) || null;
}

/* ==== Sugerencia Entrada/Salida ==== */
function setTipoSugerido($tipo, nombre, uido){
  if(!$tipo) return;
  const last = ultimoDelTrabajador(nombre, uido);
  const sugerido = last?.tipo?.toLowerCase() === 'entrada' ? 'salida' : 'entrada';
  $tipo.value = (sugerido === 'salida') ? 'salida' : 'entrada';
}

/* ==== Reset total de dispositivo (solo datos de esta app) ==== */
async function resetDispositivo(){
  [LS_DATOS, LS_FICHAJES, LS_NOTA, LS_ULTIMO].forEach(LS.del);
  if (window.caches) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  if (indexedDB && indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(db => db?.name && indexedDB.deleteDatabase(db.name)));
    } catch {}
  }
  location.reload();
}

/* ==== INIT + UI ==== */
document.addEventListener("DOMContentLoaded", () => {
  const $nombre = $('#nombre');
  const $uido   = $('#uido');
  const $tipo   = $('#tipo');
  const $btn    = $('#btn-fichar');

  const $vMsg   = $('#verif-msg');
  const $fMsg   = $('#fichaje-msg');
  const $ult    = $('#ultimo-fichaje');
  const $datosMsg = $('#datos-valid-msg');
  const $btnReset = $('#btn-reset');
/* --- Navegación de pestañas --- */
const $tabs  = document.querySelectorAll('[data-target].nav-tab'); // botones
const $views = document.querySelectorAll('.view');                 // paneles

function showTab(id){
  $views.forEach(v => v.hidden = (v.id !== id));
  $tabs.forEach(b => b.classList.toggle('active', b.dataset.target === id));
  // recuerda la última pestaña
  try { localStorage.setItem('sb_fq_last_tab', id); } catch {}
}

// engancha clicks
$tabs.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    showTab(btn.dataset.target);
  });
});

// pestaña inicial (guardada o DATOS)
const startTab = localStorage.getItem('sb_fq_last_tab') || 'view-datos';
showTab(startTab);


  // Cargar datos guardados
  const saved = LS.get(LS_DATOS, {});
  if ($nombre && saved.nombre) $nombre.value = saved.nombre;
  if ($uido   && saved.uido)   $uido.value   = saved.uido;

  // Cargar nota
  const elNota = $('#nota');
  if (elNota) elNota.value = LS.get(LS_NOTA,"") || "";

  // Pintar tabla y último fichaje
  renderControl(loadFichajes());
  const last = LS.get(LS_ULTIMO, null);
  if (last && $ult) $ult.textContent = `${(last.tipo||"").toUpperCase()} · ${last.fecha||""} ${last.hora||""}${last.pendiente ? " (pendiente)" : ""}`;

  // Helpers UI
  const tell = (el, txt, type="info") => {
    if (!el) return;
    el.textContent = txt;
    el.classList.remove("ok","warn","err","info");
    el.classList.add(type);
  };
  const twinTell = (txt, type) => { tell($vMsg, txt, type); tell($datosMsg, txt, type); };
  const setBtn = (enabled)=> { if($btn) $btn.disabled = !enabled; };

  // Botón reset
  $btnReset?.addEventListener('click', async ()=>{
    if (confirm('¿Seguro que quieres borrar todos los datos locales de este dispositivo?')) {
      await resetDispositivo();
    }
  });

  // Validación con debounce
  let valTimer;
  async function validarYReflejar(){
    clearTimeout(valTimer);
    valTimer = setTimeout(async ()=>{
      const nombre = $nombre ? $nombre.value : "";
      const uido   = $uido   ? $uido.value   : "";

      if(!nombre || !uido){
        twinTell("Completa nombre y UIDO para activar el fichaje.", "info");
        setBtn(false);
        return;
      }

      try{
        twinTell("Validando acceso…", "info");
        const ok = await validarAcceso(nombre, uido);
        if(ok){
          const nuevo = { nombre: normSpaces(nombre), uido: normNoSpaces(uido) };
          const anterior = LS.get(LS_DATOS, null);
          const esOtro = !anterior || anterior.nombre !== nuevo.nombre || anterior.uido !== nuevo.uido;

          if (esOtro) {
            LS.set(LS_DATOS, nuevo);
            LS.set(LS_FICHAJES, []);
            LS.del(LS_NOTA);
            LS.del(LS_ULTIMO);
            renderControl([]);
          } else {
            LS.set(LS_DATOS, nuevo);
          }

          twinTell(`✅ Trabajador validado. Puedes fichar.`, "ok");
          setBtn(true);
          setTipoSugerido($tipo, nuevo.nombre, nuevo.uido);
        }else{
          twinTell("⛔ Empleado no encontrado.", "err");
          setBtn(false);
        }
      }catch(e){
        twinTell("⚠️ Error al validar. Revisa conexión.", "warn");
        setBtn(false);
      }
    }, 250);
  }

  if ($nombre) $nombre.addEventListener("input", validarYReflejar);
  if ($uido)   $uido.addEventListener("input",   validarYReflejar);
  validarYReflejar(); // validación inicial

  // ✅ BOTÓN GUARDAR DATOS (soporte para dos posibles IDs)
  const btnGuardar = $('#btn-guardar') || $('#btn-guardar-datos');
  btnGuardar?.addEventListener('click', ()=>{
    const nombre = $nombre?.value || '';
    const uido   = $uido?.value   || '';
    LS.set(LS_DATOS, { nombre: normSpaces(nombre), uido: normNoSpaces(uido) });
    // feedback visual rápido si el botón existe
    const oldTxt = btnGuardar.textContent;
    btnGuardar.textContent = "Guardado ✓";
    setTimeout(()=> btnGuardar.textContent = oldTxt, 1200);
    // dispara validación inmediata
    $nombre?.dispatchEvent(new Event('input'));
    $uido?.dispatchEvent(new Event('input'));
  });

  // Guardar nota (si existe)
  $('#btn-guardar-nota')?.addEventListener('click', ()=>{
    const el = $('#nota'); if(!el) return;
    LS.set(LS_NOTA, el.value);
    const ok = $('#saved-nota'); if(ok){ ok.hidden = false; setTimeout(()=> ok.hidden = true, 1500); }
  });

  // FICHAR
  async function onFichar(){
    if (!$btn) return;

    const activo = LS.get(LS_DATOS, null);
    if(!activo?.nombre || !activo?.uido){
      tell($fMsg, "Primero valida tu nombre y UIDO.", "warn");
      return;
    }

    const tipo = ($tipo?.value || 'entrada').toLowerCase();
    setBtn(false);
    tell($fMsg, "Enviando fichaje…", "info");
    const meta = ahoraISO();

    try{
      await enviarFichaje({ tipo, nombre: activo.nombre, uido: activo.uido });

      const arr = loadFichajes();
      arr.push({ fecha: meta.fecha, hora: meta.hora, tipo, nombre: activo.nombre, uido: activo.uido, enviado: true, tz: meta.tz, fecha_iso: meta.iso, origen: "pwa-fichaje-qr" });
      saveFichajes(arr);

      LS.set(LS_ULTIMO, { tipo, fecha: meta.fecha, hora: meta.hora, pendiente: false });
      if ($ult) $ult.textContent = `${tipo.toUpperCase()} · ${meta.fecha} ${meta.hora}`;

      tell($fMsg, "✅ Fichaje enviado.", "ok");

      // Alternar automáticamente para el siguiente
      if ($tipo) $tipo.value = (tipo === 'entrada') ? 'salida' : 'entrada';
    }catch(e){
      const arr = loadFichajes();
      arr.push({ fecha: meta.fecha, hora: meta.hora, tipo, nombre: activo.nombre, uido: activo.uido, enviado: false, tz: meta.tz, fecha_iso: meta.iso, origen: "pwa-fichaje-qr" });
      saveFichajes(arr);

      LS.set(LS_ULTIMO, { tipo, fecha: meta.fecha, hora: meta.hora, pendiente: true });
      if ($ult) $ult.textContent = `${tipo.toUpperCase()} · ${meta.fecha} ${meta.hora} (pendiente)`;

      tell($fMsg, "⚠️ Sin conexión o error del servidor. Guardado para reintento.", "warn");
    }finally{
      setBtn(true);
    }
  }
  $btn?.addEventListener('click', onFichar);

  // Reintentar pendientes
  $('#btn-sync')?.addEventListener('click', async ()=>{
    const s = $('#sync-status'); if(s) s.textContent = "Sincronizando…";
    const arr = loadFichajes();
    let ok=0, fail=0;
    for (const it of arr){
      if(!it.enviado){
        try{ await enviarFichaje({ tipo: it.tipo, nombre: it.nombre, uido: it.uido }); it.enviado = true; ok++; }
        catch{ fail++; }
      }
    }
    saveFichajes(arr);
    const txt = `Listo. Enviados: ${ok}. Pendientes: ${fail}.`;
    if(s) s.textContent = txt;
    tell($fMsg, txt, fail ? "warn" : "ok");
  });

  // Export CSV (solo del trabajador activo)
  $('#btn-export')?.addEventListener('click', ()=>{
    const activo = LS.get(LS_DATOS, {nombre:'',uido:''});
    const propios = loadFichajes().filter(it => it.nombre === activo.nombre && it.uido === activo.uido);
    const headers = ["fecha","hora","tipo","nombre","uido","enviado","tz","fecha_iso","origen"];
    const lines = [headers.join(",")].concat(
      propios.map(it=>headers.map(h=>`"${(it[h]??"").toString().replaceAll('"','""')}"`).join(","))
    );
    const blob = new Blob([lines.join("\n")], {type:"text/csv"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "fichajes.csv";
    a.click();
  });
});

/* ==== PWA INSTALL ==== */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('#btn-install');
  if (btn) btn.hidden = false;
});
$('#btn-install')?.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  const btn = $('#btn-install'); if (btn) btn.hidden = true;
});

/* ==== SERVICE WORKER ==== */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}

console.log("FichajeQR app.js :: build", new Date().toISOString());
