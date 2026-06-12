const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI("AQ.Ab8RN6IEEi65p1slzCzNkMINiqSvwzMMfm5ATEo0xTy6T-U2oA");
async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const res = await model.generateContent("hello");
    console.log(res.response.text());
  } catch(e) {
    console.error(e);
  }
}
run();
