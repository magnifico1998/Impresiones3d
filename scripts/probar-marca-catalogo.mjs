// Prueba la lógica de la marca del catálogo (tamaño del logo y texto destacado).
//   node scripts/probar-marca-catalogo.mjs
import { tamanoLogoDe, esloganDe, MAX_ESLOGAN, TAMANOS_LOGO } from '../src/utils/catalogoMarca.js';
let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

ok(tamanoLogoDe({}) === 40 && tamanoLogoDe(null) === 40 && tamanoLogoDe(undefined) === 40, 'sin elegir: el logo queda en 40 px, como hasta ahora');
ok(TAMANOS_LOGO.every((t) => tamanoLogoDe({ logoTamano: t.px }) === t.px), 'cada tamaño del selector se respeta tal cual');
ok(tamanoLogoDe({ logoTamano: 9999 }) === 160 && tamanoLogoDe({ logoTamano: 3 }) === 24, 'un valor absurdo se acota entre 24 y 160 px');
ok(tamanoLogoDe({ logoTamano: 'grande' }) === 40 && tamanoLogoDe({ logoTamano: 0 }) === 40 && tamanoLogoDe({ logoTamano: -5 }) === 40, 'un valor que no es número vuelve al tamaño normal');
ok(tamanoLogoDe({ logoTamano: '96' }) === 96, 'un número guardado como texto también sirve');

ok(esloganDe({}) === '' && esloganDe(null) === '', 'sin texto: no se muestra nada');
ok(esloganDe({ eslogan: '  Impresiones   3D\na medida  ' }) === 'Impresiones 3D a medida', 'limpia espacios y saltos de línea');
ok(esloganDe({ eslogan: 'x'.repeat(500) }).length === MAX_ESLOGAN, `se corta en ${MAX_ESLOGAN} caracteres`);
ok(esloganDe({ eslogan: '<script>alert(1)</script>' }) === '<script>alert(1)</script>', 'el texto se guarda tal cual (React lo muestra como texto, no como código)');
ok(esloganDe({ eslogan: 123 }) === '123', 'un valor que no es texto no rompe');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
