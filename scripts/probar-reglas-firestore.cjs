// Prueba firestore.rules con la API de reglas de Google, SIN publicar nada: evalúa casos reales
// (el dueño y su pedido, otra cuenta, cuenta en modo lectura o suspendida, planes, admins,
// aviso de actualización, catálogo público, envíos a impresoras…). Correrlo ANTES de publicar
// las reglas: `firebase deploy` sólo revisa que compilen, no que se evalúen bien.
//   node scripts/probar-reglas-firestore.cjs [archivo.rules]   (por defecto firestore.rules)
// Usa la sesión del Firebase CLI (`firebase login`) y su copia global. Sale con código 1 si
// algún caso falla.
const path = require('path');
const fs = require('fs');
const G = require('child_process').execSync('npm root -g').toString().trim();
const archivo = process.argv[2] || path.join(__dirname, '..', 'firestore.rules');
const PROYECTO = 'print3d-manager-73846';
const UID = 'hBTOP6GQIVTFDS1yxa7dIJ4XQkw2';
const OTRO = 'otraCuenta999';
const BASE = '/databases/(default)/documents';
const EMAIL_ADMIN = 'admin@example.com';
// Firestore compara los emails en minúsculas (emailDeAuth en las reglas): los de prueba también.
const mail = (uid) => `${uid}@gmail.com`.toLowerCase();

(async () => {
  const { requireAuth } = require(path.join(G, 'firebase-tools/lib/requireAuth.js'));
  const { getAccessToken } = require(path.join(G, 'firebase-tools/lib/auth.js'));
  const { configstore } = require(path.join(G, 'firebase-tools/lib/configstore.js'));
  await requireAuth({ project: PROYECTO });
  const { access_token: token } = await getAccessToken(configstore.get('tokens').refresh_token, []);
  const content = fs.readFileSync(archivo, 'utf8');

  const auth = (uid, extra = {}) => ({ uid, token: { email_verified: true, email: `${mail(uid)}`, ...extra } });
  const ahora = new Date().toISOString();
  const doc = (ruta) => ({ exact_value: `${BASE}/${ruta}` });
  const existe = (ruta, valor) => ({ function: 'exists', args: [doc(ruta)], result: { value: valor } });
  const trae = (ruta, data) => ({ function: 'get', args: [doc(ruta)], result: { value: { data } } });
  // Suscripción de la cuenta UID con el estado dado (y sin límites de plan: cicloId/planId nulos).
  const suscripcion = (estado, extra = {}) => [existe(`users/${UID}/suscripcion/actual`, true), trae(`users/${UID}/suscripcion/actual`, { estado, cicloId: null, planId: null, ...extra })];
  const sinInvitacion = (email) => existe(`invitacionesMiembro/${email}`, false);
  const esAdmin = (email, valor) => existe(`admins/${email}`, valor);

  const caso = (nombre, esperado, metodo, ruta, a, { datos, existente, mocks = [] } = {}) => ({
    nombre,
    esperado,
    tc: {
      expectation: esperado,
      request: { auth: a, path: `${BASE}/${ruta}`, method: metodo, time: ahora, ...(datos ? { resource: { data: datos } } : {}) },
      ...(existente ? { resource: { data: existente } } : {}),
      functionMocks: mocks
    }
  });

  const dueno = auth(UID);
  const ajeno = auth(OTRO);
  const admin = auth('adm1', { email: EMAIL_ADMIN });
  const mocksAjeno = [...suscripcion('trial'), sinInvitacion(`${mail(OTRO)}`)];

  const casos = [
    // --- Datos de la cuenta ---
    caso('dueño en prueba: lee un pedido', 'ALLOW', 'get', `users/${UID}/pedidos/1`, dueno, { mocks: suscripcion('trial') }),
    caso('dueño activo: actualiza un pedido', 'ALLOW', 'update', `users/${UID}/pedidos/1`, dueno, { datos: { cliente: 'x' }, existente: { cliente: 'y' }, mocks: suscripcion('activa') }),
    caso('dueño activo: crea un pedido (sin límites de plan)', 'ALLOW', 'create', `users/${UID}/pedidos/2`, dueno, { datos: { cliente: 'x' }, mocks: suscripcion('activa') }),
    caso('nadie borra un pedido, ni el dueño', 'DENY', 'delete', `users/${UID}/pedidos/1`, dueno, { existente: { cliente: 'y' }, mocks: suscripcion('activa') }),
    caso('otra cuenta NO lee el pedido ajeno', 'DENY', 'get', `users/${UID}/pedidos/1`, ajeno, { mocks: mocksAjeno }),
    caso('sin login NO lee un pedido', 'DENY', 'get', `users/${UID}/pedidos/1`, null, { mocks: suscripcion('trial') }),
    caso('modo lectura: puede leer', 'ALLOW', 'get', `users/${UID}/pedidos/1`, dueno, { mocks: suscripcion('lectura') }),
    caso('modo lectura: NO puede actualizar', 'DENY', 'update', `users/${UID}/pedidos/1`, dueno, { datos: { cliente: 'x' }, existente: { cliente: 'y' }, mocks: suscripcion('lectura') }),
    caso('modo lectura: NO puede crear un cliente', 'DENY', 'create', `users/${UID}/clientes/1`, dueno, { datos: { nombre: 'x' }, mocks: suscripcion('lectura') }),
    caso('cuenta suspendida: NO puede ni leer', 'DENY', 'get', `users/${UID}/pedidos/1`, dueno, { mocks: suscripcion('suspendida') }),
    caso('dueño lee su meta/config', 'ALLOW', 'get', `users/${UID}/meta/config`, dueno, { mocks: suscripcion('trial') }),
    caso('dueño crea su biblioteca (sin límites)', 'ALLOW', 'create', `users/${UID}/biblioteca/1`, dueno, { datos: { nombre: 'x' }, mocks: suscripcion('activa') }),
    // --- Suscripción ---
    caso('dueño lee su suscripción', 'ALLOW', 'get', `users/${UID}/suscripcion/actual`, dueno, { mocks: [sinInvitacion(`${mail(UID)}`)] }),
    caso('dueño NO se escribe la suscripción', 'DENY', 'update', `users/${UID}/suscripcion/actual`, dueno, { datos: { estado: 'activa' }, existente: { estado: 'trial' }, mocks: suscripcion('trial') }),
    // --- Planes, FAQ y admins ---
    caso('planes: lectura pública', 'ALLOW', 'get', 'planes/p1', null),
    caso('planes: un usuario común NO escribe', 'DENY', 'update', 'planes/p1', dueno, { datos: { precioMensual: 1 }, existente: { precioMensual: 2 }, mocks: [esAdmin(`${mail(UID)}`, false)] }),
    caso('planes: un admin SÍ escribe', 'ALLOW', 'update', 'planes/p1', admin, { datos: { precioMensual: 1 }, existente: { precioMensual: 2 }, mocks: [esAdmin(EMAIL_ADMIN, true)] }),
    caso('faq: sin login NO lee', 'DENY', 'get', 'faq/f1', null),
    caso('faq: con login lee', 'ALLOW', 'get', 'faq/f1', dueno),
    caso('admins: cada uno lee su propio documento', 'ALLOW', 'get', `admins/${mail(UID)}`, dueno, { mocks: [esAdmin(`${mail(UID)}`, false)] }),
    caso('admins: NO se escribe desde la app', 'DENY', 'create', 'admins/nuevo@gmail.com', admin, { datos: { x: 1 }, mocks: [esAdmin(EMAIL_ADMIN, true)] }),
    // --- Aviso de actualización ---
    caso('aviso de actualización: cualquiera con sesión lo lee', 'ALLOW', 'get', 'avisoSistema/actualizacion', dueno),
    caso('aviso de actualización: sin sesión NO lo lee', 'DENY', 'get', 'avisoSistema/actualizacion', null),
    caso('aviso de actualización: un usuario común NO lo escribe', 'DENY', 'create', 'avisoSistema/actualizacion', dueno, { datos: { activo: true }, mocks: [esAdmin(`${mail(UID)}`, false)] }),
    caso('aviso de actualización: un admin SÍ lo escribe', 'ALLOW', 'create', 'avisoSistema/actualizacion', admin, { datos: { activo: true }, mocks: [esAdmin(EMAIL_ADMIN, true)] }),
    // --- Catálogo público ---
    caso('catálogo: la config se lee sin login', 'ALLOW', 'get', `catalogoTiendas/${UID}`, null),
    caso('catálogo: los productos se leen sin login', 'ALLOW', 'get', `catalogoTiendas/${UID}/productos/1`, null),
    caso('catálogo: otra cuenta NO edita la tienda ajena', 'DENY', 'update', `catalogoTiendas/${UID}`, ajeno, { datos: { nombre: 'x' }, existente: { nombre: 'y' }, mocks: mocksAjeno }),
    caso('catálogo: un cliente sin login arma una solicitud válida', 'ALLOW', 'create', `catalogoTiendas/${UID}/solicitudes/s1`, null, {
      datos: { cliente: 'Juan', items: [{ nombre: 'a' }], estado: 'pendiente', creado: '09/10/2026' },
      mocks: [existe(`catalogoTiendas/${UID}`, true), trae(`catalogoTiendas/${UID}`, { activo: true }), ...suscripcion('trial')]
    }),
    caso('catálogo: una solicitud con estado distinto de pendiente se rechaza', 'DENY', 'create', `catalogoTiendas/${UID}/solicitudes/s1`, null, {
      datos: { cliente: 'Juan', items: [{ nombre: 'a' }], estado: 'aprobada', creado: '09/10/2026' },
      mocks: [existe(`catalogoTiendas/${UID}`, true), trae(`catalogoTiendas/${UID}`, { activo: true }), ...suscripcion('trial')]
    }),
    caso('catálogo: sin login NO lee las solicitudes', 'DENY', 'get', `catalogoTiendas/${UID}/solicitudes/s1`, null, { mocks: suscripcion('trial') }),
    // --- Envíos a impresoras ---
    caso('envíos: el dueño pide un envío válido', 'ALLOW', 'create', `users/${UID}/trabajosImpresion/t1`, dueno, {
      datos: { archivoId: 'a', productoId: 'p', nombre: 'n', formato: 'gcode', conectorId: 'c', impresoraId: 'i', impresoraNombre: 'x', accion: 'imprimir', opciones: {}, estado: 'pendiente', creadoEl: ahora, creadoPor: UID, actualizadoEl: ahora },
      mocks: suscripcion('activa')
    }),
    caso('envíos: un campo de más se rechaza', 'DENY', 'create', `users/${UID}/trabajosImpresion/t1`, dueno, {
      datos: { archivoId: 'a', productoId: 'p', nombre: 'n', formato: 'gcode', conectorId: 'c', impresoraId: 'i', impresoraNombre: 'x', accion: 'imprimir', opciones: {}, estado: 'pendiente', creadoEl: ahora, creadoPor: UID, actualizadoEl: ahora, extra: 1 },
      mocks: suscripcion('activa')
    })
  ];

  const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}:test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] }, testSuite: { testCases: casos.map((c) => c.tc) } })
  });
  const j = await r.json();
  if (!r.ok) { console.log('API:', r.status, JSON.stringify(j).slice(0, 800)); process.exit(1); }
  let fallas = 0;
  (j.testResults || []).forEach((x, i) => {
    const bien = x.state === 'SUCCESS';
    if (!bien) fallas++;
    console.log(bien ? 'OK   ' : 'FALLA', casos[i].nombre, `(esperado ${casos[i].esperado})`, bien ? '' : (x.errorPosition ? JSON.stringify(x.errorPosition) : '') + ' ' + (x.debugMessages || []).slice(0, 2).join(' | ') + (process.env.DEPURAR ? ' ' + JSON.stringify(x).slice(0, 1500) : ''));
  });
  if (!j.testResults) { console.log(JSON.stringify(j).slice(0, 800)); process.exit(1); }
  console.log(fallas ? `\n${fallas} falla(s) de ${casos.length}` : `\nTodo bien (${casos.length} casos)`);
  process.exitCode = fallas ? 1 : 0;
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
