"""Run against a fresh local server with the default demo account."""
import base64
import os
import re

from playwright.sync_api import expect, sync_playwright

ORIGIN = os.getenv("LAB_TEST_ORIGIN", "http://127.0.0.1:3080")
PASSWORD = os.getenv("LAB_TEST_ADMIN_PASSWORD", "local-demo-change-me")
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="
)


def nav(page, name):
    page.get_by_role("navigation").get_by_role("link", name=name, exact=True).click()


def run():
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=os.getenv("CHROMIUM_EXECUTABLE"))
        organizer = browser.new_context(permissions=["clipboard-read", "clipboard-write"]).new_page()
        errors = []
        organizer.on("pageerror", lambda error: errors.append(str(error)))
        organizer.goto(f"{ORIGIN}/organizer")
        organizer.get_by_label("Пароль").fill(PASSWORD)
        organizer.get_by_role("button", name="Войти").click()
        organizer.get_by_label("Имя или метка кандидата").fill("Тестовый кандидат")
        organizer.get_by_role("button", name="Создать ссылку").click()
        organizer.get_by_role("button", name="Копировать ссылку").click()
        expect(organizer.get_by_role("status")).to_contain_text("Ссылка скопирована.")
        invite = organizer.evaluate("navigator.clipboard.readText()")
        assert invite.startswith(f"{ORIGIN}/c/"), invite

        candidate = browser.new_context(viewport={"width": 1363, "height": 936}).new_page()
        candidate.on("pageerror", lambda error: errors.append(str(error)))
        candidate.goto(invite)
        candidate.get_by_role("button", name="Начать симуляцию").click()
        expect(candidate.get_by_role("heading", name="Рабочий стол")).to_be_visible()
        expect(candidate.get_by_role("navigation").get_by_role("link")).to_have_count(6)

        nav(candidate, "Данные рынка")
        candidate.get_by_role("button", name=re.compile("Реестры")).click()
        expect(candidate.locator("#asset-list a")).to_have_count(1)
        candidate.get_by_role("link", name=re.compile("Реестр объектов")).click()
        expect(candidate.locator("table tbody tr")).to_have_count(42)
        candidate.get_by_label("Фильтр строк").fill("Меридиан")
        expect(candidate.locator("table tbody tr")).to_have_count(1)
        with candidate.expect_download() as exported:
            candidate.get_by_role("link", name="Скачать оригинал").click()
        assert exported.value.suggested_filename.endswith(".xlsx")

        nav(candidate, "Новости")
        expect(candidate.locator(".timeline li")).to_have_count(1)
        nav(candidate, "Блокнот")
        candidate.get_by_role("button", name="Новая заметка").click()
        candidate.get_by_label("Название").fill("Гипотеза")
        candidate.get_by_label("Заметка").fill("Проверить расхождения в отчётах УК.")
        expect(candidate.get_by_role("status").filter(has_text="Сохранено")).to_be_visible()
        candidate.reload()
        expect(candidate.get_by_label("Заметка")).to_have_value("Проверить расхождения в отчётах УК.")

        nav(candidate, "Люди")
        expect(candidate.get_by_text("8 / 8 сегодня")).to_be_visible()
        candidate.get_by_placeholder("Ваше сообщение…").fill("Готовы обсудить пилот?")
        candidate.get_by_placeholder("Ваше сообщение…").press("Enter")
        expect(candidate.get_by_role("log")).to_contain_text("Готовы обсудить пилот?")
        expect(candidate.get_by_text("7 / 8 сегодня")).to_be_visible()
        candidate.get_by_role("button", name="Показать прототип").click()
        prototype = candidate.get_by_role("dialog")
        prototype.get_by_label("Описание").fill("Сверка актов и договоров.")
        prototype.locator("input[type=file]").set_input_files(
            {"name": "test.png", "mimeType": "image/png", "buffer": PNG}
        )
        prototype.get_by_role("button", name="Показать", exact=True).click()
        expect(candidate.get_by_role("img", name="Скриншот 1")).to_be_visible()

        candidate.get_by_role("button", name=re.compile("Коммерческое предложение")).click()
        offer = candidate.get_by_role("dialog")
        offer.get_by_label("Продукт").fill("Локальный аудит расходов управляющей компании")
        offer.get_by_label("Цена, ₽").fill("95000")
        offer.get_by_label("Разово").check()
        offer.get_by_label("Срок пилота").fill("Четыре недели")
        offer.get_by_label("Условия").fill("Локальная обработка документов и проверка на одном объекте.")
        offer.get_by_role("button", name="Отправить").click()
        expect(candidate.get_by_text("Письмо о намерениях подписано")).to_be_visible()

        candidate.get_by_role("link", name=re.compile("Елена")).click()
        candidate.get_by_role("button", name=re.compile("На согласование")).click()
        approval = candidate.get_by_role("dialog")
        approval.get_by_label("Цена для клиента, ₽").fill("95000")
        approval.get_by_label("Разово").check()
        approval.get_by_label("Стоимость обслуживания клиента, ₽").fill("50000")
        approval.get_by_label("Стоимость привлечения клиента, ₽").fill("5000")
        approval.get_by_label("Срок окупаемости привлечения, мес.").fill("0")
        approval.get_by_label("Клиентов для окупаемости 1,5 млн ₽").fill("38")
        approval.get_by_label("Обоснование").fill("Один пилот, локальная установка, одна неделя внедрения и поддержка.")
        approval.get_by_role("button", name="Отправить").click()
        expect(candidate.get_by_text("Согласовано", exact=True)).to_be_visible()

        candidate.set_viewport_size({"width": 390, "height": 844})
        nav(candidate, "Сдача")
        assert candidate.evaluate("document.documentElement.scrollWidth === innerWidth")
        url = "https://example.com/prototype"
        candidate.get_by_label("Ссылка на прототип").fill(url)
        candidate.get_by_role("button", name="Сохранить, сдам позже").click()
        expect(candidate.get_by_role("status")).to_contain_text("Черновик сохранён.")
        candidate.reload()
        expect(candidate.get_by_label("Ссылка на прототип")).to_have_value(url)
        candidate.get_by_role("button", name="Сдать решение").click()
        candidate.get_by_role("dialog").get_by_role("button", name="Сдать", exact=True).click()
        expect(candidate.get_by_role("heading", name="Решение сдано")).to_be_visible()
        organizer.reload()
        expect(organizer.get_by_role("link", name=url)).to_be_visible()
        expect(organizer.get_by_text("Писем о намерениях: 1")).to_be_visible()
        assert not errors, errors
        browser.close()
        print("Chromium: приглашение, материалы, блокнот, сообщения, вложение, КП, согласование, сдача, кабинет.")


if __name__ == "__main__":
    run()
