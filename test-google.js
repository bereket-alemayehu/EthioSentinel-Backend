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

function extractReadableSummary(raw) {
  const decoded = decodeHtmlEntities(raw);
  const bodyMatch = decoded.match(/<div[^>]*field--name-body[^>]*>([\s\S]*?)<\/div>/i);
  const source = bodyMatch?.[1] ?? decoded;
  const paragraphs = Array.from(source.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);

  const text = paragraphs.length > 0 ? paragraphs.join(" ") : stripHtml(source);
  return text.length > 420 ? `${text.slice(0, 417).trim()}...` : text;
}

function parseRssItems(xml) {
  const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  return matches.slice(0, 2).map((match, index) => {
    const item = match[1];
    const readTag = (tag) => {
      const tagMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return tagMatch?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") ?? "";
    };
    const title = stripHtml(readTag("title"));
    const summary = extractReadableSummary(readTag("description"));
    return { title, summary };
  });
}

async function test() {
  const res = await fetch("https://news.google.com/rss/search?q=Ethiopia+health&hl=en-US&gl=US&ceid=US:en");
  const xml = await res.text();
  const items = parseRssItems(xml);
  console.log("Total Google items:", items.length);
  console.log("Items:", items);
}

test();
