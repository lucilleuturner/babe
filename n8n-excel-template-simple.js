const sheetId = $('берем шаблон').first().json.replies[0].duplicateSheet.properties.sheetId;
const items = $input.all().map(i => i.json);

// Функция нормализации фасовки
function normalizeUnit(value) {
  if (!value || value === "0,000") return '';
  const v = value.toLowerCase().replace(/\s+/g, '');
  if (v.includes('кг')) return 'кг';
  if (v.includes('шт')) return 'шт';
  if (v.includes('уп')) return 'уп';
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#',''), 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return { red: r, green: g, blue: b };
}

const BLUE = hexToRgb('#b4c6e7');
const GREEN = hexToRgb('#c6e0b4');
const BORDER = {
  top: { style: 'SOLID' },
  bottom: { style: 'SOLID' },
  left: { style: 'SOLID' },
  right: { style: 'SOLID' },
};
const COLS = 7; // A..G

function cell(value = {}, format = {}) {
  return {
    userEnteredValue: value,
    userEnteredFormat: { ...format, borders: BORDER },
  };
}

function appendRow(requests, sheetId, values, withFormat = true) {
  requests.push({
    appendCells: {
      sheetId,
      rows: [{ values }],
      fields: withFormat ? 'userEnteredValue,userEnteredFormat' : 'userEnteredValue',
    },
  });
}

function appendBlankRow(requests, sheetId) {
  const values = Array.from({ length: COLS }, (_, idx) => ({
    userEnteredValue: idx === 0 ? { stringValue: '' } : {},
  }));
  appendRow(requests, sheetId, values, false);
}

// Группируем по категориям
const grouped = {};
for (const p of items) {
  const cat = p.category || 'Без категории';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(p);
}

const requests = [];
let currentRowIndex = 5; // 6-я строка

let firstProductRow = null;
let lastProductRow = null;

function appendTotalRow(startRow, endRow) {
  const sumFormula = (startRow && endRow) ? `=СУММ(F${startRow}:F${endRow})` : '';
  const row = [];
  for (let c = 0; c < COLS; c++) {
    if (c === 4) { // E
      row.push(cell({ stringValue: 'ИТОГО' }, { textFormat: { bold: true } }));
    } else if (c === 5) { // F
      row.push(cell(sumFormula ? { formulaValue: sumFormula } : {}));
    } else {
      row.push(cell({}));
    }
  }
  appendRow(requests, sheetId, row, true);
  currentRowIndex++;
}

for (const category of Object.keys(grouped)) {
  // Категория
  const catRow = [];
  for (let c = 0; c < COLS; c++) {
    catRow.push(cell(
      c === 0 ? { stringValue: category.toUpperCase() } : {},
      {
        backgroundColor: BLUE,
        textFormat: { bold: true, fontFamily: 'Arial', fontSize: 12 },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
      }
    ));
  }

  appendRow(requests, sheetId, catRow, true);

  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: currentRowIndex, endIndex: currentRowIndex + 1 },
      properties: { pixelSize: 30 },
      fields: 'pixelSize',
    },
  });
  currentRowIndex++;

  // Товары
  for (const p of grouped[category]) {
    const rowNumber = currentRowIndex + 1;
    if (!firstProductRow) firstProductRow = rowNumber;
    lastProductRow = rowNumber;

    const priceNum = toNumber(p.price_final);

    const row = [
      cell({ stringValue: p.name || '' }), // A
      cell({}), // B
      cell(
        { stringValue: normalizeUnit(p.weight) },
        { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }
      ), // C
      cell(
        priceNum !== null ? { numberValue: priceNum } : {},
        { horizontalAlignment: 'CENTER' }
      ), // D
      cell({}, { backgroundColor: GREEN }), // E
      cell({ formulaValue: `=D${rowNumber}*E${rowNumber}` }), // F
      cell({}), // G
    ];

    appendRow(requests, sheetId, row, true);
    currentRowIndex++;
  }
}

// ИТОГО основной таблицы
appendTotalRow(firstProductRow, lastProductRow);

// Два пустых ряда между таблицами
appendBlankRow(requests, sheetId);
appendBlankRow(requests, sheetId);
currentRowIndex += 2;

// Дополнительная таблица
const addHeaderRow = [
  cell(
    { stringValue: 'ДОПОЛНИТЕЛЬНО К ЗАКАЗУ' },
    { backgroundColor: BLUE, textFormat: { bold: true }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }
  ),
  cell(
    { stringValue: 'Фасовка' },
    { backgroundColor: BLUE, textFormat: { fontFamily: 'Arial', fontSize: 8 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }
  ),
  cell({}, { backgroundColor: BLUE }),
  cell({}, { backgroundColor: BLUE }),
  cell({}, { backgroundColor: BLUE }),
  cell({}, { backgroundColor: BLUE }),
  cell(
    { stringValue: 'КОММЕНТАРИИ' },
    { backgroundColor: BLUE, textFormat: { bold: true }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }
  ),
];

appendRow(requests, sheetId, addHeaderRow, true);

requests.push({
  mergeCells: {
    range: {
      sheetId,
      startRowIndex: currentRowIndex,
      endRowIndex: currentRowIndex + 1,
      startColumnIndex: 1, // B
      endColumnIndex: 3,   // C
    },
    mergeType: 'MERGE_ALL',
  },
});

requests.push({
  updateDimensionProperties: {
    range: { sheetId, dimension: 'ROWS', startIndex: currentRowIndex, endIndex: currentRowIndex + 1 },
    properties: { pixelSize: 30 },
    fields: 'pixelSize',
  },
});
currentRowIndex++;

// 10 строк с границами
const addFirstRow = currentRowIndex + 1;
for (let i = 0; i < 10; i++) {
  const rowNumber = currentRowIndex + 1;
  const row = [
    cell({}), // A
    cell({}), // B
    cell({}), // C
    cell({}), // D
    cell({}, { backgroundColor: GREEN }), // E
    cell({ formulaValue: `=D${rowNumber}*E${rowNumber}` }), // F
    cell({}), // G
  ];
  appendRow(requests, sheetId, row, true);
  currentRowIndex++;
}
const addLastRow = currentRowIndex;

// ИТОГО дополнительной таблицы
appendTotalRow(addFirstRow, addLastRow);

return [{ json: { requests } }];
