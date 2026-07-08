import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, Trash2, Check, X } from "lucide-react";
import db, { uid, now } from "../db";
import { Button, Card } from "../components/ui";

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = useLiveQuery(
    async () => (id ? ((await db.lists.get(id)) ?? null) : null),
    [id]
  );
  const items = useLiveQuery(
    () => (id ? db.items.where("listId").equals(id).sortBy("createdAt") : []),
    [id]
  );

  if (list === undefined) return null; // loading
  if (list === null || !id)
    return (
      <div className="py-16 text-center text-sm text-muted">
        This list no longer exists.{" "}
        <Link to="/lists" className="text-accent underline-offset-2 hover:underline">
          Back to lists
        </Link>
      </div>
    );

  const open = items?.filter((i) => !i.done) ?? [];
  const done = items?.filter((i) => i.done) ?? [];

  const addItem = async () => {
    const t = text.trim();
    if (!t) return;
    await db.items.add({
      id: uid(),
      listId: id,
      text: t,
      done: false,
      createdAt: now(),
      updatedAt: now(),
    });
    setText("");
  };

  const toggle = (itemId: string, value: boolean) =>
    db.items.update(itemId, { done: value, updatedAt: now() });

  const removeItem = (itemId: string) => db.items.delete(itemId);

  const clearDone = () => db.items.bulkDelete(done.map((i) => i.id));

  const deleteList = async () => {
    await db.items.where("listId").equals(id).delete();
    await db.lists.delete(id);
    navigate("/lists");
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link
          to="/lists"
          aria-label="Back to lists"
          className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex min-w-0 flex-1 items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <span>{list.emoji}</span>
          <span className="truncate">{list.name}</span>
        </h1>
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete list"
          className="rounded-full p-2 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 size={18} />
        </button>
      </header>

      {confirmDelete && (
        <Card className="border-red-400/40">
          <p className="text-sm">
            Delete <strong>{list.name}</strong> and all its items?
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={deleteList}>
              Delete list
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        </Card>
      )}

      {/* Add item */}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Add an item…"
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          onClick={addItem}
          aria-label="Add item"
          className="rounded-xl bg-accent px-4 text-white transition-all active:scale-95 dark:text-bg"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Open items */}
      <ul className="space-y-2">
        {open.map((i) => (
          <li
            key={i.id}
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
          >
            <button
              onClick={() => toggle(i.id, true)}
              aria-label={`Mark ${i.text} done`}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-line transition-colors hover:border-accent"
            />
            <span className="min-w-0 flex-1 break-words text-sm">{i.text}</span>
            <button
              onClick={() => removeItem(i.id)}
              aria-label={`Remove ${i.text}`}
              className="p-1 text-muted opacity-60 transition-opacity hover:text-red-500 group-hover:opacity-100"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>

      {items && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          Nothing here yet — add your first item above.
        </p>
      )}

      {/* Done items */}
      {done.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Done · {done.length}
            </p>
            <button
              onClick={clearDone}
              className="text-xs text-muted underline-offset-2 hover:underline"
            >
              Clear done
            </button>
          </div>
          <ul className="space-y-2">
            {done.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 opacity-60"
              >
                <button
                  onClick={() => toggle(i.id, false)}
                  aria-label={`Mark ${i.text} not done`}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-white dark:text-bg"
                >
                  <Check size={14} strokeWidth={3} />
                </button>
                <span className="min-w-0 flex-1 break-words text-sm line-through">
                  {i.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
