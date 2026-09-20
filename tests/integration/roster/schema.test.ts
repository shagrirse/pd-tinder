import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../../helpers/db';
import { cycles, members } from '../../../src/lib/server/db/schema';

function seedCycle(db: ReturnType<typeof makeTestDb>, name: string, year: number): number {
	return db.insert(cycles).values({ name, year }).returning({ id: cycles.id }).get().id;
}

describe('members.student_id', () => {
	it('is nullable and accepts a value', () => {
		const db = makeTestDb();
		const cycleId = seedCycle(db, '10th Circle', 2026);

		const inserted = db
			.insert(members)
			.values({
				cycleId,
				role: 'mentor',
				fullName: 'Fixture Mentor',
				email: 'm@example.com',
				industry: 'Finance',
				studentId: '02000001'
			})
			.returning({ studentId: members.studentId })
			.get();

		expect(inserted.studentId).toBe('02000001');

		const noStudentId = db
			.insert(members)
			.values({ cycleId, role: 'mentee', fullName: 'Fixture Mentee', email: 'e@example.com' })
			.returning({ studentId: members.studentId })
			.get();
		expect(noStudentId.studentId).toBeNull();
	});

	it('rejects two members of one cycle claiming the same student id, across roles too', () => {
		const db = makeTestDb();
		const cycleId = seedCycle(db, '10th Circle', 2026);

		db.insert(members)
			.values({
				cycleId,
				role: 'mentor',
				fullName: 'M',
				email: 'm@example.com',
				studentId: '02000001'
			})
			.run();

		expect(() =>
			db
				.insert(members)
				.values({
					cycleId,
					role: 'mentee',
					fullName: 'E',
					email: 'e@example.com',
					studentId: '02000001'
				})
				.run()
		).toThrow(/UNIQUE/i);
	});

	it('allows the same student id in two different cycles', () => {
		const db = makeTestDb();
		const a = seedCycle(db, '10th Circle', 2026);
		const b = seedCycle(db, '11th Circle', 2027);

		db.insert(members)
			.values({
				cycleId: a,
				role: 'mentor',
				fullName: 'M',
				email: 'm@example.com',
				studentId: '02000001'
			})
			.run();
		expect(() =>
			db
				.insert(members)
				.values({
					cycleId: b,
					role: 'mentor',
					fullName: 'M',
					email: 'm@example.com',
					studentId: '02000001'
				})
				.run()
		).not.toThrow();
	});
});
