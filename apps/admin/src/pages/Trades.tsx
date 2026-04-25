import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Select, Space, InputNumber } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

export default function Trades() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string | undefined>();
  const [userId, setUserId] = useState<number | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'trades', page, pageSize, status, userId],
    queryFn: () => request<any>({ url: '/admin/trades', params: { page, pageSize, status, userId } }),
    refetchInterval: 5000,
  });

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          options={[{ value: 'open', label: '持仓中' }, { value: 'settled', label: '已结算' }, { value: 'canceled', label: '已取消' }]}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
        <InputNumber placeholder="用户 ID" onChange={(v) => { setUserId(v == null ? undefined : Number(v)); setPage(1); }} />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        scroll={{ x: 1400 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户', dataIndex: 'username', width: 120 },
          { title: '币种', dataIndex: 'symbol', width: 100, render: (v) => v?.toUpperCase() },
          {
            title: '方向',
            dataIndex: 'direction',
            width: 80,
            render: (v) => <Tag color={v === 'up' ? 'green' : 'red'}>{v === 'up' ? '看涨' : '看跌'}</Tag>,
          },
          { title: '金额', dataIndex: 'amount', width: 100, render: (v) => Number(v).toFixed(2) },
          { title: '时长', dataIndex: 'duration', width: 80, render: (v) => `${v}s` },
          { title: '入场价', dataIndex: 'entryPrice', width: 110, render: (v) => v ? Number(v).toFixed(2) : '-' },
          { title: '结算价', dataIndex: 'exitPrice', width: 110, render: (v) => v ? Number(v).toFixed(2) : '-' },
          { title: '收益率', dataIndex: 'payoutRate', width: 80, render: (v) => `${(Number(v) * 100).toFixed(0)}%` },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v) => <Tag color={v === 'open' ? 'blue' : v === 'settled' ? 'green' : 'default'}>{v}</Tag>,
          },
          {
            title: '结果',
            dataIndex: 'result',
            width: 80,
            render: (v) => v ? <Tag color={v === 'win' ? 'green' : v === 'lose' ? 'red' : 'default'}>{v}</Tag> : '-',
          },
          {
            title: '盈亏',
            dataIndex: 'profit',
            width: 110,
            render: (v) => <span style={{ color: Number(v) > 0 ? '#52c41a' : Number(v) < 0 ? '#ff4d4f' : undefined }}>{Number(v).toFixed(2)}</span>,
          },
          { title: '下单时间', dataIndex: 'createdAt', width: 160, render: (v) => dayjs(v).format('MM-DD HH:mm:ss') },
          { title: '结算时间', dataIndex: 'settledAt', width: 160, render: (v) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-' },
        ]}
      />
    </>
  );
}
