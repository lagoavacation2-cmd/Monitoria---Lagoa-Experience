import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { monitoria, criterios } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "openrouter/free";

    if (!apiKey) return res.status(500).json({ error: "API Key não configurada." });

    if (model.startsWith("sk-or-")) {
      return res.status(400).json({
        error: "OPENROUTER_MODEL está incorreto. Você colocou a API Key no campo de modelo. Use um modelo como openrouter/free."
      });
    }

    const itensNao = criterios.filter((c: any) => c.status_final === 'NÃO').map((c: any) => c.item_avaliado).join(', ');
    const itensParcial = criterios.filter((c: any) => c.status_final === 'PARCIAL').map((c: any) => c.item_avaliado).join(', ');

    const prompt = `
Com base na monitoria de atendimento [${monitoria.tipo_atendimento}] do colaborador ${monitoria.colaborador}:
Nota Final: ${monitoria.nota_final}%
Pontos Fortes: ${monitoria.pontos_fortes}
Pontos de Melhoria: ${monitoria.pontos_melhoria}
Itens NÃO realizados: ${itensNao}
Itens PARCIALMENTE realizados: ${itensParcial}

Gere um feedback detalhado contendo:
1. Feedback para o Colaborador (tom motivacional e corretivo)
2. Plano de Ação (passos práticos)
3. Orientação de Treinamento
4. Identificação de Falhas Críticas (se houver)
5. Impacto dessas falhas no negócio

Responda APENAS JSON:
{
  "feedback_colaborador": "",
  "plano_acao": "",
  "orientacao_treinamento": "",
  "falhas_criticas": "",
  "impacto_falhas": ""
}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-OpenRouter-Title": "Lagoa Feedback Generator"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const responseText = await response.text();
    clearTimeout(timeoutId);

    try {
      const data = JSON.parse(responseText);
      let content = data.choices[0].message.content;
      const match = content.match(/\{[\s\S]*\}/);
      if (match) content = match[0];
      return res.status(200).json(JSON.parse(content));
    } catch (e) {
      return res.status(500).json({ error: "Erro ao processar resposta da IA." });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
