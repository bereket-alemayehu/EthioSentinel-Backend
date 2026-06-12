(async () => {
  try {
    const url =
      "https://news.google.com/rss/search?q=Ethiopia+health&hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const matches = Array.from(
      xml.matchAll(/<item>([\s\S]*?)<\/item>/gi),
    ).slice(0, 8);
    const readTag = (item, tag) => {
      const m = item.match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
      );
      return m?.[1] ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "") : "";
    };
    const stripHtml = (s) =>
      String(s || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const items = matches.map((m, idx) => {
      const item = m[1];
      const title = stripHtml(readTag(item, "title"));
      const link = stripHtml(readTag(item, "link"));
      const pubDate = stripHtml(readTag(item, "pubDate"));
      const description = stripHtml(readTag(item, "description"));
      const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
      const source = sourceMatch ? stripHtml(sourceMatch[1]) : "";
      return {
        id: `${idx}-${title.slice(0, 60)}`,
        title,
        link,
        publishedAt: pubDate || null,
        source,
        summary: description,
      };
    });
    console.log(JSON.stringify(items, null, 2));
  } catch (err) {
    console.error("Fetch error:", err?.message || err);
    process.exit(1);
  }
})();
