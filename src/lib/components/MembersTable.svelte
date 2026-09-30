<script lang="ts">
	import {
		columnFilteringFeature,
		createFilteredRowModel,
		createSortedRowModel,
		createTable,
		globalFilteringFeature,
		rowSortingFeature,
		sortFns,
		tableFeatures,
		type ColumnDef,
		type SortingState
	} from '@tanstack/svelte-table';
	import {
		industriesOf,
		matchesPairingFilter,
		matchesSearch,
		METHOD_LABEL,
		PAIRING_FILTERS,
		pairingFilterCounts,
		type MemberRow,
		type PairingFilter
	} from '$lib/members/rows';

	let { rows, onopen }: { rows: MemberRow[]; onopen: (memberId: number) => void } = $props();

	// Adapters from TanStack's filter-function shape to the plain predicates in
	// $lib/members/rows, which hold the actual rules and are unit-tested there.
	type RowLike = { original: MemberRow; getValue: (columnId: string) => unknown };
	const filterFns = {
		memberSearch: (row: RowLike, _columnId: string, query: string) =>
			matchesSearch(row.original, query),
		equalsValue: (row: RowLike, columnId: string, value: string) =>
			row.getValue(columnId) === value,
		pairingState: (row: RowLike, _columnId: string, value: PairingFilter) =>
			matchesPairingFilter(row.original, value)
	};

	const features = tableFeatures({
		rowSortingFeature,
		columnFilteringFeature,
		globalFilteringFeature,
		sortedRowModel: createSortedRowModel(),
		filteredRowModel: createFilteredRowModel(),
		sortFns,
		filterFns
	});

	const columns: Array<ColumnDef<typeof features, MemberRow>> = [
		{ id: 'name', accessorFn: (m) => m.fullName, header: 'Name' },
		{ id: 'role', accessorFn: (m) => m.role, header: 'Role', filterFn: 'equalsValue' },
		{
			id: 'industry',
			accessorFn: (m) => m.industry ?? '',
			header: 'Industry',
			filterFn: 'equalsValue'
		},
		{ id: 'studentId', accessorFn: (m) => m.studentId ?? '', header: 'Student ID' },
		{ id: 'submitted', accessorFn: (m) => (m.submitted ? 1 : 0), header: 'Submitted' },
		{
			id: 'pairedWith',
			accessorFn: (m) => m.pair?.name ?? '',
			header: 'Paired with',
			filterFn: 'pairingState'
		},
		{
			id: 'method',
			accessorFn: (m) => (m.pair ? METHOD_LABEL[m.pair.method] : ''),
			header: 'Method'
		}
	];

	let search = $state('');
	let role = $state<'all' | 'mentor' | 'mentee'>('all');
	let industry = $state('all');
	let pairing = $state<PairingFilter>('all');
	// Industry then name, the same grouping the preference form uses.
	let sorting = $state<SortingState>([
		{ id: 'industry', desc: false },
		{ id: 'name', desc: false }
	]);

	let columnFilters = $derived([
		...(role === 'all' ? [] : [{ id: 'role', value: role }]),
		...(industry === 'all' ? [] : [{ id: 'industry', value: industry }]),
		...(pairing === 'all' ? [] : [{ id: 'pairedWith', value: pairing }])
	]);

	const table = createTable({
		features,
		columns,
		get data() {
			return rows;
		},
		getRowId: (m) => String(m.id),
		globalFilterFn: 'memberSearch',
		enableSortingRemoval: false,
		state: {
			get sorting() {
				return sorting;
			},
			get globalFilter() {
				return search;
			},
			get columnFilters() {
				return columnFilters;
			}
		},
		onSortingChange: (updater) => {
			sorting = updater instanceof Function ? updater(sorting) : updater;
		}
	});

	let industries = $derived(industriesOf(rows));
	let counts = $derived(pairingFilterCounts(rows));

	/** aria-sort belongs on the primary sort column only. */
	function ariaSort(columnId: string): 'ascending' | 'descending' | 'none' {
		const primary = sorting[0];
		if (!primary || primary.id !== columnId) return 'none';
		return primary.desc ? 'descending' : 'ascending';
	}

	function reset() {
		search = '';
		role = 'all';
		industry = 'all';
		pairing = 'all';
	}
</script>

<div class="controls">
	<label class="field search">
		<span class="field-label">Search</span>
		<input type="search" bind:value={search} placeholder="Name, email or student ID" />
	</label>
	<label class="field">
		<span class="field-label">Role</span>
		<select bind:value={role}>
			<option value="all">All</option>
			<option value="mentor">Mentors</option>
			<option value="mentee">Mentees</option>
		</select>
	</label>
	<label class="field">
		<span class="field-label">Industry</span>
		<select bind:value={industry}>
			<option value="all">All</option>
			{#each industries as name (name)}
				<option value={name}>{name}</option>
			{/each}
		</select>
	</label>
	<label class="field">
		<span class="field-label">Pairing</span>
		<select bind:value={pairing}>
			{#each PAIRING_FILTERS as option (option.value)}
				<option value={option.value}>{option.label} ({counts[option.value]})</option>
			{/each}
		</select>
	</label>
</div>

<div class="summary">
	<span aria-live="polite">Showing {table.getRowModel().rows.length} of {rows.length}</span>
	<button type="button" class="reset" onclick={reset}>Reset filters</button>
</div>

{#snippet cellContent(columnId: string, m: MemberRow)}
	{#if columnId === 'name'}
		<button type="button" class="member-link" onclick={() => onopen(m.id)}>{m.fullName}</button>
	{:else if columnId === 'role'}
		{m.role === 'mentor' ? 'Mentor' : 'Mentee'}
	{:else if columnId === 'industry'}
		{m.industry ?? ''}
	{:else if columnId === 'studentId'}
		<span class="mono">{m.studentId ?? ''}</span>
	{:else if columnId === 'submitted'}
		{#if m.submitted}<span role="img" aria-label="Submitted">✓</span>{:else}<span
				role="img"
				aria-label="Not submitted">–</span
			>{/if}
	{:else if columnId === 'pairedWith'}
		{#if m.pair}
			<button type="button" class="member-link" onclick={() => onopen(m.pair!.memberId)}>
				{m.pair.name}
			</button>
		{/if}
	{:else if columnId === 'method'}
		{#if m.pair}<span class="chip">{METHOD_LABEL[m.pair.method]}</span>{/if}
	{/if}
{/snippet}

<!-- A scrollable region must be focusable so keyboard users can scroll it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Members table">
	<table>
		<thead>
			{#each table.getHeaderGroups() as group (group.id)}
				<tr>
					{#each group.headers as header (header.id)}
						<th class="col-{header.column.id}" aria-sort={ariaSort(header.column.id)}>
							<button type="button" class="sort" onclick={header.column.getToggleSortingHandler()}>
								{header.column.columnDef.header}
								<span class="arrow" aria-hidden="true">
									{ariaSort(header.column.id) === 'ascending'
										? '▲'
										: ariaSort(header.column.id) === 'descending'
											? '▼'
											: ''}
								</span>
							</button>
						</th>
					{/each}
				</tr>
			{/each}
		</thead>
		<tbody>
			{#each table.getRowModel().rows as row (row.id)}
				<tr>
					{#each row.getAllCells() as cell (cell.id)}
						<td class="col-{cell.column.id}">{@render cellContent(cell.column.id, row.original)}</td
						>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if table.getRowModel().rows.length === 0}
		<p class="empty" role="status">No members match these filters.</p>
	{/if}
</div>

<style>
	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.controls .search {
		grid-column: 1 / -1;
	}
	.controls input,
	.controls select {
		background: var(--bg-raised-2);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: inherit;
		padding: 0.6rem 0.8rem;
		min-height: 44px;
	}
	.summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		margin-bottom: 0.5rem;
	}
	.reset {
		background: none;
		border: none;
		color: var(--text-dim);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		padding: 0.4rem 0;
		cursor: pointer;
	}
	.reset:hover {
		color: var(--flame);
	}
	/* A fixed height, so the page doesn't grow with the roster or jump when a
	   filter changes the row count. The header row sticks while rows scroll. */
	.scroll {
		overflow: auto;
		height: min(70dvh, 40rem);
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--line);
		font-size: 0.88rem;
		vertical-align: middle;
		white-space: nowrap;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		font-weight: 600;
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--bg-raised);
		/* Collapsed borders scroll away with the rows, so the rule is drawn here. */
		box-shadow: inset 0 -1px var(--line);
	}
	/* The name stays in view while the rest of the row scrolls sideways on a phone. */
	.col-name {
		position: sticky;
		left: 0;
		background: var(--bg-raised);
		z-index: 1;
	}
	/* The corner cell sticks both ways, above the header row and the name column. */
	th.col-name {
		z-index: 2;
	}
	.sort {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		padding: 0.3rem 0;
		cursor: pointer;
	}
	.sort:hover {
		color: var(--text);
	}
	.arrow {
		display: inline-block;
		min-width: 0.8em;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 0.82rem;
	}
	.member-link {
		background: none;
		border: none;
		padding: 0.4rem 0;
		display: inline-block;
		/* Long names wrap, so the pinned name column never fills a phone screen. */
		max-width: min(12rem, 40vw);
		white-space: normal;
		text-align: left;
		color: var(--text);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.member-link:hover {
		color: var(--flame);
	}
	.empty {
		color: var(--text-dim);
		padding: 1rem 0.7rem;
		margin: 0;
	}
</style>
