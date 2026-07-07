require('dotenv').config();
(async () => {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'say hi, respond in json format' }]
    })
  });
  console.log('STATUS:', res.status);
  console.log(await res.text());
})();
