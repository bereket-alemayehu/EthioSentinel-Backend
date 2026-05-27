const fetch = require('node-fetch');
async function test() {
  const res = await fetch("https://www.who.int/feeds/entity/csr/don/en/rss.xml");
  const xml = await res.text();
  console.log(xml.substring(0, 1000));
}
test();
