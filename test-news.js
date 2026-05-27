const fetch = require('node-fetch');

async function test() {
  console.log("Fetching WHO_DON_URL...");
  try {
    const res = await fetch("https://www.who.int/api/hubs/diseaseoutbreaknews?sf_provider=OpenAccessDataProvider&sf_culture=en&$orderby=PublicationDateAndTime%20desc&$top=20", { timeout: 10000 });
    const json = await res.json();
    console.log("WHO_DON_URL items:", json.value?.length || 0);
  } catch (e) {
    console.error("WHO_DON_URL failed:", e.message);
  }

  console.log("Fetching WHO_DON_RSS_URL...");
  try {
    const res = await fetch("https://www.who.int/feeds/entity/csr/don/en/rss.xml", { timeout: 10000 });
    const text = await res.text();
    console.log("WHO_DON_RSS_URL length:", text.length);
  } catch (e) {
    console.error("WHO_DON_RSS_URL failed:", e.message);
  }

  console.log("Fetching WHO_AFRO_RSS_URL...");
  try {
    const res = await fetch("https://www.afro.who.int/rss/emergencies.xml", { timeout: 10000 });
    const text = await res.text();
    console.log("WHO_AFRO_RSS_URL length:", text.length);
  } catch (e) {
    console.error("WHO_AFRO_RSS_URL failed:", e.message);
  }
}

test();
