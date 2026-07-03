import { WikiShell } from '@/components/wiki/WikiShell'
import { getScriptManifest } from '@/lib/yaml-loader'

export default async function ToolingPage() {
  const manifest = await getScriptManifest()

  return (
    <WikiShell>
      <h1>Tooling</h1>
      <p className="page-intro">
        Scripts available in the workspace-ci repository, including usage
        examples, arguments, and expected output.
      </p>
      {manifest.scripts.length === 0 ? (
        <p className="empty-state">
          No scripts found. Check that the script manifest is accessible.
        </p>
      ) : (
        <div className="tooling-grid">
          {manifest.scripts.map((script) => (
            <article key={script.id} className="tooling-card">
              <h2>
                <code>{script.id}</code>
              </h2>
              <p className="tooling-card__summary">{script.summary}</p>
              <pre className="tooling-card__usage">
                <code>{script.usage}</code>
              </pre>
              <span className={`tooling-card__category badge--blue`}>
                {script.category}
              </span>
              {script.args && script.args.length > 0 && (
                <dl className="tooling-card__args">
                  {script.args.map((arg) => (
                    <div key={arg.name}>
                      <dt><code>{arg.name}</code></dt>
                      <dd>{arg.description}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="tooling-card__output">
                <strong>Output:</strong> {script.output}
              </p>
              {script.make_target && (
                <p className="tooling-card__make">
                  <strong>Make target:</strong> <code>{script.make_target}</code>
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </WikiShell>
  )
}
