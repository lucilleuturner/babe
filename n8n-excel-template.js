const sheetId = $('берем шаблон').first().json.replies[0].duplicateSheet.properties.sheetId;
const items = $input.all().map(i => i.json);

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return {
    red: ((bigint >> 16) & 255) / 255,
    green: ((bigint >> 8) & 255) / 255,
    blue: (bigint & 255) / 255,
  };
}

const BLUE = hexToRgb('#b4c6e7');
const GREEN = hexToRgb('#c6e0b4');
const BORDER = {
  top: { style: 'SOLID' },
  bottom: { style: 'SOLID' },
  left: { style: 'SOLID' },
  right: { style: 'SOLID' },
};
const COLS = 11; // A..K

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

const requests = [];
// Таблица начинается с 8 строки (первые 7 строк — шапка)
let currentRowIndex = 7; // 0-based row index for the next appended row

// Group items by category while keeping order from input
const groups = [];
const groupMap = new Map();
let currentCategory = null;

function ensureGroup(name) {
  if (!groupMap.has(name)) {
    const group = { name, products: [] };
    groupMap.set(name, group);
    groups.push(group);
  }
  return groupMap.get(name);
}

for (const item of items) {
  if (item.type === 'category') {
    const name = item.original_name_ru || item.name || item.category || 'Без категории';
    currentCategory = name;
    ensureGroup(name);
  } else if (item.type === 'product') {
    const name = item.category || currentCategory || 'Без категории';
    ensureGroup(name).products.push(item);
  }
}

let firstProductRowNumber = null; // 1-based
let lastProductRowNumber = null;  // 1-based

for (const group of groups) {
  // Category row (blue)
  const categoryRow = [];
  for (let c = 0; c < COLS; c++) {
    categoryRow.push(
      cell(
        c === 0 ? { stringValue: group.name } : {},
        {
          backgroundColor: BLUE,
          textFormat: { bold: true },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        }
      )
    );
  }

  appendRow(requests, sheetId, categoryRow, true);
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: currentRowIndex, endIndex: currentRowIndex + 1 },
      properties: { pixelSize: 30 },
      fields: 'pixelSize',
    },
  });
  currentRowIndex++;

  // Product rows
  for (const p of group.products) {
    const rowNumber = currentRowIndex + 1;
    if (!firstProductRowNumber) firstProductRowNumber = rowNumber;
    lastProductRowNumber = rowNumber;

    const qtyValue = typeof p.qty === 'number' ? { numberValue: p.qty } : {};

    const row = [
      cell({ stringValue: p.original_name_ru || '' }), // A
      cell({}), // B
      cell({}), // C
      cell({}), // D
      cell({ stringValue: p.original_name_en || '' }), // E
      cell({}), // F
      cell({ formulaValue: `=F${rowNumber}/$I$4` }), // G
      cell(qtyValue, { backgroundColor: GREEN }), // H
      cell({ formulaValue: `=F${rowNumber}*H${rowNumber}` }), // I
      cell({ formulaValue: `=G${rowNumber}*H${rowNumber}` }), // J
      cell({}), // K
    ];

    appendRow(requests, sheetId, row, true);
    currentRowIndex++;
  }
}

function appendTotalRow(startRow, endRow, useRussianSum = false) {
  const sumFn = useRussianSum ? 'СУММ' : 'SUM';
  const sumFormula = startRow && endRow ? `=${sumFn}(I${startRow}:I${endRow})` : '';
  const totalRow = [];

  for (let c = 0; c < COLS; c++) {
    if (c === 5) {
      totalRow.push(
        cell(
          { stringValue: 'TOTAL SUM' },
          { textFormat: { bold: true } }
        )
      ); // F
    } else if (c === 8) {
      totalRow.push(cell(sumFormula ? { formulaValue: sumFormula } : {})); // I
    } else if (c === 9) {
      totalRow.push(cell({ stringValue: '0,00' })); // J
    } else {
      totalRow.push(cell({}));
    }
  }

  appendRow(requests, sheetId, totalRow, true);
  currentRowIndex++;
}

// Total for main table
const MAIN_SUM_START_ROW = 9; // сумма с 9 строки до последнего товара
appendTotalRow(MAIN_SUM_START_ROW, lastProductRowNumber, true);

// Two empty rows (gap)
for (let i = 0; i < 2; i++) {
  const blankRow = Array.from({ length: COLS }, (_, idx) => ({
    userEnteredValue: idx === 0 ? { stringValue: '' } : {},
  }));
  appendRow(requests, sheetId, blankRow, false);
  currentRowIndex++;
}

// Additional order header row (blue)
const addHeaderRowIndex = currentRowIndex;
const addHeaderRow = [];
for (let c = 0; c < COLS; c++) {
  let text = '';
  if (c === 0) text = 'ДОПОЛНИТЕЛЬНО К ЗАКАЗУ';
  if (c === 1) text = 'Фасовка / Packing';
  if (c === 4) text = 'ADDITIONAL TO ORDER';
  if (c === 10) text = 'COMMENTS';

  const textFormat =
    c === 1 ? { fontFamily: 'Arial', fontSize: 8 } : { bold: true };

  addHeaderRow.push(
    cell(
      text ? { stringValue: text } : {},
      {
        backgroundColor: BLUE,
        textFormat,
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
      }
    )
  );
}

appendRow(requests, sheetId, addHeaderRow, true);
requests.push({
  updateDimensionProperties: {
    range: { sheetId, dimension: 'ROWS', startIndex: addHeaderRowIndex, endIndex: addHeaderRowIndex + 1 },
    properties: { pixelSize: 30 },
    fields: 'pixelSize',
  },
});
requests.push({
  mergeCells: {
    range: {
      sheetId,
      startRowIndex: addHeaderRowIndex,
      endRowIndex: addHeaderRowIndex + 1,
      startColumnIndex: 5, // F
      endColumnIndex: 10,  // J
    },
    mergeType: 'MERGE_ALL',
  },
});
requests.push({
  mergeCells: {
    range: {
      sheetId,
      startRowIndex: addHeaderRowIndex,
      endRowIndex: addHeaderRowIndex + 1,
      startColumnIndex: 1, // B
      endColumnIndex: 4,   // D
    },
    mergeType: 'MERGE_ALL',
  },
});
currentRowIndex++;

// Additional order instruction block (merge across 3 rows to fit text)
const infoRowIndex = currentRowIndex;
const infoRowSpan = 3; // current row + 2 below

for (let r = 0; r < infoRowSpan; r++) {
  const infoRow = [];
  for (let c = 0; c < COLS; c++) {
    let text = '';
    if (r === 0 && c === 0) {
      text =
        'Вы можете указать все необходимые товары в данные поля, которых нет в основном прайс-листе';
    }
    if (r === 0 && c === 4) {
      text =
        'You can specify all necessary goods in these fields, which are not in the main price list';
    }
    infoRow.push(
      cell(
        text ? { stringValue: text } : {},
        text
          ? {
              verticalAlignment: 'MIDDLE',
              horizontalAlignment: 'CENTER',
              wrapStrategy: 'WRAP',
            }
          : {}
      )
    );
  }
  appendRow(requests, sheetId, infoRow, true);
  currentRowIndex++;
}

requests.push({
  mergeCells: {
    range: {
      sheetId,
      startRowIndex: infoRowIndex,
      endRowIndex: infoRowIndex + infoRowSpan,
      startColumnIndex: 0, // A
      endColumnIndex: 4,   // D
    },
    mergeType: 'MERGE_ALL',
  },
});
requests.push({
  mergeCells: {
    range: {
      sheetId,
      startRowIndex: infoRowIndex,
      endRowIndex: infoRowIndex + infoRowSpan,
      startColumnIndex: 4, // E
      endColumnIndex: 7,   // G
    },
    mergeType: 'MERGE_ALL',
  },
});
requests.push({
  mergeCells: {
    range: {
      sheetId,
      startRowIndex: infoRowIndex,
      endRowIndex: infoRowIndex + infoRowSpan,
      startColumnIndex: 7, // H
      endColumnIndex: 11,  // K
    },
    mergeType: 'MERGE_ALL',
  },
});

// Additional table input rows
let addFirstRowNumber = null;
let addLastRowNumber = null;

for (let i = 0; i < 10; i++) {
  const rowNumber = currentRowIndex + 1;
  if (!addFirstRowNumber) addFirstRowNumber = rowNumber;
  addLastRowNumber = rowNumber;

  const row = [
    cell({}), // A
    cell({}), // B
    cell({}), // C
    cell({}), // D
    cell({}), // E
    cell({}), // F
    cell({ formulaValue: `=F${rowNumber}/$I$4` }), // G
    cell({}, { backgroundColor: GREEN }), // H
    cell({ formulaValue: `=F${rowNumber}*H${rowNumber}` }), // I
    cell({ formulaValue: `=G${rowNumber}*H${rowNumber}` }), // J
    cell({}), // K
  ];

  appendRow(requests, sheetId, row, true);
  currentRowIndex++;
}

// Total for additional table
appendTotalRow(addFirstRowNumber, addLastRowNumber, true);

return [{ json: { requests } }];
