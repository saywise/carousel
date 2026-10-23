import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectSchema, assetUploadSchema, type LibraryImage, type Project, type Usage, type Mode, type Operation } from '../shared/content';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
export interface UsageRecord extends Usage {
  id: string; createdAt: string; mode: Mode; model: string; operation: Operation;
  status: 'completed' | 'failed'; errorCode: string | null;
}
export interface Store {
  listAssets(): LibraryImage[]; saveAsset(asset: z.infer<typeof assetUploadSchema>): LibraryImage; getAsset(id: string): string | undefined;
  listProjects(): Project[]; saveProject(project: Project): void;
  recordUsage(record: UsageRecord): void; listUsage(): UsageRecord[]; close(): void;
}
export function createStore(directory: string): Store {
  if (directory !== ':memory:') mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(directory === ':memory:' ? ':memory:' : join(directory, 'studio.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS generation_usage (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, record TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, label TEXT NOT NULL, provenance TEXT NOT NULL, data_url TEXT NOT NULL);');
  return {
    listAssets: () => db.prepare('SELECT id, label, provenance FROM assets ORDER BY created_at DESC').all().map(row => ({ src: `/api/assets/${row.id}/image`, label: String(row.label), provenance: String(row.provenance) as LibraryImage['provenance'] })),
    saveAsset: asset => { const checked = assetUploadSchema.parse(asset); const id = randomUUID(); db.prepare('INSERT INTO assets VALUES (?, ?, ?, ?, ?)').run(id, new Date().toISOString(), checked.label, checked.provenance, checked.dataUrl); return { src: `/api/assets/${id}/image`, label: checked.label, provenance: checked.provenance }; },
    getAsset: id => { const row = db.prepare('SELECT data_url FROM assets WHERE id = ?').get(id); return row ? String(row.data_url) : undefined; },
    listProjects: () => db.prepare('SELECT document FROM projects ORDER BY updated_at DESC').all().map(row => projectSchema.parse(JSON.parse(String(row.document)))),
    saveProject: project => { const checked = projectSchema.parse(project); db.prepare('INSERT INTO projects VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, document=excluded.document').run(checked.id, checked.updatedAt, JSON.stringify(checked)); },
    recordUsage: record => { db.prepare('INSERT OR REPLACE INTO generation_usage VALUES (?, ?, ?)').run(record.id, record.createdAt, JSON.stringify(record)); },
    listUsage: () => db.prepare('SELECT record FROM generation_usage ORDER BY created_at DESC LIMIT 500').all().map(row => JSON.parse(String(row.record)) as UsageRecord),
    close: () => db.close(),
  };
}
