// 3MF con la estructura de un proyecto guardado por Bambu Studio: cada color es
// una pieza (parte) del objeto con su filamento ya asignado, y trae la
// configuración del proyecto. Así Bambu Studio lo abre como propio (sin el aviso
// de "3mf que no es de Bambu Lab") y no hace falta pintar nada a mano.
//
// La estructura sale de un proyecto real guardado con Bambu Studio 02.08.03.66 y
// la configuración del proyecto (584 opciones) de una Bambu Lab A1 de 0,4 mm,
// que está en plantillaBambuA1.json. De esa plantilla sólo cambia la cantidad de
// filamentos y sus colores. Para otra impresora hace falta otra plantilla.
import { zipSync, strToU8 } from 'fflate';
import plantilla from './plantillaBambuA1.json';

const VERSION_BAMBU = '02.08.03.66';
const FILAMENTOS_PLANTILLA = 4; // filamentos del proyecto de referencia
const MAX_FILAMENTOS = 16;
const CAMA = { x: 256, y: 256 }; // Bambu Lab A1

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const num = (x) => (Math.round(x * 1e6) / 1e6).toString();
const hex = (n, largo) => n.toString(16).padStart(largo, '0');

// Colores distintos (en orden de aparición): cada uno es un filamento.
export function filamentosDe(cuerpos) {
  const lista = [];
  for (const c of cuerpos) {
    const color = String(c.color || '#cccccc').toUpperCase();
    if (!lista.includes(color)) lista.push(color);
  }
  return lista;
}

// Configuración del proyecto para \`colores.length\` filamentos, a partir de la plantilla.
// Las opciones por filamento tenían 4 valores (los de la plantilla): se repite el
// del filamento 2 (un "Bambu PLA Basic") para todos.
export function configProyecto(colores) {
  const n = colores.length;
  const nP = FILAMENTOS_PLANTILLA;
  const base = 1; // índice del filamento que se repite
  const cfg = {};
  for (const [clave, valor] of Object.entries(plantilla)) {
    if (!Array.isArray(valor)) { cfg[clave] = valor; continue; }
    const largo = valor.length;
    if (clave === 'filament_colour' || clave === 'filament_multi_colour') cfg[clave] = [...colores];
    else if (clave === 'filament_self_index') cfg[clave] = colores.map((_, i) => String(i + 1));
    else if (clave === 'flush_volumes_matrix') {
      cfg[clave] = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cfg[clave].push(i === j ? '0' : '300');
    } else if (clave === 'flush_volumes_vector') cfg[clave] = Array(2 * n).fill('140');
    else if (clave === 'different_settings_to_system' || clave === 'inherits_group') {
      // Una entrada para el proceso, una por filamento y una para la impresora.
      cfg[clave] = [valor[0], ...Array(n).fill(valor[2] ?? ''), valor[largo - 1]];
    } else if (largo === nP) cfg[clave] = Array(n).fill(valor[base]);
    else if (largo === 2 * nP) cfg[clave] = Array.from({ length: n }, () => valor.slice(2, 4)).flat();
    else if (largo === 4 * nP && clave.startsWith('filament_dev_ams_drying')) cfg[clave] = Array.from({ length: n }, () => valor.slice(4, 8)).flat();
    else cfg[clave] = valor;
  }
  return cfg;
}

function cajaDeMalla(malla) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < malla.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], malla.pos[i + k]);
    max[k] = Math.max(max[k], malla.pos[i + k]);
  }
  return { min, max };
}

function xmlMalla(malla, id) {
  const v = [];
  for (let k = 0; k < malla.pos.length; k += 3) v.push(`     <vertex x="${num(malla.pos[k])}" y="${num(malla.pos[k + 1])}" z="${num(malla.pos[k + 2])}"/>`);
  const t = [];
  for (let k = 0; k < malla.tri.length; k += 3) t.push(`     <triangle v1="${malla.tri[k]}" v2="${malla.tri[k + 1]}" v3="${malla.tri[k + 2]}"/>`);
  return `  <object id="${id}" p:UUID="0001${hex(id - 1, 4)}-81cb-4c03-9d28-80fed5dfa1dc" type="model">\n   <mesh>\n    <vertices>\n${v.join('\n')}\n    </vertices>\n    <triangles>\n${t.join('\n')}\n    </triangles>\n   </mesh>\n  </object>`;
}

// \`cuerpos\`: [{ nombre, color, malla: { pos, tri } }] en mm, con Z hacia arriba y
// apoyados en z = 0. Devuelve los bytes del .3mf.
export function crearBambu3mf(cuerpos, { nombre = 'Llavero' } = {}) {
  if (!cuerpos.length) throw new Error('No hay piezas para exportar.');
  const colores = filamentosDe(cuerpos);
  if (colores.length > MAX_FILAMENTOS) throw new Error(`Bambu Studio admite hasta ${MAX_FILAMENTOS} filamentos y hay ${colores.length} colores.`);
  const extruderDe = (c) => colores.indexOf(String(c.color || '#cccccc').toUpperCase()) + 1;

  // Posición del objeto en la cama: centrado.
  const cajas = cuerpos.map((c) => cajaDeMalla(c.malla));
  const x0 = Math.min(...cajas.map((c) => c.min[0])), x1 = Math.max(...cajas.map((c) => c.max[0]));
  const y0 = Math.min(...cajas.map((c) => c.min[1])), y1 = Math.max(...cajas.map((c) => c.max[1]));
  const tx = CAMA.x / 2 - (x0 + x1) / 2, ty = CAMA.y / 2 - (y0 + y1) / 2;
  const traslado = `1 0 0 0 1 0 0 0 1 ${num(tx)} ${num(ty)} 0`;

  const p = cuerpos.length;
  const idObjeto = p + 1;
  const caras = cuerpos.reduce((a, c) => a + c.malla.tri.length / 3, 0);
  const IDENTIDAD = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1';
  const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';
  const hoy = new Date().toISOString().slice(0, 10);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`;
  const relsRaiz = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  const relsModelo = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const componentes = cuerpos.map((_, i) => `    <component p:path="/3D/Objects/object_1.model" objectid="${i + 1}" p:UUID="0001${hex(i, 4)}-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join('\n');
  const modelo = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" ${NS}>
 <metadata name="Application">BambuStudio-${VERSION_BAMBU}</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Copyright"></metadata>
 <metadata name="CreationDate">${hoy}</metadata>
 <metadata name="Description">Generado con Manager3D</metadata>
 <metadata name="Designer"></metadata>
 <metadata name="DesignerCover"></metadata>
 <metadata name="License"></metadata>
 <metadata name="ModificationDate">${hoy}</metadata>
 <metadata name="Origin"></metadata>
 <metadata name="Title">${esc(nombre)}</metadata>
 <resources>
  <object id="${idObjeto}" p:UUID="${hex(1, 8)}-61cb-4c03-9d28-80fed5dfa1dc" type="model">
   <components>
${componentes}
   </components>
  </object>
 </resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">
  <item objectid="${idObjeto}" p:UUID="${hex(idObjeto, 8)}-b1ec-4553-aec9-835e5b724bb4" transform="${traslado}" printable="1"/>
 </build>
</model>`;
  const objetos = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" ${NS}>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <resources>
${cuerpos.map((c, i) => xmlMalla(c.malla, i + 1)).join('\n')}
 </resources>
 <build/>
</model>`;

  const partes = cuerpos.map((c, i) => `    <part id="${i + 1}" subtype="normal_part">
      <metadata key="name" value="${esc(c.nombre)}"/>
      <metadata key="matrix" value="${IDENTIDAD}"/>
      <metadata key="extruder" value="${extruderDe(c)}"/>
      <mesh_stat face_count="${c.malla.tri.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`).join('\n');
  const modeloConfig = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${idObjeto}">
    <metadata key="name" value="${esc(nombre)}"/>
    <metadata key="extruder" value="1"/>
    <metadata face_count="${caras}"/>
${partes}
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <model_instance>
      <metadata key="object_id" value="${idObjeto}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="100"/>
    </model_instance>
  </plate>
  <assemble>
   <assemble_item object_id="${idObjeto}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 ${num(tx)} ${num(ty)} 0" offset="0 0 0" />
${cuerpos.map((_, i) => `   <assemble_item object_id="${idObjeto}" volume_id="${i}" transform="1 0 0 0 1 0 0 0 1 0 0 0" />`).join('\n')}
  </assemble>
</config>`;

  const sliceInfo = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="${VERSION_BAMBU}"/>
  </header>
</config>`;
  const corte = `<?xml version="1.0" encoding="utf-8"?>
<objects>
 <object id="1">
  <cut_id id="0" check_sum="1" connectors_cnt="0"/>
 </object>
</objects>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(relsRaiz),
    '3D/3dmodel.model': strToU8(modelo),
    '3D/_rels/3dmodel.model.rels': strToU8(relsModelo),
    '3D/Objects/object_1.model': strToU8(objetos),
    'Metadata/model_settings.config': strToU8(modeloConfig),
    'Metadata/project_settings.config': strToU8(JSON.stringify(configProyecto(colores), null, 4)),
    'Metadata/slice_info.config': strToU8(sliceInfo),
    'Metadata/filament_sequence.json': strToU8('{"plate_1":{"nozzle_sequence":[],"optimal_assignment":[],"sequence":[]}}'),
    'Metadata/cut_information.xml': strToU8(corte)
  });
}
