import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shell, PageTitle } from '@/components/Shell';
import { createProject, useSettings } from '@/db/hooks';
import { ExtractionError, extractText } from '@/lib/parse';
import { parseResume } from '@/lib/operations';
import { LLMError } from '@/llm/client';
import type { Mode, Project } from '@/types';

export default function Intake() {
  const navigate = useNavigate();
  const settings = useSettings();
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('standard');
  const [resumeText, setResumeText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const text = await extractText(file);
      setResumeText(text);
      setFileName(file.name);
    } catch (e) {
      setFileName(null);
      setError(
        e instanceof ExtractionError
          ? e.message
          : "We couldn't read that file. Try pasting the text instead.",
      );
      pasteRef.current?.focus();
    }
  }

  async function onCreate() {
    setError(null);
    if (!settings.apiKey.trim()) {
      navigate('/settings?error=Add an API key before parsing a resume.');
      return;
    }
    if (resumeText.trim().length < 200) {
      setError('Paste at least a few lines of your resume before continuing.');
      pasteRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const resume = await parseResume(resumeText.trim());
      const now = Date.now();
      const project: Project = {
        id: nanoid(),
        name: name.trim() || fileName?.replace(/\.[^.]+$/, '') || 'Untitled project',
        mode,
        createdAt: now,
        updatedAt: now,
        resume,
        jobDescription: jobDescription.trim() || undefined,
        questions: [],
      };
      await createProject(project);
      navigate(`/p/${project.id}/review`);
    } catch (e) {
      if (e instanceof LLMError && (e.kind === 'no-key' || e.kind === 'auth')) {
        navigate(`/settings?error=${encodeURIComponent(e.message)}`);
        return;
      }
      setError(
        e instanceof LLMError
          ? `${e.message}${e.detail ? ` (${e.detail})` : ''}`
          : 'Something went wrong parsing the resume.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="New project"
        subtitle="Upload or paste your resume. A job description is optional but produces sharper questions."
      />

      <div className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="name">Project name</Label>
          <Input
            id="name"
            placeholder="e.g. Vantage Grid — Senior Manager, Business Ops"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Mode</Label>
          <div className="flex gap-2">
            <Button
              variant={mode === 'standard' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('standard')}
            >
              Standard
            </Button>
            <Button
              variant={mode === 'fast' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('fast')}
            >
              Fast
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === 'standard'
              ? 'Answers generate one at a time and nothing exports until every invented detail is resolved.'
              : 'All answers generate at once and export is allowed with a warning. You can switch anytime.'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resumeFile">Resume</Label>
          <Input
            id="resumeFile"
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {fileName ? (
            <p className="text-xs text-muted-foreground">
              Read {resumeText.length.toLocaleString()} characters from {fileName}.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="resumeText">…or paste it</Label>
          <Textarea
            id="resumeText"
            ref={pasteRef}
            rows={10}
            className="font-mono text-xs"
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value);
              setFileName(null);
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="jd">Job description (optional)</Label>
          <Textarea
            id="jd"
            rows={8}
            className="font-mono text-xs"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Without one, Recall generates 10 general questions instead of 15 targeted ones.
          </p>
        </div>

        {error ? (
          <div className="flex items-start justify-between gap-4 rounded-md bg-destructive/10 px-4 py-3.5 font-mono text-[13px] text-destructive">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-destructive/40 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void onCreate()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-t border-border pt-6">
          <Button onClick={() => void onCreate()} disabled={busy}>
            {busy ? 'Reading the resume…' : 'Parse resume'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </div>
      </div>
    </Shell>
  );
}
