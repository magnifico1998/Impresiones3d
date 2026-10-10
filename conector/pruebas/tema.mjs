// Prueba la limpieza del tema (colores) que llega de la nube al panel del conector.
//   node conector/pruebas/tema.mjs
import { sanearTema } from '../src/tema.js';

let fallas = 0;
const ok = (cond, texto) => { console.log(cond ? 'OK   ' : 'FALLA', texto); if (!cond) fallas++; };

const limpio = sanearTema({ bg: '#0f1117', accent: ' #6ee7b7 ', danger: 'rgba(185,52,40,0.10)', text: 'rgb(1, 2, 3)' });
ok(limpio && limpio.bg === '#0f1117' && limpio.accent === '#6ee7b7' && limpio.danger === 'rgba(185,52,40,0.10)' && limpio.text === 'rgb(1, 2, 3)', 'deja pasar colores hex y rgb(a), sin espacios de más');
ok(sanearTema({ bg: 'red; background:url(http://x)' }) === null, 'rechaza valores con código o direcciones');
ok(sanearTema({ bg: 'url(x)', accent: '#112233' }).accent === '#112233' && !('bg' in sanearTema({ bg: 'url(x)', accent: '#112233' })), 'descarta sólo lo inválido y conserva el resto');
ok(sanearTema({ 'bg;x': '#fff', '1a': '#fff', 'a-b': '#fff' }) === null, 'rechaza nombres que no son simples');
ok(sanearTema(null) === null && sanearTema('x') === null && sanearTema([]) === null && sanearTema({}) === null, 'datos que no son un mapa o vacíos dan null');
const muchos = Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['c' + i, '#ffffff']));
ok(Object.keys(sanearTema(muchos)).length === 40, 'se queda con 40 colores como máximo');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
