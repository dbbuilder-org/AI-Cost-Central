/**
 * GET  /api/org/key-contexts/[keyId]/documents  — list documents (with presigned download URLs)
 * POST /api/org/key-contexts/[keyId]/documents  — upload a document via Cloudflare R2
 *
 * Requires R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET env vars.
 * Accepts: PDF, Markdown, plain text, and common doc formats. Max 10MB.
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

const BUCKET = () => process.env.R2_BUCKET!;

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

    // Generate presigned download URLs (1-hour expiry)
    const r2 = getR2Client();
    const withUrls = await Promise.all(
      docs.map(async (doc) => {
        const downloadUrl = await getSignedUrl(
          r2,
          new GetObjectCommand({ Bucket: BUCKET(), Key: doc.blobUrl }),
          { expiresIn: 3600 }
        );
        return { ...doc, downloadUrl };
      })
    );

    return NextResponse.json({ documents: withUrls });
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

    if (!process.env.R2_ACCESS_KEY_ID) {
      return NextResponse.json(
        { error: "Document uploads not configured (R2 env vars missing)" },
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

    // Upload to R2
    const objectKey = `key-docs/${orgId}/${keyId}/${Date.now()}-${file.name}`;
    const r2 = getR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET(),
        Key: objectKey,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
        ContentDisposition: `attachment; filename="${file.name}"`,
      })
    );

    const [doc] = await db
      .insert(schema.keyDocuments)
      .values({
        orgId,
        providerKeyId: keyId,
        blobUrl: objectKey, // stores R2 object key
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: userId,
      })
      .returning();

    // Return with a fresh presigned URL
    const downloadUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: BUCKET(), Key: objectKey }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({ document: { ...doc, downloadUrl } }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[key-contexts/documents POST]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
