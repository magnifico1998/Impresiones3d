// Prueba la lógica de la marca del catálogo (tamaño del logo y texto destacado).
//   node scripts/probar-marca-catalogo.mjs
import { tamanoLogoDe, esloganDe, esloganTamanoDe, recortarBorradorEslogan, MAX_CARACTERES_LINEA, MAX_LINEAS_ESLOGAN, TAMANOS_LOGO, TAMANOS_ESLOGAN } from '../src/utils/catalogoMarca.js';
let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

ok(tamanoLogoDe({}) === 40 && tamanoLogoDe(null) === 40 && tamanoLogoDe(undefined) === 40, 'sin elegir: el logo queda en 40 px, como hasta ahora');
ok(TAMANOS_LOGO.every((t) => tamanoLogoDe({ logoTamano: t.px }) === t.px), 'cada tamaño del selector se respeta tal cual');
ok(tamanoLogoDe({ logoTamano: 9999 }) === 160 && tamanoLogoDe({ logoTamano: 3 }) === 24, 'un valor absurdo se acota entre 24 y 160 px');
ok(tamanoLogoDe({ logoTamano: 'grande' }) === 40 && tamanoLogoDe({ logoTamano: 0 }) === 40 && tamanoLogoDe({ logoTamano: -5 }) === 40, 'un valor que no es número vuelve al tamaño normal');
ok(tamanoLogoDe({ logoTamano: '96' }) === 96, 'un número guardado como texto también sirve');

ok(esloganDe({}) === '' && esloganDe(null) === '', 'sin texto: no se muestra nada');
ok(esloganDe({ eslogan: '  Impresiones   3D  \n  a medida  ' }) === 'Impresiones 3D\na medida', 'limpia los espacios de más y conserva las líneas');
ok(esloganDe({ eslogan: 'uno\ndos\ntres\ncuatro\ncinco' }) === 'uno\ndos\ntres', 'sólo se conservan ' + MAX_LINEAS_ESLOGAN + ' líneas');
ok(esloganDe({ eslogan: 'uno\n\n   \ndos' }) === 'uno\ndos', 'las líneas vacías no cuentan ni se muestran');
ok(esloganDe({ eslogan: 'uno\r\ndos' }) === 'uno\ndos', 'también acepta saltos de línea de Windows');
ok(esloganDe({ eslogan: 'x'.repeat(500) }).length === MAX_CARACTERES_LINEA, 'cada línea se corta en ' + MAX_CARACTERES_LINEA + ' caracteres');
ok(recortarBorradorEslogan('a\nb\nc\nd') === 'a\nb\nc', 'al escribir, la cuarta línea no entra');
ok(recortarBorradorEslogan('a '.repeat(100)).length === MAX_CARACTERES_LINEA && recortarBorradorEslogan('hola ') === 'hola ', 'al escribir se corta por línea pero no se comen los espacios');
ok(esloganDe({ eslogan: '<script>alert(1)</script>' }) === '<script>alert(1)</script>', 'el texto se guarda tal cual (React lo muestra como texto, no como código)');
ok(esloganDe({ eslogan: 123 }) === '123', 'un valor que no es texto no rompe');

ok(esloganTamanoDe({}) === 14 && esloganTamanoDe(null) === 14, 'sin elegir, el texto destacado queda en 14 px');
ok(TAMANOS_ESLOGAN.every((x) => esloganTamanoDe({ esloganTamano: x.px }) === x.px), 'cada tamaño del selector de texto se respeta');
ok(esloganTamanoDe({ esloganTamano: 999 }) === 32 && esloganTamanoDe({ esloganTamano: 2 }) === 10 && esloganTamanoDe({ esloganTamano: 'x' }) === 14, 'un valor absurdo se acota entre 10 y 32 px');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
