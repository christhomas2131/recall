import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import {
  corrections,
  exportStats,
  MARK_CLOSE,
  MARK_LEGEND,
  MARK_OPEN,
  verificationFooter,
} from './exportDoc';
import type { Project, Question, Segment } from '@/types';

function runsFor(segments: Segment[]): TextRun[] {
  return segments.map((s) => {
    if (s.kind === 'token' && s.state === 'unverified') {
      return new TextRun({
        text: `${MARK_OPEN}${s.text}${MARK_CLOSE}`,
        italics: true,
        highlight: 'yellow',
      });
    }
    return new TextRun({ text: s.text });
  });
}

function roleLabel(project: Project, question: Question): string {
  const role = project.resume.roles.find((r) => r.id === question.sourceRoleId);
  const base = role ? `${role.title}, ${role.employer}` : 'No source role';
  return question.competency ? `${base} · ${question.competency}` : base;
}

export function buildDocx(project: Project): Document {
  const stats = exportStats(project);
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
  );

  if (project.mode === 'fast' && stats.unverified.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        text: `${stats.unverified.length} details in this document are AI-generated and unverified`,
      }),
    );
    for (const token of stats.unverified) {
      children.push(new Paragraph({ text: token.text, bullet: { level: 0 } }));
    }
  }

  if (stats.unverified.length) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: MARK_LEGEND, italics: true, size: 18 })] }),
    );
  }

  for (const question of project.questions) {
    if (question.generatedAt === null) continue;

    children.push(new Paragraph({ text: question.text, heading: HeadingLevel.HEADING_1 }));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: roleLabel(project, question), italics: true, size: 18 })],
      }),
    );
    children.push(new Paragraph({ children: runsFor(question.shortAnswer) }));

    if (question.coachingNote.trim()) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Coaching note. ', bold: true }),
            new TextRun({ text: question.coachingNote }),
          ],
        }),
      );
    }

    if (question.longAnswer.length) {
      children.push(
        new Paragraph({ text: 'The material underneath', heading: HeadingLevel.HEADING_2 }),
      );
      children.push(new Paragraph({ children: runsFor(question.longAnswer) }));
    }
  }

  const edits = corrections(project);
  if (edits.length) {
    children.push(new Paragraph({ text: 'Corrections', heading: HeadingLevel.HEADING_1 }));
    for (const c of edits) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: c.current, bold: true }),
            new TextRun({ text: ` — Recall first wrote “${c.original}”` }),
          ],
        }),
      );
      if (c.note) {
        children.push(new Paragraph({ text: c.note, bullet: { level: 1 } }));
      }
      children.push(new Paragraph({ text: c.questionText, bullet: { level: 1 } }));
    }
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: verificationFooter(project), italics: true, size: 18 })],
    }),
  );

  return new Document({ sections: [{ children }] });
}

export async function docxBlob(project: Project): Promise<Blob> {
  return Packer.toBlob(buildDocx(project));
}
