import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ProjectRoutingForm } from "@/components/projects/ProjectRoutingForm";
import type { ProjectRoutingConfig } from "@/lib/db/schema";

type Props = { params: Promise<{ projectId: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params;
  const { orgId } = await requireAuth();

  const project = await db.query.projects.findFirst({
    where: and(
      eq(schema.projects.id, projectId),
      eq(schema.projects.orgId, orgId),
    ),
    columns: {
      id: true,
      name: true,
      description: true,
      color: true,
      routingConfig: true,
    },
  });

  if (!project) notFound();

  const config = (project.routingConfig ?? {}) as ProjectRoutingConfig;

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {project.color && (
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            {project.description && (
              <p className="text-gray-400 text-sm mt-0.5">{project.description}</p>
            )}
          </div>
        </div>

        <ProjectRoutingForm projectId={projectId} initial={config} />
      </div>
    </div>
  );
}
