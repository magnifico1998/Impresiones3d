// Panel local del conector (http://127.0.0.1:18930): vincular la cuenta,
// cargar las impresoras y ver lo que va pasando. HTML y JS sin dependencias.

export const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manager3D Conector</title>
<style>
  :root { --bg:#0f1418; --bg2:#161d22; --bg3:#1e272e; --text:#e8eef2; --text2:#a9b6bf; --text3:#73828c; --accent:#2dd4a7; --danger:#f87171; --border:#2a353d; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--text2); margin-bottom: 20px; }
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: var(--text3); margin: 0 0 12px; }
  label { display:block; font-size:12px; color:var(--text2); margin: 10px 0 4px; }
  input, select { width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg3); color:var(--text); font:inherit; }
  .fila { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .fila > div { flex:1; min-width: 160px; }
  button { padding:8px 14px; border-radius:6px; border:1px solid var(--border); background:var(--bg3); color:var(--text); cursor:pointer; font:inherit; }
  button.primario { background: var(--accent); border-color: var(--accent); color:#06231b; font-weight:600; }
  button.peligro { color: var(--danger); }
  button:disabled { opacity:.5; cursor:default; }
  .estado { display:inline-flex; gap:6px; align-items:center; font-size:13px; }
  .punto { width:9px; height:9px; border-radius:50%; background: var(--text3); }
  .punto.ok { background: var(--accent); }
  table { width:100%; border-collapse: collapse; }
  td, th { text-align:left; padding:8px 6px; border-bottom:1px solid var(--border); font-size:13px; }
  th { color: var(--text3); font-weight: 500; }
  .acciones { text-align:right; white-space:nowrap; }
  .acciones button { margin-left:6px; padding:5px 10px; font-size:12px; }
  pre { background: var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; max-height:260px; overflow:auto; font-size:12px; white-space:pre-wrap; margin:0; }
  .aviso { font-size:12px; color: var(--text3); margin-top:8px; }
  .msg { margin-top:10px; font-size:13px; }
  .msg.error { color: var(--danger); } .msg.ok { color: var(--accent); }
  .oculto { display:none; }
</style>
</head>
<body>
<main>
  <h1>Manager3D Conector</h1>
  <div class="sub">Manda a tus impresoras los archivos que elegís en Manager3D → Biblioteca → 📄 → Mandar a impresora.</div>

  <div class="card">
    <h2>Cuenta</h2>
    <div id="cuenta"></div>
    <div id="vincular" class="oculto">
      <div class="fila">
        <div><label>Código de vinculación</label><input id="codigo" placeholder="Ej: K7M2Q9XA" maxlength="12" autocomplete="off"></div>
        <div><label>Nombre de esta PC</label><input id="equipo" maxlength="60"></div>
        <div style="flex:0"><button class="primario" id="btnVincular">Vincular</button></div>
      </div>
      <div class="aviso">Generalo en Manager3D → Configuración → Impresión directa → "Vincular un conector". Vale 10 minutos.</div>
    </div>
    <div id="msgCuenta" class="msg"></div>
  </div>

  <div class="card">
    <h2>Impresoras</h2>
    <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Dirección</th><th></th></tr></thead><tbody id="impresoras"></tbody></table>
    <div id="sinImpresoras" class="aviso">Todavía no cargaste impresoras.</div>

    <h2 style="margin-top:20px" id="tituloForm">Agregar impresora</h2>
    <input type="hidden" id="impId">
    <div class="fila">
      <div><label>Nombre</label><input id="impNombre" placeholder="Ej: Kobra 3 Combo" maxlength="60"></div>
      <div><label>Tipo</label><select id="impTipo"></select></div>
    </div>
    <div class="fila">
      <div data-campo="host"><label>IP de la impresora</label><input id="impHost" placeholder="Ej: 192.168.0.50"></div>
      <div data-campo="codigoAcceso"><label>Código de acceso (pantalla de la impresora)</label><input id="impCodigo" placeholder="8 caracteres" autocomplete="off"></div>
      <div data-campo="serie"><label>Número de serie</label><input id="impSerie" placeholder="Ej: 03919C..."></div>
      <div data-campo="programa"><label>Programa (opcional): ruta del .exe</label><input id="impPrograma" placeholder="Si lo dejás vacío se busca solo. Ej: C:\\Program Files\\AnycubicSlicerNext\\AnycubicSlicerNext.exe"></div>
    </div>
    <div data-campo="tieneAce"><label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="impAce" style="width:auto"> Tiene ACE (Combo): al imprimir, cada color va a un lugar del ACE que tenga ese material (lo lee de la impresora)</label></div>
    <div id="ayudaTipo" class="aviso"></div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="primario" id="btnGuardarImp">Guardar impresora</button>
      <button id="btnCancelarImp" class="oculto">Cancelar</button>
    </div>
    <div id="msgImp" class="msg"></div>
    <pre id="diag" class="oculto" style="margin-top:10px"></pre>
    <button id="btnCopiarDiag" class="oculto" style="margin-top:8px">Copiar el diagnóstico</button>
  </div>

  <div class="card">
    <h2>Guardar en una carpeta (siempre disponible)</h2>
    <div class="aviso" style="margin:0 0 8px">Para cualquier impresora, y sobre todo las que no tienen red: Manager3D te ofrece "Guardar en una carpeta". El archivo se guarda acá y se abre la carpeta para que lo pases a mano (tarjeta SD, pendrive, carpeta compartida).</div>
    <div class="fila">
      <div><label>Carpeta</label><input id="carpeta" placeholder="Ej: E:\\ (la tarjeta SD) o C:\\Impresiones"></div>
      <div style="flex:0"><button class="primario" id="btnCarpeta">Guardar</button></div>
      <div style="flex:0"><button id="btnProbarCarpeta">Probar</button></div>
    </div>
    <div class="aviso" id="avisoCarpeta"></div>
    <div id="msgCarpeta" class="msg"></div>
  </div>

  <div class="card">
    <h2>Actividad</h2>
    <pre id="log"></pre>
    <div class="aviso" id="datos"></div>
  </div>
</main>
<script>
const AYUDA = {
  'anycubic-lan': 'Kobra 3, Kobra 3 V2 o Kobra S1 con el firmware original, en "modo LAN" (pantalla de la impresora → Ajustes → Red). La IP también está en esa pantalla.',
  'abrir-en-anycubic': 'Para cualquier Kobra, SIN modo LAN. Guarda el archivo y lo abre en Anycubic Slicer Next en esta PC; desde ahí lo mandás a la impresora con tu cuenta Anycubic, como ya lo hacés. Solo sirve con archivos .gcode.3mf laminados en Anycubic Slicer Next (Exportar archivo de la placa laminada). El programa se busca solo; si no lo encuentra, indicá la ruta de su .exe.',
  'abrir-en-programa': 'Guarda el archivo y lo abre en Bambu Studio (u Orca, el programa que tengas para los .3mf) en esta PC. Desde ahí lo mandás a la impresora como siempre. No necesita Bambu Connect ni el modo LAN.',
  'bambu-connect': 'Abre el archivo en Bambu Connect, en esta PC, para que elijas la impresora y confirmes. La impresora sigue con la nube y Bambu Handy. Instalá Bambu Connect desde wiki.bambulab.com.',
  'bambu-lan': 'EXPERIMENTAL. La impresora tiene que estar en "LAN Only" + "Developer Mode" (Ajustes → LAN Only): deja de usar la nube y Bambu Handy. IP, código de acceso y número de serie están en esa misma pantalla.'
};
let datos = null;
const $ = (id) => document.getElementById(id);

async function api(ruta, cuerpo) {
  const r = await fetch(ruta, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function mensaje(id, texto, tipo) { const el = $(id); el.textContent = texto || ''; el.className = 'msg ' + (tipo || ''); }

function camposVisibles() {
  const tipo = $('impTipo').value;
  const t = datos.tipos.find((x) => x.tipo === tipo);
  document.querySelectorAll('[data-campo]').forEach((el) => el.classList.toggle('oculto', !t.campos.includes(el.dataset.campo)));
  $('ayudaTipo').textContent = AYUDA[tipo] || '';
}

function limpiarForm() {
  $('impId').value = ''; $('impNombre').value = ''; $('impHost').value = ''; $('impCodigo').value = ''; $('impSerie').value = ''; $('impPrograma').value = ''; $('impAce').checked = false;
  $('impCodigo').placeholder = '8 caracteres';
  $('tituloForm').textContent = 'Agregar impresora'; $('btnCancelarImp').classList.add('oculto');
  camposVisibles();
}

function pintar() {
  const c = $('cuenta');
  c.innerHTML = '';
  const fila = document.createElement('div');
  fila.className = 'estado';
  const punto = document.createElement('span');
  punto.className = 'punto' + (datos.conectado ? ' ok' : '');
  const txt = document.createElement('span');
  txt.textContent = datos.vinculado
    ? (datos.conectado ? 'Conectado a Manager3D como "' + datos.equipo + '".' : 'Vinculado, pero sin conexión (revisá internet o volvé a vincular).')
    : 'Sin vincular.';
  fila.append(punto, txt);
  c.append(fila);
  if (datos.vinculado) {
    const b = document.createElement('button');
    b.className = 'peligro'; b.style.marginLeft = '12px'; b.textContent = 'Desvincular esta PC';
    b.onclick = async () => { if (confirm('¿Desvincular este conector en esta PC?')) { datos = await api('/api/desvincular', {}); pintar(); } };
    fila.append(b);
  }
  $('vincular').classList.toggle('oculto', datos.vinculado);
  if (!$('equipo').value) $('equipo').value = datos.equipo;

  const sel = $('impTipo');
  if (!sel.options.length) {
    datos.tipos.filter((t) => !t.oculto).forEach((t) => { const o = document.createElement('option'); o.value = t.tipo; o.textContent = t.nombre; sel.append(o); });
    camposVisibles();
  }

  const tb = $('impresoras');
  tb.innerHTML = '';
  $('sinImpresoras').classList.toggle('oculto', datos.impresoras.length > 0);
  datos.impresoras.forEach((i) => {
    const tr = document.createElement('tr');
    const tipo = datos.tipos.find((t) => t.tipo === i.tipo);
    [i.nombre, tipo ? tipo.nombre : i.tipo, i.host || '—'].forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.append(td); });
    const td = document.createElement('td'); td.className = 'acciones';
    const probar = document.createElement('button'); probar.textContent = 'Probar';
    probar.onclick = async () => {
      probar.disabled = true; mensaje('msgImp', 'Probando ' + i.nombre + '…');
      try { const r = await api('/api/impresora/probar', { id: i.id }); mensaje('msgImp', r.mensaje, 'ok'); }
      catch (e) { mensaje('msgImp', e.message, 'error'); }
      probar.disabled = false; refrescar();
    };
    let cancelar = null;
    if (tipo && tipo.puedeCancelar) {
      cancelar = document.createElement('button'); cancelar.textContent = 'Cancelar trabajo';
      cancelar.title = 'Cancela lo que la impresora tenga en curso o preparando (por ejemplo, si quedó calentando la cama sin imprimir)';
      cancelar.onclick = async () => {
        if (!confirm('¿Cancelar lo que ' + i.nombre + ' tenga en curso? Si está imprimiendo, se detiene.')) return;
        cancelar.disabled = true; mensaje('msgImp', 'Cancelando en ' + i.nombre + '…');
        try { const r = await api('/api/impresora/cancelar', { id: i.id }); mensaje('msgImp', r.mensaje, 'ok'); }
        catch (e) { mensaje('msgImp', e.message, 'error'); }
        cancelar.disabled = false; refrescar();
      };
    }
    let diagnostico = null;
    if (tipo && tipo.puedeDiagnosticar) {
      diagnostico = document.createElement('button'); diagnostico.textContent = 'Diagnóstico';
      diagnostico.title = 'Muestra todo lo que contesta la impresora (para entender un problema)';
      diagnostico.onclick = async () => {
        diagnostico.disabled = true; mensaje('msgImp', 'Consultando a ' + i.nombre + '…');
        try {
          const r = await api('/api/impresora/diagnostico', { id: i.id });
          mensaje('msgImp', 'Diagnóstico de ' + i.nombre + ':', 'ok');
          $('diag').textContent = r.mensaje; $('diag').classList.remove('oculto'); $('btnCopiarDiag').classList.remove('oculto');
        } catch (e) { mensaje('msgImp', e.message, 'error'); }
        diagnostico.disabled = false; refrescar();
      };
    }
    const editar = document.createElement('button'); editar.textContent = 'Editar';
    editar.onclick = () => {
      $('impId').value = i.id; $('impNombre').value = i.nombre; $('impTipo').value = i.tipo; $('impHost').value = i.host;
      $('impSerie').value = i.serie; $('impPrograma').value = i.programa || ''; $('impAce').checked = i.tieneAce; $('impCodigo').value = '';
      $('impCodigo').placeholder = i.conCodigo ? '(se mantiene el guardado)' : '8 caracteres';
      $('tituloForm').textContent = 'Editar ' + i.nombre; $('btnCancelarImp').classList.remove('oculto'); camposVisibles();
    };
    const borrar = document.createElement('button'); borrar.className = 'peligro'; borrar.textContent = '✕';
    borrar.onclick = async () => { if (confirm('¿Quitar ' + i.nombre + '?')) { datos = await api('/api/impresora/borrar', { id: i.id }); pintar(); } };
    td.append(probar); if (cancelar) td.append(cancelar); if (diagnostico) td.append(diagnostico); td.append(editar, borrar); tr.append(td); tb.append(tr);
  });

  $('log').textContent = datos.log.join('\\n');
  $('log').scrollTop = $('log').scrollHeight;
  if (document.activeElement !== $('carpeta')) $('carpeta').value = datos.carpetaPropia ? datos.carpeta : '';
  $('carpeta').placeholder = datos.carpeta;
  $('avisoCarpeta').textContent = datos.carpetaPropia ? '' : 'Si la dejás vacía se usa: ' + datos.carpeta;
  $('datos').textContent = 'Configuración guardada en ' + datos.datos;
}

async function refrescar() { try { datos = await api('/api/estado'); pintar(); } catch { /* el conector se cerró */ } }

$('btnCopiarDiag').onclick = async () => {
  try { await navigator.clipboard.writeText($('diag').textContent); $('btnCopiarDiag').textContent = 'Copiado ✓'; setTimeout(() => { $('btnCopiarDiag').textContent = 'Copiar el diagnóstico'; }, 2000); }
  catch { /* sin permiso para copiar: se puede seleccionar a mano */ }
};
$('btnCarpeta').onclick = async () => {
  try { datos = await api('/api/carpeta', { carpeta: $('carpeta').value }); mensaje('msgCarpeta', 'Carpeta guardada.', 'ok'); pintar(); }
  catch (e) { mensaje('msgCarpeta', e.message, 'error'); }
};
$('btnProbarCarpeta').onclick = async () => {
  try { const r = await api('/api/impresora/probar', { id: 'carpeta' }); mensaje('msgCarpeta', r.mensaje, 'ok'); }
  catch (e) { mensaje('msgCarpeta', e.message, 'error'); }
};
$('impTipo').onchange = camposVisibles;
$('btnCancelarImp').onclick = limpiarForm;
$('btnVincular').onclick = async () => {
  $('btnVincular').disabled = true; mensaje('msgCuenta', 'Vinculando…');
  try { datos = await api('/api/vincular', { codigo: $('codigo').value, equipo: $('equipo').value }); mensaje('msgCuenta', 'Listo, conector vinculado.', 'ok'); pintar(); }
  catch (e) { mensaje('msgCuenta', e.message, 'error'); }
  $('btnVincular').disabled = false;
};
$('btnGuardarImp').onclick = async () => {
  try {
    datos = await api('/api/impresora', {
      id: $('impId').value, nombre: $('impNombre').value, tipo: $('impTipo').value, host: $('impHost').value,
      codigoAcceso: $('impCodigo').value, serie: $('impSerie').value, programa: $('impPrograma').value, tieneAce: $('impAce').checked
    });
    mensaje('msgImp', 'Impresora guardada.', 'ok'); limpiarForm(); pintar();
  } catch (e) { mensaje('msgImp', e.message, 'error'); }
};
refrescar();
setInterval(refrescar, 3000);
</script>
</body>
</html>`;
