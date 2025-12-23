#!/usr/bin/env python3
"""
Скрипт для извлечения товаров из HTML файлов promtechserv.ru
Используется для n8n через Execute Command node или Code node
"""
import json
import re
import sys
from pathlib import Path
from typing import List, Dict, Any


def extract_json_ld(html_content: str) -> List[Dict[str, Any]]:
    """
    Извлекает JSON-LD структуру из HTML
    """
    # Ищем все script теги с type="application/ld+json"
    pattern = r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
    matches = re.findall(pattern, html_content, re.DOTALL | re.IGNORECASE)
    
    products = []
    for match in matches:
        try:
            data = json.loads(match.strip())
            # Проверяем, есть ли itemListElement
            if isinstance(data, dict) and 'itemListElement' in data:
                products.extend(data['itemListElement'])
            # Если это список, проверяем каждый элемент
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and 'itemListElement' in item:
                        products.extend(item['itemListElement'])
        except json.JSONDecodeError:
            continue
    
    return products


def extract_product_data(product_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Извлекает нужные данные из одного товара
    """
    item = product_item.get('item', {})
    
    return {
        'position': product_item.get('position'),
        'name': item.get('name', ''),
        'price': item.get('offers', {}).get('price'),
        'priceCurrency': item.get('offers', {}).get('priceCurrency', 'RUB'),
        'availability': item.get('offers', {}).get('availability', ''),
        'url': item.get('url', ''),
        'image': item.get('image', [])
    }


def process_html_file(file_path: str) -> List[Dict[str, Any]]:
    """
    Обрабатывает один HTML файл и возвращает список товаров
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    products_raw = extract_json_ld(html_content)
    products = [extract_product_data(p) for p in products_raw]
    
    return products


def main():
    """
    Основная функция для использования в n8n
    Может принимать путь к файлу через stdin или аргумент командной строки
    """
    if len(sys.argv) > 1:
        # Путь к файлу передан как аргумент
        file_path = sys.argv[1]
    else:
        # Читаем из stdin (для n8n)
        file_path = sys.stdin.read().strip()
    
    if not file_path or not Path(file_path).exists():
        print(json.dumps({'error': f'File not found: {file_path}'}, ensure_ascii=False))
        sys.exit(1)
    
    try:
        products = process_html_file(file_path)
        # Выводим JSON для n8n
        print(json.dumps(products, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
