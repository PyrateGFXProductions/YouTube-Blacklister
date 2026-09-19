const fs = require('fs');
const vm = require('vm');

global.chrome = {
  runtime: { onMessage: { addListener: () => {} }, lastError: null },
  storage: { local: { get: (k, cb) => cb({ aiModel: 'qwen3vl-instruct:latest' }), set: (o, cb) => cb && cb() } }
};

const bgCode = fs.readFileSync(__dirname + '/../background.js', 'utf8');
const bgContext = {
  chrome: global.chrome,
  fetch: global.fetch,
  console,
  AbortController,
  setTimeout,
  clearTimeout
};
vm.createContext(bgContext);
vm.runInContext(bgCode, bgContext);

console.log('Testing live Ollama synthesis with user model qwen3vl-instruct:latest...');
const start = Date.now();
bgContext.synthesizeRulesWithAi("block all ball sports related videos", "qwen3vl-instruct:latest")
  .then(res => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Live synthesis completed in ${elapsed}s!`);
    console.log('Result:', JSON.stringify(res, null, 2));
    if (res.modelUsed !== 'qwen3vl-instruct:latest') {
      console.error(`FAIL: Expected modelUsed to be qwen3vl-instruct:latest, got ${res.modelUsed}`);
      process.exit(1);
    }
    console.log('SUCCESS: Model correctly used and reported!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
