import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongo';
import { ProjectModel } from '@/models/Project';
import mongoose from 'mongoose';
import { memoryProjects } from '@/lib/memory';

function useMemory() {
  return !process.env.MONGO_URI;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (useMemory()) {
    const doc = memoryProjects.get(params.id);
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: doc });
  }
  await connectMongo();
  if (!mongoose.Types.ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  const doc = await ProjectModel.findById(params.id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: doc });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (useMemory()) {
    const updated = memoryProjects.update(params.id, body);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: updated });
  }
  await connectMongo();
  if (!mongoose.Types.ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  const updated = await ProjectModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (useMemory()) {
    const ok = memoryProjects.remove(params.id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ message: 'Deleted' });
  }
  await connectMongo();
  if (!mongoose.Types.ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  const deleted = await ProjectModel.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ message: 'Deleted' });
}
