"use client";
import useSWR from 'swr';
import axios from 'axios';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo } from 'react';

const fetcher = (url: string) => axios.get(url).then(r => r.data);

export default function ProjectsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const page = Number(search.get('page') ?? '1');
  const status = search.get('status') ?? '';
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '10');
    if (status) params.set('status', status);
    return params.toString();
  }, [page, status]);

  const { data, error, isLoading } = useSWR(`/api/projects?${query}`, fetcher);

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Failed to load</div>;

  const { data: projects, totalPages } = data;

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="/projects/new" className="px-3 py-2 bg-blue-600 text-white rounded">Add Project</Link>
      </div>

      <div className="flex gap-2 items-center">
        <label>Status:</label>
        <select
          value={status}
          onChange={(e) => router.push(`/projects?status=${e.target.value}&page=1`)}
          className="border rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="Planned">Planned</option>
          <option value="Active">Active</option>
          <option value="Done">Done</option>
        </select>
      </div>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Project ID</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Created</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects?.map((p: any) => (
            <tr key={p._id} className="border-t">
              <td className="p-2">{p.projectId}</td>
              <td className="p-2">{p.name}</td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">{new Date(p.createdAt).toLocaleDateString()}</td>
              <td className="p-2">
                <Link href={`/projects/${p._id}`} className="text-blue-600">Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2">
        <button
          className="px-3 py-1 border rounded"
          disabled={page <= 1}
          onClick={() => router.push(`/projects?status=${status}&page=${page - 1}`)}
        >Prev</button>
        <span>Page {page} / {totalPages}</span>
        <button
          className="px-3 py-1 border rounded"
          disabled={page >= totalPages}
          onClick={() => router.push(`/projects?status=${status}&page=${page + 1}`)}
        >Next</button>
      </div>
    </div>
  );
}
