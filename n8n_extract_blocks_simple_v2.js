// Код для Code Node в n8n
// Извлекает блоки товаров по селекторам #product-item-*
// Упрощённая версия - извлекает блоки до следующего product-item-

// Получаем HTML из бинарных данных
const htmlContent = $input.item.binary?.data 
  ? Buffer.from($input.item.binary.data, 'base64').toString('utf-8')
  : $input.item.json?.html || $input.item.json?.data || '';

if (!htmlContent) {
  return [{ json: { error: 'No HTML content found' } }];
}

// Находим все ID товаров и их позиции
const idPattern = /id=["'](product-item-\d+)["']/gi;
const productMatches = [];
let match;

while ((match = idPattern.exec(htmlContent)) !== null) {
  const productId = match[1];
  const position = match.index;
  
  // Находим начало тега (идём назад до <)
  let tagStart = position;
  while (tagStart > 0 && htmlContent[tagStart] !== '<') {
    tagStart--;
  }
  
  productMatches.push({
    id: productId,
    startPos: tagStart,
    idPos: position
  });
}

// Удаляем дубликаты (если ID встречается несколько раз, берём первое вхождение)
const uniqueProducts = [];
const seenIds = new Set();

for (const product of productMatches) {
  if (!seenIds.has(product.id)) {
    seenIds.add(product.id);
    uniqueProducts.push(product);
  }
}

// Сортируем по позиции
uniqueProducts.sort((a, b) => a.startPos - b.startPos);

if (uniqueProducts.length === 0) {
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

// Извлекаем HTML блоки
const productBlocks = [];

for (let i = 0; i < uniqueProducts.length; i++) {
  const product = uniqueProducts[i];
  const startPos = product.startPos;
  
  // Определяем конец блока:
  // - Если есть следующий товар, берём до его начала
  // - Если это последний товар, берём до конца документа или до определённого лимита
  let endPos;
  
  if (i < uniqueProducts.length - 1) {
    // Есть следующий товар - берём до его начала
    endPos = uniqueProducts[i + 1].startPos;
  } else {
    // Последний товар - ищем разумный конец
    // Ищем закрывающий тег родительского контейнера или берём большой кусок
    const searchLimit = Math.min(startPos + 20000, htmlContent.length); // Максимум 20KB на товар
    endPos = searchLimit;
    
    // Пытаемся найти закрывающий тег, но не слишком далеко
    const nextSection = htmlContent.substring(startPos, searchLimit);
    // Ищем типичные закрывающие теги контейнеров товаров
    const commonClosers = ['</div>', '</li>', '</article>', '</section>'];
    let foundCloser = false;
    
    for (const closer of commonClosers) {
      const closerPos = nextSection.lastIndexOf(closer);
      if (closerPos > 1000) { // Если закрывающий тег не слишком близко к началу
        endPos = startPos + closerPos + closer.length;
        foundCloser = true;
        break;
      }
    }
    
    // Если не нашли закрывающий тег, но есть ещё контент, ищем до следующего значимого элемента
    if (!foundCloser && searchLimit < htmlContent.length) {
      // Ищем начало следующего блока (например, пагинация, футер и т.д.)
      const nextBlockMarkers = [
        '<div class="pagination',
        '<div class="b-pagination',
        '<footer',
        '<div class="footer'
      ];
      
      for (const marker of nextBlockMarkers) {
        const markerPos = htmlContent.indexOf(marker, startPos);
        if (markerPos !== -1 && markerPos < searchLimit + 5000) {
          endPos = markerPos;
          break;
        }
      }
    }
  }
  
  // Извлекаем HTML блока
  const blockHtml = htmlContent.substring(startPos, endPos);
  
  // Проверяем минимальный размер блока
  if (blockHtml.length < 50) {
    continue;
  }
  
  productBlocks.push({
    json: {
      productId: product.id,
      html: blockHtml,
      numericId: product.id.replace('product-item-', ''),
      blockLength: blockHtml.length,
      position: i + 1,
      totalProducts: uniqueProducts.length
    }
  });
}

// Добавляем отладочную информацию
if (productBlocks.length > 0) {
  productBlocks[0].json._debug = {
    totalIdsFound: productMatches.length,
    uniqueIdsFound: uniqueProducts.length,
    successfullyExtracted: productBlocks.length,
    htmlLength: htmlContent.length
  };
}

if (productBlocks.length === 0) {
  return [{ 
    json: { 
      error: 'Could not extract any product blocks',
      debug: {
        totalMatches: productMatches.length,
        uniqueProducts: uniqueProducts.length,
        htmlLength: htmlContent.length
      }
    } 
  }];
}

return productBlocks;
