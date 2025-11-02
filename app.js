/* ==== CONFIG (ENDPOINTS) ==== */
// Validación de trabajador (GET en n8n)
const VALIDATE_URL = "https://primary-production-2aed.up.railway.app/webhook/validar-trabajador";
// Registro de fichaje (POST en n8n)
const WEBHOOK      = "https://primary-production-2aed.up.railway.app/webhook/fichaje-qr";

/* ==== KEYS LS ==== */
const LS_DATOS    = "sb_fq_datos";
const LS_FICHAJES = "sb_fq_fichajes";
const LS_NOTA     = "sb_fq_nota";
const LS_ULTIMO   = "sb_fq_ultimo";

/* ==== HELPERS DOM ==== */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);

/* ==== TABS (si existen en el HTML) ==== */
$$('.tabs button').forEach(b=>{
  b.addEventListener('click', ()=>{
    $$('.tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    $$('.tab').forEach(s=>s.classList.remove('active'));
    const pane = document.getElementById('tab-'+t);
    if (pane) pane.classList.add('active');
  });
});

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

/* ==== NORMALIZADORES (igual que en n8n) ==== */
function normNombre(x=""){
  return String(x)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function normUID(x=""){
  return String(x)
    .replace(/\\n/g,"").replace(/\r?\n/g,"").replace(/\s+/g,"")
    .toUpperCase().replace(/[^A-Z0-9]/g,"");
}

/* ==== STORAGE UTILS ==== */
const LS = {
  get(k, d=null){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
};

/* ==== CONTROL TABLE ==== */
function loadFichajes(){ return LS.get(LS_FICHAJES, []); }
function saveFichajes(arr){ LS.set(LS_FICHAJES, arr); renderControl(arr); }

function renderControl(items){
  const tbody = document.querySelector('#tabla-control tbody');
  if(!tbody) return;
  tbody.innerHTML = "";
  items.slice().reverse().forEach(it=>{
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

/* ==== API: VALIDACIÓN (GET) ==== */
async function validarAcceso(nombre, uido){
  const n = normNombre(nombre);
  const u = normUID(uido);
  const url = `${VALIDATE_URL}?nombre=${encodeURIComponent(n)}&uido=${encodeURIComponent(u)}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`VALIDATE_URL HTTP ${r.status}`);
  const j = await r.json().catch(()=> ({}));
  return j?.ok === true;
}

/* ==== API: ENVIAR FICHAJE (POST) ==== */
async function enviarFichaje({tipo, nombre, uido}){
  const t = ahoraISO();
  const payload = {
    tipo,                                // "entrada" | "salida"
    nombre: normNombre(nombre),
    uido: normUID(uido),
    fecha_iso: t.iso,
    fecha: t.fecha,
    hora: t.hora,
    tz: t.tz,
    origen: "pwa-fichaje-qr"
    // api_key: "solucionesbot2025" // <- si tu flujo lo exige, descomenta y valida en n8n
  };
  const r = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`WEBHOOK HTTP ${r.status}`);
  return await r.json().catch(()=> ({}));
}

/* ==== NOTA ==== */
function loadNota(){ const el = $('#nota'); if(el) el.value = LS.get(LS_NOTA,"") || ""; }
function saveNota(){
  const el = $('#nota'); if(!el) return;
  LS.set(LS_NOTA, el.value);
  const ok = $('#saved-nota'); if(ok){ ok.hidden = false; setTimeout(()=> ok.hidden = true, 1500); }
}

/* ==== INIT + UI ==== */
document.addEventListener("DOMContentLoaded", () => {
  const $nombre = $('#nombre');
  const $uido   = $('#uido');
  const $tipo   = $('#tipo');            // select Entrada/Salida
  const $btn    = $('#btn-fichar');      // botón FICHAR
  const $vMsg   = $('#verif-msg');       // estado de validación
  const $fMsg   = $('#fichaje-msg');     // estado de envío
  const $ult    = $('#ultimo-fichaje');  // pre último fichaje

  // Cargar datos/nota/tabla
  const saved = LS.get(LS_DATOS, {});
  if ($nombre && saved.nombre) $nombre.value = saved.nombre;
  if ($uido   && saved.uido)   $uido.value   = saved.uido;
  loadNota();
  renderControl(loadFichajes());

  // Pintar último fichaje guardado
  const last = LS.get(LS_ULTIMO, null);
  if (last && $ult) {
    $ult.textContent = `${(last.tipo||"").toUpperCase()} · ${last.fecha||""} ${last.hora||""}${last.pendiente ? " (pendiente)" : ""}`;
  }

  // Helpers UI
  const tell = (el, txt, type="info") => {
    if (!el) return;
    el.textContent = txt;
    el.classList.remove("ok","warn","err","info");
    el.classList.add(type);
  };
  const setBtn = (enabled)=> { if($btn) $btn.disabled = !enabled; };

  // Validación con debounce
  let valTimer;
  async function validarYReflejar(){
    clearTimeout(valTimer);
    valTimer = setTimeout(async ()=>{
      const nombre = $nombre ? $nombre.value : "";
      const uido   = $uido   ? $uido.value   : "";

      // Guardar en LS_DATOS en crudo (serán normalizados al enviar)
      LS.set(LS_DATOS, { nombre, uido });

      if(!nombre || !uido){
        tell($vMsg, "Completa nombre y UIDO para activar el fichaje.", "info");
        setBtn(false);
        return;
      }

      try{
        tell($vMsg, "Validando acceso…", "info");
        const ok = await validarAcceso(nombre, uido);
        if(ok){
          tell($vMsg, "✅ Acceso verificado. Puedes fichar.", "ok");
          setBtn(true);
        }else{
          tell($vMsg, "⛔ Empleado no encontrado.", "err");
          setBtn(false);
        }
      }catch(e){
        tell($vMsg, "⚠️ Error al validar. Revisa conexión.", "warn");
        setBtn(false);
      }
    }, 250);
  }

  if ($nombre) $nombre.addEventListener("input", validarYReflejar);
  if ($uido)   $uido.addEventListener("input",   validarYReflejar);
  validarYReflejar(); // validación inicial

  // Guardar nota
  $('#btn-guardar-nota')?.addEventListener('click', saveNota);

  // Enviar fichaje
  async function onFichar(){
    if (!$btn) return;
    const nombre = $nombre ? $nombre.value : "";
    const uido   = $uido   ? $uido.value   : "";
    const tipo   = $tipo   ? $tipo.value   : "entrada";

    if(!nombre || !uido){
      tell($fMsg, "Rellena nombre y UIDO.", "warn");
      return;
    }

    setBtn(false);
    tell($fMsg, "Enviando fichaje…", "info");

    const meta = ahoraISO();

    try{
      await enviarFichaje({ tipo, nombre, uido });

      // Guardar en histórico local
      const arr = loadFichajes();
      arr.push({ fecha: meta.fecha, hora: meta.hora, tipo, nombre, uido, enviado: true, tz: meta.tz, fecha_iso: meta.iso, origen: "pwa-fichaje-qr" });
      saveFichajes(arr);

      // Último fichaje
      LS.set(LS_ULTIMO, { tipo, fecha: meta.fecha, hora: meta.hora, pendiente: false });
      if ($ult) $ult.textContent = `${tipo.toUpperCase()} · ${meta.fecha} ${meta.hora}`;

      tell($fMsg, "✅ Fichaje enviado.", "ok");
    }catch(e){
      // Cola offline
      const arr = loadFichajes();
      arr.push({ fecha: meta.fecha, hora: meta.hora, tipo, nombre, uido, enviado: false, tz: meta.tz, fecha_iso: meta.iso, origen: "pwa-fichaje-qr" });
      saveFichajes(arr);

      LS.set(LS_ULTIMO, { tipo, fecha: meta.fecha, hora: meta.hora, pendiente: true });
      if ($ult) $ult.textContent = `${tipo.toUpperCase()} · ${meta.fecha} ${meta.hora} (pendiente)`;

      tell($fMsg, "⚠️ Sin conexión o error del servidor. Guardado para reintento.", "warn");
    }finally{
      await validarYReflejar(); // revalidar estado del botón
    }
  }
  $btn?.addEventListener('click', onFichar);

  // Reintentos manuales
  $('#btn-sync')?.addEventListener('click', async ()=>{
    tell($('#sync-status'), "Sincronizando…", "info");
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
    const s = $('#sync-status'); if(s) s.textContent = txt;
    tell($fMsg, txt, fail ? "warn" : "ok");
  });

  // Export CSV
  $('#btn-export')?.addEventListener('click', ()=>{
    const arr = loadFichajes();
    const headers = ["fecha","hora","tipo","nombre","uido","enviado","tz","fecha_iso","origen"];
    const lines = [headers.join(",")].concat(
      arr.map(it=>headers.map(h=>`"${(it[h]??"").toString().replaceAll('"','""')}"`).join(","))
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
