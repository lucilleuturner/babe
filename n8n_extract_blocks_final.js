// Код для Code Node в n8n
// Извлекает блоки товаров по селекторам #product-item-*
// Работает без дополнительных библиотек

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

if (productIds.length === 0) {
  return [{ 
    json: { 
      error: 'No product blocks found with id="product-item-*"',
      debug: {
        htmlLength: htmlContent.length,
        sample: htmlContent.substring(0, 500)
      }
    } 
  }];
}

// Извлекаем HTML блоки для каждого товара
const productBlocks = [];

for (const productId of productIds) {
  // Экранируем ID для использования в регулярном выражении
  const escapedId = productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Ищем открывающий тег с нужным ID
  // Паттерн: <tagName ... id="product-item-123" ...>
  const openTagPattern = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)[^>]*id=["']${escapedId}["'][^>]*>`, 'i');
  const openTagMatch = htmlContent.match(openTagPattern);
  
  if (!openTagMatch) {
    continue;
  }
  
  const tagName = openTagMatch[1]; // Название тега (div, article, li, etc.)
  const fullOpenTag = openTagMatch[0];
  const startPos = htmlContent.indexOf(fullOpenTag);
  
  if (startPos === -1) {
    continue;
  }
  
  // Проверяем, самозакрывающийся ли это тег (например, <img />)
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
  
  // Ищем соответствующий закрывающий тег, учитывая вложенность
  let pos = startPos + fullOpenTag.length;
  let depth = 1;
  let endPos = -1;
  
  // Упрощённый алгоритм поиска закрывающего тега
  while (pos < htmlContent.length && depth > 0) {
    // Ищем следующий закрывающий тег
    const closeTag = `</${tagName}>`;
    const nextClosePos = htmlContent.indexOf(closeTag, pos);
    
    if (nextClosePos === -1) {
      // Не нашли закрывающий тег, берём до конца документа
      endPos = htmlContent.length;
      break;
    }
    
    // Проверяем, есть ли вложенные открывающие теги до закрывающего
    const section = htmlContent.substring(pos, nextClosePos);
    const nestedOpenTags = section.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi'));
    const nestedCount = nestedOpenTags ? nestedOpenTags.length : 0;
    
    if (nestedCount === 0) {
      // Нет вложенных тегов, это наш закрывающий тег
      endPos = nextClosePos + closeTag.length;
      break;
    } else {
      // Есть вложенные теги, пропускаем этот закрывающий и продолжаем поиск
      depth += nestedCount - 1;
      pos = nextClosePos + closeTag.length;
    }
  }
  
  if (endPos === -1) {
    endPos = htmlContent.length;
  }
  
  // Извлекаем HTML блока
  const blockHtml = htmlContent.substring(startPos, endPos);
  
  productBlocks.push({
    json: {
      productId: productId,
      html: blockHtml,
      numericId: productId.replace('product-item-', '')
    }
  });
}

if (productBlocks.length === 0) {
  return [{ 
    json: { 
      error: 'Could not extract product blocks HTML',
      foundIds: productIds,
      htmlLength: htmlContent.length
    } 
  }];
}

return productBlocks;
