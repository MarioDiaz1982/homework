require('dns').setDefaultResultOrder?.('ipv4first');

const { ProxyAgent, setGlobalDispatcher } = require('undici');
const OpenAI = require('openai');

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
  console.log('[proxy] usando', proxy);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 90000,
  maxRetries: 0,
});

(async () => {
  console.log('entro');
  try {
    // test rápido
    await client.models.list();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [
        { role: "system", content: "Sos un asistente que ayudará al usuario con sus consultas." },
        { role: "user", content: "Quién ganó el mundial de fútbol en 1986?" },
        { role: "assistant", content: "Argentina lo ganó en 1986." },
        { role: "user", content: "Donde se jugó?" }
      ]
    });

    console.log(completion.choices[0].message);
  } catch (err) {
    console.error('OpenAI error:', err.status ?? '', err.message ?? err);
    console.error('name:', err.name);
    console.error('cause:', err.cause?.code, err.cause?.errno, err.cause?.message);
  }
})();
