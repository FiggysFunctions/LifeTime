import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Pencil,
  PiggyBank,
} from "lucide-react";
import db, {
  uid,
  now,
  type Category,
  type Expense,
  type Bill,
  type BillFrequency,
} from "../db";
import { toDateStr, todayStr, addDays, dueLabel, nextOccurrence } from "../dates";
import { fmtMoney, parseAmount } from "../money";
import { useSettings } from "../settings";
import { PageHeader, Card, Button, Chip } from "../components/ui";

const CATEGORY_EMOJI = ["🛒", "🍔", "🚗", "🏠", "💡", "🎉", "👕", "💊", "🎁", "📦"];

const STARTERS = [
  { name: "Groceries", emoji: "🛒" },
  { name: "Eating out", emoji: "🍔" },
  { name: "Transport", emoji: "🚗" },
  { name: "Bills", emoji: "💡" },
  { name: "Fun", emoji: "🎉" },
  { name: "Other", emoji: "📦" },
];

const seedStarters = () => {
  const t = now();
  // stagger createdAt so orderBy("createdAt") keeps the intended order
  return db.categories.bulkAdd(
    STARTERS.map((s, i) => ({
      id: uid(),
      ...s,
      budget: null,
      createdAt: t + i,
      updatedAt: t + i,
    }))
  );
};

// ---- bills & upcoming ----
const BILL_EMOJI = ["🏠", "⚡", "💧", "📱", "🌐", "📺", "🚗", "💳", "🎵", "🛡️"];

const FREQS: { id: BillFrequency; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "yearly", label: "Yearly" },
  { id: "once", label: "One-off" },
];

const FREQ_LABEL: Record<BillFrequency, string> = {
  once: "One-off",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const monthlyEquiv = (b: Bill) =>
  b.frequency === "weekly"
    ? (b.amount * 52) / 12
    : b.frequency === "monthly"
      ? b.amount
      : b.frequency === "yearly"
        ? b.amount / 12
        : 0;

// Payments land in the bill's chosen category, or an auto-created "Bills".
async function billCategoryId(bill: Bill, categories: Category[]) {
  if (bill.categoryId && categories.some((c) => c.id === bill.categoryId))
    return bill.categoryId;
  const existing = categories.find(
    (c) => c.name.trim().toLowerCase() === "bills"
  );
  if (existing) return existing.id;
  const id = uid();
  await db.categories.add({
    id,
    name: "Bills",
    emoji: "💡",
    budget: null,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

// amount null = skipped: roll the bill forward without logging an expense.
async function settleBill(
  bill: Bill,
  amount: number | null,
  categories: Category[]
) {
  if (amount !== null) {
    const categoryId = await billCategoryId(bill, categories);
    await db.expenses.add({
      id: uid(),
      categoryId,
      amount,
      note: bill.name,
      date: todayStr(),
      createdAt: now(),
      updatedAt: now(),
    });
  }
  if (bill.frequency === "once") return db.bills.delete(bill.id);
  return db.bills.update(bill.id, {
    due: nextOccurrence(bill.due, bill.frequency),
    updatedAt: now(),
  });
}

function UpcomingBillRow({
  bill,
  categories,
}: {
  bill: Bill;
  categories: Category[];
}) {
  const { settings } = useSettings();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const overdue = bill.due < todayStr();

  const markPaid = async () => {
    const n = amount.trim() === "" ? bill.amount : parseAmount(amount);
    if (n === null) return;
    await settleBill(bill, n, categories);
    setPaying(false);
  };

  const skip = async () => {
    await settleBill(bill, null, categories);
    setPaying(false);
  };

  return (
    <li className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">{bill.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{bill.name}</p>
          <p className="text-xs">
            <span
              className={
                overdue
                  ? "font-medium text-red-500 dark:text-red-400"
                  : "text-muted"
              }
            >
              {dueLabel(bill.due)}
            </span>
            <span className="text-muted"> · {FREQ_LABEL[bill.frequency]}</span>
          </p>
        </div>
        <span className="text-sm font-medium">
          {fmtMoney(bill.amount, settings.currency)}
        </span>
        <button
          onClick={() => {
            setPaying(!paying);
            setAmount(String(bill.amount));
          }}
          className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent"
        >
          Paid?
        </button>
      </div>
      {paying && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <div className="flex items-center rounded-lg border border-line bg-bg focus-within:border-accent">
            <span className="pl-2 text-xs text-muted">{settings.currency}</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              aria-label={`Amount paid for ${bill.name}`}
              className="w-20 bg-transparent px-1.5 py-1.5 text-xs outline-none"
            />
          </div>
          <button
            onClick={markPaid}
            className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-bg"
          >
            Log payment
          </button>
          <button
            onClick={skip}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Skip this one
          </button>
          <button
            onClick={() => setPaying(false)}
            aria-label="Cancel"
            className="ml-auto p-1 text-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </li>
  );
}

function UpcomingSection({
  bills,
  categories,
}: {
  bills: Bill[];
  categories: Category[];
}) {
  const { settings } = useSettings();
  if (bills.length === 0) return null;
  const horizon = addDays(todayStr(), 30);
  const upcoming = bills
    .filter((b) => b.due <= horizon)
    .sort((a, b) => a.due.localeCompare(b.due) || a.createdAt - b.createdAt);
  const total = upcoming.reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Upcoming · 30 days
        </p>
        {upcoming.length > 0 && (
          <p className="text-xs font-medium text-muted">
            {fmtMoney(total, settings.currency)}
          </p>
        )}
      </div>
      {upcoming.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">
          Nothing due in the next 30 days.
        </p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((b) => (
            <UpcomingBillRow key={b.id} bill={b} categories={categories} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BillEditRow({ bill }: { bill: Bill }) {
  const { settings } = useSettings();
  const [amount, setAmount] = useState(String(bill.amount));

  const saveAmount = () => {
    const n = parseAmount(amount);
    if (n !== null) db.bills.update(bill.id, { amount: n, updatedAt: now() });
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <span className="text-lg">{bill.emoji}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{bill.name}</span>
      <div className="flex items-center rounded-lg border border-line bg-bg focus-within:border-accent">
        <span className="pl-2 text-xs text-muted">{settings.currency}</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={saveAmount}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          aria-label={`Amount for ${bill.name}`}
          className="w-16 bg-transparent px-1.5 py-1.5 text-xs outline-none"
        />
      </div>
      <input
        type="date"
        value={bill.due}
        onChange={(e) =>
          e.target.value &&
          db.bills.update(bill.id, { due: e.target.value, updatedAt: now() })
        }
        aria-label={`Next due date for ${bill.name}`}
        className="rounded-lg border border-line bg-bg px-1.5 py-1.5 text-xs text-muted outline-none focus:border-accent"
      />
      <button
        onClick={() => db.bills.delete(bill.id)}
        aria-label={`Delete ${bill.name}`}
        className="p-1 text-muted hover:text-red-500"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function AddBillForm({ categories }: { categories: Category[] }) {
  const { settings } = useSettings();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<BillFrequency>("monthly");
  const [due, setDue] = useState(todayStr());
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const create = async () => {
    const n = parseAmount(amount);
    if (!name.trim() || n === null || !due) return;
    await db.bills.add({
      id: uid(),
      name: name.trim(),
      emoji,
      amount: n,
      categoryId,
      frequency,
      due,
      createdAt: now(),
      updatedAt: now(),
    });
    setName("");
    setAmount("");
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3.5">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New bill — e.g. Rent, Netflix"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex shrink-0 items-center rounded-xl border border-line bg-bg focus-within:border-accent">
          <span className="pl-2.5 text-xs text-muted">{settings.currency}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            aria-label="Bill amount"
            className="w-16 bg-transparent px-1.5 py-2.5 text-sm outline-none placeholder:text-muted"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BILL_EMOJI.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            aria-label={`Choose ${e}`}
            className={`rounded-lg p-1 text-base transition-colors ${
              emoji === e
                ? "bg-accent-soft ring-1 ring-accent/50"
                : "hover:bg-surface-2"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FREQS.map((f) => (
          <Chip
            key={f.id}
            active={frequency === f.id}
            onClick={() => setFrequency(f.id)}
          >
            {f.label}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">
          {frequency === "once" ? "Due" : "Next due"}
        </span>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
          className="rounded-xl border border-line bg-bg px-2 py-2 text-xs text-muted outline-none focus:border-accent"
        />
        <button
          onClick={create}
          className="ml-auto rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white dark:text-bg"
        >
          Add bill
        </button>
      </div>
      {categories.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted">
            Log payments to (optional — otherwise a "Bills" category is used)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={categoryId === c.id}
                onClick={() =>
                  setCategoryId(categoryId === c.id ? null : c.id)
                }
              >
                {c.emoji} {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BillsSection({
  bills,
  categories,
}: {
  bills: Bill[];
  categories: Category[];
}) {
  const { settings } = useSettings();
  const [editing, setEditing] = useState(false);
  const perMonth = bills.reduce((s, b) => s + monthlyEquiv(b), 0);
  const sorted = [...bills].sort(
    (a, b) => a.due.localeCompare(b.due) || a.createdAt - b.createdAt
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Bills & subscriptions
        </p>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
        >
          <Pencil size={12} /> {editing ? "Done" : "Edit"}
        </button>
      </div>
      {perMonth > 0 && (
        <p className="mb-2 px-1 text-xs text-muted">
          ≈ {fmtMoney(perMonth, settings.currency)} a month in regular bills
        </p>
      )}
      <div className="space-y-2">
        {bills.length === 0 && !editing && (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">
            Rent, energy, phone, subscriptions… tap Edit to add your first
            bill and see everything that's coming up.
          </p>
        )}
        {editing ? (
          <>
            {sorted.map((b) => (
              <BillEditRow key={b.id} bill={b} />
            ))}
            <AddBillForm categories={categories} />
          </>
        ) : (
          sorted.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
            >
              <span className="text-lg">{b.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{b.name}</p>
                <p className="truncate text-xs text-muted">
                  {FREQ_LABEL[b.frequency]} · next {dueLabel(b.due)}
                </p>
              </div>
              <span className="text-sm font-medium">
                {fmtMoney(b.amount, settings.currency)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NewExpenseForm({
  categories,
  onDone,
}: {
  categories: Category[];
  onDone: () => void;
}) {
  const { settings } = useSettings();
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());

  const create = async () => {
    const n = parseAmount(amount);
    if (n === null || !categoryId || !date) return;
    await db.expenses.add({
      id: uid(),
      categoryId,
      amount: n,
      note: note.trim(),
      date,
      createdAt: now(),
      updatedAt: now(),
    });
    onDone();
  };

  return (
    <Card className="border-accent-soft space-y-3">
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-bg focus-within:border-accent">
          <span className="pl-3.5 text-sm font-semibold text-muted">
            {settings.currency}
          </span>
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="0.00"
            inputMode="decimal"
            className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted"
          />
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Expense date"
          className="shrink-0 rounded-xl border border-line bg-bg px-2 py-2.5 text-sm text-muted outline-none focus:border-accent focus:text-ink"
        />
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
        placeholder="What was it? (optional)"
        className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryId === c.id
                ? "bg-accent-soft text-accent ring-1 ring-accent/50"
                : "bg-surface-2 text-muted hover:text-ink"
            }`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={create}>Add expense</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function CategoryEditRow({ category }: { category: Category }) {
  const { settings } = useSettings();
  const [budget, setBudget] = useState(
    category.budget === null ? "" : String(category.budget)
  );
  const [confirming, setConfirming] = useState(false);

  const saveBudget = () => {
    const n = budget.trim() === "" ? null : parseAmount(budget);
    if (budget.trim() !== "" && n === null) return; // ignore junk input
    db.categories.update(category.id, { budget: n, updatedAt: now() });
  };

  const remove = async () => {
    await db.expenses.where("categoryId").equals(category.id).delete();
    await db.categories.delete(category.id);
  };

  if (confirming)
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-red-400/40 px-3.5 py-3">
        <p className="text-sm">
          Delete <strong>{category.name}</strong> and its expenses?
        </p>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="danger" className="!px-3 !py-1.5 text-xs" onClick={remove}>
            Delete
          </Button>
          <Button
            variant="ghost"
            className="!px-3 !py-1.5 text-xs"
            onClick={() => setConfirming(false)}
          >
            Keep
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <span className="text-lg">{category.emoji}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
      <div className="flex items-center rounded-lg border border-line bg-bg focus-within:border-accent">
        <span className="pl-2 text-xs text-muted">{settings.currency}</span>
        <input
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          onBlur={saveBudget}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="No budget"
          inputMode="decimal"
          aria-label={`Monthly budget for ${category.name}`}
          className="w-20 bg-transparent px-1.5 py-1.5 text-xs outline-none placeholder:text-muted"
        />
      </div>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${category.name}`}
        className="p-1 text-muted transition-colors hover:text-red-500"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function AddCategoryForm() {
  const { settings } = useSettings();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛒");
  const [budget, setBudget] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    await db.categories.add({
      id: uid(),
      name: name.trim(),
      emoji,
      budget: budget.trim() === "" ? null : parseAmount(budget),
      createdAt: now(),
      updatedAt: now(),
    });
    setName("");
    setBudget("");
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3.5">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New category — e.g. Pets"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex shrink-0 items-center rounded-xl border border-line bg-bg focus-within:border-accent">
          <span className="pl-2.5 text-xs text-muted">{settings.currency}</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="Budget"
            inputMode="decimal"
            aria-label="Monthly budget (optional)"
            className="w-16 bg-transparent px-1.5 py-2.5 text-sm outline-none placeholder:text-muted"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_EMOJI.map((e) => (
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
        <button
          onClick={create}
          className="ml-auto rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-bg"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function TrendChart({
  months,
  symbol,
}: {
  months: { key: string; label: string; total: number }[];
  symbol: string;
}) {
  const [sel, setSel] = useState(months.length - 1);
  const max = Math.max(...months.map((m) => m.total), 1);
  const selected = months[sel];

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-medium">Last 6 months</p>
        <p className="text-xs text-muted">
          {selected.label} · {fmtMoney(selected.total, symbol)}
        </p>
      </div>
      <div className="flex h-24 items-end gap-2 border-b border-line pb-px">
        {months.map((m, i) => (
          <button
            key={m.key}
            onClick={() => setSel(i)}
            aria-label={`${m.label}: ${fmtMoney(m.total, symbol)}`}
            className="group flex h-full flex-1 items-end justify-center"
          >
            <span
              className={`w-full max-w-9 rounded-t transition-all ${
                i === sel ? "bg-accent" : "bg-accent opacity-35 group-hover:opacity-60"
              }`}
              style={{ height: `${Math.max((m.total / max) * 100, m.total > 0 ? 3 : 0)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {months.map((m, i) => (
          <p
            key={m.key}
            className={`flex-1 text-center text-[10px] font-medium ${
              i === sel ? "text-ink" : "text-muted"
            }`}
          >
            {m.label}
          </p>
        ))}
      </div>
    </Card>
  );
}

export default function Budget() {
  const { settings } = useSettings();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const y = view.getFullYear();
  const m = view.getMonth();
  const ym = toDateStr(view).slice(0, 7);
  const trendStart = toDateStr(new Date(y, m - 5, 1));

  const categories = useLiveQuery(
    () => db.categories.orderBy("createdAt").toArray(),
    []
  );
  const bills = useLiveQuery(() => db.bills.orderBy("due").toArray(), []);
  const trendExpenses = useLiveQuery(
    () =>
      db.expenses
        .where("date")
        .between(trendStart, `${ym}-31`, true, true)
        .toArray(),
    [trendStart, ym]
  );

  const monthExpenses = (trendExpenses ?? []).filter((e) =>
    e.date.startsWith(ym)
  );
  const spent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = (categories ?? []).reduce(
    (s, c) => s + (c.budget ?? 0),
    0
  );
  const spentBy = new Map<string, number>();
  monthExpenses.forEach((e) =>
    spentBy.set(e.categoryId, (spentBy.get(e.categoryId) ?? 0) + e.amount)
  );

  const trendMonths = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(y, m - 5 + i, 1);
    const key = toDateStr(d).slice(0, 7);
    return {
      key,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      total: (trendExpenses ?? [])
        .filter((e) => e.date.startsWith(key))
        .reduce((s, e) => s + e.amount, 0),
    };
  });

  const recent = monthExpenses
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const catById = new Map((categories ?? []).map((c) => [c.id, c]));
  const isCurrentMonth = ym === todayStr().slice(0, 7);
  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const expenseDay = (e: Expense) => {
    const [ey, em, ed] = e.date.split("-").map(Number);
    return new Date(ey, em - 1, ed).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
    });
  };

  if (categories === undefined) return null; // loading

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budget"
        subtitle="Where the money goes."
        action={
          !creating &&
          categories.length > 0 && (
            <Button onClick={() => setCreating(true)}>
              <span className="flex items-center gap-1.5">
                <Plus size={16} /> New
              </span>
            </Button>
          )
        }
      />

      {creating && categories.length > 0 && (
        <NewExpenseForm
          categories={categories}
          onDone={() => setCreating(false)}
        />
      )}

      <UpcomingSection bills={bills ?? []} categories={categories} />
      <BillsSection bills={bills ?? []} categories={categories} />

      {categories.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <div className="mb-4 rounded-2xl bg-accent-soft p-4 text-accent">
            <PiggyBank size={30} strokeWidth={1.75} />
          </div>
          <p className="font-medium">Set up your spending categories</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            Expenses are grouped into categories like Groceries and Bills. Start
            with a ready-made set — you can rename budgets or add your own after.
          </p>
          <div className="mt-5">
            <Button onClick={seedStarters}>Add starter categories</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <p className="font-display font-semibold">{monthLabel}</p>
            <div className="flex items-center gap-1">
              {!isCurrentMonth && (
                <button
                  onClick={() =>
                    setView(
                      new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                    )
                  }
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  This month
                </button>
              )}
              <button
                onClick={() => setView(new Date(y, m - 1, 1))}
                aria-label="Previous month"
                className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setView(new Date(y, m + 1, 1))}
                aria-label="Next month"
                className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Summary */}
          <Card>
            <p className="font-display text-3xl font-semibold text-accent">
              {fmtMoney(spent, settings.currency)}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {totalBudget > 0
                ? `of ${fmtMoney(totalBudget, settings.currency)} budgeted this month`
                : "spent this month"}
            </p>
            {totalBudget > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    spent > totalBudget ? "bg-red-500" : "bg-accent"
                  }`}
                  style={{
                    width: `${Math.min((spent / totalBudget) * 100, 100)}%`,
                  }}
                />
              </div>
            )}
          </Card>

          {/* Categories */}
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Categories
              </p>
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
              >
                <Pencil size={12} /> {editing ? "Done" : "Edit"}
              </button>
            </div>

            {editing ? (
              <div className="space-y-2">
                {categories.map((c) => (
                  <CategoryEditRow key={c.id} category={c} />
                ))}
                <AddCategoryForm />
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map((c) => {
                  const catSpent = spentBy.get(c.id) ?? 0;
                  const over = c.budget !== null && catSpent > c.budget;
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-line bg-surface px-3.5 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{c.emoji}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {c.name}
                        </span>
                        <span className="text-sm font-medium">
                          {fmtMoney(catSpent, settings.currency)}
                          {c.budget !== null && (
                            <span
                              className={
                                over
                                  ? "text-red-500 dark:text-red-400"
                                  : "text-muted"
                              }
                            >
                              {" "}
                              / {fmtMoney(c.budget, settings.currency)}
                            </span>
                          )}
                        </span>
                      </div>
                      {c.budget !== null && c.budget > 0 && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full rounded-full transition-all ${
                              over ? "bg-red-500" : "bg-accent"
                            }`}
                            style={{
                              width: `${Math.min((catSpent / c.budget) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <TrendChart key={ym} months={trendMonths} symbol={settings.currency} />

          {/* This month's spending */}
          <div>
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
              Spending · {monthLabel}
            </p>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No spending recorded this month.
              </p>
            ) : (
              <ul className="space-y-2">
                {recent.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
                  >
                    <span className="text-lg">
                      {catById.get(e.categoryId)?.emoji ?? "📦"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {e.note || catById.get(e.categoryId)?.name || "Expense"}
                      </p>
                      <p className="text-xs text-muted">{expenseDay(e)}</p>
                    </div>
                    <span className="text-sm font-medium">
                      {fmtMoney(e.amount, settings.currency)}
                    </span>
                    <button
                      onClick={() => db.expenses.delete(e.id)}
                      aria-label={`Delete ${e.note || "expense"}`}
                      className="p-1 text-muted opacity-60 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
