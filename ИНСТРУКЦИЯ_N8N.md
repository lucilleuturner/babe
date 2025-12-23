# Инструкция по обработке HTML в n8n для promtechserv.ru

## Быстрый старт

### Шаг 1: Загрузка HTML файлов

**Node**: `Read Binary Files`
- **Operation**: `Read File` или `Read Files From Directory`
- **File Path**: путь к вашим HTML файлам (например, `pages_html_promtechserv/page_2.html`)
- Если обрабатываете несколько файлов, используйте `Read Files From Directory`

### Шаг 2: Извлечение товаров из JSON-LD

**Node**: `Code`

Скопируйте код из файла `n8n_code_node.js` или используйте этот код:

```javascript
// Получаем HTML из бинарных данных
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
    
    // Проверяем наличие itemListElement
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
    continue;
  }
}

// Разбиваем на отдельные элементы (каждый товар = отдельный item в n8n)
return allProducts.map((productItem) => {
  const item = productItem.item || {};
  const offers = item.offers || {};
  
  return {
    json: {
      position: productItem.position || null,
      name: item.name || '',
      price: offers.price || null,
      priceCurrency: offers.priceCurrency || 'RUB',
      availability: offers.availability || '',
      url: item.url || '',
      image: Array.isArray(item.image) ? item.image : (item.image ? [item.image] : [])
    }
  };
});
```

### Результат

После выполнения Code Node вы получите **отдельный элемент для каждого товара** с полями:
- `position` - позиция товара
- `name` - название товара
- `price` - цена
- `priceCurrency` - валюта (обычно RUB)
- `availability` - наличие
- `url` - ссылка на товар
- `image` - массив изображений

### Шаг 3: Дополнительная обработка (опционально)

Если нужно извлечь дополнительные данные из HTML блоков товаров:

**Node**: `HTML Extract`
- **Source Data**: `{{ $json.html }}` (если сохранили HTML)
- **Extraction Values**: настройте селекторы для нужных полей

Но обычно данных из JSON-LD достаточно!

## Важные моменты

1. **Разбивка на блоки**: Code Node автоматически разбивает массив товаров на отдельные элементы. Каждый товар будет обрабатываться отдельно в следующих нодах.

2. **Нет смешивания данных**: Поскольку каждый товар - отдельный элемент, цены и описания не будут смешиваться.

3. **Обработка нескольких файлов**: Если используете `Read Files From Directory`, каждый HTML файл будет обработан отдельно, и все товары из всех файлов будут объединены.

## Пример workflow

```
Read Binary Files → Code (Extract Products) → Set (форматирование) → Output
```

Или с дополнительной обработкой:

```
Read Binary Files → Code (Extract Products) → HTML Extract (если нужно) → Output
```

## Отладка

Если товары не находятся:
1. Проверьте, что в HTML есть `<script type="application/ld+json">`
2. Откройте HTML файл и найдите JSON-LD блок
3. Убедитесь, что структура соответствует примеру с `itemListElement`
