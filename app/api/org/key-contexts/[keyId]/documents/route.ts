/**
 * GET  /api/org/key-contexts/[keyId]/documents  — list documents for a key
 * POST /api/org/key-contexts/[keyId]/documents  — upload a document (multipart/form-data)
 *
 * Requires BLOB_READ_WRITE_TOKEN env var (Vercel Blob).
 * Accepts: PDF, Markdown, plain text, and common doc formats. Max 10MB.
 */

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  try {
    const { orgId } = await requireAuth();
    const { keyId } = await params;

    const docs = await db
      .select()
      .from(schema.keyDocuments)
      .where(
        and(
          eq(schema.keyDocuments.orgId, orgId),
          eq(schema.keyDocuments.providerKeyId, keyId)
        )
      )
      .orderBy(schema.keyDocuments.uploadedAt);

    return NextResponse.json({ documents: docs });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { keyId } = await params;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Document uploads not configured (BLOB_READ_WRITE_TOKEN missing)" },
        { status: 501 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, TXT, MD, DOC, DOCX" },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blobPath = `key-docs/${orgId}/${keyId}/${Date.now()}-${file.name}`;
    const blob = await put(blobPath, file, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const [doc] = await db
      .insert(schema.keyDocuments)
      .values({
        orgId,
        providerKeyId: keyId,
        blobUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: userId,
      })
      .returning();

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[key-contexts/documents POST]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
