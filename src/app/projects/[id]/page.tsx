"use client";
import useSWR from 'swr';
import axios from 'axios';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

const fetcher = (url: string) => axios.get(url).then(r => r.data);

export default function EditProjectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { data, error, isLoading } = useSWR(id ? `/api/projects/${id}` : null, fetcher);
  const [form, setForm] = useState({ projectId: '', name: '', description: '', status: 'Planned' });
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (data?.data) {
      const p = data.data;
      setForm({ projectId: p.projectId, name: p.name, description: p.description ?? '', status: p.status });
    }
  }, [data]);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Failed to load</div>;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg('');
    try {
      await axios.put(`/api/projects/${id}`, form);
      router.push('/projects');
    } catch (err: any) {
      setErrMsg(err?.response?.data?.error ?? 'Failed to update project');
    }
  }

  async function onDelete() {
    if (!confirm('Delete this project?')) return;
    try {
      await axios.delete(`/api/projects/${id}`);
      router.push('/projects');
    } catch (err: any) {
      setErrMsg(err?.response?.data?.error ?? 'Failed to delete project');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Edit Project</h1>
      {errMsg && <div className="mb-4 text-red-600">{errMsg}</div>}
      <form className="space-y-4" onSubmit={onSave}>
        <div>
          <label className="block mb-1">Project ID</label>
          <input className="border rounded px-2 py-1 w-full" value={form.projectId} onChange={e=>setForm({...form, projectId: e.target.value})} required />
        </div>
        <div>
          <label className="block mb-1">Name</label>
          <input className="border rounded px-2 py-1 w-full" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} required />
        </div>
        <div>
          <label className="block mb-1">Description</label>
          <textarea className="border rounded px-2 py-1 w-full" value={form.description} onChange={e=>setForm({...form, description: e.target.value})} />
        </div>
        <div>
          <label className="block mb-1">Status</label>
          <select className="border rounded px-2 py-1" value={form.status} onChange={e=>setForm({...form, status: e.target.value})}>
            <option>Planned</option>
            <option>Active</option>
            <option>Done</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-blue-600 text-white rounded" type="submit">Save</button>
          <button className="px-3 py-2 bg-red-600 text-white rounded" type="button" onClick={onDelete}>Delete</button>
        </div>
      </form>
    </div>
  );
}
