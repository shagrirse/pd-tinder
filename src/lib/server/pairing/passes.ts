/**
 * The reconciliation passes, as pure functions over plain arrays.
 *
 * No database access lives here on purpose: the 9th Circle replay in
 * `tests/integration/pairing/replay.test.ts` feeds these functions a fixture
 * directly, and reconciliation has to be reproducible from data alone.
 *
 * Each pass takes a `locked` set of member ids and MUTATES it, adding both
 * members of every pair it returns. That mutation is how "locked members are
 * removed from consideration by later passes" is enforced, and it is why the
 * passes must be called in order.
 */

export type Role = 'mentor' | 'mentee';

export type MemberRef = { id: number; role: Role };

export type PreferenceRef = { memberId: number; rank: number; choiceMemberId: number };

export type PairMethod = 'mutual_first' | 'mutual_any' | 'one_sided' | 'manual';

export type ProposedPair = {
	mentorId: number;
	menteeId: number;
	method: PairMethod;
	/** The rank the mentor gave the mentee, or null if the mentor did not name them. */
	mentorRank: number | null;
	/** The rank the mentee gave the mentor, or null if the mentee did not name them. */
	menteeRank: number | null;
};

type Index = {
	roleOf: Map<number, Role>;
	/** `${memberId}:${choiceMemberId}` -> rank */
	rankOf: Map<string, number>;
};

export function buildIndex(members: MemberRef[], prefs: PreferenceRef[]): Index {
	const roleOf = new Map(members.map((m) => [m.id, m.role]));
	const rankOf = new Map<string, number>();
	for (const p of prefs) rankOf.set(`${p.memberId}:${p.choiceMemberId}`, p.rank);
	return { roleOf, rankOf };
}

export function rankGiven(index: Index, from: number, to: number): number | undefined {
	return index.rankOf.get(`${from}:${to}`);
}

/** Put a mentor/mentee pair in canonical order, or null if the two are not opposite roles. */
function orient(index: Index, a: number, b: number): { mentorId: number; menteeId: number } | null {
	const roleA = index.roleOf.get(a);
	const roleB = index.roleOf.get(b);
	if (roleA === 'mentor' && roleB === 'mentee') return { mentorId: a, menteeId: b };
	if (roleA === 'mentee' && roleB === 'mentor') return { mentorId: b, menteeId: a };
	return null;
}

/**
 * Sort key for every pass: lower combined rank first, then member id ascending.
 * A null rank counts as 0 so a one-sided rank-1 candidate sorts above a
 * one-sided rank-2 one.
 */
export function byCombinedRankThenId(a: ProposedPair, b: ProposedPair): number {
	const rankA = (a.mentorRank ?? 0) + (a.menteeRank ?? 0);
	const rankB = (b.mentorRank ?? 0) + (b.menteeRank ?? 0);
	if (rankA !== rankB) return rankA - rankB;
	if (a.mentorId !== b.mentorId) return a.mentorId - b.mentorId;
	return a.menteeId - b.menteeId;
}

/** Walk sorted candidates, taking each one whose members are both still free. */
export function lockInOrder(candidates: ProposedPair[], locked: Set<number>): ProposedPair[] {
	const taken: ProposedPair[] = [];
	for (const candidate of candidates) {
		if (locked.has(candidate.mentorId) || locked.has(candidate.menteeId)) continue;
		locked.add(candidate.mentorId);
		locked.add(candidate.menteeId);
		taken.push(candidate);
	}
	return taken;
}

/** Pass one: mentor's rank-1 is the mentee and the mentee's rank-1 is the mentor. */
export function mutualFirstPass(
	members: MemberRef[],
	prefs: PreferenceRef[],
	locked: Set<number>
): ProposedPair[] {
	const index = buildIndex(members, prefs);
	const candidates: ProposedPair[] = [];

	for (const p of prefs) {
		if (p.rank !== 1) continue;
		if (rankGiven(index, p.choiceMemberId, p.memberId) !== 1) continue;
		const oriented = orient(index, p.memberId, p.choiceMemberId);
		if (!oriented) continue;
		// Emit from the mentor's side only, so a reciprocated pair appears once.
		if (oriented.mentorId !== p.memberId) continue;
		candidates.push({ ...oriented, method: 'mutual_first', mentorRank: 1, menteeRank: 1 });
	}

	candidates.sort(byCombinedRankThenId);
	return lockInOrder(candidates, locked);
}
