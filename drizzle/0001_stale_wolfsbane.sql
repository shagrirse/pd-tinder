CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`role` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`industry` text,
	`applicant_id` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `members_roster` ON `members` (`cycle_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_cycle_email` ON `members` (`cycle_id`,`email`);--> statement-breakpoint
CREATE TABLE `pairings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`mentor_member_id` integer NOT NULL,
	`mentee_member_id` integer NOT NULL,
	`method` text NOT NULL,
	`override_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentor_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairings_mentor` ON `pairings` (`mentor_member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pairings_mentee` ON `pairings` (`mentee_member_id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`choice_member_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`choice_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_member_rank` ON `preferences` (`member_id`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_member_choice` ON `preferences` (`member_id`,`choice_member_id`);