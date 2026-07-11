import db from "./db";

// One shared realm per household. Calendar events, meals and meal plans
// live in it; lists opt in one by one; tasks, budget, fitness and habits
// always stay personal to each account.

export const HOUSEHOLD_NAME = "Household";

export async function getHouseholdRealmId(): Promise<string | undefined> {
  try {
    const realm = await db.realms
      .filter((r) => r.name === HOUSEHOLD_NAME)
      .first();
    return realm?.realmId;
  } catch {
    return undefined;
  }
}

// Creates the household realm if needed, emails an invite, and moves the
// shared modules into it. Idempotent: inviting a second person reuses the
// existing realm.
export async function createHousehold(inviteEmail: string): Promise<string> {
  let realmId = await getHouseholdRealmId();
  if (!realmId) {
    realmId = (await db.realms.add({
      name: HOUSEHOLD_NAME,
      represents: "your household",
    })) as string;
  }
  const email = inviteEmail.trim().toLowerCase();
  if (email) {
    await db.members.add({
      realmId,
      email,
      invite: true,
      permissions: { manage: "*" },
    });
  }
  await moveSharedModulesToHousehold(realmId);
  return realmId;
}

// Idempotent — also used as a "merge my stuff in" action for someone who
// joined via the email invite and had their own data already.
export async function moveSharedModulesToHousehold(realmId: string) {
  await db.transaction("rw", [db.events, db.meals, db.mealPlans], async () => {
    await db.events.toCollection().modify({ realmId });
    await db.meals.toCollection().modify({ realmId });
    await db.mealPlans.toCollection().modify({ realmId });
  });
}

// Sharing a list moves it (and its items) into the household realm;
// unsharing claims it back to the current user's private realm.
export async function setListShared(
  listId: string,
  share: boolean
): Promise<boolean> {
  const realmId = share
    ? await getHouseholdRealmId()
    : db.cloud.currentUserId;
  if (!realmId) return false;
  await db.transaction("rw", [db.lists, db.items], async () => {
    await db.lists.update(listId, { realmId });
    await db.items.where("listId").equals(listId).modify({ realmId });
  });
  return true;
}
