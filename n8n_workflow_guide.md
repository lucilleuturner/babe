# Инструкция по обработке HTML в n8n для promtechserv.ru

## Вариант 1: Использование Code Node (рекомендуется)

### Шаг 1: Read Binary Files Node
- **Node**: Read Binary Files
- **Операция**: Read File
- **File Path**: `{{ $json.filePath }}` или путь к вашим HTML файлам
- **Output**: Binary data

### Шаг 2: Code Node - Извлечение JSON-LD
```javascript
// Получаем HTML из бинарных данных
const htmlContent = $binary.data.toString('utf-8');

// Регулярное выражение для поиска JSON-LD
const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
const matches = [...htmlContent.matchAll(jsonLdPattern)];

let allProducts = [];

for (const match of matches) {
  try {
    const jsonData = JSON.parse(match[1].trim());
    
    // Проверяем наличие itemListElement
    if (jsonData.itemListElement && Array.isArray(jsonData.itemListElement)) {
      allProducts = allProducts.concat(jsonData.itemListElement);
    }
    
    // Если это массив, проверяем каждый элемент
    if (Array.isArray(jsonData)) {
      for (const item of jsonData) {
        if (item.itemListElement && Array.isArray(item.itemListElement)) {
          allProducts = allProducts.concat(item.itemListElement);
        }
      }
    }
  } catch (e) {
    // Пропускаем некорректный JSON
    continue;
  }
}

// Разбиваем на отдельные элементы (каждый товар = отдельный item)
return allProducts.map((productItem, index) => {
  const item = productItem.item || {};
  const offers = item.offers || {};
  
  return {
    json: {
      position: productItem.position,
      name: item.name || '',
      price: offers.price || null,
      priceCurrency: offers.priceCurrency || 'RUB',
      availability: offers.availability || '',
      url: item.url || '',
      image: item.image || [],
      // Сохраняем полный объект для дальнейшей обработки
      rawItem: productItem
    }
  };
});
```

### Шаг 3: HTML Extract Node (опционально)
Если нужно извлечь дополнительные данные из HTML блоков товаров:
- Используйте HTML Extract после разбивки на блоки
- Селектор: зависит от структуры HTML (нужно посмотреть на реальный HTML)

---

## Вариант 2: Использование Execute Command Node

### Шаг 1: Read Binary Files Node
- То же самое, что в варианте 1

### Шаг 2: Write Binary File Node
- Сохраняем HTML во временный файл
- **File Name**: `{{ $json.fileName }}.html`
- **File Path**: `/tmp/` или рабочая директория

### Шаг 3: Execute Command Node
```bash
python3 /workspace/extract_products_from_html.py "{{ $json.filePath }}"
```

### Шаг 4: Set Node - Парсинг JSON
- **Name**: `products`
- **Value**: `{{ JSON.parse($json.stdout) }}`

### Шаг 5: Split Out Items Node
- Разбиваем массив товаров на отдельные элементы

---

## Вариант 3: Прямая работа с HTML Extract (если JSON-LD недоступен)

Если JSON-LD нет в HTML, нужно найти селектор для блоков товаров:

### Шаг 1: Code Node - Разбивка на блоки товаров
```javascript
const htmlContent = $binary.data.toString('utf-8');
const cheerio = require('cheerio');
const $ = cheerio.load(htmlContent);

// Нужно найти правильный селектор для блоков товаров
// Например: '.product-item' или '.b-product-item' и т.д.
// Это нужно определить, посмотрев на реальный HTML

const productBlocks = [];
$('.product-item').each((index, element) => {
  productBlocks.push({
    json: {
      html: $.html(element),
      index: index
    }
  });
});

return productBlocks;
```

### Шаг 2: HTML Extract Node
- **Source Data**: `{{ $json.html }}`
- **Extraction Values**:
  - **Name**: `name`
    - **CSS Selector**: `.product-name` (пример, нужно уточнить)
  - **Price**: `price`
    - **CSS Selector**: `.product-price` (пример, нужно уточнить)
  - **URL**: `url`
    - **CSS Selector**: `a.product-link`
    - **Attribute**: `href`

---

## Рекомендуемый workflow для promtechserv.ru

Учитывая, что у вас есть JSON-LD структура, используйте **Вариант 1**:

1. **Read Binary Files** - загружает HTML файлы
2. **Code Node** - извлекает JSON-LD и разбивает на отдельные товары
3. **Set Node** - форматирует данные (опционально)
4. **Output** - готовые данные о товарах

Каждый товар будет отдельным элементом в n8n, что позволит корректно обрабатывать цены и описания без смешивания.
