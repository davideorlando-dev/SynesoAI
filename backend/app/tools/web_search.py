from app.core.logging_setup import get_logger
import html
import re
import time
import httpx
from ddgs import DDGS

log = get_logger("app.tools.web_search")


def _fetch_page_excerpt(url: str, max_chars: int = 900) -> str:
    if url.lower().split("?")[0].endswith(".pdf"):
        return ""
    try:
        res = httpx.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Syneso/0.3"},
            follow_redirects=True,
            timeout=3.0,
        )
        res.raise_for_status()
        content_type = res.headers.get("content-type", "").lower()
        if "text/html" not in content_type:
            return ""

        raw = res.text
        raw = re.sub(r"<(script|style|noscript|header|footer|nav)[^>]*>[\s\S]*?</\1>", " ", raw, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", raw)
        text = html.unescape(text)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 120:
            log.info(f"📄 Letti {min(len(text), max_chars)} caratteri dalla pagina: {url}")
            return text[:max_chars]
    except Exception:
        pass
    return ""


def _fallback_wikipedia(subject: str, lang: str = "it", max_results: int = 3) -> list[dict[str, str]]:
    wiki_lang = "en" if lang == "en" else "it"
    try:
        res = httpx.get(
            f"https://{wiki_lang}.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "search",
                "srsearch": subject,
                "format": "json",
                "utf8": 1,
                "srlimit": max_results,
            },
            headers={"User-Agent": "Syneso/0.3 (study assistant)"},
            timeout=4.0,
        )
        res.raise_for_status()
        items = res.json().get("query", {}).get("search", [])
        out: list[dict[str, str]] = []
        for item in items:
            title = item.get("title", "")
            snippet = re.sub(r"<[^>]+>", "", item.get("snippet", ""))
            url = f"https://{wiki_lang}.wikipedia.org/wiki/{title.replace(' ', '_')}"
            if title:
                log.info(f"🔗 Fonte (Wikipedia {wiki_lang.upper()}): {title} -> {url}")
                out.append({"title": title, "url": url, "snippet": snippet})
        return out
    except Exception as e:
        log.warning(f"⚠️ Fallback Wikipedia fallito: {e}")
        return []


def search_course_context(
    subject: str,
    university: str | None = None,
    degree_course: str | None = None,
    max_results: int = 5,
    lang: str = "it",
) -> list[dict[str, str]]:
    is_en = lang == "en"
    queries: list[str] = []
    if is_en:
        if university:
            queries.append(f"{subject} {university} course syllabus")
        elif degree_course:
            queries.append(f"{subject} {degree_course} course syllabus")
        queries.append(f"{subject} university course syllabus")
        region = "us-en"
    else:
        if university:
            queries.append(f"{subject} {university} programma esame")
        elif degree_course:
            queries.append(f"{subject} {degree_course} programma esame")
        queries.append(f"{subject} programma esame universitario")
        region = "it-it"

    collected: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    deadline = time.monotonic() + 10.0

    for q in queries:
        if time.monotonic() > deadline or len(collected) >= max_results:
            break

        for backend_choice in ("auto", "google,startpage,yahoo"):
            if time.monotonic() > deadline:
                break
            try:
                results = DDGS(timeout=4).text(
                    q,
                    region=region,
                    backend=backend_choice,
                    max_results=3,
                )
                for r in results or []:
                    url = r.get("href", "")
                    title = r.get("title", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        log.info(f"🔗 Fonte ({backend_choice}): {title} -> {url}")
                        collected.append(
                            {
                                "title": title,
                                "url": url,
                                "snippet": r.get("body", ""),
                            }
                        )
                    if len(collected) >= max_results:
                        break
                if results:
                    break
            except Exception as e:
                log.warning(f"⚠️ Ricerca '{q}' ({backend_choice}) fallita: {e}")
                continue

    if not collected:
        log.info("ℹ️ Motori web bloccati o lenti, uso fallback Wikipedia...")
        collected = _fallback_wikipedia(subject, lang=lang, max_results=3)
    else:
        aggregators = ("studocu.", "docsity.", "skuola.net", "coursehero.", "scribd.")
        prioritized = sorted(
            collected,
            key=lambda x: any(ag in x["url"].lower() for ag in aggregators),
        )
        for item in prioritized[:3]:
            excerpt = _fetch_page_excerpt(item["url"], max_chars=900)
            if excerpt:
                item["snippet"] = f"{item['snippet']} | {excerpt}"
                break

    return collected