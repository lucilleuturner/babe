import os
import time
from seleniumbase import SB

BASE_URL = "https://www.promtechserv.ru/catalog/k-11864090-industrialnyye_masla?page={page}"
NEXT_PAGE_BUTTON = "#company-content > div.company-content.js-company-content.megasite-company-content.tmpl-company-content > div.company-content__column-second.megasite-company-content__column-second.js-content-block > div > div.company-products-page.page-content > div:nth-child(2) > div.b-pagination-wrapper.js-b-pagination-wrapper > div > a"
OUT_DIR = "pages_html_promtechserv"

os.makedirs(OUT_DIR, exist_ok=True)

with SB(uc=True) as sb:
    # Начинаем с 2-й страницы
    for page in range(2, 14):  # 2..13 включительно
        url = BASE_URL.format(page=page)
        sb.open(url)
        sb.wait_for_ready_state_complete(timeout=20)

        # Небольшая плавная прокрутка для прогрузки контента
        for _ in range(12):
            sb.execute_script("window.scrollBy(0, window.innerHeight/12);")
            sb.sleep(0.05)

        # Доп. ожидание для динамического контента
        sb.wait_for_element_visible("body", timeout=10)

        # Сохранить HTML страницы
        html = sb.get_page_source()
        filename = os.path.join(OUT_DIR, f"page_{page}.html")
        with open(filename, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Saved: {filename}")

        # Если это последняя страница — не нужно кликать
        if page == 13:
            break

        # Нажать кнопку "далее" (если селектор стабилен)
        try:
            sb.wait_for_element_visible(NEXT_PAGE_BUTTON, timeout=10)
            # Плавный скролл к кнопке и клик через JS с небольшой задержкой
            sb.execute_script(
                """
                const sel = arguments[0];
                const el = document.querySelector(sel);
                if (el) {
                  el.scrollIntoView({behavior:'smooth', block:'center'});
                  setTimeout(()=> el.click(), 400);
                }
                """,
                NEXT_PAGE_BUTTON,
            )
            # Дать время на переход/загрузку
            sb.wait_for_ready_state_complete(timeout=20)
            time.sleep(0.6)
        except Exception as e:
            print(f"Не удалось нажать кнопку 'далее' на странице {page}: {e}")
            break
