"""Download every page listed in bulletin.sfsu.edu/sitemap.xml into a local cache.

Respects robots.txt disallow rules and uses limited concurrency.
Usage: python3 scraper/fetch.py [cache_dir]
"""
import concurrent.futures as cf
import gzip
import hashlib
import os
import re
import sys
import time
import urllib.request
import urllib.robotparser

BASE = "https://bulletin.sfsu.edu"
UA = "student-planner-bulletin-scraper/1.0 (personal academic planning)"
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".cache")
EXTRA = ["/courses/", "/courses/courses-terms/", "/programs/", "/undergraduate-education/majors/"]


def get(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            time.sleep(2 ** (attempt + 1))


def cache_path(url):
    path = url.replace(BASE, "").strip("/") or "index"
    safe = re.sub(r"[^A-Za-z0-9._/-]", "_", path)
    return os.path.join(CACHE, safe, "page.html.gz")


def fetch(url):
    p = cache_path(url)
    if os.path.exists(p):
        return url, "cached"
    os.makedirs(os.path.dirname(p), exist_ok=True)
    body = get(url)
    with gzip.open(p, "wb") as f:
        f.write(body)
    time.sleep(0.25)
    return url, "ok"


def main():
    rp = urllib.robotparser.RobotFileParser(BASE + "/robots.txt")
    rp.read()
    sitemap = get(BASE + "/sitemap.xml").decode()
    urls = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    urls += [BASE + p for p in EXTRA]
    urls = sorted({u for u in urls if rp.can_fetch(UA, u)})
    print(f"{len(urls)} urls", flush=True)
    failed = []
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch, u): u for u in urls}
        for i, fut in enumerate(cf.as_completed(futs), 1):
            try:
                fut.result()
            except Exception as e:  # noqa: BLE001
                failed.append((futs[fut], str(e)))
            if i % 100 == 0:
                print(f"{i}/{len(urls)}", flush=True)
    with open(os.path.join(CACHE, "urls.txt"), "w") as f:
        f.write("\n".join(urls) + "\n")
    print(f"done, {len(failed)} failed")
    for u, e in failed:
        print("FAIL", u, e)


if __name__ == "__main__":
    main()
