#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для объединения уникальных товаров из таблицы конкурентов.
Выполняет группировку товаров по бренду, линейке и объему тары,
оставляя товар с наименьшей ценой в каждой группе.
"""

import pandas as pd
import re
from typing import Optional, List, Tuple
from rapidfuzz import fuzz


# Список конкурентов, которые должны остаться без изменений
COMPETITORS = [
    'eurosmaz.shop',
    'atf.ru',
    'gmformula',
    'techaerosol.ru',
    '7ft',
    'VSEINSTRUMENTI',
    'PROMTECHSERV'
]


def normalize_brand(brand: str) -> str:
    """
    Нормализует бренд: приводит к формату с заглавной буквы (Роснефть, Nord).
    Убирает лишние пробелы.
    """
    if pd.isna(brand) or brand == '':
        return ''
    brand_str = str(brand).strip()
    if len(brand_str) == 0:
        return ''
    
    # Приводим к формату: первая буква заглавная, остальные строчные
    # Но сохраняем специальные случаи (например, Nord, G-Box, Роснефть)
    # Если все буквы заглавные или строчные, применяем title case
    if brand_str.isupper() or brand_str.islower():
        # Используем title() для каждого слова отдельно
        words = brand_str.split()
        normalized_words = [word.title() for word in words]
        return ' '.join(normalized_words)
    
    # Если уже есть смешанный регистр, оставляем как есть
    return brand_str


def extract_brand_from_name(name: str) -> str:
    """
    Извлекает бренд из названия товара.
    Ищет известные бренды в начале названия.
    """
    if pd.isna(name) or name == '':
        return ''
    
    name_str = str(name).strip()
    # Убираем слово "Масло" в начале
    name_str = re.sub(r'^масло\s+', '', name_str, flags=re.IGNORECASE)
    
    # Берем первое слово или несколько слов (обычно это бренд)
    words = name_str.split()
    if words:
        # Бренд может состоять из одного или нескольких слов
        # Обычно это первое слово, но может быть и два (например, "Газпромнефть")
        # Останавливаемся на технических характеристиках или служебных словах
        brand_words = []
        for word in words[:3]:  # Максимум 3 слова для бренда
            if re.match(r'^\d+[Ww]?[-/]?\d+', word):  # Вязкость
                break
            if re.match(r'^\d+[лЛlL]', word):  # Объем
                break
            if word.lower() in ['для', 'масло', 'gl-']:
                break
            brand_words.append(word)
        return ' '.join(brand_words).strip()
    
    return ''


def extract_line_from_name(name: str, brand: str) -> str:
    """
    Извлекает линейку масла из названия товара.
    Линейка обычно следует после бренда в названии.
    Пример: "Масло Газпромнефть G-Box GL-4 75W-90 (20 л, канистра)" -> "G-Box GL-4"
    """
    if pd.isna(name) or name == '':
        return ''
    
    name_str = str(name).strip()
    brand_normalized = normalize_brand(brand)
    
    # Если бренд есть, пытаемся найти линейку после бренда
    if brand_normalized:
        # Ищем бренд в названии (без учета регистра)
        # Используем более гибкий поиск для разных вариантов написания
        pattern = re.compile(re.escape(brand_normalized), re.IGNORECASE)
        match = pattern.search(name_str)
        if match:
            # Берем текст после бренда
            after_brand = name_str[match.end():].strip()
            # Убираем слово "масло" если оно есть
            after_brand = re.sub(r'^масло\s+', '', after_brand, flags=re.IGNORECASE)
            # Извлекаем первые слова (обычно это линейка)
            # Убираем объем, вязкость и другие технические характеристики
            words = after_brand.split()
            line_words = []
            for i, word in enumerate(words):
                # Останавливаемся на технических характеристиках
                if re.match(r'^\d+[Ww]?[-/]?\d+', word):  # Вязкость типа 75W-90
                    break
                if re.match(r'^\d+[лЛlL]', word):  # Объем типа 20л
                    break
                if word == '(':
                    break
                if word.lower() in ['л', 'l', 'канистра', 'бочка', 'флакон']:
                    break
                # Пропускаем служебные слова
                if word.lower() in ['для', 'масло']:
                    continue
                # GL-4, GL-5 и т.д. - это часть линейки, включаем их
                line_words.append(word)
            result = ' '.join(line_words).strip()
            # Убираем лишние пробелы и знаки препинания в конце
            result = re.sub(r'\s*[,\-]\s*$', '', result)
            if result:
                return result
    
    # Если бренда нет в столбце, пытаемся найти его в названии
    # и затем извлечь линейку после него
    extracted_brand = extract_brand_from_name(name_str)
    if extracted_brand:
        # Ищем извлеченный бренд в названии и берем следующее слово
        pattern = re.compile(re.escape(extracted_brand), re.IGNORECASE)
        match = pattern.search(name_str)
        if match:
            after_brand = name_str[match.end():].strip()
            after_brand = re.sub(r'^масло\s+', '', after_brand, flags=re.IGNORECASE)
            words = after_brand.split()
            line_words = []
            for word in words:
                if re.match(r'^\d+[Ww]?[-/]?\d+', word):
                    break
                if re.match(r'^\d+[лЛlL]', word):
                    break
                if word == '(':
                    break
                if word.lower() in ['л', 'l', 'канистра', 'бочка', 'флакон']:
                    break
                if word.lower() in ['для', 'масло']:
                    continue
                line_words.append(word)
            result = ' '.join(line_words).strip()
            result = re.sub(r'\s*[,\-]\s*$', '', result)
            if result:
                return result
    
    # Если бренда нет или не нашли, пытаемся извлечь первые слова до технических характеристик
    # Убираем слово "масло" в начале
    name_str = re.sub(r'^масло\s+', '', name_str, flags=re.IGNORECASE)
    words = name_str.split()
    line_words = []
    for word in words:
        if re.match(r'^\d+[Ww]?[-/]?\d+', word):
            break
        if re.match(r'^\d+[лЛlL]', word):
            break
        if word.lower() in ['л', 'l', 'канистра', 'бочка', 'флакон', '(']:
            break
        if word.lower() in ['для', 'масло']:
            continue
        line_words.append(word)
    
    result = ' '.join(line_words).strip()
    result = re.sub(r'\s*[,\-]\s*$', '', result)
    return result


def normalize_volume(volume: str) -> str:
    """
    Нормализует объем тары для сравнения.
    Учитывает варианты: 200л, 200 л, 200Л - все считаются одинаковыми.
    """
    if pd.isna(volume) or volume == '':
        return ''
    
    volume_str = str(volume).strip()
    # Извлекаем число и единицу измерения (игнорируя пробелы)
    match = re.search(r'(\d+(?:[.,]\d+)?)\s*[лЛlL]', volume_str, re.IGNORECASE)
    if match:
        num = match.group(1).replace(',', '.')
        # Нормализуем к формату "число л" (с пробелом)
        return f"{num} л"
    
    # Если не нашли стандартный формат, возвращаем как есть
    return volume_str


def is_competitor_row(row: pd.Series) -> bool:
    """
    Проверяет, является ли строка строкой конкурента.
    Проверяет основные колонки: ID товара, Название товара, и другие текстовые колонки.
    """
    # Проверяем основные колонки, которые могут содержать название конкурента
    check_columns = ['ID товара', 'Название товара', 'Описание', 'Бренд']
    
    for col in check_columns:
        if col in row.index:
            value = str(row[col]).lower() if pd.notna(row[col]) else ''
            for competitor in COMPETITORS:
                if competitor.lower() in value:
                    return True
    
    # Также проверяем, если все числовые колонки пустые или нулевые, 
    # а в текстовых есть что-то похожее на конкурента
    numeric_cols = ['Цена', 'Объем тары']
    has_numeric_data = False
    for col in numeric_cols:
        if col in row.index and pd.notna(row[col]):
            try:
                val = float(str(row[col]).replace(' ', '').replace(',', '.'))
                if val != 0:
                    has_numeric_data = True
                    break
            except:
                pass
    
    # Если нет числовых данных, проверяем все колонки
    if not has_numeric_data:
        for col in row.index:
            value = str(row[col]).lower() if pd.notna(row[col]) else ''
            for competitor in COMPETITORS:
                if competitor.lower() == value.strip():  # Точное совпадение
                    return True
    
    return False


def fuzzy_match_line(line1: str, line2: str, threshold: int = 85) -> bool:
    """
    Проверяет, являются ли две линейки похожими с помощью fuzzy matching.
    """
    if not line1 or not line2:
        return line1 == line2
    
    # Используем ratio для сравнения
    ratio = fuzz.ratio(line1.lower(), line2.lower())
    return ratio >= threshold


def group_products(df: pd.DataFrame) -> pd.DataFrame:
    """
    Группирует товары по бренду, линейке и объему тары.
    В каждой группе оставляет товар с наименьшей ценой.
    """
    # Разделяем на конкурентов и товары
    competitor_mask = df.apply(is_competitor_row, axis=1)
    competitor_rows = df[competitor_mask].copy()
    product_rows = df[~competitor_mask].copy()
    
    if len(product_rows) == 0:
        return df
    
    # Создаем нормализованные колонки для группировки
    product_rows = product_rows.copy()
    
    # Определяем бренд: сначала из столбца, если нет - из названия товара
    def get_brand(row):
        brand_col = row.get('Бренд', '')
        if pd.notna(brand_col) and str(brand_col).strip():
            return normalize_brand(str(brand_col))
        # Если бренда нет в столбце, извлекаем из названия
        name = row.get('Название товара', '')
        extracted_brand = extract_brand_from_name(name)
        return normalize_brand(extracted_brand) if extracted_brand else ''
    
    product_rows['_brand_norm'] = product_rows.apply(get_brand, axis=1)
    # Для сравнения создаем версию в нижнем регистре
    product_rows['_brand_norm_lower'] = product_rows['_brand_norm'].str.lower()
    
    # Записываем извлеченные бренды в столбец "Бренд", если они были извлечены из названия
    if 'Бренд' in product_rows.columns:
        for idx in product_rows.index:
            brand_col = product_rows.loc[idx, 'Бренд']
            if pd.isna(brand_col) or not str(brand_col).strip():
                extracted_brand = product_rows.loc[idx, '_brand_norm']
                if extracted_brand:
                    product_rows.loc[idx, 'Бренд'] = extracted_brand
    
    # Извлекаем линейку: если есть в колонке "Линейка", используем её, иначе извлекаем из названия
    def get_line(row):
        if 'Линейка' in row.index:
            line_col = row.get('Линейка', '')
            if pd.notna(line_col) and str(line_col).strip():
                return str(line_col).strip()
        # Если линейки нет в колонке, извлекаем из названия
        name = row.get('Название товара', '')
        brand_col = row.get('Бренд', '')
        # Если бренда нет в столбце, используем извлеченный бренд
        if pd.isna(brand_col) or not str(brand_col).strip():
            extracted_brand = extract_brand_from_name(name)
            brand_col = extracted_brand if extracted_brand else ''
        return extract_line_from_name(name, brand_col)
    
    product_rows['_line'] = product_rows.apply(get_line, axis=1)
    
    # Записываем найденную линейку в столбец "Линейка", если она была извлечена
    if 'Линейка' in product_rows.columns:
        for idx in product_rows.index:
            if pd.isna(product_rows.loc[idx, 'Линейка']) or not str(product_rows.loc[idx, 'Линейка']).strip():
                extracted_line = product_rows.loc[idx, '_line']
                if extracted_line:
                    product_rows.loc[idx, 'Линейка'] = extracted_line
    else:
        # Если колонки нет, создаем её
        product_rows['Линейка'] = product_rows['_line']
    
    product_rows['_volume_norm'] = product_rows['Объем тары'].apply(normalize_volume)
    
    # Группируем товары
    grouped_products = []
    processed_indices = set()
    
    for idx, row in product_rows.iterrows():
        if idx in processed_indices:
            continue
        
        # Находим группу похожих товаров
        group = [idx]
        brand_norm_lower = row['_brand_norm_lower']
        line = row['_line']
        volume_norm = row['_volume_norm']
        
        # Ищем похожие товары
        for idx2, row2 in product_rows.iterrows():
            if idx2 == idx or idx2 in processed_indices:
                continue
            
            brand_norm_lower2 = row2['_brand_norm_lower']
            line2 = row2['_line']
            volume_norm2 = row2['_volume_norm']
            
            # Сравниваем бренды (по нижнему регистру для игнорирования регистра)
            if brand_norm_lower != brand_norm_lower2:
                continue
            
            # Сравниваем объемы (нормализованные значения)
            # normalize_volume уже нормализует формат, поэтому сравниваем нормализованные значения
            if volume_norm != volume_norm2:
                continue
            
            # Сравниваем линейки (fuzzy matching)
            if fuzzy_match_line(line, line2):
                group.append(idx2)
        
        # В группе оставляем товар с минимальной ценой
        group_rows = product_rows.loc[group]
        
        # Преобразуем цену в число для сравнения
        def parse_price(price):
            if pd.isna(price):
                return float('inf')
            try:
                # Убираем пробелы и преобразуем в число
                price_str = str(price).replace(' ', '').replace(',', '.')
                return float(re.search(r'[\d.]+', price_str).group())
            except:
                return float('inf')
        
        group_rows['_price_num'] = group_rows['Цена'].apply(parse_price)
        best_row = group_rows.loc[group_rows['_price_num'].idxmin()]
        
        # Удаляем служебные колонки
        best_row = best_row.drop(['_brand_norm', '_brand_norm_lower', '_line', '_volume_norm', '_price_num'])
        grouped_products.append(best_row)
        
        # Отмечаем все товары группы как обработанные
        processed_indices.update(group)
    
    # Создаем итоговый DataFrame
    if grouped_products:
        result_products = pd.DataFrame(grouped_products)
    else:
        result_products = pd.DataFrame(columns=df.columns)
    
    # Объединяем с конкурентами
    if len(competitor_rows) > 0:
        result = pd.concat([competitor_rows, result_products], ignore_index=True)
    else:
        result = result_products
    
    # Возвращаем в исходном порядке колонок
    return result[df.columns]


def main():
    """Основная функция для обработки файла."""
    import sys
    import os
    from pathlib import Path
    
    # Определяем входной и выходной файлы
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    else:
        # Ищем файл на рабочем столе
        desktop_paths = [
            Path.home() / 'Desktop',
            Path.home() / 'Рабочий стол',
            Path.home() / 'Desktop' / 'Все масла конкурентов для fuzzy.xlsx',
            Path.home() / 'Рабочий стол' / 'Все масла конкурентов для fuzzy.xlsx',
        ]
        
        input_file = None
        for path in desktop_paths:
            if path.is_file():
                input_file = str(path)
                break
            elif path.is_dir():
                file_path = path / 'Все масла конкурентов для fuzzy.xlsx'
                if file_path.exists():
                    input_file = str(file_path)
                    break
        
        if not input_file:
            input_file = input("Введите путь к входному файлу (CSV или Excel): ").strip()
            if not input_file:
                # Пробуем найти файл в текущей директории
                if os.path.exists('Все масла конкурентов для fuzzy.xlsx'):
                    input_file = 'Все масла конкурентов для fuzzy.xlsx'
                else:
                    print("Файл не найден!")
                    return
    
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    else:
        # Сохраняем результат в новый файл рядом с исходным
        input_path = Path(input_file)
        output_file = str(input_path.parent / f"{input_path.stem}_обработано.xlsx")
    
    # Читаем файл
    print(f"Чтение файла: {input_file}")
    try:
        if input_file.endswith('.xlsx') or input_file.endswith('.xls'):
            df = pd.read_excel(input_file)
        else:
            df = pd.read_csv(input_file, encoding='utf-8')
    except FileNotFoundError:
        print(f"Ошибка: Файл '{input_file}' не найден!")
        return
    except Exception as e:
        print(f"Ошибка при чтении файла: {e}")
        return
    
    print(f"Загружено строк: {len(df)}")
    
    # Проверяем наличие необходимых колонок
    required_columns = ['Название товара', 'Бренд', 'Объем тары', 'Цена']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        print(f"Предупреждение: Отсутствуют колонки: {missing_columns}")
        print(f"Доступные колонки: {list(df.columns)}")
        print("Скрипт продолжит работу, но результаты могут быть некорректными.")
    
    # Обрабатываем товары
    print("Обработка товаров...")
    try:
        result_df = group_products(df)
    except Exception as e:
        print(f"Ошибка при обработке товаров: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print(f"Результат: {len(result_df)} строк")
    
    # Сохраняем результат
    print(f"Сохранение результата в: {output_file}")
    if output_file.endswith('.xlsx') or output_file.endswith('.xls'):
        result_df.to_excel(output_file, index=False)
    else:
        result_df.to_csv(output_file, index=False, encoding='utf-8')
    
    print("Готово!")


if __name__ == '__main__':
    main()
