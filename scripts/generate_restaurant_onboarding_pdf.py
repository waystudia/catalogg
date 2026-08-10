#!/usr/bin/env python3
"""Generate the short WayYaam restaurant onboarding checklist."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
PHOTO_EXAMPLES = ROOT / "scripts" / "assets" / "restaurant-onboarding-photo-examples.jpg"
PUBLIC_PDF = ROOT / "public" / "downloads" / "wayyaam-restaurant-onboarding-checklist.pdf"
QA_PDF = ROOT / "output" / "pdf" / "wayyaam-restaurant-onboarding-checklist.pdf"

PURPLE = HexColor("#5B3DF5")
PURPLE_DARK = HexColor("#251453")
PURPLE_PALE = HexColor("#F1EEFF")
INK = HexColor("#211D2B")
MUTED = HexColor("#666171")
LINE = HexColor("#E8E4EE")
WARM = HexColor("#FCFAFF")
GREEN = HexColor("#148A5A")


def register_fonts() -> None:
    regular_candidates = (
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    bold_candidates = (
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    )
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if regular is None or bold is None:
        raise FileNotFoundError("A Cyrillic TrueType font was not found.")
    pdfmetrics.registerFont(TTFont("WayYaamRegular", str(regular)))
    pdfmetrics.registerFont(TTFont("WayYaamBold", str(bold)))


def draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    *,
    font: str = "WayYaamRegular",
    size: float = 9,
    color=INK,
    leading: float = 12,
    align: int = 0,
) -> float:
    style = ParagraphStyle(
        "inline",
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )
    paragraph = Paragraph(text, style)
    _, height = paragraph.wrap(width, 200)
    paragraph.drawOn(pdf, x, y - height)
    return height


def draw_card(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    number: str,
    title: str,
    items: list[str],
) -> None:
    pdf.setFillColor(WARM)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, width, height, 14, fill=1, stroke=1)

    pdf.setFillColor(PURPLE)
    pdf.circle(x + 22, y + height - 23, 11, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("WayYaamBold", 9)
    pdf.drawCentredString(x + 22, y + height - 26, number)

    pdf.setFillColor(INK)
    pdf.setFont("WayYaamBold", 12)
    pdf.drawString(x + 41, y + height - 27, title)

    cursor = y + height - 49
    for item in items:
        pdf.setFillColor(GREEN)
        pdf.circle(x + 18, cursor - 3, 2.3, fill=1, stroke=0)
        used = draw_wrapped_text(pdf, item, x + 28, cursor + 2, width - 42, size=8.5, leading=10.4)
        cursor -= max(15, used + 4)


def build_pdf(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    page_width, page_height = A4
    pdf = canvas.Canvas(str(destination), pagesize=A4, pageCompression=1)
    pdf.setTitle("Что подготовить для подключения ресторана к WayYaam")
    pdf.setAuthor("WayYaam")
    pdf.setSubject("Короткая памятка для подключения ресторана")

    # Header
    pdf.setFillColor(PURPLE_DARK)
    pdf.roundRect(25, page_height - 164, page_width - 50, 139, 18, fill=1, stroke=0)
    pdf.setFillColor(PURPLE)
    pdf.roundRect(43, page_height - 61, 78, 22, 11, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("WayYaamBold", 10)
    pdf.drawCentredString(82, page_height - 54, "WayYaam")
    pdf.setFillColor(HexColor("#DCD5FF"))
    pdf.setFont("WayYaamRegular", 8.5)
    pdf.drawRightString(page_width - 43, page_height - 54, "Памятка для ресторана  |  1 страница")

    draw_wrapped_text(
        pdf,
        "Что подготовить для<br/>подключения ресторана",
        43,
        page_height - 78,
        360,
        font="WayYaamBold",
        size=22,
        color=white,
        leading=24,
    )
    draw_wrapped_text(
        pdf,
        "Соберите данные и материалы в одной папке. Обычно это занимает 10-15 минут.",
        43,
        page_height - 133,
        465,
        size=9.5,
        color=HexColor("#E9E4FF"),
        leading=12,
    )

    # Owner and restaurant details
    gap = 12
    margin = 34
    column_width = (page_width - margin * 2 - gap) / 2
    cards_y = page_height - 329
    card_height = 151
    draw_card(
        pdf,
        margin,
        cards_y,
        column_width,
        card_height,
        "1",
        "Владелец / представитель",
        [
            "Фамилия, имя и отчество полностью",
            "Личный номер телефона",
            "Рабочий номер телефона",
            "Email для документов и входа",
            "Роль: владелец, директор или представитель",
        ],
    )
    draw_card(
        pdf,
        margin + column_width + gap,
        cards_y,
        column_width,
        card_height,
        "2",
        "Ресторан",
        [
            "Название и юридическое наименование",
            "ИНН и форма: ИП, ООО или самозанятый",
            "Город и точный адрес заведения",
            "Режим работы",
            "Доставка: своя, WayYaam или самовывоз",
        ],
    )

    # Menu essentials
    menu_y = page_height - 423
    pdf.setFillColor(PURPLE_PALE)
    pdf.setStrokeColor(HexColor("#DDD6FF"))
    pdf.roundRect(margin, menu_y, page_width - margin * 2, 80, 14, fill=1, stroke=1)
    pdf.setFillColor(PURPLE)
    pdf.circle(margin + 22, menu_y + 56, 11, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("WayYaamBold", 9)
    pdf.drawCentredString(margin + 22, menu_y + 53, "3")
    pdf.setFillColor(INK)
    pdf.setFont("WayYaamBold", 12)
    pdf.drawString(margin + 41, menu_y + 52, "Меню и цены")
    menu_items = [
        "Категории и названия блюд",
        "Цена, состав и вес / объём",
        "Добавки и варианты выбора",
        "Логотип, если он уже есть",
    ]
    item_width = (page_width - margin * 2 - 36) / 2
    for index, item in enumerate(menu_items):
        column = index % 2
        row = index // 2
        item_x = margin + 18 + column * item_width
        item_y = menu_y + 30 - row * 18
        pdf.setFillColor(GREEN)
        pdf.circle(item_x, item_y + 2, 2.3, fill=1, stroke=0)
        draw_wrapped_text(pdf, item, item_x + 9, item_y + 7, item_width - 14, size=8.5, leading=10)

    # Photo examples
    photo_title_y = menu_y - 28
    pdf.setFillColor(PURPLE)
    pdf.circle(margin + 11, photo_title_y + 3, 11, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("WayYaamBold", 9)
    pdf.drawCentredString(margin + 11, photo_title_y, "4")
    pdf.setFillColor(INK)
    pdf.setFont("WayYaamBold", 12)
    pdf.drawString(margin + 31, photo_title_y - 1, "Пять общих фотографий")
    pdf.setFillColor(MUTED)
    pdf.setFont("WayYaamRegular", 8.5)
    pdf.drawRightString(page_width - margin, photo_title_y - 1, "Снимайте горизонтально, при дневном свете")

    photo_y = 218
    photo_height = 145
    photo_width = page_width - margin * 2
    image = ImageReader(str(PHOTO_EXAMPLES))
    pdf.setFillColor(white)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(margin, photo_y, photo_width, photo_height, 10, fill=1, stroke=1)
    pdf.saveState()
    path = pdf.beginPath()
    path.roundRect(margin, photo_y, photo_width, photo_height, 10)
    pdf.clipPath(path, stroke=0, fill=0)
    pdf.drawImage(image, margin, photo_y, width=photo_width, height=photo_height, preserveAspectRatio=False, mask="auto")
    pdf.restoreState()

    labels = ["Вход", "Зал", "Лучшие блюда", "Кухня", "Упаковка"]
    label_width = photo_width / 5
    for index, label in enumerate(labels):
        center_x = margin + label_width * (index + 0.5)
        pdf.setFillColor(PURPLE_DARK)
        pdf.roundRect(center_x - 31, photo_y + 7, 62, 16, 8, fill=1, stroke=0)
        pdf.setFillColor(white)
        pdf.setFont("WayYaamBold", 7.2)
        pdf.drawCentredString(center_x, photo_y + 12, label)

    # Send note and privacy footer
    pdf.setFillColor(HexColor("#F3FAF7"))
    pdf.setStrokeColor(HexColor("#CDEBDD"))
    pdf.roundRect(margin, 145, page_width - margin * 2, 54, 12, fill=1, stroke=1)
    pdf.setFillColor(GREEN)
    pdf.setFont("WayYaamBold", 10)
    pdf.drawString(margin + 16, 179, "Как отправить")
    draw_wrapped_text(
        pdf,
        "Одной папкой или одним сообщением. Фото блюд можно добавить позже - начните с 5 самых продаваемых позиций.",
        margin + 16,
        173,
        page_width - margin * 2 - 32,
        size=8.5,
        color=INK,
        leading=10.5,
    )

    pdf.setFillColor(MUTED)
    pdf.setFont("WayYaamRegular", 7.5)
    pdf.drawString(margin, 116, "Не отправляйте паспорт, данные банковской карты и пароли. Если понадобится дополнительный документ, мы запросим его отдельно.")
    pdf.setFillColor(PURPLE)
    pdf.setFont("WayYaamBold", 8)
    pdf.drawString(margin, 93, "support@wayyaam.ru")
    pdf.drawRightString(page_width - margin, 93, "wayyaam.ru")

    pdf.showPage()
    pdf.save()


def main() -> None:
    register_fonts()
    if not PHOTO_EXAMPLES.exists():
        raise FileNotFoundError(f"Missing photo examples: {PHOTO_EXAMPLES}")
    build_pdf(PUBLIC_PDF)
    QA_PDF.parent.mkdir(parents=True, exist_ok=True)
    QA_PDF.write_bytes(PUBLIC_PDF.read_bytes())
    print(PUBLIC_PDF)
    print(QA_PDF)


if __name__ == "__main__":
    main()
