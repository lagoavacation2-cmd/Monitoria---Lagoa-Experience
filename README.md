# LAGOA EXPERIENCE - Monitoria de Atendimentos

Aplicação completa para monitoria de atendimentos SDR e Closer com análise automática via IA OpenRouter, dashboard administrativo e integração Supabase.

## Funcionalidades
- **Portal IA:** Upload de múltiplos arquivos (WhatsApp, Transcrições, PDF, DOCX) para análise cruzada.
- **Análise Inteligente:** Avaliação baseada em pesos e critérios reais de SDR/Closer.
- **Portal Administrador:** Dashboard completo, histórico, revisão de notas e chat com a IA.
- **Relatório PDF:** Exportação profissional para feedback com o colaborador.
- **Supabase:** Sincronização em tempo real e armazenamento seguro.

## Variáveis de Ambiente Necessárias
Adicione as seguintes variáveis na Vercel:
- `VITE_SUPABASE_URL`: URL do seu projeto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Chave anônima pública do Supabase.
- `VITE_ADMIN_USER`: Usuário para login administrativo (Ex: Administrador).
- `VITE_ADMIN_PASSWORD`: Senha para login administrativo (Ex: Lagoa123@).
- `OPENROUTER_API_KEY`: Sua chave de API do OpenRouter.
- `OPENROUTER_MODEL`: Modelo a ser utilizado (Ex: `openai/gpt-4o-mini`).

## Configuração do Supabase
Execute o conteúdo do arquivo `supabase_schema.sql` no SQL Editor do seu projeto Supabase para criar as tabelas, permissões e buckets necessários.

## Deploy na Vercel
1. Conecte seu repositório GitHub à Vercel.
2. Defina o **Build Command** como `npm run build`.
3. Defina o **Output Directory** como `dist`.
4. Adicione as variáveis de ambiente citadas acima.
5. Deploy!

---
Desenvolvido para Lagoa Experience.
