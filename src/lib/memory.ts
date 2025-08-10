export type ProjectStatus = 'Planned' | 'Active' | 'Done';
export interface ProjectItem {
  _id: string;
  projectId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

function getStore(): ProjectItem[] {
  const g = globalThis as any;
  if (!g.__project_store) g.__project_store = [] as ProjectItem[];
  return g.__project_store as ProjectItem[];
}

function makeId(): string {
  // Simple unique id
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const memoryProjects = {
  list(page = 1, limit = 10, status?: ProjectStatus) {
    let data = getStore();
    if (status) data = data.filter(p => p.status === status);
    const total = data.length;
    const start = (page - 1) * limit;
    const sliced = data.slice(start, start + limit);
    return { data: sliced, total };
  },
  create(input: Omit<ProjectItem, '_id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString();
    const item: ProjectItem = { _id: makeId(), ...input, createdAt: now, updatedAt: now };
    const store = getStore();
    store.unshift(item);
    return item;
  },
  get(id: string) {
    return getStore().find(p => p._id === id) || null;
  },
  update(id: string, patch: Partial<ProjectItem>) {
    const store = getStore();
    const idx = store.findIndex(p => p._id === id);
    if (idx === -1) return null;
    store[idx] = { ...store[idx], ...patch, _id: id, updatedAt: new Date().toISOString() };
    return store[idx];
  },
  remove(id: string) {
    const store = getStore();
    const idx = store.findIndex(p => p._id === id);
    if (idx === -1) return false;
    store.splice(idx, 1);
    return true;
  }
};
