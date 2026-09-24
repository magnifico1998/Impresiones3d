const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { db, Timestamp, FieldValue, DIA_MS, DURACION_LECTURA_DIAS, sumarMesCalendario, formatearFecha, calcularCicloActivacion, obtenerContactoRevendedor } = require('../admin');
const { pctComision, armarVentaLedger } = require('../ledgerRevendedor');

// Acciones que además de un admin puede ejecutar un revendedor, pero SOLO
// sobre cuentas que son "suyas" (ver resolverAutorizacion más abajo) --
// todo lo que ve el panel de Suscriptores salvo gestión de planes/
// revendedores y borrado de cuentas, que siguen siendo admin-only.
// "extenderTrial" queda afuera a propósito: un revendedor sólo vende
// planes comerciales, no puede regalar días de trial a sus suscriptores.
const ACCIONES_REVENDEDOR = ['activar', 'suspender', 'toggleContactadoPostBloqueo'];

// Único punto de entrada para que un admin (o un revendedor, sobre sus
// propios suscriptores) cambie el estado de la suscripción de una cuenta.
// Centralizarlo acá (en vez de dejar que el cliente escriba Firestore
// directo) asegura que:
//  - cada cambio de estado toque TODOS los campos relacionados de forma
//    atómica (ej: activar sin actualizar cicloFin dejaría el sistema en un
//    estado inconsistente),
//  - quede un registro en "eventos" de quién hizo qué y cuándo,
//  - la atribución a un revendedor (revendedorUid/revendedorCodigo) y el
//    ledger de ventas para el cierre mensual se escriban siempre juntos
//    con el cambio de estado, nunca por separado,
//  - el webhook de Mercado Pago (webhookMercadoPago.js) aplique las mismas
//    reglas de ciclo y de ledger que "activar" (calcularCicloActivacion y
//    armarVentaLedger son compartidas).
exports.cambiarEstadoSuscripcion = onCall(async (request) => {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  const uidSolicitante = request.auth?.uid;
  if (!emailSolicitante || !uidSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const { uid, accion, planId, descuentoPct } = request.data || {};
  if (!uid || typeof uid !== 'string' || !accion || typeof accion !== 'string') {
    throw new HttpsError('invalid-argument', 'Faltan datos (uid, accion).');
  }
  if (descuentoPct != null && (typeof descuentoPct !== 'number' || descuentoPct < 0 || descuentoPct > 100)) {
    throw new HttpsError('invalid-argument', 'descuentoPct debe ser un número entre 0 y 100.');
  }

  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  const esAdminReq = adminDoc.exists;

  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const subSnap = await subRef.get();

  // solicitudSnap se resuelve una sola vez y se reutiliza tanto para
  // autorizar a un revendedor como (más abajo) para que un admin también
  // pueda atribuirle la venta a un revendedor sin tener que pasar el
  // código a mano.
  let solicitudSnap = null;
  const getSolicitudSnap = async () => {
    if (solicitudSnap === null) {
      solicitudSnap = await db.doc(`solicitudesContacto/${uid}`).get();
    }
    return solicitudSnap;
  };

  // Código del revendedor "dueño" de este suscriptor, si lo tiene: ya
  // vinculado (revendedorUid) o pendiente vía un código válido en su
  // solicitud de contacto (primera alta todavía sin vincular). Si esta
  // cuenta es territorio de un revendedor y la acción es una de las del
  // día a día (ACCIONES_REVENDEDOR), el admin general YA NO puede
  // tocarla -- sólo ESE revendedor. Esto evita que el admin renueve o
  // suspenda sin aplicar el % de descuento acordado, generando diferencias
  // a la hora de facturar el cierre del mes. El admin conserva vincular/
  // desvincular (vincularRevendedor) y borrar la cuenta (borrarCuenta),
  // que son funciones aparte y no pasan por acá.
  let codigoDelDuenio = null;
  if (subSnap.exists && subSnap.data().revendedorUid) {
    codigoDelDuenio = subSnap.data().revendedorCodigo || null;
  } else {
    const solicitud = await getSolicitudSnap();
    const codigoSolicitud = solicitud.exists ? (solicitud.data().codigoRevendedor || null) : null;
    if (codigoSolicitud) {
      const revSnapDuenio = await db.doc(`revendedores/${codigoSolicitud}`).get();
      if (revSnapDuenio.exists && revSnapDuenio.data().activo) codigoDelDuenio = codigoSolicitud;
    }
  }

  let miCodigoRevendedor = null;
  let esRevendedorReq = false;

  if (ACCIONES_REVENDEDOR.includes(accion) && codigoDelDuenio) {
    // Territorio de un revendedor: sólo él puede operar acá, ni siquiera
    // el admin general.
    if (esAdminReq) {
      throw new HttpsError('permission-denied', 'Esta cuenta pertenece a un revendedor -- sólo él puede activar, renovar, extender el trial o suspenderla. El admin sólo puede vincular/desvincular o borrar la cuenta.');
    }
    const miSubSnap = await db.doc(`users/${uidSolicitante}/suscripcion/actual`).get();
    miCodigoRevendedor = miSubSnap.exists ? (miSubSnap.data().codigoRevendedor || null) : null;
    if (!miCodigoRevendedor || miCodigoRevendedor !== codigoDelDuenio) {
      throw new HttpsError('permission-denied', 'Esa cuenta no es uno de tus suscriptores.');
    }
    esRevendedorReq = true;
  } else if (!esAdminReq) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }

  // Cuentas que se registraron ANTES de que existiera onNuevoUsuario (o
  // cualquier caso raro donde el trigger no corrió) no tienen este
  // documento. Para "activar"/"reactivar" no lo tratamos como error: son
  // justamente las acciones que se usan para dar de alta a alguien
  // manualmente, así que si no existe, lo creamos con valores base antes
  // de aplicar el cambio. El resto de las acciones sí necesitan que ya
  // exista algo previo sobre lo que actuar (no tiene sentido "extender el
  // trial" de una cuenta que nunca tuvo uno).
  if (!subSnap.exists && accion !== 'activar' && accion !== 'reactivar') {
    throw new HttpsError('not-found', 'Esa cuenta todavía no tiene suscripción inicializada. Usá "Renovar suscripción" para darla de alta.');
  }
  const datosPrevios = subSnap.exists ? subSnap.data() : {};

  // Con débito automático de Mercado Pago vigente, el ciclo lo renueva el
  // webhook con cada cobro. Una renovación manual encima le sumaría un mes
  // sin cobrarlo (o se lo cobraría dos veces si el suscriptor además pagó
  // por fuera) y duplicaría la venta en el ledger del revendedor.
  if (accion === 'activar' && datosPrevios.cobro?.estado === 'authorized') {
    throw new HttpsError('failed-precondition', 'Esta cuenta paga con débito automático de Mercado Pago: se renueva sola con cada cobro. Para cambiar de plan, el suscriptor lo hace desde "Mi emprendimiento".');
  }

  // Si el doc no existía, de paso le guardamos el email (buscándolo en
  // Firebase Auth por uid) para que la tabla del panel no muestre el uid
  // pelado la primera vez que se activa una cuenta legacy. Si el uid ni
  // siquiera corresponde a una cuenta real de Firebase Auth, hay que
  // frenar acá y no seguir: si no, se crea una suscripción "fantasma" en
  // users/{uid}/suscripcion/actual que nadie va a poder usar nunca (nadie
  // puede loguearse con ese uid) pero que sí aparece como un suscriptor
  // más en el panel -- justo el bug que pasó cuando se tipeó un email en
  // vez de un uid en algún lado.
  let emailCuenta = datosPrevios.email || null;
  if (!subSnap.exists) {
    try {
      const registro = await getAuth().getUser(uid);
      emailCuenta = registro.email || null;
    } catch (e) {
      throw new HttpsError('not-found', `No existe ninguna cuenta de Firebase con uid "${uid}". Revisá que sea el uid y no el email.`);
    }
  }

  const ahora = Timestamp.now();
  let update = {};

  // Resolución de a qué revendedor (si a alguno) atribuirle esta venta.
  // OJO: esto corre en CADA "activar", no sólo la primera vez -- una
  // renovación de un suscriptor ya vinculado es igual una venta nueva que
  // hay que sumar al cierre del mes en curso. La vinculación en sí
  // (revendedorUid/revendedorCodigo en la suscripción) se fija una única
  // vez y no se vuelve a tocar después.
  let revendedorInfo = null;
  let esVinculacionNueva = false;
  if (accion === 'activar') {
    if (datosPrevios.revendedorUid) {
      // Ya vinculada de una venta anterior: la renovación sigue siendo de
      // ese mismo revendedor, sin importar quién la ejecute ahora.
      revendedorInfo = { uid: datosPrevios.revendedorUid, codigo: datosPrevios.revendedorCodigo || null };
    } else if (esRevendedorReq) {
      revendedorInfo = { uid: uidSolicitante, codigo: miCodigoRevendedor };
      esVinculacionNueva = true;
    } else if (esAdminReq) {
      // El admin activa directamente: si la solicitud ya trae un código
      // (lo cargó el cliente en el formulario, o el admin lo completó a
      // mano después), lo resolvemos contra revendedores/{codigo} para
      // atribuir la venta sin que el admin tenga que hacer nada más.
      const solicitud = await getSolicitudSnap();
      const codigoDeSolicitud = solicitud.exists ? (solicitud.data().codigoRevendedor || null) : null;
      if (codigoDeSolicitud) {
        const revSnap = await db.doc(`revendedores/${codigoDeSolicitud}`).get();
        if (revSnap.exists && revSnap.data().activo) {
          revendedorInfo = { uid: revSnap.data().uid, codigo: codigoDeSolicitud };
          esVinculacionNueva = true;
        }
      }
    }
    // Si revendedorCodigo no quedó guardado por algún motivo (cuentas de
    // antes de este fix), lo recuperamos por las dudas antes de armar el
    // ledger -- es una única consulta por igualdad, ya indexada sola.
    if (revendedorInfo && !revendedorInfo.codigo) {
      const rev = await db.collection('revendedores').where('uid', '==', revendedorInfo.uid).limit(1).get();
      revendedorInfo.codigo = rev.empty ? null : rev.docs[0].id;
    }
  }

  // Copia liviana de los datos de contacto del revendedor sobre la
  // suscripción del referido, para que "Mi emprendimiento" le pueda
  // mostrar con quién comunicarse -- el referido no tiene (ni debería
  // tener) permiso para leer la cuenta del revendedor directamente. Se
  // recalcula en cada renovación, así si el revendedor actualiza sus
  // datos de contacto, el referido ve la versión más nueva la próxima vez.
  const revendedorContacto = revendedorInfo ? await obtenerContactoRevendedor(revendedorInfo.uid) : null;

  switch (accion) {
    case 'activar': {
      // Un planId que no existe en planes/ dejaría la cuenta activa con
      // montoPlan=0 más abajo (nada que facturarle al revendedor) y sin
      // límite de pedidos (firestore.rules trata un plan inexistente como
      // "sin límite") -- validamos que exista ANTES de activar nada, tanto
      // si lo pide un admin (typo) como un revendedor (mismo chequeo que ya
      // hace codigosPromocionales.js al aceptar un planId).
      if (planId) {
        const planIdSnap = await db.doc(`planes/${planId}`).get();
        if (!planIdSnap.exists) {
          throw new HttpsError('not-found', `No existe el plan "${planId}".`);
        }
      }

      // Botón "Renovar suscripción" del panel: cubre tanto dar de alta /
      // reactivar una cuenta caída como renovar una que sigue vigente
      // (prorroga desde el vencimiento vigente, ver calcularCicloActivacion
      // -- misma regla que aplica el webhook de Mercado Pago).
      update = {
        estado: 'activa',
        planId: planId || datosPrevios.planId || null,
        email: emailCuenta,
        ...calcularCicloActivacion(datosPrevios, ahora),
        fechaLimiteLectura: FieldValue.delete()
      };
      if (esVinculacionNueva) {
        update.revendedorUid = revendedorInfo.uid;
        update.revendedorCodigo = revendedorInfo.codigo;
      }
      break;
    }

    case 'renovarCiclo': {
      // Renovación "pura" (sin atribución ni ledger): corre el ciclo un
      // mes más desde el cicloFin
      // anterior (no desde "ahora"), para no regalar ni recortar días si
      // el pago llega un poco antes o después de la fecha exacta.
      const cicloAnteriorFin = datosPrevios.cicloFin || ahora;
      const nuevoCicloInicio = cicloAnteriorFin;
      const nuevoCicloFin = sumarMesCalendario(cicloAnteriorFin);
      update = {
        estado: 'activa',
        cicloInicio: nuevoCicloInicio,
        cicloId: formatearFecha(nuevoCicloInicio),
        cicloFin: nuevoCicloFin,
        fechaLimiteLectura: FieldValue.delete()
      };
      break;
    }

    case 'extenderTrial': {
      const trialFinActual = datosPrevios.trialFin || ahora;
      const nuevoTrialFin = Timestamp.fromMillis(
        Math.max(trialFinActual.toMillis(), ahora.toMillis()) + 7 * 24 * 60 * 60 * 1000
      );
      update = { estado: 'trial', trialFin: nuevoTrialFin };
      break;
    }

    // Pasa la cuenta a modo lectura manualmente, con los mismos 30 días de
    // gracia que le da el vencimiento automático de un trial o un ciclo
    // (ver transicionSuscripciones.js) -- SIN saltarse directo a
    // "suspendida". Si un admin necesita cortar el acceso ya mismo sin
    // esperar la gracia, sigue pudiendo hacerlo achicando a mano
    // fechaLimiteLectura desde Firestore Console, pero no es lo que hace
    // este botón por default.
    case 'suspender':
      update = {
        estado: 'lectura',
        fechaLimiteLectura: Timestamp.fromMillis(ahora.toMillis() + DURACION_LECTURA_DIAS * DIA_MS)
      };
      break;

    // Marca/desmarca "ya lo contacté después de que se bloqueó" -- no
    // cambia el estado de la cuenta, sólo deja constancia de que se hizo
    // el seguimiento (para no perder de vista a quién ya se le avisó y a
    // quién todavía no, entre todas las cuentas bloqueadas). Es un
    // toggle: invierte lo que había antes.
    case 'toggleContactadoPostBloqueo':
      update = datosPrevios.contactadoPostBloqueo
        ? { contactadoPostBloqueo: false, contactadoPostBloqueoFecha: FieldValue.delete() }
        : { contactadoPostBloqueo: true, contactadoPostBloqueoFecha: ahora };
      break;

    case 'reactivar':
      // Reactivación manual (ej: pagó por transferencia y vos lo activás
      // a mano). Le da un ciclo nuevo completo desde hoy. Admin-only (no
      // está en ACCIONES_REVENDEDOR).
      update = {
        estado: 'activa',
        email: emailCuenta,
        cicloInicio: ahora,
        cicloId: formatearFecha(ahora),
        cicloFin: sumarMesCalendario(ahora),
        fechaLimiteLectura: FieldValue.delete()
      };
      break;

    default:
      throw new HttpsError('invalid-argument', `Acción desconocida: ${accion}`);
  }

  if (revendedorInfo) {
    update.revendedorContacto = revendedorContacto;
  }

  // % de descuento a facturar: si se pasó uno puntual para ESTA venta
  // (el input de la fila en el panel), gana ese -- si no, se usa el
  // default que el admin configuró para este plan en la ficha del
  // revendedor (revendedores/{codigo}.descuentosPorPlan). Antes, cuando el
  // input quedaba vacío se facturaba 0% siempre, ignorando por completo
  // ese default -- este es justamente el fix.
  // El override puntual sólo lo puede fijar un admin -- si quien llama es
  // el propio revendedor (esRevendedorReq), un descuentoPct que venga en
  // el request se ignora a propósito: ese % es su ganancia/comisión, así
  // que dejarlo tocarlo le permitiría facturarse a sí mismo lo que
  // quisiera en cada venta.
  let pctDescuento = 0;
  if (revendedorInfo && revendedorInfo.codigo) {
    if (descuentoPct != null && esAdminReq) {
      pctDescuento = Math.max(0, Math.min(100, Number(descuentoPct)));
    } else {
      const revSnapPct = await db.doc(`revendedores/${revendedorInfo.codigo}`).get();
      pctDescuento = pctComision(revSnapPct.exists ? revSnapPct.data() : null, update.planId);
    }
  }

  await subRef.set(update, { merge: true });
  await subRef.collection('eventos').add({
    tipo: accion,
    fecha: ahora,
    admin: emailSolicitante,
    detalle: {
      planId: planId || null,
      revendedorUid: revendedorInfo?.uid || null,
      descuentoPct: revendedorInfo ? pctDescuento : null
    }
  });

  // Ledger de ventas del revendedor para el cierre mensual (ver
  // gestionarRevendedores.js -> generarCierreRevendedor). Se agrega un
  // ítem en CADA "activar" atribuido a un revendedor -- primera venta o
  // renovación, todas cuentan para el mes en curso. Por acá pasan sólo
  // ventas manuales (el revendedor cobró por fuera), así que la deuda es
  // del revendedor hacia la plataforma; los pagos por Mercado Pago escriben
  // el mismo ledger desde el webhook como cobradoPor 'plataforma'.
  if (revendedorInfo && revendedorInfo.codigo) {
    let montoPlan = 0;
    if (update.planId) {
      const planSnap = await db.doc(`planes/${update.planId}`).get();
      montoPlan = planSnap.exists ? Number(planSnap.data().precioMensual || 0) : 0;
    }
    const venta = armarVentaLedger({
      codigo: revendedorInfo.codigo,
      uid,
      email: emailCuenta,
      planId: update.planId,
      fecha: ahora,
      montoPlan,
      pct: pctDescuento,
      cobradoPor: 'revendedor'
    });
    await venta.ref.set(venta.datos, { merge: true });
  }

  return { ok: true };
});
