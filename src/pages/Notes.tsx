import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, X, Users, StickyNote } from "lucide-react";
import db, { uid, now, type Note } from "../db";
import { getHouseholdRealmId } from "../household";
import { PageHeader, Card, Button } from "../components/ui";

// Quick household reference jottings — wifi password, car rego, gift
// ideas. New notes are shared with the household by default (when one
// exists); each note can be flipped private with the people toggle.

const firstLine = (text: string) => text.split("\n")[0].trim() || "Untitled";
const rest = (text: string) => text.split("\n").slice(1).join("\n").trim();

// The note everyone means to write and never does.
const EMERGENCY_TEMPLATE = `🆘 Emergency info
Emergency contacts:
Doctor / medical centre:
Medicare & health insurance:
Home & car policy numbers:
Plumber:
Electrician:
Vet:`;

function NoteCard({
  note,
  householdId,
}: {
  note: Note;
  householdId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const shared = !!householdId && note.realmId === householdId;

  const save = async () => {
    const t = draft.trim();
    if (!t) return;
    await db.notes.update(note.id, { text: t, updatedAt: now() });
    setEditing(false);
  };

  const toggleShare = () =>
    db.notes.update(note.id, {
      realmId: shared ? db.cloud.currentUserId : householdId,
      updatedAt: now(),
    });

  if (editing)
    return (
      <Card className="border-accent-soft">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(Math.max(draft.split("\n").length, 3), 12)}
          className="w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-2.5 flex gap-2">
          <Button onClick={save}>Save</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(note.text);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </Card>
    );

  return (
    <Card className="group">
      <div className="flex items-start gap-3">
        <button
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-medium">{firstLine(note.text)}</p>
          {rest(note.text) && (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">
              {rest(note.text)}
            </p>
          )}
        </button>
        {householdId && (
          <button
            onClick={toggleShare}
            aria-label={
              shared
                ? `Make ${firstLine(note.text)} private`
                : `Share ${firstLine(note.text)} with household`
            }
            title={shared ? "Shared with household" : "Private"}
            className={`shrink-0 rounded-full p-1.5 transition-colors ${
              shared
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Users size={15} />
          </button>
        )}
        <button
          onClick={() => db.notes.delete(note.id)}
          aria-label={`Delete ${firstLine(note.text)}`}
          className="shrink-0 p-1.5 text-muted opacity-60 transition-opacity hover:text-red-500 group-hover:opacity-100"
        >
          <X size={15} />
        </button>
      </div>
    </Card>
  );
}

export default function Notes() {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const notes = useLiveQuery(
    () => db.notes.orderBy("updatedAt").reverse().toArray(),
    [],
    []
  );
  const householdId = useLiveQuery(() => getHouseholdRealmId(), [], undefined);

  const create = async () => {
    const t = draft.trim();
    if (!t) return;
    await db.notes.add({
      id: uid(),
      text: t,
      realmId: householdId, // shared by default when a household exists
      createdAt: now(),
      updatedAt: now(),
    });
    setDraft("");
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notes"
        subtitle="The little things you both need to remember."
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

      {creating && (
        <Card className="border-accent-soft">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder={"First line is the title\nthen anything — wifi password, car rego, gift ideas…"}
            className="w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button onClick={create}>Add note</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            {!notes.some((n) => n.text.startsWith("🆘 Emergency info")) &&
              !draft && (
                <button
                  onClick={() => setDraft(EMERGENCY_TEMPLATE)}
                  className="text-xs text-muted underline-offset-2 hover:underline"
                >
                  Start from the 🆘 emergency info template
                </button>
              )}
          </div>
          {householdId && (
            <p className="mt-2 text-xs text-muted">
              New notes are shared with the household — flip any note private
              with its people button.
            </p>
          )}
        </Card>
      )}

      {notes.length === 0 && !creating && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <div className="mb-4 rounded-2xl bg-accent-soft p-4 text-accent">
            <StickyNote size={30} strokeWidth={1.75} />
          </div>
          <p className="font-medium">No notes yet</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            The stuff that isn't a task: wifi passwords, the plumber's number,
            gift ideas. Tap New to jot the first one.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} householdId={householdId} />
        ))}
      </div>
    </div>
  );
}
