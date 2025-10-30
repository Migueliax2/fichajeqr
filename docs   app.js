/* App core */
const WEBHOOK = "https://primary-production-2aed.up.railway.app/webhook/fichaje-qr"; // n8n
const LS_DATOS = "sb_fq_datos";
const LS_FICHAJES = "sb_fq_fichajes";
const LS_NOTA = "sb_fq_nota";

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

/* DATOS load/save */
function loadDatos(){
  const d = JSON.parse(localStorage.getItem(LS_DATOS) || "{}");
  if(d.nombre) $('#nombre').value = d.nombre;
  if(d.dni) $('#dni').value = d.dni;
  if(d.uid) $('#uid').value = d.uid;
}
function saveDatos(e){
  e.preventDefault();
  const d = { nombre: $('#nombre').value.trim(), dni: $('#dni').value.trim(), uid: $('#uid').value.trim() };
  localStorage.setItem(LS_DATOS, JSON.stringify(d));
  $('#saved-datos').hidden = false;
  setTimeout(()=>$('#saved-datos').hidden = true, 1800);
}
$('#form-datos')?.addEventListener('submit', saveDatos);
loadDatos();

/* NOTA */
function loadNota(){
  $('#nota').value = localStorage.getItem(LS_NOTA) || "";
}
$('#btn-guardar-nota')?.addEventListener('click', ()=>{
  localStorage.setItem(LS_NOTA, $('#nota').value);
  $('#saved-nota').hidden = false;
  setTimeout(()=>$('#saved-nota').hidden = true, 1800);
});
loadNota();

/* QR Scanner + Fichaje */
let qrValue = "";
function startQR(){
  try{
    const qr = new Html5Qrcode("reader");
    qr.start({facingMode:"environment"}, {fps:10, qrbox:250},
      (decoded)=>{
        qrValue = decoded;
        $('#qr-result').textContent = "QR detectado ✔";
        $('#btn-fichar').disabled = false;
      },
      (err)=>{ /* ignore noisy errors */ }
    );
  }catch(e){
    $('#qr-result').textContent = "Error QR: "+e;
  }
}
startQR();

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

async function enviarFichaje(item){
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(item)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);
  return true;
}

function addToControlTable(items){
  const tbody = $('#tabla-control tbody');
  tbody.innerHTML = "";
  items.forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.fecha}</td><td>${it.hora}</td><td>${it.tipo}</td><td>${it.nombre}</td><td>${it.dni}</td><td>${(it.qr||'').slice(0,20)}...</td><td>${it.enviado?'Sí':'No'}</td>`;
    tbody.appendChild(tr);
  });
}

function loadFichajes(){
  return JSON.parse(localStorage.getItem(LS_FICHAJES)||"[]");
}
function saveFichajes(arr){
  localStorage.setItem(LS_FICHAJES, JSON.stringify(arr));
  addToControlTable(arr.slice().reverse());
}
addToControlTable(loadFichajes().slice().reverse());

$('#btn-fichar')?.addEventListener('click', async ()=>{
  const datos = JSON.parse(localStorage.getItem(LS_DATOS)||"{}");
  if(!datos?.nombre || !datos?.dni){
    alert("Primero guarda tus DATOS (nombre y DNI).");
    return;
  }
  if(!qrValue){
    alert("Escanea el QR antes de fichar.");
    return;
  }
  const tipo = $('#tipo').value;
  const t = nowParts();
  const item = {
    ...datos,
    tipo,
    qr: qrValue,
    fecha_iso: t.iso,
    fecha: t.fecha,
    hora: t.hora,
    tz: t.tz,
    origen: "pwa-fichaje-qr"
  };

  // Guarda local (enviado=false por defecto)
  const arr = loadFichajes();
  arr.push({...item, enviado:false});
  saveFichajes(arr);

  // Intenta enviar a n8n
  $('#fichaje-msg').textContent = "Enviando…";
  try{
    await enviarFichaje(item);
    // marca como enviado
    const updated = loadFichajes();
    updated[updated.length-1].enviado = true;
    saveFichajes(updated);
    $('#fichaje-msg').textContent = "✅ Fichaje enviado.";
    $('#ultimo-fichaje').textContent = JSON.stringify(item, null, 2);
    // reset boton
    $('#btn-fichar').disabled = true;
    qrValue = "";
    $('#qr-result').textContent = "Escanea tu QR…";
  }catch(err){
    $('#fichaje-msg').textContent = "⚠️ Sin conexión o error del servidor. Queda guardado y se reintenta en CONTROL.";
  }
});

/* Reintento de pendientes */
$('#btn-sync')?.addEventListener('click', async ()=>{
  $('#sync-status').textContent = "Sincronizando…";
  const arr = loadFichajes();
  let ok = 0, fail = 0;
  for(const it of arr){
    if(!it.enviado){
      try{ await enviarFichaje(it); it.enviado = true; ok++; }
      catch{ fail++; }
    }
  }
  saveFichajes(arr);
  $('#sync-status').textContent = `Listo. Enviados: ${ok}. Pendientes: ${fail}.`;
});

/* Export CSV */
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

/* PWA Install */
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

/* SW */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
