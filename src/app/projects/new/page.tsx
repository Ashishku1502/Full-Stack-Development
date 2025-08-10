"use client";
import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({ projectId: '', name: '', description: '', status: 'Planned' });
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/projects', form);
      router.push('/projects');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to create project');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Add Project</h1>
      {error && <div className="mb-4 text-red-600">{error}</div>}
      <form className="space-y-4" onSubmit={onSubmit}>
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
        <button className="px-3 py-2 bg-blue-600 text-white rounded" type="submit">Create</button>
      </form>
    </div>
  );
}
