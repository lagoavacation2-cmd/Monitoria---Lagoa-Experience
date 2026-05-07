import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  return res.status(200).json({
    status: 'ok',
    environment: {
      OPENROUTER_API_KEY_CONFIGURED: !!apiKey,
      OPENROUTER_MODEL: model || 'openrouter/free (default)',
      SUPABASE_URL_CONFIGURED: !!supabaseUrl,
      SUPABASE_ANON_KEY_CONFIGURED: !!supabaseKey,
    }
  });
}
