CREATE TABLE IF NOT EXISTS "admin_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"module" varchar(32) NOT NULL,
	"action" varchar(32) NOT NULL,
	"target_type" varchar(32),
	"target_id" varchar(64),
	"detail_json" jsonb,
	"ip" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" integer,
	"level" integer DEFAULT 1 NOT NULL,
	"l1_rate" numeric(6, 4) DEFAULT '0.30' NOT NULL,
	"l2_rate" numeric(6, 4) DEFAULT '0.20' NOT NULL,
	"l3_rate" numeric(6, 4) DEFAULT '0.10' NOT NULL,
	"total_commission" numeric(20, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(16) DEFAULT 'info' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blindbox_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"blindbox_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"probability" numeric(8, 6) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"initial_stock" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blindbox_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"image_url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rarity" varchar(16) NOT NULL,
	"value" numeric(20, 6) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blindbox_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"blindbox_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"rarity" varchar(16) NOT NULL,
	"cost" numeric(20, 6) NOT NULL,
	"is_pity" boolean DEFAULT false NOT NULL,
	"action" varchar(16) DEFAULT 'kept' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blindboxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"cover_url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_limited" boolean DEFAULT false NOT NULL,
	"limit_count" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_user_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"source_type" varchar(16) DEFAULT 'trade' NOT NULL,
	"source_id" bigint NOT NULL,
	"level" integer NOT NULL,
	"source_amount" numeric(20, 6) NOT NULL,
	"commission_rate" numeric(6, 4) NOT NULL,
	"commission_amount" numeric(20, 6) NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deposits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"nowpay_invoice_id" varchar(64),
	"nowpay_payment_id" varchar(64),
	"order_id" varchar(64) NOT NULL,
	"pay_currency" varchar(24) NOT NULL,
	"pay_amount" numeric(30, 10),
	"price_amount" numeric(20, 6) NOT NULL,
	"actually_paid" numeric(30, 10),
	"outcome_amount" numeric(20, 6),
	"pay_address" text,
	"status" varchar(16) DEFAULT 'waiting' NOT NULL,
	"ipn_raw" jsonb,
	"expire_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	CONSTRAINT "deposits_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_fingerprints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fingerprint_hash" varchar(128) NOT NULL,
	"device_info" jsonb,
	"risk_level" varchar(16) DEFAULT 'normal' NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_code" varchar(4) NOT NULL,
	"country_name" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geo_blocks_country_code_unique" UNIQUE("country_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ip_blacklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_or_cidr" varchar(64) NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ip_blacklist_ip_or_cidr_unique" UNIQUE("ip_or_cidr")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"real_name" varchar(128),
	"id_type" varchar(32),
	"id_number" varchar(128),
	"id_front_url" text,
	"id_back_url" text,
	"selfie_url" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"account" varchar(128),
	"ip" varchar(64),
	"device" text,
	"geo_location" varchar(128),
	"success" boolean NOT NULL,
	"error_message" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"user_id" integer NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"webpush" boolean DEFAULT true NOT NULL,
	"telegram" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_preferences_user_id_event_type_pk" PRIMARY KEY("user_id","event_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"channel" varchar(16) DEFAULT 'in_app' NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"ref_type" varchar(32),
	"ref_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_config" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb,
	"description" text DEFAULT '' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_type" varchar(8) NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"priority" varchar(8) DEFAULT 'normal' NOT NULL,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_risk_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"duration" integer NOT NULL,
	"payout_rate" numeric(6, 4) DEFAULT '0.85' NOT NULL,
	"price_offset_bps" integer DEFAULT 0 NOT NULL,
	"trend_bias" numeric(4, 3) DEFAULT '0' NOT NULL,
	"delay_ms" integer DEFAULT 0 NOT NULL,
	"max_single_bet" numeric(20, 6) DEFAULT '10000' NOT NULL,
	"max_total_exposure" numeric(20, 6) DEFAULT '1000000' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"duration" integer NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8),
	"payout_rate" numeric(6, 4) NOT NULL,
	"profit" numeric(20, 6),
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"result" varchar(8),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settle_at" timestamp NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_agreements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agreement_type" varchar(32) NOT NULL,
	"version" varchar(16) NOT NULL,
	"ip" varchar(64),
	"agreed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_inventory" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"source_record_id" bigint NOT NULL,
	"status" varchar(16) DEFAULT 'owned' NOT NULL,
	"exchanged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_pity_counter" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"blindbox_id" integer NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"refresh_token_hash" varchar(128) NOT NULL,
	"device_info" text,
	"ip" varchar(64),
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_telegram" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"telegram_chat_id" varchar(64) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_telegram_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_totp" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"secret_encrypted" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_totp_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(32) NOT NULL,
	"email" varchar(128) NOT NULL,
	"phone" varchar(32),
	"password_hash" varchar(128) NOT NULL,
	"fund_password_hash" varchar(128),
	"avatar" text,
	"balance" numeric(20, 6) DEFAULT '0' NOT NULL,
	"frozen_balance" numeric(20, 6) DEFAULT '0' NOT NULL,
	"invite_code" varchar(16) NOT NULL,
	"parent_id" integer,
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"language" varchar(8) DEFAULT 'zh-CN' NOT NULL,
	"kyc_level" integer DEFAULT 0 NOT NULL,
	"kyc_status" varchar(16) DEFAULT 'none' NOT NULL,
	"last_login_at" timestamp,
	"last_login_ip" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"balance_before" numeric(20, 6) NOT NULL,
	"balance_after" numeric(20, 6) NOT NULL,
	"ref_type" varchar(32),
	"ref_id" varchar(64),
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"currency" varchar(24) NOT NULL,
	"network" varchar(24) NOT NULL,
	"to_address" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"fee" numeric(20, 6) DEFAULT '0' NOT NULL,
	"nowpay_payout_id" varchar(64),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"reviewed_by" integer,
	"review_note" text,
	"tx_hash" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_logs_admin_idx" ON "admin_logs" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_logs_module_idx" ON "admin_logs" USING btree ("module","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_active_idx" ON "announcements" USING btree ("is_active","priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blindbox_items_box_idx" ON "blindbox_items" USING btree ("blindbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blindbox_records_user_idx" ON "blindbox_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blindbox_records_rarity_idx" ON "blindbox_records" USING btree ("rarity","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blindboxes_active_idx" ON "blindboxes" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commissions_agent_idx" ON "commissions" USING btree ("agent_user_id","settled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commissions_from_idx" ON "commissions" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deposits_user_idx" ON "deposits" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deposits_invoice_idx" ON "deposits" USING btree ("nowpay_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fp_user_idx" ON "device_fingerprints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fp_hash_idx" ON "device_fingerprints" USING btree ("fingerprint_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_user_idx" ON "kyc_applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_logs_user_idx" ON "login_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_user_idx" ON "tickets" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_status_idx" ON "tickets" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "risk_config_symbol_duration_idx" ON "trade_risk_config" USING btree ("symbol","duration");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_user_idx" ON "trades" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_symbol_idx" ON "trades" USING btree ("symbol","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_settle_idx" ON "trades" USING btree ("settle_at","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_user_idx" ON "user_inventory" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pity_user_box_idx" ON "user_pity_counter" USING btree ("user_id","blindbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "user_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_parent_idx" ON "users" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_logs_user_idx" ON "wallet_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_logs_type_idx" ON "wallet_logs" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_user_idx" ON "withdrawals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" USING btree ("status","created_at");