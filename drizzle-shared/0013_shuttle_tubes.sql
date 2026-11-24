CREATE TABLE `chiakeo_shuttle_tubes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`tube_price` integer DEFAULT 0 NOT NULL,
	`shuttle_price` integer DEFAULT 0 NOT NULL,
	`initial_quantity` integer DEFAULT 12 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `chiakeo_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chiakeo_shuttle_tubes_owner_id_idx` ON `chiakeo_shuttle_tubes` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `chiakeo_shuttle_entries` ADD `tube_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `chiakeo_shuttle_entries` ADD `expense_id` text REFERENCES chiakeo_expenses(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `chiakeo_shuttle_entries_tube_id_idx` ON `chiakeo_shuttle_entries` (`tube_id`);--> statement-breakpoint
CREATE INDEX `chiakeo_shuttle_entries_expense_id_idx` ON `chiakeo_shuttle_entries` (`expense_id`);--> statement-breakpoint
INSERT INTO `chiakeo_shuttle_tubes` (`id`, `owner_user_id`, `name`, `tube_price`, `shuttle_price`, `initial_quantity`, `created_at`) SELECT 'tube_' || `owner_user_id`, `owner_user_id`, 'Ống cầu 1', 0, 0, 12, MIN(`created_at`) FROM `chiakeo_shuttle_entries` GROUP BY `owner_user_id`;--> statement-breakpoint
UPDATE `chiakeo_shuttle_entries` SET `tube_id` = 'tube_' || `owner_user_id` WHERE `tube_id` = '';
