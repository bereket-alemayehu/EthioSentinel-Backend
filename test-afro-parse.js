const fetch = require('node-fetch');

function parseRssItems(xml) {
  const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  return matches.slice(0, 20).map((match, index) => {
    const item = match[1];
    const readTag = (tag) => {
      const tagMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return tagMatch?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") ?? "";
    };
    return readTag("title");
  });
}

async function test() {
  const res = await fetch("https://www.afro.who.int/rss/emergencies.xml");
  const xml = await res.text();
  const items = parseRssItems(xml);
  console.log("Total AFRO items:", items.length);
  console.log("Titles:", items);
}

test();
