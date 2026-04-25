import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Space, Statistic, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { request } from '../lib/api';

interface Anomaly {
  id: number;
  userId: number;
  username: string | null;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  score: number;
  reason: string;
  detail: any;
  resolved: boolean;
  createdAt: string;
}

interface MonitorSummary {
  totalAnomalies24h: number;
  unresolved: number;
  critical: number;
  byCategory: Array<{ category: string; count: number }>;
  recent: Anomaly[];
}

const SEVERITY_COLOR: Record<string, string> = {
  info: 'blue',
  warning: 'gold',
  critical: 'red',
};

export default function AiMonitor() {
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [items, setItems] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        request<MonitorSummary>({ url: '/admin/ai-monitor/summary' }),
        request<{ items: Anomaly[] }>({ url: '/admin/ai-monitor/anomalies', params: { resolved: 'false' } }),
      ]);
      setSummary(s);
      setItems(l.items ?? []);
    } catch (e: any) {
      message.warning(e?.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function resolve(id: number) {
    await request({ url: '/admin/ai-monitor/resolve', method: 'POST', data: { id } });
    message.success('已标记处理');
    await load();
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2 style={{ margin: 0 }}>AI 异常监控</h2>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </Space>

      <Alert
        type="info"
        showIcon
        message="后台 worker 实时监控大额下注、对冲、盲盒高频开箱、异地登录、可疑提现等行为，AI 评估后入库；管理员可在此查看并标记处理。"
        style={{ marginBottom: 16 }}
      />

      <Space direction="horizontal" style={{ marginBottom: 16, flexWrap: 'wrap' }} size="middle">
        <Card size="small" style={{ minWidth: 180 }}>
          <Statistic title="24h 异常事件" value={summary?.totalAnomalies24h ?? 0} />
        </Card>
        <Card size="small" style={{ minWidth: 180 }}>
          <Statistic title="未处理" value={summary?.unresolved ?? 0} valueStyle={{ color: '#faad14' }} />
        </Card>
        <Card size="small" style={{ minWidth: 180 }}>
          <Statistic title="严重 (critical)" value={summary?.critical ?? 0} valueStyle={{ color: '#cf1322' }} />
        </Card>
        {(summary?.byCategory ?? []).map((c) => (
          <Card key={c.category} size="small" style={{ minWidth: 140 }}>
            <Statistic title={c.category} value={c.count} />
          </Card>
        ))}
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          {
            title: '严重度',
            dataIndex: 'severity',
            width: 100,
            render: (s: string) => <Tag color={SEVERITY_COLOR[s]}>{s}</Tag>,
          },
          { title: '类别', dataIndex: 'category', width: 140 },
          { title: '用户', dataIndex: 'username', width: 120 },
          {
            title: '风险分',
            dataIndex: 'score',
            width: 100,
            render: (v: number) => (
              <Badge
                count={v}
                style={{
                  backgroundColor: v >= 80 ? '#cf1322' : v >= 50 ? '#faad14' : '#52c41a',
                }}
              />
            ),
          },
          { title: '原因', dataIndex: 'reason' },
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (v: string) => new Date(v).toLocaleString(),
          },
          {
            title: '操作',
            width: 120,
            render: (_: any, r: Anomaly) =>
              r.resolved ? (
                <Tag color="green">已处理</Tag>
              ) : (
                <Button size="small" onClick={() => void resolve(r.id)}>
                  标记已处理
                </Button>
              ),
          },
        ]}
        expandable={{
          expandedRowRender: (r) => (
            <pre style={{ maxHeight: 240, overflow: 'auto', fontSize: 11 }}>
              {JSON.stringify(r.detail, null, 2)}
            </pre>
          ),
        }}
      />
    </div>
  );
}
