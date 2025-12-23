// Код для Code Node в n8n
// Извлекает блоки товаров по селекторам #product-item-*
// Версия с подробной отладкой

// Получаем HTML из бинарных данных
const htmlContent = $input.item.binary?.data 
  ? Buffer.from($input.item.binary.data, 'base64').toString('utf-8')
  : $input.item.json?.html || $input.item.json?.data || '';

if (!htmlContent) {
  return [{ json: { error: 'No HTML content found' } }];
}

// Находим ВСЕ ID товаров (включая дубликаты для отладки)
const idPattern = /id=["'](product-item-\d+)["']/gi;
const allMatches = [];
let match;

while ((match = idPattern.exec(htmlContent)) !== null) {
  allMatches.push({
    id: match[1],
    position: match.index,
    context: htmlContent.substring(Math.max(0, match.index - 50), Math.min(htmlContent.length, match.index + 200))
  });
}

// Уникальные ID
const uniqueIds = [...new Set(allMatches.map(m => m.id))];

// Извлекаем блоки - используем простой метод: от одного ID до следующего
const productBlocks = [];
const processedIds = new Set();

// Сортируем по позиции
allMatches.sort((a, b) => a.position - b.position);

for (let i = 0; i < allMatches.length; i++) {
  const currentMatch = allMatches[i];
  
  // Пропускаем дубликаты (берём только первое вхождение каждого ID)
  if (processedIds.has(currentMatch.id)) {
    continue;
  }
  processedIds.add(currentMatch.id);
  
  // Находим начало тега
  let tagStart = currentMatch.position;
  while (tagStart > 0 && htmlContent[tagStart] !== '<') {
    tagStart--;
  }
  
  // Определяем конец блока
  let endPos;
  
  if (i < allMatches.length - 1) {
    // Есть следующий товар - берём до его начала
    const nextMatch = allMatches[i + 1];
    let nextTagStart = nextMatch.position;
    while (nextTagStart > 0 && htmlContent[nextTagStart] !== '<') {
      nextTagStart--;
    }
    endPos = nextTagStart;
  } else {
    // Последний товар - берём до конца или до лимита
    endPos = Math.min(tagStart + 30000, htmlContent.length);
  }
  
  // Извлекаем HTML
  const blockHtml = htmlContent.substring(tagStart, endPos);
  
  // Проверяем, что блок содержит ID
  if (!blockHtml.includes(currentMatch.id)) {
    continue;
  }
  
  productBlocks.push({
    json: {
      productId: currentMatch.id,
      html: blockHtml,
      numericId: currentMatch.id.replace('product-item-', ''),
      blockLength: blockHtml.length,
      startPosition: tagStart,
      endPosition: endPos
    }
  });
}

// Создаём отладочный элемент
const debugInfo = {
  totalMatchesFound: allMatches.length,
  uniqueIdsFound: uniqueIds.length,
  successfullyExtracted: productBlocks.length,
  htmlLength: htmlContent.length,
  sampleIds: uniqueIds.slice(0, 10),
  extractionRate: productBlocks.length > 0 ? ((productBlocks.length / uniqueIds.length) * 100).toFixed(2) + '%' : '0%'
};

// Добавляем отладку к первому элементу
if (productBlocks.length > 0) {
  productBlocks[0].json._debug = debugInfo;
} else {
  // Если ничего не извлекли, возвращаем только отладочную информацию
  return [{
    json: {
      error: 'No blocks extracted',
      debug: debugInfo,
      firstFewMatches: allMatches.slice(0, 5)
    }
  }];
}

return productBlocks;
