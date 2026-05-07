import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase configuration missing (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/PUBLISHABLE_KEY). Using fallback for development if provided, otherwise the app may fail to connect to database.');
}

// Keep a fallback ONLY if absolutely necessary for the first run, 
// but preferably the user should provide these in the UI/Config.
export const supabase = createClient(
  supabaseUrl || 'https://tllmlphtkgpyhcnoxbza.supabase.co', 
  supabaseKey || 'sb_publishable_jipAlK65vH2te-TelafsRA_it-YIvG2'
);

export async function checkSupabaseConnection() {
  try {
    const { error: tableError } = await supabase.from('monitorias').select('id').limit(1);
    
    if (tableError) {
      if (tableError.code === '42P01' || tableError.message.includes('not found')) {
        return { ok: false, message: 'Tabela monitorias não encontrada. Execute o SQL de criação no Supabase.' };
      }
      if (tableError.code === '42501' || tableError.message.includes('permission denied') || tableError.message.includes('policy')) {
        return { ok: false, message: 'Sem permissão para acessar o Supabase. Verifique RLS e policies.' };
      }
      return { ok: false, message: `Erro ao acessar monitorias: ${tableError.message}` };
    }

    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      if (bucketError.message.includes('permission denied') || bucketError.message.includes('policy')) {
         return { ok: false, message: 'Sem permissão para acessar os buckets. Verifique RLS e policies.' };
      }
      return { ok: false, message: `Erro ao listar buckets: ${bucketError.message}` };
    }

    const hasArchives = buckets?.some(b => b.id === 'monitoria-arquivos') ?? false;
    const hasPdfs = buckets?.some(b => b.id === 'monitoria-pdfs') ?? false;

    if (!hasArchives || !hasPdfs) {
      return { 
        ok: true, 
        bucketsOk: false,
        message: 'Buckets de armazenamento não encontrados. O upload de arquivos será desabilitado, mas a análise continuará.' 
      };
    }

    return { ok: true, bucketsOk: true, message: 'Conexão estabelecida com sucesso.' };
  } catch (err: any) {
    return { ok: false, message: `Falha na conexão: ${err.message}` };
  }
}
