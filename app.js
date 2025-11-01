/* App core */
const WEBHOOK = "https://primary-production-2aed.up.railway.app/webhook/fichaje-qr"; // n8n
// Pega aquí tu validador (n8n o Apps Script):
const VALIDATE_URL = "https://TU-ENDPOINT/validar-trabajador"; // ?dni=...&nombre=...

const LS_DATOS = "sb_fq_datos";
const LS_FICHAJES = "sb_fq_fichajes";
const LS_NOTA = "sb_fq_nota";
const LS_QR_LINK = "sb_fq_qr_link"; // NUEVO: guardamos el enlace de fichaje si está en BD

const $ = (sel)=>document.querySelector(sel);
const $$ = (sel)=>document.querySelectorAll(sel);

/* Tabs */
$$('.tabs button').forEach(b=>b.addEventListener('click', ()=>{
  $$('.tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const target = b.dataset.tab;
  $$('.tab').forEach(t=>t.classList.remove('active'));
  $('#tab-'+target).classList.add('active');
}));

/* Helpers */
function nowParts(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,'0');
  return {
    iso: d.toISOString(),
    fecha: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
function loadFichajes(){ return JSON.parse(localStorage.getItem(LS_FICHAJES)||"[]"); }
function saveFichajes(arr){ localStorage.setItem(LS_FICHAJES, JSON.stringify(arr)); addToControlTable(arr.slice().reverse()); }
function addToControlTable(items){
  const tbody = $('#tabla-control tbody');
  tbody.innerHTML = "";
  items.forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.fecha}</td><td>${it.hora}</td><td>${it.tipo}</td><td>${it.nombre}</td><td>${it.dni}</td><td>${(it.qr||'').slice(0,40)}</td><td>${it.enviado?'Sí':'No'}</td>`;
    tbody.appendChild(tr);
  });
}

/* DATOS */
function loadDatos(){
  const d = JSON.parse(localStorage.getItem(LS_DATOS) || "{}");
  if(d.nombre) $('#nombre').value = d.nombre;
  if(d.dni) $('#dni').value = d.dni;
  if(d.uid) $('#uid').value = d.uid;
  const qrl = localStorage.getItem(LS_QR_LINK)||"";
  updateFicharState(!!qrl);
}
async function verifyDatos(d){
  if(!VALIDATE_URL) return {ok:false};
  const params = new URLSearchParams({dni: d.dni||"", nombre: d.nombre||""});
  try{
    const r = await fetch(`${VALIDATE_URL}?${params.toString()}`, {method:"GET"});
    const j = await r.json();
    if(j?.ok && j?.qr_link){
      localStorage.setItem(LS_QR_LINK, j.qr_link);
      $('#verif-msg').textContent = "✅ Usuario validado. Botón FICHAR activado.";
      return {ok:true};
    }else{
      localStorage.removeItem(LS_QR_LINK);
      $('#verif-msg').textContent = "⚠️ No estás en la base de datos.";
      return {ok:false};
    }
  }catch(e){
    $('#verif-msg').textContent = "⚠️ Error validando. Revisa conexión.";
    return {ok:false};
  }finally{
    updateFicharState(!!localStorage.getItem(LS_QR_LINK));
  }
}
function updateFicharState(enabled){
  const b = $('#btn-fichar');
  const scanWrap = $('#scan-wrap');
  if(enabled){
    b.disabled = false;            // activado sin escáner
    scanWrap.hidden = true;        // ocultar escáner
  }else{
    b.disabled = true;             // desactivado hasta validar
    scanWrap.hidden = false;       // mostrar escáner por si quieres fallback QR
  }
}
function saveDatos(e){
  e.preventDefault();
  const d = { nombre: $('#nombre').value.trim(), dni: $('#dni').value.trim(), uid: $('#uid').value.trim() };
  localStorage.setItem(LS_DATOS, JSON.stringify(d));
  $('#saved-datos').hidden = false;
  setTimeout(()=>$('#saved-datos').hidden = true, 1600);
  verifyDatos(d);
}
$('#form-datos')?.addEventListener('submit', saveDatos);

/* NOTA */
function loadNota(){ $('#nota').value = localStorage.getItem(LS_NOTA) || ""; }
$('#btn-guardar-nota')?.addEventListener('click', ()=>{
  localStorage.setItem(LS_NOTA, $('#nota').value);
  $('#saved-nota').hidden = false;
  setTimeout(()=>$('#saved-nota').hidden = true, 1600);
});

/* QR (fallback opcional) */
let qrValue = "";
function startQR(){
  try{
    const qr = new Html5Qrcode("reader");
    qr.start({facingMode:"environment"}, {fps:10, qrbox:250},
      (decoded)=>{ qrValue = decoded; $('#qr-result').textContent = "QR detectado ✔"; },
      ()=>{}
    );
  }catch(e){
    $('#qr-result').textContent = "Error QR: "+e;
  }
}

/* Envío a n8n */
async function enviarFichaje(item){
  const res = await fetch(WEBHOOK, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(item) });
  if(!res.ok) throw new Error("HTTP "+res.status);
  return true;
}

/* Eventos iniciales */
loadDatos();
loadNota();
addToControlTable(loadFichajes().slice().reverse());
startQR(); // sigue disponible como backup

/* Click FICHAR */
$('#btn-fichar')?.addEventListener('click', async ()=>{
  const datos = JSON.parse(localStorage.getItem(LS_DATOS)||"{}");
  if(!datos?.nombre || !datos?.dni){ alert("Primero guarda tus DATOS."); return; }

  // Prioridad: si hay QR_LINK de la base, lo usamos. Si no, usar QR escaneado.
  const qrLink = localStorage.getItem(LS_QR_LINK) || "";
  const qr = qrLink || qrValue;
  if(!qr){ alert("No hay enlace de fichaje activo ni QR escaneado."); return; }

  const tipo = $('#tipo').value; // "entrada" | "salida"
  const t = nowParts();
  const item = {
    ...datos,
    tipo,
    qr,
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
    qrValue = "";
    $('#qr-result').textContent = "Escanea tu QR…";
  }catch(err){
    $('#fichaje-msg').textContent = "⚠️ Sin conexión o error servidor. Guardado para reintento.";
  }
});

/* Reintentos + Export */
$('#btn-sync')?.addEventListener('click', async ()=>{
  $('#sync-status').textContent = "Sincronizando…";
  const arr = loadFichajes();
  let ok = 0, fail = 0;
  for(const it of arr){
    if(!it.enviado){
      try{ await enviarFichaje(it); it.enviado = true; ok++; } catch{ fail++; }
    }
  }
  saveFichajes(arr);
  $('#sync-status').textContent = `Listo. Enviados: ${ok}. Pendientes: ${fail}.`;
});
$('#btn-export')?.addEventListener('click', ()=>{
  const arr = loadFichajes();
  const headers = ["fecha","hora","tipo","nombre","dni","qr","enviado","tz","fecha_iso","origen"];
  const rows = [headers.join(",")].concat(arr.map(it=>headers.map(h=>`"${(it[h]??"").toString().replaceAll('"','""')}"`).join(",")));
  const blob = new Blob([rows.join("\n")],{type:"text/csv"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "fichajes.csv";
  a.click();
});

/* PWA */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt = e; $('#btn-install').hidden = false;
});
$('#btn-install')?.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#btn-install').hidden = true;
});

/* SW */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
