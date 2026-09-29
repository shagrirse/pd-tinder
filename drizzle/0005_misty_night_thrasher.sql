CREATE TABLE `baseline_pairings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`baseline_id` integer NOT NULL,
	`mentor_member_id` integer NOT NULL,
	`mentee_member_id` integer NOT NULL,
	`method` text NOT NULL,
	`mentor_rank` integer,
	`mentee_rank` integer,
	FOREIGN KEY (`baseline_id`) REFERENCES `pairing_baselines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentor_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_pairings_mentor` ON `baseline_pairings` (`baseline_id`,`mentor_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_pairings_mentee` ON `baseline_pairings` (`baseline_id`,`mentee_member_id`);--> statement-breakpoint
CREATE TABLE `baseline_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`baseline_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`choice_member_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`baseline_id`) REFERENCES `pairing_baselines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`choice_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_preferences_member_rank` ON `baseline_preferences` (`baseline_id`,`member_id`,`rank`);--> statement-breakpoint
CREATE TABLE `pairing_baselines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` integer NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pairing_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`baseline_id` integer NOT NULL,
	`mentor_member_id` integer NOT NULL,
	`mentee_member_id` integer NOT NULL,
	`reason` text NOT NULL,
	`displaced_mentee_id` integer,
	`displaced_mentor_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` integer NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baseline_id`) REFERENCES `pairing_baselines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentor_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`displaced_mentee_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`displaced_mentor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
