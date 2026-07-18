import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Pencil,
  Shuffle,
  Copy,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react";
import db, { uid, now, type Meal, type MealPlan } from "../db";
import { todayStr, addDays } from "../dates";
import { getHouseholdRealmId } from "../household";
import { noteListAddition } from "../notify";
import { PageHeader, Button, Chip } from "../components/ui";

// Meals and Lists stay independent: "add to list" copies ingredient names
// into ordinary list items (topping up quantities where they exist) and
// that's the end of the relationship.

const MEAL_EMOJI = ["🍝", "🌮", "🍛", "🍕", "🥗", "🍲", "🍳", "🍤", "🍜", "🐟"];

// Suggestions stick to chicken and seafood — the only proteins on the
// menu in this household.
const SUGGESTED_MEALS: { name: string; emoji: string; ingredients: string[] }[] = [
  {
    name: "Chicken pasta",
    emoji: "🍝",
    ingredients: ["Penne", "Chicken breast", "Passata", "Onion", "Garlic", "Parmesan"],
  },
  {
    name: "Fish tacos",
    emoji: "🌮",
    ingredients: ["Taco shells", "White fish fillets", "Slaw mix", "Lime", "Sour cream"],
  },
  {
    name: "Chicken stir fry",
    emoji: "🍜",
    ingredients: ["Chicken breast", "Stir fry veg", "Noodles", "Soy sauce", "Garlic"],
  },
  {
    name: "Chicken pizza",
    emoji: "🍕",
    ingredients: ["Pizza bases", "Passata", "Mozzarella", "Chicken breast", "Mushrooms"],
  },
  {
    name: "Chicken salad",
    emoji: "🥗",
    ingredients: ["Chicken breast", "Lettuce", "Cucumber", "Tomato", "Feta"],
  },
  {
    name: "Chicken curry",
    emoji: "🍛",
    ingredients: ["Chicken thighs", "Curry paste", "Coconut milk", "Rice", "Onion"],
  },
  {
    name: "Salmon & veg",
    emoji: "🐟",
    ingredients: ["Salmon fillets", "Baby potatoes", "Broccoli", "Lemon"],
  },
  {
    name: "Garlic prawn pasta",
    emoji: "🍤",
    ingredients: ["Spaghetti", "Prawns", "Garlic", "Cream", "Parsley", "Parmesan"],
  },
];

const QUICK_ENTRIES = [
  { title: "🍱 Leftovers" },
  { title: "🥡 Takeaway" },
  { title: "🍽️ Eating out" },
];

const dayLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
};

const norm = (s: string) => s.trim().toLowerCase();

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer"
            className="break-all text-accent underline underline-offset-2"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

// Copy ingredients into a list. Anything already on it (unticked, matched
// case-insensitively) gets its quantity bumped instead of a duplicate row.
async function addIngredientsToList(listId: string, ingredients: string[]) {
  const list = await db.lists.get(listId);
  const existing = await db.items.where("listId").equals(listId).toArray();
  const open = new Map(
    existing.filter((i) => !i.done).map((i) => [norm(i.text), i])
  );
  let added = 0;
  let bumped = 0;
  for (const ing of ingredients) {
    const key = norm(ing);
    if (!key) continue;
    const match = open.get(key);
    if (match) {
      await db.items.update(match.id, {
        qty: (match.qty ?? 1) + 1,
        updatedAt: now(),
      });
      bumped++;
      continue;
    }
    const item = {
      id: uid(),
      listId,
      text: ing.trim(),
      done: false,
      realmId: list?.realmId,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.items.add(item);
    open.set(key, item);
    added++;
  }
  return { added, bumped };
}

function AddToListPanel({
  ingredients,
  onClose,
}: {
  ingredients: string[];
  onClose: () => void;
}) {
  const lists = useLiveQuery(() => db.lists.orderBy("createdAt").toArray(), [], []);
  const staples = useLiveQuery(() => db.staples.toArray(), [], []);
  const [message, setMessage] = useState("");

  const stapleKeys = new Set(staples.map((s) => norm(s.name)));
  const active = ingredients.filter((i) => !stapleKeys.has(norm(i)));

  const toggleStaple = async (ing: string) => {
    const existing = staples.find((s) => norm(s.name) === norm(ing));
    if (existing) await db.staples.delete(existing.id);
    else
      await db.staples.add({
        id: uid(),
        name: ing.trim(),
        realmId: await getHouseholdRealmId(),
        createdAt: now(),
        updatedAt: now(),
      });
  };

  const send = async (listId: string, listName: string) => {
    const { added, bumped } = await addIngredientsToList(listId, active);
    if (added + bumped > 0) {
      const [list, householdId] = await Promise.all([
        db.lists.get(listId),
        getHouseholdRealmId(),
      ]);
      if (householdId && list?.realmId === householdId)
        noteListAddition(listId, listName, added + bumped);
    }
    setMessage(
      `Added ${added} ${added === 1 ? "item" : "items"} to ${listName}` +
        (bumped > 0 ? ` (${bumped} topped up)` : "")
    );
  };

  const sendToNew = async () => {
    const id = uid();
    await db.lists.add({
      id,
      name: "Shopping",
      emoji: "🛒",
      createdAt: now(),
      updatedAt: now(),
    });
    await send(id, "Shopping");
  };

  return (
    <div className="rounded-xl border border-dashed border-line p-3.5">
      {message ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{message} ✓</p>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Going on the list — tap anything you always have to skip it (now
            and every time)
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ingredients.map((ing) => {
              const isStaple = stapleKeys.has(norm(ing));
              return (
                <button
                  key={ing}
                  onClick={() => toggleStaple(ing)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    isStaple
                      ? "bg-surface-2 text-muted line-through opacity-60"
                      : "bg-accent-soft text-accent"
                  }`}
                >
                  {ing}
                </button>
              );
            })}
          </div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Add {active.length} {active.length === 1 ? "ingredient" : "ingredients"} to…
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lists.map((l) => (
              <Chip key={l.id} active={false} onClick={() => send(l.id, l.name)}>
                {l.emoji} {l.name}
              </Chip>
            ))}
            <Chip active={false} onClick={sendToNew}>
              + New shopping list
            </Chip>
            <button
              onClick={onClose}
              className="ml-auto p-1 text-muted hover:text-ink"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// One form for creating and editing meals.
function MealForm({
  initial,
  onDone,
}: {
  initial?: Meal;
  onDone?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🍝");
  const [ingredients, setIngredients] = useState<string[]>(
    initial?.ingredients ?? []
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [ingInput, setIngInput] = useState("");

  const addIngredient = () => {
    const n = ingInput.trim();
    if (!n) return;
    setIngredients([...ingredients, n]);
    setIngInput("");
  };

  const save = async () => {
    if (!name.trim()) return;
    const fields = {
      name: name.trim(),
      emoji,
      ingredients,
      note: note.trim() || undefined,
      updatedAt: now(),
    };
    if (initial) {
      await db.meals.update(initial.id, fields);
      onDone?.();
    } else {
      await db.meals.add({
        id: uid(),
        ...fields,
        realmId: await getHouseholdRealmId(),
        createdAt: now(),
      });
      setName("");
      setIngredients([]);
      setNote("");
    }
  };

  return (
    <div
      className={`space-y-2.5 rounded-xl border p-3.5 ${
        initial ? "border-accent-soft bg-surface" : "border-dashed border-line"
      }`}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Meal name — e.g. Fish pie"
        className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="flex flex-wrap gap-1.5">
        {MEAL_EMOJI.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            aria-label={`Choose ${e}`}
            className={`rounded-lg p-1 text-base transition-colors ${
              emoji === e ? "bg-accent-soft ring-1 ring-accent/50" : "hover:bg-surface-2"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {ingredients.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ingredients.map((ing, i) => (
            <span
              key={`${ing}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
            >
              {ing}
              <button
                onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}
                aria-label={`Remove ${ing}`}
                className="text-muted hover:text-red-500"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={ingInput}
        onChange={(e) => setIngInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && addIngredient()}
        placeholder="Add ingredient, press Enter"
        className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Recipe link, method, cook time — optional"
        className="w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-bg"
        >
          {initial ? "Save" : "Add meal"}
        </button>
        {initial && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function AddMealForm({ existing }: { existing: string[] }) {
  const have = new Set(existing.map(norm));
  const suggestions = SUGGESTED_MEALS.filter((s) => !have.has(norm(s.name)));

  const addSuggested = async (s: (typeof SUGGESTED_MEALS)[number]) =>
    db.meals.add({
      id: uid(),
      ...s,
      realmId: await getHouseholdRealmId(),
      createdAt: now(),
      updatedAt: now(),
    });

  return (
    <div className="space-y-2.5">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Chip key={s.name} active={false} onClick={() => addSuggested(s)}>
              + {s.emoji} {s.name}
            </Chip>
          ))}
        </div>
      )}
      <MealForm />
    </div>
  );
}

function DayRow({
  date,
  plans,
  meals,
}: {
  date: string;
  plans: MealPlan[];
  meals: Meal[];
}) {
  const [picking, setPicking] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const isToday = date === todayStr();
  const mealById = new Map(meals.map((m) => [m.id, m]));

  const assign = async (mealId: string, title?: string) => {
    await db.mealPlans.add({
      id: uid(),
      date,
      mealId,
      title,
      realmId: await getHouseholdRealmId(),
      createdAt: now(),
      updatedAt: now(),
    });
    setPicking(false);
  };

  const viewing = viewId
    ? mealById.get(plans.find((p) => p.id === viewId)?.mealId ?? "")
    : undefined;

  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={`w-14 shrink-0 text-xs font-medium ${
            isToday ? "text-accent" : "text-muted"
          }`}
        >
          {isToday ? "Today" : dayLabel(date)}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {plans.map((p) => {
            const m = mealById.get(p.mealId);
            return (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
              >
                <button
                  onClick={() =>
                    m ? setViewId(viewId === p.id ? null : p.id) : undefined
                  }
                  className={m ? "hover:text-accent" : "cursor-default"}
                >
                  {m ? `${m.emoji} ${m.name}` : (p.title ?? "…")}
                </button>
                <button
                  onClick={() => {
                    if (viewId === p.id) setViewId(null);
                    db.mealPlans.delete(p.id);
                  }}
                  aria-label={`Remove ${m?.name ?? p.title ?? "meal"} from ${date}`}
                  className="text-muted hover:text-red-500"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          {plans.length === 0 && !picking && (
            <span className="text-xs text-muted">—</span>
          )}
        </div>
        <button
          onClick={() => setPicking(!picking)}
          aria-label={`Plan a meal for ${dayLabel(date)}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
        >
          <Plus size={15} />
        </button>
      </div>
      {viewing && (
        <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
          {viewing.ingredients.length > 0 && (
            <p>{viewing.ingredients.join(" · ")}</p>
          )}
          {viewing.note && (
            <p className="mt-1 whitespace-pre-wrap">
              <Linkified text={viewing.note} />
            </p>
          )}
          {viewing.ingredients.length === 0 && !viewing.note && (
            <p>No details on this meal yet.</p>
          )}
        </div>
      )}
      {picking && (
        <div className="mt-2 space-y-1.5 border-t border-line pt-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ENTRIES.map((q) => (
              <Chip
                key={q.title}
                active={false}
                onClick={() => assign("", q.title)}
              >
                {q.title}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {meals.length === 0 ? (
              <p className="text-xs text-muted">
                No meals yet — add some in the library below first.
              </p>
            ) : (
              meals.map((m) => (
                <Chip key={m.id} active={false} onClick={() => assign(m.id)}>
                  {m.emoji} {m.name}
                </Chip>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Meals() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [listPanel, setListPanel] = useState<null | { ingredients: string[] }>(null);

  const meals = useLiveQuery(() => db.meals.orderBy("createdAt").toArray(), [], []);
  const monday = addDays(
    todayStr(),
    -((new Date().getDay() + 6) % 7) + weekOffset * 7
  );
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const plans = useLiveQuery(
    () =>
      db.mealPlans
        .where("date")
        .between(week[0], week[6], true, true)
        .toArray(),
    [week[0], week[6]],
    [] as MealPlan[]
  );

  const today = todayStr();
  const mealById = new Map(meals.map((m) => [m.id, m]));

  // shopping export only covers days that haven't happened yet
  const exportPlans = plans.filter((p) => p.date >= today);
  const weekIngredients = [
    ...new Set(
      exportPlans
        .flatMap((p) => mealById.get(p.mealId)?.ingredients ?? [])
        .map((i) => i.trim())
        .filter(Boolean)
    ),
  ];
  const hasPastPlans = plans.some((p) => p.date < today);

  const fillableDays = week.filter(
    (d) => d >= today && !plans.some((p) => p.date === d)
  );

  const fillWeek = async () => {
    const recent = new Set(
      (
        await db.mealPlans
          .where("date")
          .between(addDays(week[0], -14), week[6], true, true)
          .toArray()
      ).map((p) => p.mealId)
    );
    const realmId = await getHouseholdRealmId();
    let pool = meals.filter((m) => !recent.has(m.id));
    for (const d of fillableDays) {
      if (pool.length === 0) pool = meals.slice(); // small library — allow repeats
      if (pool.length === 0) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      pool = pool.filter((m) => m.id !== pick.id);
      await db.mealPlans.add({
        id: uid(),
        date: d,
        mealId: pick.id,
        realmId,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  };

  const copyLastWeek = async () => {
    const prev = await db.mealPlans
      .where("date")
      .between(addDays(week[0], -7), addDays(week[6], -7), true, true)
      .toArray();
    const realmId = await getHouseholdRealmId();
    for (const p of prev) {
      const target = addDays(p.date, 7);
      if (target < today) continue;
      if (plans.some((x) => x.date === target)) continue;
      await db.mealPlans.add({
        id: uid(),
        date: target,
        mealId: p.mealId,
        title: p.title,
        realmId,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  };

  const weekTitle =
    weekOffset === 0
      ? "This week"
      : weekOffset === 1
        ? "Next week"
        : `${dayLabel(week[0])} – ${dayLabel(week[6])}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Meals" subtitle="What's for dinner, sorted." />

      {/* Week planner */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {weekTitle}
          </p>
          <div className="flex items-center gap-1">
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="rounded-full px-3 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                This week
              </button>
            )}
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              aria-label="Previous week"
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              aria-label="Next week"
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {week.map((d) => (
            <DayRow
              key={d}
              date={d}
              plans={plans
                .filter((p) => p.date === d)
                .sort((a, b) => a.createdAt - b.createdAt)}
              meals={meals}
            />
          ))}
        </div>

        {fillableDays.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {meals.length > 0 && (
              <Button variant="ghost" onClick={fillWeek}>
                <span className="flex items-center gap-1.5">
                  <Shuffle size={14} /> Fill my week
                </span>
              </Button>
            )}
            <Button variant="ghost" onClick={copyLastWeek}>
              <span className="flex items-center gap-1.5">
                <Copy size={14} /> Copy last week
              </span>
            </Button>
          </div>
        )}

        {weekIngredients.length > 0 && !listPanel && (
          <div className="mt-2">
            <Button
              onClick={() => setListPanel({ ingredients: weekIngredients })}
            >
              <span className="flex items-center gap-1.5">
                <ShoppingBasket size={15} /> Add week's ingredients to a list
              </span>
            </Button>
            {hasPastPlans && (
              <p className="mt-1.5 text-xs text-muted">
                Only today onward — earlier days are done and dusted.
              </p>
            )}
          </div>
        )}
      </div>

      {listPanel && (
        <AddToListPanel
          ingredients={listPanel.ingredients}
          onClose={() => setListPanel(null)}
        />
      )}

      {/* Meal library */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Meal library
          </p>
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
          >
            <Pencil size={12} /> {editing ? "Done" : "Edit"}
          </button>
        </div>
        <div className="space-y-2">
          {meals.length === 0 && !editing && (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
              <div className="mb-3 rounded-2xl bg-accent-soft p-3 text-accent">
                <UtensilsCrossed size={24} strokeWidth={1.75} />
              </div>
              <p className="text-sm text-muted">
                Build a library of meals and their ingredients, plan the week
                above, then send everything to a shopping list in one tap.
              </p>
              <div className="mt-4">
                <Button onClick={() => setEditing(true)}>Add meals</Button>
              </div>
            </div>
          )}
          {meals.map((m) =>
            editingMealId === m.id ? (
              <MealForm
                key={m.id}
                initial={m}
                onDone={() => setEditingMealId(null)}
              />
            ) : (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
              >
                <span className="text-lg">{m.emoji}</span>
                <button
                  onClick={() => setEditingMealId(m.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm">
                    {m.name}
                    {m.note && <span className="ml-1.5 text-xs text-muted">📄</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.ingredients.length > 0
                      ? m.ingredients.join(" · ")
                      : "No ingredients listed"}
                  </p>
                </button>
                {editing ? (
                  <button
                    onClick={async () => {
                      await db.mealPlans.where("mealId").equals(m.id).delete();
                      await db.meals.delete(m.id);
                    }}
                    aria-label={`Delete ${m.name}`}
                    className="p-1 text-muted hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                ) : (
                  m.ingredients.length > 0 && (
                    <button
                      onClick={() => setListPanel({ ingredients: m.ingredients })}
                      aria-label={`Add ${m.name} ingredients to a list`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
                    >
                      <ShoppingBasket size={15} />
                    </button>
                  )
                )}
              </div>
            )
          )}
          {editing && <AddMealForm existing={meals.map((m) => m.name)} />}
        </div>
      </div>
    </div>
  );
}
