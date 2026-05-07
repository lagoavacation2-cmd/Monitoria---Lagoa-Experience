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

    // LIMPEZA E LIMITAÇÃO DE TEXTO
    const compactarTextoAtendimento = (text: string) => {
      if (!text) return "";
      let cleaned = text
        .replace(/\n+/g, '\n') // Remove múltiplas quebras de linha
        .replace(/\s{2,}/g, ' ') // Remove múltiplos espaços
        .replace(/(Mensagem automática:|Seu atendimento foi iniciado:|Início do atendimento:|Atendimento de:)/gi, '')
        .trim();
      
      const MAX_CHARS_COMPACT = 15000;
      if (cleaned.length > MAX_CHARS_COMPACT) {
        // Mantém os primeiros 7.5k e os últimos 7.5k para não perder o início e o fim (checklist/finalização)
        const half = MAX_CHARS_COMPACT / 2;
        cleaned = cleaned.slice(0, half) + "\n\n[...] [TEXTO COMPACTADO PELA IA PARA OTIMIZAR VELOCIDADE] \n\n" + cleaned.slice(-half);
      }
      return cleaned;
    };

    let totalChars = 0;
    const contextFiles = arquivos.map((f: any) => {
      const conteudoLimpo = compactarTextoAtendimento(f.conteudo || "");
      return `Arquivo: ${f.name}\nConteúdo: ${conteudoLimpo}`;
    }).filter(Boolean).join('\n\n---\n\n');

    const promptSDR = `
Avalie atendimento SDR. Critérios (40 itens):
1.1 Saudação voz (2.5), 1.2 ID Empresa/Cargo (2.5), 1.3 Nome Cliente (2.5), 1.4 Tempo (2.5)
2.1 Cadastro (2.5), 2.2 Lagoa Vacation (2.5), 2.3 Desconto 50% (2.5), 2.4 Emoção (2.5), 2.5 Conhece Caldas (2.5), 2.6 Experiência Ant. (2.5)
3.1 90 min (3), 3.2 Obrigatória (3), 3.3 Casal/Sem Compro. (3), 3.4 Dúvidas (3)
4.1 Nomes (2.5), 4.2 Cidade (2.5), 4.3 Profissão (2.5), 4.4 Casa (2.5), 4.5 Civil/Tempo (2.5), 4.6 Carro (2.5), 4.7 Filhos (2.5), 4.8 Lazer (2.5), 4.9 Perfil (2.5), 4.10 Exceção (2.5)
5.1 Fluidez (2.5), 5.2 Energia (2.5), 5.3 Gatilhos (2.5), 5.4 Objeções (2.5), 5.5 Linguagem (2.5), 5.6 Reserva (2.5)
6.1 Closer (2.6), 6.2 Voucher/Regras (2.6), 6.3 Dados Contato (2.6), 6.4 CRM (2.6), 6.5 Funil (2.6)
7.1 Cordial (2), 7.2 Empatia (2), 7.3 Sem Vícios (2), 7.4 Domínio (2), 7.5 Ritmo (2)
`;

    const promptCloser = `
Avalie atendimento Closer. Critérios (40 itens):
1.1 Saudação (2), 1.2 Supervisor SDR (2), 1.3 Retomou Info (2), 1.4 Segurança (2)
2.1 Conceito (2.5), 2.2 Desconto 50% (2.5), 2.3 Diferenciais (2.5), 2.4 Emoção (2.5)
3.1 Balcão (3.5), 3.2 Promo (3.5), 3.3 Incluso (3.5), 3.4 Vantagem (3.5)
4.1 Urgência (3), 4.2 Escassez (3), 4.3 Objeções (3), 4.4 Desc. Adic (3), 4.5 Fechamento (3)
5.1 Forms Ciência (4), 5.2 Reforço Verbal (4), 5.3 Assinatura (4)
6.1 Nomes (2), 6.2 CPF (2), 6.3 Nascimento (2), 6.4 Endereço (2), 6.5 Email (2), 6.6 Período (2), 6.7 Qtd Pax (2)
7.1 Planilha (2.6), 7.2 TSE (2.6), 7.3 Voucher (2.6), 7.4 CRM status (2.6), 7.5 Conferência (2.6)
8.1 Benefícios (1.75), 8.2 Empolgação (1.75), 8.3 Speech Lagoa (1.75), 8.4 Suporte (1.75)
9.1 Consultivo (1.75), 9.2 Sem ruídos (1.75), 9.3 Postura (1.75), 9.4 Sistema (1.75)
`;

    const mainPrompt = `
Atendimento [${tipo}]. 
Texto: ${contextFiles}

${tipo === 'SDR' ? promptSDR : promptCloser}

Responda APENAS JSON:
{
  "criterios": [{ "codigo": "1.1", "status_ia": "SIM/PARCIAL/NÃO", "comentario_ia": "", "fonte_evidencia": "" }],
  "resumo_geral": "", "pontos_fortes": "", "pontos_melhoria": ""
}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
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
    clearTimeout(timeoutId);

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
      let jsonResult = data;
      
      if (data.choices?.[0]?.message?.content) {
         let innerText = data.choices[0].message.content;
         const innerMatch = innerText.match(/\{[\s\S]*\}/);
         if (innerMatch) innerText = innerMatch[0];
         jsonResult = JSON.parse(innerText);
      }

      // 1. FUNÇÕES DE APOIO
      function calcularPontuacao(status: string, peso: number) {
        const s = String(status || '').toUpperCase();
        if (s === 'SIM') return peso;
        if (s === 'PARCIAL') return peso / 2;
        return 0;
      }

      function classificarNota(nota: number) {
        const n = Number(nota || 0);
        if (n >= 90) return 'Excelente atendimento';
        if (n >= 80) return 'Bom atendimento';
        if (n >= 70) return 'Atendimento regular';
        if (n >= 60) return 'Abaixo do esperado';
        return 'Atendimento crítico';
      }

      // 2. LISTAS FIXAS OBRIGATÓRIAS
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
        { cod: "1.2", crit: "Reabertura Estratégica", item: "Reapresentação como Supervisor(a) do SDR e consultor(a) do Conceito de Experiência", peso: 2 },
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
        { cod: "4.5", crit: "Técnicas de Fechamento", item: "Conduziu para a confirmação with naturalidade", peso: 3 },
        { cod: "5.1", crit: "Envio do Check-list de Ciência", item: "Enviou o Forms de ciência com todos os pontos obrigatórios", peso: 4 },
        { cod: "5.2", crit: "Envio do Check-list de Ciência", item: "Reforçou verbalmente os principais pontos do check-list", peso: 4 },
        { cod: "5.3", crit: "Envio do Check-list de Ciência", item: "Verificou o recebimento e assinatura do Forms pelo cliente", peso: 4 },
        { cod: "6.1", crit: "Coleta Completa de Dados para Reserva", item: "Nome completo dos hóspedes, incluindo a família toda", peso: 2 },
        { cod: "6.2", crit: "Coleta Completa de Dados para Reserva", item: "CPF de todos os adultos", peso: 2 },
        { cod: "6.3", crit: "Coleta Completa de Dados para Reserva", item: "Data de nascimento dos hóspedes", peso: 2 },
        { cod: "6.4", crit: "Coleta Completa de Dados para Reserva", item: "Endereço completo com CEP", peso: 2 },
        { cod: "6.5", crit: "Coleta Completa de Dados para Reserva", item: "Telefone de contato e e-mail", peso: 2 },
        { cod: "6.6", crit: "Coleta Completa de Dados para Reserva", item: "Nome do empreendimento e período definido", peso: 2 },
        { cod: "6.7", crit: "Coleta Completa de Dados para Reserva", item: "Quantitade de adultos e crianças", peso: 2 },
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
      
      // 3. NORMALIZAÇÃO E RECALCULO
      const normalizedCriterios = fixedItems.map(fixed => {
        const found = (jsonResult.criterios || []).find((c: any) => 
          (String(c.codigo) === String(fixed.cod))
        );

        const status = found?.status_ia || "NÃO";
        const score = calcularPontuacao(status, fixed.peso);

        return {
          codigo: fixed.cod,
          criterio: fixed.crit,
          item_avaliado: fixed.item,
          peso: fixed.peso,
          status_ia: status,
          pontuacao_ia: score,
          comentario_ia: found?.comentario_ia || "Item obrigatório não identificado na resposta da IA.",
          status_final: status,
          pontuacao_final: score,
          fonte_evidencia: found?.fonte_evidencia || "Não identificado",
          orientacao_correcao: found?.orientacao_correcao || "Reforçar este ponto no próximo atendimento.",
          observacao_admin: "",
          perda_pontos: fixed.peso - score,
          ajustado_manualmente: false
        };
      });

      const notaIA = normalizedCriterios.reduce((acc, curr) => acc + curr.pontuacao_ia, 0);
      const classificacao = classificarNota(notaIA);

      return res.status(200).json({
        ...jsonResult,
        nota_ia: Math.round(notaIA * 10) / 10,
        nota_final: Math.round(notaIA * 10) / 10,
        classificacao: classificacao,
        criterios: normalizedCriterios
      });
    } catch (e: any) {
      return res.status(500).json({ error: "A IA retornou resposta inválida. Tente gerar novamente. Erro: " + e.message });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Erro interno no servidor' });
  }
}
