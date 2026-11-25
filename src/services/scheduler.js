import db from './db';

const EVENT = 'inpossible:proactive-task-due';

export const scheduleProactiveTask = async ({ chatId, dueAt, kind = 'check-in', payload = {} }) => {
  const id = await db.proactiveTasks.add({ chatId: Number(chatId), dueAt: Number(dueAt), kind, payload, status: 'pending', createdAt: Date.now() });
  return db.proactiveTasks.get(id);
};

export const checkDueProactiveTasks = async (now = Date.now()) => {
  const tasks = await db.proactiveTasks.where('status').equals('pending').toArray();
  const due = tasks.filter((task) => Number(task.dueAt) <= now);
  for (const task of due) {
    await db.proactiveTasks.update(task.id, { status: 'due', dueAt: Number(task.dueAt), checkedAt: now });
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...task, status: 'due' } }));
  }
  return due;
};

export const startForegroundScheduler = () => {
  let stopped = false;
  const tick = () => { if (!stopped) checkDueProactiveTasks().catch(() => {}); };
  tick();
  const timer = window.setInterval(tick, 30_000);
  return () => { stopped = true; window.clearInterval(timer); };
};
