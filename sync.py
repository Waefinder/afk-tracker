#!/usr/bin/env python3
"""Sync hero list + images from AFK Journey wiki.

  python sync.py          # add new heroes, refresh data, download missing images, rewrite HTML
  python sync.py --check  # verify only: no pending heroes, all images on disk (exit 1 if not)
"""
import json, re, sys, os, urllib.request, urllib.parse

API = "https://afk-journey.fandom.com/api.php"
UA = {"User-Agent": "Mozilla/5.0 (afk-tracker sync)"}
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "hero_data_final.json")
IMG_DIR = os.path.join(HERE, "img")

def api(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=30))

def norm(title):            # wiki title -> our hero key ("Elijah & Lailah" -> "Elijah_Lailah")
    return re.sub(r"[\s&]+", "_", title).strip("_")

def field(box, key):
    m = re.search(r"\|\s*" + key + r"\s*=\s*([^\n|]+)", box)
    return m.group(1).strip() if m else ""

def wiki_heroes():
    """-> {our_name: {f, r, c, img, title}} for type=Playable heroes only."""
    q = api({"action": "query", "list": "categorymembers",
             "cmtitle": "Category:Heroes", "cmlimit": "500", "cmtype": "page"})
    titles = [x["title"] for x in q["query"]["categorymembers"]]
    out = {}
    for i in range(0, len(titles), 40):
        b = titles[i:i + 40]
        pages = api({"action": "query", "titles": "|".join(b),
                     "prop": "revisions|pageimages", "rvprop": "content",
                     "rvslots": "main", "piprop": "original", "pilicense": "any"})
        for p in pages["query"]["pages"].values():
            try:
                wtxt = p["revisions"][0]["slots"]["main"]["*"]
            except Exception:
                continue
            m = re.search(r"\{\{Character Infobox(.*?)\}\}", wtxt, re.S)
            if not m or field(m.group(1), "type") != "Playable":
                continue
            box = m.group(1)
            faction = field(box, "faction")
            if "<!--" in faction or not field(box, "rarity"):
                continue  # e.g. Magister Merlin - no faction/rarity, app groups by faction
            out[norm(p["title"])] = {
                "f": faction.split(",")[0].strip(),
                "c": field(box, "class"),
                "r": {"Rare": "A"}.get(field(box, "rarity"), field(box, "rarity")),
                "title": p["title"],
                "img": p.get("original", {}).get("source", ""),
            }
    return out

def load_heroes():
    """hero_data_final.json -> list of dicts (order preserved)."""
    s = json.load(open(DATA, encoding="utf-8"))["hero_js"]
    return [{"n": n, "f": f, "r": r, "c": c, "img": i} for n, f, r, c, i in
            re.findall(r'\{n:"([^"]+)",f:"([^"]*)",r:"([^"]*)",c:"([^"]*)",img:"([^"]*)"\}', s)]

def dump_heroes(heroes):
    js = ",".join('{n:"%s",f:"%s",r:"%s",c:"%s",img:"%s"}' %
                  (h["n"], h["f"], h["r"], h["c"], h["img"]) for h in heroes)
    out = {"hero_js": js, "count": len(heroes)}  # original file shape: single line, these keys
    open(DATA, "w", encoding="utf-8", newline="").write(json.dumps(out, ensure_ascii=False))

def download(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return True
    try:
        req = urllib.request.Request(url, headers=UA)
        data = urllib.request.urlopen(req, timeout=30).read()
        if len(data) < 1000:
            return False
        open(path, "wb").write(data)
        return True
    except Exception as e:
        print(f"  ! download failed {os.path.basename(path)}: {e}")
        return False

def rewrite_html(heroes):
    """Replace the embedded var HS=[...] line in every page, pointing at img/."""
    local = [dict(h, img=f"img/{h['n']}.webp") for h in heroes]
    line = "var HS=[" + ",".join(
        '{n:"%s",f:"%s",r:"%s",c:"%s",img:"%s"}' % (h["n"], h["f"], h["r"], h["c"], h["img"])
        for h in local) + "]"
    hits = 0
    for f in sorted(os.listdir(HERE)):
        if not f.endswith(".html"):
            continue
        p = os.path.join(HERE, f)
        t = open(p, encoding="utf-8").read()
        if not re.search(r"var\s+HS\s*=\s*\[", t):
            continue
        t2 = re.sub(r"var\s+HS\s*=\s*\[.*?\];", lambda _: line + ";", t, count=1, flags=re.S)
        if t2 != t:
            open(p, "w", encoding="utf-8", newline="").write(t2)
        hits += 1
    return hits

def main():
    check = "--check" in sys.argv
    heroes = load_heroes()
    wiki = wiki_heroes()
    have = {h["n"] for h in heroes}

    new = sorted(set(wiki) - have)
    gone = sorted(have - set(wiki))
    changed = [(h["n"], k, h[k], wiki[h["n"]][k]) for h in heroes
               for k in ("f", "r", "c") if h["n"] in wiki and wiki[h["n"]][k] and h[k] != wiki[h["n"]][k]]
    noimg = [h["n"] for h in heroes if not h["img"]]

    if check:
        os.makedirs(IMG_DIR, exist_ok=True)
        missing_files = [h["n"] for h in heroes
                         if not os.path.exists(os.path.join(IMG_DIR, h["n"] + ".webp"))]
        problems = []
        if new:    problems.append(f"new heroes not added: {new}")
        if changed: problems.append(f"data differs from wiki: {changed}")
        if noimg:  problems.append(f"no img url: {noimg}")
        if missing_files: problems.append(f"img file missing ({len(missing_files)}): {missing_files[:5]}")
        want = [h["n"] for h in heroes]
        for f in sorted(os.listdir(HERE)):
            if not f.endswith(".html"):
                continue
            t = open(os.path.join(HERE, f), encoding="utf-8").read()
            m = re.search(r"var\s+HS\s*=\s*\[(.*?)\];", t, re.S)
            if m and re.findall(r'\{n:"([^"]+)"', m.group(1)) != want:
                problems.append(f"{f}: embedded HS out of sync with hero_data_final.json")
        if problems:
            print("FAIL"); [print(" -", p) for p in problems]; sys.exit(1)
        print(f"OK: {len(heroes)} heroes, all images on disk")
        return

    # 1) add new heroes (alphabetical insert), fill missing img urls
    for n in new:
        w = wiki[n]
        heroes.append({"n": n, "f": w["f"], "r": w["r"], "c": w["c"], "img": w["img"]})
    heroes.sort(key=lambda h: h["n"])
    for h in heroes:
        if not h["img"] and h["n"] in wiki:
            h["img"] = wiki[h["n"]]["img"]
        if h["n"] in wiki:  # trust wiki for faction/class/rarity
            h.update({k: wiki[h["n"]][k] for k in ("f", "r", "c") if wiki[h["n"]][k]})

    # 2) images
    os.makedirs(IMG_DIR, exist_ok=True)
    dl_fail = [h["n"] for h in heroes if not download(h["img"], os.path.join(IMG_DIR, h["n"] + ".webp"))]

    # 3) report
    print(f"heroes: {len(heroes)} (wiki playable: {len(wiki)})")
    for n in new: print(f" + NEW {n} ({wiki[n]['f']}/{wiki[n]['c']}/{wiki[n]['r']})")
    for o in sorted({x[0] for x in changed}): print(f" ~ UPDATED {o}: " + ", ".join(
        f"{k} {a}->{b}" for n, k, a, b in changed if n == o))
    if gone: print(f" ! on disk but gone/renamed on wiki: {gone}")
    if dl_fail: print(f" ! image download failed: {dl_fail}")

    # 4) write files
    dump_heroes(heroes)
    pages = rewrite_html(heroes)
    print(f"wrote hero_data_final.json + {pages} html pages, img/ = {len(os.listdir(IMG_DIR))} files")

if __name__ == "__main__":
    main()
