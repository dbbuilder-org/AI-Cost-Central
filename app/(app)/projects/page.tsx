import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function ProjectsPage() {
  const { orgId } = await requireAuth();

  const projects = await db.query.projects.findMany({
    where: eq(schema.projects.orgId, orgId),
    orderBy: (p, { asc }) => [asc(p.name)],
  });

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-gray-400 mt-1 text-sm">Group API keys into projects for cost attribution</p>
          </div>
          <Link
            href="/settings/keys"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Manage Keys
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 p-12 text-center">
            <p className="text-gray-500 text-sm">No projects yet.</p>
            <p className="text-gray-600 text-xs mt-1">
              Projects let you attribute cost to features, teams, or customers.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 block transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  {project.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                  )}
                  <span className="text-white font-semibold text-sm">{project.name}</span>
                </div>
                {project.description && (
                  <p className="text-gray-400 text-xs mb-3">{project.description}</p>
                )}
                {project.tags && project.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {project.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {project.budgetUsd && (
                  <p className="text-xs text-yellow-500 mt-2">
                    Budget: ${parseFloat(project.budgetUsd).toFixed(2)}/mo
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
