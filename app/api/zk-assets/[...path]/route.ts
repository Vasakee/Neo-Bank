import { NextRequest, NextResponse } from "next/server";

const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — zkey files can be large

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const url = `${CDN_BASE}/${path}`;

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok) {
    return new NextResponse(`Failed to fetch ${url}: ${upstream.status}`, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=86400",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  // Stream the body directly — avoids buffering large zkey/wasm files in memory
  return new NextResponse(upstream.body, { headers });
}
