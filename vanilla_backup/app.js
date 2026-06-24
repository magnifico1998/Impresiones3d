
let pedidos=[], compras=[], biblioteca=[], clientes=[], editPedidoId=null, editCompraId=null, pedidoDetalleId=null, gcodeData=null, presupuestoActual=null, precioVentaTocado=false;
// ✅ NUEVO
let subProductosActuales = [];
let _postCrearPedido=false;
let bibSeleccionados=new Set();
let pedidoObjetivoBib=null;
let armarPedidoItems=[];
let arpMontoFinalTocado=false;
let _arpVerCounter=1;
let _idCounter=1;
const newId=()=>_idCounter++;
const LS_PEDIDOS = 'p3d_pedidos', LS_COMPRAS = 'p3d_compras', LS_CFG = 'p3d_cfg', LS_COUNTER = 'p3d_counter', LS_BIB = 'p3d_bib', LS_CLIENTES= 'p3d_clientes', LS_EMPRESA = 'p3d_empresa';
let empresa = {nombre:'',cuit:'',direccion:'',cp:'',email:'',telefono:'',facebook:'',instagram:'',logo:''};
let cfg={
  filamentos:[{nombre:'PLA Blanco',precio:17000},{nombre:'PLA Negro',precio:18000},{nombre:'PLA Rojo',precio:18500},{nombre:'PLA Azul',precio:18500},{nombre:'PETG Transparente',precio:22000},{nombre:'ABS Gris',precio:19000},{nombre:'TPU',precio:28000}],
  impresoras:[{nombre:'Bambu X1',watts:350,mant:200},{nombre:'Prusa MK4',watts:200,mant:150},{nombre:'Ender 3',watts:120,mant:80}],
  insumos:[{nombre:'Soporte/raft',precio:500},{nombre:'Adhesivo de cama',precio:300},{nombre:'Lijado',precio:800},{nombre:'Pintado',precio:1500},{nombre:'Empaque / envío',precio:700}],
  colores:[{nombre:'Blanco',hex:'#f5f5f5'},{nombre:'Negro',hex:'#1a1a1a'},{nombre:'Rojo',hex:'#e53935'},{nombre:'Azul',hex:'#1e88e5'},{nombre:'Verde',hex:'#43a047'},{nombre:'Gris',hex:'#9e9e9e'},{nombre:'Amarillo',hex:'#fdd835'}],
  metodosEnvio:['Correo Argentino','Andreani','Retiro en persona','Envío propio'],
  kwh:120,mo:500,margen:100,desperdicio:5
};
const fmt=n=>'$'+Math.round(Number(n)).toLocaleString('es-AR');
const formatH=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?(m>0?`${h}h ${m}m`:`${h}h`):`${m}m`;};
const setStatus=(msg,t)=>{const el=document.getElementById('status-bar');el.className='status active '+t;el.textContent=msg;};
const clearStatus=()=>{document.getElementById('status-bar').className='status';};
const badgeText=e=>({pendiente:'Pendiente',progreso:'En progreso',listo:'Listo p/ entregar',completado:'Completado',cancelado:'Cancelado'}[e]||e);
const badgeHTML=(e, pedidoId)=>{
  if(!pedidoId) { 
     const m={pendiente:'badge-pending',progreso:'badge-progress',listo:'badge-listo',completado:'badge-done',cancelado:'badge-cancelled'};
     return `<span class="badge ${m[e]||''}">${badgeText(e)}</span>`;
  }
  return `<select class="status-select ${e}" onchange="cambiarEstadoPedidoRapido(event, ${pedidoId}, this.value)" onclick="event.stopPropagation()">
    <option value="pendiente" ${e==='pendiente'?'selected':''}>Pendiente</option>
    <option value="progreso" ${e==='progreso'?'selected':''}>En progreso</option>
    <option value="listo" ${e==='listo'?'selected':''}>Listo p/ entregar</option>
    <option value="completado" ${e==='completado'?'selected':''}>Completado</option>
    <option value="cancelado" ${e==='cancelado'?'selected':''}>Cancelado</option>
  </select>`;
};
const cerrarModal=id=>document.getElementById(id).classList.remove('open');
const getTimestamp=p=>{if(p.fechaPedido)return new Date(p.fechaPedido+'T12:00:00').getTime();if(p.creado){let pts=p.creado.split('/');if(pts.length===3)return new Date(pts[2],pts[1]-1,pts[0]).getTime();}return 0;};
function navTo(page,el){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('page-'+page).classList.add('active');
  if(page==='pedidos')renderPedidos();
  if(page==='clientes')renderClientes();
  if(page==='config')renderConfig();
  if(page==='resumen')renderResumen();
  if(page==='compras'){renderCompras();updateComprasStats();}
  if(page==='biblioteca')renderBibliotecaPage();
  if(page==='empresa')renderFormEmpresa();
  if(page==='calc'){
    document.getElementById('precio-kwh').value=cfg.kwh;
    document.getElementById('mano-obra').value=cfg.mo;
    document.getElementById('margen').value=cfg.margen;
    document.getElementById('desperdicio').value=cfg.desperdicio;
    calcular();
  }
}
function dzOver(e){e.preventDefault();document.getElementById('drop-zone').classList.add('over');}
function dzLeave(){document.getElementById('drop-zone').classList.remove('over');}
function dzDrop(e){e.preventDefault();dzLeave();const f=e.dataTransfer.files[0];if(f)leerArchivo(f);}
function leerArchivo(file){
  if(!file)return;
  clearStatus();setStatus('Leyendo archivo...','info');
  if(file.name.toLowerCase().endsWith('.3mf'))leer3mf(file);
  else{const r=new FileReader();r.onload=e=>parsearGcode(e.target.result,file.name);r.readAsText(file);}
}
async function leer3mf(file){
  setStatus('Descomprimiendo .3mf...','info');
  try{
    const zip=await JSZip.loadAsync(await file.arrayBuffer());
    const keys=Object.keys(zip.files);
    if(keys.includes('Metadata/slice_info.config')){
      setStatus('Bambu Studio detectado...','info');
      parsearBambuSliceInfo(await zip.files['Metadata/slice_info.config'].async('string'),file.name);return;
    }
    const gf=keys.find(n=>n.toLowerCase().endsWith('.gcode')||n.toLowerCase().endsWith('.gco'));
    if(gf){parsearGcode(await zip.files[gf].async('string'),file.name+' → '+gf);return;}
    setStatus('No se encontró G-code dentro del .3mf.','error');
  }catch(err){setStatus('Error: '+err.message,'error');}
}
function parsearBambuSliceInfo(xmlStr,nombre){
  try{
    const doc=new DOMParser().parseFromString(xmlStr,'text/xml');
    const placas=doc.querySelectorAll('plate');
    if(!placas.length){setStatus('No se encontraron placas.','error');return;}
    let totalSeg=0;const placasData=[];const matMap={};
    placas.forEach(plate=>{
      const gm=k=>plate.querySelector(`metadata[key="${k}"]`)?.getAttribute('value');
      const idx=gm('index')||'?',pred=parseInt(gm('prediction')||'0');
      const obj=plate.querySelector('object');
      const nom=(obj?.getAttribute('name')||`Placa ${idx}`).replace(/@.*$/,'').trim();
      const fils=[...plate.querySelectorAll('filament')].map(f=>({id:f.getAttribute('id'),type:f.getAttribute('type')||'?',color:f.getAttribute('color')||'#888',usedG:parseFloat(f.getAttribute('used_g')||'0')}));
      totalSeg+=pred;placasData.push({idx,nombre:nom,pred,fils,sel:true});
      fils.forEach(f=>{const k=`${f.type}|${f.color}`;if(!matMap[k])matMap[k]={type:f.type,color:f.color,totalG:0,precioKg:0};matMap[k].totalG+=f.usedG;});
    });
    Object.values(matMap).forEach(m=>{const match=cfg.filamentos.find(f=>f.nombre.toLowerCase().includes(m.type.toLowerCase()));m.precioKg=match?match.precio:(cfg.filamentos[0]?.precio||18000);});
    gcodeData={tipo:'bambu',placas:placasData,matMap,totalSeg,nombre};
    const nM=Object.keys(matMap).length,tG=Object.values(matMap).reduce((s,m)=>s+m.totalG,0);
    setStatus(`✓ ${placasData.length} placas · ${nM} material${nM>1?'es':''} · ${tG.toFixed(1)}g · ${formatH(totalSeg)}`,'success');
    mostrarBambu();
  }catch(err){setStatus('Error parseando: '+err.message,'error');}
}
function mostrarBambu(){
  const d=gcodeData,mats=Object.values(d.matMap);
  const tG=mats.reduce((s,m)=>s+m.totalG,0);
  let html=`<div class="chips">
    <div class="chip"><small>Placas</small><span id="chip-placas">${d.placas.length}</span></div>
    <div class="chip"><small>Filamento</small><span id="chip-g">${tG.toFixed(2)}g</span></div>
    <div class="chip"><small>Tiempo</small><span id="chip-t">${formatH(d.totalSeg)}</span></div>
    <div class="chip"><small>Materiales</small><span>${mats.length}</span></div>
  </div>
  <div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Materiales detectados</div>`;
  mats.forEach((m,i)=>{
    const opts=cfg.filamentos.map((f,fi)=>`<option value="${fi}" ${f.precio===m.precioKg?'selected':''}>${f.nombre}</option>`).join('');
    html+=`<div class="mat-row"><span class="color-dot" style="background:${m.color}"></span>
      <span><strong>${m.type}</strong> <span style="color:var(--text3);font-size:11px;font-family:var(--mono)">${m.color}</span> — <span id="mat-g-${i}">${m.totalG.toFixed(2)}g</span></span>
      <select onchange="onMatFilSelect(${i},this.value)"><option value="manual">Manual</option>${opts}</select>
      <input type="number" id="mat-precio-${i}" value="${m.precioKg}" step="100" oninput="onMatPrecioManual(${i},this.value)">
      <span style="font-size:10px;color:var(--text3)">$/kg</span></div>`;
  });
  html+=`<div style="height:1px;background:var(--border);margin:12px 0"></div>
  <div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Placas</div>
  <div class="plates-wrap"><table class="plates-tbl"><thead><tr>
    <th><input type="checkbox" id="sel-all" checked onchange="toggleAll(this.checked)"></th>
    <th>#</th><th>Pieza</th><th>Material</th><th>Gramos</th><th>Tiempo</th>
  </tr></thead><tbody id="plates-body"></tbody></table></div>`;
  document.getElementById('gcode-data').innerHTML=html;
  document.getElementById('gcode-resultado').style.display='block';
  renderPlatesBody();
}
function renderPlatesBody(){
  const tbody=document.getElementById('plates-body');if(!tbody||!gcodeData)return;
  let rows='';
  gcodeData.placas.forEach((p,i)=>{
    const multi=p.fils.length>1;
    const nombreLimpio=(p.nombre||'').replace(/\.(3mf|gcode|gco)$/i,'').replace(/\s*→.*$/,'').trim();
    rows+=`<tr class="plate-row"><td><input type="checkbox" ${p.sel?'checked':''} onchange="togglePlaca(${i},this.checked)"></td>
      <td style="color:var(--text3);font-family:var(--mono)">${p.idx}</td>
      <td style="font-weight:500">${nombreLimpio}</td>
      <td>${p.fils.map(f=>`<span class="color-dot" style="background:${f.color};margin-right:2px" title="${f.type}"></span>`).join('')}
        ${multi?`<span style="font-size:11px;color:var(--text3)">${p.fils.length} mats</span>`:`<span style="font-size:12px;color:var(--text2)">${p.fils[0]?.type||''}</span>`}</td>
      <td style="font-family:var(--mono)">${p.fils.reduce((s,f)=>s+f.usedG,0).toFixed(2)}g</td>
      <td style="font-family:var(--mono);color:var(--text2)">${formatH(p.pred)}</td></tr>`;
    if(multi)p.fils.forEach(f=>{rows+=`<tr class="fil-sub"><td></td><td></td><td style="color:var(--text3)">↳ ${f.type}</td>
      <td><span class="color-dot" style="background:${f.color};margin-right:4px"></span><span style="font-size:11px;font-family:var(--mono)">${f.color}</span></td>
      <td style="font-family:var(--mono)">${f.usedG.toFixed(2)}g</td><td></td></tr>`;});
  });
  tbody.innerHTML=rows;recalcChips();
}
function togglePlaca(i,v){gcodeData.placas[i].sel=v;recalcChips();}
function toggleAll(v){gcodeData.placas.forEach(p=>p.sel=v);renderPlatesBody();}
function recalcChips(){
  if(!gcodeData)return;
  const sel=gcodeData.placas.filter(p=>p.sel);
  const t=sel.reduce((s,p)=>s+p.pred,0);const ms={};
  sel.forEach(p=>p.fils.forEach(f=>{const k=`${f.type}|${f.color}`;ms[k]=(ms[k]||0)+f.usedG;}));
  const g=Object.values(ms).reduce((s,v)=>s+v,0);
  const cp=document.getElementById('chip-placas'),cg=document.getElementById('chip-g'),ct=document.getElementById('chip-t');
  if(cp)cp.textContent=sel.length;if(cg)cg.textContent=g.toFixed(2)+'g';if(ct)ct.textContent=formatH(t);
  Object.values(gcodeData.matMap).forEach((m,i)=>{const el=document.getElementById(`mat-g-${i}`);if(el)el.textContent=(ms[`${m.type}|${m.color}`]||0).toFixed(2)+'g';});
  calcular();
}
function onMatFilSelect(i,v){const m=Object.values(gcodeData.matMap)[i];if(v==='manual')return;m.precioKg=cfg.filamentos[parseInt(v)].precio;const inp=document.getElementById(`mat-precio-${i}`);if(inp)inp.value=m.precioKg;calcular();}
function onMatPrecioManual(i,v){Object.values(gcodeData.matMap)[i].precioKg=parseFloat(v)||0;calcular();}
function aplicarGcode(){
  if(!gcodeData)return;
  if(gcodeData.tipo==='bambu'){
    const sel=gcodeData.placas.filter(p=>p.sel);
    const t=sel.reduce((s,p)=>s+p.pred,0);const ms={};
    sel.forEach(p=>p.fils.forEach(f=>{const k=`${f.type}|${f.color}`;ms[k]=(ms[k]||0)+f.usedG;}));
    Object.entries(ms).forEach(([k,g])=>{if(gcodeData.matMap[k])gcodeData.matMap[k].totalG=g;});
    document.getElementById('horas').value=(t/3600).toFixed(3);
    document.getElementById('tag-gcode-tiempo').style.display='inline-block';
    renderMultiFilUI();
  } else {
    if(gcodeData.gramos!==null){document.getElementById('gramos').value=gcodeData.gramos.toFixed(2);document.getElementById('tag-gcode-gramos').style.display='inline-block';}
    if(gcodeData.tiempo!==null){document.getElementById('horas').value=gcodeData.tiempo.toFixed(3);document.getElementById('tag-gcode-tiempo').style.display='inline-block';}
  }
  calcular();
}
function renderMultiFilUI(){
  if(!gcodeData||gcodeData.tipo!=='bambu')return;
  const mats=Object.values(gcodeData.matMap);
  const wrap=document.getElementById('manual-fil-wrap');
  if(mats.length===1){wrap.style.display='block';document.getElementById('gramos').value=mats[0].totalG.toFixed(2);document.getElementById('precio-rollo').value=mats[0].precioKg;document.getElementById('tag-gcode-gramos').style.display='inline-block';return;}
  wrap.style.display='none';const ex=document.getElementById('multi-fil-ui');if(ex)ex.remove();
  let html=`<div id="multi-fil-ui"><div style="font-size:12px;color:var(--text3);margin-bottom:8px"><span class="pill">desde archivo</span> ${mats.length} materiales</div>
  <div style="display:grid;grid-template-columns:14px 1fr 90px 90px;gap:8px;padding:0 0 6px;border-bottom:1px solid var(--border);font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.5px"><span></span><span>Material</span><span>Gramos</span><span>$/kg</span></div>`;
  mats.forEach((m,i)=>{html+=`<div style="display:grid;grid-template-columns:14px 1fr 90px 90px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
    <span class="color-dot" style="background:${m.color}"></span>
    <span><strong>${m.type}</strong> <span style="color:var(--text3);font-size:11px;font-family:var(--mono)">${m.color}</span></span>
    <input type="number" value="${m.totalG.toFixed(2)}" step="0.1" id="mfil-g-${i}" oninput="calcular()" style="font-size:12px;padding:4px 6px">
    <input type="number" value="${m.precioKg}" step="100" id="mfil-p-${i}" oninput="calcular()" style="font-size:12px;padding:4px 6px">
  </div>`;});
  html+=`</div>`;
  document.getElementById('filamentos-body').insertAdjacentHTML('beforeend',html);
}
function resetGcode(){
  gcodeData=null;
  precioVentaTocado=false;
  document.getElementById('gcode-resultado').style.display='none';
  document.getElementById('tag-gcode-gramos').style.display='none';
  document.getElementById('tag-gcode-tiempo').style.display='none';
  document.getElementById('gcode-file').value='';
  document.getElementById('manual-fil-wrap').style.display='block';
  const mf=document.getElementById('multi-fil-ui');if(mf)mf.remove();
  clearStatus();
}
function parsearGcode(text,nombre){
  // Intentar primero detectar el formato multi-material (footer con filament_type;filament_colour;filament used [g] por herramienta)
  if(intentarParsearGcodeMultiMaterial(text,nombre)) return;
  let gramos=null,tiempo=null,filamento=null;
  for(const line of text.split('\n')){
    if(gramos===null){const m=line.match(/filament\s+used\s*[=:]\s*([\d.]+)\s*g/i)||line.match(/;\s*filament_used\s*=\s*([\d.]+)/i);if(m)gramos=parseFloat(m[1]);}
    if(tiempo===null){const m=line.match(/estimated\s+printing\s+time.*?[=:]\s*(.+)/i)||line.match(/;\s*TIME\s*:\s*(\d+)/i);if(m)tiempo=m[0].toUpperCase().includes('TIME:')?parseInt(m[1])/3600:parseTiempoStr(m[1]);}
    if(filamento===null){const m=line.match(/;\s*filament_type\s*=\s*(.+)/i);if(m)filamento=m[1].trim();}
  }
  gcodeData={tipo:'gcode',gramos,tiempo,filamento,nombre};
  if(gramos!==null||tiempo!==null)setStatus('Datos extraídos correctamente.','success');
  else setStatus('No se detectaron datos. Ingresalos manualmente.','warning');
  document.getElementById('gcode-data').innerHTML=`<div class="chips">
    <div class="chip"><small>Archivo</small><span>${nombre}</span></div>
    ${filamento?`<div class="chip"><small>Material</small><span>${filamento}</span></div>`:''}
    <div class="chip"><small>Filamento</small><span>${gramos!==null?gramos.toFixed(2)+'g':'—'}</span></div>
    <div class="chip"><small>Tiempo</small><span>${tiempo!==null?formatH(tiempo*3600):'—'}</span></div>
  </div>`;
  document.getElementById('gcode-resultado').style.display='block';
}
function intentarParsearGcodeMultiMaterial(text,nombre){
  // Formato compartido por BambuStudio/OrcaSlicer/AnycubicSlicerNext en .gcode plano (no .3mf):
  // un bloque de comentarios al final con listas separadas por ";" (una entrada por herramienta/slot)
  const mUsed = text.match(/;\s*filament used \[g\]\s*=\s*([0-9.,\s]+)/i);
  const mType = text.match(/;\s*filament_type\s*=\s*([^\r\n]+)/i);
  if(!mUsed || !mType) return false;
  const tiposArr = mType[1].split(';').map(s=>s.trim()).filter(Boolean);
  if(tiposArr.length<2) return false; // no es multi-herramienta, dejar que lo maneje el parser simple
  const gramosArr = mUsed[1].split(',').map(s=>parseFloat(s.trim())||0);
  const mColor = text.match(/;\s*filament_colour\s*=\s*([^\r\n]+)/i) || text.match(/;\s*extruder_colour\s*=\s*([^\r\n]+)/i);
  const coloresArr = mColor ? mColor[1].split(';').map(s=>s.trim()) : [];
  const mTiempo = text.match(/;\s*estimated printing time \(normal mode\)\s*=\s*([^\r\n]+)/i);
  const horas = mTiempo ? (parseTiempoStr(mTiempo[1])||0) : 0;
  const totalSeg = horas*3600;
  const fils=[];
  for(let i=0;i<tiposArr.length;i++){
    const g = gramosArr[i]||0;
    if(g<=0) continue; // solo herramientas realmente usadas
    fils.push({id:String(i), type:tiposArr[i]||'PLA', color:coloresArr[i]||'#888888', usedG:g});
  }
  if(!fils.length) return false;
  const matMap={};
  fils.forEach(f=>{
    const k=`${f.type}|${f.color}`;
    if(!matMap[k])matMap[k]={type:f.type,color:f.color,totalG:0,precioKg:0};
    matMap[k].totalG+=f.usedG;
  });
  Object.values(matMap).forEach(m=>{
    const match=cfg.filamentos.find(f=>f.nombre.toLowerCase().includes(m.type.toLowerCase()));
    m.precioKg=match?match.precio:(cfg.filamentos[0]?.precio||18000);
  });
  const placa={idx:'1',nombre,pred:totalSeg,fils,sel:true};
  gcodeData={tipo:'bambu',placas:[placa],matMap,totalSeg,nombre};
  const nM=Object.keys(matMap).length,tG=Object.values(matMap).reduce((s,m)=>s+m.totalG,0);
  setStatus(`✓ G-code multi-material detectado · ${nM} material${nM>1?'es':''} · ${tG.toFixed(1)}g · ${formatH(totalSeg)}`,'success');
  mostrarBambu();
  return true;
}
const parseTiempoStr=str=>{const sh=str.match(/(\d+)\s*h/i),sm=str.match(/(\d+)\s*m/i),ss=str.match(/(\d+)\s*s/i);let t=0;if(sh)t+=parseInt(sh[1]);if(sm)t+=parseInt(sm[1])/60;if(ss)t+=parseInt(ss[1])/3600;if(!t){const mn=str.match(/(\d+)/);if(mn)t=parseInt(mn[1])/60;}return t||null;};
function calcular(){
  const horas=parseFloat(document.getElementById('horas').value)||0;
  const watts=parseFloat(document.getElementById('watts').value)||0;
  const pKwh=parseFloat(document.getElementById('precio-kwh').value)||0;
  const moH=parseFloat(document.getElementById('mano-obra').value)||0;
  const hTrab=parseFloat(document.getElementById('horas-trabajo').value)||0;
  const extras=parseFloat(document.getElementById('extras').value)||0;
  const margen=parseFloat(document.getElementById('margen').value)||0;
  const despDef=(parseFloat(document.getElementById('desperdicio')?.value)||cfg.desperdicio)/100;
  let costeFil=0,filDetalle=[];
  const multiUI=document.getElementById('multi-fil-ui');
  if(gcodeData&&gcodeData.tipo==='bambu'&&multiUI){
    Object.values(gcodeData.matMap).forEach((m,i)=>{
      const g=parseFloat(document.getElementById(`mfil-g-${i}`)?.value||m.totalG)||0;
      const p=parseFloat(document.getElementById(`mfil-p-${i}`)?.value||m.precioKg)||0;
      const c=(g*(1+despDef)/1000)*p;costeFil+=c;
      filDetalle.push({label:`${m.type} (${g.toFixed(1)}g)`,costo:c,color:m.color});
    });
  } else {
    const pr=parseFloat(document.getElementById('precio-rollo').value)||0;
    const gr=parseFloat(document.getElementById('gramos').value)||0;
    const dp=parseFloat(document.getElementById('desperdicio').value)||0;
    costeFil=(gr*(1+dp/100)/1000)*pr;filDetalle=[{label:'Filamento',costo:costeFil,color:null}];
  }
  const costeElec=(watts/1000)*horas*pKwh;
  const impSelV=document.getElementById('sel-impresora')?.value;
  const mantH=(impSelV&&impSelV!=='manual'&&cfg.impresoras[parseInt(impSelV)])?cfg.impresoras[parseInt(impSelV)].mant||0:0;
  const costeMant=mantH*horas;
  const costeMO=moH*hTrab;
  let costeIns=0;
  document.querySelectorAll('.insumo-check-input').forEach(cb=>{if(cb.checked){const qty=parseFloat(cb.closest('.insumo-row').querySelector('.insumo-qty')?.value||1);costeIns+=(parseFloat(cb.dataset.precio)||0)*qty;}});
  const costePorUnidad = costeFil+costeElec+costeMant+costeMO+costeIns+extras;
  const cantBase=parseFloat(document.getElementById('cantidad')?.value||1)||1;
  const total = costePorUnidad * cantBase;
  const precioSugerido=total*(1+margen/100);
  const precioInput=document.getElementById('r-precio-input');
  let precio;
  if(precioVentaTocado && precioInput && precioInput.value!==''){
    precio=parseFloat(precioInput.value)||0;
  } else {
    precio=Math.round(precioSugerido*100)/100;
    if(precioInput) precioInput.value=precio;
  }
  const margenEfectivo = total>0 ? ((precio-total)/total*100) : 0;
  document.getElementById('r-fil').textContent=fmt(costeFil*cantBase);
  document.getElementById('r-fil-detalle').innerHTML=filDetalle.length>1?filDetalle.map(f=>`<div class="r-row sub"><span>${f.color?`<span class="color-dot" style="background:${f.color};margin-right:4px"></span>`:''}${f.label}</span><span>${fmt(f.costo*cantBase)}</span></div>`).join(''):'';
  document.getElementById('r-elec').textContent=fmt(costeElec*cantBase);
  const rmEl=document.getElementById('r-mant');if(rmEl)rmEl.textContent=fmt(costeMant*cantBase);
  document.getElementById('r-mo').textContent=fmt(costeMO*cantBase);
  document.getElementById('r-ins').textContent=fmt(costeIns*cantBase);
  document.getElementById('r-ext').textContent=fmt(extras*cantBase);
  document.getElementById('r-total').textContent=fmt(total);
  document.getElementById('sc-costo').textContent=fmt(total);
  document.getElementById('sc-precio').textContent=fmt(precio);
  document.getElementById('sc-ganancia').textContent=fmt(precio-total);
  document.getElementById('sc-margen').textContent=margenEfectivo.toFixed(0)+'%';
  presupuestoActual={
    costeFil:costeFil,filDetalle:filDetalle,costeElec:costeElec,costeMO:costeMO,costeIns:costeIns,extras:extras,
    total: costePorUnidad, 
    precio: cantBase>0 ? precio/cantBase : precio, 
    horas:horas,cantidad:cantBase,margen,costeMant:costeMant,
    nombreArchivo:gcodeData?.nombre||null,impresoraNombre:getImpresoraNombre()
  };

  // ===============================
// ✅ PRODUCTOS COMPUESTOS
// ===============================

  function agregarSubproductoActual() {
  if (!presupuestoActual || presupuestoActual.total === 0) {
    mostrarToast('Primero calculá el G-code', 'error');
    return;
  }

  const nombre = gcodeData?.nombre 
    ? gcodeData.nombre.replace(/\.(3mf|gcode|gco)$/i,'').trim()
    : `G-code ${subProductosActuales.length + 1}`;

  subProductosActuales.push({
    nombre,
    ...presupuestoActual
  });

  mostrarToast(`✓ G-code agregado (${subProductosActuales.length})`);

  actualizarResumenMultiProducto();
 }

function actualizarResumenMultiProducto() {
  if (!subProductosActuales.length) return;

  let total = 0;
  let precio = 0;
  let horas = 0;

  subProductosActuales.forEach(p => {
    total += (p.total || 0);
    precio += (p.precio || 0);
    horas += (p.horas || 0);
  });

  presupuestoActual = {
    ...presupuestoActual,
    total,
    precio,
    horas,
    esCompuesto: true,
    subProductos: [...subProductosActuales]
  };

  calcular();
}
}
function onPrecioVentaManualInput(){
  precioVentaTocado=true;
  calcular();
}
function resetPrecioVentaManual(){
  precioVentaTocado=false;
  calcular();
}
function agregarPiezaAPedido(){
  if(!presupuestoActual||presupuestoActual.total===0){alert('Primero calculá el costo de la pieza.');return;}
  const pedidosActivos=pedidos.filter(p=>p.estado!=='cancelado'&&p.estado!=='completado');
  if(!pedidosActivos.length){
    if(confirm('No hay pedidos activos disponibles (los completados o cancelados no reciben piezas). ¿Querés crear un pedido nuevo?')){abrirModalNuevoPedido(true);}
    return;
  }
  const nombreSug=gcodeData?.nombre?gcodeData.nombre.replace(/\.(3mf|gcode|gco)$/i,'').replace(/\s*→.*$/,'').trim():'Pieza';
  document.getElementById('ap-nombre').value=nombreSug;
  document.getElementById('ap-pedido-sel').innerHTML=pedidosActivos.map(p=>`<option value="${p.id}">${p.cliente} — ${p.desc||'Sin descripción'} [${badgeText(p.estado)}]</option>`).join('');
  document.getElementById('ap-resumen').innerHTML=`Costo: <strong>${fmt(presupuestoActual.total * presupuestoActual.cantidad)}</strong> · Precio sugerido: <strong>${fmt(presupuestoActual.precio * presupuestoActual.cantidad)}</strong> · ${presupuestoActual.cantidad} unidad(es)`;
  document.getElementById('modal-agregar-pieza').classList.add('open');
}
function confirmarAgregarPieza(){
  const nombre=document.getElementById('ap-nombre').value||'Sin nombre';
  const pedidoId=parseInt(document.getElementById('ap-pedido-sel').value);
  const pedido=pedidos.find(p=>p.id===pedidoId);
  if(!pedido||!presupuestoActual)return;
  const pz = presupuestoActual;
  const nuevaPieza = {
    id: newId(), nombre,
    archivoNombre:pz.nombreArchivo||null,
    costeFil:pz.costeFil, filDetalle:pz.filDetalle, costeElec:pz.costeElec,
    costeMant:pz.costeMant||0, costeMO:pz.costeMO, horas:pz.horas,
    impresoraNombre:pz.impresoraNombre||null,
    costoUnitario: pz.total,
    precioVenta: pz.precio||0,
    cantidad: pz.cantidad,
    elaborados: 0,
    notas:''
  };
  pedido.piezas.push(nuevaPieza);
  recalcularVentaPedido(pedido);
  cerrarModal('modal-agregar-pieza');
  limpiarCalculadora();
  renderPedidos();updateStats();
  if(confirm(`✓ Pieza "${nombre}" agregada a "${pedido.cliente}". ¿Ver el pedido?`)){
    navTo('pedidos',document.querySelectorAll('.nav-item')[1]);
    setTimeout(()=>abrirDetallePedido(pedidoId),100);
  }
}
function abrirModalNuevoPedido(postAgregar=false){
  _postCrearPedido=postAgregar;
  editPedidoId=null;
  document.getElementById('modal-pedido-title').textContent='Nuevo pedido';
  ['m-cliente','m-desc','m-fecha-pedido','m-fecha-entrega','m-nota-general'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('m-estado').value='pendiente';
  document.getElementById('modal-pedido').classList.add('open');
}
function abrirModalEditarPedido(id){
  const p=pedidos.find(x=>x.id===id);if(!p)return;
  editPedidoId=id;
  document.getElementById('modal-pedido-title').textContent='Editar pedido';
  document.getElementById('m-cliente').value=p.cliente;
  document.getElementById('m-desc').value=p.desc;
  document.getElementById('m-estado').value=p.estado;
  document.getElementById('m-fecha-pedido').value=p.fechaPedido||p.fecha||'';
  document.getElementById('m-fecha-entrega').value=p.fechaEntrega||'';
  document.getElementById('m-nota-general').value=p.notaGeneral||'';
  document.getElementById('modal-pedido').classList.add('open');
}
function guardarPedido(){
  const d={cliente:document.getElementById('m-cliente').value||'Sin nombre',desc:document.getElementById('m-desc').value||'',estado:document.getElementById('m-estado').value,fechaPedido:document.getElementById('m-fecha-pedido').value,fechaEntrega:document.getElementById('m-fecha-entrega').value,notaGeneral:document.getElementById('m-nota-general').value||''};
  if(editPedidoId!==null){
    const p=pedidos.find(x=>x.id===editPedidoId);
    if(p){
      const eraCompletado = p.estado === 'completado';
      Object.assign(p,d);
      if(p.estado === 'completado' && !eraCompletado && !p.fechaCompletado) {
        p.fechaCompletado = new Date().toISOString().slice(0,10);
      } else if(p.estado !== 'completado') {
        p.fechaCompletado = null;
      }
    }
  }
  else{const nuevo={id:newId(),piezas:[],precioVenta:0,insumos:[],...d,creado:new Date().toLocaleDateString('es-AR')};pedidos.push(nuevo);editPedidoId=nuevo.id;}
  cerrarModal('modal-pedido');renderPedidos();updateStats();
  if(_postCrearPedido){_postCrearPedido=false;setTimeout(()=>agregarPiezaAPedido(),150);}
}
function editarPedidoActual(){cerrarModal('modal-detalle');abrirModalEditarPedido(pedidoDetalleId);}
function eliminarPedidoActual(){
  if(!confirm('¿Eliminar este pedido y todas sus piezas?'))return;
  pedidos=pedidos.filter(p=>p.id!==pedidoDetalleId);
  cerrarModal('modal-detalle');renderPedidos();updateStats();
}
function cambiarEstadoPedidoRapido(e, id, nuevoEstado) {
  if(e) e.stopPropagation();
  const p = pedidos.find(x => x.id === id);
  if(!p) return;
  p.estado = nuevoEstado;
  if (nuevoEstado === 'completado' && !p.fechaCompletado) {
    p.fechaCompletado = new Date().toISOString().slice(0,10);
  } else if (nuevoEstado !== 'completado') {
    p.fechaCompletado = null;
  }
  guardarEstado();
  renderPedidos();
  updateStats();
  renderResumen();
  if (document.getElementById('modal-cliente-detalle').classList.contains('open') && detalleClienteId) {
      verDetalleCliente(detalleClienteId);
  }
  mostrarToast('Estado actualizado a: ' + badgeText(nuevoEstado));
}
function agregarDesdeBiblioteca(){
  if(!biblioteca.length){ mostrarToast('No hay productos guardados en la Biblioteca todavía.', 'error'); return; }
  pedidoObjetivoBib = pedidoDetalleId;
  cerrarModal('modal-detalle');
  bibSeleccionados.clear();
  navTo('biblioteca', document.querySelectorAll('.nav-item')[5]);
  mostrarToast('Seleccioná los productos y presioná "Crear pedido" para agregarlos a este pedido.', 'info');
}
function abrirDetallePedido(id){
  pedidoDetalleId=id;
  const p=pedidos.find(x=>x.id===id);if(!p)return;
  document.getElementById('det-titulo').textContent=p.cliente;
  let metaStr=`${p.desc||'Sin descripción'} · ${badgeText(p.estado)}`;
  if(p.fechaPedido)metaStr+=` · Pedido: ${p.fechaPedido}`;
  if(p.fechaEntrega)metaStr+=` · Entrega: ${p.fechaEntrega}`+(esUrgente(p)?' ⚠':'');
  document.getElementById('det-meta').textContent=metaStr;
  document.getElementById('det-precio-venta').value=p.precioVenta||'';
  document.getElementById('det-envio').value=p.envio||'';
  document.getElementById('det-nota-general').value=p.notaGeneral||'';
  const selMetodo=document.getElementById('det-metodo-envio');
  if(selMetodo){
    selMetodo.innerHTML='<option value="">— Sin especificar —</option>'+(cfg.metodosEnvio||[]).map(m=>`<option value="${m}" ${m===p.metodoEnvio?'selected':''}>${m}</option>`).join('');
  }
  document.getElementById('det-num-seguimiento').value=p.numeroSeguimiento||'';
  renderDetallePiezas(p);renderDetalleInsumos(p);actualizarTotalDetalle(p);
  document.getElementById('modal-detalle').classList.add('open');
}
function actualizarNotaPieza(pedidoId, piezaId, nota) {
  const p = pedidos.find(x => x.id === pedidoId); if(!p) return;
  const pz = p.piezas.find(x => x.id === piezaId); if(!pz) return;
  pz.notas = nota;
  guardarEstado();
  mostrarToast('Nota guardada');
}
function renderDetallePiezas(p){
  const cont=document.getElementById('det-piezas');
  if(!p.piezas.length){cont.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px;font-family:var(--mono)">Sin piezas todavía. Usá la calculadora para agregar G-codes.</div>`;return;}
  p.piezas.forEach(pz => {
     if(pz.elaborados === undefined) pz.elaborados = 0;
     if(pz.completada === undefined) pz.completada = false;
     // init realizados on each version
     if(pz.versiones) pz.versiones.forEach(v=>{ if(v.realizados===undefined) v.realizados=0; });
  });
  const totalPiezas = p.piezas.reduce((t, pz) => t + pz.cantidad, 0);
  const totalHechas = p.piezas.reduce((t, pz) => t + pz.elaborados, 0);
  const pct = totalPiezas > 0 ? Math.round(totalHechas/totalPiezas*100):0;
  const barHTML=`<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:12px;color:var(--text2)">Progreso de fabricación</span>
      <span style="font-size:12px;font-family:var(--mono);font-weight:600;color:${pct===100?'var(--accent)':'var(--text2)'}">${totalHechas}/${totalPiezas} unidades — ${pct}%</span>
    </div>
    <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .4s ease"></div>
    </div>
  </div>`;
  cont.innerHTML = barHTML + p.piezas.map(pz => {
      pz.completada = (pz.elaborados >= pz.cantidad);
      const costoTotalPieza = (pz.costoUnitario || pz.total) * pz.cantidad;
      const faltan = pz.cantidad - pz.elaborados;
      if(!pz.versiones) pz.versiones = [];
      const tieneVersiones = pz.cantidad > 1;

      // Status badge
      let prodStatusHTML = '';
      if(pz.completada) prodStatusHTML = `<div class="prod-status prod-status-ok">✓ COMPLETADO</div>`;
      else if(faltan > 0) prodStatusHTML = `<div class="prod-status prod-status-faltan">FALTAN ${faltan}</div>`;
      else prodStatusHTML = `<div class="prod-status"></div>`;

      // Versiones editables
      let versionesHTML = '';
      if(tieneVersiones) {
        // Ensure all versions have IDs (migration for older saved data)
        pz.versiones.forEach(v=>{ if(v.id===undefined) v.id=_arpVerCounter++; if(v.realizados===undefined) v.realizados=0; });
        const rows = pz.versiones.map(v => {
          const hex = colorHexPorNombre(v.color);
          const dot = hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${hex};border:1px solid var(--border);flex-shrink:0;margin-right:3px"></span>` : '';
          const vReal = v.realizados||0;
          const vDone = vReal >= v.cantidad;
          const badge = vDone
            ? `<span class="det-ver-badge ok">✓ LISTO</span>`
            : `<span class="det-ver-badge pend">${vReal}/${v.cantidad}</span>`;
          const colorOpts = (cfg.colores||[]).map(c=>`<option value="${c.nombre}" ${c.nombre===v.color?'selected':''}>${c.nombre}</option>`).join('');
          return `<div class="det-ver-row">
            <div class="det-ver-realizados">
              <input type="number" value="${vReal}" min="0" max="${v.cantidad}"
                onchange="actualizarVersionDetallePieza(${p.id},${pz.id},${v.id},'realizados',this.value)">
              <span>/ <input type="number" value="${v.cantidad}" min="1" max="${pz.cantidad - pz.versiones.filter(x=>x.id!==v.id).reduce((s,x)=>s+x.cantidad,0)}" style="width:34px;font-size:11px;padding:2px 3px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text1);text-align:center"
                onchange="actualizarVersionDetallePieza(${p.id},${pz.id},${v.id},'cantidad',this.value)"></span>
            </div>
            <div style="display:flex;align-items:center;gap:3px">
              ${dot}
              <select style="flex:1;font-size:11px;padding:3px 4px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text1)"
                onchange="actualizarVersionDetallePieza(${p.id},${pz.id},${v.id},'color',this.value)">
                <option value="">Sin color</option>
                ${colorOpts}
              </select>
            </div>
            <input type="text" value="${v.comentario||''}" placeholder="Comentario..."
              style="font-size:11px;padding:3px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text1)"
              onchange="actualizarVersionDetallePieza(${p.id},${pz.id},${v.id},'comentario',this.value)">
            <div style="display:flex;gap:4px;align-items:center">
              ${badge}
              <button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:11px" onclick="quitarVersionEnDetalle(${p.id},${pz.id},${v.id})">✕</button>
            </div>
          </div>`;
        }).join('');
        const sumReal = pz.versiones.reduce((s,v)=>s+(v.realizados||0),0);
        const sumAsignado = pz.versiones.reduce((s,v)=>s+v.cantidad,0);
        const faltanAsignar = pz.cantidad - sumAsignado;
        versionesHTML = `<div style="margin-top:10px;padding:8px 10px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-family:var(--mono)">Versiones</span>
            <span style="font-size:11px;font-family:var(--mono);color:var(--text2)">Realizadas: <strong>${sumReal}/${pz.cantidad}</strong></span>
          </div>
          <div style="margin-bottom:6px;font-size:11px;font-family:var(--mono);color:${faltanAsignar===0?'var(--accent)':'var(--warn)'}">${faltanAsignar===0?'✓ Cantidades asignadas completas':'⚠ Faltan asignar '+faltanAsignar+' unidad(es) entre versiones'}</div>
          <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:4px;display:grid;grid-template-columns:84px 1fr 1fr auto;gap:6px">
            <span>Real / Total</span><span>Color</span><span>Comentario</span><span></span>
          </div>
          ${rows}
          ${faltanAsignar>0?`<button class="btn btn-sm" style="margin-top:8px;width:100%;font-size:11px" onclick="agregarVersionEnDetalle(${p.id},${pz.id})">+ Agregar versión (faltan ${faltanAsignar})</button>`:''}
        </div>`;
      }

      // Precio estimado (from library-sourced pieces)
      const precioEstHTML = pz.precioEstimado
        ? `<div style="font-size:11px;font-family:var(--mono);color:var(--text3);margin-top:2px">Precio est. ${fmt(pz.precioEstimado)}/u</div>`
        : '';

      // Precio de venta: editable, prominent (top), sums up to the pedido's total venta
      const precioVentaUnit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado||0);
      const ventaSubtotal = precioVentaUnit * pz.cantidad;

      // Costo: read-only note, shown at the bottom of the piece
      const costoNotaHTML = `<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:6px">Costo: ${fmt(costoTotalPieza)}</div>`;
// ✅ SUBPRODUCTOS (nuevo)
      let subHTML = '';

      if (pz.subProductos && pz.subProductos.length) {
        subHTML = `
        <div style="margin-top:6px;font-size:11px;opacity:.7">
      Subproductos:
      ${pz.subProductos.map(sp => `
        <div>• ${sp.nombre || 'G-code'} — ${fmt(sp.total || 0)}</div>
      `).join('')}
    </div>
     `;
    }

      // prod-control: if real versiones exist, show derived elaborados as read-only; otherwise editable manually
      const tieneVersionesReal = pz.versiones.length > 0;
      const controlHTML = tieneVersionesReal
        ? `<div class="prod-control">
             <label>Cantidad</label>
             <input type="number" value="${pz.cantidad}" min="1" onchange="actualizarProduccion(${p.id}, ${pz.id}, 'cantidad', this.value)">
             <label>Realizados</label>
             <span style="font-family:var(--mono);font-size:13px;font-weight:600;padding:0 4px">${pz.elaborados}/${pz.cantidad}</span>
             ${prodStatusHTML}
           </div>`
        : `<div class="prod-control">
             <label>Cantidad</label>
             <input type="number" value="${pz.cantidad}" min="1" onchange="actualizarProduccion(${p.id}, ${pz.id}, 'cantidad', this.value)">
             <label>Elaborados</label>
             <input type="number" value="${pz.elaborados}" min="0" max="${pz.cantidad}" onchange="actualizarProduccion(${p.id}, ${pz.id}, 'elaborados', this.value)">
             ${prodStatusHTML}
           </div>`;

      return `<div class="pieza-card${pz.completada?' completada':''}">
        <div class="pieza-header">
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:13px;${pz.completada?'text-decoration:line-through;color:var(--text3)':''}">${pz.nombre}</div>
            ${pz.archivoNombre?`<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:2px">${pz.archivoNombre}</div>`:''}
            ${pz.impresoraNombre?`<div style="font-size:11px;font-family:var(--mono);color:var(--text3);margin-top:4px">🖨 ${pz.impresoraNombre}</div>`:''}
            ${precioEstHTML}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <input type="number" value="${ventaSubtotal}" min="0" step="0.01" title="Precio de venta (editable)"
              style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--accent);background:transparent;border:none;text-align:right;width:90px;padding:2px 0"
              onchange="actualizarPrecioVentaPieza(${p.id},${pz.id},this.value)">
            <button class="btn btn-danger btn-sm" onclick="eliminarPieza(${p.id},${pz.id})">✕</button>
          </div>
        </div>
        ${controlHTML}
        ${versionesHTML}
        ${costoNotaHTML}
        ${subHTML}  
        <div style="margin-top:8px">
          <input type="text" class="pieza-nota-input" placeholder="Añadir nota a esta pieza (color, detalle...)" value="${pz.notas||''}" onchange="actualizarNotaPieza(${p.id}, ${pz.id}, this.value)">
        </div>
      </div>`
    }).join('');
}
function recalcularVentaPedido(p){
  if(!p) return;
  p.precioVenta = p.piezas.reduce((s,pz)=>{
    const unit = pz.precioVenta !== undefined ? pz.precioVenta : (pz.precioEstimado||0);
    return s + unit*pz.cantidad;
  },0);
  const inp = document.getElementById('det-precio-venta');
  if(inp) inp.value = p.precioVenta;
}
function actualizarPrecioVentaPieza(pedidoId, piezaId, valor){
  const p = pedidos.find(x=>x.id===pedidoId); if(!p) return;
  const pz = p.piezas.find(x=>x.id===piezaId); if(!pz) return;
  const totalIngresado = Math.max(0, parseFloat(valor)||0);
  // The input represents the piece's total sale amount; store as per-unit internally
  pz.precioVenta = pz.cantidad > 0 ? totalIngresado / pz.cantidad : totalIngresado;
  recalcularVentaPedido(p);
  guardarEstado();
  renderDetallePiezas(p);
  actualizarTotalDetalle(p);
  renderPedidos();
  updateStats();
}
function actualizarProduccion(pedidoId, piezaId, campo, valor) {
    const p = pedidos.find(x => x.id === pedidoId); if (!p) return;
    const pz = p.piezas.find(x => x.id === piezaId); if (!pz) return;
    const val = parseInt(valor);
    if(isNaN(val)) return;
    if(campo === 'cantidad') {
        pz.cantidad = Math.max(1, val);
        if(pz.elaborados > pz.cantidad) {
            pz.elaborados = pz.cantidad;
        }
        recalcularVentaPedido(p);
    } else if (campo === 'elaborados') {
        pz.elaborados = Math.max(0, Math.min(val, pz.cantidad));
    }
    pz.completada = (pz.elaborados >= pz.cantidad);
    const todasCompletadas = p.piezas.every(item => item.elaborados >= item.cantidad);
    const algunaEmpezada = p.piezas.some(item => item.elaborados > 0);
    if(todasCompletadas && p.estado !== 'completado' && p.estado !== 'cancelado') {
        p.estado = 'listo';
        mostrarToast(`✓ Todas las piezas listas. Pedido "${p.cliente}" pasó a "Listo para entregar"`, 'success');
    } else if(!todasCompletadas && p.estado === 'listo') {
        p.estado = 'progreso';
    } else if(!todasCompletadas && algunaEmpezada && p.estado === 'pendiente') {
        p.estado = 'progreso';
    }
    guardarEstado();
    renderDetallePiezas(p);
    actualizarTotalDetalle(p);
    let metaStr = `${p.desc || 'Sin descripción'} · ${badgeText(p.estado)}`;
    if (p.fechaPedido) metaStr += ` · Pedido: ${p.fechaPedido}`;
    if (p.fechaEntrega) metaStr += ` · Entrega: ${p.fechaEntrega}` + (esUrgente(p) ? ' ⚠' : '');
    document.getElementById('det-meta').textContent = metaStr;
    renderPedidos();
    updateStats();
}
function actualizarVersionDetallePieza(pedidoId, piezaId, verId, campo, valor) {
  const p = pedidos.find(x=>x.id===pedidoId); if(!p) return;
  const pz = p.piezas.find(x=>x.id===piezaId); if(!pz||!pz.versiones) return;
  // verId is passed as number from template (no quotes), === works
  const v = pz.versiones.find(x=>x.id===verId); if(!v) return;
  const needsRerender = campo==='realizados' || campo==='cantidad';
  if(campo==='realizados') {
    v.realizados = Math.max(0, Math.min(parseInt(valor)||0, v.cantidad));
    pz.elaborados = pz.versiones.reduce((s,ver)=>s+(ver.realizados||0), 0);
    pz.completada = (pz.elaborados >= pz.cantidad);
    const todasCompletadas = p.piezas.every(item=>item.elaborados>=item.cantidad);
    const algunaEmpezada = p.piezas.some(item=>item.elaborados>0);
    if(todasCompletadas && p.estado!=='completado' && p.estado!=='cancelado') {
      p.estado='listo';
      mostrarToast(`✓ Todas las piezas listas. Pedido "${p.cliente}" pasó a "Listo para entregar"`, 'success');
    } else if(!todasCompletadas && p.estado==='listo') {
      p.estado='progreso';
    } else if(!todasCompletadas && algunaEmpezada && p.estado==='pendiente') {
      p.estado='progreso';
    }
  } else if(campo==='cantidad') {
    const otras = pz.versiones.filter(x=>x.id!==verId).reduce((s,x)=>s+x.cantidad,0);
    const maxPermitido = Math.max(1, pz.cantidad - otras);
    let val = parseInt(valor)||1;
    v.cantidad = Math.max(1, Math.min(val, maxPermitido));
    // clamp realizados to new cantidad
    if(v.realizados > v.cantidad) v.realizados = v.cantidad;
    pz.elaborados = pz.versiones.reduce((s,ver)=>s+(ver.realizados||0), 0);
    pz.completada = (pz.elaborados >= pz.cantidad);
  } else if(campo==='color') {
    v.color = valor;
  } else if(campo==='comentario') {
    v.comentario = valor;
  }
  guardarEstado();
  if(needsRerender) {
    renderDetallePiezas(p);
    actualizarTotalDetalle(p);
    let metaStr = `${p.desc||'Sin descripción'} · ${badgeText(p.estado)}`;
    if(p.fechaPedido) metaStr += ` · Pedido: ${p.fechaPedido}`;
    if(p.fechaEntrega) metaStr += ` · Entrega: ${p.fechaEntrega}` + (esUrgente(p)?' ⚠':'');
    document.getElementById('det-meta').textContent = metaStr;
    renderPedidos(); updateStats();
  }
}
function agregarVersionEnDetalle(pedidoId, piezaId) {
  const p = pedidos.find(x=>x.id===pedidoId); if(!p) return;
  const pz = p.piezas.find(x=>x.id===piezaId); if(!pz) return;
  if(!pz.versiones) pz.versiones = [];
  const asignado = pz.versiones.reduce((s,v)=>s+v.cantidad,0);
  const restante = pz.cantidad - asignado;
  if(restante<=0) return;
  pz.versiones.push({id:_arpVerCounter++, cantidad:restante, color:'', comentario:'', realizados:0});
  guardarEstado();
  renderDetallePiezas(p);
}
function quitarVersionEnDetalle(pedidoId, piezaId, verId) {
  const p = pedidos.find(x=>x.id===pedidoId); if(!p) return;
  const pz = p.piezas.find(x=>x.id===piezaId); if(!pz||!pz.versiones) return;
  pz.versiones = pz.versiones.filter(v=>v.id!==verId);
  pz.elaborados = pz.versiones.reduce((s,v)=>s+(v.realizados||0), 0);
  pz.completada = (pz.elaborados >= pz.cantidad);
  // if no versions left, keep the array but empty (user can add more)
  guardarEstado();
  renderDetallePiezas(p);
  actualizarTotalDetalle(p);
}
function renderDetalleInsumos(p){
  const cont=document.getElementById('det-insumos');
  if(!cfg.insumos.length){cont.innerHTML='<div style="font-size:12px;color:var(--text3)">Sin insumos configurados.</div>';return;}
  cont.innerHTML=cfg.insumos.map((ins)=>{
    const saved=p.insumos?.find(x=>x.nombre===ins.nombre);
    return `<div class="insumo-row">
      <input type="checkbox" class="det-ins-check" data-precio="${ins.precio}" data-nombre="${ins.nombre}" ${saved?'checked':''} onchange="actualizarTotalDetalle(pedidos.find(x=>x.id===pedidoDetalleId))">
      <span style="flex:1">${ins.nombre}</span>
      <span style="font-size:12px;color:var(--text3);font-family:var(--mono)">${fmt(ins.precio)}</span>
      <input type="number" class="insumo-qty det-ins-qty" value="${saved?.qty||1}" min="1" step="1" oninput="actualizarTotalDetalle(pedidos.find(x=>x.id===pedidoDetalleId))">
      <span style="font-size:11px;color:var(--text3)">uds</span>
    </div>`;
  }).join('');
}
function eliminarPieza(pedidoId,piezaId){
  const p=pedidos.find(x=>x.id===pedidoId);if(!p)return;
  if(!confirm('¿Eliminar esta pieza del pedido?'))return;
  p.piezas=p.piezas.filter(x=>x.id!==piezaId);
  const todasCompletadas = p.piezas.length > 0 && p.piezas.every(item => item.elaborados >= item.cantidad);
  if(todasCompletadas && p.estado !== 'completado' && p.estado !== 'cancelado') {
      p.estado = 'listo';
  }
  recalcularVentaPedido(p);
  renderDetallePiezas(p);actualizarTotalDetalle(p);renderPedidos();updateStats();
}
function actualizarTotalDetalle(p){
  if(!p)return;
  const costoPiezas=p.piezas.reduce((s,pz)=>s+((pz.costoUnitario||pz.total)*pz.cantidad),0);
  let costoIns=0;
  document.querySelectorAll('.det-ins-check').forEach(cb=>{if(cb.checked){const qty=parseFloat(cb.closest('.insumo-row').querySelector('.det-ins-qty')?.value||1);costoIns+=(parseFloat(cb.dataset.precio)||0)*qty;}});
  const costoTotal=costoPiezas+costoIns;
  const precioVenta=parseFloat(document.getElementById('det-precio-venta')?.value||0)||0;
  const envioVal=parseFloat(document.getElementById('det-envio')?.value||0)||0;
  const ganancia=precioVenta-costoTotal;
  document.getElementById('det-costo-piezas').textContent=fmt(costoPiezas);
  document.getElementById('det-costo-insumos').textContent=fmt(costoIns);
  document.getElementById('det-costo-total').textContent=fmt(costoTotal);
  // Big bold spot now shows total venta (precio de venta)
  const el=document.getElementById('det-ganancia');
  el.textContent=fmt(precioVenta);
  // Ganancia now lives in the readonly box, colored by sign
  const ganBox=document.getElementById('det-ganancia-box');
  if(ganBox){ ganBox.value=fmt(ganancia); ganBox.style.color = ganancia>=0?'var(--accent)':'var(--danger)'; }
  const telEl=document.getElementById('det-total-envio');
  if(telEl) telEl.textContent=fmt(precioVenta+envioVal);
}
function actualizarGanancia(){const p=pedidos.find(x=>x.id===pedidoDetalleId);actualizarTotalDetalle(p);}
function generarPdfPedido(pedidoId){
  const p = pedidos.find(x=>x.id===pedidoId); if(!p){ alert('Pedido no encontrado.'); return; }
  if(typeof window.jspdf === 'undefined'){ alert('No se pudo cargar el generador de PDF. Verificá tu conexión a internet e intentá de nuevo.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const pageW=210, pageH=297, marginX=15, contentW=pageW-marginX*2;
  const navy=[40,48,61], lightGray=[235,237,240];
  let y=18;
  function checkPageBreak(neededH){ if(y+neededH>278){ doc.addPage(); y=20; } }

  // Logo (si existe) + Título
  let titleX=marginX;
  if(empresa.logo){
    try{
      const fmtImg = empresa.logo.includes('image/png')?'PNG':(empresa.logo.includes('image/jpeg')||empresa.logo.includes('image/jpg'))?'JPEG':'PNG';
      doc.addImage(empresa.logo, fmtImg, marginX, y-9, 14, 14);
      titleX = marginX+18;
    }catch(e){}
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.setTextColor(30,33,40);
  doc.text('PEDIDO', titleX, y);

  // Datos del emprendimiento (arriba a la derecha)
  let ey=y-6;
  doc.setFontSize(9);
  if(empresa.nombre){ doc.setFont('helvetica','bold'); doc.text(empresa.nombre, pageW-marginX, ey, {align:'right'}); ey+=4.5; doc.setFont('helvetica','normal'); }
  const dirLine=[empresa.direccion,empresa.cp].filter(Boolean).join(', ');
  if(dirLine){ doc.text(dirLine, pageW-marginX, ey, {align:'right'}); ey+=4.2; }
  if(empresa.telefono){ doc.text(empresa.telefono, pageW-marginX, ey, {align:'right'}); ey+=4.2; }
  if(empresa.email){ doc.text(empresa.email, pageW-marginX, ey, {align:'right'}); ey+=4.2; }

  y+=12;
  doc.setDrawColor(210);doc.setLineWidth(0.3);doc.line(marginX,y,pageW-marginX,y);
  y+=8;

  // N° de pedido / Fecha
  doc.setFontSize(10);doc.setTextColor(30,33,40);
  doc.setFont('helvetica','bold'); doc.text('N° de pedido:', marginX, y);
  doc.setFont('helvetica','normal'); doc.text(String(p.id).padStart(4,'0'), marginX+30, y);
  doc.setFont('helvetica','bold'); doc.text('Fecha:', marginX+90, y);
  doc.setFont('helvetica','normal'); doc.text(p.fechaPedido||new Date().toLocaleDateString('es-AR'), marginX+105, y);
  y+=10;

  // Vendedor / Cliente
  const boxW=(contentW-6)/2, boxX2=marginX+boxW+6, headerH=7;
  doc.setFillColor(...navy);
  doc.rect(marginX,y,boxW,headerH,'F'); doc.rect(boxX2,y,boxW,headerH,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
  doc.text('VENDEDOR', marginX+3, y+5); doc.text('CLIENTE', boxX2+3, y+5);
  y+=headerH;

  const cliente = clientes.find(c=>c.nombre===p.cliente);
  const vendLines=[empresa.nombre||'—',[empresa.direccion,empresa.cp].filter(Boolean).join(', '),empresa.telefono||'',empresa.email||''].filter(l=>l!=='');
  const cliDireccion = cliente?[cliente.calle,cliente.altura].filter(Boolean).join(' '):'';
  const cliLines=[p.cliente||'—',[cliDireccion,cliente?.loc,cliente?.cp].filter(Boolean).join(', '),cliente?.tel||'',cliente?.email||''].filter(l=>l!=='');
  const maxLines=Math.max(vendLines.length,cliLines.length,1);
  const boxBodyH=maxLines*5.2+4;
  doc.setDrawColor(220);doc.rect(marginX,y,boxW,boxBodyH);doc.rect(boxX2,y,boxW,boxBodyH);
  doc.setTextColor(40,40,40);doc.setFontSize(9);
  vendLines.forEach((l,i)=>{doc.setFont('helvetica',i===0?'bold':'normal');doc.text(l,marginX+3,y+5+i*5.2,{maxWidth:boxW-6});});
  cliLines.forEach((l,i)=>{doc.setFont('helvetica',i===0?'bold':'normal');doc.text(l,boxX2+3,y+5+i*5.2,{maxWidth:boxW-6});});
  y+=boxBodyH+8;

  // Tabla de productos
  checkPageBreak(20);
  doc.setFillColor(...navy);
  doc.rect(marginX,y,contentW,7,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
  doc.text('PRODUCTOS', marginX+3, y+5);
  y+=7;

  const colN=10,colDesc=95,colCant=20,colPU=27,colTot=28;
  const xN=marginX,xDesc=xN+colN,xCant=xDesc+colDesc,xPU=xCant+colCant,xTot=xPU+colPU;
  doc.setFillColor(...lightGray);
  doc.rect(marginX,y,contentW,7,'F');
  doc.setTextColor(40,40,40);doc.setFontSize(8.5);doc.setFont('helvetica','bold');
  doc.text('N°',xN+2,y+5);doc.text('DESCRIPCIÓN',xDesc+2,y+5);doc.text('CANT.',xCant+2,y+5);doc.text('PRECIO UNIT.',xPU+2,y+5);doc.text('TOTAL',xTot+2,y+5);
  y+=7;

  doc.setFont('helvetica','normal');doc.setFontSize(9);
  (p.piezas||[]).forEach((pz,i)=>{
    const unit = pz.precioVenta!==undefined?pz.precioVenta:(pz.precioEstimado||0);
    const subtotal = unit*pz.cantidad;
    let descExtra='';
    if(pz.versiones && pz.versiones.length){
      descExtra = pz.versiones.map(v=>`${v.cantidad}× ${v.color||'sin color'}${v.comentario?' ('+v.comentario+')':''}`).join(', ');
    }
    const rowH = descExtra?11:7;
    checkPageBreak(rowH);
    if(i%2===1){ doc.setFillColor(248,248,250); doc.rect(marginX,y,contentW,rowH,'F'); }
    doc.setDrawColor(225);doc.rect(marginX,y,contentW,rowH);
    doc.setTextColor(40,40,40);doc.setFontSize(9);doc.setFont('helvetica','normal');
    doc.text(String(i+1),xN+2,y+5);
    doc.text(pz.nombre||'Producto',xDesc+2,y+5,{maxWidth:colDesc-4});
    if(descExtra){ doc.setFontSize(7.5);doc.setTextColor(120,120,120); doc.text(descExtra,xDesc+2,y+9.5,{maxWidth:colDesc-4}); }
    doc.setFontSize(9);doc.setTextColor(40,40,40);
    doc.text(String(pz.cantidad),xCant+2,y+5);
    doc.text(fmt(unit),xPU+2,y+5);
    doc.text(fmt(subtotal),xTot+2,y+5);
    y+=rowH;
  });

  // Totales
  y+=2;
  checkPageBreak(25);
  doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(40,40,40);
  doc.setDrawColor(225);doc.rect(xPU,y,colPU,7);doc.rect(xTot,y,colTot,7);
  doc.text('SUBTOTAL',xPU+2,y+5);doc.text(fmt(p.precioVenta||0),xTot+2,y+5);
  y+=7;
  if(p.envio>0){
    doc.setFont('helvetica','normal');
    doc.rect(xPU,y,colPU,7);doc.rect(xTot,y,colTot,7);
    doc.text('ENVÍO',xPU+2,y+5);doc.text(fmt(p.envio),xTot+2,y+5);
    y+=7;
  }
  doc.setFillColor(...lightGray);
  doc.rect(xPU,y,colPU,8,'F');doc.rect(xTot,y,colTot,8,'F');
  doc.setDrawColor(180);doc.rect(xPU,y,colPU,8);doc.rect(xTot,y,colTot,8);
  doc.setFont('helvetica','bold');doc.setFontSize(10.5);
  doc.text('TOTAL',xPU+2,y+5.5);doc.text(fmt((p.precioVenta||0)+(p.envio||0)),xTot+2,y+5.5);
  y+=8+10;

  // Datos de envío
  if(p.metodoEnvio || p.numeroSeguimiento){
    checkPageBreak(20);
    doc.setFillColor(...navy);
    doc.rect(marginX,y,contentW,7,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
    doc.text('DATOS DE ENVÍO', marginX+3, y+5);
    y+=7;
    const bodyLines=[];
    if(p.metodoEnvio) bodyLines.push(`Método: ${p.metodoEnvio}`);
    if(p.numeroSeguimiento) bodyLines.push(`N° de seguimiento: ${p.numeroSeguimiento}`);
    const bh=bodyLines.length*6+4;
    doc.setDrawColor(220);doc.rect(marginX,y,contentW,bh);
    doc.setTextColor(40,40,40);doc.setFont('helvetica','normal');doc.setFontSize(9.5);
    bodyLines.forEach((l,i)=>doc.text(l,marginX+3,y+5+i*6));
    y+=bh+8;
  }

  // Comentarios
  if(p.notaGeneral){
    checkPageBreak(20);
    doc.setFillColor(...navy);
    doc.rect(marginX,y,contentW,7,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
    doc.text('COMENTARIOS', marginX+3, y+5);
    y+=7;
    doc.setFontSize(9.5);doc.setFont('helvetica','normal');doc.setTextColor(40,40,40);
    const lines=doc.splitTextToSize(p.notaGeneral, contentW-6);
    const bh=lines.length*5+4;
    checkPageBreak(bh);
    doc.setDrawColor(220);doc.rect(marginX,y,contentW,bh);
    doc.text(lines, marginX+3, y+5.5);
    y+=bh+8;
  }

  // Pie
  doc.setFontSize(9);doc.setTextColor(130,130,130);doc.setFont('helvetica','normal');
  doc.text(empresa.nombre||'', marginX, pageH-14);

  const nombreArchivo = `Pedido_${(p.cliente||'cliente')}_${String(p.id).padStart(4,'0')}`.replace(/[^a-zA-Z0-9_.\-]/g,'_');
  doc.save(nombreArchivo+'.pdf');
}
function guardarDetalle(){
  const p=pedidos.find(x=>x.id===pedidoDetalleId);if(!p)return;
  p.precioVenta=parseFloat(document.getElementById('det-precio-venta').value)||0;
  p.envio=parseFloat(document.getElementById('det-envio').value)||0;
  p.notaGeneral=document.getElementById('det-nota-general').value||'';
  p.metodoEnvio=document.getElementById('det-metodo-envio')?.value||'';
  p.numeroSeguimiento=document.getElementById('det-num-seguimiento')?.value||'';
  p.insumos=[];
  document.querySelectorAll('.det-ins-check').forEach(cb=>{if(cb.checked){const qty=parseFloat(cb.closest('.insumo-row').querySelector('.det-ins-qty')?.value||1);p.insumos.push({nombre:cb.dataset.nombre,precio:parseFloat(cb.dataset.precio),qty});}});
  cerrarModal('modal-detalle');renderPedidos();updateStats();
}
function irACalculadoraParaPedido(){cerrarModal('modal-detalle');navTo('calc',document.querySelectorAll('.nav-item')[3]);} 
function renderPedidos(){
  const cont=document.getElementById('lista-pedidos');
  if(!pedidos.length){cont.innerHTML='<div class="empty">Todavía no hay pedidos.</div>';return;}
  const sortedPedidos = [...pedidos].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  cont.innerHTML=sortedPedidos.map(p=>{
    const urgente=esUrgente(p);
    const costoPiezas = p.piezas.reduce((s, pz) => s + ((pz.costoUnitario || pz.total) * pz.cantidad), 0);
    const costoIns=(p.insumos||[]).reduce((s,i)=>s+i.precio*i.qty,0);
    const costoTotal=costoPiezas+costoIns;
    const ganancia=p.precioVenta?p.precioVenta-costoTotal:null;
    const totalUnidades = p.piezas.reduce((t, pz) => t + pz.cantidad, 0);
    const totalElaboradas = p.piezas.reduce((t, pz) => t + (pz.elaborados || 0), 0);
    return `<div class="pedido-card${urgente?' urgente':''}" onclick="abrirDetallePedido(${p.id})">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;margin-bottom:2px">${p.cliente}</div>
        <div style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.desc||'Sin descripción'}</div>
        ${p.notaGeneral?`<div style="font-size:11px;color:var(--warn);font-family:var(--mono);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📝 ${p.notaGeneral}</div>`:''}
        ${p.fechaEntrega?`<div style="font-size:11px;font-family:var(--mono);margin-top:2px;color:${urgente?'var(--danger)':'var(--text3)'}">` + (urgente?'⚠ ':'') + `Entrega: ${p.fechaEntrega}</div>`:''}${p.fechaPedido?`<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">Pedido: ${p.fechaPedido}</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:20px;flex-shrink:0">
        <div style="text-align:center">
          <div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Unidades</div>
          <div style="font-size:18px;font-weight:600;font-family:var(--mono)">${totalUnidades}</div>
          ${totalUnidades>0?`<div style="font-size:10px;font-family:var(--mono);color:var(--accent);margin-top:1px">${totalElaboradas}/${totalUnidades} listas</div>`:''}
        </div>
        <div style="text-align:center"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Costo</div><div style="font-size:13px;font-weight:500;font-family:var(--mono)">${fmt(costoTotal)}</div></div>
        ${p.precioVenta?`<div style="text-align:center"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Venta</div><div style="font-size:13px;font-weight:700;font-family:var(--mono);color:var(--accent)">${fmt(p.precioVenta)}</div></div>`:''}
        ${ganancia!==null?`<div style="text-align:center"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Ganancia</div><div style="font-size:13px;font-weight:700;font-family:var(--mono);color:${ganancia>=0?'var(--accent)':'var(--danger)'}">${fmt(ganancia)}</div></div>`:''}
        ${badgeHTML(p.estado, p.id)}
        <svg style="width:14px;height:14px;color:var(--text3)" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5l5 5-5 5"/></svg>
      </div>
    </div>`;
  }).join('');
}
function updateStats(){
  document.getElementById('stat-total').textContent=pedidos.length;
  document.getElementById('stat-prog').textContent=pedidos.filter(p=>p.estado==='progreso'||p.estado==='listo').length;
  document.getElementById('stat-done').textContent=pedidos.filter(p=>p.estado==='completado').length;
  document.getElementById('stat-fact').textContent=fmt(pedidos.filter(p=>(p.estado==='completado'||p.estado==='listo')&&p.precioVenta).reduce((s,p)=>s+p.precioVenta,0));
  const pendientesGlobal = pedidos.filter(p => p.estado !== 'completado' && p.estado !== 'cancelado' && p.precioVenta);
  const totalPendienteGlobal = pendientesGlobal.reduce((s,p) => s + p.precioVenta, 0);
  const statPend = document.getElementById('stat-pend');
  if(statPend) statPend.textContent = fmt(totalPendienteGlobal);
}
let editClienteId = null;
let detalleClienteId = null;
function renderClientes() {
  const cont = document.getElementById('lista-clientes');
  if(!clientes.length) { cont.innerHTML='<div class="empty">Todavía no hay clientes registrados.</div>'; return; }
  cont.innerHTML = `<table class="data-table" style="width:100%">
    <thead><tr><th>Nombre</th><th>Teléfono</th><th>Localidad</th><th style="text-align:center">Pedidos</th><th style="text-align:right">Total gastado</th></tr></thead>
    <tbody>` + clientes.map(c => {
      const misPedidos = pedidos.filter(p => p.cliente.trim().toLowerCase() === c.nombre.trim().toLowerCase());
      const totalGastado = misPedidos.reduce((acc, p) => acc + (p.precioVenta || 0), 0);
      return `<tr style="cursor:pointer" onclick="verDetalleCliente(${c.id})">
        <td style="font-weight:500">${c.nombre}</td>
        <td style="color:var(--text2);font-family:var(--mono)">${c.tel || '—'}</td>
        <td style="color:var(--text2)">${c.loc || '—'} ${c.prov ? `(${c.prov})` : ''}</td>
        <td style="font-family:var(--mono);text-align:center">${misPedidos.length}</td>
        <td style="font-family:var(--mono);font-weight:600;color:var(--accent);text-align:right">${fmt(totalGastado)}</td>
      </tr>`;
    }).join('') + `</tbody></table>`;
    const dl = document.getElementById('lista-nombres-clientes');
    if(dl) dl.innerHTML = clientes.map(c => `<option value="${c.nombre}">`).join('');
}
function abrirModalCliente(id) {
  editClienteId = id;
  if (id !== null) {
    const c = clientes.find(x => x.id === id); if(!c) return;
    document.getElementById('modal-cliente-title').textContent = 'Editar cliente';
    document.getElementById('cli-m-nombre').value = c.nombre;
    document.getElementById('cli-m-tel').value = c.tel || '';
    document.getElementById('cli-m-email').value = c.email || '';
    document.getElementById('cli-m-prov').value = c.prov || '';
    document.getElementById('cli-m-loc').value = c.loc || '';
    document.getElementById('cli-m-cp').value = c.cp || '';
    document.getElementById('cli-m-calle').value = c.calle || '';
    document.getElementById('cli-m-altura').value = c.altura || '';
  } else {
    document.getElementById('modal-cliente-title').textContent = 'Nuevo cliente';
    ['cli-m-nombre','cli-m-tel','cli-m-email','cli-m-prov','cli-m-loc','cli-m-cp','cli-m-calle','cli-m-altura'].forEach(id => document.getElementById(id).value = '');
  }
  document.getElementById('modal-cliente').classList.add('open');
}
function guardarCliente() {
  const nombre = document.getElementById('cli-m-nombre').value.trim();
  if(!nombre) { mostrarToast('El nombre es obligatorio', 'error'); return; }
  const d = {
    nombre,
    tel: document.getElementById('cli-m-tel').value,
    email: document.getElementById('cli-m-email').value,
    prov: document.getElementById('cli-m-prov').value,
    loc: document.getElementById('cli-m-loc').value,
    cp: document.getElementById('cli-m-cp').value,
    calle: document.getElementById('cli-m-calle').value,
    altura: document.getElementById('cli-m-altura').value
  };
  if (editClienteId !== null) {
    const idx = clientes.findIndex(x => x.id === editClienteId);
    if (idx >= 0) {
      const nombreAntiguo = clientes[idx].nombre;
      if(nombreAntiguo !== nombre) {
         pedidos.forEach(p => { if(p.cliente === nombreAntiguo) p.cliente = nombre; });
         renderPedidos();
      }
      clientes[idx] = { ...clientes[idx], ...d };
    }
  } else {
    clientes.push({ id: newId(), ...d, fechaAlta: new Date().toLocaleDateString('es-AR') });
  }
  guardarEstado();
  renderClientes();
  cerrarModal('modal-cliente');
  mostrarToast('Cliente guardado con éxito');
}
function verDetalleCliente(id) {
  detalleClienteId = id;
  const c = clientes.find(x => x.id === id); if(!c) return;
  document.getElementById('cli-det-nombre').textContent = c.nombre;
  let info = [];
  if(c.tel) info.push(`📞 ${c.tel}`);
  if(c.email) info.push(`✉️ ${c.email}`);
  if(c.calle || c.loc || c.prov) info.push(`📍 ${c.calle} ${c.altura||''}, ${c.loc||''}, ${c.prov||''} (CP: ${c.cp||''})`);
  document.getElementById('cli-det-info').innerHTML = info.join(' | ');
  const misPedidos = pedidos.filter(p => p.cliente.trim().toLowerCase() === c.nombre.trim().toLowerCase());
  const cont = document.getElementById('cli-det-pedidos');
  if(!misPedidos.length) {
    cont.innerHTML = '<div class="empty" style="padding:20px">No hay pedidos para este cliente.</div>';
  } else {
    const misPedidosSort = [...misPedidos].sort((a,b)=> getTimestamp(b) - getTimestamp(a));
    cont.innerHTML = `<div class="res-tabla-wrap"><table class="data-table" style="width:100%">
      <thead><tr><th>Fecha</th><th>Descripción/Piezas</th><th>Estado</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>` + misPedidosSort.map(p => {
        const nombrePiezas = p.piezas.map(pz => pz.nombre).join(', ');
        return `<tr style="cursor:pointer" onclick="cerrarModal('modal-cliente-detalle'); navTo('pedidos', document.querySelectorAll('.nav-item')[1]); abrirDetallePedido(${p.id})">
          <td style="font-family:var(--mono);color:var(--text3);white-space:nowrap">${p.fechaPedido || p.creado || '—'}</td>
          <td><div style="font-weight:500;font-size:12px">${p.desc || '—'}</div><div style="font-size:11px;color:var(--text2)">${nombrePiezas}</div></td>
          <td>${badgeHTML(p.estado, p.id)}</td>
          <td style="font-family:var(--mono);text-align:right;font-weight:600;color:var(--accent)">${fmt(p.precioVenta || 0)}</td>
        </tr>`;
      }).join('') + `</tbody></table></div>`;
  }
  document.getElementById('modal-cliente-detalle').classList.add('open');
}
function editarClienteDesdeDetalle() {
  cerrarModal('modal-cliente-detalle');
  abrirModalCliente(detalleClienteId);
}
function eliminarClienteDesdeDetalle() {
  if(!confirm('¿Eliminar este cliente? Sus pedidos NO se borrarán, pero quedarán sin vincular.')) return;
  clientes = clientes.filter(c => c.id !== detalleClienteId);
  guardarEstado();
  renderClientes();
  cerrarModal('modal-cliente-detalle');
  mostrarToast('Cliente eliminado', 'info');
}
function onFilSelect(){const v=document.getElementById('sel-filamento').value;if(v==='manual'){document.getElementById('fil-precio-wrap').style.display='block';return;}document.getElementById('precio-rollo').value=cfg.filamentos[parseInt(v)].precio;document.getElementById('fil-precio-wrap').style.display='none';calcular();}
function onImpresoraSelect(){const v=document.getElementById('sel-impresora').value;if(v==='manual'){document.getElementById('imp-watts-wrap').style.display='block';return;}document.getElementById('watts').value=cfg.impresoras[parseInt(v)].watts;document.getElementById('imp-watts-wrap').style.display='none';calcular();}
function refreshSelects(){
  document.getElementById('sel-filamento').innerHTML='<option value="manual">— Manual —</option>'+cfg.filamentos.map((f,i)=>`<option value="${i}">${f.nombre} · ${fmt(f.precio)}/kg</option>`).join('');
  document.getElementById('sel-impresora').innerHTML='<option value="manual">— Manual —</option>'+cfg.impresoras.map((imp,i)=>`<option value="${i}">${imp.nombre} · ${imp.watts}W</option>`).join('');
  aplicarImpresoraDefault();
}
function aplicarImpresoraDefault(){
  if(cfg.impresoraDefault===undefined||cfg.impresoraDefault==='')return;
  const sel=document.getElementById('sel-impresora');
  const idx=String(cfg.impresoraDefault);
  if(sel&&cfg.impresoras[parseInt(idx)]){
    sel.value=idx;
    document.getElementById('watts').value=cfg.impresoras[parseInt(idx)].watts;
    document.getElementById('imp-watts-wrap').style.display='none';
  }
}
function getImpresoraNombre(){
  const v=document.getElementById('sel-impresora')?.value;
  if(!v||v==='manual')return null;
  return cfg.impresoras[parseInt(v)]?.nombre||null;
}
function refreshInsumos(){
  const cont=document.getElementById('lista-insumos');
  if(!cfg.insumos.length){cont.innerHTML='<div class="empty">Sin insumos configurados.</div>';return;}
  cont.innerHTML=cfg.insumos.map((ins)=>`<div class="insumo-row">
    <input type="checkbox" class="insumo-check-input" data-precio="${ins.precio}" onchange="calcular()">
    <span style="flex:1">${ins.nombre}</span>
    <span style="font-size:12px;color:var(--text3);font-family:var(--mono)">${fmt(ins.precio)}</span>
    <input type="number" class="insumo-qty" value="1" min="1" step="1" oninput="calcular()">
    <span style="font-size:11px;color:var(--text3)">uds</span>
  </div>`).join('');
}
function renderConfig(){
  document.getElementById('cfg-filamentos').innerHTML=cfg.filamentos.map((f,i)=>`<div class="cfg-row"><input value="${f.nombre}" onchange="cfg.filamentos[${i}].nombre=this.value;refreshSelects()"><input type="number" value="${f.precio}" onchange="cfg.filamentos[${i}].precio=parseFloat(this.value)||0;refreshSelects()"><button class="btn btn-danger btn-sm" onclick="cfg.filamentos.splice(${i},1);renderConfig();refreshSelects()">✕</button></div>`).join('');
  document.getElementById('cfg-impresoras').innerHTML=cfg.impresoras.map((imp,i)=>`<div style="display:grid;grid-template-columns:1fr 64px 74px auto;gap:6px;align-items:center;margin-bottom:8px"><input value="${imp.nombre}" onchange="cfg.impresoras[${i}].nombre=this.value;refreshSelects()" placeholder="Nombre"><input type="number" value="${imp.watts}" onchange="cfg.impresoras[${i}].watts=parseFloat(this.value)||0;refreshSelects()" placeholder="W" title="Watts" style="font-size:12px"><input type="number" value="${imp.mant||0}" onchange="cfg.impresoras[${i}].mant=parseFloat(this.value)||0;guardarEstado()" placeholder="$/h" title="Mant $/hora" style="font-size:12px"><button class="btn btn-danger btn-sm" onclick="cfg.impresoras.splice(${i},1);renderConfig();refreshSelects()">✕</button></div>`).join('');
  document.getElementById('cfg-insumos').innerHTML=cfg.insumos.map((ins,i)=>`<div class="cfg-row"><input value="${ins.nombre}" onchange="cfg.insumos[${i}].nombre=this.value;refreshInsumos()"><input type="number" value="${ins.precio}" onchange="cfg.insumos[${i}].precio=parseFloat(this.value)||0;refreshInsumos()"><button class="btn btn-danger btn-sm" onclick="cfg.insumos.splice(${i},1);renderConfig();refreshInsumos()">✕</button></div>`).join('');
  const colCont=document.getElementById('cfg-colores');
  if(colCont){
    cfg.colores=cfg.colores||[];
    colCont.innerHTML=cfg.colores.map((c,i)=>`<div class="cfg-row" style="grid-template-columns:1fr 46px auto"><input value="${c.nombre}" oninput="cfg.colores[${i}].nombre=this.value;guardarEstado()"><input type="color" value="${c.hex||'#cccccc'}" style="padding:2px;height:34px" oninput="cfg.colores[${i}].hex=this.value;guardarEstado()"><button class="btn btn-danger btn-sm" onclick="cfg.colores.splice(${i},1);renderConfig();guardarEstado()">✕</button></div>`).join('');
  }
  const envCont=document.getElementById('cfg-envios');
  if(envCont){
    cfg.metodosEnvio=cfg.metodosEnvio||[];
    envCont.innerHTML=cfg.metodosEnvio.map((m,i)=>`<div class="cfg-row" style="grid-template-columns:1fr auto"><input value="${m}" oninput="cfg.metodosEnvio[${i}]=this.value;guardarEstado()"><button class="btn btn-danger btn-sm" onclick="cfg.metodosEnvio.splice(${i},1);renderConfig();guardarEstado()">✕</button></div>`).join('');
  }
  document.getElementById('cfg-kwh').value=cfg.kwh;document.getElementById('cfg-mo').value=cfg.mo;document.getElementById('cfg-margen').value=cfg.margen;document.getElementById('cfg-desperdicio').value=cfg.desperdicio;
  const defSel=document.getElementById('cfg-impresora-default');
  if(defSel){defSel.innerHTML='<option value="">— Ninguna —</option>'+cfg.impresoras.map((imp,i)=>`<option value="${i}" ${String(cfg.impresoraDefault)===String(i)?'selected':''}>${imp.nombre}</option>`).join('');} 
}
function saveCfg(){
  cfg.kwh=parseFloat(document.getElementById('cfg-kwh').value)||0;
  cfg.mo=parseFloat(document.getElementById('cfg-mo').value)||0;
  cfg.margen=parseFloat(document.getElementById('cfg-margen').value)||0;
  cfg.desperdicio=parseFloat(document.getElementById('cfg-desperdicio').value)||0;
  const defSel=document.getElementById('cfg-impresora-default');
  if(defSel)cfg.impresoraDefault=defSel.value;
}
function aplicarCfgCalc(){document.getElementById('precio-kwh').value=cfg.kwh;document.getElementById('mano-obra').value=cfg.mo;document.getElementById('margen').value=cfg.margen;document.getElementById('desperdicio').value=cfg.desperdicio;calcular();navTo('calc',document.querySelectorAll('.nav-item')[3]);}
function addFilamento(){cfg.filamentos.push({nombre:'Nuevo filamento',precio:18000});renderConfig();refreshSelects();}
function addImpresora(){cfg.impresoras.push({nombre:'Nueva impresora',watts:150,mant:100});renderConfig();refreshSelects();}
function addInsumo(){cfg.insumos.push({nombre:'Nuevo insumo',precio:500});renderConfig();refreshInsumos();}
function addColor(){cfg.colores=cfg.colores||[];cfg.colores.push({nombre:'Nuevo color',hex:'#cccccc'});renderConfig();guardarEstado();}
function addMetodoEnvio(){cfg.metodosEnvio=cfg.metodosEnvio||[];cfg.metodosEnvio.push('Nuevo método');renderConfig();guardarEstado();}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));
let chartVentas = null;
function renderResumen() {
  const {desde, hasta} = getPeriodoFechas();
  const pedidosFiltrados = getPedidosPeriodo(desde, hasta);
  const completados = pedidosFiltrados.filter(p => (p.estado === 'completado' || p.estado === 'listo') && p.precioVenta);
  const totalVentas  = completados.reduce((s,p) => s + p.precioVenta, 0);
  
  // NUEVO CÁLCULO: Solo suma Electricidad y Mano de Obra
  const totalCostos  = completados.reduce((s,p) => {
    const cp = p.piezas.reduce((a, pz) => a + (((pz.costeElec || 0) + (pz.costeMO || 0)) * pz.cantidad), 0);
    return s + cp;
  }, 0);

  const ganancia  = totalVentas - totalCostos;
  const rentab    = totalVentas > 0 ? (ganancia / totalVentas * 100) : 0;
  const pendientesGlobal = pedidos.filter(p => p.estado !== 'completado' && p.estado !== 'cancelado' && p.precioVenta);
  const totalPendiente = pendientesGlobal.reduce((s,p) => s + p.precioVenta, 0);
  
  document.getElementById('res-ventas').textContent   = fmt(totalVentas);
  document.getElementById('res-costos').textContent   = fmt(totalCostos);
  document.getElementById('res-ganancia').textContent = fmt(ganancia);
  document.getElementById('res-ganancia').style.color = ganancia >= 0 ? 'var(--accent)' : 'var(--danger)';
  document.getElementById('res-rent').textContent     = rentab.toFixed(1) + '%';
  document.getElementById('res-rent').style.color     = rentab >= 0 ? 'var(--accent)' : 'var(--danger)';
  
  const resPend = document.getElementById('res-pendiente');
  if(resPend) resPend.textContent = fmt(totalPendiente);
  
  renderChartVentas(completados, desde, hasta);
  renderHorasImpresoras(pedidosFiltrados);
  renderTablaPeriodo(completados);
}
function getPeriodoFechas() {
  const desdeEl = document.getElementById('fecha-desde');
  const hastaEl = document.getElementById('fecha-hasta');
  const hasta   = hastaEl.value ? new Date(hastaEl.value + 'T23:59:59') : new Date();
  let desde;
  if (desdeEl.value) {
    desde = new Date(desdeEl.value + 'T00:00:00');
  } else {
    const btn = document.querySelector('.periodo-btn.active');
    const dias = btn ? parseInt(btn.dataset.p) : 30;
    if (dias === 0) {
      desde = new Date(0);
    } else {
      desde = new Date(hasta); desde.setDate(desde.getDate() - dias);
    }
  }
  return { desde, hasta };
}
function getFechaVenta(p) {
  // Para ventas, usar fechaCompletado si existe, sino fechaPedido, sino creado
  if (p.fechaCompletado) return p.fechaCompletado;
  if (p.fechaPedido) return p.fechaPedido;
  if (p.creado) return parseFechaCreado(p.creado);
  return null;
}
function getPedidosPeriodo(desde, hasta) {
  return pedidos.filter(p => {
    // Para pedidos completados, filtrar por fechaCompletado
    const fechaRef = (p.estado === 'completado' && p.fechaCompletado)
      ? p.fechaCompletado
      : (p.fechaPedido || p.fecha || p.creado);
    if (!fechaRef) return true;
    let d;
    if (fechaRef.includes('-') && fechaRef.length === 10) {
      d = new Date(fechaRef + 'T12:00:00');
    } else {
      const parts = fechaRef.split('/');
      if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
      else return true;
    }
    return d >= desde && d <= hasta;
  });
}
function renderChartVentas(completados, desde, hasta) {
  const canvas = document.getElementById('chart-ventas');
  const emptyEl = document.getElementById('chart-empty');
  if (!completados.length) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    if (chartVentas) { chartVentas = null; }
    return;
  }
  canvas.style.display = 'block';
  emptyEl.style.display = 'none';
  canvas.style.width = '100%';
  const diffDias = (hasta - desde) / (1000*60*60*24);
  const puntos = diffDias <= 31 ? agruparPorDia(completados, desde, hasta)
               : diffDias <= 180 ? agruparPorSemana(completados, desde, hasta)
               : agruparPorMes(completados, desde, hasta);
  let acum = 0;
  const labels   = puntos.map(p => p.label);
  const dataAcum = puntos.map(p => { acum += p.ventas; return Math.round(acum); });
  const dataBars  = puntos.map(p => Math.round(p.ventas));
  const ctx = canvas.getContext('2d');
  if (chartVentas) { chartVentas = null; ctx.clearRect(0,0,canvas.width,canvas.height); }
  const W = canvas.offsetWidth || 500;
  const H = 200;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const PAD = { top:20, right:20, bottom:40, left:70 };
  const gW = W - PAD.left - PAD.right;
  const gH = H - PAD.top - PAD.bottom;
  const maxAcum = Math.max(...dataAcum, 1);
  const maxBar  = Math.max(...dataBars, 1);
  const n = labels.length;
  const barW = Math.max(4, (gW / n) * 0.5);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#2a2f3e'; ctx.lineWidth = 0.5;
  for (let i=0; i<=4; i++) {
    const y = PAD.top + gH - (gH/4)*i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+gW, y); ctx.stroke();
    ctx.fillStyle='#555d74'; ctx.font='10px DM Mono,monospace'; ctx.textAlign='right';
    const val = Math.round(maxAcum/4*i);
    ctx.fillText(val>=1000?'$'+(val/1000).toFixed(0)+'k':'$'+val, PAD.left-6, y+3);
  }
  dataBars.forEach((v, i) => {
    const x = PAD.left + (gW / n) * (i + 0.5) - barW/2;
    const bH = (v / maxAcum) * gH;
    const y  = PAD.top + gH - bH;
    ctx.fillStyle = 'rgba(110,231,183,0.2)';
    ctx.beginPath(); ctx.roundRect(x, y, barW, bH, 2); ctx.fill();
  });
  ctx.strokeStyle='#6ee7b7'; ctx.lineWidth=2; ctx.lineJoin='round';
  ctx.beginPath();
  dataAcum.forEach((v, i) => {
    const x = PAD.left + (gW / n) * (i + 0.5);
    const y = PAD.top + gH - (v / maxAcum) * gH;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
  dataAcum.forEach((v, i) => {
    const x = PAD.left + (gW / n) * (i + 0.5);
    const y = PAD.top + gH - (v / maxAcum) * gH;
    ctx.fillStyle='#6ee7b7'; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  });
  ctx.fillStyle='#555d74'; ctx.font='10px DM Mono,monospace'; ctx.textAlign='center';
  labels.forEach((lbl, i) => {
    if (n<=12 || i % Math.ceil(n/12) === 0) {
      const x = PAD.left + (gW / n) * (i + 0.5);
      ctx.fillText(lbl, x, H - 6);
    }
  });
  ctx.save(); ctx.translate(12, PAD.top + gH/2); ctx.rotate(-Math.PI/2);
  ctx.fillStyle='#555d74'; ctx.font='10px DM Mono,monospace'; ctx.textAlign='center';
  ctx.fillText('Acumulado', 0, 0); ctx.restore();
}
function agruparPorDia(pedidos, desde, hasta) {
  const map = {};
  const cur = new Date(desde);
  while(cur <= hasta) {
    const k = cur.toISOString().slice(0,10);
    map[k] = 0;
    cur.setDate(cur.getDate()+1);
  }
  pedidos.forEach(p => {
    const f = getFechaVenta(p);
    if(f && map[f]!==undefined) map[f] += p.precioVenta||0;
  });
  return Object.entries(map).map(([k,v])=>({label:k.slice(5),ventas:v}));
}
function agruparPorSemana(pedidos, desde, hasta) {
  const semanas = [];
  const cur = new Date(desde);
  while(cur <= hasta) {
    const fin = new Date(cur); fin.setDate(fin.getDate()+6);
    semanas.push({label:cur.toISOString().slice(5,10), desde:new Date(cur), hasta:fin<=hasta?fin:hasta, ventas:0});
    cur.setDate(cur.getDate()+7);
  }
  pedidos.forEach(p => {
    const fStr = getFechaVenta(p);
    const f = fStr ? new Date(fStr + 'T12:00:00') : null;
    if(!f) return;
    const sem = semanas.find(s=>f>=s.desde&&f<=s.hasta);
    if(sem) sem.ventas += p.precioVenta||0;
  });
  return semanas;
}
function agruparPorMes(pedidos, desde, hasta) {
  const map = {};
  const cur = new Date(desde.getFullYear(), desde.getMonth(), 1);
  while(cur <= hasta) {
    const k = cur.toISOString().slice(0,7);
    map[k] = 0;
    cur.setMonth(cur.getMonth()+1);
  }
  pedidos.forEach(p => {
    const f = getFechaVenta(p);
    const mes = f ? f.slice(0,7) : null;
    if(mes && map[mes]!==undefined) map[mes] += p.precioVenta||0;
  });
  return Object.entries(map).map(([k,v])=>({label:k.slice(5)+'/'+k.slice(2,4),ventas:v}));
}
function parseFechaCreado(str) {
  if(!str) return null;
  const parts = str.split('/');
  if(parts.length===3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  return null;
}
function renderHorasImpresoras(pedidosFiltrados) {
  const cont = document.getElementById('res-impresoras');
  const mapa = {};
  pedidosFiltrados.forEach(p => {
    p.piezas.forEach(pz => {
      const nombre = pz.impresoraNombre || 'Sin asignar';
      const h = parseFloat(pz.horas * pz.cantidad)||0;
      mapa[nombre] = (mapa[nombre]||0) + h;
    });
  });
  const entradas = Object.entries(mapa).sort((a,b)=>b[1]-a[1]);
  if(!entradas.length){ cont.innerHTML='<div class="empty">Sin datos de impresoras en el período.</div>'; return; }
  const maxH = entradas[0][1];
  cont.innerHTML = entradas.map(([nombre, horas]) => {
    const pct = maxH > 0 ? (horas/maxH*100).toFixed(1) : 0;
    const hh = Math.floor(horas), mm = Math.round((horas-hh)*60);
    const label = hh>0?(mm>0?`${hh}h ${mm}m`:`${hh}h`):`${mm}m`;
    return `<div class="imp-bar-wrap">
      <div class="imp-bar-label"><span>${nombre}</span><span>${label}</span></div>
      <div class="imp-bar-track"><div class="imp-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}
function renderTablaPeriodo(completados) {
  const cont = document.getElementById('res-tabla');
  if(!completados.length){ cont.innerHTML='<div class="empty">Sin pedidos completados en el período.</div>'; return; }
  const sortedCompletados = [...completados].sort((a, b) => {
    const fa = getFechaVenta(a)||''; const fb = getFechaVenta(b)||'';
    return fb.localeCompare(fa);
  });
  cont.innerHTML=`<div class="res-tabla-wrap"><table class="data-table" style="width:100%">
    <thead><tr>
      <th>Cliente</th>
      <th>Descripción</th>
      <th style="text-align:center">Piezas</th>
      <th style="text-align:right">Costo prod.</th>
      <th style="text-align:right">Precio venta</th>
      <th style="text-align:right">Ganancia</th>
      <th style="text-align:right">Margen</th>
      <th>Completado</th>
      <th>Entrega</th>
    </tr></thead>
    <tbody>`+sortedCompletados.map(p=>{
      const costo = p.piezas.reduce((s, pz) => s + (((pz.costeElec || 0) + (pz.costeMO || 0)) * pz.cantidad), 0);
      const gan = p.precioVenta - costo;
      const margen = p.precioVenta > 0 ? (gan / p.precioVenta * 100).toFixed(1) : 0;
      const fechaMostrar = p.fechaCompletado || p.fechaPedido || p.creado || '—';
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${p.cliente}</td>
        <td style="color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.desc||'—'}</td>
        <td style="font-family:var(--mono);text-align:center">${p.piezas.reduce((t,pz)=>t+pz.cantidad,0)}</td>
        <td style="font-family:var(--mono);text-align:right">${fmt(costo)}</td>
        <td style="font-family:var(--mono);text-align:right;color:var(--accent);font-weight:600">${fmt(p.precioVenta)}</td>
        <td style="font-family:var(--mono);text-align:right;font-weight:600" class="${gan>=0?'td-pos':'td-neg'}">${fmt(gan)}</td>
        <td style="font-family:var(--mono);text-align:right;color:${parseFloat(margen)>=0?'var(--accent)':'var(--danger)'}">${margen}%</td>
        <td style="font-family:var(--mono);color:${p.fechaCompletado?'var(--accent)':'var(--text3)'};white-space:nowrap">${fechaMostrar}</td>
        <td style="font-family:var(--mono);color:var(--text3);white-space:nowrap">${p.fechaEntrega||'—'}</td>
      </tr>`;
    }).join('')+'</tbody></table></div>';
}
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('periodo-btns').addEventListener('click', e=>{
    const btn = e.target.closest('.periodo-btn'); if(!btn) return;
    document.querySelectorAll('.periodo-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('fecha-desde').value='';
    document.getElementById('fecha-hasta').value='';
    renderResumen();
  });
});
let compraFiltroActual = 'todas';
function abrirModalCompra(id) {
  editCompraId = id;
  const hoy = new Date().toISOString().slice(0,10);
  if (id !== null) {
    const c = compras.find(x=>x.id===id); if(!c) return;
    document.getElementById('modal-compra-title').textContent = 'Editar compra';
    document.getElementById('comp-m-desc').value    = c.desc;
    document.getElementById('comp-m-cat').value     = c.cat;
    document.getElementById('comp-m-precio').value  = c.precio;
    document.getElementById('comp-m-qty').value     = c.qty||1;
    document.getElementById('comp-m-proveedor').value = c.proveedor||'';
    document.getElementById('comp-m-fecha').value   = c.fecha||hoy;
    document.getElementById('comp-m-notas').value   = c.notas||'';
  } else {
    document.getElementById('modal-compra-title').textContent = 'Nueva compra';
    ['comp-m-desc','comp-m-proveedor','comp-m-notas'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('comp-m-cat').value    = 'Insumos';
    document.getElementById('comp-m-precio').value = '';
    document.getElementById('comp-m-qty').value    = '1';
    document.getElementById('comp-m-fecha').value  = hoy;
  }
  document.getElementById('modal-compra').classList.add('open');
}
function guardarCompra() {
  const c = {
    id:        editCompraId !== null ? editCompraId : newId(),
    desc:      document.getElementById('comp-m-desc').value || 'Sin descripción',
    cat:       document.getElementById('comp-m-cat').value,
    precio:    parseFloat(document.getElementById('comp-m-precio').value)||0,
    qty:       parseInt(document.getElementById('comp-m-qty').value)||1,
    proveedor: document.getElementById('comp-m-proveedor').value,
    fecha:     document.getElementById('comp-m-fecha').value,
    notas:     document.getElementById('comp-m-notas').value,
  };
  c.total = c.precio * c.qty;
  if (editCompraId !== null) {
    const idx = compras.findIndex(x=>x.id===editCompraId);
    if (idx>=0) compras[idx] = c;
  } else {
    compras.push(c);
  }
  cerrarModal('modal-compra');
  renderCompras();
  updateComprasStats();
  guardarEstado();
}
function eliminarCompra(id) {
  if (!confirm('¿Eliminar esta compra?')) return;
  compras = compras.filter(x=>x.id!==id);
  renderCompras();
  updateComprasStats();
  guardarEstado();
}
function renderCompras() {
  const cont = document.getElementById('lista-compras'); if(!cont) return;
  const filtro = compraFiltroActual;
  const lista = filtro==='todas' ? compras : compras.filter(c=>c.cat===filtro);
  if (!lista.length) { cont.innerHTML='<div class="empty">No hay compras en esta categoría.</div>'; return; }
  const sorted = [...lista].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  cont.innerHTML = `<table class="data-table">
    <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Proveedor</th><th>Cant.</th><th>Precio unit.</th><th>Total</th><th></th></tr></thead>
    <tbody>`+sorted.map(c=>`<tr>
      <td style="font-family:var(--mono);color:var(--text3)">${c.fecha||'—'}</td>
      <td style="font-weight:500">${c.desc}</td>
      <td>${catBadge(c.cat)}</td>
      <td style="color:var(--text2)">${c.proveedor||'—'}</td>
      <td style="font-family:var(--mono);text-align:center">${c.qty||1}</td>
      <td style="font-family:var(--mono)">${fmt(c.precio)}</td>
      <td style="font-family:var(--mono);font-weight:600">${fmt(c.total||c.precio)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="abrirModalCompra(${c.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarCompra(${c.id})">✕</button>
      </div></td>
    </tr>`).join('')+'</tbody></table>';
}
function catBadge(cat) {
  const m = {Insumos:'background:var(--infoDim);color:var(--info)',Equipos:'background:var(--accentDim);color:var(--accent)',Accesorios:'background:var(--warnDim);color:var(--warn)',Otros:'background:var(--bg3);color:var(--text2)'};
  return `<span style="font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:20px;${m[cat]||m.Otros}">${cat}</span>`;
}
function updateComprasStats() {
  const total  = compras.reduce((s,c)=>s+(c.total||c.precio),0);
  const insum  = compras.filter(c=>c.cat==='Insumos').reduce((s,c)=>s+(c.total||c.precio),0);
  const equip  = compras.filter(c=>c.cat==='Equipos').reduce((s,c)=>s+(c.total||c.precio),0);
  const acces  = compras.filter(c=>c.cat==='Accesorios').reduce((s,c)=>s+(c.total||c.precio),0);
  const el=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=fmt(v);};
  el('comp-total',total); el('comp-insumos',insum); el('comp-equipos',equip); el('comp-accesorios',acces);
}
document.addEventListener('DOMContentLoaded', ()=>{
  const filtros = document.getElementById('comp-filtros');
  if (filtros) {
    filtros.addEventListener('click', e=>{
      const btn = e.target.closest('.periodo-btn'); if(!btn) return;
      filtros.querySelectorAll('.periodo-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      compraFiltroActual = btn.dataset.cat;
      renderCompras();
    });
  }
});
function esUrgente(p) {
  if (!p.fechaEntrega || p.estado === 'completado' || p.estado === 'listo' || p.estado === 'cancelado') return false;
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const entr = new Date(p.fechaEntrega + 'T00:00:00');
  const diff = (entr - hoy) / (1000*60*60*24);
  return diff >= 0 && diff <= 7;
}
function limpiarCalculadora() {
  subProductosActuales = []; // ✅ NUEVO
  gcodeData = null;
  const gr = document.getElementById('gcode-resultado'); if(gr) gr.style.display='none';
  const gf = document.getElementById('gcode-file'); if(gf) gf.value='';
  const sb = document.getElementById('status-bar'); if(sb){sb.className='status';}
  const tg = document.getElementById('tag-gcode-gramos'); if(tg) tg.style.display='none';
  const tt = document.getElementById('tag-gcode-tiempo'); if(tt) tt.style.display='none';
  const mf = document.getElementById('multi-fil-ui'); if(mf) mf.remove();
  document.getElementById('manual-fil-wrap').style.display='block';
  document.getElementById('gramos').value = '50';
  document.getElementById('horas').value = '2';
  document.getElementById('extras').value = '0';
  document.getElementById('horas-trabajo').value = '0.5';
  document.getElementById('cantidad').value = '1';
  document.getElementById('sel-filamento').value = 'manual';
  document.getElementById('fil-precio-wrap').style.display = 'block';
  aplicarImpresoraDefault();
  presupuestoActual = null;
  precioVentaTocado = false;
  calcular();
}
const _renderResumenOrig = renderResumen;
renderResumen = function() {
  _renderResumenOrig();
  const {desde, hasta} = getPeriodoFechas();
  const comprasPeriodo = compras.filter(c=>{
    if(!c.fecha) return true;
    const d = new Date(c.fecha+'T12:00:00');
    return d>=desde && d<=hasta;
  });
  const gastos = comprasPeriodo.reduce((s,c)=>s+(c.total||c.precio),0);
  const elG = document.getElementById('res-gastos');
  if(elG) elG.textContent = fmt(gastos);
  
  const elVentas  = document.getElementById('res-ventas');
  const elCostos  = document.getElementById('res-costos');
  const elGan     = document.getElementById('res-ganancia');
  const elRent    = document.getElementById('res-rent');
  
  if(elVentas&&elCostos&&elGan&&elRent){
    const pedCom = getPedidosPeriodo(desde,hasta).filter(p=>(p.estado==='completado'||p.estado==='listo')&&p.precioVenta);
    const v = pedCom.reduce((s,p)=>s+p.precioVenta,0);
    
    // NUEVO CÁLCULO NETO FINAL: Ventas - (Electricidad + Mano Obra) - Gastos(Compras)
    const cp2 = pedCom.reduce((s, p) => {
        const c2 = p.piezas.reduce((a, pz) => a + (((pz.costeElec || 0) + (pz.costeMO || 0)) * pz.cantidad), 0);
        return s + c2;
    }, 0);
    
    const ganNeta = v - cp2 - gastos;
    const rentNeta = v>0?(ganNeta/v*100):0;
    
    elGan.textContent = fmt(ganNeta);
    elGan.style.color = ganNeta>=0?'var(--accent)':'var(--danger)';
    elRent.textContent = rentNeta.toFixed(1)+'%';
    elRent.style.color = rentNeta>=0?'var(--accent)':'var(--danger)';
  }
  
  const tc = document.getElementById('res-compras-tabla');
  if(tc){
    if(!comprasPeriodo.length){tc.innerHTML='<div class="empty">Sin compras en el período.</div>';return;}
    tc.innerHTML=`<div class="res-tabla-wrap"><table class="data-table" style="width:100%"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Proveedor</th><th style="text-align:right">Total</th></tr></thead><tbody>`+
      [...comprasPeriodo].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(c=>`<tr>
        <td style="font-family:var(--mono);color:var(--text3)">${c.fecha||'—'}</td>
        <td>${c.desc}</td><td>${catBadge(c.cat)}</td>
        <td style="font-family:var(--mono);color:var(--text2)">${c.proveedor||'—'}</td>
        <td style="font-family:var(--mono);text-align:right;color:var(--danger)">${fmt(c.total||c.precio)}</td>
      </tr>`).join('')+'</tbody></table></div>';
  }
};
const urgStyle = document.createElement('style');
urgStyle.textContent = '.pedido-card.urgente{border-color:rgba(248,113,113,.4);background:rgba(248,113,113,.04)}.pedido-card.urgente:hover{border-color:var(--danger)}';
document.head.appendChild(urgStyle);
function mostrarToast(msg, tipo='success') {
  let t = document.getElementById('toast');
  if(!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;font-size:13px;font-family:var(--mono);z-index:999;pointer-events:none;transition:opacity .3s;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    document.body.appendChild(t);
  }
  const colors = {success:'background:#1a2e20;color:var(--accent);border:1px solid rgba(110,231,183,.3)', error:'background:#2e1a1a;color:var(--danger);border:1px solid rgba(248,113,113,.3)', info:'background:#1a1e2e;color:var(--info);border:1px solid rgba(96,165,250,.3)'};
  t.style.cssText += ';' + (colors[tipo]||colors.success);
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._hide);
  t._hide = setTimeout(()=>t.style.opacity='0', 3000);
}
function abrirModalGuardarBiblioteca() {
  if (!presupuestoActual || presupuestoActual.total === 0) {
    mostrarToast('Primero calculá el costo del producto.', 'error'); return;
  }
  const nomSug = gcodeData?.nombre
    ? gcodeData.nombre.replace(/\.(3mf|gcode|gco)$/i,'').replace(/\s*→.*$/,'').trim()
    : '';
  document.getElementById('bib-m-nombre').value = nomSug;
  document.getElementById('bib-m-desc').value   = '';
  document.getElementById('bib-m-cat').value    = '';
  const cats = [...new Set(biblioteca.map(p=>p.cat).filter(Boolean))];
  document.getElementById('bib-cats-list').innerHTML = cats.map(c=>`<option value="${c}">`).join('');
  const p = presupuestoActual;
  const mats = gcodeData?.tipo==='bambu'
    ? Object.values(gcodeData.matMap).map(m=>`${m.type} ${m.totalG.toFixed(1)}g`).join(', ')
    : `${document.getElementById('gramos').value}g`;
  document.getElementById('bib-m-resumen').innerHTML =
    `Filamentos: <strong>${fmt(p.costeFil*p.cantidad)}</strong> (${mats})<br>` +
    `Electricidad: <strong>${fmt(p.costeElec*p.cantidad)}</strong> · ${p.horas.toFixed(1)}h<br>` +
    `Mano de obra: <strong>${fmt(p.costeMO*p.cantidad)}</strong><br>` +
    `<strong style="color:var(--text)">Costo total: ${fmt(p.total*p.cantidad)} · Precio sugerido: ${fmt(p.precio*p.cantidad)}</strong>`;
  document.getElementById('modal-bib-guardar').classList.add('open');
}
function confirmarGuardarBiblioteca() {
  const nombre = document.getElementById('bib-m-nombre').value.trim();
  if (!nombre) { mostrarToast('Ingresá un nombre para el producto.', 'error'); return; }
  const p = presupuestoActual;
  const snap = {
    id:          newId(),
    nombre,
    desc:        document.getElementById('bib-m-desc').value.trim(),
    cat:         document.getElementById('bib-m-cat').value.trim() || 'General',
    
  // ✅ NUEVO
    subProductos: presupuestoActual?.subProductos || null,
    esCompuesto: !!presupuestoActual?.subProductos,

    fechaGuardado: new Date().toLocaleDateString('es-AR'),
    costoUnitario: p.total,
    precioSugUnitario: p.precio,
    margen:      p.margen,
    horas:       p.horas,
    cantidad:    p.cantidad || 1,
    impresoraNombre: p.impresoraNombre || null,
    filDetalle:  p.filDetalle || [],
    gramos:      parseFloat(document.getElementById('gramos').value) || 0,
    precioRollo: parseFloat(document.getElementById('precio-rollo').value) || 0,
    watts:       parseFloat(document.getElementById('watts').value) || 0,
    precioKwh:   parseFloat(document.getElementById('precio-kwh').value) || 0,
    moHora:      parseFloat(document.getElementById('mano-obra').value) || 0,
    horasTrab:   parseFloat(document.getElementById('horas-trabajo').value) || 0,
    extras:      parseFloat(document.getElementById('extras').value) || 0,
    desperdicio: parseFloat(document.getElementById('desperdicio').value) || 0,
    gcodeNombre: gcodeData?.nombre || null,
    materiales:  gcodeData?.tipo==='bambu'
      ? Object.values(gcodeData.matMap).map(m=>({type:m.type,color:m.color,totalG:m.totalG,precioKg:m.precioKg}))
      : null,
    multiMat:    !!document.getElementById('multi-fil-ui'),
    matData:     gcodeData?.tipo==='bambu'
      ? Object.values(gcodeData.matMap).map((m,i)=>({
          totalG: parseFloat(document.getElementById(`mfil-g-${i}`)?.value || m.totalG),
          precioKg: parseFloat(document.getElementById(`mfil-p-${i}`)?.value || m.precioKg)
        }))
      : null,
  };
  const idx = biblioteca.findIndex(p=>p.nombre.toLowerCase()===nombre.toLowerCase());
  if (idx >= 0) {
    if (!confirm(`Ya existe "${nombre}" en la biblioteca. ¿Reemplazarlo con los valores actuales?`)) return;
    biblioteca[idx] = snap;
    mostrarToast('Producto actualizado en biblioteca.');
  } else {
    biblioteca.push(snap);
    mostrarToast('✓ Producto guardado en biblioteca.');
  }
  guardarEstado();
  cerrarModal('modal-bib-guardar');
  renderBibMini();
}
function cargarDesdeBiblioteca(id) {
  if (prod.esCompuesto && prod.subProductos) {
  subProductosActuales = [...prod.subProductos];
  actualizarResumenMultiProducto();

  mostrarToast(`✓ Producto compuesto cargado (${subProductosActuales.length} partes)`);
  return;
}
  const prod = biblioteca.find(p=>p.id===id); if(!prod) return;
  gcodeData = null;
  const gr=document.getElementById('gcode-resultado'); if(gr) gr.style.display='none';
  document.getElementById('manual-fil-wrap').style.display='block';
  const mf=document.getElementById('multi-fil-ui'); if(mf) mf.remove();
  document.getElementById('tag-gcode-gramos').style.display='none';
  document.getElementById('tag-gcode-tiempo').style.display='none';
  document.getElementById('horas').value        = prod.horas;
  document.getElementById('watts').value        = prod.watts;
  document.getElementById('precio-kwh').value   = prod.precioKwh;
  document.getElementById('mano-obra').value    = prod.moHora;
  document.getElementById('horas-trabajo').value= prod.horasTrab;
  document.getElementById('extras').value       = prod.extras;
  document.getElementById('margen').value       = prod.margen;
  document.getElementById('desperdicio').value  = prod.desperdicio;
  document.getElementById('cantidad').value     = prod.cantidad || 1;
  if (prod.materiales && prod.materiales.length > 0 && prod.matData) {
    const matMap = {};
    prod.materiales.forEach((m,i)=>{
      const key=`${m.type}|${m.color}`;
      matMap[key]={type:m.type,color:m.color,totalG:prod.matData[i]?.totalG||m.totalG,precioKg:prod.matData[i]?.precioKg||m.precioKg};
    });
    gcodeData = {tipo:'bambu', placas:[], matMap, totalSeg:prod.horas*3600, nombre: prod.gcodeNombre||prod.nombre};
    document.getElementById('horas').value = prod.horas;
    document.getElementById('tag-gcode-tiempo').style.display='inline-block';
    renderMultiFilUI();
  } else {
    document.getElementById('gramos').value       = prod.gramos;
    document.getElementById('precio-rollo').value = prod.precioRollo;
    document.getElementById('fil-precio-wrap').style.display = 'block';
    document.getElementById('sel-filamento').value = 'manual';
    document.getElementById('tag-gcode-gramos').style.display='inline-block';
  }
  if (prod.impresoraNombre) {
    const idx = cfg.impresoras.findIndex(imp=>imp.nombre===prod.impresoraNombre);
    if (idx>=0) {
      document.getElementById('sel-impresora').value = idx;
      document.getElementById('watts').value = cfg.impresoras[idx].watts;
      document.getElementById('imp-watts-wrap').style.display='none';
    }
  }
  calcular();
  cerrarModal('modal-bib-usar');
  mostrarToast(`✓ "${prod.nombre}" cargado en la calculadora.`);
}
function eliminarDeBiblioteca(id) {
  if (!confirm('¿Eliminar este producto de la biblioteca?')) return;
  biblioteca = biblioteca.filter(p=>p.id!==id);
  guardarEstado();
  renderBibliotecaPage();
  renderBibMini();
  mostrarToast('Producto eliminado.', 'info');
}
let _editarCatBibId = null;
function abrirEditarCatBiblioteca(id) {
  const prod = biblioteca.find(p=>p.id===id); if(!prod) return;
  _editarCatBibId = id;
  document.getElementById('bib-edit-cat-nombre').textContent = prod.nombre;
  document.getElementById('bib-edit-cat-input').value = prod.cat||'';
  const cats = [...new Set(biblioteca.map(p=>p.cat).filter(Boolean))].sort();
  document.getElementById('bib-edit-cats-list').innerHTML = cats.map(c=>`<option value="${c}">`).join('');
  document.getElementById('modal-bib-editar-cat').classList.add('open');
}
function confirmarEditarCatBiblioteca() {
  const prod = biblioteca.find(p=>p.id===_editarCatBibId); if(!prod) return;
  const nuevaCat = document.getElementById('bib-edit-cat-input').value.trim() || 'General';
  prod.cat = nuevaCat;
  guardarEstado();
  cerrarModal('modal-bib-editar-cat');
  renderBibliotecaPage();
  renderBibMini();
  mostrarToast(`✓ Categoría actualizada a "${nuevaCat}".`);
}
function renderBibMini() {
  const cont = document.getElementById('bib-mini-lista'); if(!cont) return;
  const q = (document.getElementById('bib-q')?.value||'').toLowerCase().trim();
  const catSel = document.getElementById('bib-mini-cat');
  const cat = catSel?.value||'';
  if (catSel) {
    const cats = [...new Set(biblioteca.map(p=>p.cat).filter(Boolean))].sort();
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c=>`<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  }
  const lista = biblioteca.filter(p=>{
    const matchQ = !q||p.nombre.toLowerCase().includes(q)||p.cat?.toLowerCase().includes(q);
    const matchCat = !cat||p.cat===cat;
    return matchQ && matchCat;
  });
  if (!lista.length) {
    cont.innerHTML = biblioteca.length
      ? '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">Sin resultados.</div>'
      : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">La biblioteca está vacía. Guardá un producto calculado.</div>';
    return;
  }
  const shown = lista.slice(0,6);
  cont.innerHTML = shown.map(p=>`
    <div class="bib-card" onclick="cargarDesdeBiblioteca(${p.id})" title="Cargar en calculadora">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="min-width:0">
          <div style="font-weight:500;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:2px">
            ${p.cat||'General'} · ${p.horas?.toFixed(1)||'?'}h · ${fmt(p.costoUnitario * p.cantidad)}
          </div>
        </div>
        <span style="font-size:12px;font-family:var(--mono);color:var(--accent);font-weight:600;flex-shrink:0">${fmt(p.precioSugUnitario * p.cantidad)}</span>
      </div>
    </div>`).join('');
  if (lista.length > 6) {
    cont.innerHTML += `<div style="font-size:12px;color:var(--text3);text-align:center;padding:6px;cursor:pointer" onclick="abrirModalBibUsar()">Ver los ${lista.length} productos →</div>`;
  }
}
function renderBibUsarLista() {
  const cont = document.getElementById('bib-usar-lista'); if(!cont) return;
  const q = (document.getElementById('bib-usar-q')?.value||'').toLowerCase().trim();
  const catSel = document.getElementById('bib-usar-cat');
  const cat = catSel?.value||'';
  if (catSel) {
    const cats = [...new Set(biblioteca.map(p=>p.cat).filter(Boolean))].sort();
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c=>`<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  }
  const lista = biblioteca.filter(p=>{
    const matchQ = !q||p.nombre.toLowerCase().includes(q)||p.cat?.toLowerCase().includes(q)||p.desc?.toLowerCase().includes(q);
    const matchCat = !cat||p.cat===cat;
    return matchQ && matchCat;
  });
  if (!lista.length) {
    cont.innerHTML='<div class="bib-empty">Sin resultados.</div>'; return;
  }
  cont.innerHTML = lista.map(p=>`
    <div class="bib-card" onclick="cargarDesdeBiblioteca(${p.id})">
      <div style="font-weight:500;font-size:13px;margin-bottom:4px">${p.nombre}</div>
      ${p.desc?`<div style="font-size:12px;color:var(--text2);margin-bottom:4px">${p.desc}</div>`:''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:11px;background:var(--bg2);border:1px solid var(--border);padding:1px 7px;border-radius:20px;font-family:var(--mono)">${p.cat||'General'}</span>
        <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${p.horas?.toFixed(1)||'?'}h impresión</span>
        ${p.impresoraNombre?`<span style="font-size:11px;color:var(--text3);font-family:var(--mono)">🖨 ${p.impresoraNombre}</span>`:''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:var(--text2);font-family:var(--mono)">Costo: ${fmt(p.costoUnitario * p.cantidad)}</span>
        <span style="font-size:14px;font-weight:700;font-family:var(--mono);color:var(--accent)">${fmt(p.precioSugUnitario * p.cantidad)}</span>
      </div>
    </div>`).join('');
}
function renderBibliotecaPage() {
  const cont = document.getElementById('bib-page-lista'); if(!cont) return;
  const q    = (document.getElementById('bib-page-q')?.value||'').toLowerCase().trim();
  const cat  = document.getElementById('bib-page-cat')?.value||'';
  const cats = [...new Set(biblioteca.map(p=>p.cat).filter(Boolean))].sort();
  const catSel = document.getElementById('bib-page-cat');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Categoria de Productos</option>' +
      cats.map(c=>`<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  }
  const lista = biblioteca.filter(p=>{
    const matchQ   = !q   || p.nombre.toLowerCase().includes(q) || p.desc?.toLowerCase().includes(q);
    const matchCat = !cat || p.cat === cat;
    return matchQ && matchCat;
  });
  const countEl = document.getElementById('bib-count');
  if (countEl) countEl.textContent = `${lista.length} producto${lista.length!==1?'s':''}`;
  if (!lista.length) {
    cont.innerHTML = `<div class="card"><div class="bib-empty">${biblioteca.length?'Sin resultados para esa búsqueda.':'La biblioteca está vacía.<br>Calculá un producto y guardalo con el botón "Guardar en biblioteca".'}</div></div>`;
    actualizarBibToolbar();
    return;
  }
  cont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">` +
    lista.map(p=>`
    <div class="card${bibSeleccionados.has(p.id)?' bib-selected':''}" style="margin-bottom:0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div style="display:flex;gap:8px;flex:1;min-width:0">
          <input type="checkbox" style="width:auto;margin-top:3px;accent-color:var(--accent);cursor:pointer;flex-shrink:0" ${bibSeleccionados.has(p.id)?'checked':''} onchange="toggleBibSeleccion(${p.id}, this.checked)" title="Seleccionar para armar pedido">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;margin-bottom:2px">${p.nombre}</div>
            ${p.desc?`<div style="font-size:12px;color:var(--text2)">${p.desc}</div>`:''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-left:8px;flex-shrink:0">
          <span style="font-size:11px;background:var(--bg3);border:1px solid var(--border);padding:2px 8px;border-radius:20px;font-family:var(--mono);white-space:nowrap">${p.cat||'General'}</span>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="event.stopPropagation();abrirEditarCatBiblioteca(${p.id})" title="Editar categoría">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" style="width:11px;height:11px"><path d="M13 3l4 4-9 9H4v-4L13 3z"/></svg>
          </button>
        </div>
      </div>
      <div style="background:var(--bg3);border-radius:var(--radius);padding:10px;margin-bottom:10px">
        <div class="cost-line"><span>Costo (${p.cantidad}u)</span><span>${fmt(p.costoUnitario * p.cantidad)}</span></div>
        <div class="cost-line strong" style="margin-top:4px"><span>Precio sug. (${p.cantidad}u)</span><span>${fmt(p.precioSugUnitario * p.cantidad)}</span></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center" onclick="cargarDesdeBibliotecaYNavegar(${p.id})">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><path d="M4 10h12M10 4l6 6-6 6"/></svg>Usar en calculadora
        </button>
        <button class="btn btn-danger btn-sm" onclick="eliminarDeBiblioteca(${p.id})">✕</button>
      </div>
      <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:6px;text-align:right">Guardado: ${p.fechaGuardado||'—'}</div>
    </div>`).join('') + '</div>';
  actualizarBibToolbar();
}
function toggleBibSeleccion(id, checked){
  if(checked) bibSeleccionados.add(id); else bibSeleccionados.delete(id);
  actualizarBibToolbar();
}
function actualizarBibToolbar(){
  const bar = document.getElementById('bib-toolbar');
  if(!bar) return;
  const n = bibSeleccionados.size;
  if(n>0){
    bar.style.display='flex';
    document.getElementById('bib-toolbar-count').textContent = `${n} producto${n>1?'s':''} seleccionado${n>1?'s':''}`;
  } else {
    bar.style.display='none';
  }
}
function cancelarSeleccionBib(){
  bibSeleccionados.clear();
  pedidoObjetivoBib = null;
  renderBibliotecaPage();
}
function coloresOptionsHTML(seleccionado){
  const cols = cfg.colores||[];
  let html = '<option value="">— Sin color —</option>';
  html += cols.map(c=>`<option value="${c.nombre}" ${c.nombre===seleccionado?'selected':''}>${c.nombre}</option>`).join('');
  return html;
}
function colorHexPorNombre(nombre){
  const c = (cfg.colores||[]).find(x=>x.nombre===nombre);
  return c?.hex || '#8b92a8';
}
function abrirModalArmarPedido(){
  if(!bibSeleccionados.size){ mostrarToast('Seleccioná al menos un producto.', 'error'); return; }
  const ids = biblioteca.filter(p=>bibSeleccionados.has(p.id)).map(p=>p.id);
  armarPedidoItems = ids.map(id=>{
    const prod = biblioteca.find(p=>p.id===id);
    if(!prod) return null;
    const cantidad = prod.cantidad||1;
    return {
      prodId: id,
      nombre: prod.nombre,
      cantidad,
      precioEstimado: prod.precioSugUnitario || prod.costoUnitario || 0,
      versiones: cantidad>1 ? [{id:_arpVerCounter++, cantidad, color:'', comentario:''}] : []
    };
  }).filter(Boolean);
  arpMontoFinalTocado = false;
  document.getElementById('arp-envio').value='';
  document.getElementById('arp-cliente').value='';
  document.getElementById('arp-desc').value='';
  document.getElementById('arp-fecha-pedido').value=new Date().toISOString().slice(0,10);
  document.getElementById('arp-fecha-entrega').value='';
  const pedidosActivos = pedidos.filter(p=>p.estado!=='cancelado'&&p.estado!=='completado');
  const sel = document.getElementById('arp-destino');
  sel.innerHTML = '<option value="nuevo">+ Crear pedido nuevo</option>' +
    pedidosActivos.map(p=>`<option value="${p.id}">${p.cliente} — ${p.desc||'Sin descripción'} [${badgeText(p.estado)}]</option>`).join('');
  const destinoFijo = pedidos.find(p=>p.id===pedidoObjetivoBib && p.estado!=='cancelado'&&p.estado!=='completado');
  const destinoLabel = document.getElementById('arp-destino-fijo-label');
  if(destinoFijo){
    sel.value = String(destinoFijo.id);
    sel.disabled = true;
    if(destinoLabel){ destinoLabel.style.display='block'; destinoLabel.textContent = `📦 Agregando productos al pedido de "${destinoFijo.cliente}" — ${destinoFijo.desc||'sin descripción'}`; }
  } else {
    sel.value='nuevo';
    sel.disabled = false;
    if(destinoLabel) destinoLabel.style.display='none';
  }
  onDestinoArmarPedidoChange();
  renderArmarPedidoLista();
  document.getElementById('modal-armar-pedido').classList.add('open');
}
function onDestinoArmarPedidoChange(){
  const v = document.getElementById('arp-destino').value;
  document.getElementById('arp-nuevo-datos').style.display = v==='nuevo' ? 'block' : 'none';
}
function calcularTotalArmarPedido(){
  return armarPedidoItems.reduce((s,it)=>s+(it.cantidad*it.precioEstimado),0);
}
function actualizarTotalesArmarPedido(){
  const total = calcularTotalArmarPedido();
  const pEl = document.getElementById('arp-presupuesto');
  if(pEl) pEl.textContent = fmt(total);
  const mEl = document.getElementById('arp-monto-final');
  if(mEl && !arpMontoFinalTocado) mEl.value = Math.round(total);
}
function renderArmarPedidoLista(){
  const cont = document.getElementById('ap2-lista');
  if(!armarPedidoItems.length){
    cont.innerHTML = '<div class="empty">No hay productos seleccionados.</div>';
    actualizarTotalesArmarPedido();
    return;
  }
  cont.innerHTML = armarPedidoItems.map((it,idx)=>{
    const subtotal = it.cantidad*it.precioEstimado;
    const asignado = it.versiones.reduce((s,v)=>s+v.cantidad,0);
    const restante = it.cantidad - asignado;
    let versionesHTML='';
    if(it.cantidad>1){
      versionesHTML = `<div style="background:rgba(255,255,255,.03);border:1px dashed var(--border2);border-radius:8px;padding:10px;margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Versiones</span>
          <span style="font-size:11px;font-family:var(--mono);color:${restante===0?'var(--accent)':'var(--warn)'}">${restante===0?'✓ Completo':'Faltan asignar '+restante}</span>
        </div>
        ${it.versiones.map(v=>`<div class="version-row">
          <input type="number" min="1" max="${it.cantidad}" value="${v.cantidad}" onchange="onVersionCantidadChange(${idx},${v.id},this.value)">
          <select onchange="onVersionColorChange(${idx},${v.id},this.value)">${coloresOptionsHTML(v.color)}</select>
          <input type="text" placeholder="Comentario..." value="${v.comentario||''}" oninput="onVersionComentarioChange(${idx},${v.id},this.value)">
          <button class="btn btn-danger btn-sm" style="padding:2px 5px" onclick="quitarVersion(${idx},${v.id})">✕</button>
        </div>`).join('')}
        ${restante>0?`<button class="btn btn-sm" style="width:100%" onclick="agregarVersion(${idx})">+ Agregar versión (faltan ${restante})</button>`:''}
      </div>`;
    }
    return `<div class="card" style="margin-bottom:10px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px">${it.nombre}</div>
        <button class="btn btn-ghost btn-sm" onclick="quitarItemArmarPedido(${idx})">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:90px 1fr 1fr;gap:8px;align-items:end">
        <div><label class="fl" style="margin-top:0">Cant.</label><input type="number" min="1" value="${it.cantidad}" onchange="onCantidadItemChange(${idx},this.value)"></div>
        <div><label class="fl" style="margin-top:0">Precio est. /u ($)</label><input type="number" min="0" value="${it.precioEstimado}" oninput="onPrecioItemChange(${idx},this.value)"></div>
        <div style="text-align:right"><label class="fl" style="margin-top:0">Subtotal</label><div id="arp-sub-${idx}" style="font-family:var(--mono);font-weight:600;padding:8px 0">${fmt(subtotal)}</div></div>
      </div>
      ${versionesHTML}
    </div>`;
  }).join('');
  actualizarTotalesArmarPedido();
}
function onPrecioItemChange(idx, valor){
  const it = armarPedidoItems[idx]; if(!it) return;
  it.precioEstimado = parseFloat(valor)||0;
  const subEl = document.getElementById('arp-sub-'+idx);
  if(subEl) subEl.textContent = fmt(it.cantidad*it.precioEstimado);
  actualizarTotalesArmarPedido();
}
function onCantidadItemChange(idx, valor){
  const it = armarPedidoItems[idx]; if(!it) return;
  const cant = Math.max(1, parseInt(valor)||1);
  it.cantidad = cant;
  if(cant<=1){
    it.versiones = [];
  } else if(!it.versiones || !it.versiones.length){
    // no versions yet (was cantidad=1 before): seed one covering full qty
    it.versiones = [{id:_arpVerCounter++, cantidad:cant, color:'', comentario:''}];
  } else {
    // keep existing versions; if new qty is smaller than what's assigned, trim from the end
    let asignado = it.versiones.reduce((s,v)=>s+v.cantidad,0);
    while(asignado > cant && it.versiones.length){
      const last = it.versiones[it.versiones.length-1];
      const exceso = asignado - cant;
      if(last.cantidad > exceso){
        last.cantidad -= exceso;
        asignado -= exceso;
      } else {
        asignado -= last.cantidad;
        it.versiones.pop();
      }
    }
    // if new qty is larger, leave the difference unassigned so the user can add a distinct new version
  }
  renderArmarPedidoLista();
}
function onVersionCantidadChange(idx, verId, valor){
  const it = armarPedidoItems[idx]; if(!it) return;
  const v = it.versiones.find(x=>x.id===verId); if(!v) return;
  const otras = it.versiones.filter(x=>x.id!==verId).reduce((s,x)=>s+x.cantidad,0);
  const maxPermitido = Math.max(1, it.cantidad - otras);
  let val = parseInt(valor)||1;
  val = Math.max(1, Math.min(val, maxPermitido));
  v.cantidad = val;
  renderArmarPedidoLista();
}
function onVersionColorChange(idx, verId, valor){
  const it = armarPedidoItems[idx]; if(!it) return;
  const v = it.versiones.find(x=>x.id===verId); if(v) v.color = valor;
}
function onVersionComentarioChange(idx, verId, valor){
  const it = armarPedidoItems[idx]; if(!it) return;
  const v = it.versiones.find(x=>x.id===verId); if(v) v.comentario = valor;
}
function agregarVersion(idx){
  const it = armarPedidoItems[idx]; if(!it) return;
  const asignado = it.versiones.reduce((s,v)=>s+v.cantidad,0);
  const restante = it.cantidad - asignado;
  if(restante<=0) return;
  it.versiones.push({id:_arpVerCounter++, cantidad:restante, color:'', comentario:''});
  renderArmarPedidoLista();
}
function quitarVersion(idx, verId){
  const it = armarPedidoItems[idx]; if(!it) return;
  it.versiones = it.versiones.filter(v=>v.id!==verId);
  renderArmarPedidoLista();
}
function quitarItemArmarPedido(idx){
  const it = armarPedidoItems[idx]; if(!it) return;
  bibSeleccionados.delete(it.prodId);
  armarPedidoItems.splice(idx,1);
  renderArmarPedidoLista();
}
function onMontoFinalInput(){ arpMontoFinalTocado = true; }
function construirPiezaDesdeBibParaPedido(it){
  const prod = biblioteca.find(p=>p.id===it.prodId) || {};
  const horas = prod.horas||0;
  const watts = prod.watts||0;
  const precioKwh = prod.precioKwh || cfg.kwh || 0;
  const moHora = prod.moHora||0;
  const horasTrab = prod.horasTrab||0;
  const costeElec = (watts/1000)*horas*precioKwh;
  const costeMO = moHora*horasTrab;
  let mant=0;
  if(prod.impresoraNombre){
    const imp = cfg.impresoras.find(i=>i.nombre===prod.impresoraNombre);
    if(imp) mant = imp.mant||0;
  }
  const costeMant = mant*horas;
  return {
    id: newId(),    
    subProductos: prod.subProductos || null,
    esCompuesto: prod.esCompuesto || false,
    nombre: it.nombre,
    archivoNombre: prod.gcodeNombre||null,
    filDetalle: prod.filDetalle||[],
    costeElec, costeMant, costeMO, horas,
    impresoraNombre: prod.impresoraNombre||null,
    costoUnitario: prod.costoUnitario||0,
    precioEstimado: it.precioEstimado,
    precioVenta: it.precioEstimado || prod.precioSugUnitario || 0,
    cantidad: it.cantidad,
    elaborados: 0,
    notas: '',
    versiones: (it.versiones||[]).map(v=>({id:v.id||(_arpVerCounter++), cantidad:v.cantidad, color:v.color, comentario:v.comentario, realizados:0}))
  };
}
function confirmarArmarPedido(){
  if(!armarPedidoItems.length){ mostrarToast('No hay productos para agregar.', 'error'); return; }
  const incompletas = armarPedidoItems.filter(it=>it.cantidad>1 && it.versiones.reduce((s,v)=>s+v.cantidad,0)!==it.cantidad);
  if(incompletas.length){
    if(!confirm('Hay productos con versiones sin asignar completamente (color/comentario). ¿Querés crear el pedido igual?')) return;
  }
  const destino = document.getElementById('arp-destino').value;
  const montoFinal = parseFloat(document.getElementById('arp-monto-final').value)||0;
  const envio = parseFloat(document.getElementById('arp-envio').value)||0;
  const nuevasPiezas = armarPedidoItems.map(construirPiezaDesdeBibParaPedido);
  let pedidoDestinoId;
  if(destino==='nuevo'){
    const cliente = document.getElementById('arp-cliente').value.trim() || 'Sin nombre';
    const desc = document.getElementById('arp-desc').value.trim();
    const nuevo = {
      id:newId(), cliente, desc, estado:'pendiente',
      fechaPedido: document.getElementById('arp-fecha-pedido').value || new Date().toISOString().slice(0,10),
      fechaEntrega: document.getElementById('arp-fecha-entrega').value || '',
      notaGeneral:'', piezas:nuevasPiezas, precioVenta:montoFinal, envio:envio||0,
      insumos:[], creado:new Date().toLocaleDateString('es-AR')
    };
    pedidos.push(nuevo);
    pedidoDestinoId = nuevo.id;
  } else {
    const p = pedidos.find(x=>x.id===parseInt(destino));
    if(!p){ mostrarToast('Pedido destino no encontrado.', 'error'); return; }
    p.piezas.push(...nuevasPiezas);
    p.precioVenta = (p.precioVenta||0) + montoFinal;
    if(envio) p.envio = (p.envio||0) + envio;
    pedidoDestinoId = p.id;
  }
  bibSeleccionados.clear();
  armarPedidoItems = [];
  pedidoObjetivoBib = null;
  document.getElementById('arp-destino').disabled = false;
  cerrarModal('modal-armar-pedido');
  guardarEstado();
  renderBibliotecaPage();
  renderPedidos();
  updateStats();
  mostrarToast('✓ Pedido armado con éxito.');
  navTo('pedidos', document.querySelectorAll('.nav-item')[1]);
  setTimeout(()=>abrirDetallePedido(pedidoDestinoId),100);
}
function cancelarArmarPedido(){
  pedidoObjetivoBib = null;
  const sel = document.getElementById('arp-destino');
  if(sel) sel.disabled = false;
  cerrarModal('modal-armar-pedido');
}
function cargarDesdeBibliotecaYNavegar(id) {
  cargarDesdeBiblioteca(id);
  navTo('calc', document.querySelectorAll('.nav-item')[3]);
}
function abrirModalBibUsar() {
  document.getElementById('bib-usar-q').value='';
  const catSel = document.getElementById('bib-usar-cat');
  if(catSel) catSel.value='';
  renderBibUsarLista();
  document.getElementById('modal-bib-usar').classList.add('open');
}
function guardarEstado() {
  try {
    localStorage.setItem(LS_PEDIDOS,  JSON.stringify(pedidos));
    localStorage.setItem(LS_CFG,      JSON.stringify(cfg));
    localStorage.setItem(LS_COUNTER,  String(_idCounter));
    localStorage.setItem(LS_COMPRAS,  JSON.stringify(compras));
    localStorage.setItem(LS_BIB,      JSON.stringify(biblioteca));
    localStorage.setItem(LS_CLIENTES, JSON.stringify(clientes));
    mostrarIndicadorGuardado();
  } catch(e) {
    console.warn('localStorage lleno o no disponible:', e);
  }
}
function cargarEmpresa(){
  try{
    const saved = localStorage.getItem(LS_EMPRESA);
    if(saved) empresa = Object.assign({nombre:'',cuit:'',direccion:'',cp:'',email:'',telefono:'',facebook:'',instagram:'',logo:''}, JSON.parse(saved));
  }catch(e){ console.warn('Error cargando datos del emprendimiento:', e); }
  renderFormEmpresa();
  renderEmpresaHeader();
}
function renderFormEmpresa(){
  const ids=['nombre','cuit','direccion','cp','email','telefono','facebook','instagram'];
  ids.forEach(id=>{const el=document.getElementById('emp-'+id); if(el) el.value=empresa[id]||'';});
  const prev=document.getElementById('emp-logo-preview');
  if(prev){
    prev.innerHTML = empresa.logo
      ? `<img src="${empresa.logo}" style="width:100%;height:100%;object-fit:cover">`
      : `<svg viewBox="0 0 20 20" fill="none" stroke="var(--text3)" stroke-width="1.5" style="width:28px;height:28px"><polygon points="10,2 18,6 18,14 10,18 2,14 2,6"/><polygon points="10,6 14,8 14,12 10,14 6,12 6,8"/></svg>`;
  }
}
function saveEmpresa(){
  const ids=['nombre','cuit','direccion','cp','email','telefono','facebook','instagram'];
  ids.forEach(id=>{const el=document.getElementById('emp-'+id); if(el) empresa[id]=el.value;});
  try{ localStorage.setItem(LS_EMPRESA, JSON.stringify(empresa)); mostrarIndicadorGuardado(); }catch(e){ console.warn('Error guardando datos del emprendimiento:', e); }
  renderEmpresaHeader();
}
function onLogoEmpresaSeleccionado(file){
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Elegí un archivo de imagen.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    empresa.logo = e.target.result;
    renderFormEmpresa();
    saveEmpresa();
  };
  reader.readAsDataURL(file);
}
function quitarLogoEmpresa(){
  empresa.logo = '';
  renderFormEmpresa();
  saveEmpresa();
}
function renderEmpresaHeader(){
  let el = document.getElementById('header-empresa');
  if(!el){
    el = document.createElement('div');
    el.id = 'header-empresa';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:14px;padding-left:14px;border-left:1px solid var(--border)';
    const title = document.querySelector('.header-title');
    if(title) title.after(el);
    else document.querySelector('.header')?.appendChild(el);
  }
  if(!empresa.nombre && !empresa.logo){ el.innerHTML=''; el.style.borderLeft='none'; return; }
  el.style.borderLeft='1px solid var(--border)';
  el.innerHTML = `
    ${empresa.logo?`<img src="${empresa.logo}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;border:1px solid var(--border);flex-shrink:0">`:''}
    ${empresa.nombre?`<span style="font-size:13px;color:var(--text2);font-family:var(--sans);white-space:nowrap">${empresa.nombre}</span>`:''}
  `;
}
function cargarEstado() {
  try {
    const savedCfg = localStorage.getItem(LS_CFG);
    if (savedCfg) cfg = JSON.parse(savedCfg);
    if (!cfg.colores || !cfg.colores.length) {
      cfg.colores = [{nombre:'Blanco',hex:'#f5f5f5'},{nombre:'Negro',hex:'#1a1a1a'},{nombre:'Rojo',hex:'#e53935'},{nombre:'Azul',hex:'#1e88e5'},{nombre:'Verde',hex:'#43a047'},{nombre:'Gris',hex:'#9e9e9e'},{nombre:'Amarillo',hex:'#fdd835'}];
    }
    if (!cfg.metodosEnvio || !cfg.metodosEnvio.length) {
      cfg.metodosEnvio = ['Correo Argentino','Andreani','Retiro en persona','Envío propio'];
    }
    const savedPedidos = localStorage.getItem(LS_PEDIDOS);
    if (savedPedidos) pedidos = JSON.parse(savedPedidos);
    const savedCompras = localStorage.getItem(LS_COMPRAS);
    if (savedCompras) compras = JSON.parse(savedCompras);
    const savedBib = localStorage.getItem(LS_BIB);
    if (savedBib) biblioteca = JSON.parse(savedBib);
    const savedClientes = localStorage.getItem(LS_CLIENTES);
    if (savedClientes) clientes = JSON.parse(savedClientes);
    const savedCounter = localStorage.getItem(LS_COUNTER);
    if (savedCounter) _idCounter = parseInt(savedCounter) || 1;
  } catch(e) {
    console.warn('Error cargando estado:', e);
  }
}
function mostrarIndicadorGuardado() {
  let ind = document.getElementById('save-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'save-indicator';
    ind.style.cssText = 'font-size:11px;font-family:var(--mono);color:var(--accent);opacity:0;transition:opacity .3s;margin-left:8px';
    const sub = document.querySelector('.header-sub');
    if(sub) sub.before(ind);
  }
  ind.textContent = '✓ guardado';
  ind.style.opacity = '1';
  clearTimeout(ind._t);
  ind._t = setTimeout(() => ind.style.opacity = '0', 1800);
}
const _guardarPedidoOrig = guardarPedido;
guardarPedido = function() { _guardarPedidoOrig(); guardarEstado(); };
const _guardarDetalleOrig = guardarDetalle;
guardarDetalle = function() { _guardarDetalleOrig(); guardarEstado(); };
const _eliminarPedidoActualOrig = eliminarPedidoActual;
eliminarPedidoActual = function() { _eliminarPedidoActualOrig(); guardarEstado(); };
const _eliminarPiezaOrig = eliminarPieza;
eliminarPieza = function(pedidoId, piezaId) { _eliminarPiezaOrig(pedidoId, piezaId); guardarEstado(); };
const _confirmarAgregarPiezaOrig = confirmarAgregarPieza;
confirmarAgregarPieza = function() { _confirmarAgregarPiezaOrig(); guardarEstado(); };
const _saveCfgOrig = saveCfg;
saveCfg = function() { _saveCfgOrig(); guardarEstado(); };
const _addFilamentoOrig = addFilamento;
addFilamento = function() { _addFilamentoOrig(); guardarEstado(); };
const _addImpresoraOrig = addImpresora;
addImpresora = function() { _addImpresoraOrig(); guardarEstado(); };
const _addInsumoOrig = addInsumo;
addInsumo = function() { _addInsumoOrig(); guardarEstado(); };
document.addEventListener('change', e => {
  if (e.target.closest('#cfg-filamentos, #cfg-impresoras, #cfg-insumos, #cfg-colores, #cfg-envios, #cfg-kwh, #cfg-mo, #cfg-margen, #cfg-desperdicio')) {
    guardarEstado();
  }
});
function exportarBackup() {
  const data = { pedidos, compras, biblioteca, clientes, cfg, empresa, _idCounter, exportado: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `manager3d-backup-${new Date().toLocaleDateString('es-AR').replace(/\//g,'-')}.json`;
  a.click();
}
function importarBackup() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if(!data.pedidos || !data.cfg) { alert('Archivo de backup inválido.'); return; }
        if(!confirm(`¿Restaurar backup del ${data.exportado ? new Date(data.exportado).toLocaleDateString('es-AR') : '?'}? Se reemplazarán todos los datos actuales.`)) return;
        pedidos = data.pedidos;
        if(data.compras) compras = data.compras;
        if(data.biblioteca) biblioteca = data.biblioteca;
        if(data.clientes) clientes = data.clientes;
        cfg = data.cfg;
        if(data.empresa){ empresa = data.empresa; try{ localStorage.setItem(LS_EMPRESA, JSON.stringify(empresa)); }catch(e){} }
        _idCounter = data._idCounter || 1;
        guardarEstado();
        refreshSelects(); refreshInsumos(); renderPedidos(); renderClientes(); updateStats();
        renderFormEmpresa(); renderEmpresaHeader();
        alert('✓ Backup restaurado correctamente.');
      } catch(err) { alert('Error al leer el archivo: ' + err.message); }
    };
    r.readAsText(file);
  };
  input.click();
}
function borrarTodosDatos() {
  if(!confirm('⚠️ ¿Eliminar TODOS los datos guardados? Esta acción no se puede deshacer.')) return;
  if(!confirm('Confirmá nuevamente: se borrarán todos los pedidos y configuraciones.')) return;
  localStorage.clear();
  location.reload();
}
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.header');
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:6px;margin-left:auto;align-items:center';
  btns.innerHTML = `
    <button onclick="exportarBackup()" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border2);background:none;color:var(--text2);cursor:pointer;font-family:var(--mono)" title="Exportar backup JSON">⬇ backup</button>
    <button onclick="importarBackup()" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border2);background:none;color:var(--text2);cursor:pointer;font-family:var(--mono)" title="Importar backup JSON">⬆ restaurar</button>`;
  header.appendChild(btns);
  const ver = document.createElement('span');
  ver.style.cssText = 'font-size:12px;color:var(--text3);font-family:var(--mono);margin-left:10px;';
  ver.textContent = 'v2.2';
  document.querySelector('.header-title').after(ver);
});

// Exponer funciones globales necesarias para el módulo de Firebase
window.cargarEstado = cargarEstado;
window.cargarEmpresa = cargarEmpresa;
window.renderResumen = renderResumen;
window.renderPedidos = renderPedidos;
window.renderCompras = renderCompras;
window.renderBibliotecaPage = renderBibliotecaPage;
window.renderClientes = renderClientes;
window.refreshSelects = refreshSelects;
window.calcular = calcular;
window.updateStats = updateStats;

cargarEstado();
cargarEmpresa();
refreshSelects();
refreshInsumos();
calcular();
updateStats();
renderResumen();
renderBibMini();
renderClientes();
