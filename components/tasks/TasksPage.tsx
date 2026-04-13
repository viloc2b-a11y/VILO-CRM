"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PRIORITIES, TASK_CHANNELS, type Priority, type TaskChannel } from "@/lib/constants";
import { isTaskOverdue } from "@/lib/dates";
import { useCrmStore } from "@/lib/store";
import { useMemo, useState } from "react";

export function TasksPage() {
  const tasks = useCrmStore((s) => s.tasks);
  const addTask = useCrmStore((s) => s.addTask);
  const toggleTaskCompleted = useCrmStore((s) => s.toggleTaskCompleted);
  const deleteTask = useCrmStore((s) => s.deleteTask);

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [channel, setChannel] = useState<TaskChannel>("vilo");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [filterChannel, setFilterChannel] = useState<TaskChannel | "all">("all");

  const sorted = useMemo(() => {
    const list = filterChannel === "all" ? tasks : tasks.filter((t) => t.channel === filterChannel);
    return [...list].sort((a, b) => {
      const ao = isTaskOverdue(a.dueAt, a.completed) ? 0 : 1;
      const bo = isTaskOverdue(b.dueAt, b.completed) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  }, [tasks, filterChannel]);

  function submitQuick(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueAt) return;
    const local = new Date(dueAt);
    addTask({
      title: title.trim(),
      dueAt: local.toISOString(),
      channel,
      priority,
      completed: false,
    });
    setTitle("");
    setDueAt("");
    setChannel("vilo");
    setPriority("Medium");
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-clinical-ink">Tasks</h1>
        <p className="mt-1 text-sm text-clinical-muted">Follow-ups across Vilo, Vitalis, and misc.</p>
      </header>

      <Card className="mb-6 p-4">
        <div className="mb-3 text-sm font-semibold text-clinical-ink">Quick add</div>
        <form onSubmit={submitQuick} className="grid gap-3 md:grid-cols-12 md:items-end">
          <label className="md:col-span-5">
            <span className="text-xs font-medium text-clinical-muted">Title</span>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call sponsor…" />
          </label>
          <label className="md:col-span-3">
            <span className="text-xs font-medium text-clinical-muted">Due</span>
            <Input required type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-clinical-muted">Channel</span>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as TaskChannel)}>
              {TASK_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-clinical-muted">Priority</span>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <div className="md:col-span-12 md:flex md:justify-end">
            <Button type="submit">Add task</Button>
          </div>
        </form>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-clinical-muted">Filter</span>
        <Select
          className="w-40"
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value as typeof filterChannel)}
        >
          <option value="all">All channels</option>
          {TASK_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <Card className="divide-y divide-clinical-line">
        {sorted.map((t) => {
          const overdue = isTaskOverdue(t.dueAt, t.completed);
          return (
            <div
              key={t.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className={t.completed ? "text-clinical-muted line-through" : "font-medium text-clinical-ink"}>
                  {t.title}
                </div>
                <div className="text-xs text-clinical-muted">
                  Due {new Date(t.dueAt).toLocaleString()}
                  {overdue && !t.completed ? (
                    <span className="ml-2 font-semibold text-clinical-alert">overdue</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={t.channel === "vitalis" ? "vitalis" : t.channel === "vilo" ? "vilo" : "neutral"}>
                  {t.channel}
                </Badge>
                <Badge tone={t.priority === "High" ? "alert" : "neutral"}>{t.priority}</Badge>
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => toggleTaskCompleted(t.id)}>
                  {t.completed ? "Undo" : "Done"}
                </Button>
                <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => deleteTask(t.id)}>
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="p-6 text-sm text-clinical-muted">No tasks.</div>}
      </Card>
    </div>
  );
}
