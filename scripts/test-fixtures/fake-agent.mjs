const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (typeof prompt.system !== 'string' || typeof prompt.user !== 'string') process.exit(2);
process.stdout.write(JSON.stringify({ text: '{"ok":true}' }));
