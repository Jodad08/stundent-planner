"""Keyword (BM25) search over data/sfsu/rag/chunks.jsonl — no dependencies.

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
TOKEN = re.compile(r"[a-z0-9]+")


def tokens(text):
    # keep course codes like "CSC 415" together as one token as well as separate words
    t = text.lower()
    out = TOKEN.findall(t)
    out += [a + b for a, b in re.findall(r"\b([a-z]{1,5}) (\d{3}[a-z]{0,3})\b", t)]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("-k", type=int, default=8)
    ap.add_argument("--type", help="restrict to a chunk type, e.g. course, academic_rule, policy, roadmap")
    args = ap.parse_args()

    docs = []
    with open(CHUNKS) as f:
        for line in f:
            d = json.loads(line)
            if args.type and d["type"] != args.type:
                continue
            docs.append(d)
    tf = [collections.Counter(tokens(d["title"] + " " + d["text"])) for d in docs]
    df = collections.Counter()
    for c in tf:
        df.update(c.keys())
    n = len(docs)
    avgdl = sum(sum(c.values()) for c in tf) / max(n, 1)
    q = tokens(args.query)
    k1, b = 1.5, 0.75
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
            s *= 1.3  # curated rules are the most direct answers
        if s:
            scores.append((s, i))
    for s, i in sorted(scores, reverse=True)[: args.k]:
        d = docs[i]
        print(f"=== {s:.2f} [{d['type']}] {d['title']}\n{d['url']}\n{d['text'][:700]}\n")


if __name__ == "__main__":
    main()
