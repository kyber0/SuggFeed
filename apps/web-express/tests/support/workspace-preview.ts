// Local-only visual test harness. Never mounted by the application.
import express from 'express';
import path from 'node:path';
import { Eta } from 'eta';

export function createWorkspacePreview() {
  const app = express();
  const root = path.resolve(__dirname, '../..');
  const eta = new Eta({ views: path.join(root, 'views') });
  const titles = ['More shaded seating near the science building', 'Keep the library open during exam week', 'Better lighting along the east walkway', 'Water refill stations in every building', 'A quieter space for independent study', 'Covered bicycle parking near the main gate'];
  const statuses = ['pending', 'approved', 'in_progress', 'resolved', 'rejected', 'pending'];
  const items = titles.map((title, index) => ({
    id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    title, description: 'Students use this area every day, but it could be more welcoming. A small improvement would make a real difference, especially between classes. Please consider this in the next round of campus improvements.',
    status: statuses[index], category: index % 2 ? 'Learning' : 'Facilities',
    created_at: '2026-10-08T10:00:00Z', updated_at: '2026-10-10T10:00:00Z',
    vote_count: 24 + index * 7, comment_count: index + 2, staff_note: '',
  }));
  app.use(express.json());
  const privateNotes: Array<{id:string;body:string;created_at:string;actor:{display_name:string}}> = [];
  app.use(express.static(path.join(root, 'public')));
  app.get('/roadmap', (req, res) => res.send(eta.render('roadmap', {
    currentPath: '/roadmap', user: null, items: req.query.empty ? [] : items.filter(s => ['approved', 'in_progress', 'resolved'].includes(s.status)).map(s => ({ ...s, votes: s.vote_count, comments: s.comment_count })),
    categories: ['Facilities', 'Learning'],
  })));
  app.get('/admin', (req, res) => res.send(eta.render('admin', {
    currentPath: '/admin', user: { display_name: 'Alex Reyes', full_name: 'Alex Reyes', role: 'admin' },
    counts: { all: 126, pending: 18, approved: 32, in_progress: 24, resolved: 45, rejected: 7 },
    status: 'all', search: '', page: 1, pageCount: 9, perPage: 15, totalCount: 126,
    submissions: req.query.empty ? [] : items,
    staffMembers: [{ id: '00000000-0000-4000-8000-000000000010', display_name: 'Alex Reyes', role: 'admin' }], savedViews: [],
  })));
  app.get('/staff-login', (_req, res) => res.send(eta.render('staff-login', { currentPath: '/admin', user: null })));
  // Exercise retry behavior without sending changes to a real database.
  let attempts = 0;
  app.get('/api/staff/submissions/:id/activity', (_req,res) => res.json({ success: true, history: [], transitions: [], notes: privateNotes }));
  app.post('/api/staff/submissions/:id/notes', (req,res) => {
    privateNotes.unshift({id:String(privateNotes.length+1),body:req.body.body,created_at:new Date().toISOString(),actor:{display_name:'Alex Reyes'}});
    res.status(201).json({ success: true });
  });
  app.post('/api/staff/views', (_req,res) => res.status(201).json({ success: true }));
  app.patch('/api/staff/submissions/:id/review', (_req, res) => {
    attempts++;
    res.status(attempts === 1 ? 503 : 200).json(attempts === 1 ? { error: 'Test failure' } : { success: true });
  });
  return app;
}
if (require.main === module) createWorkspacePreview().listen(4317, '127.0.0.1', () => console.log('Local fixture preview: http://127.0.0.1:4317'));
