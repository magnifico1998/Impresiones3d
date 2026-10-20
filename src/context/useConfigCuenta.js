import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { paletas } from '../utils/paletas';
import { defaultCfg, defaultEmpresa } from './valoresPorDefecto';

// Configuración de la cuenta, datos del emprendimiento y contador de ids: viven
// en users/{cuenta}/meta/config. Acá están el estado, la carga inicial, el
// guardado automático (con reintentos), la escucha de cambios hechos desde otra
// sesión, la paleta de colores y el ícono de la pestaña.
//   cargarConfigDeFirestore(uid): lee (o crea) el documento; lo usa la carga de datos.
//   omitirProximoGuardadoConfig(): el próximo cambio es el eco de algo recién
//     cargado o restaurado, no una edición: no hace falta volver a guardarlo.
//   registrarGuardadoConfig(timestamp): se acaba de escribir el documento por otra vía.
export function useConfigCuenta({ cuentaId, datosCargadosOk, loading, showToast, setSyncError }) {
  const [empresa, setEmpresa] = useState(defaultEmpresa);
  const [cfg, setCfg] = useState(defaultCfg);
  const [idCounter, setIdCounter] = useState(1);

  // FASE 1 de la migración a Firestore por secciones: config + empresa +
  // counter pasan a vivir en su propio documento (users/{uid}/meta/config)
  // en vez de ser campos del documento monolítico users/{uid}. Es la
  // sección piloto elegida por ser la más chica y la que menos cambia.
  //
  // Usa el mismo patrón de detección de eco que en su momento tuvo el
  // documento principal — así un guardado de config no interfiere con las
  // demás subcolecciones (pedidos/biblioteca/clientes/compras), y viceversa.
  // (El documento principal users/{uid} ya no existe como tal desde la
  // limpieza de Fase 5 — ver cargarDatosDeFirestore.)
  const lastWrittenTimestampRefMeta = useRef(null);
  const pendingWriteTimestampRefMeta = useRef(null);
  const skipNextAutosaveRefMeta = useRef(false);

  // Carga config + empresa + counter desde su documento propio
  // (users/{uid}/meta/config). Si todavía no existe (cuenta nueva que abre
  // la app por primera vez), lo crea con los valores default — ver el
  // comentario de users/{uid}/meta en firestore.rules: esa creación tiene
  // que poder pasar siempre.
  const cargarConfigDeFirestore = async (uid) => {
    const metaRef = doc(db, "users", uid, "meta", "config");
    const metaSnap = await getDoc(metaRef);

    if (metaSnap.exists()) {
      const meta = metaSnap.data();
      setCfg(meta.config ?? defaultCfg);
      setEmpresa(meta.empresa ?? defaultEmpresa);
      setIdCounter(Number(meta.counter ?? 1));
      lastWrittenTimestampRefMeta.current = meta.ultimaActualizacion || null;
      pendingWriteTimestampRefMeta.current = null;
      return;
    }

    // Cuenta nueva: inicializamos meta/config con los valores default.
    setCfg(defaultCfg);
    setEmpresa(defaultEmpresa);
    setIdCounter(1);

    const timestampInicial = new Date().toISOString();
    await setDoc(metaRef, {
      config: defaultCfg,
      empresa: defaultEmpresa,
      counter: 1,
      ultimaActualizacion: timestampInicial
    });
    lastWrittenTimestampRefMeta.current = timestampInicial;
    pendingWriteTimestampRefMeta.current = null;
  };

  useEffect(() => {
    if (cfg?.palette) {
      const base = paletas[cfg.palette] || paletas.lagoon;
      // paletaCustom pisa sólo los 7 roles editables desde "Paleta
      // personalizada" (Configuración) -- el resto de los roles (border,
      // warn, danger, etc.) siempre vienen de la paleta base elegida.
      const custom = cfg.paletaCustom || {};
      const palette = { ...base, ...custom };
      // "Fondo" en el editor representa el fondo general de la app: eso es
      // --bg2 en la práctica (header, sidebar, cards, modales), no sólo el
      // --bg del body. Si no la reflejamos también en --bg2, el retoque de
      // "Fondo" no se nota en el sidebar/header/cards, que es justo lo que
      // más se ve -- por eso se copia el mismo valor a los dos roles.
      if (custom.bg) palette.bg2 = custom.bg;
      Object.entries(palette).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    }
  }, [cfg?.palette, cfg?.paletaCustom]);

  // Auto-save de config + empresa + counter a su documento propio
  // (users/{uid}/meta/config). Mismo patrón de debounce + reintentos que el
  // autosave principal, pero completamente independiente: un cambio acá no
  // dispara ni cancela el guardado de pedidos/biblioteca/clientes/compras,
  // y viceversa.
  const debounceTimeoutRefMeta = useRef(null);
  const saveRetryTimeoutRefMeta = useRef(null);

  useEffect(() => {
    if (loading || !cuentaId || !datosCargadosOk) return;

    if (skipNextAutosaveRefMeta.current) {
      skipNextAutosaveRefMeta.current = false;
      return;
    }

    let cancelado = false;

    if (debounceTimeoutRefMeta.current) {
      clearTimeout(debounceTimeoutRefMeta.current);
      debounceTimeoutRefMeta.current = null;
    }
    if (saveRetryTimeoutRefMeta.current) {
      clearTimeout(saveRetryTimeoutRefMeta.current);
      saveRetryTimeoutRefMeta.current = null;
    }

    debounceTimeoutRefMeta.current = setTimeout(() => {
      if (cancelado) return;

      const timestamp = new Date().toISOString();
      const metaPayload = {
        config: cfg,
        empresa,
        counter: idCounter,
        ultimaActualizacion: timestamp
      };

      const metaRef = doc(db, "users", cuentaId, "meta", "config");

      const intentarGuardar = (intento = 0) => {
        lastWrittenTimestampRefMeta.current = timestamp;
        pendingWriteTimestampRefMeta.current = timestamp;

        setDoc(metaRef, metaPayload, { merge: true })
          .then(() => {
            if (cancelado) return;
            pendingWriteTimestampRefMeta.current = null;
            lastWrittenTimestampRefMeta.current = timestamp;
            setSyncError(prevError => {
              if (prevError) {
                showToast('✓ Conexión con la nube restablecida. Datos guardados.', 'success');
              }
              return false;
            });
          })
          .catch(e => {
            console.error("Error al guardar config/empresa en Firebase:", e);
            if (cancelado) return;

            if (intento < 2) {
              saveRetryTimeoutRefMeta.current = setTimeout(() => {
                if (!cancelado) intentarGuardar(intento + 1);
              }, 1500 * (intento + 1));
              return;
            }

            setSyncError(true);
            showToast(
              '⚠ No se pudo guardar la configuración en la nube. Revisá tu conexión.',
              'error',
              10000
            );
          });
      };

      intentarGuardar();
    }, 800);

    return () => {
      cancelado = true;
      if (debounceTimeoutRefMeta.current) {
        clearTimeout(debounceTimeoutRefMeta.current);
        debounceTimeoutRefMeta.current = null;
      }
      if (saveRetryTimeoutRefMeta.current) {
        clearTimeout(saveRetryTimeoutRefMeta.current);
        saveRetryTimeoutRefMeta.current = null;
      }
    };
  // showToast y setSyncError sólo se usan al avisar: no deben reiniciar el guardado pendiente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, empresa, idCounter, cuentaId, loading, datosCargadosOk]);

  // Listener en tiempo real para config + empresa + counter, ahora en su
  // propio documento (users/{uid}/meta/config). Independiente del listener
  // principal de arriba: usa sus propias referencias de eco
  // (lastWrittenTimestampRefMeta / pendingWriteTimestampRefMeta), así un
  // cambio remoto en config no se confunde con uno en pedidos/biblioteca/etc.
  useEffect(() => {
    if (!cuentaId || !datosCargadosOk) return;

    const metaRef = doc(db, "users", cuentaId, "meta", "config");

    const unsubscribe = onSnapshot(
      metaRef,
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        if (!snapshot.exists()) return;

        const meta = snapshot.data();

        if (
          meta.ultimaActualizacion &&
          meta.ultimaActualizacion === lastWrittenTimestampRefMeta.current
        ) {
          return;
        }

        if (
          meta.ultimaActualizacion &&
          pendingWriteTimestampRefMeta.current &&
          meta.ultimaActualizacion <= pendingWriteTimestampRefMeta.current
        ) {
          return;
        }

        setCfg(meta.config ?? defaultCfg);
        setEmpresa(meta.empresa ?? defaultEmpresa);
        setIdCounter(Number(meta.counter ?? 1));
        lastWrittenTimestampRefMeta.current = meta.ultimaActualizacion || null;
        showToast('↺ Configuración actualizada desde otra sesión.', 'info');
      },
      (error) => {
        console.error("Error en la suscripción en tiempo real de config:", error);
      }
    );

    return () => unsubscribe();
  // showToast cambia en cada render y sólo se usa al avisar: no debe reiniciar la escucha.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId, datosCargadosOk]);

  useEffect(() => {
    try {
      const logo = empresa && empresa.logo ? empresa.logo : null;
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      if (logo) {
        link.href = logo;
      } else {
        // fallback to default favicon in public
        link.href = '/favicon.svg';
      }
    } catch (e) {
      console.error('Error setting favicon:', e);
    }
  }, [empresa && empresa.logo]);

  const omitirProximoGuardadoConfig = () => { skipNextAutosaveRefMeta.current = true; };
  const registrarGuardadoConfig = (timestamp) => {
    lastWrittenTimestampRefMeta.current = timestamp;
    pendingWriteTimestampRefMeta.current = null;
  };

  return { cfg, setCfg, empresa, setEmpresa, idCounter, setIdCounter, cargarConfigDeFirestore, omitirProximoGuardadoConfig, registrarGuardadoConfig };
}
