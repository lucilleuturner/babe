// Код для Code Node в n8n
// Этот код извлекает товары из HTML с JSON-LD структурой и разбивает их на отдельные элементы

// Получаем HTML из бинарных данных (если используется Read Binary Files)
const htmlContent = $input.item.binary?.data 
  ? Buffer.from($input.item.binary.data, 'base64').toString('utf-8')
  : $input.item.json?.html || $input.item.json?.data || '';

if (!htmlContent) {
  return [{ json: { error: 'No HTML content found' } }];
}

// Регулярное выражение для поиска JSON-LD скриптов
const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
const matches = [...htmlContent.matchAll(jsonLdPattern)];

let allProducts = [];

// Извлекаем все JSON-LD блоки
for (const match of matches) {
  try {
    const jsonData = JSON.parse(match[1].trim());
    
    // Проверяем наличие itemListElement в объекте
    if (jsonData && typeof jsonData === 'object' && jsonData.itemListElement) {
      if (Array.isArray(jsonData.itemListElement)) {
        allProducts = allProducts.concat(jsonData.itemListElement);
      }
    }
    
    // Если это массив, проверяем каждый элемент
    if (Array.isArray(jsonData)) {
      for (const item of jsonData) {
        if (item && typeof item === 'object' && item.itemListElement) {
          if (Array.isArray(item.itemListElement)) {
            allProducts = allProducts.concat(item.itemListElement);
          }
        }
      }
    }
  } catch (e) {
    // Пропускаем некорректный JSON, логируем ошибку
    console.log('Ошибка парсинга JSON-LD:', e.message);
    continue;
  }
}

// Если товары не найдены, возвращаем ошибку
if (allProducts.length === 0) {
  return [{ 
    json: { 
      error: 'No products found in JSON-LD',
      debug: {
        matchesFound: matches.length,
        htmlLength: htmlContent.length
      }
    } 
  }];
}

// Разбиваем на отдельные элементы (каждый товар = отдельный item в n8n)
// Это важно для корректной обработки каждого товара отдельно
return allProducts.map((productItem) => {
  const item = productItem.item || {};
  const offers = item.offers || {};
  
  // Извлекаем основные данные
  const productData = {
    position: productItem.position || null,
    name: item.name || '',
    price: offers.price || null,
    priceCurrency: offers.priceCurrency || 'RUB',
    availability: offers.availability || '',
    url: item.url || '',
    image: Array.isArray(item.image) ? item.image : (item.image ? [item.image] : []),
    // Сохраняем полный объект для дальнейшей обработки (опционально)
    rawItem: productItem
  };
  
  return {
    json: productData
  };
});
