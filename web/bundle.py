"""Inline data.js and planner.js into a single self-contained HTML file.

Usage:
  python3 web/bundle.py                      -> web/dist/gatorgraph.html (full document, open or host anywhere)
  python3 web/bundle.py --fragment OUT.html  -> body-level fragment (no <html>/<head>/<body> wrapper)
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def inline(html):
    def repl(m):
        src = open(os.path.join(HERE, m.group(1))).read().replace("</script", "<\\/script")
        return "<script>\n" + src + "\n</script>"
    return re.sub(r'<script src="([^"]+)"></script>', repl, html)


def main():
    html = inline(open(os.path.join(HERE, "index.html")).read())
    if len(sys.argv) > 2 and sys.argv[1] == "--fragment":
        frag = re.sub(r"<!doctype html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*|<meta [^>]*>\s*", "", html, flags=re.I)
        open(sys.argv[2], "w").write(frag)
        print("wrote", sys.argv[2], len(frag) // 1024, "KB")
        return
    os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
    out = os.path.join(HERE, "dist", "gatorgraph.html")
    open(out, "w").write(html)
    print("wrote", out, len(html) // 1024, "KB")


if __name__ == "__main__":
    main()
