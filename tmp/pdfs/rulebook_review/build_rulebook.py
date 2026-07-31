from __future__ import annotations

import html
import re
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[3]
WORK_DIR = ROOT / "tmp" / "pdfs" / "rulebook_review"
SOURCE_MD = WORK_DIR / "Matths_서비스_최종_룰북_v1.0_문구개선본.md"
ORIGINAL_PDF = Path(
    "/Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/"
    "Matths Logic MD Files/Rules/Matths_서비스_최종_룰북_v1.0.pdf"
)
REPLACEMENT_PDF = WORK_DIR / "replacement_pages_11_26.pdf"
OUTPUT_PDF = ROOT / "output" / "pdf" / "Matths_서비스_최종_룰북_v1.0_문구개선본.pdf"

FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
MATH_FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT = "AppleGothic"
MATH_FONT = "ArialUnicode"

NAVY = colors.HexColor("#10243E")
TEXT = colors.HexColor("#172033")
TEXT_SOFT = colors.HexColor("#20324A")
BLUE = colors.HexColor("#246BD0")
LINK_BLUE = colors.HexColor("#174F8C")
MUTED = colors.HexColor("#5E6B7D")
LINE = colors.HexColor("#CFD9E6")
CODE_BG = colors.HexColor("#F2F5F9")
TEAL = colors.HexColor("#18A8B8")
TEAL_BG = colors.HexColor("#EAF8FA")
QUOTE_BG = colors.HexColor("#EDF4FC")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(FONT, FONT_PATH))
    pdfmetrics.registerFont(TTFont(MATH_FONT, MATH_FONT_PATH))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT, italic=FONT, boldItalic=FONT)


def make_styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "BodyKorean",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=9.0,
            leading=13.0,
            textColor=TEXT,
            alignment=TA_LEFT,
            spaceAfter=5.5,
            wordWrap="CJK",
        ),
        "h1": ParagraphStyle(
            "SectionHeading",
            parent=sample["Heading1"],
            fontName=FONT,
            fontSize=18,
            leading=23,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=9,
            keepWithNext=True,
            wordWrap="CJK",
        ),
        "h2": ParagraphStyle(
            "SubsectionHeading",
            parent=sample["Heading2"],
            fontName=FONT,
            fontSize=13,
            leading=17,
            textColor=BLUE,
            spaceBefore=7,
            spaceAfter=5,
            keepWithNext=True,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "BulletKorean",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=8.8,
            leading=12.2,
            textColor=TEXT,
            leftIndent=13,
            bulletIndent=0,
            spaceAfter=3.7,
            wordWrap="CJK",
        ),
        "number": ParagraphStyle(
            "NumberKorean",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=8.8,
            leading=12.2,
            textColor=TEXT,
            leftIndent=14,
            bulletIndent=0,
            spaceAfter=3.7,
            wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "CodeKorean",
            parent=sample["Code"],
            fontName=FONT,
            fontSize=7.9,
            leading=11.2,
            textColor=TEXT_SOFT,
        ),
        "formula": ParagraphStyle(
            "Formula",
            parent=sample["BodyText"],
            fontName=MATH_FONT,
            fontSize=10.3,
            leading=15,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=7.6,
            leading=9.5,
            textColor=colors.white,
            wordWrap="CJK",
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=7.6,
            leading=9.7,
            textColor=TEXT_SOFT,
            wordWrap="CJK",
        ),
        "quote_title": ParagraphStyle(
            "QuoteTitle",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=8.7,
            leading=12,
            textColor=LINK_BLUE,
            spaceAfter=4,
            wordWrap="CJK",
        ),
        "quote_body": ParagraphStyle(
            "QuoteBody",
            parent=sample["BodyText"],
            fontName=FONT,
            fontSize=8.3,
            leading=11.8,
            textColor=TEXT_SOFT,
            wordWrap="CJK",
        ),
    }


def inline_markup(text: str) -> str:
    safe = html.escape(text, quote=False)
    safe = safe.replace("Main→Sub", "Main→Sub")
    safe = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe)
    safe = re.sub(
        r"`([^`]+)`",
        rf'<font name="{FONT}" color="{LINK_BLUE.hexval()}">\1</font>',
        safe,
    )
    return safe


FORMULAS = {
    r"Eligible = (streakDays \ge 30) \land (refundChallengeDays \ge 30)":
        "Eligible = (streakDays ≥ 30) AND (refundChallengeDays ≥ 30)",
    "bonusAccessDays = refundChallengeDays - 29":
        "bonusAccessDays = refundChallengeDays - 29",
    r"S_i = \frac{N - r_i}{N - 1}":
        "S<sub>i</sub> = (N - r<sub>i</sub>) / (N - 1)",
    r"E_{ij} = \frac{1}{1 + 10^{(MMR_j - MMR_i)/400}}":
        "E<sub>ij</sub> = 1 / [1 + 10<super>((MMR<sub>j</sub> - MMR<sub>i</sub>) / 400)</super>]",
    r"E_i = \frac{1}{N - 1}\sum_{j \ne i} E_{ij}":
        "E<sub>i</sub> = [1 / (N - 1)] × SUM(j ≠ i, E<sub>ij</sub>)",
    r"\Delta MMR_i = K(S_i - E_i)":
        "ΔMMR<sub>i</sub> = K(S<sub>i</sub> - E<sub>i</sub>)",
    r"MMR_i^{new} = \max(0,\ round(MMR_i^{old} + \Delta MMR_i))":
        "MMR<sub>i</sub>(new) = max(0, round(MMR<sub>i</sub>(old) + ΔMMR<sub>i</sub>))",
    r"S_A = \frac{100 - 20}{100 - 1} = \frac{80}{99} \approx 0.8081":
        "S<sub>A</sub> = (100 - 20) / (100 - 1) = 80 / 99 ≈ 0.8081",
    r"\Delta MMR_A = 24(0.8081 - 0.55) \approx 6.1944":
        "ΔMMR<sub>A</sub> = 24(0.8081 - 0.55) ≈ 6.1944",
    "ClosingBonus = OpeningBonus + DefenseTransfers - DailyUse - ChallengeBurn - ShopBurn - ExpiryBurn":
        "ClosingBonus = OpeningBonus + DefenseTransfers - DailyUse - ChallengeBurn - ShopBurn - ExpiryBurn",
    r"Blocked = MAIN \land (bonusAccessDays > 0 \lor lockedDays > 0 \lor activeMatch)":
        "Blocked = MAIN AND (bonusAccessDays > 0 OR lockedDays > 0 OR activeMatch)",
}


def formula_flowable(raw: str, styles: dict[str, ParagraphStyle], width: float) -> Table:
    key = raw.strip()
    text = FORMULAS[key] if key in FORMULAS else html.escape(key, quote=False)
    table = Table([[Paragraph(text, styles["formula"])]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), TEAL_BG),
                ("BOX", (0, 0), (-1, -1), 0.55, colors.HexColor("#75D2DC")),
                ("LINEBEFORE", (0, 0), (0, -1), 2.2, TEAL),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    table.spaceBefore = 2
    table.spaceAfter = 7
    return table


def code_flowable(raw: str, styles: dict[str, ParagraphStyle], width: float) -> Table:
    content = raw.replace("-&gt;", "→").replace("->", "→")
    pre = Preformatted(content, styles["code"])
    table = Table([[pre]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                ("BOX", (0, 0), (-1, -1), 0.45, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    table.spaceAfter = 7
    return table


def table_widths(headers: list[str], width: float) -> list[float]:
    key = tuple(h.replace("`", "").strip() for h in headers)
    if key in {("기호", "뜻"), ("단계", "조치"), ("상황", "처리"), ("이벤트", "반드시 안내할 내용")}:
        return [width * 0.28, width * 0.72]
    if key == ("사용자 구분", "K"):
        return [width * 0.72, width * 0.28]
    if key == ("MMR", "티어"):
        return [width * 0.46, width * 0.54]
    if key == ("항목", "Sub Ranking", "Main Ranking"):
        return [width * 0.22, width * 0.39, width * 0.39]
    if key == ("구간", "대상", "잠금 일수"):
        return [width * 0.28, width * 0.51, width * 0.21]
    if key == ("아이템", "가격", "효과"):
        return [width * 0.31, width * 0.15, width * 0.54]
    count = len(headers)
    return [width / count] * count


def markdown_table(
    rows: list[list[str]], styles: dict[str, ParagraphStyle], width: float
) -> Table:
    headers = rows[0]
    data: list[list[Paragraph]] = []
    for row_index, row in enumerate(rows):
        style = styles["table_header"] if row_index == 0 else styles["table_body"]
        data.append([Paragraph(inline_markup(cell.strip()), style) for cell in row])
    table = Table(data, colWidths=table_widths(headers, width), repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for row_index in range(1, len(data)):
        fill = colors.HexColor("#F2F6FA") if row_index % 2 else colors.white
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), fill))
    table.setStyle(TableStyle(commands))
    table.spaceAfter = 7
    return table


def quote_flowable(
    lines: list[str], styles: dict[str, ParagraphStyle], width: float
) -> Table:
    cleaned = [line.strip() for line in lines if line.strip()]
    cells = []
    for index, line in enumerate(cleaned):
        style = styles["quote_title"] if index == 0 else styles["quote_body"]
        cells.append(Paragraph(inline_markup(line), style))
    table = Table([[cells]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), QUOTE_BG),
                ("LINEBEFORE", (0, 0), (0, -1), 2.2, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    table.spaceAfter = 7
    return table


def extract_revised_segment(markdown: str) -> str:
    start = markdown.index("### 5.2 정상적인 상태 전환")
    chapter_20 = markdown.index("## 20. 알림", start)
    end = markdown.index("\n---", chapter_20)
    segment = markdown[start:end].strip()

    page_breaks = [
        "- 계정 정지나 이용 제한은 약관상 근거와 사전 통지, 이의신청 절차를 갖춰야 한다.",
        "- 정가가 아닌 쿠폰·포인트 적용 후 실제 결제액을 기준으로 한다.",
        "### 8.3 Placement 기간의 MMR",
        "```text\nactiveRanking = MAIN",
        "> **Main Ranking에 입장하려면 Sub Ranking 목표를 완료하세요.**",
        "- 사용자는 세 Time Slot 중 하나를 공식 응시(Official Attempt)로 미리 선택한다.",
        "## 12. MMR 계산",
        "$$\nMMR_i^{new} =",
        "## 13. Rank Takeover 공통 규칙",
        "- 제재 중이거나 검토 보류 상태가 아님",
        "## 14. Sub Ranking Rank Takeover 정산",
        "- 방어자의 추가 학습권은 차감하지 않는다.",
        "## 17. Main Ranking 재결제 제한",
        "- 문제 또는 정답 유출 정황",
        "### 19.3 결제·페이백 재시도",
    ]
    for marker in page_breaks:
        if marker not in segment:
            raise ValueError(f"Page-break marker not found: {marker}")
        segment = segment.replace(marker, f"<!-- PAGE_BREAK -->\n{marker}", 1)
    return segment


def parse_markdown(
    markdown: str, styles: dict[str, ParagraphStyle], content_width: float
) -> list:
    lines = markdown.splitlines()
    flowables: list = []
    paragraph_buffer: list[str] = []

    def flush_paragraph() -> None:
        if paragraph_buffer:
            text = " ".join(part.strip() for part in paragraph_buffer)
            flowables.append(Paragraph(inline_markup(text), styles["body"]))
            paragraph_buffer.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            i += 1
            continue

        if stripped == "<!-- PAGE_BREAK -->":
            flush_paragraph()
            flowables.append(PageBreak())
            i += 1
            continue

        if stripped == "---":
            flush_paragraph()
            flowables.append(Spacer(1, 5))
            flowables.append(HRFlowable(width="100%", thickness=0.55, color=LINE))
            flowables.append(Spacer(1, 6))
            i += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            flowables.append(code_flowable("\n".join(code_lines), styles, content_width))
            continue

        if stripped == "$$":
            flush_paragraph()
            formula_lines: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip() != "$$":
                formula_lines.append(lines[i].strip())
                i += 1
            i += 1
            flowables.append(
                formula_flowable(" ".join(formula_lines), styles, content_width)
            )
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(
            r"^\s*\|?[\s:|-]+\|", lines[i + 1]
        ):
            flush_paragraph()
            table_lines = [stripped]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            rows = [
                [cell.strip() for cell in table_line.strip("|").split("|")]
                for table_line in table_lines
            ]
            flowables.append(markdown_table(rows, styles, content_width))
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            quote_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip()[1:].strip())
                i += 1
            flowables.append(quote_flowable(quote_lines, styles, content_width))
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            flowables.append(Paragraph(inline_markup(stripped[3:]), styles["h1"]))
            i += 1
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            flowables.append(Paragraph(inline_markup(stripped[4:]), styles["h2"]))
            i += 1
            continue

        bullet_match = re.match(r"^-\s+(.+)$", stripped)
        if bullet_match:
            flush_paragraph()
            flowables.append(
                Paragraph(
                    inline_markup(bullet_match.group(1)),
                    styles["bullet"],
                    bulletText="•",
                )
            )
            i += 1
            continue

        number_match = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if number_match:
            flush_paragraph()
            flowables.append(
                Paragraph(
                    inline_markup(number_match.group(2)),
                    styles["number"],
                    bulletText=number_match.group(1),
                )
            )
            i += 1
            continue

        paragraph_buffer.append(stripped)
        i += 1

    flush_paragraph()
    return flowables


def draw_page_chrome(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(48, height - 25, "MATTHS · 서비스 최종 룰북")
    canvas.drawRightString(width - 48, height - 25, "정책 기준본 v1.0 · 2026-07-30")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.55)
    canvas.line(48, height - 34, width - 48, height - 34)
    canvas.line(48, 37, width - 48, 37)
    canvas.setFont(FONT, 7.3)
    canvas.drawCentredString(width / 2, 23, str(canvas.getPageNumber() + 9))
    canvas.restoreState()


def build_replacement() -> None:
    register_fonts()
    styles = make_styles()
    markdown = SOURCE_MD.read_text(encoding="utf-8")
    segment = extract_revised_segment(markdown)

    left_margin = 54
    right_margin = 48
    content_width = A4[0] - left_margin - right_margin
    story = parse_markdown(segment, styles, content_width)

    document = SimpleDocTemplate(
        str(REPLACEMENT_PDF),
        pagesize=A4,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=61,
        bottomMargin=50,
        title="Matths 서비스 최종 룰북 v1.0 - 11~26페이지 문구 개선본",
        author="Matths",
        subject="11~26페이지 한국어 문장 및 영문 용어 개선",
    )
    document.build(story, onFirstPage=draw_page_chrome, onLaterPages=draw_page_chrome)

    replacement_reader = PdfReader(str(REPLACEMENT_PDF))
    if len(replacement_reader.pages) != 16:
        raise RuntimeError(
            f"Replacement must contain exactly 16 pages; got {len(replacement_reader.pages)}"
        )


def merge_with_original() -> None:
    original = PdfReader(str(ORIGINAL_PDF))
    replacement = PdfReader(str(REPLACEMENT_PDF))
    if len(original.pages) != 33:
        raise RuntimeError(f"Expected 33 original pages; got {len(original.pages)}")

    writer = PdfWriter()
    for page in original.pages[:10]:
        writer.add_page(page)
    for page in replacement.pages:
        writer.add_page(page)
    for page in original.pages[26:]:
        writer.add_page(page)

    metadata = dict(original.metadata or {})
    metadata.update(
        {
            "/Title": "Matths 서비스 최종 룰북 v1.0 - 문구 개선본",
            "/Subject": "11~26페이지 한국어 문장 및 영문 용어 개선",
            "/Author": "Matths",
            "/Producer": "ReportLab + pypdf",
        }
    )
    writer.add_metadata(metadata)
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PDF.open("wb") as stream:
        writer.write(stream)

    final_reader = PdfReader(str(OUTPUT_PDF))
    if len(final_reader.pages) != 33:
        raise RuntimeError(f"Expected 33 final pages; got {len(final_reader.pages)}")


if __name__ == "__main__":
    build_replacement()
    merge_with_original()
    print(OUTPUT_PDF)
