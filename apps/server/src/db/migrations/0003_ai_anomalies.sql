-- 0003_ai_anomalies.sql
-- AI 风控异常事件表

CREATE TABLE IF NOT EXISTS "ai_anomalies" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "category" varchar(32) NOT NULL,
  "severity" varchar(16) DEFAULT 'info' NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "reason" text NOT NULL,
  "detail" jsonb,
  "resolved" boolean DEFAULT false NOT NULL,
  "resolved_by" integer,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_anomalies_user_idx" ON "ai_anomalies" ("user_id","created_at");
CREATE INDEX IF NOT EXISTS "ai_anomalies_category_idx" ON "ai_anomalies" ("category","severity","created_at");
CREATE INDEX IF NOT EXISTS "ai_anomalies_unresolved_idx" ON "ai_anomalies" ("resolved","created_at");
