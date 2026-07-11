import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Pencil,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react";
import db, { uid, now, type Meal, type MealPlan } from "../db";
import { todayStr, addDays } from "../dates";
import { PageHeader, Button, Chip } from "../components/ui";

// Meals and Lists stay independent: "add to list" copies ingredient names
// into ordinary list items (skipping ones already there) and that's the end
// of the relationship — changes on either side never touch the other.

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

const dayLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
};

// Copy ingredients into a list, skipping (case-insensitively) anything
// already on it and unticked. Returns how many were added vs skipped.
async function addIngredientsToList(listId: string, ingredients: string[]) {
  const existing = await db.items.where("listId").equals(listId).toArray();
  const have = new Set(
    existing.filter((i) => !i.done).map((i) => i.text.trim().toLowerCase())
  );
  let added = 0;
  let skipped = 0;
  for (const ing of ingredients) {
    const key = ing.trim().toLowerCase();
    if (!key) continue;
    if (have.has(key)) {
      skipped++;
      continue;
    }
    have.add(key);
    await db.items.add({
      id: uid(),
      listId,
      text: ing.trim(),
      done: false,
      createdAt: now(),
      updatedAt: now(),
    });
    added++;
  }
  return { added, skipped };
}

function AddToListPanel({
  ingredients,
  onClose,
}: {
  ingredients: string[];
  onClose: () => void;
}) {
  const lists = useLiveQuery(() => db.lists.orderBy("createdAt").toArray(), [], []);
  const [message, setMessage] = useState("");

  const send = async (listId: string, listName: string) => {
    const { added, skipped } = await addIngredientsToList(listId, ingredients);
    setMessage(
      `Added ${added} ${added === 1 ? "item" : "items"} to ${listName}` +
        (skipped > 0 ? ` (${skipped} already there)` : "")
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
            Add {ingredients.length} {ingredients.length === 1 ? "ingredient" : "ingredients"} to…
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

function AddMealForm({ existing }: { existing: string[] }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍝");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingInput, setIngInput] = useState("");

  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  const suggestions = SUGGESTED_MEALS.filter((s) => !have.has(s.name.toLowerCase()));

  const addIngredient = () => {
    const n = ingInput.trim();
    if (!n) return;
    setIngredients([...ingredients, n]);
    setIngInput("");
  };

  const create = async (n: string, e: string, ings: string[]) => {
    if (!n.trim()) return;
    await db.meals.add({
      id: uid(),
      name: n.trim(),
      emoji: e,
      ingredients: ings,
      createdAt: now(),
      updatedAt: now(),
    });
    setName("");
    setIngredients([]);
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3.5">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Chip
              key={s.name}
              active={false}
              onClick={() => create(s.name, s.emoji, s.ingredients)}
            >
              + {s.emoji} {s.name}
            </Chip>
          ))}
        </div>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Or your own — e.g. Fish pie"
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
      <div className="flex gap-2">
        <input
          value={ingInput}
          onChange={(e) => setIngInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addIngredient()}
          placeholder="Add ingredient, press Enter"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          onClick={() => create(name, emoji, ingredients)}
          className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-bg"
        >
          Add meal
        </button>
      </div>
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
  const isToday = date === todayStr();
  const mealById = new Map(meals.map((m) => [m.id, m]));

  const assign = async (mealId: string) => {
    await db.mealPlans.add({
      id: uid(),
      date,
      mealId,
      createdAt: now(),
      updatedAt: now(),
    });
    setPicking(false);
  };

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
                {m ? `${m.emoji} ${m.name}` : "…"}
                <button
                  onClick={() => db.mealPlans.delete(p.id)}
                  aria-label={`Remove ${m?.name ?? "meal"} from ${date}`}
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
      {picking && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
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
      )}
    </div>
  );
}

export default function Meals() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState(false);
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

  const mealById = new Map(meals.map((m) => [m.id, m]));
  const weekIngredients = [
    ...new Set(
      plans
        .flatMap((p) => mealById.get(p.mealId)?.ingredients ?? [])
        .map((i) => i.trim())
        .filter(Boolean)
    ),
  ];

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
        {weekIngredients.length > 0 && !listPanel && (
          <div className="mt-2">
            <Button
              onClick={() => setListPanel({ ingredients: weekIngredients })}
            >
              <span className="flex items-center gap-1.5">
                <ShoppingBasket size={15} /> Add week's ingredients to a list
              </span>
            </Button>
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
          {meals.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
            >
              <span className="text-lg">{m.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{m.name}</p>
                <p className="truncate text-xs text-muted">
                  {m.ingredients.length > 0
                    ? m.ingredients.join(" · ")
                    : "No ingredients listed"}
                </p>
              </div>
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
          ))}
          {editing && <AddMealForm existing={meals.map((m) => m.name)} />}
        </div>
      </div>
    </div>
  );
}
