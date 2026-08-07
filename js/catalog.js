'use strict';

(function exposeCatalog(global) {
  const OFFICIAL_SOURCE_VERSION = 'ago2026-v1.0';
  const OFFICIAL_SOURCE_LABEL = 'Catálogo Oferta Análisis Agosto 2026';
  const OFFICIAL_SOURCE_URL = './data.json';
  const MAX_RECORDS = 5000;
  const MAX_FIELD_LENGTH = 12000;

  const SECTIONS = Object.freeze([
    {
      title: 'Muestra',
      fields: [
        ['tipo_muestra', 'Tipo de muestra'],
        ['cantidad_minima', 'Cantidad mínima'],
        ['proc_toma', 'Procedimiento de toma'],
        ['obs_toma', 'Observaciones de la toma']
      ]
    },
    {
      title: 'Preparación del paciente',
      fields: [
        ['prep_paciente', 'Preparación del paciente'],
        ['indic_paciente', 'Indicaciones al paciente']
      ]
    },
    {
      title: 'Conservación',
      fields: [
        ['estab_contenedor', 'Estabilidad del contenedor primario'],
        ['estab_alicuota', 'Estabilidad de la muestra alicuotada'],
        ['nota_conservacion', 'Nota de conservación']
      ]
    },
    {
      title: 'Resultado',
      fields: [
        ['tiempo_respuesta', 'Tiempo de respuesta'],
        ['restriccion', 'Restricción'],
        ['valores_criticos', 'Valores críticos'],
        ['valores_referencia', 'Valores de referencia'],
        ['referido_a', 'Referido a'],
        ['indic_otros_centros', 'Indicaciones para otros centros']
      ]
    },
    {
      title: 'Uso clínico',
      fields: [['uso_clinico', 'Uso clínico']]
    },
    {
      title: 'Datos de laboratorio',
      fields: [
        ['division', 'División'],
        ['perfil', 'Perfil'],
        ['codigo_digitacion', 'Código de digitación'],
        ['obs_digitacion', 'Observaciones de digitación'],
        ['equipo_automatizado', 'Equipo automatizado'],
        ['control_externo', 'Control externo'],
        ['control_interno', 'Control interno'],
        ['contacto', 'Contacto'],
        ['revisado_por', 'Revisado por'],
        ['fecha_revision', 'Fecha de revisión']
      ]
    }
  ]);

  const FIELD_LABELS = new Map([['nombre', 'Nombre de la prueba'], ...SECTIONS.flatMap((section) => section.fields)]);
  const FIELD_KEYS = Object.freeze(Array.from(FIELD_LABELS.keys()));
  const CRITICAL_FIELDS = new Set(['valores_criticos', 'restriccion']);
  const WIDE_FIELDS = new Set([
    'nombre', 'uso_clinico', 'prep_paciente', 'indic_paciente', 'proc_toma', 'obs_toma',
    'estab_contenedor', 'estab_alicuota', 'nota_conservacion', 'valores_criticos',
    'valores_referencia', 'referido_a', 'indic_otros_centros', 'obs_digitacion'
  ]);

  const DIVISION_COLORS = Object.freeze({
    'Química Clínica': '#2e6f8e',
    'Hematología': '#8e4a6b',
    'Inmunología': '#0b5d52',
    'Hormonas y Marcadores Tumorales': '#a8652d',
    'Banco de Sangre': '#a13d48',
    'Microbiología': '#5b6f3f',
    'Biología Molecular': '#5a4b8e',
    'Laboratorio Emergencias': '#b23a2e',
    'Banco de Cordón Umbilical': '#3f8fa8'
  });

  const TUBE_RULES = Object.freeze([
    [/edta/i, '#6b4fa0'],
    [/citrat/i, '#4fa9d9'],
    [/heparin/i, '#3f8f5c'],
    [/orina/i, '#d98e2b'],
    [/heces/i, '#7a5230'],
    [/l[ií]quido|lcr|amni[oó]tico/i, '#8b98a0'],
    [/suero/i, '#c0392b']
  ]);

  function cleanText(value, maxLength = MAX_FIELD_LENGTH) {
    return String(value ?? '')
      .replace(/\u0000/g, '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, maxLength);
  }

  function cleanDivision(value) {
    let division = cleanText(value, 180);
    if (division.endsWith(')') && !division.includes('(')) division = division.slice(0, -1).trim();
    return division.replace(/\s{2,}/g, ' ');
  }

  function createId() {
    return global.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeId(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = cleanText(value, 128);
    return text || createId();
  }

  function normalizeTimestamp(value, fallback) {
    const text = cleanText(value, 64);
    const timestamp = Date.parse(text);
    return text && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
  }

  function normalizeTest(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Existe una ficha que no es un objeto válido.');
    const record = { id: normalizeId(input.id) };

    for (const key of FIELD_KEYS) {
      record[key] = key === 'division' ? cleanDivision(input[key]) : cleanText(input[key]);
    }

    if (!record.nombre) throw new Error('Todas las fichas deben incluir el nombre de la prueba.');
    const now = normalizeTimestamp(options.now, new Date().toISOString());
    record.createdAt = normalizeTimestamp(input.createdAt, now);
    record.updatedAt = options.now ? now : normalizeTimestamp(input.updatedAt, record.createdAt);
    if (input.source) record.source = cleanText(input.source, 160);
    return record;
  }

  function normalizeCatalog(list, options = {}) {
    if (!Array.isArray(list)) throw new Error('El archivo no contiene una lista de pruebas.');
    if (list.length === 0 && !options.allowEmpty) throw new Error('El catálogo recibido está vacío.');
    if (list.length > MAX_RECORDS) throw new Error(`El catálogo supera el máximo de ${MAX_RECORDS} registros.`);

    const seen = new Set();
    const now = new Date().toISOString();
    return list.map((item, index) => {
      const record = normalizeTest(item, { now: item?.updatedAt ? undefined : now });
      const key = `${typeof record.id}:${String(record.id)}`;
      if (seen.has(key)) throw new Error(`El identificador de la ficha ${index + 1} está duplicado.`);
      seen.add(key);
      return record;
    });
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      cache: options.cache || 'no-store',
      mode: options.mode || 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`No se pudo descargar el catálogo (${response.status}).`);
    return response.json();
  }

  async function fetchOfficialCatalog() {
    const sources = [
      { url: './data.json', label: 'data.json local', mode: 'same-origin' },
      { url: OFFICIAL_SOURCE_URL, label: OFFICIAL_SOURCE_LABEL, mode: 'cors' }
    ];
    let lastError = null;

    for (const source of sources) {
      try {
        const payload = await fetchJson(source.url, { mode: source.mode });
        const tests = normalizeCatalog(payload);
        return { tests, sourceLabel: source.label, sourceVersion: OFFICIAL_SOURCE_VERSION };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('No se pudo recuperar el catálogo original.');
  }

  async function seedIfEmpty(database) {
    const count = await database.countTests();
    if (count > 0) return { seeded: false, count };
    const catalog = await fetchOfficialCatalog();
    await database.replaceTests(catalog.tests, {
      action: 'carga inicial',
      summary: `Catálogo inicial cargado con ${catalog.tests.length} pruebas.`,
      source: catalog.sourceLabel,
      meta: {
        catalog_source_version: catalog.sourceVersion,
        catalog_source_label: catalog.sourceLabel,
        seeded_at: new Date().toISOString()
      }
    });
    return { seeded: true, count: catalog.tests.length, ...catalog };
  }

  function parseBackupPayload(payload) {
    if (Array.isArray(payload)) {
      return {
        schema: 'legacy-array',
        version: 1,
        sourceLabel: 'Importación heredada',
        tests: normalizeCatalog(payload),
        audit: []
      };
    }
    if (!payload || typeof payload !== 'object') throw new Error('El respaldo no tiene una estructura válida.');
    if (payload.schema !== 'preanalitica-backup' || ![1, 2].includes(Number(payload.version))) {
      throw new Error('El formato o la versión del respaldo no son compatibles.');
    }
    return {
      ...payload,
      tests: normalizeCatalog(payload.tests),
      audit: Array.isArray(payload.audit) ? payload.audit : []
    };
  }

  function normalizeSearch(value) {
    return cleanText(value, 500)
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function matchesQuery(test, query) {
    const normalized = normalizeSearch(query);
    if (!normalized) return true;
    const terms = normalized.split(' ').filter(Boolean);
    return terms.every((term) =>
      FIELD_KEYS.some((key) => normalizeSearch(test[key]).includes(term))
    );
  }

  function divisionName(value) {
    let name = cleanDivision(value).split(/[.\n]/)[0].trim();
    if (name.includes(')')) {
      name = name.split(')')[0].trim();
    }
    return name;
  }

  function divisionColor(name) {
    return DIVISION_COLORS[name] || '#657870';
  }

  function hexToRgba(hex, alpha) {
    const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#657870';
    const number = Number.parseInt(safe.slice(1), 16);
    return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  }

  function tubeColor(sampleType) {
    const value = cleanText(sampleType, 500);
    for (const [pattern, color] of TUBE_RULES) {
      if (pattern.test(value)) {
        return color;
      }
    }
    return '#bdccc6';
  }

  function isCriticalValue(key, value) {
    const clean = cleanText(value);
    return CRITICAL_FIELDS.has(key) && Boolean(clean) && !/^(n\/?a|no aplica|ninguna|ninguno|-|—)\.?$/i.test(clean);
  }

  function formatTestText(test) {
    const lines = [`PRUEBA: ${test.nombre}`];
    if (test.codigo_digitacion) {
      lines.push(`Código: ${test.codigo_digitacion}`);
    }
    if (test.division) {
      lines.push(`División: ${divisionName(test.division)}`);
    }
    if (test.tipo_muestra) {
      lines.push(`Tipo de muestra: ${test.tipo_muestra}`);
    }

    for (const section of SECTIONS) {
      const details = section.fields
        .filter(([key]) => cleanText(test[key]))
        .map(([key, label]) => `- ${label}: ${test[key]}`);
      if (details.length > 0) {
        lines.push('', `[ ${section.title.toUpperCase()} ]`, ...details);
      }
    }
    return lines.join('\n');
  }

  function csvSafe(value) {
    let text = String(value ?? '').replace(/\r?\n/g, ' ');
    if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function catalogToCsv(tests) {
    const headers = FIELD_KEYS.map((key) => FIELD_LABELS.get(key));
    const rows = tests.map((test) => FIELD_KEYS.map((key) => test[key] || ''));
    return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvSafe).join(',')).join('\r\n');
  }

  const api = Object.freeze({
    OFFICIAL_SOURCE_VERSION,
    OFFICIAL_SOURCE_LABEL,
    OFFICIAL_SOURCE_URL,
    SECTIONS,
    FIELD_LABELS,
    FIELD_KEYS,
    WIDE_FIELDS,
    normalizeTest,
    normalizeCatalog,
    fetchOfficialCatalog,
    seedIfEmpty,
    parseBackupPayload,
    normalizeSearch,
    matchesQuery,
    divisionName,
    divisionColor,
    hexToRgba,
    tubeColor,
    isCriticalValue,
    formatTestText,
    catalogToCsv,
    createId
  });

  global.PreanalyticsCatalog = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
