import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRACKER_GREEN } from "@/lib/hawkTracker";

const STORE_KEY = "hawk_tracker_tasks";

/**
 * Tasks — a simple to-do list the user fills out to stay organized between
 * meetings. Lives in the browser; nothing leaves the app.
 */
export default function TrackerTasks() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
  });
  const [text, setText] = useState("");

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tasks)); } catch { /* ignore */ }
  }, [tasks]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setTasks((p) => [{ id: Date.now(), text: t, done: false }, ...p]);
    setText("");
  };

  const open = tasks.filter((t) => !t.done).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-heading font-bold text-lg text-foreground">Tasks</h2>
            <p className="text-xs text-muted-foreground">{open} open · {tasks.length - open} done</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="What needs to get done?"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <Button onClick={add} style={{ background: TRACKER_GREEN }} className="font-heading font-semibold">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center rounded-xl border border-dashed border-border">
          No tasks yet — add your first one above.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <button
                onClick={() => setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                aria-label="Toggle task"
              >
                {t.done
                  ? <CheckCircle2 className="w-5 h-5" style={{ color: TRACKER_GREEN }} />
                  : <Circle className="w-5 h-5 text-muted-foreground" />}
              </button>
              <span className={`flex-1 text-sm ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {t.text}
              </span>
              <button
                onClick={() => setTasks((p) => p.filter((x) => x.id !== t.id))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}