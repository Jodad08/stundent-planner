"""Keyword (BM25) search over data/sfsu/rag/chunks.jsonl — no dependencies.

Adds the basics plain BM25 lacks for student questions: stopwords, light stemming,
abbreviation folding (B.S. -> bs, M.B.A. -> mba) and a small synonym map.

Usage:
  python3 scraper/search.py "maximum units per semester"
  python3 scraper/search.py "CSC 415 prerequisites" -k 5 --type course
"""
import argparse
import collections
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNKS = os.path.join(HERE, "..", "data", "sfsu", "rag", "chunks.jsonl")
HEADER = re.compile(r"^\[SFSU Bulletin 2026-2027\]\s*")

STOP = set("""a an and are as at be been but by can could do does did for from had has have how i if in into is it its
me my of on or our should so than that the their them then there these they this to too up us was we what when where
which who why will with would you your am any about just need needs much many get got take taking""".split())

SYNONYMS = {
    "max": ["maximum"], "min": ["minimum"], "credits": ["units"], "credit": ["unit"],
    "passfail": ["cr", "nc", "credit"], "pass": ["cr"], "fail": ["nc"],
    "class": ["course"], "classes": ["courses"],
    "finish": ["complete", "completed"], "finishing": ["complete"], "retake": ["repeat"],
    "probation": ["notice"], "kicked": ["disqualification"], "dismissed": ["disqualification"],
    "catalog": ["bulletin", "elect"], "bs": ["bachelor", "science"], "ba": ["bachelor", "arts"],
    "ms": ["master", "science"], "ma": ["master", "arts"], "mba": ["master", "business", "administration"],
    "gpa": ["grade", "point", "average"], "load": ["units"], "semester": ["term"],
}


LEMMA = {"graduating": "graduation", "graduates": "graduate",
         "registration": "register", "registering": "register", "registered": "register",
         "withdrawal": "withdraw", "withdrawals": "withdraw", "withdrawing": "withdraw", "withdrew": "withdraw",
         "dropping": "drop", "dropped": "drop", "drops": "drop", "repeating": "repeat", "repeated": "repeat",
         "requirements": "requirement", "required": "require", "requires": "require",
         "units": "unit", "semesters": "semester", "courses": "course", "classes": "class"}


def stem(w):
    if w in LEMMA:
        return LEMMA[w]
    for suf in ("ations", "ation", "ings", "ing", "ies", "es", "ed", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def normalize(text):
    t = HEADER.sub("", text)
    t = re.sub(r"\b([A-Za-z])\.([A-Za-z])\.(?:([A-Za-z])\.)?(?:([A-Za-z])\.)?",
               lambda m: "".join(x for x in m.groups() if x), t)          # B.S. -> BS, M.B.A. -> MBA
    t = re.sub(r"pass\s*/\s*fail", "passfail", t, flags=re.I)
    return t.lower()


def tokens(text, query=False):
    t = normalize(text)
    t = re.sub(r"\b(to|can|before|i) graduate\b", r"\1 graduation", t)  # the verb, not "graduate student"
    words = re.findall(r"[a-z0-9]+", t)
    out = [stem(w) for w in words if w not in STOP]
    # course codes ("csc 415") also as one token
    out += [a + b for a, b in re.findall(r"\b([a-z]{1,5}) (\d{3}[a-z]{0,3})\b", t)]
    if query:
        for w in words:
            out += [stem(x) for x in SYNONYMS.get(w, [])]
    return out


_INDEX = {}


def load_index(chunk_type=None):
    key = chunk_type or "*"
    if key not in _INDEX:
        docs = []
        with open(CHUNKS) as f:
            for line in f:
                d = json.loads(line)
                if chunk_type and d["type"] != chunk_type:
                    continue
                docs.append(d)
        tf = [collections.Counter(tokens(d["title"] + " " + d["title"] + " " + d["text"])) for d in docs]
        df = collections.Counter()
        for c in tf:
            df.update(c.keys())
        avgdl = sum(sum(c.values()) for c in tf) / max(len(docs), 1)
        _INDEX[key] = (docs, tf, df, avgdl)
    return _INDEX[key]


def search(query, k=8, chunk_type=None):
    docs, tf, df, avgdl = load_index(chunk_type)
    n = len(docs)
    q = set(tokens(query, query=True))
    ql = query.lower()
    wanted_types = set()
    if "roadmap" in ql or "plan of study" in ql:
        wanted_types.add("roadmap")
    if re.search(r"prereq|units? is [a-z]+ \d{3}|\b[a-z]{2,5} \d{3}[a-z]{0,3}\b", ql):
        wanted_types.add("course")
    k1, b = 1.4, 0.75
    scores = []
    for i, c in enumerate(tf):
        dl = sum(c.values())
        s = 0.0
        for term in q:
            if term not in c:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            s += idf * c[term] * (k1 + 1) / (c[term] + k1 * (1 - b + b * dl / avgdl))
        if docs[i]["type"] == "academic_rule":
            s *= 1.4  # curated rules are the most direct answers
        if docs[i]["type"] in wanted_types:
            s *= 1.6
        if s:
            scores.append((s, i))
    return [(s, docs[i]) for s, i in sorted(scores, reverse=True)[:k]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("-k", type=int, default=8)
    ap.add_argument("--type", help="restrict to a chunk type, e.g. course, academic_rule, policy, roadmap")
    args = ap.parse_args()
    for s, d in search(args.query, args.k, args.type):
        print(f"=== {s:.2f} [{d['type']}] {d['title']}\n{d['url']}\n{d['text'][:700]}\n")


if __name__ == "__main__":
    main()
