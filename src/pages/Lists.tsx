import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ShoppingBasket } from "lucide-react";
import db, { uid, now } from "../db";
import { PageHeader, Card, Button } from "../components/ui";

const EMOJI = ["🛒", "🍎", "🎁", "🧳", "🏠", "📦", "✨", "📋"];

function NewListForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛒");

  const create = async () => {
    if (!name.trim()) return;
    await db.lists.add({
      id: uid(),
      name: name.trim(),
      emoji,
      createdAt: now(),
      updatedAt: now(),
    });
    onDone();
  };

  return (
    <Card className="border-accent-soft">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
        placeholder="List name — e.g. Weekly shop"
        className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {EMOJI.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            className={`rounded-lg p-1.5 text-lg transition-colors ${
              emoji === e ? "bg-accent-soft ring-1 ring-accent/50" : "hover:bg-surface-2"
            }`}
            aria-label={`Choose ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={create}>Create list</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export default function Lists() {
  const [creating, setCreating] = useState(false);
  const lists = useLiveQuery(() => db.lists.orderBy("createdAt").toArray(), []);
  const items = useLiveQuery(() => db.items.toArray(), []);

  const stats = (listId: string) => {
    const li = items?.filter((i) => i.listId === listId) ?? [];
    return { total: li.length, done: li.filter((i) => i.done).length };
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lists"
        subtitle="Shopping, packing, anything."
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <span className="flex items-center gap-1.5">
                <Plus size={16} /> New
              </span>
            </Button>
          )
        }
      />

      {creating && <NewListForm onDone={() => setCreating(false)} />}

      {lists && lists.length === 0 && !creating && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <div className="mb-4 rounded-2xl bg-accent-soft p-4 text-accent">
            <ShoppingBasket size={30} strokeWidth={1.75} />
          </div>
          <p className="font-medium">No lists yet</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            Start with a shopping list — tap New and add your first few items.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {lists?.map((l) => {
          const { total, done } = stats(l.id);
          const pct = total ? (done / total) * 100 : 0;
          return (
            <Link key={l.id} to={`/lists/${l.id}`} className="block">
              <Card className="transition-colors hover:border-accent-soft">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{l.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-xs text-muted">
                      {total === 0
                        ? "Empty"
                        : done === total
                          ? "All done ✓"
                          : `${done} of ${total} done`}
                    </p>
                  </div>
                </div>
                {total > 0 && (
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
