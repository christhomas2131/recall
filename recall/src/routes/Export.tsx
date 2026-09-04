import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ExportGateDialogs, useExportGate } from '@/components/ExportGate';
import { ProgressHeader } from '@/components/ProgressHeader';
import { BridgeBackdrop, SiteFooter } from '@/components/Shell';
import { ModeToggle } from '@/components/ModeToggle';
import { PrintDocument } from '@/components/PrintDocument';
import { useProject } from '@/db/hooks';
import { useToast } from '@/hooks/use-toast';
import {
  buildMarkdown,
  download,
  exportStats,
  slugify,
  verificationFooter,
} from '@/lib/exportDoc';
import { docxBlob } from '@/lib/exportDocx';
import type { Project } from '@/types';

function ExportScreen({ project }: { project: Project }) {
  const gate = useExportGate(project);
  const { toast } = useToast();
  const stats = exportStats(project);
  const generated = project.questions.filter((q) => q.generatedAt !== null);
  const nothingToExport = generated.length === 0;

  const copyAll = () =>
    gate.request(() => {
      void navigator.clipboard.writeText(buildMarkdown(project)).then(
        () => toast({ title: 'Copied', description: 'The whole document is on your clipboard.' }),
        () => toast({ title: 'Copy failed', description: 'Your browser refused clipboard access.' }),
      );
    });

  const exportMarkdown = () =>
    gate.request(() => {
      download(
        `${slugify(project.name)}.md`,
        new Blob([buildMarkdown(project)], { type: 'text/markdown;charset=utf-8' }),
      );
    });

  const exportDocx = () =>
    gate.request(() => {
      void docxBlob(project).then(
        (blob) => download(`${slugify(project.name)}.docx`, blob),
        () => toast({ title: 'DOCX export failed', description: 'Try the Markdown export.' }),
      );
    });

  const print = () => gate.request(() => window.print());

  return (
    <div className="relative min-h-dvh">
      <BridgeBackdrop />
      <div className="above flex min-h-dvh flex-col">
      <ProgressHeader project={project} right={<ModeToggle project={project} />} />
      <main className="mx-auto w-full max-w-content px-8 pb-20 pt-[120px] max-md:px-4 max-md:pt-[96px] print:hidden">
        <h1 className="page-title">Export</h1>

        {nothingToExport ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing to export yet — no answers have been drafted.{' '}
            <Link
              to={`/p/${project.id}/verify`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Go draft some
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">{verificationFooter(project)}</p>

            {gate.blocked ? (
              <div className="mt-6 rounded-md border border-unverified/40 bg-unverified-soft px-4 py-3.5 font-mono text-[13px]">
                Standard mode is holding this export. {stats.unverified.length} generated details
                have not been checked yet.
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={copyAll} disabled={nothingToExport}>
                Copy everything
              </Button>
              <Button variant="outline" onClick={exportMarkdown} disabled={nothingToExport}>
                Markdown
              </Button>
              <Button variant="outline" onClick={exportDocx} disabled={nothingToExport}>
                Word (.docx)
              </Button>
              <Button variant="outline" onClick={print} disabled={nothingToExport}>
                Print
              </Button>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Every export carries the verification footer, keeps unverified details marked, and
              appends a list of what you corrected next to what Recall first guessed.
            </p>
          </>
        )}
      </main>

      <div className="mx-auto max-w-[720px] px-6">
        <PrintDocument project={project} />
      </div>

      <ExportGateDialogs project={project} gate={gate} />
      <SiteFooter />
      </div>
    </div>
  );
}

export default function ExportRoute() {
  const { projectId } = useParams();
  const { project, loading } = useProject(projectId);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="p-10 text-sm">Project not found.</div>;
  return <ExportScreen project={project} />;
}
