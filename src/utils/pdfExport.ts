import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '../lib/supabase';

// Define core colors
const COLORS = {
  PRIMARY: [11, 31, 58], // #0B1F3A
  SECONDARY: [77, 168, 255], // #4DA8FF
  WHITE: [255, 255, 255],
  BG_LIGHT: [245, 248, 252], // #F5F8FC
  TEXT_DARK: [11, 31, 58],
  TEXT_GRAY: [100, 100, 100],
  SUCCESS: [16, 185, 129],
  WARNING: [245, 158, 11],
  DANGER: [239, 68, 68]
};

export const generateAuditPDF = async (monitoria: any, criterios: any[], arquivos: any[] = []) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  let currentY = 0;

  // Helper functions
  const addHeader = (pageNum: number) => {
    doc.setFillColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('LAGOA EXPERIENCE', margin, 25);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório de Monitoria de Atendimento — Mini-Vac', margin, 33);
    
    doc.setFontSize(8);
    doc.text(`Página ${pageNum}`, pageWidth - margin - 15, 25);
  };

  const addSectionTitle = (title: string, y: number) => {
    doc.setFillColor(COLORS.BG_LIGHT[0], COLORS.BG_LIGHT[1], COLORS.BG_LIGHT[2]);
    doc.rect(margin, y, contentWidth, 10, 'F');
    doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 5, y + 7);
    return y + 15;
  };

  const checkPageOverflow = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 20) {
      doc.addPage();
      currentY = 50;
      addHeader(doc.internal.getNumberOfPages());
      return true;
    }
    return false;
  };

  // --- START PDF ---
  addHeader(1);
  currentY = 55;

  // 1. Dados Principais
  doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE AVALIAÇÃO', margin, currentY);
  currentY += 8;

  const mainInfo = [
    ['Colaborador:', monitoria.colaborador || 'N/A', 'Avaliador:', monitoria.avaliador || 'N/A'],
    ['Tipo:', monitoria.tipo_atendimento || 'N/A', 'Data Avaliação:', monitoria.created_at ? new Date(monitoria.created_at).toLocaleDateString() : 'N/A'],
    ['Mês Ref:', monitoria.mes_referencia || 'N/A', 'Monitoria No:', `${monitoria.numero_monitoria_mes || 1}ª Monitoria`],
    ['Canal:', monitoria.canal || 'Geral (Audio/Texto)', 'Status:', monitoria.revisada_manualmente ? 'AUDITADO' : 'IA ORIGINAL']
  ];

  doc.autoTable({
    startY: currentY,
    body: mainInfo,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2, textColor: COLORS.TEXT_DARK },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 30 },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 30 },
      3: { cellWidth: 60 }
    }
  });

  currentY = doc.lastAutoTable.finalY + 15;

  // 2. Painel de Notas (Resultado Geral)
  currentY = addSectionTitle('Resultado Geral', currentY);
  
  const scoreData = [
    ['Nota IA Original:', `${monitoria.nota_ia}%`, 'Nota Final Validada:', `${monitoria.nota_final}%`],
    ['Classificação:', monitoria.classificacao_ia || 'N/A', 'Conformidade:', `${monitoria.nota_final}%`]
  ];

  doc.autoTable({
    startY: currentY,
    body: scoreData,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 5, halign: 'center' },
    headStyles: { fillColor: COLORS.PRIMARY, textColor: 255 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [240, 240, 240] },
      2: { fontStyle: 'bold', fillColor: [240, 240, 240] }
    }
  });

  currentY = doc.lastAutoTable.finalY + 5;
  
  const statusCounts = [
    ['ITENS SIM', 'ITENS PARCIAL', 'ITENS NÃO'],
    [
      criterios.filter(c => (c.status_final || c.status_ia) === 'SIM').length,
      criterios.filter(c => (c.status_final || c.status_ia) === 'PARCIAL').length,
      criterios.filter(c => (c.status_final || c.status_ia) === 'NÃO').length
    ]
  ];

  doc.autoTable({
    startY: currentY,
    head: [statusCounts[0]],
    body: [statusCounts[1]],
    theme: 'grid',
    styles: { fontSize: 10, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: COLORS.PRIMARY },
  });

  currentY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
  const revisionNote = monitoria.revisada_manualmente 
    ? "Monitoria revisada pelo Administrador, com ajustes manuais na pontuação."
    : "Monitoria mantida conforme análise original da IA.";
  doc.text(revisionNote, margin, currentY);

  currentY += 15;

  // 3. Resumo Executivo
  currentY = addSectionTitle('Resumo Executivo da Monitoria', currentY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
  const executiveSummary = monitoria.resumo_geral || 'Nenhuma análise executiva disponível.';
  const splitSummary = doc.splitTextToSize(executiveSummary, contentWidth);
  doc.text(splitSummary, margin, currentY);
  currentY += (splitSummary.length * 5) + 10;

  checkPageOverflow(20);

  // 4. Análise Detalhada
  currentY = addSectionTitle('Análise Detalhada por Critério', currentY);
  
  const tableRows = (criterios || []).map(c => [
    c.codigo || '-',
    c.criterio,
    c.item_avaliado,
    c.peso,
    c.status_final || c.status_ia,
    c.pontuacao_final ?? c.pontuacao_ia,
    c.fonte_evidencia || 'N/A'
  ]);

  doc.autoTable({
    startY: currentY,
    head: [['Cod', 'Critério', 'Item', 'Peso', 'Status', 'Nota', 'Fonte']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: COLORS.PRIMARY, fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 35 },
      2: { cellWidth: 55 },
      3: { cellWidth: 12 },
      4: { cellWidth: 15 },
      5: { cellWidth: 12 },
      6: { cellWidth: 25 }
    },
    didDrawPage: (data: any) => {
      addHeader(doc.internal.getNumberOfPages());
    }
  });

  currentY = doc.lastAutoTable.finalY + 15;

  // 5. Feedback para o Colaborador
  checkPageOverflow(40);
  currentY = addSectionTitle('Feedback para o Colaborador', currentY);
  doc.setFontSize(10);
  const feedback = monitoria.feedback_colaborador || monitoria.resumo_geral || 'Feedback não gerado.';
  const splitFeedback = doc.splitTextToSize(feedback, contentWidth);
  doc.text(splitFeedback, margin, currentY);
  currentY += (splitFeedback.length * 5) + 15;

  // 6. Pontos Fortes e Melhoria
  checkPageOverflow(40);
  currentY = addSectionTitle('Pontos Fortes Identificados', currentY);
  const strongPoints = monitoria.pontos_fortes || 'Nenhum ponto forte destacado.';
  const splitStrong = doc.splitTextToSize(strongPoints, contentWidth);
  doc.text(splitStrong, margin, currentY);
  currentY += (splitStrong.length * 5) + 15;

  checkPageOverflow(40);
  currentY = addSectionTitle('Pontos de Melhoria', currentY);
  const improvePoints = monitoria.pontos_melhoria || 'Nenhum ponto de melhoria destacado.';
  const splitImprove = doc.splitTextToSize(improvePoints, contentWidth);
  doc.text(splitImprove, margin, currentY);
  currentY += (splitImprove.length * 5) + 15;

  // 7. Plano de Ação & Orientação Treinamento
  checkPageOverflow(40);
  currentY = addSectionTitle('Plano de Ação', currentY);
  const actionPlan = monitoria.plano_acao || 'Nenhum plano de ação definido.';
  const splitAction = doc.splitTextToSize(actionPlan, contentWidth);
  doc.text(splitAction, margin, currentY);
  currentY += (splitAction.length * 5) + 15;

  checkPageOverflow(40);
  currentY = addSectionTitle('Orientação de Treinamento', currentY);
  const training = monitoria.orientacao_treinamento || 'Treinamento padrão Lagoa Experience.';
  const splitTraining = doc.splitTextToSize(training, contentWidth);
  doc.text(splitTraining, margin, currentY);
  currentY += (splitTraining.length * 5) + 15;

  // 8. Evidências
  checkPageOverflow(40);
  currentY = addSectionTitle('Evidências e Arquivos Analisados', currentY);
  const evidenceText = `Arquivos analisados: ${arquivos.length}\nResumo: ${monitoria.resumo_analise_cruzada || 'Análise cruzada de multicanais.'}`;
  const splitEvidence = doc.splitTextToSize(evidenceText, contentWidth);
  doc.text(splitEvidence, margin, currentY);
  currentY += (splitEvidence.length * 5) + 10;
  
  if (arquivos.length > 0) {
    arquivos.forEach(file => {
      doc.setFontSize(8);
      doc.text(`- ${file.nome_arquivo}`, margin + 5, currentY);
      currentY += 5;
    });
  }
  currentY += 15;

  // 9. Assinaturas
  checkPageOverflow(50);
  currentY += 10;
  doc.setDrawColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
  doc.setLineWidth(0.5);
  
  doc.line(margin, currentY, margin + 70, currentY);
  doc.line(pageWidth - margin - 70, currentY, pageWidth - margin, currentY);
  
  currentY += 5;
  doc.setFontSize(9);
  doc.text('Assinatura do Avaliador', margin + 15, currentY);
  doc.text('Assinatura do Colaborador', pageWidth - margin - 55, currentY);
  
  currentY += 15;
  doc.text(`Data do feedback: ____/____/______`, margin, currentY);

  return doc;
};

export const getMonitoriaFileName = (monitoria: any) => {
  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const nomeLimpo = (monitoria.colaborador || 'SemNome').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
  return `Monitoria_LagoaExperience_${monitoria.tipo_atendimento || 'Geral'}_${nomeLimpo}_${dateStr}.pdf`;
};

export const savePDFToStorage = async (doc: any, monitoria: any) => {
  const fileName = getMonitoriaFileName(monitoria);
  const pdfBlob = doc.output('blob');
  const storagePath = `${monitoria.id}/${fileName}`;
  
  try {
    const { error: uploadError } = await supabase.storage
      .from('monitoria-pdfs')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage
      .from('monitoria-pdfs')
      .getPublicUrl(storagePath);

    await supabase.from('monitorias').update({
      pdf_nome: fileName,
      pdf_url: publicUrl.publicUrl
    }).eq('id', monitoria.id);

    return { success: true, fileName, url: publicUrl.publicUrl };
  } catch (err) {
    console.error('Error saving PDF to storage:', err);
    return { success: false, error: err };
  }
};

