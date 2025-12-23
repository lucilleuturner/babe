// Код для Code Node в n8n
// Извлекает блоки товаров по селекторам #product-item-*
// Улучшенная версия с более надёжной логикой

// Получаем HTML из бинарных данных
const htmlContent = $input.item.binary?.data 
  ? Buffer.from($input.item.binary.data, 'base64').toString('utf-8')
  : $input.item.json?.html || $input.item.json?.data || '';

if (!htmlContent) {
  return [{ json: { error: 'No HTML content found' } }];
}

// Находим все ID товаров вида product-item-XXXXX
const idPattern = /id=["'](product-item-\d+)["']/gi;
const productIds = [];
let match;

while ((match = idPattern.exec(htmlContent)) !== null) {
  const productId = match[1];
  if (!productIds.includes(productId)) {
    productIds.push(productId);
  }
}

// Отладочная информация
const debugInfo = {
  totalIdsFound: productIds.length,
  htmlLength: htmlContent.length
};

if (productIds.length === 0) {
  return [{ 
    json: { 
      error: 'No product blocks found with id="product-item-*"',
      debug: debugInfo
    } 
  }];
}

// Извлекаем HTML блоки для каждого товара
const productBlocks = [];
const failedIds = [];

for (let i = 0; i < productIds.length; i++) {
  const productId = productIds[i];
  
  // Экранируем ID для использования в регулярном выражении
  const escapedId = productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Ищем открывающий тег с нужным ID
  const openTagPattern = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)[^>]*id=["']${escapedId}["'][^>]*>`, 'i');
  const openTagMatch = htmlContent.match(openTagPattern);
  
  if (!openTagMatch) {
    failedIds.push({ id: productId, reason: 'Open tag not found' });
    continue;
  }
  
  const tagName = openTagMatch[1];
  const fullOpenTag = openTagMatch[0];
  const startPos = htmlContent.indexOf(fullOpenTag);
  
  if (startPos === -1) {
    failedIds.push({ id: productId, reason: 'Start position not found' });
    continue;
  }
  
  // Проверяем, самозакрывающийся ли это тег
  if (fullOpenTag.trim().endsWith('/>')) {
    productBlocks.push({
      json: {
        productId: productId,
        html: fullOpenTag,
        numericId: productId.replace('product-item-', '')
      }
    });
    continue;
  }
  
  // УЛУЧШЕННАЯ ЛОГИКА: Ищем закрывающий тег более надёжным способом
  // Вариант 1: Ищем до следующего product-item- (если товары идут подряд)
  const nextProductPattern = /id=["']product-item-\d+["']/gi;
  nextProductPattern.lastIndex = startPos + fullOpenTag.length;
  const nextProductMatch = nextProductPattern.exec(htmlContent);
  
  let endPos = -1;
  
  if (nextProductMatch) {
    // Есть следующий товар - ищем закрывающий тег до него
    const nextProductStart = htmlContent.lastIndexOf('<', nextProductMatch.index);
    
    // Ищем закрывающий тег нашего товара между текущей позицией и следующим товаром
    let searchEnd = nextProductStart;
    let pos = startPos + fullOpenTag.length;
    let depth = 1;
    
    while (pos < searchEnd && depth > 0) {
      const closeTag = `</${tagName}>`;
      const nextClosePos = htmlContent.indexOf(closeTag, pos);
      
      if (nextClosePos === -1 || nextClosePos >= searchEnd) {
        // Не нашли закрывающий тег до следующего товара
        // Берём до начала следующего товара
        endPos = searchEnd;
        break;
      }
      
      // Проверяем вложенность
      const section = htmlContent.substring(pos, nextClosePos);
      const nestedOpens = (section.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi')) || []).length;
      
      if (nestedOpens === 0) {
        endPos = nextClosePos + closeTag.length;
        break;
      } else {
        depth += nestedOpens - 1;
        pos = nextClosePos + closeTag.length;
      }
    }
  }
  
  // Вариант 2: Если не нашли следующий товар или не удалось найти закрывающий тег
  if (endPos === -1) {
    // Ищем закрывающий тег стандартным способом
    let pos = startPos + fullOpenTag.length;
    let depth = 1;
    const maxSearchLength = Math.min(htmlContent.length, startPos + 50000); // Ограничение поиска
    
    while (pos < maxSearchLength && depth > 0) {
      const closeTag = `</${tagName}>`;
      const nextClosePos = htmlContent.indexOf(closeTag, pos);
      
      if (nextClosePos === -1) {
        // Не нашли закрывающий тег
        // Пробуем найти по другому признаку или берём большой кусок
        // Ищем до следующего product-item- или до конца
        const nextIdPos = htmlContent.indexOf('id="product-item-', pos);
        if (nextIdPos !== -1) {
          // Идём назад до начала тега
          let tagStart = nextIdPos;
          while (tagStart > startPos && htmlContent[tagStart] !== '<') {
            tagStart--;
          }
          endPos = tagStart;
        } else {
          endPos = Math.min(pos + 10000, htmlContent.length); // Берём следующий 10KB
        }
        break;
      }
      
      // Проверяем вложенность
      const section = htmlContent.substring(pos, nextClosePos);
      const nestedOpens = (section.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi')) || []).length;
      
      if (nestedOpens === 0) {
        endPos = nextClosePos + closeTag.length;
        break;
      } else {
        depth += nestedOpens - 1;
        pos = nextClosePos + closeTag.length;
      }
    }
  }
  
  if (endPos === -1 || endPos <= startPos) {
    failedIds.push({ id: productId, reason: 'Could not find end position' });
    continue;
  }
  
  // Извлекаем HTML блока
  const blockHtml = htmlContent.substring(startPos, endPos);
  
  // Проверяем, что блок не пустой и содержит ID
  if (blockHtml.length < 50 || !blockHtml.includes(productId)) {
    failedIds.push({ id: productId, reason: 'Invalid block extracted', blockLength: blockHtml.length });
    continue;
  }
  
  productBlocks.push({
    json: {
      productId: productId,
      html: blockHtml,
      numericId: productId.replace('product-item-', ''),
      blockLength: blockHtml.length
    }
  });
}

// Добавляем отладочную информацию в первый элемент
if (productBlocks.length > 0) {
  productBlocks[0].json._debug = {
    totalIdsFound: productIds.length,
    successfullyExtracted: productBlocks.length,
    failed: failedIds.length,
    failedIds: failedIds.slice(0, 5) // Первые 5 неудачных для отладки
  };
}

if (productBlocks.length === 0) {
  return [{ 
    json: { 
      error: 'Could not extract any product blocks',
      debug: {
        ...debugInfo,
        failedIds: failedIds.slice(0, 10)
      }
    } 
  }];
}

return productBlocks;
