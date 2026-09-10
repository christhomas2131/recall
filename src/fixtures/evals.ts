import type { AnswerGenResponse, ResumeParseResponse } from '@/llm/schemas';

export const GROUNDING_FIXTURES: {
  name: string;
  resume: string;
  valid: ResumeParseResponse;
  fabricated: ResumeParseResponse;
}[] = [
  {
    name: 'operations resume',
    resume: `Northline Health Collaborative\nProgram Operations Lead\nMarch 2021 - Present\nRemote\nBuilt a shared intake tracker for six partner clinics.\nSkills: Excel, Salesforce\nEducation: State University, BA Sociology`,
    valid: {
      roles: [{
        employer: 'Northline Health Collaborative', title: 'Program Operations Lead',
        startDate: 'March 2021', endDate: '', location: 'Remote',
        bullets: ['Built a shared intake tracker for six partner clinics.'],
      }],
      education: ['State University, BA Sociology'], skills: ['Excel', 'Salesforce'],
    },
    fabricated: {
      roles: [{
        employer: 'Northline Health Collaborative', title: 'Director of Operations',
        startDate: 'March 2021', endDate: '', location: 'Boston',
        bullets: ['Managed a $4M portfolio.'],
      }],
      education: ['State University, MBA'], skills: ['Python'],
    },
  },
  {
    name: 'public-sector resume',
    resume: `Harbor Civic Trust | Grants Manager | 2018–2022\nAdministered federal grant reporting under 2 CFR 200.\nOak College — Public Policy Certificate`,
    valid: {
      roles: [{
        employer: 'Harbor Civic Trust', title: 'Grants Manager', startDate: '2018',
        endDate: '2022', location: '', bullets: ['Administered federal grant reporting under 2 CFR 200.'],
      }],
      education: ['Oak College — Public Policy Certificate'], skills: [],
    },
    fabricated: {
      roles: [{
        employer: 'Harbor Civic Trust', title: 'Grants Manager', startDate: '2018',
        endDate: '2022', location: 'Washington, DC', bullets: ['Supervised twelve analysts.'],
      }],
      education: ['Oak College — Master of Public Policy'], skills: ['Tableau'],
    },
  },
];

export const VALID_ANSWER: AnswerGenResponse = {
  shortAnswer: [
    { kind: 'text', text: 'I mapped the intake process and found ' },
    { kind: 'token', text: 'three duplicate approvals', category: 'count' },
    { kind: 'text', text: '. I replaced them with ' },
    { kind: 'token', text: 'one shared review queue', category: 'mechanism' },
    { kind: 'text', text: ', which made ownership clear.' },
  ],
  longAnswer: [{ kind: 'text', text: 'The longer supporting answer.' }],
  coachingNote: 'The duplicate-approval detail makes the diagnosis concrete. Land firmly on the ownership result.',
};
