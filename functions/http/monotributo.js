const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { db } = require('../admin');
const { leerCategoriasArca } = require('../monotributoArca');

// "Buscar en ARCA" del panel admin (Negocio → Categorías de monotributo):
// lee la tabla vigente de la página de ARCA y la devuelve para que el admin
// la compare con la cargada y la aplique. No guarda nada: aplicar lo hace
// el panel (monotributo/categorias, que sólo puede escribir un admin). Va
// por el servidor porque la página de ARCA no se puede leer desde el
// navegador (no habilita otros orígenes).
exports.buscarCategoriasMonotributo = onCall({ timeoutSeconds: 60 }, async (request) => {
  const email = request.auth?.token?.email_verified === true ? request.auth.token.email?.toLowerCase() : null;
  if (!email) throw new HttpsError('unauthenticated', 'Necesitás estar logueado.');
  if (!(await db.doc(`admins/${email}`).get()).exists) throw new HttpsError('permission-denied', 'Sólo un admin puede actualizar las categorías.');
  try {
    return await leerCategoriasArca();
  } catch (e) {
    logger.error('buscarCategoriasMonotributo: no se pudo leer ARCA', e);
    throw new HttpsError('unavailable', e.message || 'No se pudo leer la página de ARCA.');
  }
});
