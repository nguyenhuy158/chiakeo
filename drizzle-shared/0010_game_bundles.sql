CREATE TABLE `chiakeo_bundle_games` (
	`bundle_id` text NOT NULL,
	`game_id` text NOT NULL,
	FOREIGN KEY (`bundle_id`) REFERENCES `chiakeo_bundles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `chiakeo_games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chiakeo_bundle_games_bundle_game_idx` ON `chiakeo_bundle_games` (`bundle_id`,`game_id`);--> statement-breakpoint
CREATE TABLE `chiakeo_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `chiakeo_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chiakeo_bundles_owner_user_id_idx` ON `chiakeo_bundles` (`owner_user_id`);