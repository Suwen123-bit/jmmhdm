import { useState } from 'react';
import { Button, Card, DatePicker, Form, Select, Space, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { getAccessToken } from '../lib/api';

type ReportType = 'deposits' | 'withdrawals' | 'trades' | 'commissions' | 'users' | 'audit_logs';

const REPORTS: { value: ReportType; label: string; description: string }[] = [
  { value: 'deposits', label: '充值流水', description: '用户充值记录（含 NOWPayments 状态）' },
  { value: 'withdrawals', label: '提现流水', description: '所有提现订单含审核备注' },
  { value: 'trades', label: '交易订单', description: '合约期权交易订单（含盈亏）' },
  { value: 'commissions', label: '代理佣金', description: '三级代理佣金分发明细' },
  { value: 'users', label: '用户名册', description: '基础用户档案（脱敏密码）' },
  { value: 'audit_logs', label: '管理员操作日志', description: '后台审计日志' },
];

export default function Reports() {
  const [form] = Form.useForm();
  const [downloading, setDownloading] = useState(false);

  async function handleExport(values: { type: ReportType; range: [Dayjs, Dayjs] }) {
    if (!values.range || values.range.length !== 2) {
      message.warning('请选择起止时间');
      return;
    }
    setDownloading(true);
    try {
      const [start, end] = values.range;
      const params = new URLSearchParams({
        type: values.type,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      const token = getAccessToken();
      const resp = await fetch(`/api/admin/reports/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${values.type}_${start.format('YYYYMMDD')}_${end.format('YYYYMMDD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (e: any) {
      message.error(e?.message ?? '导出失败');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <h2>数据报表导出</h2>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleExport} initialValues={{ type: 'deposits', range: [dayjs().subtract(7, 'day'), dayjs()] }}>
          <Form.Item label="报表类型" name="type" rules={[{ required: true }]}>
            <Select
              style={{ width: 200 }}
              options={REPORTS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Form.Item>
          <Form.Item label="时间范围" name="range" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<DownloadOutlined />} loading={downloading}>
              导出 CSV
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Space direction="vertical" style={{ width: '100%' }}>
        {REPORTS.map((r) => (
          <Card key={r.value} size="small" title={r.label}>
            <p style={{ color: '#aaa', margin: 0 }}>{r.description}</p>
          </Card>
        ))}
      </Space>
    </div>
  );
}
