"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import type { GroupDetail, GroupSummary } from "@/lib/types";

const SELECTED_KEY = "splitsmart.selectedGroupId";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

const card = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const input =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";
const button =
  "rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export default function SplitSmartApp() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshGroups = useCallback(async () => {
    const list = await api<GroupSummary[]>("/api/groups");
    setGroups(list);
    return list;
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    setDetail(await api<GroupDetail>(`/api/groups/${encodeURIComponent(id)}`));
  }, []);

  // Initial load: restore the last selected group if it still exists.
  useEffect(() => {
    refreshGroups()
      .then((list) => {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(SELECTED_KEY);
        } catch {}
        const initial = list.find((g) => g.id === saved)?.id ?? list[0]?.id ?? null;
        setSelectedId(initial);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [refreshGroups]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    try {
      localStorage.setItem(SELECTED_KEY, selectedId);
    } catch {}
    refreshDetail(selectedId).catch((e: Error) => setLoadError(e.message));
  }, [selectedId, refreshDetail]);

  const afterChange = async () => {
    await refreshGroups();
    if (selectedId) await refreshDetail(selectedId);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-2xl font-bold text-emerald-800">SplitSmart</h1>
          <p className="text-sm text-slate-600">Track shared expenses and see who owes whom.</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <GroupPanel
            groups={groups}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreated={async (g) => {
              await refreshGroups();
              setSelectedId(g.id);
            }}
          />
        </aside>

        <section className="space-y-6">
          <ErrorText message={loadError} />
          {!detail ? (
            <div className={`${card} text-sm text-slate-600`}>
              {groups.length === 0 ? "Create your first group to get started." : "Select a group."}
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold">{detail.name}</h2>
              <div className="grid gap-6 lg:grid-cols-2">
                <MembersPanel detail={detail} onChanged={afterChange} />
                <BalancesPanel detail={detail} />
              </div>
              <ExpenseForm key={detail.id} detail={detail} onChanged={afterChange} />
              <ExpenseHistory detail={detail} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function GroupPanel({
  groups,
  selectedId,
  onSelect,
  onCreated,
}: {
  groups: GroupSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (g: GroupSummary) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const g = await api<GroupSummary>("/api/groups", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await onCreated(g);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <h2 className="mb-3 font-semibold">Groups</h2>
      <form onSubmit={submit} className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="group-name">
          New group name
        </label>
        <input
          id="group-name"
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ski Trip"
        />
        <button className={`${button} w-full`} disabled={busy}>
          Create group
        </button>
        <ErrorText message={error} />
      </form>

      <ul className="mt-4 space-y-1">
        {groups.length === 0 && <li className="text-sm text-slate-500">No groups yet.</li>}
        {groups.map((g) => (
          <li key={g.id}>
            <button
              onClick={() => onSelect(g.id)}
              aria-current={g.id === selectedId}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                g.id === selectedId ? "bg-emerald-100 font-semibold text-emerald-900" : "hover:bg-slate-100"
              }`}
            >
              {g.name}
              <span className="block text-xs font-normal text-slate-500">
                {g.memberCount} members · {g.expenseCount} expenses
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MembersPanel({ detail, onChanged }: { detail: GroupDetail; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/groups/${detail.id}/members`, { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <h3 className="mb-3 font-semibold">Members</h3>
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="member-name">
          Member name
        </label>
        <input
          id="member-name"
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Member name"
        />
        <button className={button} disabled={busy}>
          Add
        </button>
      </form>
      <ErrorText message={error} />
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {detail.members.length === 0 && <li className="py-2 text-slate-500">No members yet.</li>}
        {detail.members.map((m) => (
          <li key={m.id} className="py-2">
            {m.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BalancesPanel({ detail }: { detail: GroupDetail }) {
  return (
    <div className={card}>
      <h3 className="mb-3 font-semibold">Balances</h3>
      {detail.balances.length === 0 ? (
        <p className="text-sm text-slate-500">Add members to see balances.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 text-sm">
            {detail.balances.map((b) => (
              <li key={b.member.id} className="flex items-center justify-between py-2">
                <span>{b.member.name}</span>
                <span
                  className={`font-mono font-semibold ${
                    b.balanceCents > 0 ? "text-emerald-700" : b.balanceCents < 0 ? "text-red-700" : "text-slate-500"
                  }`}
                  data-testid={`balance-${b.member.name}`}
                >
                  {formatCents(b.balanceCents, { signed: true })}
                  <span className="ml-2 font-sans text-xs font-normal text-slate-500">
                    {b.balanceCents > 0 ? "gets back" : b.balanceCents < 0 ? "owes" : "settled"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
            Total of all balances: {formatCents(detail.balanceTotalCents)}
          </p>
        </>
      )}
    </div>
  );
}

function ExpenseForm({ detail, onChanged }: { detail: GroupDetail; onChanged: () => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>(() => detail.members.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Newly added members are selected as participants by default.
  const memberKey = detail.members.map((m) => m.id).join(",");
  const [seenMembers, setSeenMembers] = useState(memberKey);
  if (memberKey !== seenMembers) {
    const previous = new Set(seenMembers.split(","));
    setParticipantIds((ids) => [...ids, ...detail.members.filter((m) => !previous.has(m.id)).map((m) => m.id)]);
    setSeenMembers(memberKey);
  }

  const toggle = (id: string) =>
    setParticipantIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api(`/api/groups/${detail.id}/expenses`, {
        method: "POST",
        body: JSON.stringify({ description, amount, payerId, participantIds }),
      });
      setSuccess(`Recorded "${description.trim()}".`);
      setDescription("");
      setAmount("");
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (detail.members.length === 0) {
    return (
      <div className={`${card} text-sm text-slate-600`}>
        <h3 className="mb-1 font-semibold text-slate-900">Record an expense</h3>
        Add at least one member before recording expenses.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={card} noValidate>
      <h3 className="mb-3 font-semibold">Record an expense</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="exp-desc">
            Description
          </label>
          <input
            id="exp-desc"
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dinner"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="exp-amount">
            Amount ($)
          </label>
          <input
            id="exp-amount"
            className={input}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="exp-payer">
            Paid by
          </label>
          <select id="exp-payer" className={input} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            <option value="">Select payer…</option>
            {detail.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Split equally between</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {detail.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={participantIds.includes(m.id)}
                  onChange={() => toggle(m.id)}
                  className="h-4 w-4 accent-emerald-700"
                />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className={button} disabled={busy}>
          Record expense
        </button>
        {success && <span className="text-sm text-emerald-700">{success}</span>}
      </div>
      <ErrorText message={error} />
    </form>
  );
}

function ExpenseHistory({ detail }: { detail: GroupDetail }) {
  return (
    <div className={card}>
      <h3 className="mb-3 font-semibold">Expense history</h3>
      {detail.expenses.length === 0 ? (
        <p className="text-sm text-slate-500">No expenses recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Paid by</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2">Split</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.expenses.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4">{e.description}</td>
                  <td className="py-2 pr-4">{e.payer.name}</td>
                  <td className="py-2 pr-4 text-right font-mono">{formatCents(e.amountCents)}</td>
                  <td className="py-2 text-slate-600">
                    {e.participants.map((p) => `${p.member.name} ${formatCents(p.shareCents)}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
