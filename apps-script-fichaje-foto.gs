/**
 * FICHAJE FOTO → SHEETS
 * Apps Script que hace de proxy seguro a Claude API (la key NUNCA va en el HTML)
 * y guarda los datos verificados en Google Sheets.
 *
 * CONFIGURACIÓN OBLIGATORIA ANTES DE DESPLEGAR:
 * 1. Cambia SHEET_ID por el ID de tu Google Sheet nuevo
 * 2. Ve a Configuración del proyecto (engranaje) → Propiedades del script
 *    → Añadir propiedad: clave = CLAUDE_API_KEY, valor = tu key de Anthropic
 * 3. Implementar → Nueva implementación → Aplicación web
 *    → Ejecutar como: Yo / Acceso: Cualquier usuario
 * 4. IMPORTANTE: tras cualquier cambio de código, crea una implementación NUEVA
 *    (no basta con guardar). Lección aprendida del proyecto Vudú.
 */

const CONFIG = {
  SHEET_ID: 'PEGA_AQUI_EL_ID_DE_TU_SHEET',
  SHEET_NAME: 'FICHAJES',
  CLAUDE_MODEL: 'claude-sonnet-4-6',
  MAX_TOKENS: 4000
};

const HEADERS = [
  'SEMANA', 'NOMBRE', 'HORAS CONTRATO',
  'L-DIA', 'L-NOC', 'M-DIA', 'M-NOC', 'X-DIA', 'X-NOC',
  'J-DIA', 'J-NOC', 'V-DIA', 'V-NOC', 'S-DIA', 'S-NOC',
  'D-DIA', 'D-NOC', 'TOT DIA', 'TOT NOCHE'
];

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'Cuerpo de petición inválido' });
  }
  try {
    if (body.action === 'extract') return extractFromPhoto(body);
    if (body.action === 'save') return saveToSheet(body);
    return json({ ok: false, error: 'Acción desconocida: ' + body.action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Permite comprobar que el despliegue está vivo visitando la URL en el navegador
function doGet() {
  return json({ ok: true, info: 'Fichaje Foto API operativa' });
}

/* ============ EXTRACCIÓN CON CLAUDE VISIÓN ============ */

function extractFromPhoto(body) {
  const key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!key) return json({ ok: false, error: 'Falta CLAUDE_API_KEY en Propiedades del script' });
  if (!body.image) return json({ ok: false, error: 'No se ha recibido imagen' });

  const prompt = [
    'Extrae la tabla de fichajes de esta foto de una hoja de papel rellenada a mano.',
    '',
    'ESTRUCTURA DE LA HOJA:',
    '- Cada fila es un empleado. La columna NOMBRE y la columna HORAS (horas de contrato semanal) están impresas.',
    '- Después hay 7 días (LUNES a DOMINGO) y cada día tiene DOS subcolumnas: DIA y NOCHE.',
    '- Las celdas de los días están rellenadas a mano con bolígrafo.',
    '- Arriba puede haber una fecha escrita a mano (ej. "1/06").',
    '',
    'CÓMO INTERPRETAR LAS CELDAS MANUSCRITAS:',
    '- Una raya "—" o celda vacía = no trabajó: usa null',
    '- Un número = horas trabajadas (puede tener decimales con coma: "2,5" significa 2.5): usa el número',
    '- "Sí" / "Si" / "SI" en cualquier variante: usa el texto "SI"',
    '- Si hay un tachón o corrección, usa el valor final corregido',
    '- Si una celda existe pero no puedes leerla con seguridad, usa "?"',
    '- Si la foto no llega a mostrar algunos días, usa null en esos días',
    '',
    'Incluye TODOS los empleados, también los que estén añadidos a mano fuera de la lista impresa.',
    '',
    'Responde SOLO con JSON válido, sin markdown ni explicaciones, con esta estructura exacta:',
    '{"fecha":"1/06","empleados":[{"nombre":"PABLO GONZ","horas":24,"dias":{"L":{"d":null,"n":null},"M":{"d":2,"n":3},"X":{"d":null,"n":null},"J":{"d":null,"n":null},"V":{"d":null,"n":null},"S":{"d":null,"n":null},"D":{"d":null,"n":null}}}]}'
  ].join('\n');

  const payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: body.mediaType || 'image/jpeg', data: body.image } },
        { type: 'text', text: prompt }
      ]
    }]
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  let data;
  try { data = JSON.parse(res.getContentText()); } catch (e2) {
    return json({ ok: false, error: 'Respuesta no válida de Claude API (HTTP ' + code + ')' });
  }
  if (code !== 200) {
    const msg = (data.error && data.error.message) ? data.error.message : 'HTTP ' + code;
    return json({ ok: false, error: 'Claude API: ' + msg });
  }

  let text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n');
  text = text.replace(/```json|```/g, '').trim();

  let parsed;
  try { parsed = JSON.parse(text); } catch (e3) {
    return json({ ok: false, error: 'Claude no devolvió JSON válido. Reintenta con mejor foto.', raw: text.substring(0, 500) });
  }
  if (!parsed.empleados || !parsed.empleados.length) {
    return json({ ok: false, error: 'No se han detectado empleados en la foto' });
  }
  return json({ ok: true, data: parsed });
}

/* ============ GUARDADO EN SHEETS ============ */

function saveToSheet(body) {
  if (!body.rows || !body.rows.length) return json({ ok: false, error: 'No hay filas que guardar' });

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    // Columna SEMANA como texto plano: evita que Sheets convierta "1/06" en fecha rara
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0e6655').setFontColor('#ffffff');
  }

  const DAY_KEYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const out = body.rows.map(function (r) {
    let totD = 0, totN = 0;
    const cells = [];
    DAY_KEYS.forEach(function (k) {
      const d = r.dias && r.dias[k] ? r.dias[k] : { d: null, n: null };
      cells.push(cellValue(d.d));
      cells.push(cellValue(d.n));
      if (typeof d.d === 'number') totD += d.d;
      if (typeof d.n === 'number') totN += d.n;
    });
    return [String(body.semana || ''), r.nombre || '', numOrBlank(r.horas)]
      .concat(cells)
      .concat([round1(totD), round1(totN)]);
  });

  sh.getRange(sh.getLastRow() + 1, 1, out.length, HEADERS.length).setValues(out);
  return json({ ok: true, saved: out.length });
}

function cellValue(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return v;
  return String(v).toUpperCase(); // "SI", "?"
}
function numOrBlank(v) { return (typeof v === 'number') ? v : (v ? String(v) : ''); }
function round1(n) { return Math.round(n * 10) / 10; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
