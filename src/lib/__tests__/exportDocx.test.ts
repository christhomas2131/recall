import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { buildDocx } from '../exportDocx';
import type { Project, Segment } from '@/types';

const token = (
  id: string,
  text: string,
  state: 'unverified' | 'confirmed' | 'edited',
  originalText = text,
): Segment => ({
  kind: 'token',
  id,
  text,
  originalText,
  state,
  category: 'duration',
});

const project: Project = {
  id: 'p1',
  name: 'Vantage Grid — Senior Manager',
  mode: 'standard',
  createdAt: 0,
  updatedAt: 0,
  resume: {
    rawText: '',
    roles: [
      {
        id: 'r1',
        employer: 'Northline',
        title: 'Program Operations Lead',
        startDate: '2021',
        endDate: null,
        bullets: [],
      },
    ],
    education: [],
    skills: [],
    gaps: [],
  },
  questions: [
    {
      id: 'q1',
      text: 'Tell me about a process you fixed.',
      category: 'behavioral',
      sourceRoleId: 'r1',
      shortAnswer: [
        { kind: 'text', text: 'I cut the approval chain from ' },
        token('a', 'six weeks', 'edited', 'seven weeks'),
        { kind: 'text', text: ' to ' },
        token('b', 'three weeks', 'unverified'),
        { kind: 'text', text: '.' },
      ],
      longAnswer: [{ kind: 'text', text: 'The finance handoff was the holdup.' }],
      coachingNote: 'The finance-handoff detail is the diagnosis. Land the last clause.',
      versions: [],
      drillHistory: [],
      generatedAt: 1,
    },
  ],
};

describe('buildDocx', () => {
  it('produces a document with the expected hierarchy, marks and appendix', async () => {
    const buffer = await Packer.toBuffer(buildDocx(project));
    // Unzip document.xml out of the .docx container.
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(buffer));
    const xml = strFromU8(files['word/document.xml']);

    expect(xml).toContain('Vantage Grid');
    expect(xml).toContain('w:val="Title"');
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('Tell me about a process you fixed.');
    // Unverified spans stay marked; confirmed and edited ones do not.
    expect(xml).toContain('‹three weeks›');
    expect(xml).not.toContain('‹six weeks›');
    expect(xml).toContain('w:val="yellow"');
    // Appendix and footer.
    expect(xml).toContain('Corrections');
    expect(xml).toContain('seven weeks');
    expect(xml).toContain('Prepared with Recall on');
  });
});
