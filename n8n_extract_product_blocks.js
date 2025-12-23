// Код для Code Node в n8n
// Извлекает блоки товаров по селекторам #product-item-*

// Получаем HTML из бинарных данных (если используется Read Binary Files)
const htmlContent = $input.item.binary?.data 
  ? Buffer.from($input.item.binary.data, 'base64').toString('utf-8')
  : $input.item.json?.html || $input.item.json?.data || '';

if (!htmlContent) {
  return [{ json: { error: 'No HTML content found' } }];
}

// Вариант 1: Использование регулярного выражения для поиска блоков товаров
// Ищем все элементы с id="product-item-XXXXX" и извлекаем их HTML
const productBlockPattern = /<[^>]*id=["']product-item-\d+["'][^>]*>.*?<\/[^>]+>/gis;

// Более точный паттерн: находим открывающий тег с id="product-item-..." и соответствующий закрывающий тег
// Это сложнее, так как нужно правильно парсить вложенность тегов
// Лучше использовать более простой подход - найти все элементы с нужным ID

// Вариант 2: Используем регулярное выражение для поиска всех элементов с id начинающимся с product-item-
const idPattern = /id=["'](product-item-\d+)["']/gi;
const productIds = [];
let match;

// Находим все ID товаров
while ((match = idPattern.exec(htmlContent)) !== null) {
  if (!productIds.includes(match[1])) {
    productIds.push(match[1]);
  }
}

// Если не нашли через ID, пробуем найти через data-атрибуты или классы
if (productIds.length === 0) {
  // Альтернативный паттерн: ищем элементы с классом или data-атрибутом
  const altPattern = /<[^>]*(?:class|data-product-id)=["'][^"]*product-item[^"]*["'][^>]*>/gi;
  const altMatches = htmlContent.match(altPattern);
  
  if (altMatches && altMatches.length > 0) {
    // Извлекаем ID из найденных элементов
    altMatches.forEach(tag => {
      const idMatch = tag.match(/id=["'](product-item-\d+)["']/i);
      if (idMatch && !productIds.includes(idMatch[1])) {
        productIds.push(idMatch[1]);
      }
    });
  }
}

// Если всё ещё не нашли, возвращаем ошибку
if (productIds.length === 0) {
  return [{ 
    json: { 
      error: 'No product blocks found',
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
  // Ищем элемент по ID - нужно найти открывающий тег и соответствующий закрывающий
  // Используем более сложный паттерн для правильного извлечения вложенных элементов
  
  // Паттерн для поиска открывающего тега с нужным ID
  const openTagPattern = new RegExp(`<([^>]*id=["']${productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*)>`, 'i');
  const openTagMatch = htmlContent.match(openTagPattern);
  
  if (openTagMatch) {
    const openTag = openTagMatch[1];
    const tagNameMatch = openTagMatch[0].match(/<(\w+)/);
    const tagName = tagNameMatch ? tagNameMatch[1] : 'div';
    
    // Находим позицию начала открывающего тега
    const startPos = htmlContent.indexOf(openTagMatch[0]);
    
    // Ищем соответствующий закрывающий тег
    // Это упрощённый подход - считаем, что это самозакрывающийся тег или ищем закрывающий тег
    let endPos = htmlContent.indexOf(`</${tagName}>`, startPos);
    
    // Если не нашли закрывающий тег, возможно это самозакрывающийся тег
    if (endPos === -1) {
      // Ищем следующий открывающий тег того же уровня или конец документа
      endPos = htmlContent.length;
    } else {
      endPos += `</${tagName}>`.length;
    }
    
    // Извлекаем HTML блока
    const blockHtml = htmlContent.substring(startPos, endPos);
    
    productBlocks.push({
      json: {
        productId: productId,
        html: blockHtml,
        // Также сохраняем числовой ID для удобства
        numericId: productId.replace('product-item-', '')
      }
    });
  }
}

// Если не удалось извлечь через парсинг тегов, используем более простой подход
if (productBlocks.length === 0) {
  // Альтернативный метод: находим все участки HTML между элементами с нужными ID
  // Это менее точно, но может сработать
  const sections = [];
  let lastPos = 0;
  
  for (const productId of productIds) {
    const idPattern = new RegExp(`id=["']${productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
    const match = htmlContent.substring(lastPos).search(idPattern);
    
    if (match !== -1) {
      const startPos = lastPos + match;
      // Ищем начало тега (идём назад до <)
      let tagStart = startPos;
      while (tagStart > 0 && htmlContent[tagStart] !== '<') {
        tagStart--;
      }
      
      // Ищем конец блока (следующий элемент с product-item- или конец документа)
      let tagEnd = htmlContent.length;
      for (let i = startPos + 100; i < htmlContent.length; i++) {
        const nextIdMatch = htmlContent.substring(i).match(/id=["']product-item-\d+["']/i);
        if (nextIdMatch) {
          // Идём назад до начала тега
          let nextTagStart = i + nextIdMatch.index;
          while (nextTagStart > 0 && htmlContent[nextTagStart] !== '<') {
            nextTagStart--;
          }
          tagEnd = nextTagStart;
          break;
        }
      }
      
      const blockHtml = htmlContent.substring(tagStart, tagEnd);
      sections.push({
        json: {
          productId: productId,
          html: blockHtml,
          numericId: productId.replace('product-item-', '')
        }
      });
      
      lastPos = tagEnd;
    }
  }
  
  return sections.length > 0 ? sections : [{ json: { error: 'Could not extract product blocks' } }];
}

return productBlocks;
