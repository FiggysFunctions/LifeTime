import db from "./db";
import { deviceId } from "./reminders";
import { getHouseholdRealmId } from "./household";

// Household activity notifications: when you assign a task, add a calendar
// event, or add to a shared list, the OTHER household members get a push
// (never yourself — /api/notify skips the sending device). Fire-and-forget:
// failures are silent and never block the action itself.

export function myName(): string {
  try {
    const s = JSON.parse(localStorage.getItem("lifetime-settings") || "{}");
    if (s.name && s.name !== "friend") return s.name;
  } catch {
    // fall through to the account id
  }
  const uid = (db.cloud.currentUserId || "").toLowerCase();
  return uid && uid !== "unauthorized" ? uid.split("@")[0] : "Someone";
}

// Everyone in the household except me (owner + accepted/invited members).
export async function getOtherMembers(): Promise<string[]> {
  try {
    const rid = await getHouseholdRealmId();
    if (!rid) return [];
    const me = (db.cloud.currentUserId || "").toLowerCase();
    const realm = await db.realms.get(rid);
    const members = await db.members.where("realmId").equals(rid).toArray();
    const ids = new Set<string>();
    const add = (raw?: string) => {
      const id = raw?.toLowerCase();
      if (id && id !== me && id !== "unauthorized") ids.add(id);
    };
    add(realm?.owner);
    members.forEach((m) => add(m.userId ?? m.email));
    return [...ids];
  } catch {
    return [];
  }
}

export async function notifyHousehold(
  title: string,
  body: string,
  url: string,
  onlyUsers?: string[]
) {
  try {
    const others = await getOtherMembers();
    const to = onlyUsers
      ? others.filter((u) => onlyUsers.includes(u))
      : others;
    if (to.length === 0) return;
    await fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromDeviceId: deviceId(), toUsers: to, title, body, url }),
    });
  } catch {
    // offline or server unavailable — the data still synced, just no ping
  }
}

export function notifyEventAdded(title: string, when: string) {
  notifyHousehold(`${myName()} added to the calendar`, `${title} — ${when}`, "/#/calendar");
}

// List additions are batched per list: rapid-fire adds while shopping-list
// building become one "added N items" push after things go quiet.
const pendingListAdds = new Map<
  string,
  { name: string; count: number; timer: ReturnType<typeof setTimeout> }
>();

export function noteListAddition(listId: string, listName: string, count = 1) {
  const prev = pendingListAdds.get(listId);
  if (prev) clearTimeout(prev.timer);
  const total = (prev?.count ?? 0) + count;
  const timer = setTimeout(() => {
    pendingListAdds.delete(listId);
    notifyHousehold(
      `${myName()} updated ${listName}`,
      `${total} new ${total === 1 ? "item" : "items"}`,
      `/#/lists/${listId}`
    );
  }, 12_000);
  pendingListAdds.set(listId, { name: listName, count: total, timer });
}
