/**
 * DELETE /api/org/key-contexts/[keyId]/documents/[docId]
 * Removes a document from Vercel Blob and the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

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

    // Delete from blob storage if token available
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(doc.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {
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
