"""Parse the cached bulletin.sfsu.edu pages into structured JSON.

Usage: python3 scraper/parse.py <cache_dir> <out_dir>
"""
import collections
import copy
import gzip
import json
import os
import re
import sys
import urllib.parse

from bs4 import BeautifulSoup, NavigableString, Tag

BASE = "https://bulletin.sfsu.edu"
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".cache")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data", "sfsu")


# --------------------------------------------------------------------------- helpers

def clean(s):
    if s is None:
        return ""
    s = s.replace("\xa0", " ").replace("​", "").replace("‑", "-")
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return s.strip()


def one_line(s):
    return re.sub(r"\s+", " ", clean(s)).strip()


def url_of(path):
    path = path.strip("/")
    return f"{BASE}/{path}/" if path and not path.endswith(".html") else f"{BASE}/{path}"


def path_of(url):
    return url.replace(BASE, "").strip("/")


def load(path):
    p = os.path.join(CACHE, path.strip("/") or "index", "page.html.gz")
    with gzip.open(p) as f:
        return BeautifulSoup(f.read().decode("utf-8", "replace"), "lxml")


def all_paths():
    with open(os.path.join(CACHE, "urls.txt")) as f:
        return [path_of(u.strip()) for u in f if u.strip()]


def page_title(soup):
    h = soup.select_one("h1.page-title")
    return one_line(h.get_text(" ")) if h else ""


def breadcrumb(soup):
    bc = soup.select_one("#breadcrumb")
    if not bc:
        return []
    return [one_line(x.get_text(" ")) for x in bc.select("li, a, span") if x.name in ("li",)] or \
        [one_line(t) for t in bc.get_text("|").split("|") if one_line(t)]


def number(s):
    s = one_line(s)
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def parse_units(s):
    """'3' -> (3,3); '1-3' -> (1,3); '3-4' -> (3,4)."""
    s = one_line(s).replace("–", "-").replace("—", "-")
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$", s)
    if m:
        return number(m.group(1)), number(m.group(2))
    m = re.match(r"^(\d+(?:\.\d+)?)$", s)
    if m:
        n = number(m.group(1))
        return n, n
    return None, None


# --------------------------------------------------------------------------- subjects / course codes

def load_subjects():
    soup = load("courses")
    subjects = []
    for a in soup.select("#atozindex li a"):
        href = a.get("href", "")
        name = one_line(a.get_text(" "))
        m = re.match(r"^(.*)\(([^()]+)\)$", name)
        if not m or href.strip("/") == "courses/all":
            continue
        subjects.append({"subject_code": m.group(2).strip(), "subject_name": m.group(1).strip(),
                         "url": BASE + href})
    return subjects


SUBJECTS = None
CODE_RE = None


def init_code_regex(subjects):
    global CODE_RE
    codes = sorted({s["subject_code"] for s in subjects}, key=len, reverse=True)
    alt = "|".join(re.escape(c).replace(r"\ ", r"[ \xa0]") for c in codes)
    CODE_RE = re.compile(r"(?<![A-Za-z])(" + alt + r")[ \xa0](\d{2,4}[A-Z]{0,4})(?![A-Za-z0-9])")


def norm_code(s):
    s = one_line(s)
    m = CODE_RE.search(s) if CODE_RE else None
    if m:
        return f"{m.group(1).replace(chr(160), ' ')} {m.group(2)}"
    return s


CONT_RE = re.compile(r"(\*?)(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or|&)\s+|\s*/\s*)(\d{3}[A-Z]{0,4})(?![A-Za-z0-9])(\*?)")


def code_spans(text):
    """[(code, start, end, starred)] for every course code in text, including bare numbers that
    continue a list after a full code, e.g. 'CHEM 300 and 340' or 'TH A 130* or 132*'."""
    text = (text or "").replace("\xa0", " ")
    out = []
    for m in CODE_RE.finditer(text):
        subj = m.group(1).replace("\xa0", " ")
        out.append((f"{subj} {m.group(2)}", m.start(), m.end(), text[m.end():m.end() + 1] == "*"))
        pos = m.end()
        while True:
            cm = CONT_RE.match(text, pos)
            if not cm:
                break
            out.append((f"{subj} {cm.group(2)}", cm.start(2), cm.end(2), cm.group(3) == "*"))
            pos = cm.end()
    return out


def link_code(a):
    """Course code a bulletin link points to (href ?P=), falling back to its title/text."""
    m = re.search(r"[?&]P=([^&]+)", a.get("href", ""))
    if m:
        return norm_code(urllib.parse.unquote_plus(m.group(1)))
    return norm_code(a.get("title") or a.get_text(" "))


def link_aliases(a):
    """'DS/ECON 212' -> ['DS 212', 'ECON 212'] (cross-listed codes shown on one link)."""
    t = one_line(a.get("title") or a.get_text(" "))
    parts = [x.strip() for x in t.split("/") if x.strip()]
    if len(parts) < 2:
        return []
    shared = re.search(r"(\d{2,4}[A-Z]{0,4})$", parts[-1])
    out = []
    for x in parts:
        if re.search(r"\d", x):
            out.append(norm_code(x))
        elif shared:
            out.append(f"{x} {shared.group(1)}")
    return out


def codes_in(node_or_text):
    """Course codes referenced in an element (link titles) or a text string, in order, deduped."""
    found = []
    if isinstance(node_or_text, Tag):
        for a in node_or_text.select("a.code, a.bubblelink"):
            c = link_code(a)
            if c:
                found.append(c)
        text = node_or_text.get_text(" ")
    else:
        text = node_or_text or ""
    found += [c for c, _, _, _ in code_spans(text)]
    seen, out = set(), []
    for c in found:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


# --------------------------------------------------------------------------- HTML -> markdown

def inline(node):
    if isinstance(node, NavigableString):
        if node.__class__.__name__ in ("Comment", "Doctype"):
            return ""
        return str(node)
    if not isinstance(node, Tag):
        return ""
    if node.name in ("script", "style", "noscript"):
        return ""
    if node.name == "br":
        return "\n"
    if node.name == "sup":
        t = one_line(node.get_text(" "))
        if t.lower() in ("st", "nd", "rd", "th"):
            return t
        return f"[{t}]" if t else ""
    inner = "".join(inline(c) for c in node.children)
    if node.name in ("strong", "b") and one_line(inner):
        pre = " " if inner[:1].isspace() else ""
        post = " " if inner[-1:].isspace() else ""
        return f"{pre}**{one_line(inner)}**{post}"
    return inner


def table_md(table):
    cls = table.get("class") or []
    if "sc_courselist" in cls:
        lines = []
        for row in parse_courselist_rows(table):
            if row["type"] == "course":
                prefix = "or " if row.get("or") else ""
                u = f" | {row['units']}" if row.get("units") else ""
                lines.append(f"- {prefix}{' & '.join(row['codes'])} | {row['title']}{u}")
            elif row["type"] == "total":
                lines.append(f"- **{row['text']}: {row['units']}**")
            else:
                u = f" | {row['units']}" if row.get("units") else ""
                mark = "**" if row["type"] == "header" else ""
                lines.append(f"- {mark}{row['text']}{mark}{u}")
        return "\n".join(lines)
    if "sc_plangrid" in cls:
        g = parse_plangrid(table)
        return plangrid_md(g)
    rows = []
    for tr in table.find_all("tr"):
        cells = [one_line(inline(td)) for td in tr.find_all(["td", "th"])]
        if any(cells):
            rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)


def to_md(node, depth=0):
    """Block-level markdown rendering of an element's children."""
    out = []
    buf = []

    def flush():
        t = clean("".join(buf))
        if t:
            out.append(t)
        buf.clear()

    for c in node.children:
        if isinstance(c, NavigableString):
            if c.__class__.__name__ in ("Comment", "Doctype"):
                continue
            buf.append(str(c))
            continue
        if not isinstance(c, Tag):
            continue
        name = c.name
        cls = c.get("class") or []
        if name in ("script", "style", "noscript") or "hidden" in cls and name != "table":
            continue
        if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            flush()
            t = one_line(inline(c).replace("**", ""))
            if t:
                out.append("#" * int(name[1]) + " " + t)
        elif name == "p":
            flush()
            t = clean(inline(c))
            if t:
                out.append(t)
        elif name in ("ul", "ol"):
            flush()
            t = render_list(c, depth)
            if t:
                out.append(t)
        elif name == "table":
            flush()
            t = table_md(c)
            if t:
                out.append(t)
        elif name == "dl":
            flush()
            items = []
            for dt in c.find_all("dt"):
                dd = dt.find_next_sibling("dd")
                items.append(f"[{one_line(dt.get_text(' '))}] {one_line(inline(dd)) if dd else ''}")
            if items:
                out.append("Footnotes:\n" + "\n".join(items))
        elif name in ("div", "section", "article", "blockquote", "center", "span") and c.find(
                ["p", "h2", "h3", "h4", "ul", "ol", "table", "div", "dl"]):
            flush()
            t = to_md(c, depth)
            if t:
                out.append(t)
        elif name == "a" and c.get("name") and not one_line(c.get_text()):
            continue
        else:
            buf.append(inline(c))
    flush()
    return "\n\n".join(x for x in out if x.strip())


def own_text(el):
    """Inline text of an element, leaving out nested lists and tables."""
    return one_line("".join(inline(ch) for ch in el.children
                            if not (isinstance(ch, Tag) and (ch.name in ("ul", "ol", "table") or
                                                             (ch.name in ("div", "p") and ch.find(["ul", "ol", "table"]))))))


def indent_block(text, depth):
    return "\n".join(("  " * depth + line) if line.strip() else line for line in text.split("\n"))


def render_list(lst, depth=0):
    lines = []
    for i, li in enumerate(lst.find_all("li", recursive=False), 1):
        bullet = f"{i}." if lst.name == "ol" else "-"
        text = own_text(li)
        if text:
            lines.append("  " * depth + f"{bullet} {text}")
        for ch in li.children:
            if not isinstance(ch, Tag):
                continue
            if ch.name in ("ul", "ol"):
                lines.append(render_list(ch, depth + 1))
            elif ch.name == "table":
                lines.append(indent_block(table_md(ch), depth + 1))
            elif ch.name in ("div", "p") and ch.find(["ul", "ol", "table"]):
                lines.append(indent_block(to_md(ch, depth + 1), depth + 1))
    return "\n".join(x for x in lines if x.strip())


def sections_from_md(md, base_path=None):
    """Split markdown into heading-delimited sections, keeping a heading path."""
    base_path = base_path or []
    sections = []
    stack = []  # (level, title)
    cur = {"heading_path": list(base_path), "text": []}
    for block in md.split("\n\n"):
        m = re.match(r"^(#{1,6}) (.+)$", block)
        if m and "\n" not in block:
            if any(x.strip() for x in cur["text"]):
                sections.append(cur)
            lvl = len(m.group(1))
            stack = [s for s in stack if s[0] < lvl] + [(lvl, m.group(2))]
            cur = {"heading_path": list(base_path) + [s[1] for s in stack], "text": []}
        else:
            cur["text"].append(block)
    if any(x.strip() for x in cur["text"]):
        sections.append(cur)
    return [{"heading_path": s["heading_path"], "text": "\n\n".join(s["text"]).strip()} for s in sections]


# --------------------------------------------------------------------------- tabs

def tabs_of(soup):
    """Return list of (tab_id, label, container) in display order."""
    labels = {}
    for li in soup.select("#tabs li[id$=texttab], li[id$=texttab]"):
        labels[li["id"][:-3]] = one_line(li.get_text(" "))
    tabs = []
    for div in soup.select("div[id$=textcontainer]"):
        if div.find_parent("div", id=re.compile(r"textcontainer$")):
            continue
        tid = div["id"][: -len("container")]
        label = labels.get(tid, "Overview" if tid == "text" else tid.replace("text", "").title())
        tabs.append((tid, label, div))
    if not tabs:
        main = soup.select_one("#content, main, #col-content")
        if main:
            tabs.append(("text", "Overview", main))
    return tabs


def page_doc(soup, path):
    tabs = []
    for tid, label, div in tabs_of(soup):
        md = to_md(div)
        tabs.append({"tab": label, "markdown": md, "sections": sections_from_md(md)})
    return tabs


# --------------------------------------------------------------------------- course lists (requirements)

def _first_tag(td):
    return next((ch for ch in td.children if isinstance(ch, Tag)), None) if td is not None else None


def _indented(td):
    first = _first_tag(td)
    return first is not None and "blockindent" in (first.get("class") or [])


def parse_courselist_rows(table):
    rows = []
    for tr in table.find_all("tr"):
        cls = tr.get("class") or []
        if "hidden" in cls or tr.find("th"):
            continue
        tds = tr.find_all("td", recursive=False)
        if not tds:
            continue
        hours = tr.select_one("td.hourscol")
        units = one_line(hours.get_text(" ")).replace("–", "-") if hours else ""
        codecol = tr.select_one("td.codecol")
        first_td = codecol or tds[0]
        comment = tr.select_one("span.courselistcomment")
        links = codecol.select("a.code, a.bubblelink") if codecol else []
        indent = _indented(first_td)
        if "listsum" in cls or (not links and one_line(tr.get_text(" ")).lower().startswith("total")):
            rows.append({"type": "total", "text": one_line(tds[0].get_text(" ") if len(tds) < 2 else
                                                            " ".join(td.get_text(" ") for td in tds[:-1])),
                         "units": units})
            continue
        code_text = one_line(codecol.get_text(" ")) if codecol else ""
        bare = [] if links or not codecol or comment else code_spans(code_text)
        if links or (bare and len(tds) >= 2 and bare[0][1] <= 3):
            codes, aliases = [], []
            for a in links:
                c = link_code(a)
                if c not in codes:
                    codes.append(c)
                aliases += [x for x in link_aliases(a) if x != c]
            if not links:
                codes = list(dict.fromkeys(c for c, _, _, _ in bare))
            title_td = tds[1] if len(tds) > 1 else None
            title = one_line(inline(title_td)) if title_td else ""
            row = {"type": "course", "codes": codes, "title": title, "units": units, "indent": indent}
            if aliases:
                row["aliases"] = list(dict.fromkeys(aliases))
            if "orclass" in cls or code_text.lower().startswith("or "):
                row["or"] = True
            rows.append(row)
        elif comment or one_line(tr.get_text(" ")):
            text = one_line(inline(tds[0] if len(tds) == 1 or not hours else
                                   [td for td in tds if td is not hours][0]))
            if not text:
                text = one_line(tr.get_text(" "))
            is_header = "areaheader" in cls or (comment and "areaheader" in (comment.get("class") or []))
            rows.append({"type": "header" if is_header else "comment", "text": text, "units": units,
                         "indent": indent or bool(comment and "commentindent" in (comment.get("class") or []))})
    return rows


CHOICE_RE = re.compile(
    r"\b(?:select|choose)\b|^(?:complete|take|pick)\s+(?:one|two|three|four|five|six|seven|eight|\d+|"
    r"a minimum|at least|any|up to|no more than)\b|\b(?:of|from) the following\b|from:\s*$", re.I)


NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
             "ten": 10, "eleven": 11, "twelve": 12, "a": 1, "an": 1}


def parse_choice(text):
    """'Select Two:' -> {count: 2}; 'Select 6 units' -> {units: '6'}; 'Select a Maximum of One' -> {count: 1, qualifier: 'maximum'}."""
    out = {}
    t = text.lower()
    q = re.search(r"\b(maximum|minimum|at least|at most|no more than|up to)(?:\s+of)?\s+"
                  r"(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b", t)
    if q and not re.search(r"\b(?:prefix|prefixes|categories|areas|departments|disciplines)\b", t[q.end():q.end() + 30]):
        out["qualifier"] = q.group(1)
    m = re.search(r"(\d+(?:\s*[-–]\s*\d+)?)\s*(?:semester\s+)?units?\b", t)
    if m:
        out["units"] = m.group(1).replace(" ", "").replace("–", "-")
    m = re.search(r"\b(?:select|choose|complete|take|pick)\s+(?:a\s+)?(?:maximum\s+of\s+|minimum\s+of\s+|at\s+least\s+|"
                  r"up\s+to\s+|any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b"
                  r"(?!\d|(?:\s*[-–]\s*\d+)?\s*(?:semester\s+)?units?)", t)
    if m:
        out["count"] = int(m.group(1)) if m.group(1).isdigit() else NUM_WORDS[m.group(1)]
    elif re.match(r"^\s*(?:select|choose)\s+(?:one|a course)\b", t) or re.search(r"\bselect one\b", t):
        out["count"] = 1
    return out


def structure_courselist(rows):
    """Group raw rows into requirement items: single courses, OR-alternatives, choose-from lists.

    A choose group ("Select one of the following:") owns the indented rows that follow it. When the
    bulletin doesn't indent the options, the group runs until the next comment row instead.
    """
    items = []
    group = None
    indented_seen = False
    for r in rows:
        if r["type"] == "course":
            entry = {"code": " & ".join(r["codes"]), "codes": r["codes"], "title": r["title"]}
            if r.get("units"):
                entry["units"] = r["units"]
            if r.get("aliases"):
                entry["also_listed_as"] = r["aliases"]
            if group is not None:
                if r.get("indent"):
                    indented_seen = True
                elif indented_seen:
                    group = None
            target = group["courses"] if group is not None else items
            if r.get("or") and target:
                prev = target[-1]
                if prev.get("type") == "one_of":
                    prev["options"].append(entry)
                else:
                    first = {k: v for k, v in prev.items() if k != "type"}
                    target[-1] = {"type": "one_of", "options": [first, entry], "units": prev.get("units", "")}
            else:
                target.append(dict(entry, type="course"))
        elif r["type"] in ("comment", "header"):
            text = r["text"]
            if CHOICE_RE.search(text):
                group = {"type": "choose", "instruction": text, "units": r.get("units", ""), "courses": [],
                         **{"select_" + k: v for k, v in parse_choice(text).items()}}
                indented_seen = False
                items.append(group)
                continue
            if r.get("indent") and r["type"] == "comment":
                # an indented comment qualifies the row above it ("or a passing score on the CLEP exam")
                host = group["courses"] if group is not None and group["courses"] else items
                if host and host[-1].get("type") in ("course", "one_of"):
                    host[-1].setdefault("notes", []).append(text)
                    continue
            group = None
            items.append({"type": "header" if r["type"] == "header" else "note", "text": text,
                          **({"units": r["units"]} if r.get("units") else {})})
        elif r["type"] == "total":
            group = None
            items.append({"type": "total", "text": r["text"], "units": r["units"]})
    return items


UNITS_IN_HEADING = re.compile(r"\(?\b(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s+(?:semester\s+)?units?\b\)?", re.I)


def requirement_blocks(container):
    """Walk a requirements tab in document order and attach course lists to their headings/notes."""
    blocks = []
    heading_path = []
    pending_notes = []

    def flush_trailing():
        if pending_notes and blocks and blocks[-1]["heading_path"] == [h[1] for h in heading_path]:
            blocks[-1].setdefault("notes_after", []).extend(pending_notes)
            pending_notes.clear()

    for el in container.descendants:
        if not isinstance(el, Tag):
            continue
        if el.find_parent("table"):
            continue
        if el.name in ("h2", "h3", "h4", "h5"):
            flush_trailing()
            lvl = int(el.name[1])
            heading_path = [h for h in heading_path if h[0] < lvl] + [(lvl, one_line(inline(el).replace("**", "")))]
            pending_notes = []
        elif (el.name == "p" and not el.find_parent("li")) or (el.name == "li" and not el.find_parent("li")):
            t = own_text(el)
            if t:
                pending_notes.append(t)
        elif el.name == "table" and "sc_courselist" in (el.get("class") or []):
            rows = parse_courselist_rows(el)
            heading = heading_path[-1][1] if heading_path else ""
            m = UNITS_IN_HEADING.search(heading)
            items = structure_courselist(rows)
            lead = next((n for n in reversed(pending_notes) if len(n) < 250 and CHOICE_RE.search(n)), None)
            if lead is None and CHOICE_RE.search(heading):
                lead = heading
            if lead and not any(it["type"] == "choose" for it in items):
                items = wrap_choice(items, lead, m.group(1).replace(" ", "").replace("–", "-") if m else "")
            blocks.append({
                "heading_path": [h[1] for h in heading_path],
                "units": m.group(1).replace(" ", "").replace("–", "-") if m else None,
                "notes": pending_notes,
                "items": items,
                "courses": sorted({c for r in rows if r["type"] == "course" for c in r["codes"]}),
            })
            pending_notes = []
    flush_trailing()
    return blocks


def wrap_choice(items, instruction, block_units):
    """The bulletin sometimes puts 'Select two:' in a paragraph above the table. Turn the table's
    courses into a choose group (one group per area header when the table has headers)."""
    segments, cur_header, cur = [], None, []
    for it in items:
        if it["type"] == "header":
            if cur:
                segments.append((cur_header, cur))
            cur_header, cur = it["text"], []
        elif it["type"] in ("course", "one_of"):
            cur.append(it)
        else:
            cur.append(it)
    if cur:
        segments.append((cur_header, cur))
    out = []
    for header, seg in segments:
        courses = [x for x in seg if x["type"] in ("course", "one_of")]
        rest = [x for x in seg if x["type"] not in ("course", "one_of")]
        if header:
            out.append({"type": "header", "text": header})
        if courses:
            out.append({"type": "choose", "instruction": instruction, "instruction_source": "text above the table",
                        "units": "" if header else block_units, "courses": courses,
                        **{"select_" + k: v for k, v in parse_choice(instruction).items()}})
        out += rest
    return out


TOTAL_RE = re.compile(r"(?:—|–|-|\(|:)\s*(?:(?:a\s+)?minimum(?:\s+of)?|min\.?|at least)?\s*(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s+(?:semester\s+)?units?\b\)?(?:\s+(?:minimum|min\.?|maximum|total|required))?\s*$", re.I)
DEGREE_WORD_RE = re.compile(r"\((?:B|M|Ed|D|Ph)\.|Bachelor|Master|Minor|Certificate|Credential|Doctor|Major|Concentration|"
                            r"\bTotal\b|\bM\.?B\.?A\b", re.I)


def find_total_units(containers):
    """The program total is the 'Name — N units' heading/paragraph that names the degree."""
    cands = []
    for div in containers:
        for el in div.find_all(["h2", "h3", "p"]):
            if el.find_parent("table"):
                continue
            t = one_line(el.get_text(" "))
            if len(t) > 160:
                continue
            m = TOTAL_RE.search(t)
            if m:
                cands.append((el.name, t, m.group(1).replace(" ", "").replace("–", "-")))
    if not cands:
        return None
    best = max(enumerate(cands), key=lambda ic: (bool(DEGREE_WORD_RE.search(ic[1][1])), ic[1][0] == "h2", -ic[0]))
    name, t, units = best[1]
    return units if (DEGREE_WORD_RE.search(t) or name == "h2") else None


# --------------------------------------------------------------------------- roadmaps (plan grids)

def parse_plangrid(table):
    terms = []
    year = None
    cur = None
    total = None
    for tr in table.find_all("tr"):
        cls = tr.get("class") or []
        if "plangridyear" in cls:
            year = one_line(tr.get_text(" "))
            continue
        if "plangridterm" in cls:
            th = tr.find("th")
            cur = {"year": year, "term": one_line(th.get_text(" ")) if th else "", "items": [], "units": None}
            terms.append(cur)
            continue
        hours = tr.select_one("td.hourscol")
        units = one_line(hours.get_text(" ")) if hours else ""
        if "plangridsum" in cls:
            if cur is not None:
                cur["units"] = units
            continue
        if "plangridtotal" in cls:
            total = units
            continue
        tds = tr.find_all("td")
        if not tds:
            continue
        if cur is None:
            cur = {"year": year, "term": "", "items": [], "units": None}
            terms.append(cur)
        codecol = tr.select_one("td.codecol")
        titlecol = tr.select_one("td.titlecol")
        links = codecol.select("a.code, a.bubblelink") if codecol else []
        if links and titlecol is not None:
            codes = list(dict.fromkeys(link_code(a) for a in links))
            aliases = [x for a in links for x in link_aliases(a) if x not in codes]
            tcopy = copy.copy(titlecol)
            comments = [one_line(s.get_text(" ")) for s in tcopy.select("span.comment")]
            notes = [one_line(s.get_text(" ")) for s in tcopy.find_all("sup")]
            for s in tcopy.find_all("sup") + tcopy.select("span.comment"):
                s.decompose()
            title = re.sub(r"\(\s*\)", "", one_line(tcopy.get_text(" ")))
            code_text = one_line(codecol.get_text(" "))
            item = {"codes": codes, "title": re.sub(r"\s+", " ", title).strip(),
                    "satisfies": comments[0] if comments else None, "units": units}
            if aliases:
                item["also_listed_as"] = list(dict.fromkeys(aliases))
            if code_text.lower().startswith("or "):
                item["or"] = True
            if notes:
                item["footnotes"] = notes
        else:
            cells = [codecol or tds[0]] + ([titlecol] if titlecol is not None and titlecol is not codecol else [])
            comments, notes, texts = [], [], []
            for cell in cells:
                c2 = copy.copy(cell)
                comments += [one_line(x.get_text(" ")) for x in c2.select("span.comment")
                             if not x.find("a") and x.find_parent("td") is not None and len(cells) > 1]
                notes += [one_line(x.get_text(" ")) for x in c2.find_all("sup")]
                for x in c2.find_all("sup"):
                    x.decompose()
                if len(cells) > 1:
                    for x in c2.select("span.comment"):
                        x.decompose()
                texts.append(re.sub(r"\(\s*\)", "", one_line(c2.get_text(" "))))
            codes = list(dict.fromkeys(c for c, _, _, _ in code_spans(texts[0]))) if len(cells) > 1 else []
            item = {"codes": codes, "title": " ".join(t for t in (texts[1:] if codes else texts) if t),
                    "satisfies": comments[0] if comments else None, "units": units}
            if notes:
                item["footnotes"] = notes
        cur["items"].append(item)
    return {"terms": terms, "total_units": total}


def plangrid_md(g):
    out = []
    last_year = None
    for t in g["terms"]:
        if t.get("year") and t["year"] != last_year:
            out.append(f"**{t['year']}**")
            last_year = t["year"]
        out.append(f"*{t['term']}* ({t['units']} units)" if t.get("units") else f"*{t['term']}*")
        for it in t["items"]:
            code = (" & ".join(it["codes"]) + " ") if it["codes"] else ""
            sat = f" [satisfies: {it['satisfies']}]" if it.get("satisfies") else ""
            fn = f" (footnotes {', '.join(it['footnotes'])})" if it.get("footnotes") else ""
            pre = "or " if it.get("or") else ""
            out.append(f"- {pre}{code}{it['title']}{sat} — {it['units']} units{fn}")
    if g.get("total_units"):
        out.append(f"**Total units: {g['total_units']}**")
    return "\n".join(out)


def footnotes_of(container):
    notes = {}
    for dl in container.select("dl.sc_footnotes"):
        for dt in dl.find_all("dt"):
            dd = dt.find_next_sibling("dd")
            notes[one_line(dt.get_text(" "))] = one_line(inline(dd)) if dd else ""
    return notes


# --------------------------------------------------------------------------- courses

GRADING_RE = re.compile(r"\((?P<g>[^()]*(?:letter grade|CR/NC|credit/no credit|grade only|ABC/NC)[^()]*)\)", re.I)


def level_of(num):
    m = re.match(r"(\d+)", num)
    if not m:
        return None
    n = int(m.group(1))
    if n < 100:
        return "remedial/non-credit"
    if n < 300:
        return "lower-division"
    if n < 700:
        return "upper-division"
    if n < 900:
        return "graduate"
    if n < 1000:
        return "doctoral"
    return "professional (CEU)"


def prereq_segment(kind, applies_to, text):
    """Split a prerequisite statement into required / recommended / concurrent-allowed course codes."""
    required, recommended, concurrent, enforced = [], [], [], []
    for clause in re.split(r";|(?<=\.)\s+(?=[A-Z])", text):
        spans = code_spans(clause)
        is_rec = re.search(r"recommend", clause, re.I) is not None
        for i, (c, start, end, star) in enumerate(spans):
            (recommended if is_rec else required).append(c)
            if star and not is_rec:
                enforced.append(c)
            nxt = spans[i + 1][1] if i + 1 < len(spans) else len(clause)
            after = clause[end:min(nxt, end + 60)]
            before = clause[max(0, start - 60):start]
            if re.match(r"\*?\s*\([^()]*concurren[^()]*\)", after, re.I) or re.search(r"concurrent(?:ly)?\s+(?:enroll\w*\s+in|with)\s*$|"
                                                                   r"concurrent enrollment in\b[^.;]*$", before, re.I):
                concurrent.append(c)
    dedup = lambda xs: list(dict.fromkeys(xs))
    return {"kind": kind, "applies_to": applies_to, "text": text,
            "courses": dedup(required), "recommended_courses": dedup(recommended),
            "may_be_taken_concurrently": dedup(concurrent), "enforced_at_registration": dedup(enforced)}


def parse_courseblock(block, source_url):
    b = copy.copy(block)
    title_el = b.select_one(".courseblocktitle")
    raw_title = one_line(title_el.get_text(" ")) if title_el else ""
    cm = CODE_RE.match(raw_title)
    um = re.search(r"\((Units?):\s*([^)]*)\)\s*$", raw_title)
    code = f"{cm.group(1)} {cm.group(2)}" if cm else norm_code(raw_title)
    title = one_line(raw_title[cm.end() if cm else 0: um.start() if um else None])
    units_raw = one_line(um.group(2)) if um else None
    umin, umax = parse_units(units_raw or "")
    if title_el:
        title_el.decompose()

    prereqs, attributes, topics, other_extras = [], [], [], []
    prereq_codes, enforced = [], []
    for ex in b.select("p.courseblockextra"):
        label_el = ex.find("strong")
        label = one_line(label_el.get_text(" ")).rstrip(":") if label_el else ""
        nxt = ex.find_next_sibling()
        lst = None
        if nxt is not None and nxt.name in ("ul", "ol"):
            lst = nxt
        inner_list = ex.find(["ul", "ol"])
        if label.lower().startswith("course attribute"):
            src = inner_list or lst
            if src is not None:
                attributes += [one_line(inline(li)) for li in src.find_all("li")]
                src.decompose()
        elif label.lower().startswith("topics"):
            src = inner_list or lst
            if src is not None:
                topics += [one_line(inline(li)) for li in src.find_all("li")]
                src.decompose()
        else:
            # prerequisite text may hold several "Prerequisite for X:" segments separated by <br>
            parts = [one_line(p) for p in re.split(r"\n", clean(inline(ex))) if one_line(p)]
            for part in parts:
                pm = re.match(r"^(Prerequisites?|Corequisites?|Pre-?\s?requisites?)(?:\s+for\s+(?P<for>[^:]+?))?\s*:\s*(?P<text>.*)$",
                              part, re.I)
                if pm:
                    kind = "corequisite" if pm.group(1).lower().startswith("co") else "prerequisite"
                    seg_text = pm.group("text").strip()
                    applies = pm.group("for")
                    if applies:
                        applies = applies.strip()
                        applies = f"{code.rpartition(' ')[0]} {applies}" if re.fullmatch(r"\d{3,4}[A-Z]{0,4}", applies) \
                            else norm_code(applies)
                    prereqs.append(prereq_segment(kind, applies, seg_text))
                else:
                    other_extras.append(part)
        ex.decompose()

    desc = re.sub(r"\s+", " ", clean(inline(b))).strip()
    if not prereqs:
        # a few courses state "Prerequisite(s): ..." inside the description paragraph itself
        dm = re.match(r"^(Prerequisites?|Corequisites?)\s*:\s*(.+?\.)(?=\s|$)", desc)
        if dm:
            kind = "corequisite" if dm.group(1).lower().startswith("co") else "prerequisite"
            prereqs.append(dict(prereq_segment(kind, None, dm.group(2).strip()), found_in_description=True))
    # former course numbers ("[Formerly CSC 650]") are history, not paired/cross-listed courses
    former = []
    for fm in re.finditer(r"\[\s*formerly\s+([^\]]*)\]", desc, re.I):
        if not re.match(r"(part of|paired with|cross-listed with|a topic of)", fm.group(1), re.I):
            former += codes_in(fm.group(1))
    desc_nf = re.sub(r"\[\s*formerly[^\]]*\]", "", desc, flags=re.I)
    # derived facts from the description text
    grading = None
    gm = list(GRADING_RE.finditer(desc))
    if gm:
        grading = gm[-1].group("g").strip()
    paired = []
    for pm in re.finditer(r"\(([^()]*?) is a paired course offering[^()]*\)", desc_nf):
        paired += [c for c in codes_in(pm.group(1)) if c != code]
    cross = []
    for cm in re.finditer(r"(?:offered as|also offered as|(?<!formerly )cross-listed (?:as|with))\s+([^.;)]*)",
                          desc_nf, re.I):
        cross += [c for c in codes_in(cm.group(1)) if c != code]
    rep = re.search(r"(May be repeated[^.()]*\.?)", desc)
    ge_note = re.search(r"\(Note:([^()]*(?:\([^()]*\)[^()]*)*)\)", desc)
    subject, _, num = code.rpartition(" ")
    own = set([code] + paired)
    mine = [p for p in prereqs if p["applies_to"] in (None, code)] or prereqs
    recommended, concurrent = [], []
    for p in mine:
        prereq_codes += p["courses"]
        enforced += p["enforced_at_registration"]
        recommended += p["recommended_courses"]
        concurrent += p["may_be_taken_concurrently"]
    return {
        "code": code,
        "subject": subject,
        "number": num,
        "title": title,
        "units": units_raw,
        "units_min": umin,
        "units_max": umax,
        "level": level_of(num),
        "description": desc,
        "prerequisites": prereqs,
        "prerequisite_text": " | ".join(p["text"] for p in mine) or None,
        "prerequisite_courses": [c for c in dict.fromkeys(prereq_codes) if c not in own],
        "prerequisites_enforced_at_registration": [c for c in dict.fromkeys(enforced) if c not in own],
        "prerequisites_may_be_taken_concurrently": [c for c in dict.fromkeys(concurrent) if c not in own],
        "recommended_courses": [c for c in dict.fromkeys(recommended) if c not in own],
        "restricted_to": [p["text"] for p in mine if re.search(r"\brestricted to\b", p["text"], re.I)],
        "attributes": attributes,
        "ge_areas": [a for a in attributes if re.match(
            r"^(?:[1-7][A-C]?|[1-7]UD|[A-F][1-5]?(?: or [A-F][1-5]?)*|UD-[A-D]|GE-[A-F]):", a)],
        "sf_state_studies": [a for a in attributes if re.search(
            r"Ethnic & Racial|Racial Minorit|AERM|Global Perspectives|Env\. Sustain|Environmental Sustain|Social Justice",
            a, re.I)],
        "american_institutions": [a for a in attributes if re.search(r"U\.S\. History|U\.S\. Govt|Calif State|"
                                                                     r"State & Local", a)],
        "satisfies_gwar": any(re.search(r"Graduation Writing", a) for a in attributes) or bool(
            re.search(r"\dGW$", num)),
        "topics": topics,
        "grading": grading,
        "repeatable": rep.group(1).strip() if rep else None,
        "paired_with": list(dict.fromkeys(paired)),
        "cross_listed_with": list(dict.fromkeys(cross)),
        "former_codes": [c for c in dict.fromkeys(former) if c != code],
        "extra_fee": bool(re.search(r"extra fee required", desc, re.I)),
        "notes": ([ge_note.group(1).strip()] if ge_note else []) + other_extras,
        "source_url": source_url,
    }


# --------------------------------------------------------------------------- program classification

PROGRAM_TITLE_RE = re.compile(
    r"^(Bachelor|Minor|Master|Certificate|Graduate Certificate|Undergraduate Certificate|Graduate Business Certificate|"
    r"Doctor|Doctorate|Specialist|Advanced Certificate|Credential|Joint)\b|Credential|Certificate|Pathway Program|"
    r"Special Major|Minor\b|Interdisciplinary Studies",
    re.I)


def degree_info(title, index_labels):
    t = title
    info = {"degree": None, "award_type": None, "level": None, "concentration": None, "field": None}
    m = re.search(r"Concentration in (.+?)(?:\s+–|\s+-\s|$)", t)
    if m:
        info["concentration"] = m.group(1).strip()
    m = re.search(r"Emphasis in (.+?)(?:\s+–|$)", t)
    if m:
        info["emphasis"] = m.group(1).strip()
    rules = [
        (r"^Bachelor of Arts", "B.A.", "bachelor", "undergraduate"),
        (r"^Bachelor of Science in Nursing", "B.S.N.", "bachelor", "undergraduate"),
        (r"^Bachelor of Science", "B.S.", "bachelor", "undergraduate"),
        (r"^Bachelor of Fine Arts", "B.F.A.", "bachelor", "undergraduate"),
        (r"^Bachelor of Music", "B.Mus.", "bachelor", "undergraduate"),
        (r"^Bachelor of Vocational Education", "B.V.E.", "bachelor", "undergraduate"),
        (r"^Bachelor", "Bachelor's", "bachelor", "undergraduate"),
        (r"^Minor", "Minor", "minor", "undergraduate"),
        (r"^Master of Arts", "M.A.", "master", "graduate"),
        (r"^Master of Science in Nursing", "M.S.N.", "master", "graduate"),
        (r"^Master of Science", "M.S.", "master", "graduate"),
        (r"^Master of Fine Arts", "M.F.A.", "master", "graduate"),
        (r"^Master of Business Administration", "M.B.A.", "master", "graduate"),
        (r"^Master of Public Administration", "M.P.A.", "master", "graduate"),
        (r"^Master of Public Health", "M.P.H.", "master", "graduate"),
        (r"^Master of Social Work", "M.S.W.", "master", "graduate"),
        (r"^Master of Music", "M.M.", "master", "graduate"),
        (r"^Master", "Master's", "master", "graduate"),
        (r"^Doctor of Education", "Ed.D.", "doctorate", "graduate"),
        (r"^Doctor of Physical Therapy", "D.P.T.", "doctorate", "graduate"),
        (r"^Doctor of Philosophy", "Ph.D.", "doctorate", "graduate"),
        (r"^Doctor", "Doctorate", "doctorate", "graduate"),
        (r"^(Graduate Certificate|Graduate Business Certificate|Advanced Certificate)", "Graduate Certificate",
         "certificate", "graduate"),
        (r"^Undergraduate Certificate", "Undergraduate Certificate", "certificate", "undergraduate"),
        (r"Credential", "Credential", "credential", "post-baccalaureate"),
        (r"Certificate", "Certificate", "certificate", None),
        (r"Pathway Program", "Pathway Program", "pathway", None),
        (r"Special Major", "Special Major", "special-major", "undergraduate"),
    ]
    for rx, deg, award, lvl in rules:
        if re.search(rx, t, re.I):
            info["degree"], info["award_type"], info["level"] = deg, award, lvl
            break
    labs = " ".join(index_labels).lower()
    if info["award_type"] == "certificate" and info["level"] is None:
        if "undergraduate certificate" in labs:
            info["level"] = "undergraduate"
        elif re.search(r"(?<!under)graduate certificate", labs) or re.search(r"\bgraduate\b|post-?baccalaureate", t, re.I):
            info["level"] = "graduate"
        elif "certificate" in labs:
            info["level"] = "undergraduate"
    if info["award_type"] is None and re.search(r"Interdisciplinary Studies \(Graduate\)", t):
        info.update(degree="M.A./M.S.", award_type="master", level="graduate")
    if info["award_type"] == "pathway" and info["level"] is None:
        info["level"] = "graduate" if re.search(r"\bGraduate\b", t) else "undergraduate"
    base = re.split(r":\s*Concentration|,\s*Concentration|\s+–\s|\s+-\s|:\s*Emphasis", t)[0]
    m = re.match(r"^(?:Bachelor|Master|Doctor) of [A-Za-z ]+? in (.+)$", base) or \
        re.match(r"^(?:Minor|(?:Graduate |Undergraduate |Graduate Business |Advanced )?Certificate) in (.+)$", base) or \
        re.match(r"^(?:Bachelor|Master|Doctor) of (.+)$", base)
    if m:
        info["field"] = m.group(1).strip()
    return info


def program_index():
    """Parse /programs/ A–Z: name -> list of (label, url, status)."""
    soup = load("programs")
    entries = []
    by_url = collections.defaultdict(list)
    for p in soup.select("#textcontainer p"):
        txt = one_line(p.get_text(" "))
        if ":" not in txt or not p.find("a"):
            continue
        name = txt.split(":", 1)[0].strip()
        offerings = []
        merged = []
        for a in p.find_all("a"):
            href = a.get("href", "")
            if not href or href.startswith("#"):
                continue
            if merged and merged[-1][0].get("href") == href:
                merged[-1][1] += a.get_text("")
                merged[-1][0] = a
                continue
            merged.append([a, a.get_text("")])
        for a, label_text in merged:
            href = a.get("href", "")
            label = one_line(label_text)
            if not re.search(r"[A-Za-z]{2}", label):
                continue
            tail = ""
            sib = a.next_sibling
            # status text such as " - Temporarily Suspended" follows the link (outside <u>)
            node = a
            while node is not None and node.parent is not None and node.parent.name in ("u",):
                node = node.parent
            sib = node.next_sibling
            if isinstance(sib, NavigableString):
                tail = one_line(str(sib)).lstrip("-– ").split(",")[0].strip()
            full = BASE + href if href.startswith("/") else href
            base_part, _, frag = full.partition("#")
            if not base_part.endswith("/") and not base_part.endswith(".html"):
                base_part += "/"
            full = base_part + ("#" + frag if frag else "")
            status = "Temporarily Suspended" if "suspend" in tail.lower() else \
                "Discontinued" if "discontinu" in tail.lower() else "Active"
            o = {"label": label, "url": full.split("#")[0], "status": status}
            if "#" in full:
                o["anchor"] = full.split("#")[1]
            offerings.append(o)
            by_url[o["url"]].append({"name": name, **o})
        entries.append({"name": name, "offerings": offerings})
    return entries, by_url


# --------------------------------------------------------------------------- main build

def text_of_tab(tabs, *names):
    for t in tabs:
        if t["tab"].lower() in names:
            return t
    return None


def main():
    global SUBJECTS
    os.makedirs(OUT, exist_ok=True)
    SUBJECTS = load_subjects()
    init_code_regex(SUBJECTS)
    paths = all_paths()

    # ---------------- courses
    courses = {}
    course_sources = collections.defaultdict(list)
    subj_counts = collections.Counter()
    for s in SUBJECTS:
        p = path_of(s["url"])
        soup = load(p)
        blocks = soup.select("div.courseblock")
        for blk in blocks:
            c = parse_courseblock(blk, s["url"])
            c["subject_name"] = s["subject_name"]
            if c["code"] in courses:
                course_sources[c["code"]].append(s["url"])
                continue
            courses[c["code"]] = c
            subj_counts[s["subject_code"]] += 1
    # cross-check against /courses/all/
    all_soup = load("courses/all")
    all_codes = []
    for blk in all_soup.select("div.courseblock"):
        c = parse_courseblock(blk, BASE + "/courses/all/")
        all_codes.append(c["code"])
        if c["code"] not in courses:
            c["subject_name"] = next((s["subject_name"] for s in SUBJECTS if s["subject_code"] == c["subject"]), None)
            courses[c["code"]] = c
            subj_counts[c["subject"]] += 1
    # reverse prerequisite map
    required_by = collections.defaultdict(set)
    for c in courses.values():
        for p in c["prerequisite_courses"]:
            required_by[p].add(c["code"])
    for code, c in courses.items():
        c["is_prerequisite_for"] = sorted(required_by.get(code, []))

    # ---------------- programs / roadmaps / departments
    prog_entries, prog_by_url = program_index()
    programs, roadmaps, departments, colleges = [], [], [], []
    program_courses = collections.defaultdict(set)
    page_links = {}
    college_names = {}
    for p in paths:
        if not p.startswith("colleges"):
            continue
        segs = p.split("/")[1:]
        soup = load(p)
        title = page_title(soup)
        url = url_of(p)
        tabs = page_doc(soup, p)
        tab_labels = [t["tab"] for t in tabs]
        has_grid = soup.select_one("table.sc_plangrid") is not None
        if len(segs) == 0:
            continue
        college_slug = segs[0]
        if len(segs) == 1:
            college_names[college_slug] = title
            colleges.append({"id": college_slug, "name": title, "url": url, "tabs": tabs})
            continue
        is_roadmap = (has_grid and not any(re.search(r"requirement", l, re.I) for l in tab_labels)) or \
            re.search(r"roadmap", title, re.I) or re.search(r"roadmap", segs[-1])
        has_list = soup.select_one("table.sc_courselist") is not None
        title_is_program = bool(re.match(
            r"^(Bachelor|Minor|Master|Doctor|Certificate|Graduate Certificate|Undergraduate Certificate|"
            r"Graduate Business Certificate|Advanced Certificate|Certificate of Special Study)\b", title) or
            re.search(r"Credential|Pathway Program|Special Major|Interdisciplinary Studies", title))
        is_listing = bool(re.search(r"Certificates$", title)) and not has_list
        dept_tabs = {"faculty", "undergraduate", "graduate", "courses", "programs", "credentials", "people"}
        is_dept = not is_roadmap and not title_is_program and (
            is_listing or bool(dept_tabs & {l.lower() for l in tab_labels}) or
            (not PROGRAM_TITLE_RE.search(title) and not has_list))
        if is_roadmap:
            grids = []
            for tbl in soup.select("table.sc_plangrid"):
                grids.append(parse_plangrid(tbl))
            intro = soup.select_one("p.introtext")
            main = soup.select_one("#textcontainer") or soup
            notes = [one_line(inline(x)) for x in main.find_all("p") if "introtext" not in (x.get("class") or [])
                     and not x.find_parent("table") and one_line(x.get_text())]
            parent = "/".join(p.split("/")[:-1])
            key = segs[-1] + " " + title
            kind = "RN to BSN (transfer)" if re.search(r"\bADN\b|RN[- ]to[- ]BSN|\bRN-BSN\b|Registered Nurse", key) else \
                "transfer (ADT)" if re.search(r"adt|transfer", key, re.I) else \
                "SF State Scholars (BA/BS+MA/MS)" if re.search(r"scholars", key, re.I) else \
                "first-time student (4-year)"
            rm = {
                "id": p.replace("colleges/", ""),
                "title": title,
                "url": url,
                "program_url": url_of(parent) if len(segs) >= 3 else None,
                "roadmap_type": kind,
                "intro": clean(inline(intro)) if intro else None,
                "notes": notes,
                "plans": grids,
                "footnotes": footnotes_of(soup),
                "markdown": "\n\n".join(t["markdown"] for t in tabs),
                "courses": sorted({c for g in grids for t in g["terms"] for it in t["items"] for c in it["codes"]}),
            }
            roadmaps.append(rm)
            continue
        if is_dept:
            courses_tab = None
            for tid, label, div in tabs_of(soup):
                if label.lower() == "courses":
                    courses_tab = div
            dept_courses = []
            if courses_tab is not None:
                dept_courses = [parse_courseblock(b, url)["code"] for b in courses_tab.select("div.courseblock")]
            departments.append({
                "id": p.replace("colleges/", ""),
                "name": title,
                "college": college_slug,
                "url": url,
                "tabs": [t for t in tabs if t["tab"].lower() != "courses"],
                "course_codes": dept_courses,
                "subjects": sorted({c.rsplit(" ", 1)[0] for c in dept_courses}),
            })
            # a department page that is itself an A-Z program target (e.g. a minor described on the
            # department page) also becomes a program
            direct = [o for o in prog_by_url.get(url, []) if o.get("anchor") in (None, "text")]
            if not (direct and has_list):
                continue
            title = f"{title} ({', '.join(dict.fromkeys(o['label'] for o in direct))})"
        # program
        labels = [o["label"] for o in prog_by_url.get(url, [])]
        statuses = sorted({o["status"] for o in prog_by_url.get(url, [])})
        info = degree_info(title, labels)
        req_blocks = []
        embedded_grids = []
        req_tab_names = []
        req_divs = []
        for tid, label, div in tabs_of(soup):
            if div.select_one("table.sc_courselist") is not None:
                req_tab_names.append(label)
                req_divs.append(div)
                req_blocks += [dict(b, tab=label) for b in requirement_blocks(div)]
            for tbl in div.select("table.sc_plangrid"):
                embedded_grids.append(dict(parse_plangrid(tbl), tab=label))
        all_req_courses = sorted({c for b in req_blocks for c in b["courses"]})
        total_units = find_total_units(req_divs) or find_total_units([div for _, _, div in tabs_of(soup)])
        if info["award_type"] is None and labels:
            lab = labels[0].lower()
            for key, award, lvl in (("minor", "minor", "undergraduate"), ("master", "master", "graduate"),
                                    ("bachelor", "bachelor", "undergraduate"),
                                    ("undergraduate certificate", "certificate", "undergraduate"),
                                    ("graduate certificate", "certificate", "graduate"),
                                    ("certificate", "certificate", "undergraduate"),
                                    ("credential", "credential", "post-baccalaureate")):
                if key in lab:
                    info.update(award_type=award, level=lvl, degree=labels[0])
                    break
        page_text = " ".join(t["markdown"] for t in tabs)
        if re.search(r"Discontinued\s*[-–—:]?\s*Not Accepting", page_text, re.I) or \
                any("discontinu" in x.lower() for x in statuses):
            status = "Discontinued"
        elif re.search(r"\b(?:program|major|minor|concentration|certificate|degree|credential)\s+(?:is\s+)?"
                       r"(?:currently\s+|temporarily\s+)+suspended", page_text, re.I) or \
                any("suspend" in x.lower() for x in statuses):
            status = "Suspended"
        else:
            status = "Active"
        req_md = "\n\n".join(t["markdown"] for t in tabs if t["tab"] in req_tab_names or
                               re.search(r"requirement", t["tab"], re.I))
        if not req_md:
            req_md = "\n\n".join(t["markdown"] for t in tabs if t["tab"].lower() == "overview")
        parent_dept = None
        if len(segs) >= 3:
            parent_dept = "/".join(segs[:-1])
        elif is_dept:
            parent_dept = p.replace("colleges/", "")
        program = {
            "id": p.replace("colleges/", ""),
            "name": title,
            "url": url,
            "college": college_slug,
            "department": parent_dept,
            **info,
            "program_index_labels": labels,
            "status": status,
            "total_units": total_units,
            "requirements_text": req_md,
            "requirement_tabs": req_tab_names,
            "requirements": req_blocks,
            "required_or_listed_courses": all_req_courses,
            "embedded_roadmaps": embedded_grids,
            "roadmap_urls": [],
            "tabs": tabs,
        }
        page_links[url] = {urllib.parse.urljoin(BASE + "/", a["href"]).split("#")[0].rstrip("/") + "/"
                           for a in soup.select("#content a[href], a[href]") if a.get("href", "").startswith("/colleges/")}
        programs.append(program)
        for c in all_req_courses:
            program_courses[c].add(program["id"])

    # link roadmaps to programs: prefer programs whose page links to the roadmap, then the parent URL
    by_url = {pr["url"]: pr for pr in programs}
    words = lambda t: set(re.findall(r"[a-z0-9]+", t.lower())) - {"of", "in", "and", "the", "roadmap", "concentration"}
    for rm in roadmaps:
        linking = [pr for pr in programs if rm["url"] in page_links.get(pr["url"], set())]
        pr = None
        if linking:
            pr = max(linking, key=lambda x: (len(words(x["name"]) & words(rm["title"])),
                                             len(os.path.commonprefix([x["url"], rm["url"]]))))
        if pr is None:
            pr = by_url.get(rm["program_url"])
        if pr:
            pr["roadmap_urls"].append(rm["url"])
            rm["program_id"] = pr["id"]
            rm["program_name"] = pr["name"]
        else:
            rm["program_id"] = None
            rm["program_name"] = None
    for dept in departments:
        dept["programs"] = [pr["id"] for pr in programs if pr["department"] == dept["id"]]
    for col in colleges:
        col["departments"] = [d["id"] for d in departments if d["college"] == col["id"]]
        col["programs"] = [pr["id"] for pr in programs if pr["college"] == col["id"]]
    for pr in programs:
        pr["college_name"] = college_names.get(pr["college"])
    for d in departments:
        d["college_name"] = college_names.get(d["college"])
    for code, c in courses.items():
        c["used_in_programs"] = sorted(program_courses.get(code, []))

    # ---------------- policies & general academic info (everything that isn't colleges/ or courses/<subj>)
    policy_pages = []
    for p in paths:
        if p.startswith("colleges") or (p.startswith("courses") and p not in ("courses/courses-terms",)):
            continue
        if p in ("programs",) or p.endswith("-header"):
            continue
        soup = load(p)
        top = p.split("/")[0] if p else "home"
        course_lists = []
        for tid, label, div in tabs_of(soup):
            course_lists += [dict(b, tab=label) for b in requirement_blocks(div)]
        page = {
            "id": p or "home",
            "title": page_title(soup) or p,
            "category": top,
            "url": url_of(p) if p else BASE + "/",
            "tabs": page_doc(soup, p),
        }
        if course_lists:
            page["course_lists"] = course_lists
        page["category"] = {"mandatory-copy-section-i.html": "about-sfsu", "about": "about-sfsu", "pdf": "about-sfsu",
                            "cel-admission": "undergraduate-admissions",
                            "sf-state-scholars": "graduate-education"}.get(top, top)
        md_all = "\n".join(t["markdown"] for t in page["tabs"])
        page["empty"] = len(md_all.strip()) < 80
        lines = {x.strip() for x in md_all.split("\n") if x.strip()}
        for other in policy_pages:
            o_lines = other.pop("_lines", None) or set()
            other["_lines"] = o_lines
            if lines and o_lines and len(lines & o_lines) / len(lines | o_lines) >= 0.97:
                # keep the page that sits inside a section; mark the top-level copy as the duplicate
                if "/" not in other["id"] and "/" in page["id"]:
                    other["duplicate_of"] = page["id"]
                else:
                    page["duplicate_of"] = other["id"]
                break
        page["_lines"] = lines
        policy_pages.append(page)
    for pg in policy_pages:
        pg.pop("_lines", None)

    # ---------------- course index
    course_index = []
    for s in SUBJECTS:
        codes = sorted([c for c in courses.values() if c["subject"] == s["subject_code"]],
                       key=lambda c: (re.sub(r"\D", "", c["number"]).zfill(4), c["number"]))
        course_index.append({
            **s,
            "course_count": len(codes),
            "courses": [{"code": c["code"], "title": c["title"], "units": c["units"], "level": c["level"]}
                        for c in codes],
        })

    def dump(name, obj):
        with open(os.path.join(OUT, name), "w") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)

    course_list = sorted(courses.values(), key=lambda c: (c["subject"], re.sub(r"\D", "", c["number"]).zfill(4),
                                                         c["number"]))
    dump("courses.json", course_list)
    dump("course_index.json", course_index)
    dump("programs.json", programs)
    dump("program_index.json", prog_entries)
    dump("roadmaps.json", roadmaps)
    dump("departments.json", departments)
    dump("colleges.json", colleges)
    dump("policies.json", policy_pages)

    stats = {
        "subjects": len(SUBJECTS),
        "courses": len(courses),
        "courses_all_page_blocks": len(all_codes),
        "courses_all_page_unique": len(set(all_codes)),
        "courses_missing_from_all_page": sorted(set(courses) - set(all_codes)),
        "programs": len(programs),
        "programs_by_award_type": collections.Counter(pr["award_type"] for pr in programs),
        "roadmaps": len(roadmaps),
        "roadmaps_unlinked": [r["url"] for r in roadmaps if not r["program_id"]],
        "departments": len(departments),
        "colleges": len(colleges),
        "policy_pages": len(policy_pages),
        "duplicate_course_blocks": {k: v for k, v in course_sources.items()},
    }
    print(json.dumps(stats, indent=1, default=str)[:6000])


if __name__ == "__main__":
    main()
