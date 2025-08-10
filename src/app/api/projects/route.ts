import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongo';
import { ProjectModel } from '@/models/Project';
import { memoryProjects } from '@/lib/memory';

function useMemory() {
  return !process.env.MONGO_URI;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '10', 10), 1), 100);
  const status = searchParams.get('status') ?? undefined;

  if (useMemory()) {
    const { data, total } = memoryProjects.list(page, limit, status as any);
    return NextResponse.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  }

  await connectMongo();
  const filter: any = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    ProjectModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ProjectModel.countDocuments(filter),
  ]);
  return NextResponse.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, name, description, status } = body;
  if (!projectId || !name) {
    return NextResponse.json({ error: 'projectId and name are required' }, { status: 400 });
  }

  if (useMemory()) {
    const created = memoryProjects.create({ projectId, name, description, status });
    return NextResponse.json({ data: created }, { status: 201 });
  }

  await connectMongo();
  try {
    const created = await ProjectModel.create({ projectId, name, description, status });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 11000) return NextResponse.json({ error: 'projectId must be unique' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
