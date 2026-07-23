const functionsV1 = require('firebase-functions/v1');
const { db, Timestamp, DIA_MS, DURACION_TRIAL_DIAS } = require('../admin');

// Se dispara cuando alguien se loguea por primera vez con Google (Firebase
// Auth crea la cuenta al vuelo). Le arma su doc de suscripción en estado
// "trial" por 7 días, arrancando el cronómetro de todo el sistema.
//
// Usa el trigger de Auth "v1" (functions.auth.user().onCreate) porque en v2
// todavía no hay un equivalente onCreate estable para nuevas cuentas -- lo
// mezclamos sin problema con el resto de las funciones en v2.
exports.onNuevoUsuario = functionsV1.auth.user().onCreate(async (user) => {
  const ahora = Timestamp.now();
  const trialFin = Timestamp.fromMillis(ahora.toMillis() + DURACION_TRIAL_DIAS * DIA_MS);

  const subRef = db.doc(`users/${user.uid}/suscripcion/actual`);

  await subRef.set({
    estado: 'trial',
    planId: null,
    email: user.email || null,
    trialInicio: ahora,
    trialFin,
    cicloInicio: null,
    cicloId: null,
    cicloFin: null,
    fechaLimiteLectura: null,
    mpPreapprovalId: null
  });

  await subRef.collection('eventos').add({
    tipo: 'alta_trial',
    fecha: ahora,
    detalle: { email: user.email || null }
  });
});
