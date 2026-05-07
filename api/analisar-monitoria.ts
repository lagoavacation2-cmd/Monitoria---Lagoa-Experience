import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { tipo, arquivos, colaborador, avaliador, observacoes } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "openrouter/free";

    if (!apiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY não configurada." });
    }

    if (model.startsWith("sk-or-")) {
      return res.status(400).json({
        error: "OPENROUTER_MODEL está incorreto. Você colocou a API Key no campo de modelo. Use um modelo como openrouter/free."
      });
    }

    if (!tipo || !arquivos || !Array.isArray(arquivos)) {
      return res.status(400).json({ error: "Dados incompletos para análise." });
    }

    const contextFiles = arquivos.map((f: any) => `Arquivo: ${f.nome}\nConteúdo/Transcrição: ${f.conteudo}`).join('\n\n---\n\n');

    const promptSDR = `
Você é uma IA especialista em monitoria de atendimentos do Lagoa Experience. Analise os atendimentos de um SDR.
CRITÉRIOS E PESOS (Total 100):

1. Comunicação e Apresentação Inicial (10 pontos)
- Saudação com sorriso perceptível na voz (2.5)
- Identificação com nome, cargo e Grupo Lagoa Quente (2.5)
- Validação do nome do cliente e personalização imediata (2.5)
- Verificação respeitosa de tempo disponível para conversa (2.5)

2. Apresentação do Conceito de Experiência (15 pontos)
- Conectou o contato ao cadastro feito pelo cliente (2.5)
- Explicou o Grupo Lagoa Quente e o programa Lagoa Vacation (2.5)
- Mencionou que o cliente foi selecionado para experiência com até 50% de desconto (2.5)
- Criou vínculo emocional: lazer, descanso, família e bem-estar (2.5)
- Perguntou se o cliente já conhece Caldas Novas ou o Grupo Lagoa (2.5)
- Se já hospedado, explorou experiência anterior e gerou conexão emocional (2.5)

3. Explicação da Apresentação Obrigatória (12 pontos)
- Informou claramente sobre os 90 minutos de apresentação (3)
- Reforçou que a apresentação ocorre durante a hospedagem e é obrigatória (3)
- Explicou que é exclusiva para o casal, sem compromisso de compra (3)
- Verificou se há dúvidas e respondeu com segurança (3)

4. Qualificação Consultiva e Comleta (25 pontos)
- Coletou nome completo do cliente e do cônjuge (2.5)
- Coletou cidade e estado onde moram (2.5)
- Verificou profissão do casal (2.5)
- Verificou se a casa é própria ou não (2.5)
- Verificou estado civil e tempo de relacionamento (2.5)
- Verificou modelo e ano do carro da família (2.5)
- Verificou se tem filhos, quantidade e idade aproximada (2.5)
- Identificou estilo de vida, frequência de viagens e lazer em família (2.5)
- Checou se o perfil se enquadra na política vigente (2.5)
- Quando necessário, solicitou autorização de excecao com responsabilidade (2.5)

5. Técnica Comercial (15 pontos)
- Seguiu o script com naturalidade, sem parecer robótico (2.5)
- Transmitiu energia e profissionalismo (2.5)
- Aplicou gatilhos mentais: escassez, urgência e exclusividade (2.5)
- Identificou e lidou bem com objeções iniciais (2.5)
- Adaptou a linguagem conforme o perfil do cliente (2.5)
- Confirmou o interesse do cliente em seguir para reserva (2.5)

6. Encaminhamento do Lead (13 pontos)
- Encaminhou o lead corretamente para o Closer (2.6)
- Informou o que o cliente vai receber: valores, regulamento, voucher etc. (2.6)
- Confirmou e registrou os dados corretos de contato (2.6)
- Fez o registro completo e correto no CRM ou planilha (2.6)
- Atualizou a etapa correta do funil (2.6)

7. Qualidade Global (10 pontos)
- Linguagem clara, cordial e consultiva (2)
- Postura empática e sem pressa (2)
- Comunicação fluida, sem vícios de linguagem (2)
- Domínio total do processo e informações (2)
- Condução com segurança, simpatia e ritmo adequado (2)

REGRAS OBRIGATÓRIAS SDR:
- O SDR deve conectar cadastro, apresentar conceito, explicar 90 minutos, obrigatoriedade durante hospedagem, exclusividade para casal, ausência de compromisso de compra, qualificar perfil completo e encaminhar corretamente ao Closer.
`;

    const promptCloser = `
Você é uma IA especialista em monitoria de atendimentos do Lagoa Experience. Analise os atendimentos de um Closer.
CRITÉRIOS E PESOS (Total 100):

1. Reabertura Estratégica (8 pontos)
- Saudação cordial e acolhedora (2)
- Reapresentação como Supervisor(a) do SDR [NOME DO SDR] e consultor(a) do Conceito de Experiência (2)
- Retomou informações repassadas pelo SDR (2)
- Confirmou interesse e conduziu com segurança (2)

2. Reforço do Conceito (10 pontos)
- Reforçou o conceito do Lagoa Vacation e o convite à experiência (2.5)
- Relembrou o benefício da hospedagem com até 50% de desconto (2.5)
- Enfatizou os diferenciais do Grupo Lagoa Quente (2.5)
- Criou vínculo emocional com o cliente: qualidade de vida, lazer e família (2.5)

3. Apresentação da Oferta (14 pontos)
- Informou o valor de balcão (3.5)
- Comparou com o valor promocional com desconto (3.5)
- Explicou o que está incluso: hospedagem, parque, alimentação etc. (3.5)
- Tornou o valor percebido como vantajoso (3.5)

4. Técnicas de Fechamento (15 pontos)
- Criou urgência: últimas unidades, fim da campanha etc. (3)
- Aplicou escassez: condição exclusiva e limitada (3)
- Trabalhou objeções com firmeza e empatia (3)
- Solicitou autorização de desconto adicional quando necessário (3)
- Conduziu para a confirmação com naturalidade (3)

5. Envio do Check-list de Ciência (12 pontos)
- Enviou o Forms de ciência com todos os pontos obrigatórios: data/horário da apresentação, check-in/check-out, cancelamento, taxa administrativa, distância do parque, não comparecimento, regime de pensão, voucher e informações do empreendimento (4)
- Reforçou verbalmente os principais pontos do check-list (4)
- Verificou o recebimento e assinatura do Forms pelo cliente (4)

6. Coleta Completa de Dados para Reserva (14 pontos)
- Nome completo dos hóspedes, incluindo a família toda (2)
- CPF de todos os adultos (2)
- Data de nascimento dos hóspedes (2)
- Endereço completo com CEP (2)
- Telefone de contato e e-mail (2)
- Nome do empreendimento e período definido (2)
- Quantidade de adultos e crianças (2)

7. Procedimentos Operacionais (13 pontos)
- Lançou a reserva corretamente na planilha de reservas de acompanhamento (2.6)
- Lançou todos os dados no sistema TSE sem erros (2.6)
- Garantiu que o cliente recebeu o voucher com os dados da reserva (2.6)
- Atualizou status do lead como vendido/reserva confirmada no CRM (2.6)
- Conferiu todos os dados antes de encerrar o atendimento (2.6)

8. Finalização (7 pontos)
- Reforçou os benefícios e a importância da apresentação (1.75)
- Demonstrou empolgação com a chegada do cliente (1.75)
- Finalizou com o speech padrão de encerramento Lagoa (1.75)
- Agradeceu o tempo e reforçou suporte em caso de dúvidas (1.75)

9. Qualidade Global (7 pontos)
- Linguagem clara, consultiva e envolvente (1.75)
- Atendimento seguro, sem hesitações ou ruídos (1.75)
- Postura profissional e confiante (1.75)
- Domínio total do processo e sistema (1.75)

REGRAS OBRIGATÓRIAS CLOSER:
- O Closer DEVE se apresentar como Supervisor(a) do SDR [NOME] e consultor(a) do Conceito de Experiência. Se não houver essa apresentação específica, penalize o critério Reabertura Estratégica.
`;

    const mainPrompt = `
Contexto de Atendimento:
Colaborador: ${colaborador}
Tipo: ${tipo}
Observações do Avaliador: ${observacoes}

Arquivos Analisados:
${contextFiles}

${tipo === 'SDR' ? promptSDR : promptCloser}

A resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "nota_ia": 0,
  "nota_final": 0,
  "classificacao": "Excelente/Bom/Regular/Abaixo do esperado/Crítico",
  "classificacao_ia": "Excelente/Bom/Regular/Abaixo do esperado/Crítico",
  "classificacao_final": "Excelente/Bom/Regular/Abaixo do esperado/Crítico",
  "resumo_geral": "texto",
  "pontos_fortes": "texto",
  "pontos_melhoria": "texto",
  "falhas_criticas": "texto",
  "impacto_falhas": "texto",
  "feedback_colaborador": "texto",
  "plano_acao": "texto",
  "orientacao_treinamento": "texto",
  "resumo_analise_cruzada": "texto",
  "criterios": [
    {
      "criterio": "Nome do Critério (ex: Comunicação e Apresentação Inicial)",
      "item_avaliado": "Descrição do Item Exato (ex: Saudação com sorriso perceptível na voz)",
      "peso": 2.5,
      "status_ia": "SIM/PARCIAL/NÃO",
      "pontuacao_ia": 2.5,
      "comentario_ia": "Motivação detalhada",
      "status_final": "SIM/PARCIAL/NÃO",
      "pontuacao_final": 2.5,
      "fonte_evidencia": "Local exato no texto",
      "orientacao_correcao": "O que fazer para melhorar",
      "observacao_admin": ""
    }
  ]
}

PONTUAÇÃO: SIM (100% do peso), PARCIAL (50% do peso), NÃO (0% do peso).
Importante: 
1. nota_final deve ser igual a nota_ia inicialmente.
2. A soma dos pesos deve ser exatamente 100.
3. Se status_ia for SIM, pontuacao_ia = peso. Se PARCIAL, pontuacao_ia = peso * 0.5. Se NÃO, pontuacao_ia = 0.
4. A nota_ia é a soma das pontuacoes_ia de todos os itens detalhados.
5. Seja rigoroso e avalie CADA ITEM listado acima. Não pule nenhum.
6. Use linguagem profissional e humanizada em português.
7. Identifique a fonte da evidência para cada item.
8. Responda APENAS o JSON estruturado.
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
            content: "Você é uma IA especialista em monitoria de atendimentos do Lagoa Experience. Responda APENAS com o JSON solicitado."
          },
          {
            role: "user",
            content: mainPrompt
          }
        ],
        temperature: 0.2
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.error?.message || responseText;
      } catch (e) {
        // não é JSON, mantém texto bruto
      }
      return res.status(response.status).json({ error: errorDetail || "Erro na chamada da OpenRouter" });
    }

    let text = responseText;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];

    try {
      const data = JSON.parse(text);
      if (data.choices?.[0]?.message?.content) {
         // O OpenRouter retorna um objeto com choices, o conteúdo da IA está dentro de message.content
         // E esse conteúdo deve ser o JSON que pedimos.
         let innerText = data.choices[0].message.content;
         const innerMatch = innerText.match(/\{[\s\S]*\}/);
         if (innerMatch) innerText = innerMatch[0];
         const jsonResult = JSON.parse(innerText);
         return res.status(200).json(jsonResult);
      }
      
      // Se caiu aqui, o parse falhou ou a estrutura é diferente
      return res.status(200).json(data);
    } catch (parseError) {
      return res.status(500).json({ error: "A IA retornou resposta inválida. Tente gerar novamente." });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Erro interno no servidor' });
  }
}
