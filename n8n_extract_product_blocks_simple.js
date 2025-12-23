// Код для Code Node в n8n
// Извлекает блоки товаров по селекторам #product-item-*
// Упрощённая и более надёжная версия

// Получаем HTML из бинарных данных
const htmlContent = $input.item.binary?.data 
  ? Buffer.from($input.item.binary.data, 'base64').toString('utf-8')
  : $input.item.json?.html || $input.item.json?.data || '';

if (!htmlContent) {
  return [{ json: { error: 'No HTML content found' } }];
}

// Метод 1: Используем cheerio, если доступен (более надёжно)
try {
  const cheerio = require('cheerio');
  const $cheerio = cheerio.load(htmlContent);
  
  // Находим все элементы с ID начинающимся с product-item-
  const productBlocks = [];
  
  $cheerio('[id^="product-item-"]').each((index, element) => {
    const productId = $cheerio(element).attr('id');
    const blockHtml = $cheerio.html(element);
    
    productBlocks.push({
      json: {
        productId: productId,
        html: blockHtml,
        numericId: productId ? productId.replace('product-item-', '') : null
      }
    });
  });
  
  if (productBlocks.length > 0) {
    return productBlocks;
  }
} catch (e) {
  // Если cheerio недоступен, используем регулярные выражения
  // Продолжаем выполнение
}

// Метод 2: Используем регулярные выражения (работает без дополнительных библиотек)
// Находим все ID товаров
const idPattern = /id=["'](product-item-\d+)["']/gi;
const productIds = [];
let match;

while ((match = idPattern.exec(htmlContent)) !== null) {
  if (!productIds.includes(match[1])) {
    productIds.push(match[1]);
  }
}

if (productIds.length === 0) {
  return [{ 
    json: { 
      error: 'No product blocks found with id="product-item-*"',
      debug: {
        htmlLength: htmlContent.length,
        sample: htmlContent.substring(0, 1000)
      }
    } 
  }];
}

// Извлекаем HTML блоки для каждого товара
const productBlocks = [];

for (const productId of productIds) {
  // Экранируем специальные символы для регулярного выражения
  const escapedId = productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Паттерн для поиска открывающего тега с нужным ID
  // Ищем тег вида: <div id="product-item-123" ...> или <article id="product-item-123" ...>
  const openTagPattern = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)[^>]*id=["']${escapedId}["'][^>]*>`, 'i');
  const openTagMatch = htmlContent.match(openTagPattern);
  
  if (!openTagMatch) {
    continue;
  }
  
  const tagName = openTagMatch[1]; // Название тега (div, article, etc.)
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
  
  // Ищем соответствующий закрывающий тег
  // Нужно учитывать вложенность тегов
  let pos = startPos + fullOpenTag.length;
  let depth = 1;
  let endPos = -1;
  
  while (pos < htmlContent.length && depth > 0) {
    // Ищем открывающие и закрывающие теги с таким же именем
    const openPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi');
    const closePattern = new RegExp(`</${tagName}>`, 'gi');
    
    // Упрощённый подход: ищем первый закрывающий тег после открывающего
    const nextClose = htmlContent.indexOf(`</${tagName}>`, pos);
    
    if (nextClose === -1) {
      // Не нашли закрывающий тег, берём до конца документа
      endPos = htmlContent.length;
      break;
    }
    
    // Проверяем, нет ли вложенных открывающих тегов до закрывающего
    const beforeClose = htmlContent.substring(pos, nextClose);
    const nestedOpens = (beforeClose.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi')) || []).length;
    
    if (nestedOpens === 0) {
      endPos = nextClose + `</${tagName}>`.length;
      break;
    } else {
      // Есть вложенные теги, ищем следующий закрывающий
      pos = nextClose + `</${tagName}>`.length;
      depth += nestedOpens - 1;
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
