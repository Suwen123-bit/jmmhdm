import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

export default function Deposits() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'deposits', page, pageSize, status],
    queryFn: () => request<any>({ url: '/admin/deposits', params: { page, pageSize, status } }),
  });

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 160 }}
          options={[
            { value: 'pending', label: '待确认' },
            { value: 'confirmed', label: '已入账' },
            { value: 'failed', label: '失败' },
          ]}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        scroll={{ x: 1300 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户', dataIndex: 'username', width: 130 },
          { title: '币种', dataIndex: 'currency', width: 80, render: (v) => v?.toUpperCase() },
          { title: '网络', dataIndex: 'network', width: 90 },
          { title: '金额', dataIndex: 'amount', width: 120, render: (v) => Number(v).toFixed(6) },
          { title: '入账金额(USDT)', dataIndex: 'creditedAmount', width: 130, render: (v) => v ? Number(v).toFixed(2) : '-' },
          { title: '链上 Hash', dataIndex: 'txHash', width: 220, ellipsis: true },
          { title: '充值地址', dataIndex: 'address', width: 200, ellipsis: true },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v) => <Tag color={v === 'confirmed' ? 'green' : v === 'pending' ? 'orange' : 'red'}>{v}</Tag>,
          },
          { title: '时间', dataIndex: 'createdAt', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
        ]}
      />
    </>
  );
}
