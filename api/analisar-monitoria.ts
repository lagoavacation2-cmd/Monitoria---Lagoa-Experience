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
A análise DEVE conter exatamente os 40 itens abaixo, distribuídos nos critérios principais:

1. Comunicação e Apresentação Inicial (10 pontos)
1.1 Saudação com sorriso perceptível na voz (2.5)
1.2 Identificação com nome, cargo e Grupo Lagoa Quente (2.5)
1.3 Validação do nome do cliente e personalização imediata (2.5)
1.4 Verificação respeitosa de tempo disponível para conversa (2.5)

2. Apresentação do Conceito de Experiência (15 pontos)
2.1 Conectou o contato ao cadastro feito pelo cliente (2.5)
2.2 Explicou o Grupo Lagoa Quente e o programa Lagoa Vacation (2.5)
2.3 Mencionou que o cliente foi selecionado para experiência com até 50% de desconto (2.5)
2.4 Criou vínculo emocional: lazer, descanso, família e bem-estar (2.5)
2.5 Perguntou se o cliente já conhece Caldas Novas ou o Grupo Lagoa (2.5)
2.6 Se já hospedado, explorou experiência anterior e gerou conexão emocional (2.5)

3. Explicação da Apresentação Obrigatória (12 pontos)
3.1 Informou claramente sobre os 90 minutos de apresentação (3)
3.2 Reforçou que a apresentação ocorre durante a hospedagem e é obrigatória (3)
3.3 Explicou que é exclusiva para o casal, sem compromisso de compra (3)
3.4 Verificou se há dúvidas e respondeu com segurança (3)

4. Qualificação Consultiva e Completa (25 pontos)
4.1 Coletou nome completo do cliente e do cônjuge (2.5)
4.2 Coletou cidade e estado onde moram (2.5)
4.3 Verificou profissão do casal (2.5)
4.4 Verificou se a casa é própria ou não (2.5)
4.5 Verificou estado civil e tempo de relacionamento (2.5)
4.6 Verificou modelo e ano do carro da família (2.5)
4.7 Verificou se tem filhos, quantidade e idade aproximada (2.5)
4.8 Identificou estilo de vida, frequência de viagens e lazer em família (2.5)
4.9 Checou se o perfil se enquadra na política vigente (2.5)
4.10 Quando necessário, solicitou autorização de exceção com responsabilidade (2.5)

5. Técnica Comercial (15 pontos)
5.1 Seguiu o script com naturalidade, sem parecer robótico (2.5)
5.2 Transmitiu energia e profissionalismo (2.5)
5.3 Aplicou gatilhos mentais: escassez, urgência e exclusividade (2.5)
5.4 Identificou e lidou bem com objeções iniciais (2.5)
5.5 Adaptou a linguagem conforme o perfil do cliente (2.5)
5.6 Confirmou o interesse do cliente em seguir para reserva (2.5)

6. Encaminhamento do Lead (13 pontos)
6.1 Encaminhou o lead corretamente para o Closer (2.6)
6.2 Informou o que o cliente vai receber: valores, regulamento, voucher etc. (2.6)
6.3 Confirmou e registrou os dados corretos de contato (2.6)
6.4 Fez o registro completo e correto no CRM ou planilha (2.6)
6.5 Atualizou a etapa correta do funil (2.6)

7. Qualidade Global (10 pontos)
7.1 Linguagem clara, cordial e consultiva (2)
7.2 Postura empática e sem pressa (2)
7.3 Comunicação fluida, sem vícios de linguagem (2)
7.4 Domínio total do processo e informações (2)
7.5 Condução com segurança, simpatia e ritmo adequado (2)

REGRAS OBRIGATÓRIAS SDR:
- O SDR deve conectar cadastro, apresentar conceito, explicar 90 minutos, obrigatoriedade durante hospedagem, exclusividade para casal, ausência de compromisso de compra, qualificar perfil completo e encaminhar corretamente ao Closer.
`;

    const promptCloser = `
Você é uma IA especialista em monitoria de atendimentos do Lagoa Experience. Analise os atendimentos de um Closer.
A análise DEVE conter exatamente os 40 itens abaixo, distribuídos nos critérios principais:

1. Reabertura Estratégica (8 pontos)
1.1 Saudação cordial e acolhedora (2)
1.2 Reapresentação como Supervisor(a) do SDR [NOME DO SDR] e consultor(a) do Conceito de Experiência (2)
1.3 Retomou informações repassadas pelo SDR (2)
1.4 Confirmou interesse e conduziu com segurança (2)

2. Reforço do Conceito (10 pontos)
2.1 Reforçou o conceito do Lagoa Vacation e o convite à experiência (2.5)
2.2 Relembrou o benefício da hospedagem com até 50% de desconto (2.5)
2.3 Enfatizou os diferenciais do Grupo Lagoa Quente (2.5)
2.4 Criou vínculo emocional com o cliente: qualidade de vida, lazer e família (2.5)

3. Apresentação da Oferta (14 pontos)
3.1 Informou o valor de balcão (3.5)
3.2 Comparou com o valor promocional com desconto (3.5)
3.3 Explicou o que está incluso: hospedagem, parque, alimentação etc. (3.5)
3.4 Tornou o valor percebido como vantajoso (3.5)

4. Técnicas de Fechamento (15 pontos)
4.1 Criou urgência: últimas unidades, fim da campanha etc. (3)
4.2 Aplicou escassez: condição exclusiva e limitada (3)
4.3 Trabalhou objeções com firmeza e empatia (3)
4.4 Solicitou autorização de desconto adicional quando necessário (3)
4.5 Conduziu para a confirmação com naturalidade (3)

5. Envio do Check-list de Ciência (12 pontos)
5.1 Enviou o Forms de ciência com todos os pontos obrigatórios: data/horário da apresentação, check-in/check-out, cancelamento, taxa administrativa, distância do parque, não comparecimento, regime de pensão, voucher e informações do empreendimento (4)
5.2 Reforçou verbalmente os principais pontos do check-list (4)
5.3 Verificou o recebimento e assinatura do Forms pelo cliente (4)

6. Coleta Completa de Dados para Reserva (14 pontos)
6.1 Nome completo dos hóspedes, incluindo a família toda (2)
6.2 CPF de todos os adultos (2)
6.3 Data de nascimento dos hóspedes (2)
6.4 Endereço completo com CEP (2)
6.5 Telefone de contato e e-mail (2)
6.6 Nome do empreendimento e período definido (2)
6.7 Quantidade de adultos e crianças (2)

7. Procedimentos Operacionais / Registro em Sistema (13 pontos)
7.1 Lançou a reserva corretamente na planilha de reservas de acompanhamento (2.6)
7.2 Lançou todos os dados no sistema TSE sem erros (2.6)
7.3 Garantiu que o cliente recebeu o voucher com os dados da reserva (2.6)
7.4 Atualizou status do lead como vendido/reserva confirmada no CRM (2.6)
7.5 Conferiu todos os dados antes de encerrar o atendimento (2.6)

8. Finalização (7 pontos)
8.1 Reforçou os benefícios e a importância da apresentação (1.75)
8.2 Demonstrou empolgação com a chegada do cliente (1.75)
8.3 Finalizou com o speech padrão de encerramento Lagoa (1.75)
8.4 Agradeceu o tempo e reforçou suporte em caso de dúvidas (1.75)

9. Qualidade Global (7 pontos)
9.1 Linguagem clara, consultiva e envolvente (1.75)
9.2 Atendimento seguro, sem hesitações ou ruídos (1.75)
9.3 Postura profissional e confiante (1.75)
9.4 Domínio total do processo e sistema (1.75)

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
  "resumo_geral": "texto",
  "pontos_fortes": "texto",
  "pontos_melhoria": "texto",
  "falhas_criticas": "texto",
  "impacto_falhas": "texto",
  "feedback_colaborador": "texto",
  "plano_acao": "texto",
  "orientacao_treinamento": "texto",
  "criterios": [
    {
      "codigo": "1.1",
      "criterio": "Nome do Critério Principal",
      "item_avaliado": "Descrição exata do item dos formulários",
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
1. A nota_final e nota_ia devem refletir a soma exata dos itens.
2. A soma dos pesos deve ser exatamente 100.
3. Se status_ia for SIM, pontuacao_ia = peso. Se PARCIAL, pontuacao_ia = peso * 0.5. Se NÃO, pontuacao_ia = 0.
4. Avalie CADA UM dos 40 itens detalhados. Se o item não foi identificado, marque como NÃO com pontuação 0.
5. Use linguagem profissional e humanizada em português.
6. Responda APENAS o JSON estruturado.
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
         let jsonResult = JSON.parse(innerText);

         // NORMALIZAÇÃO OBRIGATÓRIA DOS CRITÉRIOS
         const itemsSDR = [
           { cod: "1.1", crit: "Comunicação e Apresentação Inicial", item: "Saudação com sorriso perceptível na voz", peso: 2.5 },
           { cod: "1.2", crit: "Comunicação e Apresentação Inicial", item: "Identificação com nome, cargo e Grupo Lagoa Quente", peso: 2.5 },
           { cod: "1.3", crit: "Comunicação e Apresentação Inicial", item: "Validação do nome do cliente e personalização imediata", peso: 2.5 },
           { cod: "1.4", crit: "Comunicação e Apresentação Inicial", item: "Verificação respeitosa de tempo disponível para conversa", peso: 2.5 },
           { cod: "2.1", crit: "Apresentação do Conceito de Experiência", item: "Conectou o contato ao cadastro feito pelo cliente", peso: 2.5 },
           { cod: "2.2", crit: "Apresentação do Conceito de Experiência", item: "Explicou o Grupo Lagoa Quente e o programa Lagoa Vacation", peso: 2.5 },
           { cod: "2.3", crit: "Apresentação do Conceito de Experiência", item: "Mencionou que o cliente foi selecionado para experiência com até 50% de desconto", peso: 2.5 },
           { cod: "2.4", crit: "Apresentação do Conceito de Experiência", item: "Criou vínculo emocional: lazer, descanso, família e bem-estar", peso: 2.5 },
           { cod: "2.5", crit: "Apresentação do Conceito de Experiência", item: "Perguntou se o cliente já conhece Caldas Novas ou o Grupo Lagoa", peso: 2.5 },
           { cod: "2.6", crit: "Apresentação do Conceito de Experiência", item: "Se já hospedado, explorou experiência anterior e gerou conexão emocional", peso: 2.5 },
           { cod: "3.1", crit: "Explicação da Apresentação Obrigatória", item: "Informou claramente sobre os 90 minutos de apresentação", peso: 3 },
           { cod: "3.2", crit: "Explicação da Apresentação Obrigatória", item: "Reforçou que a apresentação ocorre durante a hospedagem e é obrigatória", peso: 3 },
           { cod: "3.3", crit: "Explicação da Apresentação Obrigatória", item: "Explicou que é exclusiva para o casal, sem compromisso de compra", peso: 3 },
           { cod: "3.4", crit: "Explicação da Apresentação Obrigatória", item: "Verificou se há dúvidas e respondeu com segurança", peso: 3 },
           { cod: "4.1", crit: "Qualificação Consultiva e Completa", item: "Coletou nome completo do cliente e do cônjuge", peso: 2.5 },
           { cod: "4.2", crit: "Qualificação Consultiva e Completa", item: "Coletou cidade e estado onde moram", peso: 2.5 },
           { cod: "4.3", crit: "Qualificação Consultiva e Completa", item: "Verificou profissão do casal", peso: 2.5 },
           { cod: "4.4", crit: "Qualificação Consultiva e Completa", item: "Verificou se a casa é própria ou não", peso: 2.5 },
           { cod: "4.5", crit: "Qualificação Consultiva e Completa", item: "Verificou estado civil e tempo de relacionamento", peso: 2.5 },
           { cod: "4.6", crit: "Qualificação Consultiva e Completa", item: "Verificou modelo e ano do carro da família", peso: 2.5 },
           { cod: "4.7", crit: "Qualificação Consultiva e Completa", item: "Verificou se tem filhos, quantidade e idade aproximada", peso: 2.5 },
           { cod: "4.8", crit: "Qualificação Consultiva e Completa", item: "Identificou estilo de vida, frequência de viagens e lazer em família", peso: 2.5 },
           { cod: "4.9", crit: "Qualificação Consultiva e Completa", item: "Checou se o perfil se enquadra na política vigente", peso: 2.5 },
           { cod: "4.10", crit: "Qualificação Consultiva e Completa", item: "Quando necessário, solicitou autorização de exceção com responsabilidade", peso: 2.5 },
           { cod: "5.1", crit: "Técnica Comercial", item: "Seguiu o script com naturalidade, sem parecer robótico", peso: 2.5 },
           { cod: "5.2", crit: "Técnica Comercial", item: "Transmitiu energia e profissionalismo", peso: 2.5 },
           { cod: "5.3", crit: "Técnica Comercial", item: "Aplicou gatilhos mentais: escassez, urgência e exclusividade", peso: 2.5 },
           { cod: "5.4", crit: "Técnica Comercial", item: "Identificou e lidou bem com objeções iniciais", peso: 2.5 },
           { cod: "5.5", crit: "Técnica Comercial", item: "Adaptou a linguagem conforme o perfil do cliente", peso: 2.5 },
           { cod: "5.6", crit: "Técnica Comercial", item: "Confirmou o interesse do cliente em seguir para reserva", peso: 2.5 },
           { cod: "6.1", crit: "Encaminhamento do Lead", item: "Encaminhou o lead corretamente para o Closer", peso: 2.6 },
           { cod: "6.2", crit: "Encaminhamento do Lead", item: "Informou o que o cliente vai receber: valores, regulamento, voucher etc.", peso: 2.6 },
           { cod: "6.3", crit: "Encaminhamento do Lead", item: "Confirmou e registrou os dados corretos de contato", peso: 2.6 },
           { cod: "6.4", crit: "Encaminhamento do Lead", item: "Fez o registro completo e correto no CRM ou planilha", peso: 2.6 },
           { cod: "6.5", crit: "Encaminhamento do Lead", item: "Atualizou a etapa correta do funil", peso: 2.6 },
           { cod: "7.1", crit: "Qualidade Global", item: "Linguagem clara, cordial e consultiva", peso: 2 },
           { cod: "7.2", crit: "Qualidade Global", item: "Postura empática e sem pressa", peso: 2 },
           { cod: "7.3", crit: "Qualidade Global", item: "Comunicação fluida, sem vícios de linguagem", peso: 2 },
           { cod: "7.4", crit: "Qualidade Global", item: "Domínio total do processo e informações", peso: 2 },
           { cod: "7.5", crit: "Qualidade Global", item: "Condução com segurança, simpatia e ritmo adequado", peso: 2 }
         ];

         const itemsCloser = [
           { cod: "1.1", crit: "Reabertura Estratégica", item: "Saudação cordial e acolhedora", peso: 2 },
           { cod: "1.2", crit: "Reabertura Estratégica", item: "Reapresentação como Supervisor(a) do SDR [NOME DO SDR] e consultor(a) do Conceito de Experiência", peso: 2 },
           { cod: "1.3", crit: "Reabertura Estratégica", item: "Retomou informações repassadas pelo SDR", peso: 2 },
           { cod: "1.4", crit: "Reabertura Estratégica", item: "Confirmou interesse e conduziu com segurança", peso: 2 },
           { cod: "2.1", crit: "Reforço do Conceito", item: "Reforçou o conceito do Lagoa Vacation e o convite à experiência", peso: 2.5 },
           { cod: "2.2", crit: "Reforço do Conceito", item: "Relembrou o benefício da hospedagem com até 50% de desconto", peso: 2.5 },
           { cod: "2.3", crit: "Reforço do Conceito", item: "Enfatizou os diferenciais do Grupo Lagoa Quente", peso: 2.5 },
           { cod: "2.4", crit: "Reforço do Conceito", item: "Criou vínculo emocional com o cliente: qualidade de vida, lazer e família", peso: 2.5 },
           { cod: "3.1", crit: "Apresentação da Oferta", item: "Informou o valor de balcão", peso: 3.5 },
           { cod: "3.2", crit: "Apresentação da Oferta", item: "Comparou com o valor promocional com desconto", peso: 3.5 },
           { cod: "3.3", crit: "Apresentação da Oferta", item: "Explicou o que está incluso: hospedagem, parque, alimentação etc.", peso: 3.5 },
           { cod: "3.4", crit: "Apresentação da Oferta", item: "Tornou o valor percebido como vantajoso", peso: 3.5 },
           { cod: "4.1", crit: "Técnicas de Fechamento", item: "Criou urgência: últimas unidades, fim da campanha etc.", peso: 3 },
           { cod: "4.2", crit: "Técnicas de Fechamento", item: "Aplicou escassez: condição exclusiva e limitada", peso: 3 },
           { cod: "4.3", crit: "Técnicas de Fechamento", item: "Trabalhou objeções com firmeza e empatia", peso: 3 },
           { cod: "4.4", crit: "Técnicas de Fechamento", item: "Solicitou autorização de desconto adicional quando necessário", peso: 3 },
           { cod: "4.5", crit: "Técnicas de Fechamento", item: "Conduziu para a confirmação com naturalidade", peso: 3 },
           { cod: "5.1", crit: "Envio do Check-list de Ciência", item: "Enviou o Forms de ciência com todos os pontos obrigatórios: data/horário da apresentação, check-in/check-out, cancelamento, taxa administrativa, distância do parque, não comparecimento, regime de pensão, voucher e informações do empreendimento", peso: 4 },
           { cod: "5.2", crit: "Envio do Check-list de Ciência", item: "Reforçou verbalmente os principais pontos do check-list", peso: 4 },
           { cod: "5.3", crit: "Envio do Check-list de Ciência", item: "Verificou o recebimento e assinatura do Forms pelo cliente", peso: 4 },
           { cod: "6.1", crit: "Coleta Completa de Dados para Reserva", item: "Nome completo dos hóspedes, incluindo a família toda", peso: 2 },
           { cod: "6.2", crit: "Coleta Completa de Dados para Reserva", item: "CPF de todos os adultos", peso: 2 },
           { cod: "6.3", crit: "Coleta Completa de Dados para Reserva", item: "Data de nascimento dos hóspedes", peso: 2 },
           { cod: "6.4", crit: "Coleta Completa de Dados para Reserva", item: "Endereço completo com CEP", peso: 2 },
           { cod: "6.5", crit: "Coleta Completa de Dados para Reserva", item: "Telefone de contato e e-mail", peso: 2 },
           { cod: "6.6", crit: "Coleta Completa de Dados para Reserva", item: "Nome do empreendimento e período definido", peso: 2 },
           { cod: "6.7", crit: "Coleta Completa de Dados para Reserva", item: "Quantidade de adultos e crianças", peso: 2 },
           { cod: "7.1", crit: "Procedimentos Operacionais / Registro em Sistema", item: "Lançou a reserva corretamente na planilha de reservas de acompanhamento", peso: 2.6 },
           { cod: "7.2", crit: "Procedimentos Operacionais / Registro em Sistema", item: "Lançou todos os dados no sistema TSE sem erros", peso: 2.6 },
           { cod: "7.3", crit: "Procedimentos Operacionais / Registro em Sistema", item: "Garantiu que o cliente recebeu o voucher com os dados da reserva", peso: 2.6 },
           { cod: "7.4", crit: "Procedimentos Operacionais / Registro em Sistema", item: "Atualizou status do lead como vendido/reserva confirmada no CRM", peso: 2.6 },
           { cod: "7.5", crit: "Procedimentos Operacionais / Registro em Sistema", item: "Conferiu todos os dados antes de encerrar o atendimento", peso: 2.6 },
           { cod: "8.1", crit: "Finalização", item: "Reforçou os benefícios e a importância da apresentação", peso: 1.75 },
           { cod: "8.2", crit: "Finalização", item: "Demonstrou empolgação com a chegada do cliente", peso: 1.75 },
           { cod: "8.3", crit: "Finalização", item: "Finalizou com o speech padrão de encerramento Lagoa", peso: 1.75 },
           { cod: "8.4", crit: "Finalização", item: "Agradeceu o tempo e reforçou suporte em caso de dúvidas", peso: 1.75 },
           { cod: "9.1", crit: "Qualidade Global", item: "Linguagem clara, consultiva e envolvendo", peso: 1.75 },
           { cod: "9.2", crit: "Qualidade Global", item: "Atendimento seguro, sem hesitações ou ruídos", peso: 1.75 },
           { cod: "9.3", crit: "Qualidade Global", item: "Postura profissional e confiante", peso: 1.75 },
           { cod: "9.4", crit: "Qualidade Global", item: "Domínio total do processo e sistema", peso: 1.75 }
         ];

         const fixedItems = tipo === 'SDR' ? itemsSDR : itemsCloser;
         const normalizedCriterios = fixedItems.map(fixed => {
           const found = (jsonResult.criterios || []).find((c: any) => 
             (c.codigo === fixed.cod) || 
             (c.item_avaliado?.toLowerCase().includes(fixed.item.toLowerCase().substring(0, 20)))
           );

           if (found) {
             return {
               ...found,
               codigo: fixed.cod,
               criterio: fixed.crit,
               item_avaliado: fixed.item,
               peso: fixed.peso
             };
           } else {
             return {
               codigo: fixed.cod,
               criterio: fixed.crit,
               item_avaliado: fixed.item,
               peso: fixed.peso,
               status_ia: "NÃO",
               pontuacao_ia: 0,
               comentario_ia: "Item obrigatório não identificado na resposta da IA.",
               status_final: "NÃO",
               pontuacao_final: 0,
               fonte_evidencia: "N/A",
               orientacao_correcao: "Item obrigatório não realizado.",
               observacao_admin: ""
             };
           }
         });

         // Recalcular nota final baseada nos critérios normalizados
         const newNota = normalizedCriterios.reduce((acc, curr) => acc + (curr.pontuacao_ia || 0), 0);
         
         return res.status(200).json({
           ...jsonResult,
           nota_ia: newNota,
           nota_final: newNota,
           criterios: normalizedCriterios
         });
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
