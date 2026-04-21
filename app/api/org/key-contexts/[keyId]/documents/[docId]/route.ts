/**
 * DELETE /api/org/key-contexts/[keyId]/documents/[docId]
 * Removes a document from Cloudflare R2 and the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ keyId: string; docId: string }> }
) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { keyId, docId } = await params;

    const doc = await db.query.keyDocuments.findFirst({
      where: and(
        eq(schema.keyDocuments.id, docId),
        eq(schema.keyDocuments.orgId, orgId),
        eq(schema.keyDocuments.providerKeyId, keyId)
      ),
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete from R2 (blobUrl stores the object key)
    if (process.env.R2_ACCESS_KEY_ID) {
      const r2 = getR2Client();
      await r2
        .send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: doc.blobUrl }))
        .catch(() => {
          // Non-fatal — DB record is the source of truth
        });
    }

    await db
      .delete(schema.keyDocuments)
      .where(
        and(
          eq(schema.keyDocuments.id, docId),
          eq(schema.keyDocuments.orgId, orgId)
        )
      );

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
