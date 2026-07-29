const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp, FieldValue, sumarMesCalendario, formatearFecha } = require('../admin');

// Códigos promocionales de comercios externos: a diferencia de un
// revendedor (que da % de descuento pero el suscriptor sigue pagando el
// precio real, ver gestionarRevendedores.js), acá el comercio le regala al
// suscriptor un plan puntual a costo $0 durante N ciclos, como beneficio
// para captar clientes propios y de paso traer usuarios nuevos a la
// plataforma. Sólo se puede activar durante el trial (nunca tuvo plan
// pago), y cada cuenta puede activar como máximo un código en toda su vida.

const CODIGO_RE = /^[A-Z0-9]{4,12}$/;

function validarCodigo(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  if (!CODIGO_RE.test(c)) {
    throw new HttpsError('invalid-argument', 'El código debe tener entre 4 y 12 caracteres (letras/números).');
  }
  return c;
}

async function exigirAdmin(request) {
  const emailSolicitante = request.auth?.token?.email?.toLowerCase();
  if (!emailSolicitante) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }
  const adminDoc = await db.doc(`admins/${emailSolicitante}`).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'No tenés permisos de administrador.');
  }
  return emailSolicitante;
}

// Autoservicio: lo llama el propio suscriptor logueado desde la app (no
// admin) para canjear el código que le dio un comercio. Todo el chequeo de
// cupo + la escritura de la suscripción van en una única transacción para
// que dos activaciones casi simultáneas cerca del cupoMaximo no lo pasen de
// largo.
exports.activarCodigoPromocional = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  }

  const codigo = validarCodigo(request.data?.codigo);
  const codigoRef = db.doc(`codigosPromocionales/${codigo}`);
  const subRef = db.doc(`users/${uid}/suscripcion/actual`);
  const ahora = Timestamp.now();

  const resultado = await db.runTransaction(async (tx) => {
    const [codigoSnap, subSnap] = await Promise.all([tx.get(codigoRef), tx.get(subRef)]);

    if (!codigoSnap.exists || !codigoSnap.data().activo) {
      throw new HttpsError('not-found', 'Ese código no existe o ya no está activo.');
    }
    const datosCodigo = codigoSnap.data();
    if (ahora.toMillis() < datosCodigo.vigenciaInicio.toMillis() || ahora.toMillis() > datosCodigo.vigenciaFin.toMillis()) {
      throw new HttpsError('failed-precondition', 'Ese código no está vigente en este momento.');
    }
    if (datosCodigo.cupoMaximo != null && (datosCodigo.activacionesTotal || 0) >= datosCodigo.cupoMaximo) {
      throw new HttpsError('failed-precondition', 'Ese código ya alcanzó el cupo máximo de activaciones.');
    }

    if (!subSnap.exists || subSnap.data().estado !== 'trial') {
      throw new HttpsError('failed-precondition', 'Sólo podés activar un código promocional mientras estás en período de prueba.');
    }
    // tipoRestriccion 'unico_de_por_vida': promoCodigo, una vez seteado,
    // nunca se borra -- es en sí mismo la marca permanente de que esta
    // cuenta ya consumió su único código, incluso si el beneficio ya se
    // agotó. El día que existan otros tipos de restricción, acá es donde
    // se ramificaría según datosCodigo.tipoRestriccion.
    if (subSnap.data().promoCodigo) {
      throw new HttpsError('failed-precondition', 'Esta cuenta ya activó un código promocional anteriormente.');
    }

    const cicloFin = sumarMesCalendario(ahora);
    tx.set(subRef, {
      estado: 'activa',
      planId: datosCodigo.planId,
      cicloInicio: ahora,
      cicloId: formatearFecha(ahora),
      cicloFin,
      fechaLimiteLectura: FieldValue.delete(),
      promoCodigo: codigo,
      promoCiclosRestantes: datosCodigo.ciclos
    }, { merge: true });
    tx.set(subRef.collection('eventos').doc(), {
      tipo: 'promo_activada',
      fecha: ahora,
      detalle: { codigo, planId: datosCodigo.planId, ciclos: datosCodigo.ciclos }
    });
    tx.update(codigoRef, { activacionesTotal: FieldValue.increment(1) });

    return { planId: datosCodigo.planId, ciclos: datosCodigo.ciclos };
  });

  // Informativo, fuera de la transacción (no afecta el cupo real).
  const anioMes = formatearFecha(ahora).slice(0, 7);
  await db.doc(`codigosPromocionales/${codigo}/activaciones/${anioMes}`).set({
    items: FieldValue.arrayUnion({ uid, email: request.auth.token.email || null, fecha: ahora }),
    total: FieldValue.increment(1),
    actualizadoEl: ahora
  }, { merge: true });

  return { ok: true, ...resultado };
});

exports.crearCodigoPromocional = onCall(async (request) => {
  await exigirAdmin(request);

  const { codigo, comercioNombre, comercioContacto, planId, ciclos, vigenciaInicio, vigenciaFin, cupoMaximo } = request.data || {};
  const codigoLimpio = validarCodigo(codigo);

  if (!planId || typeof planId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el plan a otorgar.');
  }
  const planSnap = await db.doc(`planes/${planId}`).get();
  if (!planSnap.exists) {
    throw new HttpsError('not-found', 'Ese plan no existe.');
  }
  const ciclosNum = Number(ciclos);
  if (!Number.isInteger(ciclosNum) || ciclosNum <= 0) {
    throw new HttpsError('invalid-argument', 'La cantidad de ciclos debe ser un entero mayor a 0.');
  }
  const inicioMs = Number(new Date(vigenciaInicio));
  const finMs = Number(new Date(vigenciaFin));
  if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs) || finMs <= inicioMs) {
    throw new HttpsError('invalid-argument', 'La vigencia debe tener una fecha de inicio anterior a la de fin.');
  }
  let cupoLimpio = null;
  if (cupoMaximo != null && cupoMaximo !== '') {
    const cupoNum = Number(cupoMaximo);
    if (!Number.isInteger(cupoNum) || cupoNum <= 0) {
      throw new HttpsError('invalid-argument', 'El cupo máximo debe ser un entero mayor a 0.');
    }
    cupoLimpio = cupoNum;
  }

  const codigoRef = db.doc(`codigosPromocionales/${codigoLimpio}`);
  const existente = await codigoRef.get();
  if (existente.exists) {
    throw new HttpsError('already-exists', 'Ya existe un código promocional con ese nombre.');
  }

  await codigoRef.set({
    comercio: { nombre: comercioNombre || null, contacto: comercioContacto || null },
    planId,
    ciclos: ciclosNum,
    vigenciaInicio: Timestamp.fromMillis(inicioMs),
    vigenciaFin: Timestamp.fromMillis(finMs),
    cupoMaximo: cupoLimpio,
    activacionesTotal: 0,
    tipoRestriccion: 'unico_de_por_vida',
    activo: true,
    creadoEl: Timestamp.now()
  });

  return { ok: true, codigo: codigoLimpio };
});

exports.actualizarCodigoPromocional = onCall(async (request) => {
  await exigirAdmin(request);

  const { codigo, comercioNombre, comercioContacto, planId, ciclos, vigenciaInicio, vigenciaFin, cupoMaximo } = request.data || {};
  const codigoLimpio = validarCodigo(codigo);
  const codigoRef = db.doc(`codigosPromocionales/${codigoLimpio}`);
  const existente = await codigoRef.get();
  if (!existente.exists) {
    throw new HttpsError('not-found', 'Ese código promocional no existe.');
  }

  if (planId && typeof planId === 'string') {
    const planSnap = await db.doc(`planes/${planId}`).get();
    if (!planSnap.exists) {
      throw new HttpsError('not-found', 'Ese plan no existe.');
    }
  }

  const update = {};
  if (comercioNombre !== undefined || comercioContacto !== undefined) {
    update.comercio = {
      nombre: comercioNombre !== undefined ? (comercioNombre || null) : existente.data().comercio?.nombre || null,
      contacto: comercioContacto !== undefined ? (comercioContacto || null) : existente.data().comercio?.contacto || null
    };
  }
  if (planId) update.planId = planId;
  if (ciclos !== undefined) {
    const ciclosNum = Number(ciclos);
    if (!Number.isInteger(ciclosNum) || ciclosNum <= 0) {
      throw new HttpsError('invalid-argument', 'La cantidad de ciclos debe ser un entero mayor a 0.');
    }
    update.ciclos = ciclosNum;
  }
  if (vigenciaInicio !== undefined) {
    const inicioMs = Number(new Date(vigenciaInicio));
    if (!Number.isFinite(inicioMs)) throw new HttpsError('invalid-argument', 'Fecha de inicio de vigencia inválida.');
    update.vigenciaInicio = Timestamp.fromMillis(inicioMs);
  }
  if (vigenciaFin !== undefined) {
    const finMs = Number(new Date(vigenciaFin));
    if (!Number.isFinite(finMs)) throw new HttpsError('invalid-argument', 'Fecha de fin de vigencia inválida.');
    update.vigenciaFin = Timestamp.fromMillis(finMs);
  }
  if (update.vigenciaInicio && update.vigenciaFin && update.vigenciaFin.toMillis() <= update.vigenciaInicio.toMillis()) {
    throw new HttpsError('invalid-argument', 'La vigencia debe tener una fecha de inicio anterior a la de fin.');
  }
  if (cupoMaximo !== undefined) {
    if (cupoMaximo == null || cupoMaximo === '') {
      update.cupoMaximo = null;
    } else {
      const cupoNum = Number(cupoMaximo);
      if (!Number.isInteger(cupoNum) || cupoNum <= 0) {
        throw new HttpsError('invalid-argument', 'El cupo máximo debe ser un entero mayor a 0.');
      }
      update.cupoMaximo = cupoNum;
    }
  }

  await codigoRef.set(update, { merge: true });
  return { ok: true };
});

// Activa/desactiva el código (no lo borra) -- pasa `activo: false` para
// cortar nuevas activaciones, o `activo: true` para reabrirlo. Quien ya lo
// había activado sigue con su beneficio en curso sin importar este flag.
exports.desactivarCodigoPromocional = onCall(async (request) => {
  await exigirAdmin(request);

  const codigo = validarCodigo(request.data?.codigo);
  const activo = request.data?.activo === true;
  const codigoRef = db.doc(`codigosPromocionales/${codigo}`);
  const existente = await codigoRef.get();
  if (!existente.exists) {
    throw new HttpsError('not-found', 'Ese código promocional no existe.');
  }

  await codigoRef.set({ activo }, { merge: true });
  return { ok: true };
});
