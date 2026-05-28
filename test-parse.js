const fetch = require('node-fetch');

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_match, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

function stripHtml(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml) {
  const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  return matches.slice(0, 20).map((match, index) => {
    const item = match[1];
    const readTag = (tag) => {
      const tagMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return tagMatch?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") ?? "";
    };
    const title = stripHtml(readTag("title"));
    return title;
  });
}

async function test() {
  const res = await fetch("https://www.who.int/feeds/entity/csr/don/en/rss.xml");
  const xml = await res.text();
  const items = parseRssItems(xml);
  console.log("Found items:", items.length);
  if (items.length > 0) console.log("First item:", items[0]);
}

test();
