CREATE TABLE `entitlements` (
	`id` integer PRIMARY KEY NOT NULL,
	`logs_used` integer DEFAULT 0 NOT NULL,
	`pro` integer DEFAULT false NOT NULL,
	`license_receipt` text
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`ptp_inches` real NOT NULL,
	`length_inches` real NOT NULL,
	`condition` text NOT NULL,
	`individual_cost` real DEFAULT 0 NOT NULL,
	`target_sell_price` real NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`sold_price` real,
	`sold_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`local_uri` text NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`total_bale_cost` real DEFAULT 0,
	`location` text,
	`created_at` integer NOT NULL
);
