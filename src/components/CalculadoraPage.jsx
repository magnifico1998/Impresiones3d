import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import JSZip from 'jszip';

export default function CalculadoraPage({ 
  onOpenBibUsar, 
  onOpenBibGuardar, 
  onOpenAgregarPieza, 
  onOpenNewOrderWithCallback 
}) {
  const { cfg, biblioteca, pedidos, showToast } = useApp();

  const [horas, setHoras] = useState(2);
  const [watts, setWatts] = useState(120);
  const [precioKwh, setPrecioKwh] = useState(cfg.kwh);
  const [manoObra, setManoObra] = useState(cfg.mo);
  const [horasTrabajo, setHorasTrabajo] = useState(0.5);
  const [extras, setExtras] = useState(0);
  const [margen, setMargen] = useState(cfg.margen);
  const [desperdicio, setDesperdicio] = useState(cfg.desperdicio);
  const [precioRollo, setPrecioRollo] = useState(18000);
  const [gramos, setGramos] = useState(50);
  const [cantidad, setCantidad] = useState(1);
  const [selFilamento, setSelFilamento] = useState('manual');
  const [selImpresora, setSelImpresora] = useState('manual');
  
  // Consumables checked state: { [name]: { checked: boolean, qty: number, price: number } }
  const [insumosState, setInsumosState] = useState({});

  // Parsed G-code data state
  const [gcodeData, setGcodeData] = useState(null);
  const [gcodeItems, setGcodeItems] = useState([]);
  
  // Applied status of current G-code
  const [isGcodeApplied, setIsGcodeApplied] = useState(false);
  
  // Custom multi-material weights, prices, and filament bindings
  // Structure: { [key]: { type: string, color: string, totalG: number, precioKg: number, selFil: string } }
  const [bambuMats, setBambuMats] = useState({});

  // Status bar message
  const [statusBar, setStatusBar] = useState(null); // { text: string, type: 'info'|'success'|'warning'|'error' }

  // Manual sale price override
  const [precioVentaManual, setPrecioVentaManual] = useState('');
  const [precioVentaTocado, setPrecioVentaTocado] = useState(false);

  // Library mini search filter
  const [bibQ, setBibQ] = useState('');
  const [bibMiniCat, setBibMiniCat] = useState('');

  const [isDragOver, setIsDragOver] = useState(false);

  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString('es-AR');

  const formatH = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  // Sync config defaults on load
  useEffect(() => {
    setPrecioKwh(cfg.kwh);
    setManoObra(cfg.mo);
    setMargen(cfg.margen);
    setDesperdicio(cfg.desperdicio);
  }, [cfg]);

  // Adjust inputs based on selections
  const handleFilamentoSelectChange = (val) => {
    setSelFilamento(val);
    if (val !== 'manual') {
      const idx = parseInt(val, 10);
      if (cfg.filamentos[idx]) {
        setPrecioRollo(cfg.filamentos[idx].precio);
      }
    }
  };

  const handleImpresoraSelectChange = (val) => {
    setSelImpresora(val);
    if (val !== 'manual') {
      const idx = parseInt(val, 10);
      if (cfg.impresoras[idx]) {
        setWatts(cfg.impresoras[idx].watts);
      }
    }
  };

  // Insumos handlers
  const handleInsumoCheckboxChange = (name, price, checked) => {
    setInsumosState(prev => {
      const current = prev[name] || { qty: 1 };
      return {
        ...prev,
        [name]: { ...current, checked, price }
      };
    });
  };

  const handleInsumoQtyChange = (name, qtyVal) => {
    const qty = parseFloat(qtyVal) || 1;
    setInsumosState(prev => {
      const current = prev[name] || { checked: false, price: 0 };
      return {
        ...prev,
        [name]: { ...current, qty }
      };
    });
  };

  // Drag and Drop Zone events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleDragLeave();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) {
      files.forEach((file) => leerArchivo(file));
    }
  };

  // G-code parsing functions
  const setStatus = (text, type) => {
    setStatusBar({ text, type });
  };
  const clearStatus = () => {
    setStatusBar(null);
  };

  const readFileText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const appendGcodeItem = (item) => {
    setGcodeItems(prev => {
      const next = [...prev, item];
      if (next.length === 1) {
        setGcodeData(item);
      } else {
        setGcodeData(buildCompositeGcode(next));
      }
      return next;
    });
    setStatus(`Archivo agregado: ${item.nombre}`, 'success');
    setPrecioVentaTocado(false);
    setPrecioVentaManual('');
  };

  const handleRemoveGcodeItem = (index) => {
    setGcodeItems(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 1) {
        setGcodeData(next[0]);
        setIsGcodeApplied(false);
      } else if (next.length > 1) {
        setGcodeData(buildCompositeGcode(next));
        setIsGcodeApplied(false);
      } else {
        setGcodeData(null);
        setIsGcodeApplied(false);
      }
      return next;
    });
  };

  const leerArchivo = async (file) => {
    if (!file) return;
    clearStatus();
    setStatus(`Leyendo ${file.name}...`, 'info');
    try {
      let item = null;
      if (file.name.toLowerCase().endsWith('.3mf')) {
        item = await leer3mf(file);
      } else {
        const text = await readFileText(file);
        item = parsearGcode(text, file.name);
      }
      if (item) {
        appendGcodeItem(item);
      }
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  };

  const leer3mf = async (file) => {
    setStatus('Descomprimiendo .3mf...', 'info');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const keys = Object.keys(zip.files);
    if (keys.includes('Metadata/slice_info.config')) {
      setStatus('Bambu Studio detectado...', 'info');
      return parsearBambuSliceInfo(await zip.files['Metadata/slice_info.config'].async('string'), file.name);
    }
    const gf = keys.find(n => n.toLowerCase().endsWith('.gcode') || n.toLowerCase().endsWith('.gco'));
    if (gf) {
      return parsearGcode(await zip.files[gf].async('string'), file.name + ' → ' + gf);
    }
    throw new Error('No se encontró G-code dentro del .3mf.');
  };

  const parsearBambuSliceInfo = (xmlStr, nombre) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
      const placas = xmlDoc.querySelectorAll('plate');
      if (!placas.length) {
        setStatus('No se encontraron placas.', 'error');
        return null;
      }
      let totalSeg = 0;
      const placasData = [];
      const matMap = {};
      
      placas.forEach(plate => {
        const gm = (k) => plate.querySelector(`metadata[key="${k}"]`)?.getAttribute('value');
        const idx = gm('index') || '?';
        const pred = parseInt(gm('prediction') || '0', 10);
        const obj = plate.querySelector('object');
        const nom = (obj?.getAttribute('name') || `Placa ${idx}`).replace(/@.*$/, '').trim();
        const fils = [...plate.querySelectorAll('filament')].map(f => ({
          id: f.getAttribute('id'),
          type: f.getAttribute('type') || '?',
          color: f.getAttribute('color') || '#888',
          usedG: parseFloat(f.getAttribute('used_g') || '0')
        }));
        
        totalSeg += pred;
        placasData.push({ idx, nombre: nom, pred, fils, sel: true });
        
        fils.forEach(f => {
          const k = `${f.type}|${f.color}`;
          if (!matMap[k]) {
            matMap[k] = { type: f.type, color: f.color, totalG: 0, precioKg: 0 };
          }
          matMap[k].totalG += f.usedG;
        });
      });

      Object.values(matMap).forEach(m => {
        const match = cfg.filamentos.find(f => f.nombre.toLowerCase().includes(m.type.toLowerCase()));
        m.precioKg = match ? match.precio : (cfg.filamentos[0]?.precio || 18000);
      });

      const parsedData = { tipo: 'bambu', placas: placasData, matMap, totalSeg, nombre };
      setStatus(`✓ ${placasData.length} placas · ${Object.keys(matMap).length} material${Object.keys(matMap).length > 1 ? 'es' : ''} · ${Object.values(matMap).reduce((s, m) => s + m.totalG, 0).toFixed(1)}g · ${formatH(totalSeg)}`, 'success');
      setPrecioVentaTocado(false);
      setPrecioVentaManual('');

      const matsObj = {};
      Object.values(matMap).forEach((m, i) => {
        matsObj[i] = { 
          type: m.type,
          color: m.color,
          totalG: m.totalG, 
          precioKg: m.precioKg,
          selFil: 'manual'
        };
      });

      if (gcodeItems.length === 0) {
        setBambuMats(matsObj);
      }

      return parsedData;
    } catch (err) {
      setStatus('Error parseando: ' + err.message, 'error');
      return null;
    }
  };

  const parsearGcode = (text, nombre) => {
    const multiParsed = intentarParsearGcodeMultiMaterial(text, nombre);
    if (multiParsed) return multiParsed;

    let extractedGramos = null, extractedTiempo = null, extractedFilamento = null;
    
    for (const line of text.split('\n')) {
      if (extractedGramos === null) {
        const m = line.match(/filament\s+used\s*[=:]\s*([\d.]+)\s*g/i) || line.match(/;\s*filament_used\s*=\s*([\d.]+)/i);
        if (m) extractedGramos = parseFloat(m[1]);
      }
      if (extractedTiempo === null) {
        const m = line.match(/estimated\s+printing\s+time.*?[=:]\s*(.+)/i) || line.match(/;\s*TIME\s*:\s*(\d+)/i);
        if (m) {
          extractedTiempo = m[0].toUpperCase().includes('TIME:') 
            ? parseInt(m[1], 10) / 3600 
            : parseTiempoStr(m[1]);
        }
      }
      if (extractedFilamento === null) {
        const m = line.match(/;\s*filament_type\s*=\s*(.+)/i);
        if (m) extractedFilamento = m[1].trim();
      }
    }

    const parsedData = { tipo: 'gcode', gramos: extractedGramos, tiempo: extractedTiempo, filamento: extractedFilamento, nombre };
    setStatus((extractedGramos !== null || extractedTiempo !== null) ? 'Datos extraídos correctamente.' : 'No se detectaron datos. Ingresalos manualmente.', extractedGramos !== null || extractedTiempo !== null ? 'success' : 'warning');
    setPrecioVentaTocado(false);
    setPrecioVentaManual('');
    return parsedData;
  };

  const intentarParsearGcodeMultiMaterial = (text, nombre) => {
    const mUsed = text.match(/;\s*filament used \[g\]\s*=\s*([0-9.,\s]+)/i);
    const mType = text.match(/;\s*filament_type\s*=\s*([^\r\n]+)/i);
    if (!mUsed || !mType) return null;
    const tiposArr = mType[1].split(';').map(s => s.trim()).filter(Boolean);
    if (tiposArr.length < 2) return null;

    const gramosArr = mUsed[1].split(',').map(s => parseFloat(s.trim()) || 0);
    const mColor = text.match(/;\s*filament_colour\s*=\s*([^\r\n]+)/i) || text.match(/;\s*extruder_colour\s*=\s*([^\r\n]+)/i);
    const coloresArr = mColor ? mColor[1].split(';').map(s => s.trim()) : [];
    const mTiempo = text.match(/;\s*estimated printing time \(normal mode\)\s*=\s*([^\r\n]+)/i);
    const hours = mTiempo ? (parseTiempoStr(mTiempo[1]) || 0) : 0;
    const totalSeg = hours * 3600;
    
    const fils = [];
    for (let i = 0; i < tiposArr.length; i++) {
      const g = gramosArr[i] || 0;
      if (g <= 0) continue;
      fils.push({ id: String(i), type: tiposArr[i] || 'PLA', color: coloresArr[i] || '#888888', usedG: g });
    }
    if (!fils.length) return null;

    const matMap = {};
    fils.forEach(f => {
      const k = `${f.type}|${f.color}`;
      if (!matMap[k]) {
        matMap[k] = { type: f.type, color: f.color, totalG: 0, precioKg: 0 };
      }
      matMap[k].totalG += f.usedG;
    });

    Object.values(matMap).forEach(m => {
      const match = cfg.filamentos.find(f => f.nombre.toLowerCase().includes(m.type.toLowerCase()));
      m.precioKg = match ? match.precio : (cfg.filamentos[0]?.precio || 18000);
    });

    const placa = { idx: '1', nombre, pred: totalSeg, fils, sel: true };
    const parsedData = { tipo: 'bambu', placas: [placa], matMap, totalSeg, nombre };
    setStatus(`✓ G-code multi-material detectado · ${Object.keys(matMap).length} material${Object.keys(matMap).length > 1 ? 'es' : ''} · ${Object.values(matMap).reduce((s, m) => s + m.totalG, 0).toFixed(1)}g · ${formatH(totalSeg)}`, 'success');
    setPrecioVentaTocado(false);
    setPrecioVentaManual('');

    const matsObj = {};
    Object.values(matMap).forEach((m, i) => {
      matsObj[i] = { 
        type: m.type,
        color: m.color,
        totalG: m.totalG, 
        precioKg: m.precioKg,
        selFil: 'manual'
      };
    });
    if (gcodeItems.length === 0) {
      setBambuMats(matsObj);
    }

    return parsedData;
  };

  const parseTiempoStr = (str) => {
    const sh = str.match(/(\d+)\s*h/i), sm = str.match(/(\d+)\s*m/i), ss = str.match(/(\d+)\s*s/i);
    let t = 0;
    if (sh) t += parseInt(sh[1], 10);
    if (sm) t += parseInt(sm[1], 10) / 60;
    if (ss) t += parseInt(ss[1], 10) / 3600;
    if (!t) {
      const mn = str.match(/(\d+)/);
      if (mn) t = parseInt(mn[1], 10) / 60;
    }
    return t || null;
  };

  // Toggle single plate checkbox inside Bambu multi-plate view (preview stage)
  const handleTogglePlate = (idx, sel) => {
    setGcodeData(prev => {
      if (!prev) return prev;
      const placas = prev.placas.map((p, i) => i === idx ? { ...p, sel } : p);
      return { ...prev, placas };
    });
  };

  const handleToggleAllPlates = (sel) => {
    setGcodeData(prev => {
      if (!prev) return prev;
      const placas = prev.placas.map(p => ({ ...p, sel }));
      return { ...prev, placas };
    });
  };

  // Compute weights for selected plates in Bambu multi-material reactively
  const selectedPlatesMaterialGrams = useMemo(() => {
    if (!gcodeData || gcodeData.tipo !== 'bambu' || !gcodeData.placas) return {};
    const ms = {};
    gcodeData.placas.filter(p => p.sel).forEach(p => {
      p.fils.forEach(f => {
        const k = `${f.type}|${f.color}`;
        ms[k] = (ms[k] || 0) + f.usedG;
      });
    });
    return ms;
  }, [gcodeData]);

  const selectedPlatesTime = useMemo(() => {
    if (!gcodeData || gcodeData.tipo !== 'bambu' || !gcodeData.placas) return 0;
    return gcodeData.placas.filter(p => p.sel).reduce((sum, p) => sum + p.pred, 0);
  }, [gcodeData]);

  const selectedPlatesTotalGrams = useMemo(() => {
    return Object.values(selectedPlatesMaterialGrams).reduce((sum, v) => sum + v, 0);
  }, [selectedPlatesMaterialGrams]);

  const handleBambuMatWeightChange = (idx, value) => {
    const val = parseFloat(value) || 0;
    setBambuMats(prev => ({
      ...prev,
      [idx]: { ...prev[idx], totalG: val }
    }));
  };

  const handleBambuMatPriceChange = (idx, value) => {
    const val = parseFloat(value) || 0;
    setBambuMats(prev => ({
      ...prev,
      [idx]: { ...prev[idx], precioKg: val }
    }));
  };

  const handleBambuMatSelectChange = (idx, selectVal) => {
    setBambuMats(prev => {
      const updated = { ...prev };
      if (selectVal === 'manual') {
        updated[idx] = { ...updated[idx], selFil: 'manual' };
      } else {
        const match = cfg.filamentos[parseInt(selectVal, 10)];
        updated[idx] = { 
          ...updated[idx], 
          selFil: selectVal, 
          precioKg: match ? match.precio : updated[idx].precioKg 
        };
      }
      return updated;
    });
  };

  const handleResetGcode = () => {
    setGcodeData(null);
    setGcodeItems([]);
    setIsGcodeApplied(false);
    setBambuMats({});
    setPrecioVentaTocado(false);
    setPrecioVentaManual('');
    clearStatus();
  };

  const buildCompositeGcode = (items) => {
    if (!items || !items.length) return null;
    const isAllBambu = items.every(item => item.tipo === 'bambu');

    const composite = {
      tipo: isAllBambu ? 'bambu' : 'gcode',
      nombre: items.length === 1 ? items[0].nombre : `Producto compuesto (${items.length})`,
      placas: [],
      matMap: {},
      totalSeg: 0,
      gramos: 0,
      tiempo: 0,
      filamento: null
    };

    items.forEach(item => {
      if (item.tipo === 'bambu') {
        composite.placas = [...composite.placas, ...(item.placas || [])];
        composite.totalSeg += item.totalSeg || 0;
        Object.entries(item.matMap || {}).forEach(([k, m]) => {
          composite.matMap[k] = composite.matMap[k] || { type: m.type, color: m.color, totalG: 0, precioKg: m.precioKg };
          composite.matMap[k].totalG += m.totalG || 0;
          composite.matMap[k].precioKg = composite.matMap[k].precioKg || m.precioKg;
        });
      } else {
        composite.gramos += item.gramos || 0;
        composite.tiempo += item.tiempo || 0;
        if (!composite.filamento && item.filamento) {
          composite.filamento = item.filamento;
        }
      }
    });

    if (isAllBambu) {
      composite.placas = composite.placas.map(p => ({ ...p, sel: p.sel !== false }));
    }

    return composite;
  };

  const handleAplicarGcode = () => {
    if (!gcodeItems.length) return;

    const composite = buildCompositeGcode(gcodeItems);
    if (!composite) return;

    setGcodeData(composite);

    if (composite.tipo === 'bambu') {
      const newBambuMats = {};
      Object.keys(composite.matMap).forEach((k, i) => {
        const m = composite.matMap[k];
        const currentBMat = bambuMats[i] || { precioKg: m.precioKg, selFil: 'manual' };
        newBambuMats[i] = {
          type: m.type,
          color: m.color,
          totalG: m.totalG,
          precioKg: currentBMat.precioKg,
          selFil: currentBMat.selFil
        };
      });
      setBambuMats(newBambuMats);
      setHoras((composite.totalSeg || 0) / 3600);
      const matsArray = Object.values(newBambuMats);
      if (matsArray.length === 1) {
        setGramos(matsArray[0].totalG);
        setPrecioRollo(matsArray[0].precioKg);
        setSelFilamento(matsArray[0].selFil !== 'manual' ? matsArray[0].selFil : 'manual');
      }
    } else {
      if (composite.gramos !== null) {
        setGramos(composite.gramos);
      }
      if (composite.tiempo !== null) {
        setHoras(composite.tiempo);
      }
      if (composite.filamento) {
        const idx = cfg.filamentos.findIndex(f => f.nombre.toLowerCase().includes(composite.filamento.toLowerCase()));
        if (idx >= 0) {
          setSelFilamento(String(idx));
          setPrecioRollo(cfg.filamentos[idx].precio);
        } else {
          setSelFilamento('manual');
        }
      }
    }

    setIsGcodeApplied(true);
    setPrecioVentaTocado(false);
    setPrecioVentaManual('');
    showToast('✓ Producto compuesto aplicado a la calculadora.');
  };

  const handleLoadLibraryItem = (id) => {
    const prod = biblioteca.find(p => p.id === id);
    if (!prod) return;
    
    // Reset gcode details first
    setGcodeData(null);
    setBambuMats({});
    setIsGcodeApplied(false);
    
    // Set general calculator fields
    setHoras(prod.horas || 0);
    setWatts(prod.watts || 0);
    setPrecioKwh(prod.precioKwh || cfg.kwh);
    setManoObra(prod.moHora || cfg.mo);
    setHorasTrabajo(prod.horasTrab || 0);
    setExtras(prod.extras || 0);
    setMargen(prod.margen || cfg.margen);
    setDesperdicio(prod.desperdicio || cfg.desperdicio);
    setCantidad(prod.cantidad || 1);

    if (prod.materiales && prod.materiales.length > 0 && prod.matData) {
      const matMap = {};
      prod.materiales.forEach((m, i) => {
        const key = `${m.type}|${m.color}`;
        matMap[key] = {
          type: m.type,
          color: m.color,
          totalG: prod.matData[i]?.totalG || m.totalG,
          precioKg: prod.matData[i]?.precioKg || m.precioKg
        };
      });
      
      setGcodeData({
        tipo: 'bambu',
        placas: [],
        matMap,
        totalSeg: (prod.horas || 0) * 3600,
        nombre: prod.gcodeNombre || prod.nombre
      });

      const matsObj = {};
      Object.values(matMap).forEach((m, i) => {
        matsObj[i] = { 
          type: m.type,
          color: m.color,
          totalG: m.totalG, 
          precioKg: m.precioKg,
          selFil: 'manual' 
        };
      });
      setBambuMats(matsObj);
      setIsGcodeApplied(true);
    } else {
      setGramos(prod.gramos || 0);
      setPrecioRollo(prod.precioRollo || 0);
      setSelFilamento('manual');
      setIsGcodeApplied(true);
    }

    if (prod.impresoraNombre) {
      const idx = cfg.impresoras.findIndex(imp => imp.nombre === prod.impresoraNombre);
      if (idx >= 0) {
        setSelImpresora(String(idx));
        setWatts(cfg.impresoras[idx].watts);
      }
    }

    setPrecioVentaTocado(false);
    setPrecioVentaManual('');
    showToast(`✓ "${prod.nombre}" cargado en la calculadora.`);
  };

  // Listen for load library item events
  useEffect(() => {
    const handler = (e) => {
      if (e.detail && e.detail.id) {
        handleLoadLibraryItem(e.detail.id);
      }
    };
    window.addEventListener('load-bib-item', handler);
    return () => {
      window.removeEventListener('load-bib-item', handler);
    };
  }, [biblioteca, cfg]);

  // Math Calculations (Reactive)
  const calcOutput = useMemo(() => {
    const hrs = parseFloat(horas) || 0;
    const wts = parseFloat(watts) || 0;
    const pkwh = parseFloat(precioKwh) || 0;
    const moh = parseFloat(manoObra) || 0;
    const htr = parseFloat(horasTrabajo) || 0;
    const ext = parseFloat(extras) || 0;
    const mgn = parseFloat(margen) || 0;
    const dsp = parseFloat(desperdicio) || 0;

    let costeFil = 0;
    let filDetalle = [];

    const isBambuMulti = isGcodeApplied && gcodeData && gcodeData.tipo === 'bambu' && Object.keys(bambuMats).length > 1;

    if (isBambuMulti) {
      Object.values(bambuMats).forEach((m) => {
        const g = m.totalG;
        const p = m.precioKg;
        const c = (g * (1 + dsp / 100) / 1000) * p;
        costeFil += c;
        filDetalle.push({ label: `${m.type} (${g.toFixed(1)}g)`, costo: c, color: m.color });
      });
    } else {
      costeFil = (gramos * (1 + dsp / 100) / 1000) * precioRollo;
      filDetalle = [{ label: 'Filamento', costo: costeFil, color: null }];
    }

    const costeElec = (wts / 1000) * hrs * pkwh;
    
    // Printer Maintenance Wear
    let mantH = 0;
    if (selImpresora !== 'manual') {
      const idx = parseInt(selImpresora, 10);
      if (cfg.impresoras[idx]) mantH = cfg.impresoras[idx].mant || 0;
    }
    const costeMant = mantH * hrs;

    const costeMO = moh * htr;

    // Consumables sum
    let costeIns = 0;
    Object.keys(insumosState).forEach(name => {
      const insObj = insumosState[name];
      if (insObj && insObj.checked) {
        costeIns += insObj.price * (insObj.qty || 1);
      }
    });

    const costePorUnidad = costeFil + costeElec + costeMant + costeMO + costeIns + ext;
    const cantBase = parseFloat(cantidad) || 1;
    const totalCost = costePorUnidad * cantBase;
    
    const precioSugerido = totalCost * (1 + mgn / 100);

    let finalPrice;
    if (precioVentaTocado && precioVentaManual !== '') {
      finalPrice = parseFloat(precioVentaManual) || 0;
    } else {
      finalPrice = Math.round(precioSugerido);
    }

    const margenEfectivo = totalCost > 0 ? ((finalPrice - totalCost) / totalCost * 100) : 0;

    // Package current calculation results for Modal saves
    const currentPresupuesto = {
      nombreArchivo: (isGcodeApplied && gcodeData) ? gcodeData.nombre : null,
        gcodeArchivos: gcodeItems.length ? gcodeItems.map(item => item.nombre) : ((isGcodeApplied && gcodeData) ? [gcodeData.nombre] : []),
      costeElec,
      costeMant,
      costeMO,
      costeIns,
      extras: ext,
      total: costePorUnidad,
      precio: cantBase > 0 ? finalPrice / cantBase : finalPrice,
      horas: hrs,
      cantidad: cantBase,
      margen: mgn,
      impresoraNombre: selImpresora !== 'manual' ? cfg.impresoras[parseInt(selImpresora, 10)]?.nombre : null,
      
      // Raw form values
      gramos: isBambuMulti ? 0 : gramos,
      precioRollo: isBambuMulti ? 0 : precioRollo,
      watts: wts,
      precioKwh: pkwh,
      moHora: moh,
      horasTrab: htr,
      desperdicio: dsp,
      
      // Bambu meta
      gcodeNombre: (isGcodeApplied && gcodeData) ? gcodeData.nombre : null,
      materiales: (isGcodeApplied && gcodeData && gcodeData.tipo === 'bambu') ? Object.values(bambuMats).map(m => ({ type: m.type, color: m.color, totalG: m.totalG, precioKg: m.precioKg })) : null,
      multiMat: isBambuMulti,
      matData: (isGcodeApplied && gcodeData && gcodeData.tipo === 'bambu') ? Object.values(bambuMats).map(m => ({ totalG: m.totalG, precioKg: m.precioKg })) : null
    };

    return {
      costeFil,
      filDetalle,
      costeElec,
      costeMant,
      costeMO,
      costeIns,
      costePorUnidad,
      totalCost,
      precioSugerido,
      finalPrice,
      margenEfectivo,
      currentPresupuesto
    };
  }, [
    horas, watts, precioKwh, manoObra, horasTrabajo, extras, margen, desperdicio,
    precioRollo, gramos, cantidad, selFilamento, selImpresora, insumosState,
    gcodeData, isGcodeApplied, bambuMats, precioVentaTocado, precioVentaManual, cfg.impresoras
  ]);

  // Expose current calculation to global window object for ModalAgregarPieza
  useEffect(() => {
    window._currentPresupuesto = calcOutput.currentPresupuesto;
  }, [calcOutput.currentPresupuesto]);

  const handlePriceVentaManualChange = (val) => {
    setPrecioVentaManual(val);
    setPrecioVentaTocado(true);
  };

  const handleResetPrecioVentaManual = () => {
    setPrecioVentaManual('');
    setPrecioVentaTocado(false);
  };

  // Add calculated part to order action
  const handleAddToOrder = () => {
    const activeOrders = pedidos.filter(p => p.estado !== 'cancelado' && p.estado !== 'completado');
    if (!activeOrders.length) {
      if (window.confirm('No hay pedidos activos disponibles. ¿Querés crear un pedido nuevo?')) {
        onOpenNewOrderWithCallback((newIdVal) => {
          onOpenAgregarPieza(newIdVal);
        });
      }
      return;
    }
    onOpenAgregarPieza(null);
  };

  // Unique categories in library for selector filter
  const uniqueLibraryCats = useMemo(() => {
    return Array.from(new Set(biblioteca.map(b => b.cat).filter(Boolean))).sort();
  }, [biblioteca]);

  // Library pre-load item list filter
  const librarySearchResults = useMemo(() => {
    const q = bibQ.toLowerCase().trim();
    const list = biblioteca.filter(p => {
      const matchQ = !q || p.nombre.toLowerCase().includes(q) || (p.cat && p.cat.toLowerCase().includes(q));
      const matchCat = !bibMiniCat || p.cat === bibMiniCat;
      return matchQ && matchCat;
    });
    return list.slice(0, 6); // Cap at 6 preview items as in the original design
  }, [biblioteca, bibQ, bibMiniCat]);

  return (
    <div className="page active" id="page-calc">
      <div className="page-title">Calculadora de costos</div>
      <div className="page-sub">Calculá el costo de cada pieza y agregala a un pedido.</div>

      {/* 1. Card Importar archivo */}
      <div className="card">
        <div className="card-title">Importar archivo</div>
        <label 
          className={`drop-zone ${isDragOver ? 'over' : ''}`}
          onDragOver={handleDragOver} 
          onDragLeave={handleDragLeave} 
          onDrop={handleDrop}
        >
          <div className="dz-icon">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3v10M6 9l4-4 4 4" />
              <path d="M4 15h12" />
            </svg>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', fontWeight: 500 }}>
            Arrastrá tu archivo acá o hacé clic
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px', fontFamily: 'var(--mono)' }}>
            .gcode · .gco · .3mf — Bambu Studio, PrusaSlicer, Cura
          </div>
          <input 
            type="file" 
            id="gcode-file"
            multiple
            accept=".gcode,.gco,.g,.txt,.3mf" 
            onChange={(e) => Array.from(e.target.files || []).forEach(file => leerArchivo(file))} 
          />
        </label>

        {statusBar && (
          <div className={`status active ${statusBar.type}`}>
            {statusBar.text}
          </div>
        )}

        {gcodeItems.length > 0 && (
          <div style={{ marginTop: '12px', padding: '10px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg3)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
              Archivos importados ({gcodeItems.length})
            </div>
            {gcodeItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {item.tipo === 'bambu' ? `${item.placas.length} placas · ${formatH(item.totalSeg)}` : `${item.gramos?.toFixed(1) ?? '—'}g · ${item.tiempo ? formatH(item.tiempo * 3600) : '—'}`}
                  </div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => handleRemoveGcodeItem(idx)}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn btn-sm" onClick={handleResetGcode}>Limpiar archivos</button>
          </div>
        )}

        {/* Dynamic G-code parser preview (Bambu or single Gcode) */}
        {gcodeData && (
          <div id="gcode-resultado" style={{ display: 'block' }}>
            <div id="gcode-data">
              {/* Chips row */}
              {gcodeData.tipo === 'bambu' ? (
                <div className="chips">
                  <div className="chip">
                    <small>Placas</small>
                    <span>{gcodeData.placas.filter(p => p.sel).length}</span>
                  </div>
                  <div className="chip">
                    <small>Filamento</small>
                    <span>{selectedPlatesTotalGrams.toFixed(2)}g</span>
                  </div>
                  <div className="chip">
                    <small>Tiempo</small>
                    <span>{formatH(selectedPlatesTime)}</span>
                  </div>
                  <div className="chip">
                    <small>Materiales</small>
                    <span>{Object.keys(gcodeData.matMap).length}</span>
                  </div>
                </div>
              ) : (
                <div className="chips">
                  <div className="chip">
                    <small>Archivo</small>
                    <span>{gcodeData.nombre}</span>
                  </div>
                  {gcodeData.filamento && (
                    <div className="chip">
                      <small>Material</small>
                      <span>{gcodeData.filamento}</span>
                    </div>
                  )}
                  <div className="chip">
                    <small>Filamento</small>
                    <span>{gcodeData.gramos !== null ? gcodeData.gramos.toFixed(2) + 'g' : '—'}</span>
                  </div>
                  <div className="chip">
                    <small>Tiempo</small>
                    <span>{gcodeData.tiempo !== null ? formatH(gcodeData.tiempo * 3600) : '—'}</span>
                  </div>
                </div>
              )}

              {/* Bambu materials & plates tables */}
              {gcodeData.tipo === 'bambu' && (
                <>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
                    Materiales detectados
                  </div>
                  {Object.values(gcodeData.matMap).map((m, i) => {
                    const matState = bambuMats[i] || { precioKg: m.precioKg, selFil: 'manual' };
                    const currentGrams = selectedPlatesMaterialGrams[`${m.type}|${m.color}`] || 0;
                    return (
                      <div key={i} className="mat-row">
                        <span className="color-dot" style={{ background: m.color }}></span>
                        <span>
                          <strong>{m.type}</strong>{' '}
                          <span style={{ color: 'var(--text3)', fontSize: '11px', fontFamily: 'var(--mono)' }}>{m.color}</span>{' '}
                          — <span>{currentGrams.toFixed(2)}g</span>
                        </span>
                        <select 
                          value={matState.selFil || 'manual'} 
                          onChange={(e) => handleBambuMatSelectChange(i, e.target.value)}
                        >
                          <option value="manual">Manual</option>
                          {cfg.filamentos.map((f, fi) => (
                            <option key={fi} value={fi}>{f.nombre}</option>
                          ))}
                        </select>
                        <input 
                          type="number" 
                          value={matState.precioKg} 
                          step="100" 
                          onChange={(e) => handleBambuMatPriceChange(i, e.target.value)} 
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text3)' }}>$/kg</span>
                      </div>
                    );
                  })}

                  <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
                    Placas
                  </div>
                  <div className="plates-wrap">
                    <table className="plates-tbl">
                      <thead>
                        <tr>
                          <th>
                            <input 
                              type="checkbox" 
                              checked={gcodeData.placas.every(p => p.sel)} 
                              onChange={(e) => handleToggleAllPlates(e.target.checked)} 
                            />
                          </th>
                          <th>#</th>
                          <th>Pieza</th>
                          <th>Material</th>
                          <th>Gramos</th>
                          <th>Tiempo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gcodeData.placas.map((p, idx) => {
                          const multi = p.fils.length > 1;
                          const nombreLimpio = (p.nombre || '').replace(/\.(3mf|gcode|gco)$/i, '').replace(/\s*→.*$/, '').trim();
                          
                          return (
                            <React.Fragment key={idx}>
                              <tr className="plate-row">
                                <td>
                                  <input 
                                    type="checkbox" 
                                    checked={p.sel} 
                                    onChange={(e) => handleTogglePlate(idx, e.target.checked)} 
                                  />
                                </td>
                                <td style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.idx}</td>
                                <td style={{ fontWeight: 500 }}>{nombreLimpio}</td>
                                <td>
                                  {p.fils.map((f, fi) => (
                                    <span key={fi} className="color-dot" style={{ background: f.color, marginRight: '2px' }} title={f.type}></span>
                                  ))}
                                  {multi ? (
                                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{p.fils.length} mats</span>
                                  ) : (
                                    <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{p.fils[0]?.type || ''}</span>
                                  )}
                                </td>
                                <td style={{ fontFamily: 'var(--mono)' }}>
                                  {p.fils.reduce((s, f) => s + f.usedG, 0).toFixed(2)}g
                                </td>
                                <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                                  {formatH(p.pred)}
                                </td>
                              </tr>
                              {multi && p.fils.map((f, fi) => (
                                <tr key={fi} className="fil-sub">
                                  <td></td>
                                  <td></td>
                                  <td style={{ color: 'var(--text3)' }}>↳ {f.type}</td>
                                  <td>
                                    <span className="color-dot" style={{ background: f.color, marginRight: '4px' }}></span>
                                    <span style={{ fontSize: '11px', fontFamily: 'var(--mono)' }}>{f.color}</span>
                                  </td>
                                  <td style={{ fontFamily: 'var(--mono)' }}>{f.usedG.toFixed(2)}g</td>
                                  <td></td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Actions apply or reset Gcode */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleAplicarGcode}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 10l4 4 6-8" />
                </svg>
                Aplicar a la calculadora
              </button>
              <button className="btn" onClick={handleResetGcode}>
                Limpiar
              </button>
            </div>
          </div>
        )}

        {/* Biblioteca mini list */}
        <div id="bib-buscar-wrap" style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
            <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              o desde biblioteca
            </span>
            <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div className="bib-search" style={{ flex: 1 }}>
              <svg className="bib-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '14px', height: '14px' }}>
                <circle cx="9" cy="9" r="5" />
                <path d="M15 15l-3-3" />
              </svg>
              <input 
                type="text" 
                value={bibQ} 
                onChange={(e) => setBibQ(e.target.value)} 
                placeholder="Buscar producto guardado..." 
                style={{ fontSize: '13px' }} 
              />
            </div>
            <select 
              value={bibMiniCat} 
              onChange={(e) => setBibMiniCat(e.target.value)} 
              style={{ width: '140px', fontSize: '12px' }}
            >
              <option value="">Todas las categorías</option>
              {uniqueLibraryCats.map((catName, idx) => (
                <option key={idx} value={catName}>{catName}</option>
              ))}
            </select>
          </div>

          {/* Render search results */}
          <div id="bib-mini-lista">
            {biblioteca.length > 0 ? (
              librarySearchResults.map(p => (
                <div 
                  key={p.id} 
                  className="bib-card" 
                  onClick={() => handleLoadLibraryItem(p.id)}
                  title="Cargar en calculadora"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                        {p.cat || 'General'} · {p.horas?.toFixed(1) || '?'}h · {fmt(p.costoUnitario * p.cantidad)}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                      {fmt(p.precioSugUnitario * p.cantidad)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', padding: '8px' }}>
                La biblioteca está vacía. Guardá un producto calculado.
              </div>
            )}
            {biblioteca.length > 0 && librarySearchResults.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', padding: '8px' }}>
                Sin resultados.
              </div>
            )}
            {biblioteca.length > 6 && librarySearchResults.length > 0 && (
              <div 
                style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', padding: '6px', cursor: 'pointer' }} 
                onClick={onOpenBibUsar}
              >
                Ver los {biblioteca.length} productos →
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. KPIs grid4 */}
      <div className="grid4">
        <div className="metric">
          <div className="metric-label">Costo total</div>
          <div className="metric-value" id="sc-costo">{fmt(calcOutput.totalCost)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Precio venta</div>
          <div className="metric-value accent" id="sc-precio">{fmt(calcOutput.finalPrice)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Ganancia</div>
          <div className="metric-value" id="sc-ganancia" style={{ color: calcOutput.finalPrice - calcOutput.totalCost >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {fmt(calcOutput.finalPrice - calcOutput.totalCost)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Margen</div>
          <div className="metric-value" id="sc-margen">{calcOutput.margenEfectivo.toFixed(0)}%</div>
        </div>
      </div>

      {/* 3. Grid2 Filamentos & Electricidad y Tiempo */}
      <div className="grid2">
        {/* Filaments Card */}
        <div className="card">
          <div className="card-title">Filamentos</div>
          <div id="filamentos-body">
            {isGcodeApplied && gcodeData && gcodeData.tipo === 'bambu' && Object.keys(bambuMats).length > 1 ? (
              <div id="multi-fil-ui">
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>
                  <span className="pill">desde archivo</span> {Object.keys(bambuMats).length} materiales
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 90px 90px', gap: '8px', padding: '0 0 6px', borderBottom: '1px solid var(--border)', fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <span></span>
                  <span>Material</span>
                  <span>Gramos</span>
                  <span>$/kg</span>
                </div>
                {Object.values(bambuMats).map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr 90px 90px', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="color-dot" style={{ background: m.color }}></span>
                    <span>
                      <strong>{m.type}</strong>{' '}
                      <span style={{ color: 'var(--text3)', fontSize: '11px', fontFamily: 'var(--mono)' }}>{m.color}</span>
                    </span>
                    <input 
                      type="number" 
                      value={m.totalG} 
                      step="0.1" 
                      id={`mfil-g-${i}`}
                      style={{ fontSize: '12px', padding: '4px 6px' }}
                      onChange={(e) => handleBambuMatWeightChange(i, e.target.value)} 
                    />
                    <input 
                      type="number" 
                      value={m.precioKg} 
                      step="100" 
                      id={`mfil-p-${i}`}
                      style={{ fontSize: '12px', padding: '4px 6px' }}
                      onChange={(e) => handleBambuMatPriceChange(i, e.target.value)} 
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div id="manual-fil-wrap">
                <label className="fl">Filamento</label>
                <select value={selFilamento} onChange={(e) => handleFilamentoSelectChange(e.target.value)} id="sel-filamento">
                  <option value="manual">— Manual —</option>
                  {cfg.filamentos.map((f, i) => (
                    <option key={i} value={i}>{f.nombre} · {fmt(f.precio)}/kg</option>
                  ))}
                </select>
                
                {selFilamento === 'manual' && (
                  <div id="fil-precio-wrap">
                    <label className="fl">Precio del rollo ($/kg)</label>
                    <input 
                      type="number" 
                      id="precio-rollo"
                      value={precioRollo} 
                      step="100" 
                      onChange={(e) => setPrecioRollo(parseFloat(e.target.value) || 0)} 
                    />
                  </div>
                )}
                
                <label className="fl">
                  Gramos usados (g){' '}
                  {isGcodeApplied && (
                    <span id="tag-gcode-gramos" className="pill" style={{ display: 'inline-block' }}>desde archivo</span>
                  )}
                </label>
                <input 
                  type="number" 
                  id="gramos"
                  value={gramos} 
                  step="0.1" 
                  onChange={(e) => setGramos(parseFloat(e.target.value) || 0)} 
                />
                
                <label className="fl">Desperdicio (%)</label>
                <input 
                  type="number" 
                  id="desperdicio"
                  value={desperdicio} 
                  step="1" 
                  min="0" 
                  max="100" 
                  onChange={(e) => setDesperdicio(parseFloat(e.target.value) || 0)} 
                />
              </div>
            )}
          </div>
        </div>

        {/* Electric & Time Card */}
        <div className="card">
          <div className="card-title">Electricidad y tiempo</div>
          
          <label className="fl">
            Tiempo de impresión (horas){' '}
            {isGcodeApplied && (
              <span id="tag-gcode-tiempo" className="pill" style={{ display: 'inline-block' }}>desde archivo</span>
            )}
          </label>
          <input 
            type="number" 
            id="horas"
            value={horas} 
            step="0.25" 
            onChange={(e) => setHoras(parseFloat(e.target.value) || 0)} 
          />

          <label className="fl">Impresora</label>
          <select value={selImpresora} onChange={(e) => handleImpresoraSelectChange(e.target.value)} id="sel-impresora">
            <option value="manual">— Manual —</option>
            {cfg.impresoras.map((imp, i) => (
              <option key={i} value={i}>{imp.nombre} · {imp.watts}W</option>
            ))}
          </select>

          {selImpresora === 'manual' && (
            <div id="imp-watts-wrap">
              <label className="fl">Consumo (W)</label>
              <input 
                type="number" 
                id="watts"
                value={watts} 
                step="10" 
                onChange={(e) => setWatts(parseFloat(e.target.value) || 0)} 
              />
            </div>
          )}

          <label className="fl">Costo electricidad ($/kWh)</label>
          <input 
            type="number" 
            id="precio-kwh"
            value={precioKwh} 
            step="1" 
            onChange={(e) => setPrecioKwh(parseFloat(e.target.value) || 0)} 
          />
        </div>
      </div>

      {/* 4. Insumos adicionales Card */}
      <div className="card">
        <div className="card-title">Insumos adicionales</div>
        <div id="lista-insumos">
          {!cfg.insumos || !cfg.insumos.length ? (
            <div className="empty">Configurá tus insumos en Configuración.</div>
          ) : (
            cfg.insumos.map((ins, i) => {
              const stateObj = insumosState[ins.nombre] || { checked: false, qty: 1 };
              return (
                <div key={i} className="insumo-row">
                  <input 
                    type="checkbox" 
                    className="insumo-check-input"
                    checked={stateObj.checked}
                    onChange={(e) => handleInsumoCheckboxChange(ins.nombre, ins.precio, e.target.checked)} 
                  />
                  <span style={{ flex: 1 }}>
                    {ins.nombre}{' '}
                    <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                      ({fmt(ins.precio)})
                    </span>
                  </span>
                  {stateObj.checked && (
                    <input 
                      type="number" 
                      className="insumo-qty" 
                      min="0.1" 
                      step="0.1" 
                      value={stateObj.qty} 
                      onChange={(e) => handleInsumoQtyChange(ins.nombre, e.target.value)} 
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. Grid2 Labor details & Summary info */}
      <div className="grid2">
        {/* Labor Card */}
        <div className="card">
          <div className="card-title">Mano de obra y margen</div>
          
          <label className="fl">Mano de obra ($/hora)</label>
          <input 
            type="number" 
            id="mano-obra"
            value={manoObra} 
            step="50" 
            onChange={(e) => setManoObra(parseFloat(e.target.value) || 0)} 
          />

          <label className="fl">Horas de trabajo manual</label>
          <input 
            type="number" 
            id="horas-trabajo"
            value={horasTrabajo} 
            step="0.25" 
            onChange={(e) => setHorasTrabajo(parseFloat(e.target.value) || 0)} 
          />

          <label className="fl">Gastos extra ($)</label>
          <input 
            type="number" 
            id="extras"
            value={extras} 
            step="100" 
            onChange={(e) => setExtras(parseFloat(e.target.value) || 0)} 
          />

          <label className="fl">Margen de ganancia (%)</label>
          <input 
            type="number" 
            id="margen"
            value={margen} 
            step="5" 
            min="0" 
            onChange={(e) => setMargen(parseFloat(e.target.value) || 0)} 
          />

          <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }}></div>
          
          <label className="fl">Cantidad de unidades</label>
          <input 
            type="number" 
            id="cantidad"
            value={cantidad} 
            step="1" 
            min="1" 
            style={{ fontSize: '16px', fontWeight: 600 }}
            onChange={(e) => setCantidad(parseFloat(e.target.value) || 1)} 
          />
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '4px' }}>
            El costo y precio se multiplican por la cantidad
          </div>
        </div>

        {/* Summary Card */}
        <div className="card">
          <div className="card-title">Resumen</div>
          <div className="result-box">
            <div className="r-row">
              <span>Filamentos</span>
              <span id="r-fil">{fmt(calcOutput.costeFil * cantidad)}</span>
            </div>
            
            <div id="r-fil-detalle">
              {calcOutput.filDetalle.length > 1 && calcOutput.filDetalle.map((f, i) => (
                <div key={i} className="r-row sub">
                  <span>
                    {f.color && (
                      <span className="color-dot" style={{ background: f.color, marginRight: '4px' }}></span>
                    )}
                    {f.label}
                  </span>
                  <span>{fmt(f.costo * cantidad)}</span>
                </div>
              ))}
            </div>

            <div className="r-row">
              <span>Electricidad</span>
              <span id="r-elec">{fmt(calcOutput.costeElec * cantidad)}</span>
            </div>
            <div className="r-row">
              <span>Mantenimiento imp.</span>
              <span id="r-mant">{fmt(calcOutput.costeMant * cantidad)}</span>
            </div>
            <div className="r-row">
              <span>Mano de obra</span>
              <span id="r-mo">{fmt(calcOutput.costeMO * cantidad)}</span>
            </div>
            <div className="r-row">
              <span>Insumos</span>
              <span id="r-ins">{fmt(calcOutput.costeIns * cantidad)}</span>
            </div>
            <div className="r-row">
              <span>Extras</span>
              <span id="r-ext">{fmt(extras * cantidad)}</span>
            </div>
            <div className="r-row total">
              <span>Costo total</span>
              <span id="r-total">{fmt(calcOutput.totalCost)}</span>
            </div>
            
            <div className="r-row price" style={{ alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 400, fontFamily: 'var(--sans)', color: 'var(--text2)' }}>
                Precio venta <span style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'none' }}>(editable)</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input 
                  type="number" 
                  id="r-precio-input"
                  value={Math.round(calcOutput.finalPrice)} 
                  step="1" 
                  min="0" 
                  style={{
                    width: '110px',
                    textAlign: 'right',
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    fontSize: '18px',
                    color: 'var(--accent)',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: '2px 0'
                  }}
                  onChange={(e) => handlePriceVentaManualChange(e.target.value)} 
                />
                <button 
                  type="button" 
                  title="Recalcular según margen configurado" 
                  style={{
                    background: 'none',
                    border: '1px solid var(--border2)',
                    borderRadius: '6px',
                    color: 'var(--text3)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    padding: '3px 6px',
                    lineHeight: 1
                  }}
                  onClick={handleResetPrecioVentaManual}
                >
                  ↺
                </button>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button 
              className="btn btn-primary" 
              style={{ flex: 1, justifyContent: 'center' }} 
              onClick={() => {
                if (!calcOutput.currentPresupuesto || calcOutput.totalCost === 0) {
                  showToast('Primero calculá el costo del producto.', 'error');
                  return;
                }
                onOpenBibGuardar(calcOutput.currentPresupuesto);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4h9l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
                <path d="M7 4v5h6V4M7 13h6" />
              </svg>
              Guardar en biblioteca
            </button>
            <button 
              className="btn" 
              style={{ flex: 1, justifyContent: 'center' }} 
              onClick={handleAddToOrder}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 4v12M4 10h12" />
              </svg>
              Agregar a pedido
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', marginTop: '8px', lineHeight: 1.4 }}>
            Guardar en biblioteca habilita versiones, colores y precio de venta editable por pieza. "Agregar a pedido" es para productos simples que no necesitás guardar.
          </div>
        </div>
      </div>
    </div>
  );
}
