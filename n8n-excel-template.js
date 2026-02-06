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
const COLS = 21; // A..U

const COL_A = 0;
const COL_B = 1;
const COL_C = 2;
const COL_D = 3;
const COL_E = 4;
const COL_F = 5;
const COL_G = 6;
const COL_H = 7;
const COL_I = 8;
const COL_J = 9;
const COL_K = 10;
const COL_L = 11;
const COL_M = 12;
const COL_N = 13;
const COL_O = 14;
const COL_P = 15;
const COL_Q = 16;
const COL_R = 17;
const COL_S = 18;
const COL_T = 19;
const COL_U = 20;

function borderForColumn(colIndex) {
  const border = {
    top: BORDER.top,
    bottom: BORDER.bottom,
    left: BORDER.left,
    right: BORDER.right,
  };

  if (colIndex === COL_M || colIndex === COL_P || colIndex === COL_S) {
    border.left = { style: 'SOLID_MEDIUM' };
  }
  if (colIndex === COL_O || colIndex === COL_R || colIndex === COL_U) {
    border.right = { style: 'SOLID_MEDIUM' };
  }

  return border;
}

function cell(value = {}, format = {}, borders = BORDER) {
  return {
    userEnteredValue: value,
    userEnteredFormat: { ...format, borders },
  };
}

function makeEmptyRow() {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    row.push(cell({}, {}, borderForColumn(c)));
  }
  return row;
}

function setCell(row, colIndex, value = {}, format = {}) {
  row[colIndex] = cell(value, format, borderForColumn(colIndex));
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
        c === COL_A ? { stringValue: group.name } : {},
        {
          backgroundColor: BLUE,
          textFormat: { bold: true },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
        borderForColumn(c)
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

    const row = makeEmptyRow();

    setCell(row, COL_A, { stringValue: p.original_name_ru || '' });
    setCell(row, COL_E, { stringValue: p.original_name_en || '' });
    setCell(row, COL_G, { formulaValue: `=F${rowNumber}/$I$4` });
    setCell(row, COL_H, qtyValue, { backgroundColor: GREEN });
    setCell(row, COL_I, { formulaValue: `=F${rowNumber}*H${rowNumber}` });
    setCell(row, COL_J, { formulaValue: `=G${rowNumber}*H${rowNumber}` });

    setCell(row, COL_M, { stringValue: p.v1_name || '' });
    setCell(row, COL_N, { stringValue: p.v1_weight || '' });
    setCell(row, COL_O, { stringValue: p.v1_price || '' });
    setCell(row, COL_P, { stringValue: p.v2_name || '' });
    setCell(row, COL_Q, { stringValue: p.v2_weight || '' });
    setCell(row, COL_R, { stringValue: p.v2_price || '' });
    setCell(row, COL_S, { stringValue: p.v3_name || '' });
    setCell(row, COL_T, { stringValue: p.v3_weight || '' });
    setCell(row, COL_U, { stringValue: p.v3_price || '' });

    appendRow(requests, sheetId, row, true);
    currentRowIndex++;
  }
}

function appendTotalRow(startRow, endRow, useRussianSum = false) {
  const sumFn = useRussianSum ? 'СУММ' : 'SUM';
  const sumFormula = startRow && endRow ? `=${sumFn}(I${startRow}:I${endRow})` : '';
  const totalRow = [];

  for (let c = 0; c < COLS; c++) {
    if (c === COL_F) {
      totalRow.push(
        cell(
          { stringValue: 'TOTAL SUM' },
          { textFormat: { bold: true } },
          borderForColumn(c)
        )
      );
    } else if (c === COL_I) {
      totalRow.push(
        cell(
          sumFormula ? { formulaValue: sumFormula } : {},
          {},
          borderForColumn(c)
        )
      );
    } else if (c === COL_J) {
      totalRow.push(
        cell(
          { stringValue: '0,00' },
          {},
          borderForColumn(c)
        )
      );
    } else {
      totalRow.push(cell({}, {}, borderForColumn(c)));
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
  if (c === COL_A) text = 'ДОПОЛНИТЕЛЬНО К ЗАКАЗУ';
  if (c === COL_B) text = 'Фасовка / Packing';
  if (c === COL_E) text = 'ADDITIONAL TO ORDER';
  if (c === COL_K) text = 'COMMENTS';

  const textFormat =
    c === COL_B ? { fontFamily: 'Arial', fontSize: 8 } : { bold: true };

  addHeaderRow.push(
    cell(
      text ? { stringValue: text } : {},
      {
        backgroundColor: BLUE,
        textFormat,
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
      },
      borderForColumn(c)
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
          : {},
        borderForColumn(c)
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
const ADD_ROWS = 10;
const addFirstRowNumber = currentRowIndex + 1;
const addLastRowNumber = currentRowIndex + ADD_ROWS;

for (let i = 0; i < ADD_ROWS; i++) {
  const rowNumber = addFirstRowNumber + i;

  const row = makeEmptyRow();
  setCell(row, COL_G, { formulaValue: `=F${rowNumber}/$I$4` });
  setCell(row, COL_H, {}, { backgroundColor: GREEN });
  setCell(row, COL_I, { formulaValue: `=F${rowNumber}*H${rowNumber}` });
  setCell(row, COL_J, { formulaValue: `=G${rowNumber}*H${rowNumber}` });

  appendRow(requests, sheetId, row, true);
  currentRowIndex++;
}

// Total for additional table
appendTotalRow(addFirstRowNumber, addLastRowNumber, true);

return [{ json: { requests } }];
