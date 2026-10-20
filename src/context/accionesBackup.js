import { doc, setDoc, getDocs, writeBatch, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { defaultCfg, defaultEmpresa } from './valoresPorDefecto';
import { proyeccionCatalogoProducto, refCatalogoProducto } from './documentos';

// Copia de seguridad: descargar todo como JSON y restaurarlo desde uno.
//   ctx: { cuentaId, pedidos, compras, presupuestos, biblioteca, clientes, cfg, empresa, idCounter,
//          setCfg, setEmpresa, setIdCounter, showToast,
//          omitirProximoGuardadoConfig(), registrarGuardadoConfig(timestamp) }
export function crearAccionesBackup(ctx) {
  const {
    cuentaId, pedidos, compras, presupuestos, biblioteca, clientes, cfg, empresa, idCounter,
    setCfg, setEmpresa, setIdCounter, showToast, omitirProximoGuardadoConfig, registrarGuardadoConfig
  } = ctx;
  const catalogoProductoDocRef = (id) => refCatalogoProducto(cuentaId, id);

  const exportarBackupData = () => {
    try {
      const data = {
        pedidos,
        compras,
        presupuestos,
        biblioteca,
        clientes,
        cfg,
        empresa,
        _idCounter: idCounter,
        exportado: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `manager3d-backup-${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.json`;
      a.click();
      showToast('✓ Backup descargado correctamente.');
    } catch (e) {
      console.error(e);
      showToast('Error al exportar backup.', 'error');
    }
  };

  const restaurarBackupData = async (data) => {
    try {
      // Mismo motivo que en cargarDatosDeFirestore: el próximo cambio de
      // cfg/empresa/idCounter que dispare el autosave de meta/config va a
      // ser el eco de este restore, no una edición real — no hace falta
      // volver a guardarlo.
      omitirProximoGuardadoConfig();

      if (data.cfg) setCfg(data.cfg);
      // Fase 2/3/4/5: clientes, biblioteca, pedidos y compras ya no son
      // arrays de estado que se "restauran" en memoria — se escriben
      // directo a sus subcolecciones más abajo, y los listeners en tiempo
      // real actualizan el estado local solos.
      if (data.empresa) setEmpresa(data.empresa);
      
      const nextCounter = data._idCounter || data.idCounter || 1;
      setIdCounter(Number(nextCounter));
      
      // Upload to Firebase immediately if logged in
      if (cuentaId) {
        const restoreTimestamp = new Date().toISOString();

        // Fase 1: config/empresa/counter van a su documento propio.
        await setDoc(doc(db, "users", cuentaId, "meta", "config"), {
          config: data.cfg || defaultCfg,
          empresa: data.empresa || defaultEmpresa,
          counter: nextCounter,
          ultimaActualizacion: restoreTimestamp
        }, { merge: true });
        registrarGuardadoConfig(restoreTimestamp);

        // Fase 2/3/4/5: cada sección del backup va directo a su
        // subcolección, un documento por ítem, en su propio batch (los
        // batch de Firestore tienen un límite de 500 operaciones, así que
        // conviene no mezclar secciones grandes en el mismo batch). Primero
        // borramos lo que ya exista en la nube (si el backup tiene menos
        // ítems que los actuales, no deben quedar huérfanos), luego
        // escribimos los del backup.
        //
        // Antes esto armaba UN batch por sección con "borrar todo + escribir
        // todo", y fallaba en dos casos: (1) pedidos no se pueden borrar
        // (firestore.rules), así que el batch de pedidos se rechazaba entero
        // si ya había alguno; (2) un batch admite 500 operaciones como
        // máximo. Como las secciones se procesaban en orden, clientes y
        // biblioteca ya quedaban pisados cuando fallaba pedidos: restauración
        // a medias. Ahora: se escribe (upsert) cada ítem del backup, sólo se
        // borran los que no están en el backup (salvo pedidos, que no se
        // borran nunca), y todo se trocea en tandas de 400 operaciones.
        const escribirEnTandas = async (operaciones) => {
          for (let i = 0; i < operaciones.length; i += 400) {
            const batch = writeBatch(db);
            operaciones.slice(i, i + 400).forEach(op => op(batch));
            await batch.commit();
          }
        };

        // alEscribir/alBorrar: operaciones extra por ítem (la biblioteca
        // tiene que mantener al día su copia pública en catalogoTiendas).
        const restaurarSeccion = async (nombreColeccion, items, { permiteBorrar = true, alEscribir, alBorrar } = {}) => {
          const colRef = collection(db, "users", cuentaId, nombreColeccion);
          const idsBackup = new Set((items || []).map(item => String(item.id)));
          const operaciones = [];
          (items || []).forEach(item => {
            operaciones.push((batch) => batch.set(doc(db, "users", cuentaId, nombreColeccion, String(item.id)), item));
            if (alEscribir) operaciones.push((batch) => alEscribir(batch, item));
          });
          if (permiteBorrar) {
            const actuales = await getDocs(colRef);
            actuales.forEach(d => {
              if (idsBackup.has(d.id)) return;
              operaciones.push((batch) => batch.delete(d.ref));
              if (alBorrar) operaciones.push((batch) => alBorrar(batch, d.id));
            });
          }
          await escribirEnTandas(operaciones);
        };

        await restaurarSeccion("clientes", data.clientes);
        await restaurarSeccion("biblioteca", data.biblioteca, {
          alEscribir: (batch, item) => item.pub
            ? batch.set(catalogoProductoDocRef(item.id), proyeccionCatalogoProducto(item))
            : batch.delete(catalogoProductoDocRef(item.id)),
          alBorrar: (batch, id) => batch.delete(catalogoProductoDocRef(id))
        });
        await restaurarSeccion("pedidos", data.pedidos, { permiteBorrar: false });
        await restaurarSeccion("compras", data.compras);
        // Backups anteriores a la sección Presupuestos no traen la clave:
        // ahí no se toca nada (si no, se borrarían los presupuestos actuales).
        if (Array.isArray(data.presupuestos)) {
          await restaurarSeccion("presupuestos", data.presupuestos);
        }
      }
      
      showToast('✓ Backup restaurado correctamente.');
      return true;
    } catch (e) {
      console.error(e);
      showToast('Error al restaurar el backup.', 'error');
      return false;
    }
  };

  return { exportarBackupData, restaurarBackupData };
}
