import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'openrouter/free';

    if (!apiKey) {
      return res.status(500).json({
        status: 'erro',
        message: 'OPENROUTER_API_KEY não configurada.'
      });
    }

    if (model.startsWith('sk-or-')) {
      return res.status(400).json({
        status: 'erro',
        message: 'OPENROUTER_MODEL está incorreto. Você colocou a API Key no campo de modelo.'
      });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-OpenRouter-Title': 'Lagoa Experience Monitoria'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: 'Responda apenas: API funcionando'
          }
        ],
        temperature: 0.2
      })
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        status: 'erro',
        message: 'Erro ao testar OpenRouter',
        details: text
      });
    }

    return res.status(200).json({
      status: 'ok',
      message: 'API funcionando',
      raw: text
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'erro',
      message: 'Erro interno na rota /api/test-openrouter',
      details: error?.message || String(error)
    });
  }
}
