import { createServer } from 'node:http';

const port = Number(process.env.RECALL_E2E_PROVIDER_PORT ?? 8790);

function answerFor(input) {
  if (input.includes('MALFORMED_E2E')) return 'this is not JSON';
  if (input.includes('Extract the structured content of this resume.')) {
    return {
      roles: [{
        employer: 'Northline Health Collaborative',
        title: 'Program Operations Lead',
        startDate: 'March 2021',
        endDate: '',
        bullets: ['Built a shared intake tracker for six partner clinics.'],
        location: 'Remote',
      }],
      education: ['State University, BA Sociology'],
      skills: ['Excel', 'Salesforce'],
    };
  }
  if (input.includes('Generate 10 interview questions')) {
    const roleId = input.match(/^([^|\n]+) \| Northline Health Collaborative/m)?.[1]?.trim() ?? 'role';
    return {
      questions: [
        { text: 'Tell me about yourself.', category: 'universal', sourceRoleId: roleId, competency: '' },
        { text: 'Tell me about a project you are proud of.', category: 'universal', sourceRoleId: roleId, competency: '' },
      ],
    };
  }
  if (input.includes('Write an answer to this interview question.')) {
    return {
      shortAnswer: [
        { kind: 'text', text: 'I mapped the intake process and found ' },
        { kind: 'token', text: 'three duplicate approvals', category: 'count' },
        { kind: 'text', text: '. I replaced them with ' },
        { kind: 'token', text: 'one shared review queue', category: 'mechanism' },
        { kind: 'text', text: ', which made ownership clear.' },
      ],
      longAnswer: [{ kind: 'text', text: 'I reviewed the intake flow and clarified ownership across the partner clinics.' }],
      coachingNote: 'The duplicate-approval detail makes the diagnosis concrete. Land firmly on the ownership result.',
    };
  }
  return { error: 'Unexpected E2E prompt.' };
}

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  response.writeHead(200, { 'content-type': 'application/json' });
  const answer = answerFor(String(body.input ?? ''));
  response.end(JSON.stringify({ output_text: typeof answer === 'string' ? answer : JSON.stringify(answer) }));
});

server.listen(port, '127.0.0.1', () => console.log(`[e2e-provider] listening on ${port}`));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
