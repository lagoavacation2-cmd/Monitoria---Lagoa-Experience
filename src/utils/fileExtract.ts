import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdfjs worker setup localmente
console.log('Configurando PDF worker localmente');
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  try {
    if (extension === 'txt' || extension === 'csv') {
      return await file.text();
    }

    if (extension === 'docx') {
      console.log('Iniciando extração de DOCX:', file.name);
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }

    if (extension === 'pdf') {
      console.log('Iniciando leitura do PDF:', file.name);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          disableFontFace: false
        });
        
        const pdf = await loadingTask.promise;
        console.log(`PDF carregado: ${pdf.numPages} páginas`);
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n';
        }
        
        console.log('Texto do PDF extraído com sucesso');
        return fullText;
      } catch (pdfError) {
        console.error('Erro ao extrair PDF:', pdfError);
        return `[Não foi possível extrair o texto do PDF automaticamente: ${file.name}. Tente anexar a conversa em TXT, DOCX ou uma transcrição.]`;
      }
    }

    return `[Arquivo não processável automaticamente: ${file.name}]`;
  } catch (error) {
    console.error(`Erro ao processar arquivo ${file.name}:`, error);
    return `[Erro ao processar ${file.name}]`;
  }
}
