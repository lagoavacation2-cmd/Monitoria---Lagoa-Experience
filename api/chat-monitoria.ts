import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { monitoria, historico, mensagem } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "openrouter/free";

    if (!apiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY não configurada." });
    }

    const chatPrompt = `
Você é o assistente de monitoria da LAGOA EXPERIENCE. 
Você está discutindo uma análise de monitoria feita anteriormente para o colaborador ${monitoria.colaborador}.
Tipo de atendimento: ${monitoria.tipo_atendimento}.
Nota Final: ${monitoria.nota_final}.
Resumo da análise: ${monitoria.resumo_geral}.

Histórico do chat:
${historico.map((h: any) => `${h.autor}: ${h.mensagem}`).join('\n')}

Usuário pergunta: ${mensagem}

Responda como um consultor especialista em treinamento, de forma construtiva e baseada nos dados da monitoria. Seja breve e direto.
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-OpenRouter-Title": "Lagoa Experience Monitoria"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Você é o assistente de monitoria da LAGOA EXPERIENCE."
          },
          {
            role: "user",
            content: chatPrompt
          }
        ]
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.error?.message || responseText;
      } catch (e) {}
      return res.status(response.status).json({ error: errorDetail || "Erro na chamada da OpenRouter" });
    }

    try {
      const data = JSON.parse(responseText);
      return res.status(200).json({ mensagem: data.choices?.[0]?.message?.content || '' });
    } catch (parseError) {
      return res.status(500).json({ error: "Erro ao processar resposta do chat." });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
