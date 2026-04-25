-- 0002_commission_unique.sql
-- 给 commissions 表增加防重唯一索引，避免分发器重试导致重复发放佣金

CREATE UNIQUE INDEX IF NOT EXISTS commissions_source_uniq_idx
  ON commissions (source_type, source_id, level, agent_user_id);
