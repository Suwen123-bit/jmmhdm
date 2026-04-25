import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Space, Input } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', page, pageSize, action],
    queryFn: () => request<any>({ url: '/admin/audit-logs', params: { page, pageSize, action } }),
  });

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="按动作筛选 (例如 user.update)" allowClear onSearch={(v) => { setAction(v); setPage(1); }} style={{ width: 320 }} />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        scroll={{ x: 1200 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '管理员', dataIndex: 'adminUsername', width: 140 },
          { title: '动作', dataIndex: 'action', width: 200, render: (v) => <Tag color="blue">{v}</Tag> },
          { title: '资源类型', dataIndex: 'resourceType', width: 120 },
          { title: '资源 ID', dataIndex: 'resourceId', width: 120 },
          { title: 'IP', dataIndex: 'ip', width: 130 },
          {
            title: '变更',
            key: 'diff',
            render: (_, row: any) => (
              <pre style={{ margin: 0, fontSize: 11, maxHeight: 100, overflow: 'auto', maxWidth: 600 }}>
                {row.before ? `BEFORE: ${JSON.stringify(row.before).slice(0, 200)}\n` : ''}
                {row.after ? `AFTER:  ${JSON.stringify(row.after).slice(0, 200)}` : ''}
              </pre>
            ),
          },
          { title: '时间', dataIndex: 'createdAt', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
        ]}
      />
    </>
  );
}
