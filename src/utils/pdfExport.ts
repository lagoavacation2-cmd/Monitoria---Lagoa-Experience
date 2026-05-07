import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const generateAuditPDF = (monitoria: any, criterios: any[]) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;

  // Header
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('LAGOA EXPERIENCE', 20, 25);
  doc.setFontSize(10);
  doc.text('Relatório de Monitoria de Atendimento', 20, 32);

  // Summary Box
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('Dados do Atendimento', 20, 50);
  
  const summaryData = [
    ['Colaborador:', monitoria.colaborador, 'Avaliador:', monitoria.avaliador],
    ['Tipo:', monitoria.tipo_atendimento, 'Data:', new Date(monitoria.created_at).toLocaleDateString()],
    ['Mês Ref:', monitoria.mes_referencia, 'Nota Final:', `${monitoria.nota_final}%`],
    ['Classificação:', monitoria.classificacao_ia || 'Não Classificado', 'Status:', monitoria.revisada_manualmente ? 'AUDITADO' : 'IA ORIGINAL']
  ];

  doc.autoTable({
    startY: 55,
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 
      0: { fontStyle: 'bold', width: 30 },
      2: { fontStyle: 'bold', width: 30 }
    }
  });

  // Criteria Table
  doc.setFontSize(14);
  doc.text('Critérios detalhados', 20, doc.lastAutoTable.finalY + 15);

  const tableRows = (criterios || []).map(c => [
    c.criterio,
    c.item_avaliado,
    c.status_final || c.status_ia,
    c.pontuacao_final || c.pontuacao_ia,
    c.comentario_final || c.comentario_ia || ''
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Critério', 'Item Avaliado', 'Status', 'Nota', 'Comentário']],
    body: tableRows,
    headStyles: { fillColor: [16, 43, 82], textColor: 255 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { width: 35 },
      1: { width: 50 },
      2: { width: 20 },
      3: { width: 15 },
      4: { width: 60 }
    }
  });

  // Feedbacks
  let currentY = doc.lastAutoTable.finalY + 15;
  
  const addBlock = (title: string, text: string) => {
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, currentY);
    currentY += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(text || 'Nenhum registro.', pageWidth - 40);
    doc.text(splitText, 20, currentY);
    currentY += (splitText.length * 5) + 10;
  };

  addBlock('Resumo Geral:', monitoria.resumo_geral);
  addBlock('Pontos Fortes:', monitoria.pontos_fortes);
  addBlock('Pontos de Melhoria:', monitoria.pontos_melhoria);
  addBlock('Plano de Ação:', monitoria.plano_acao);

  // Revision status footer
  if (currentY > 260) {
    doc.addPage();
    currentY = 20;
  }
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  const revisionText = monitoria.revisada_manualmente 
    ? `Monitoria revisada pelo Administrador (${monitoria.revisada_por}), com ajustes manuais na pontuação.`
    : "Monitoria mantida conforme análise original da IA.";
  doc.text(revisionText, 20, currentY);
  currentY += 15;

  // Signatures
  if (currentY > 240) {
    doc.addPage();
    currentY = 40;
  } else {
    currentY = 260;
  }
  
  doc.line(20, currentY, 90, currentY);
  doc.text('Assinatura Avaliador', 35, currentY + 5);
  
  doc.line(120, currentY, 190, currentY);
  doc.text('Assinatura Colaborador', 135, currentY + 5);

  return doc;
};
