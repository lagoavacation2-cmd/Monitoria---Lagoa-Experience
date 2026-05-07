import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const getOpenRouterApiKey = () => {
    const key = process.env.OPENROUTER_API_KEY;
    const trimmedKey = key?.trim();
    
    if (trimmedKey) {
      console.log("OPENROUTER_API_KEY encontrada:", true);
      console.log("Tamanho da chave encontrada:", trimmedKey.length);
      console.log("Prefixo da chave (6 primeiros):", trimmedKey.substring(0, 6));
    } else {
      console.log("Nenhuma chave OpenRouter encontrada no ambiente.");
    }
    
    return trimmedKey;
  };

  const getOpenRouterModel = () => {
    return process.env.OPENROUTER_MODEL || "openrouter/free";
  };

  // Debug OpenRouter configuration
  app.get('/api/debug-openrouter', (req, res) => {
    const keyToUse = getOpenRouterApiKey();

    res.json({
      status: "info",
      env: {
        OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
        OPENROUTER_MODEL: !!process.env.OPENROUTER_MODEL,
      },
      resolved: {
        found: !!keyToUse,
        length: keyToUse?.length || 0,
        prefix: keyToUse ? keyToUse.substring(0, 6) : null,
        model: getOpenRouterModel()
      }
    });
  });

  // Test OpenRouter API
  app.get('/api/test-openrouter', async (req, res) => {
    try {
      const apiKey = getOpenRouterApiKey();
      const model = getOpenRouterModel();

      if (!apiKey) {
        return res.status(500).json({ status: "erro", message: "OPENROUTER_API_KEY não configurada no ambiente (Secrets)." });
      }

      if (model.startsWith("sk-or-")) {
        return res.status(400).json({
          status: "erro",
          message: "OPENROUTER_MODEL está incorreto. Você colocou a API Key no campo de modelo. Use um modelo como openrouter/free."
        });
      }

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
              role: "user",
              content: "Responda apenas: API funcionando"
            }
          ]
        })
      });

      const data: any = await response.json();

      if (!response.ok) {
        console.error("Erro na API OpenRouter:", data.error?.message);
        return res.status(response.status).json({
          status: "erro",
          message: "Erro ao validar OPENROUTER_API_KEY",
          details: data.error?.message || "Erro desconhecido na API"
        });
      }

      res.json({
        status: "ok",
        message: data.choices?.[0]?.message?.content || "API funcionando"
      });
    } catch (error: any) {
      console.error("Erro no teste OpenRouter:", error);
      res.status(500).json({
        status: "erro",
        message: "Erro interno ao validar chave",
        details: error.message
      });
    }
  });

  // API Route for analysis using OpenRouter
  app.post('/api/analisar-monitoria', async (req, res) => {
    try {
      const { tipo, arquivos, colaborador, avaliador, observacoes } = req.body;
      const apiKey = getOpenRouterApiKey();
      const model = getOpenRouterModel();

      if (!apiKey) {
        return res.status(500).json({ error: "OPENROUTER_API_KEY não configurada." });
      }

      if (model.startsWith("sk-or-")) {
        return res.status(400).json({
          error: "OPENROUTER_MODEL está incorreto. Você colocou a API Key no campo de modelo. Use um modelo como openrouter/free."
        });
      }

      console.log("Iniciando análise para:", colaborador, "usando modelo:", model);

      // Build context from files
      const contextFiles = arquivos.map((f: any) => `Arquivo: ${f.nome}\nConteúdo/Transcrição: ${f.conteudo}`).join('\n\n---\n\n');

      const promptSDR = `
Você é uma IA de Monitoria da LAGOA EXPERIENCE. Analise os atendimentos de um SDR.
CRITÉRIOS E PESOS (Total 100):
1. Comunicacao e Apresentacao Inicial (Peso 10): 
   - Saudacao com sorriso perceptivel na voz (2.5)
   - Identificacao com nome, cargo e Grupo Lagoa Quente (2.5)
   - Validacao do nome do cliente e personalizacao imediata (2.5)
   - Verificacao respeitosa de tempo disponivel para conversa (2.5)
2. Apresentacao do Conceito de Experiencia (Peso 15): 
   - Conectou o contato ao cadastro feito pelo cliente (2.5)
   - Explicou o Grupo Lagoa Quente e o programa Lagoa Vacation (2.5)
   - Mencionou que o cliente foi selecionado para experiencia com ate 50% de desconto (2.5)
   - Criou vinculo emocional: lazer, descanso, familia e bem-estar (2.5)
   - Perguntou se o cliente ja conhece Caldas Novas ou o Grupo Lagoa (2.5)
   - Se ja hospedado, explorou experiencia anterior e gerou conexao emocional (2.5)
3. Explicacao da Apresentacao Obrigatoria (Peso 12): 
   - Informou claramente sobre os 90 minutos de apresentacao (3)
   - Reforcou que a apresentacao ocorre durante a hospedagem e e obrigatoria (3)
   - Explicou que e exclusiva para o casal, sem compromisso de compra (3)
   - Verificou se ha duvidas e respondeu com seguranca (3)
4. Qualificacao Consultiva e Completa (Peso 25): 
   - Coletou nome completo do cliente e do conjuge (2.5)
   - Coletou cidade e estado onde moram (2.5)
   - Verificou profissao do casal (2.5)
   - Verificou se a casa e propria ou nao (2.5)
   - Verificou estado civil e tempo de relacionamento (2.5)
   - Verificou modelo e ano do carro da familia (2.5)
   - Verificou se tem filhos, quantidade e idade aproximada (2.5)
   - Identificou estilo de vida, frequencia de viagens e lazer em familia (2.5)
   - Checou se o perfil se enquadra na politica vigente (2.5)
   - Quando necessario, solicitou autorizacao de excecao com responsabilidade (2.5)
5. Tecnica Comercial (Peso 15): 
   - Seguiu o script com naturalidade, sem parecer robotico (2.5)
   - Transmitiu energia e profissionalismo (2.5)
   - Aplicou gatilhos mentais: escassez, urgencia e exclusividade (2.5)
   - Identificou e lidou bem com objecoes iniciais (2.5)
   - Adaptou a linguagem conforme o perfil do cliente (2.5)
   - Confirmou o interesse do cliente em seguir para reserva (2.5)
6. Encaminhamento do Lead - 13 pontos: 
   - Encaminhou o lead corretamente para o Closer (2.6)
   - Informou o que o cliente vai receber: valores, regulamento, voucher etc. (2.6)
   - Confirmou e registrou os dados corretos de contato (2.6)
   - Fez o registro completo e correto no CRM ou planilha (2.6)
   - Atualizou a etapa correta do funil (2.6)
7. Qualidade Global - 10 pontos: 
   - Linguagem clara, cordial e consultiva (2)
   - Postura empatica e sem pressa (2)
   - Comunicacao fluida, sem vicios de linguagem (2)
   - Dominio total do processo e informacoes (2)
   - Conducao com seguranca, simpatia e ritmo adequado (2)

REGRAS OBRIGATÓRIAS SDR:
- O SDR deve conectar cadastro, apresentar conceito, explicar 90 minutos, obrigatoriedade durante hospedagem, exclusividade para casal, ausência de compromisso de compra, qualificar perfil completo e encaminhar corretamente ao Closer.

PONTUAÇÃO: SIM (100%), PARCIAL (50%), NÃO (0%).
      `;

      const promptCloser = `
Você é uma IA de Monitoria da LAGOA EXPERIENCE. Analise os atendimentos de um Closer.
CRITÉRIOS E PESOS (Total 100):
1. Reabertura Estrategica - 8 pontos: 
   - Saudacao cordial e acolhedora (2)
   - Reapresentacao como Supervisor(a) do SDR [NOME DO SDR] e consultor(a) do Conceito de Experiencia (2)
   - Retomou informacoes repassadas pelo SDR (2)
   - Confirmou interesse e conduziu com seguranca (2)
2. Reforco do Conceito - 10 pontos: 
   - Reforcou o conceito do Lagoa Vacation e o convite a experiencia (2.5)
   - Relembrou o beneficio da hospedagem com ate 50% de desconto (2.5)
   - Enfatizou os diferenciais do Grupo Lagoa Quente (2.5)
   - Criou vinculo emocional com o cliente: qualidade de vida, lazer e familia (2.5)
3. Apresentacao da Oferta - 14 pontos: 
   - Informou o valor de balcao (3.5)
   - Comparou com o valor promocional com desconto (3.5)
   - Explicou o que esta incluso: hospedagem, parque, alimentacao etc. (3.5)
   - Tornou o valor percebido como vantajoso (3.5)
4. Tecnicas de Fechamento - 15 pontos: 
   - Criou urgencia: ultimas unidades, fim da campanha etc. (3)
   - Aplicou escassez: condicao exclusiva e limitada (3)
   - Trabalhou objecoes com firmeza e empatia (3)
   - Solicitou autorizacao de desconto adicional quando necessario (3)
   - Conduziu para a confirmacao com naturalidade (3)
5. Envio do Check-list de Ciencia - 12 pontos: 
   - Enviou o Forms de ciencia com pontos obrigatorios: apresentacao, check-in/check-out, cancelamento, taxa, distancia (4)
   - Reforcou verbalmente os principais pontos do check-list (4)
   - Verificou o recebimento e assinatura do Forms pelo cliente (4)
6. Coleta Completa de Dados para Reserva - 14 pontos: 
   - Nome completo dos hospedes, incluindo a familia toda (2)
   - CPF de todos os adultos (2)
   - Data de nascimento dos hospedes (2)
   - Endereco completo com CEP (2)
   - Telefone de contato e e-mail (2)
   - Nome do empreendimento e periodo definido (2)
   - Quantidade de adultos e criancas (2)
7. Procedimentos Operacionais - 13 pontos: 
   - Lancou a reserva corretamente na planilha de reservas de acompanhamento (2.6)
   - Lancou todos os dados no sistema TSE sem erros (2.6)
   - Garantiu que o cliente recebeu o voucher com os dados da reserva (2.6)
   - Atualizou status do lead como vendido/reserva confirmada no CRM (2.6)
   - Conferiu todos os dados antes de encerrar o atendimento (2.6)
8. Finalizacao - 7 pontos: 
   - Reforcou os beneficios e a importancia da apresentacao (1.75)
   - Demonstrou empolgacao com a chegada do cliente (1.75)
   - Finalizou com o speech padrao de encerramento Lagoa (1.75)
   - Agradeceu o tempo e reforcou suporte em caso de duvidas (1.75)
9. Qualidade Global - 7 pontos: 
   - Linguagem clara, consultiva e envolvente (1.75)
   - Atendimento seguro, sem hesitacoes ou ruidos (1.75)
   - Postura profissional e confiante (1.75)
   - Dominio total do processo e sistema (1.75)

REGRAS OBRIGATÓRIAS CLOSER:
- O Closer DEVE se apresentar como Supervisor(a) do SDR [NOME] e consultor(a) do Conceito de Experiência. Se não houver essa apresentação específica, penalize o critério Reabertura Estratégica.

PONTUAÇÃO: SIM (100%), PARCIAL (50%), NÃO (0%).
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
      "criterio": "Nome do Critério",
      "item_avaliado": "Descrição do Item",
      "peso": 0,
      "status_ia": "SIM/PARCIAL/NÃO",
      "pontuacao_ia": 0,
      "comentario_ia": "Motivação da nota",
      "status_final": "SIM/PARCIAL/NÃO",
      "pontuacao_final": 0,
      "fonte_evidencia": "WhatsApp/Ligação/Transcrição/Documento anexo/Não identificado",
      "orientacao_correcao": "O que o colaborador deve fazer para melhorar",
      "observacao_admin": ""
    }
  ]
}

Importante: 
1. nota_final deve ser igual a nota_ia inicialmente.
2. A soma dos pesos deve ser 100.
3. Se status_ia for SIM, pontuacao_ia = peso. Se PARCIAL, pontuacao_ia = peso * 0.5. Se NÃO, pontuacao_ia = 0.
4. A nota_ia é a soma das pontuacoes_ia.
5. Seja rigoroso nos critérios obrigatórios citados.
6. Use linguagem profissional e humanizada em português.
7. Identifique a fonte da evidência para cada item.
8. Trate todos os arquivos de forma consolidada como uma jornada única.
9. Responda APENAS o JSON estruturado.
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

      const data: any = await response.json();

      if (!response.ok) {
        console.error("Erro na OpenRouter:", data.error?.message);
        return res.status(response.status).json({ error: data.error?.message || "Erro na chamada da OpenRouter" });
      }

      let text = data.choices?.[0]?.message?.content || '';
      
      // Better JSON extraction
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }

      try {
        const jsonResult = JSON.parse(text);
        res.json(jsonResult);
      } catch (parseError) {
        console.error("Erro ao processar JSON da IA:", text);
        res.status(500).json({ error: "A IA retornou resposta inválida. Tente gerar novamente." });
      }
    } catch (error: any) {
      console.error('Erro na análise:', error);
      res.status(500).json({ error: error.message || 'Erro interno no servidor' });
    }
  });

  // Chat with IA about analysis using OpenRouter
  app.post('/api/chat-monitoria', async (req, res) => {
    try {
      const { monitoria, historico, mensagem } = req.body;
      const apiKey = getOpenRouterApiKey();
      const model = getOpenRouterModel();

      if (!apiKey) {
        return res.status(500).json({ error: "OPENROUTER_API_KEY não configurada." });
      }

      if (model.startsWith("sk-or-")) {
        return res.status(400).json({
          error: "OPENROUTER_MODEL está incorreto. Você colocou a API Key no campo de modelo. Use um modelo como openrouter/free."
        });
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

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Erro na chamada da OpenRouter");
      }

      res.json({ mensagem: data.choices?.[0]?.message?.content || '' });
    } catch (error: any) {
      console.error('Erro no chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Vite middleware for dev
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
