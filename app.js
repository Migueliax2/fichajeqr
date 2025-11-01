/* ==== CONFIG ==== */
const WEBHOOK = "https://TU-DOMINIO.railway.app/webhook/fichaje-qr";           // n8n (POST)
const VALIDATE_URL = "https://primary-production-2aed.up.railway.app/webhook/validar-trabajador";

/* ==== KEYS LS ==== */
const LS_DATOS = "sb_fq_datos";
const LS_FICHAJES = "sb_fq_fichajes";
const LS_NOTA = "sb_fq_nota";

/* ==== HELPERS ==== */
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);

function nowParts(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return {
    iso: d.toISOString(),
    fecha: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

/* ==== TABS ==== */
$$('.tabs button').forEach(b=>{
  b.addEventListener('click', ()=>{
    $$('.tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    $$('.tab').forEach(s=>s.classList.remove('active'));
    $('#tab-'+t).classList.add('active');
  });
});

/* ==== CONTROL TABLE ==== */
function loadFichajes(){ return JSON.parse(localStorage.getItem(LS_FICHAJES)||"[]"); }
function saveFichajes(arr){ localStorage.setItem(LS_FICHAJES, JSON.stringify(arr)); renderControl(arr); }
function renderControl(items){
  const tbody = $('#tabla-control tbody');
  if(!tbody) return;
  tbody.innerHTML = "";
  items.slice().reverse().forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.fecha}</td>
      <td>${it.hora}</td>
      <td>${it.tipo}</td>
      <td>${it.nombre}</td>
      <td>${it.uido||""}</td>
      <td>${it.enviado ? "Sí" : "No"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==== DATOS ==== */
function loadDatos(){
  const d = JSON.parse(localStorage.getItem(LS_DATOS)||"{}");
  if(d.nombre) $('#nombre').value = d.nombre;
  if(d.uido) $('#uido').value = d.uido;
  updateFicharState(false); // hasta validar
}
function saveDatos(e){
  e.preventDefault();
  const d = {
    nombre: ($('#nombre').value||"").trim(),
    uido:   ($('#uido').value||"").trim()
  };
  if(!d.nombre || !d.uido){
    alert("Rellena NOMBRE y UIDO.");
    return;
  }
  localStorage.setItem(LS_DATOS, JSON.stringify(d));
  $('#saved-datos').hidden = false;
  setTimeout(()=>$('#saved-datos').hidden = true, 1500);
  verifyDatos(d);
}
$('#form-datos')?.addEventListener('submit', saveDatos);

function updateFicharState(enabled){
  const b = $('#btn-fichar');
  const scanWrap = $('#scan-wrap'); // existe en el HTML, pero no lo usaremos
  if(b){
    b.disabled = !enabled;
  }
  if(scanWrap){
    scanWrap.hidden = true; // lo ocultamos siempre: fichaje sin escáner
  }
}

/* ==== VALIDACIÓN CONTRA BD (GET) ==== */
async function verifyDatos(d){
  $('#verif-msg').textContent = "Validando…";
  const params = new URLSearchParams({
    nombre: d.nombre,
    uid: d.uido
  });
  try{
    const r = await fetch(`${VALIDATE_URL}?${params.toString()}`, { method:"GET" });
    const j = await r.json();
    if(j && j.ok){
      $('#verif-msg').textContent = "✅ Validado. Puedes fichar.";
      updateFicharState(true);
      return true;
    }else{
      $('#verif-msg').textContent = "⚠️ No estás en la base de datos.";
      updateFicharState(false);
      return false;
    }
  }catch(err){
    $('#verif-msg').textContent = "⚠️ Error al validar. Revisa conexión.";
    updateFicharState(false);
    return false;
  }
}

/* ==== ENVIAR FICHAJE A N8N ==== */
async function enviarFichaje(payload){
  const res = await fetch(WEBHOOK, {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);
  return res.json().catch(()=> ({}));
}

/* ==== CLICK FICHAR ==== */
$('#btn-fichar')?.addEventListener('click', async ()=>{
  const datos = JSON.parse(localStorage.getItem(LS_DATOS)||"{}");
  if(!datos?.nombre || !datos?.uido){
    alert("Primero guarda tus DATOS (Nombre y UIDO).");
    return;
  }

  const ok = await verifyDatos(datos);
  if(!ok){
    alert("No estás validado. Revisa tus datos.");
    return;
  }

  const tipo = $('#tipo').value; // entrada|salida
  const t = nowParts();
  const item = {
    nombre: datos.nombre,
    uido: datos.uido,
    tipo,
    fecha_iso: t.iso,
    fecha: t.fecha,
    hora: t.hora,
    tz: t.tz,
    origen: "pwa-fichaje-qr"
  };

  const arr = loadFichajes();
  arr.push({...item, enviado:false});
  saveFichajes(arr);

  $('#fichaje-msg').textContent = "Enviando…";
  try{
    await enviarFichaje(item);
    const updated = loadFichajes();
    updated[updated.length-1].enviado = true;
    saveFichajes(updated);
    $('#fichaje-msg').textContent = "✅ Fichaje enviado.";
    $('#ultimo-fichaje').textContent = JSON.stringify(item, null, 2);
  }catch(e){
    $('#fichaje-msg').textContent = "⚠️ Sin conexión o error servidor. Guardado para reintento.";
  }
});

/* ==== REINTENTOS / EXPORT ==== */
$('#btn-sync')?.addEventListener('click', async ()=>{
  $('#sync-status').textContent = "Sincronizando…";
  const arr = loadFichajes();
  let ok=0, fail=0;
  for(const it of arr){
    if(!it.enviado){
      try{ await enviarFichaje(it); it.enviado=true; ok++; }catch{ fail++; }
    }
  }
  saveFichajes(arr);
  $('#sync-status').textContent = `Listo. Enviados: ${ok}. Pendientes: ${fail}.`;
});

$('#btn-export')?.addEventListener('click', ()=>{
  const arr = loadFichajes();
  const headers = ["fecha","hora","tipo","nombre","uido","enviado","tz","fecha_iso","origen"];
  const rows = [headers.join(",")].concat(
    arr.map(it=>headers.map(h=>`"${(it[h]??"").toString().replaceAll('"','""')}"`).join(","))
  );
  const blob = new Blob([rows.join("\n")], {type:"text/csv"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "fichajes.csv";
  a.click();
});

/* ==== NOTA ==== */
function loadNota(){ $('#nota').value = localStorage.getItem(LS_NOTA) || ""; }
$('#btn-guardar-nota')?.addEventListener('click', ()=>{
  localStorage.setItem(LS_NOTA, $('#nota').value);
  $('#saved-nota').hidden = false;
  setTimeout(()=>$('#saved-nota').hidden = true, 1500);
});

/* ==== INIT ==== */
loadDatos();
loadNota();
renderControl(loadFichajes());

/* ==== PWA INSTALL ==== */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $('#btn-install').hidden = false;
});
$('#btn-install')?.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#btn-install').hidden = true;
});

/* ==== SERVICE WORKER ==== */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
